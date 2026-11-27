// Read and mutate synthetic fixtures only on the rehearsal's disposable loopback database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const origin = process.env.BATCH19_APP_ORIGIN;
assert.match(origin ?? "", /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const dbUrl = new URL(process.env.BATCH19_OWNER_DATABASE_URL);
const marker = process.env.BATCH19_QA_MARKER;
assert.equal(dbUrl.hostname, "127.0.0.1");
assert.equal(dbUrl.username, "batch18a_qa");
assert.equal(dbUrl.pathname, "/batch18_review_" + marker);
assert.equal(readFileSync(join(process.env.BATCH19_QA_DIRECTORY, "qa-marker"), "utf8"), marker);
const db = new PrismaClient({ datasourceUrl: dbUrl.href });
const site = "https://www.3dkid.shop";
const decoded = value => value?.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
const read = (path, locale = "ua", agent = "Mozilla/5.0 SEO browser fixture") => fetch(origin + path, {
  headers: { cookie: "locale=" + locale, "user-agent": agent }, redirect: "manual",
});
async function html(path, locale, expected = 200, agent) {
  const response = await read(path, locale, agent);
  const body = await response.text();
  assert.equal(response.status, expected, path + " HTTP status");
  return { head: body.match(/<head>(.*?)<\/head>/s)?.[1], body, headers: response.headers };
}
function meta(head, key) {
  return decoded(head.match(new RegExp('<meta (?:name|property)="' + key + '" content="([^"]*)"'))?.[1]);
}
function canonical(head) {
  return decoded(head.match(/<link rel="canonical" href="([^"]+)"/)?.[1]);
}
const jsonLd = body => [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));
const title = head => decoded(head.match(/<title>(.*?)<\/title>/s)?.[1]);
const nodeId = "seo01-qa-category";
const emptyId = "seo01-qa-empty";
const productId = "seo01-qa-product";
const productSlug = "тестовий-seo";
const productRoute = "/product/" + encodeURIComponent(productSlug);
const categoryUrl = "/catalog?category=seo01-fixture";
const homeTitle = {
  ua: "3D kid — 3D-друковані іграшки та аксесуари",
  en: "3D kid — 3D-Printed Toys & Accessories",
};
try {
  await db.category.createMany({ data: [
    { id: nodeId, slug: "seo01-fixture", name: "Категорія SEO", nameEn: "SEO category" },
    { id: emptyId, slug: "seo01-empty", name: "Порожня категорія", nameEn: "Empty category" },
  ] });
  await db.product.create({ data: {
    id: productId, slug: productSlug, name: "Тестовий товар", nameEn: "SEO fixture product",
    description: "Безпечний опис </script><script>seoFixture</script>", descriptionEn: "Recorded SEO fixture details",
    categoryId: nodeId, optionMode: "SIMPLE", price: "49.25", isActive: true, isOrderable: false,
    images: { create: { url: "/hero/bunny-v1.webp", alt: "Fixture product photo" } },
  } });

  for (const locale of ["ua", "en"]) {
    for (const agent of ["Mozilla/5.0 SEO browser fixture", "Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"]) {
      const home = await html("/?utm_source=fixture", locale, 200, agent);
      assert.equal(title(home.head), homeTitle[locale]);
      assert.equal(new URL(canonical(home.head)).href, site + "/");
      assert.equal(new URL(meta(home.head, "og:url")).href, site + "/");
      assert.equal(meta(home.head, "og:site_name"), "3D kid");
      assert.equal(meta(home.head, "og:image"), site + "/seo/store-share.jpg");
      assert.equal(meta(home.head, "og:locale"), locale === "ua" ? "uk_UA" : "en_US");
      assert.equal(meta(home.head, "twitter:card"), "summary_large_image");
      assert.ok(meta(home.head, "og:image:alt") && meta(home.head, "description").length > 100);
      assert.match(home.body, new RegExp('<html[^>]*lang="' + (locale === "ua" ? "uk" : "en") + '"'));
      assert.doesNotMatch(home.head, /hreflang|\/icon\.png\?|\/apple-icon\.png\?/);
      assert.equal([...home.head.matchAll(/rel="icon"/g)].length, 5);
      for (const file of ["/favicon-16.png", "/favicon-32.png", "/favicon-48.png", "/favicon-96.png", "/favicon.ico", "/apple-touch-icon.png"]) {
        assert.ok(home.head.includes('href="' + file + '"'));
      }
      const graph = jsonLd(home.body).find(item => item["@graph"])["@graph"];
      assert.deepEqual(graph.map(item => [item["@type"], item.name]), [["WebSite", "3D kid"], ["OnlineStore", "3D kid"]]);
      assert.equal(graph[1].logo.url, site + "/seo/brand-mark.png");
    }
    for (const path of ["/catalog", "/about", "/delivery-payment", categoryUrl]) {
      const page = await html(path, locale);
      assert.equal(canonical(page.head), site + path);
      assert.equal(meta(page.head, "og:url"), site + path);
      assert.ok(meta(page.head, "description"));
      if (path === categoryUrl) assert.ok(jsonLd(page.body).some(item => item["@type"] === "BreadcrumbList"));
    }
    const filtered = await html(categoryUrl + "&sort=price_asc&q=SEO&utm_source=fixture", locale);
    assert.match(meta(filtered.head, "robots"), /noindex/);
    assert.equal(canonical(filtered.head), site + categoryUrl);
    const empty = await html("/catalog?category=seo01-empty", locale);
    assert.match(meta(empty.head, "robots"), /noindex/);
    await html("/catalog?category=stickers", locale, 404);
    await html("/product/shopper", locale, 404);

    const product = await html(productRoute + "?utm_source=fixture", locale);
    assert.equal(canonical(product.head), site + productRoute);
    assert.equal(meta(product.head, "og:image"), site + "/hero/bunny-v1.webp");
    assert.equal(meta(product.head, "og:image:alt"), "Fixture product photo");
    const structured = jsonLd(product.body);
    const productData = structured.find(item => item["@type"] === "Product");
    assert.equal(productData.offers.price, "49.25");
    assert.equal(productData.offers.priceCurrency, "UAH");
    assert.equal(productData.offers.availability, "https://schema.org/OutOfStock");
    assert.equal(productData.brand.name, "3D kid");
    assert.ok(!productData.sku && !productData.aggregateRating && !productData.review);
    assert.ok(structured.some(item => item["@type"] === "BreadcrumbList"));
    assert.doesNotMatch(product.body, /<script>seoFixture<\/script>/);
  }

  const upper = await read("/product/" + encodeURIComponent(productSlug.replace(/seo$/, "SEO")));
  assert.equal(upper.status, 308);
  assert.equal(new URL(upper.headers.get("location"), origin).pathname, productRoute);
  assert.equal((await read("/catalog?category=SEO01-FIXTURE")).status, 308);
  const urls = async () => [...(await (await read("/sitemap.xml")).text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => decoded(match[1]));
  let sitemap = await urls();
  for (const path of ["/", "/about", "/delivery-payment", "/catalog", categoryUrl, productRoute]) assert.ok(sitemap.includes(site + path), path);
  assert.ok(sitemap.every(url => url.startsWith(site + "/") && !/\/(account|checkout|admin|api|login)\b|shopper|seo01-empty|token=/.test(url)));
  assert.equal(new Set(sitemap).size, sitemap.length);
  await db.product.update({ where: { id: productId }, data: { isActive: false } });
  const hidden = await html(productRoute, "en", 404);
  assert.ok(!hidden.head.includes("SEO fixture product") && !jsonLd(hidden.body).length);
  sitemap = await urls();
  assert.ok(!sitemap.includes(site + productRoute) && !sitemap.includes(site + categoryUrl));
  await db.product.delete({ where: { id: productId } });
  await html(productRoute, "en", 404);
  const robots = await (await read("/robots.txt")).text();
  assert.match(robots, /Sitemap: https:\/\/www\.3dkid\.shop\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow:.*(?:favicon|apple-touch|\/seo\/|\/product|\/catalog)/);
  for (const route of ["/account/sign-in", "/checkout", "/checkout/success", "/login", "/cart"]) {
    assert.match((await read(route)).headers.get("x-robots-tag"), /noindex/);
  }

  for (const [path, type, size] of [
    ...[16, 32, 48, 96].map(size => [`/favicon-${size}.png`, "image/png", [size, size]]),
    ["/favicon.ico", "image/", null], ["/apple-touch-icon.png", "image/png", [180, 180]],
    ["/seo/brand-mark.png", "image/png", [256, 256]], ["/seo/store-share.jpg", "image/jpeg", [1200, 630]],
    ["/hero/logo.png?v=brand-01", "image/png", [409, 369]],
  ]) {
    const response = await read(path, "ua", "Googlebot-Image/1.0");
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-robots-tag"), null, path + " stays indexable");
    assert.ok(response.headers.get("content-type").startsWith(type), path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length < 70000, path + " optimized file size");
    if (size) {
      const info = await sharp(bytes).metadata();
      assert.deepEqual([info.width, info.height], size);
    }
    assert.deepEqual(bytes, readFileSync("public" + new URL(path, site).pathname));
  }
  const optimizer = file => "/_next/image?url=" + encodeURIComponent(file) + "&w=384&q=75";
  for (const image of ["/hero/dragon-v1.webp", "/hero/robot-v1.webp", "/hero/bunny-v1.webp"]) {
    for (const path of [image, optimizer(image)]) {
      const response = await read(path, "ua", "Googlebot-Image/1.0");
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type"), /^image\//);
      assert.equal(response.headers.get("x-robots-tag"), image.includes("bunny") ? null : "noindex", path);
      await response.arrayBuffer();
    }
  }
  console.log("PASS SEO-01 rendered UA/EN browser and Googlebot HTML, canonical/social/JSON-LD, real 404 and case redirects, sitemap, public brand assets and scoped legacy image noindex");
} finally {
  await db.product.deleteMany({ where: { id: productId } });
  await db.category.deleteMany({ where: { id: { in: [nodeId, emptyId] } } });
  await db.$disconnect();
}
