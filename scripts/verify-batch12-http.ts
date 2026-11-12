// Read-only checks against the real category tree and a running local production build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { getCategoryTree } from "../src/lib/categories";
import { prisma } from "../src/lib/prisma";
import { getCategoryName } from "../src/lib/category-name";

loadEnvConfig(process.cwd());
const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3011";
assert.equal(new URL(base).hostname, "127.0.0.1");
const stripScripts = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const decode = (html: string) => html.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
const links = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];

async function page(path: string, locale: string) {
  const response = await fetch(`${base}${path}`, { headers: { cookie: `locale=${locale}` } });
  assert.equal(response.status, 200, path);
  return decode(stripScripts(await response.text()));
}

async function verify() {
  const tree = await getCategoryTree();
  assert.deepEqual(tree.map(({ slug }) => slug), ["toys", "keychains", "clickers", "fidgets", "earphone-accessories"]);
  assert.deepEqual(tree.map(({ order }) => order), [10, 20, 30, 40, 50]);
  assert.ok(tree.every(({ children }) => children.length === 0));
  const products = await prisma.product.findMany({ where: { isActive: true }, select: { categoryId: true, slug: true } });
  const css = readFileSync("src/app/(shop)/storefront.css", "utf8");
  assert.equal((css.match(/#F494BA/g) || []).length, 1);
  assert.ok(css.includes("--sf-brand-pink: #F494BA;"));
  for (const [selector, property] of [
    [".sf-hero h1", "color"], [".sf-language button[aria-pressed=\"true\"]", "background"],
    [".sf-cart-count", "background"], [".sf-footer", "background"], [".sf-decorative-star", "color"],
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = css.match(new RegExp(`${escaped} \\{([^}]+)\\}`))?.[1];
    assert.ok(rule?.includes(`${property}: var(--sf-brand-pink)`), selector);
  }
  assert.ok(css.includes("clamp(1.97rem, 4.79vw, 3.85rem)"));
  assert.ok(css.includes("clamp(1.6rem, 6.3vw, 2.49rem)"));
  assert.equal(Math.round((4.1 - 3.85) * 16), 4);

  for (const locale of ["ua", "en"] as const) {
    const expected = tree.map((category) => [`/catalog?category=${category.slug}`, getCategoryName(category, locale)]);
    const home = await page("/", locale);
    const strip = home.match(/<nav class="sf-shell sf-categories sf-categories--home"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(strip);
    const categoryLinks = links(strip);
    assert.deepEqual(categoryLinks.map((match) => [match[1], match[2].replace(/<[^>]*>/g, "").replace("✦", "").trim()]), expected);
    assert.equal((strip.match(/sf-decorative-star/g) || []).length, 5);
    for (const link of categoryLinks) assert.match(link[2], /^<span class="sf-decorative-star" aria-hidden="true">✦<\/span>[^<]+$/);
    assert.match(home, /<h2 id="home-catalog-title">[^<]+<span class="sf-decorative-star" aria-hidden="true">✦<\/span><\/h2>/);
    const footer = home.match(/<footer class="sf-shell sf-footer">([\s\S]*?)<\/footer>/)?.[1];
    assert.ok(footer);
    assert.deepEqual(links(footer).filter((match) => match[1].startsWith("/catalog?category=")).map((match) => [match[1], match[2]]), expected);
    assert.match(home, /<button[^>]*aria-pressed="true"/);
    const cssUrls = [...home.matchAll(/<link[^>]*href="([^"]+\.css(?:\?[^"]*)?)"/g)].map((match) => match[1]).filter((url) => url.startsWith("/_next/static/css/"));
    assert.ok(cssUrls.length);
    const builtCss = (await Promise.all(cssUrls.map(async (url) => {
      const response = await fetch(`${base}${url}`);
      assert.equal(response.status, 200);
      return response.text();
    }))).join("").toLowerCase().replace(/\s/g, "");
    assert.ok(builtCss.includes("--sf-brand-pink:#f494ba"));
    assert.ok(builtCss.includes("background:var(--sf-brand-pink)"));
    assert.ok(builtCss.includes("color:var(--sf-brand-pink)"));
    assert.ok(builtCss.includes("font-size:clamp(1.97rem,4.79vw,3.85rem)"));
    const filteredCounts: Record<string, number> = {};
    for (const category of tree) {
      const catalog = await page(`/catalog?category=${category.slug}`, locale);
      // Next streams deferred content outside the initial <main> transport fragment.
      // Inspect the complete script-free response, including those deferred HTML blocks.
      const buttonLabels = [...catalog.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({
        attributes: match[1], text: match[2].replace(/<[^>]*>/g, "").trim(),
      }));
      const categoryButtons = buttonLabels.filter(({ text }) => tree.some((item) => getCategoryName(item, locale) === text));
      assert.deepEqual(categoryButtons.map(({ text }) => text), expected.map((item) => item[1]));
      assert.ok(categoryButtons.find(({ text }) => text === getCategoryName(category, locale))?.attributes.includes('aria-pressed="true"'));
      const expectedProducts = products.filter(({ categoryId }) => categoryId === category.id).map(({ slug }) => `/product/${slug}`).sort();
      const cardLinks = links(catalog).filter((match) => match[0].includes('class="sf-product-visual"')).map((match) => match[1]).sort();
      assert.deepEqual(cardLinks, expectedProducts);
      filteredCounts[category.slug] = expectedProducts.length;
    }
    console.log(`PASS ${locale}: five DB-driven categories/order in strip, footer and filters; a leading decorative star per category; brand CSS; catalog filtering ${JSON.stringify(filteredCounts)}.`);
  }
}

void verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
