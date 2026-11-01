// Runs entirely in memory: no server, credentials, network, or database imports.
import assert from "node:assert/strict";
import { createLangStore } from "../src/store/lang-store";
import { translations } from "../src/lib/i18n";
import { resolveHeroCopy, safeContentUrl, storefrontContentSchema } from "../src/lib/site-content";

function leafKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null ? leafKeys(child, path) : [path];
  }).sort();
}

async function verify() {
  assert.deepEqual(Object.keys(translations).sort(), ["en", "ua"]);
  assert.deepEqual(leafKeys(translations.ua), leafKeys(translations.en));
  assert.equal(resolveHeroCopy({}, "ua").title, "Маленькі радощі для великої дитини в кожному з нас");
  assert.equal(resolveHeroCopy({}, "en").title, "Little joys for the big kid in each of us");
  const copy = { hero_title_ua: "Власний заголовок", hero_subtitle_ua: "Підзаголовок" };
  assert.equal(resolveHeroCopy(copy, "en").title, translations.en.home.hero.title);
  assert.equal(resolveHeroCopy(copy, "en").subtitle, "");
  assert.equal(resolveHeroCopy(copy, "ua").title, copy.hero_title_ua);
  assert.equal(resolveHeroCopy({ hero_title_en: "   ", hero_subtitle_en: "" }, "en").title, translations.en.home.hero.title);
  assert.equal(safeContentUrl("javascript:alert(1)"), undefined);
  assert.equal(safeContentUrl("https://example.com/image.webp"), "https://example.com/image.webp");
  assert.equal(storefrontContentSchema.safeParse({ hero_image_1: "bad" }).success, false);
  assert.equal(storefrontContentSchema.safeParse({ social_youtube: "#" }).success, false);
  assert.deepEqual(storefrontContentSchema.parse({ hero_image_1: "", social_tiktok: "" }), { hero_image_1: "", social_tiktok: "" });

  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browserDocument = { cookie: "" };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "document", { configurable: true, value: browserDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

  try {
    storage.setItem("stikr-lang", JSON.stringify({ version: 0, state: { locale: "ua", t: { nav: { catalog: "STALE" } } } }));
    const english = createLangStore("en");
    assert.equal(english.getInitialState().locale, "en");
    assert.equal(english.getInitialState().t, translations.en);
    await english.persist.rehydrate();
    assert.equal(english.getState().locale, "en");
    assert.equal(english.getState().t, translations.en);
    assert.deepEqual(JSON.parse(storage.getItem("stikr-lang")!), { version: 1, state: { locale: "en" } });

    // Even current-version persisted data cannot override the server cookie or dictionary.
    storage.setItem("stikr-lang", JSON.stringify({ version: 1, state: { locale: "ru", t: { nav: { catalog: "STALE" } } } }));
    const ukrainian = createLangStore("ua");
    await ukrainian.persist.rehydrate();
    assert.equal(ukrainian.getState().locale, "ua");
    assert.equal(ukrainian.getState().t, translations.ua);
    ukrainian.getState().setLocale("en");
    assert.match(browserDocument.cookie, /^locale=en; path=\//);
    assert.deepEqual(JSON.parse(storage.getItem("stikr-lang")!), { version: 1, state: { locale: "en" } });
    ukrainian.getState().setLocale("ua");
    assert.equal(ukrainian.getState().t, translations.ua);
    assert.equal(english.getState().locale, "en");
    console.log("PASS: UA/EN key parity, cookie-led SSR state, stale storage migration, current dictionary derivation, locale-only persistence, cookie synchronization, and store isolation.");
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

void verify().catch((error) => { console.error(error); process.exitCode = 1; });
