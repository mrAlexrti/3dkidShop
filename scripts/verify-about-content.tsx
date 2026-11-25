// Real page/action/editor sources, isolated fixtures only. No .env, PrismaClient,
// live storage, database, provider, notifications or deployment operations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { sourceModule } from "./source-module";
import { translations, type Locale } from "../src/lib/i18n";
import * as content from "../src/lib/site-content";
import * as seo from "../src/lib/seo";
import * as validation from "../src/lib/admin-form-validation";
import { RetiredMediaError } from "../src/lib/media-lifecycle-policy";
import * as utils from "../src/lib/utils";

const network = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("LIVE_NETWORK_FORBIDDEN"); };
let passed = 0;
const pass = (message: string) => console.log(`PASS ${++passed}: ${message}`);
const formData = (values: Record<string, string>) => {
  const form = new FormData(); for (const [key, value] of Object.entries(values)) form.set(key, value); return form;
};
type Row = { key: string; value: string };

async function verify() {
  const directory = resolve(".next/cache/about-content-qa"); mkdirSync(directory, { recursive: true });
  const baselineFile = resolve(directory, "i18n-baseline.ts");
  writeFileSync(baselineFile, execFileSync("git", ["show", "e7f0750ebd08efb68603d0a67bb1f5e3d0cd74ab:src/lib/i18n.ts"], { encoding: "utf8" }));
  const previous = sourceModule<typeof import("../src/lib/i18n")>(baselineFile, {});
  for (const locale of ["ua", "en"] as const) {
    assert.deepEqual(translations[locale].pages.about, previous.translations[locale].pages.about, "Existing brand copy must remain exactly unchanged");
    assert.deepEqual(content.resolveAboutCopy({}, locale), {
      slogan: translations[locale].pages.about.slogan, body: translations[locale].pages.about.paragraphs.join("\n\n"),
      metaTitle: translations[locale].pages.about.metaTitle, metaDescription: translations[locale].pages.about.metaDescription,
    });
  }
  pass("UA/EN fallback slogan, every paragraph and SEO copy exactly match the approved baseline");

  let cookie: string | undefined;
  const localeAccess = sourceModule<typeof import("../src/lib/i18n-server")>("src/lib/i18n-server.ts", {
    "next/headers": { cookies: async () => ({ get: () => cookie === undefined ? undefined : { value: cookie } }) },
    "@/lib/i18n": { translations },
  });
  let rows: Row[] = [];
  let reads = 0;
  const page = sourceModule<typeof import("../src/app/(shop)/about/page")>("src/app/(shop)/about/page.tsx", {
    react: React, "react/jsx-runtime": jsxRuntime, "@/lib/i18n-server": localeAccess, "@/lib/site-content": content,
    "@/lib/site-settings": { getStorefrontContent: async () => {
      reads++;
      return Object.fromEntries(rows.filter(row => content.STOREFRONT_CONTENT_KEYS.includes(row.key)).map(row => [row.key, row.value]));
    } },
    "@/lib/seo": seo,
  });
  assert.equal(page.dynamic, "force-dynamic");
  for (const locale of [undefined, "ua", "en", "unknown"] as const) {
    cookie = locale; const expected = translations[locale === "en" ? "en" : "ua"].pages.about;
    const metadata = await page.generateMetadata(); const element = await page.default();
    assert.equal(metadata.title, expected.metaTitle); assert.equal(metadata.description, expected.metaDescription);
    const paragraphs = React.Children.toArray(element.props.children).flatMap((child) => Array.isArray(child) ? child : [child]).filter((child) => React.isValidElement(child) && child.type === "p");
    assert.deepEqual(paragraphs.map((paragraph) => (paragraph as React.ReactElement<{ children: string }>).props.children), [...expected.paragraphs]);
  }
  pass("actual About page/metadata use bounded database reads, exact fallbacks and UA-default cookie localization");

  rows = [
    { key: "about_slogan_ua", value: "Власний слоган <b>текст</b>" }, { key: "about_slogan_en", value: "Our edited slogan" },
    { key: "about_body_ua", value: "Перший абзац\r\nНовий рядок\r\n\r\nДругий абзац\n<script>alert(1)</script>" },
    { key: "about_body_en", value: "First English paragraph\nSecond line\n\nNext English paragraph" },
    { key: "about_meta_title_ua", value: "Власна SEO-назва" }, { key: "about_meta_title_en", value: "Custom SEO title" },
    { key: "about_meta_description_ua", value: "Власний SEO-опис" }, { key: "about_meta_description_en", value: "Custom SEO description" },
    { key: "private_fixture", value: "MUST_NOT_RENDER" },
  ];
  for (const locale of ["ua", "en"] as const) {
    cookie = locale;
    const resolved = content.resolveAboutCopy(Object.fromEntries(rows.map((row) => [row.key, row.value])), locale);
    const metadata = await page.generateMetadata(); const html = renderToStaticMarkup(await page.default());
    assert.equal(metadata.title, resolved.metaTitle);
    assert.equal(metadata.description, resolved.metaDescription);
    assert.equal(metadata.openGraph?.title, resolved.metaTitle + " | 3D kid");
    assert.equal(metadata.openGraph?.description, resolved.metaDescription);
    assert.equal(metadata.alternates?.canonical, "https://www.3dkid.shop/about");
    assert.equal((html.match(/<p /g) ?? []).length, 2); assert.ok(html.includes("whitespace-pre-wrap"));
    assert.ok(!html.includes("MUST_NOT_RENDER") && !html.includes("<script>") && !html.includes("<b>"));
    assert.ok(html.includes(locale === "ua" ? "Перший абзац\nНовий рядок" : "First English paragraph\nSecond line"));
    assert.ok(!html.includes(locale === "ua" ? "First English paragraph" : "Перший абзац"));
    if (locale === "ua") assert.ok(html.includes("&lt;script&gt;") && html.includes("&lt;b&gt;"));
  }
  assert.ok(reads >= 12);
  pass("UA/EN overrides remain independent; paragraphs/CRLF/single line breaks render as escaped text; metadata and Open Graph use the selected locale");

  const partial = { about_slogan_ua: "Лише слоган" };
  const mixed = content.resolveAboutCopy(partial, "ua");
  assert.equal(mixed.slogan, partial.about_slogan_ua); assert.equal(mixed.body, translations.ua.pages.about.paragraphs.join("\n\n"));
  assert.equal(content.resolveAboutCopy({ about_body_en: "   " }, "en").body, translations.en.pages.about.paragraphs.join("\n\n"));
  for (const locale of ["ua", "en"] as const) for (const [field, limit] of Object.entries(content.ABOUT_CONTENT_LIMITS)) {
    const key = `about_${field}_${locale}`;
    for (const invalid of ["", " \n ", "x".repeat(limit + 1)]) {
      const result = content.storefrontContentSchema.safeParse({ [key]: invalid }); assert.equal(result.success, false);
      if (!result.success) assert.deepEqual(validation.validationResult(result.error), { error: "validation", fieldErrors: { [key]: invalid.length > limit ? "tooLong" : "required" } });
    }
    assert.equal(content.storefrontContentSchema.safeParse({ [key]: "x".repeat(limit) }).success, true);
  }
  const authoredBody = "\nПерший рядок\n\n\nДругий абзац\n";
  assert.equal(content.storefrontContentSchema.parse({ about_body_ua: authoredBody }).about_body_ua, authoredBody);
  pass("per-field fallbacks; eight required nonblank fields with bounded lengths; authored multiline body stored without trimming");

  let state = new Map<string, string>([["hero_image_1", "https://res.cloudinary.com/fixture/saved.webp"], ["hero_title_ua", "Збережений заголовок"], ["social_instagram", "https://example.invalid/social"], ["site_font_theme", "warm"], ["private_fixture", "unchanged"]]);
  let authorized = true; let failWrite = false; let scheduleCount = 0;
  let lock = false; const revalidated: unknown[][] = [];
  const warnings: string[] = []; const originalWarn = console.warn;
  const actions = sourceModule<typeof import("../src/lib/actions/categories")>("src/lib/actions/categories.ts", {
    "@prisma/client": { Prisma: {} }, zod: { z }, "@/lib/site-content": content, "@/lib/admin-form-validation": validation,
    "@/lib/actions/require-admin": { requireAdmin: async () => { if (!authorized) throw new Error("UNAUTHORIZED_FIXTURE"); } },
    "@/lib/fonts": { isFontThemeId: (value: string) => value === "warm" }, "@/lib/site-settings": { SITE_FONT_KEY: "site_font_theme" },
    "next/cache": { revalidatePath: (...args: unknown[]) => revalidated.push(args) }, "@/lib/media-lifecycle-policy": { RetiredMediaError },
    "@/lib/media-cleanup-after": { scheduleProductMediaCleanup: () => { scheduleCount++; } },
    "@/lib/media-lifecycle": { MEDIA_TRANSACTION_OPTIONS: { isolationLevel: "ReadCommitted" }, lockMediaWrites: async () => { lock = true; },
      assertMediaAttachable: async () => { assert.ok(lock); }, enqueueSupersededMedia: async () => { assert.ok(lock); } },
    "@/lib/prisma": { prisma: { $transaction: async (callback: (tx: unknown) => Promise<void>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "ReadCommitted" }); lock = false;
      const draft = new Map(state);
      await callback({ siteContent: { findMany: async ({ where }: { where: { key: { in: string[] } } }) => {
        assert.ok(lock); return [...draft].filter(([key]) => where.key.in.includes(key)).map(([key, value]) => ({ key, value }));
      }, upsert: async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        assert.ok(lock); draft.set(where.key, update.value); if (failWrite) throw new Error("PRIVATE_DATABASE_EXCEPTION_FIXTURE");
      } } });
      state = draft;
    } } },
  });
  const unrelated = [...state];
  const aboutValues = Object.fromEntries(rows.filter((row) => content.ABOUT_CONTENT_KEYS.includes(row.key)).map((row) => [row.key, row.value]));
  await actions.updateSiteContent(formData({ ...aboutValues, __product_media_cleanup_queue__: "forged", private_fixture: "forged" }));
  for (const [key, value] of unrelated) assert.equal(state.get(key), value);
  for (const [key, value] of Object.entries(aboutValues)) assert.equal(state.get(key), value);
  assert.equal(state.size, unrelated.length + 8); assert.equal(scheduleCount, 1);
  assert.deepEqual(revalidated, [["/", "layout"], ["/admin/content"], ["/about"]]);
  cookie = "ua"; rows = [...state].map(([key, value]) => ({ key, value }));
  assert.equal((await page.generateMetadata()).title, aboutValues.about_meta_title_ua);
  pass("About-only Save writes exactly its allowlisted keys, preserves hero/social/font/private values, revalidates About/content/layout and is visible on the next page read");

  const beforeFailure = [...state]; revalidated.length = 0;
  const invalidForm = formData({ about_body_en: " ", hero_image_1: "https://fixture.public.blob.vercel-storage.com/3dkid/product-media/image/fixture.webp" });
  const submitted = [...invalidForm.entries()];
  assert.deepEqual(await actions.updateSiteContent(invalidForm), { error: "validation", fieldErrors: { about_body_en: "required" } });
  assert.deepEqual([...invalidForm.entries()], submitted); assert.deepEqual([...state], beforeFailure); assert.deepEqual(revalidated, []);
  failWrite = true; console.warn = (...values) => { warnings.push(values.join(" ")); };
  try {
    assert.deepEqual(await actions.updateSiteContent(formData({ ...aboutValues, about_slogan_en: "Failed save" })), { error: "saveFailed" });
  } finally { console.warn = originalWarn; failWrite = false; }
  assert.deepEqual([...state], beforeFailure); assert.deepEqual(revalidated, []); assert.equal(scheduleCount, 1);
  assert.deepEqual(warnings, ["admin_category_or_content_save_failed"]);
  authorized = false; await assert.rejects(actions.updateSiteContent(formData(aboutValues)), /UNAUTHORIZED_FIXTURE/); authorized = true;
  pass("invalid input, transaction/network-equivalent failure and unauthorized Save preserve all content and schedule no cleanup or invalidation; errors are sanitized");

  await actions.updateSiteContent(formData({ ...aboutValues, hero_image_1: "https://res.cloudinary.com/fixture/new.webp" }));
  assert.equal(state.get("hero_image_1"), "https://res.cloudinary.com/fixture/new.webp");
  assert.equal(state.get("hero_title_ua"), unrelated.find(([key]) => key === "hero_title_ua")![1]);
  pass("combined About/hero Save changes only submitted values and keeps the shared transactional media protocol");

  const beforeIllustrations = [...state];
  const auth = "https://fixture.public.blob.vercel-storage.com/auth.webp";
  const welcome = "https://fixture.public.blob.vercel-storage.com/welcome.webp";
  revalidated.length = 0;
  await actions.updateSiteContent(formData({ account_auth_image: auth, account_welcome_image: welcome }));
  assert.deepEqual(revalidated, [["/", "layout"], ["/admin/content"], ["/about"]]);
  assert.equal(state.get("account_auth_image"), auth);
  assert.equal(state.get("account_welcome_image"), welcome);
  await actions.updateSiteContent(formData({ account_auth_image: "" }));
  assert.equal(state.get("account_auth_image"), "");
  assert.equal(state.get("account_welcome_image"), welcome);
  assert.deepEqual((await actions.updateSiteContent(formData({ account_welcome_image: "https://user:password@example.test/image.webp" })))?.fieldErrors,
    { account_welcome_image: "invalid" });
  assert.equal(state.get("account_welcome_image"), welcome);
  for (const [key, value] of beforeIllustrations) assert.equal(state.get(key), value);
  pass("account illustration Save and reset preserve unrelated settings and invalidate the storefront layout");

  for (const locale of ["ua", "en"] as const) {
    const fields = sourceModule<typeof import("../src/components/admin/about-content-fields")>("src/components/admin/about-content-fields.tsx", {
      "react/jsx-runtime": jsxRuntime, "@/lib/site-content": content, "@/store/lang-store": { useLangStore: () => ({ t: translations[locale] }) },
      "@/components/admin/admin-form": { AdminFieldError: () => null },
    });
    const html = renderToStaticMarkup(fields.AboutContentFields({ content: {} }));
    assert.equal((html.match(/ required=""/g) ?? []).length, 8);
    assert.ok(html.includes('name="about_body_ua"') && html.includes('name="about_meta_description_en"'));
    assert.ok(html.includes('lang="uk"') && html.includes('lang="en"') && html.includes('rows="10"'));
    assert.ok(html.includes(translations[locale].admin.content.aboutBodyHelp));
    assert.ok(html.includes(translations[locale].pages.about.metaTitle));
    assert.equal((html.match(/<label for="about_/g) ?? []).length, 8);
  }
  pass("actual Admin fields prefill both original languages, declare all limits/required values, and expose associated labels and localized multiline help");

  const AboutProbe = () => null;
  const adminPage = sourceModule<typeof import("../src/app/admin/content/page")>("src/app/admin/content/page.tsx", {
    "react/jsx-runtime": jsxRuntime, "@/lib/site-content": content, "@/lib/i18n": { translations }, "@/lib/i18n-server": localeAccess,
    "@/lib/prisma": { prisma: { siteContent: { findMany: async () => [...state, ["__product_media_retired__:fixture", "PRIVATE_LEDGER_NOT_FOR_CLIENT"]].map(([key, value]) => ({ key, value })) } } },
    "@/lib/actions/categories": { updateSiteContent: actions.updateSiteContent },
    "@/components/admin/admin-form": { AdminForm: "form", AdminFieldError: "field-error", AdminSaveButton: "save-button" },
    "@/components/admin/about-content-fields": { AboutContentFields: AboutProbe }, "@/components/admin/media-url-field": { MediaUrlField: "media-field" },
    "@/components/admin/seo-content-fields": { SeoContentFields: () => null },
    "@/lib/fonts": { FONT_THEMES: { warm: { label: "Warm" } }, resolveFontTheme: () => "warm" }, "@/lib/site-settings": { SITE_FONT_KEY: "site_font_theme" },
    "@/lib/hero-assets": { heroAssets: [1, 2, 3].map((index) => ({ key: `hero_image_${index}`, src: "/placeholder.svg" })) },
    "@/lib/actions/notification-settings": { updateNotificationSettings: async () => { throw new Error("FORBIDDEN_IN_ABOUT_QA"); } },
    "@/lib/notifications/settings": { getNotificationSettings: async () => ({ telegram: {}, email: {} }) }, "@/lib/notifications/events": { CONFIGURABLE_EVENTS: [] },
  });
  function elements(value: unknown): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(value)) return value.flatMap(elements);
    if (!React.isValidElement(value)) return [];
    const element = value as React.ReactElement<Record<string, unknown>>;
    return [element, ...elements(element.props.children)];
  }
  const adminElements = elements(await adminPage.default());
  const aboutEditor = adminElements.find((element) => element.type === AboutProbe)!;
  assert.deepEqual(aboutEditor.props.content, aboutValues, "Client editor must receive only the eight About keys");
  const mediaFields = adminElements.filter((element) => element.type === "media-field");
  const heroFields = mediaFields.filter((field) => typeof field.props.name === "string" && field.props.name.startsWith("hero_image_"));
  assert.equal(heroFields.length, 3); assert.ok(heroFields.every((field) => field.props.uploadEnabled));
  assert.equal(heroFields[0].props.defaultValue, state.get("hero_image_1"));
  for (const [key, fallback] of Object.entries(content.ACCOUNT_ILLUSTRATIONS)) {
    const field = mediaFields.find((field) => field.props.name === key)!;
    assert.equal(field.props.fallback, fallback);
    assert.equal(field.props.defaultValue, state.get(key));
    assert.equal(field.props.uploadEnabled, true);
    assert.ok(field.props.resetLabel);
  }
  pass("actual Site Content page passes only public About keys to the client editor, preserves all three hero upload fields and never serializes private ledger rows");

  for (const selected of ["ua", "en"] as const) {
    let switched: Locale | undefined; let refreshes = 0;
    const switcher = sourceModule<typeof import("../src/components/layout/lang-switcher")>("src/components/layout/lang-switcher.tsx", {
      "react/jsx-runtime": jsxRuntime, "@/lib/utils": utils, "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
      "@/store/lang-store": { useLangStore: () => ({ locale: selected, t: translations[selected], setLocale: (value: Locale) => { switched = value; cookie = value; } }) },
    });
    const originalDocument = globalThis.document;
    globalThis.document = { documentElement: { lang: "" } } as unknown as Document;
    try {
      const element = switcher.LangSwitcher({});
      const buttons = (element.props.children as React.ReactElement<{ onClick: () => void }>[]);
      const next = selected === "ua" ? "en" : "ua"; buttons[next === "ua" ? 0 : 1].props.onClick();
      assert.equal(switched, next); assert.equal(refreshes, 1); assert.equal(globalThis.document.documentElement.lang, next === "en" ? "en" : "uk");
      assert.equal((await page.generateMetadata()).title, aboutValues[`about_meta_title_${next}`]);
    } finally { globalThis.document = originalDocument; }
  }
  pass("actual UA/EN switcher refreshes server content and metadata using the selected language");
  console.log(`PASS About content: ${passed} isolated groups; no live database, storage or services.`);
}

verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = network; });
