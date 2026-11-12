// Read-only validation of a running production build. No orders or admin changes are submitted.
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { translations } from "../src/lib/i18n";
import { isOnlinePaymentAvailable } from "../src/lib/payments/online-payment";
import { resolveHeroCopy, safeContentUrl } from "../src/lib/site-content";

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
    assert.equal((footer.match(/(?:aria-label="(?:Instagram|Telegram|TikTok|YouTube))/g) || []).length, ["instagram", "telegram", "tiktok", "youtube"].filter((network) => safeContentUrl(content[`social_${network}`])).length);
    for (const category of categories) {
      const link = `/catalog?category=${encodeURIComponent(category.slug)}`;
      assert.ok(strip.includes(link) && footer.includes(link));
      assert.ok(strip.includes(locale === "ua" ? category.name : category.nameEn));
    }
    for (const product of products) assert.ok(home.includes(`/product/${product.slug}`));
    const about = await get("/about", cookie);
    assert.ok(about.includes(`<title>${t.pages.about.metaTitle} | 3D Kid</title>`));
    assert.ok(about.includes(`<h1 class="sf-information-lead">${t.pages.about.slogan}</h1>`));
    for (const paragraph of t.pages.about.paragraphs) assert.ok(about.includes(paragraph));
    const delivery = await get("/delivery-payment", cookie);
    assert.ok(delivery.includes(`<title>${t.pages.deliveryPayment.title} | 3D Kid</title>`));
    assert.ok(delivery.includes(t.pages.deliveryPayment.cost));
    assert.equal(delivery.includes(t.pages.deliveryPayment.card), isOnlinePaymentAvailable());
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
  console.log("Authenticated admin HTML checks remain manual after the local credential reset. TEST_MODE is not an authentication bypass.");
  const font = await fetch(`${base}/fonts/comfortaa-bold-700.ttf`);
  assert.equal(font.status, 200);
  assert.equal((await font.arrayBuffer()).byteLength, 110172);
  console.log("PASS: admin remains protected; self-hosted Comfortaa 700 is served.");
}

void verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
