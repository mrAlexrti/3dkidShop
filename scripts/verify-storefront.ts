// Runs entirely in memory: no server, credentials, network, or database imports.
import assert from "node:assert/strict";
import { createLangStore } from "../src/store/lang-store";
import { translations } from "../src/lib/i18n";

function leafKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null ? leafKeys(child, path) : [path];
  }).sort();
}

async function verify() {
  assert.deepEqual(Object.keys(translations).sort(), ["en", "ua"]);
  assert.deepEqual(leafKeys(translations.ua), leafKeys(translations.en));

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
