// Read-only validation of a running production build. No orders or admin changes are submitted.
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { translations } from "../src/lib/i18n";
import { isLiqPayConfigured } from "../src/lib/payments/liqpay";
import { resolveHeroCopy, safeContentUrl } from "../src/lib/site-content";
import { isTestModeEnabled } from "../src/lib/server-env";
import { heroAssets } from "../src/lib/hero-assets";

loadEnvConfig(process.cwd());
const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3011";
assert.equal(new URL(base).hostname, "127.0.0.1", "Only the local validation server is allowed.");
const db = new PrismaClient();
const visible = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const decode = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&quot;", '"');
async function get(path: string, cookie: string) {
  const response = await fetch(`${base}${path}`, { headers: { cookie }, redirect: "manual" });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return decode(visible(await response.text()));
}

async function verify() {
  const [categories, products, rows] = await Promise.all([
    db.category.findMany({ where: { parentId: null }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    db.product.findMany({ where: { isActive: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 12, select: { id: true, slug: true } }),
    db.siteContent.findMany(),
  ]);
  const content = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  const defaultHome = await get("/", "");
  assert.ok(defaultHome.includes('<html lang="uk"'));
  for (const locale of ["ua", "en"] as const) {
    const t = translations[locale];
    const cookie = `locale=${locale}`;
    const home = await get("/", cookie);
    assert.ok(home.includes(`<html lang="${locale === "ua" ? "uk" : "en"}"`));
    assert.ok(home.includes(`<h1 id="hero-title">${resolveHeroCopy(content, locale).title}</h1>`));
    const header = home.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] || "";
    assert.ok(header.includes("sf-home-controls"));
    assert.ok(!header.includes("sf-brand") && !header.includes("sf-header-link"));
    assert.ok(!home.includes("sf-hero-logo") && !home.includes("home-newest-title"));
    assert.equal((home.match(/<figure /g) || []).length, 3);
    assert.equal((home.match(/class="sf-product-card"/g) || []).length, products.length);
    assert.equal((home.match(/class="sf-benefit"/g) || []).length, 3);
    assert.equal((home.match(/id="home-catalog-title"/g) || []).length, 1);
    const strip = home.match(/<nav class="sf-shell sf-categories sf-categories--home"[^>]*>[\s\S]*?<\/nav>/)?.[0] || "";
    assert.ok(strip.length > 0);
    assert.ok(!strip.includes('href="/catalog"'));
    const footer = home.match(/<footer class="sf-shell sf-footer">[\s\S]*?<\/footer>/)?.[0] || "";
    assert.ok(footer.includes('href="/about"') && footer.includes('href="/delivery-payment"'));
    assert.ok(!footer.includes('href="#"') && !footer.includes('href="/account"') && !footer.includes('href="/checkout"'));
    assert.ok(footer.includes('class="sf-footer-account"'));
    assert.equal((footer.match(/(?:aria-label="(?:Instagram|Telegram|TikTok|YouTube))/g) || []).length, 4);
    for (const category of categories) {
      const link = `/catalog?category=${encodeURIComponent(category.slug)}`;
      assert.ok(strip.includes(link) && footer.includes(link));
      assert.ok(strip.includes(locale === "ua" ? category.name : category.nameEn));
    }
    for (const product of products) assert.ok(home.includes(`/product/${product.slug}`));
    const about = await get("/about", cookie);
    assert.ok(about.includes(`<title>${t.pages.about.metaTitle} | 3D Kid</title>`));
    assert.ok(about.includes(`<h1>${t.pages.about.title}</h1>`));
    for (const paragraph of t.pages.about.paragraphs) assert.ok(about.includes(paragraph));
    const delivery = await get("/delivery-payment", cookie);
    assert.ok(delivery.includes(`<title>${t.pages.deliveryPayment.title} | 3D Kid</title>`));
    assert.ok(delivery.includes(t.pages.deliveryPayment.cost));
    assert.equal(delivery.includes(t.pages.deliveryPayment.card), isLiqPayConfigured());
    assert.doesNotMatch(delivery, /WayForPay|Monobank|Returns|Повернення/);
    const catalog = await get("/catalog", cookie);
    assert.ok(catalog.includes("sf-header") && catalog.includes(`<h1 class="font-display text-4xl text-ink md:text-5xl">${t.catalog.title}</h1>`));
    assert.ok((await get("/cart", cookie)).includes(t.cart.empty));
    if (products[0]) assert.ok((await get(`/product/${products[0].slug}`, cookie)).includes('id="main-content"'));
    console.log(`PASS ${locale}: home structure, real products/categories, footer, localized About/Delivery metadata and copy, catalog/product/cart routes.`);
  }
  const admin = await fetch(`${base}/admin/content`, { redirect: "manual" });
  assert.equal(admin.status, 307);
  assert.ok(admin.headers.get("location")?.includes("/login"));
  if (isTestModeEnabled()) {
    // Use only the repository's already-enabled development login; never alter auth configuration.
    const jar = new Map<string, string>();
    const remember = (response: Response) => response.headers.getSetCookie().forEach((cookie) => {
      const pair = cookie.split(";")[0];
      jar.set(pair.slice(0, pair.indexOf("=")), pair);
    });
    const cookies = () => [...jar.values()].join("; ");
    const csrf = await fetch(`${base}/api/auth/csrf`);
    remember(csrf);
    const { csrfToken } = await csrf.json() as { csrfToken: string };
    const login = await fetch(`${base}/api/auth/callback/credentials`, {
      method: "POST", redirect: "manual",
      headers: { cookie: cookies(), origin: base },
      body: new URLSearchParams({ csrfToken, username: "admin", password: "Pass12345", callbackUrl: `${base}/admin` }),
    });
    remember(login);
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: cookies() } });
    const identity = await session.json() as { user?: { role?: string } };
    assert.equal(identity.user?.role, "ADMIN", "Existing development login must authenticate normally.");
    for (const locale of ["ua", "en"] as const) {
      const cookie = `${cookies()}; locale=${locale}`;
      const settings = await get("/admin/content", cookie);
      for (const key of ["hero_title_ua", "hero_title_en", "hero_subtitle_ua", "hero_subtitle_en", "hero_image_1", "hero_image_2", "hero_image_3", "social_instagram", "social_telegram", "social_tiktok", "social_youtube"]) {
        assert.ok(settings.includes(`name="${key}"`), `Missing admin content field: ${key}`);
      }
      const previews = [...settings.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
      for (const asset of heroAssets) {
        const valid = safeContentUrl(content[asset.key]);
        if (valid || !content[asset.key]?.trim()) assert.ok(previews.includes(valid || asset.src));
      }
      const create = await get("/admin/products/new", cookie);
      assert.ok(create.includes('name="hoverGifUrl"'));
      assert.ok(create.includes(translations[locale].admin.product.hoverGifHelp));
      if (products[0]) {
        const edit = await get(`/admin/products/${products[0].id}/edit`, cookie);
        assert.ok(edit.includes('name="hoverGifUrl"') && edit.includes('name="imageUrl"'));
      }
    }
    console.log("PASS: authenticated admin UA/EN create/edit GIF fields, helper text, hero text/media fields and previews, social settings; no admin changes submitted.");
  } else {
    console.log("Admin form HTML checks skipped: existing TEST_MODE is off. Authenticated Preview validation remains manual.");
  }
  const font = await fetch(`${base}/fonts/comfortaa-bold-700.ttf`);
  assert.equal(font.status, 200);
  assert.equal((await font.arrayBuffer()).byteLength, 110172);
  console.log("PASS: admin remains protected; self-hosted Comfortaa 700 is served.");
}

void verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
