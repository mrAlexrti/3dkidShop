// Read-only localhost production QA. Only Nova Poshta address lookup POSTs are sent.
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { translations } from "../src/lib/i18n";
import { getProductName } from "../src/lib/product-content";
import { getSizeVariants, sizeLabel } from "../src/lib/product-variants";
import { filterWarehousesByDelivery, NP_LOCKER_TYPE, NP_WAREHOUSE_TYPE, type NPWarehouse } from "../src/lib/np-warehouse-types";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
const base = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3011";
assert.equal(new URL(base).hostname, "127.0.0.1");
const visible = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "").replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&quot;", '"');
async function page(path: string, locale: "ua" | "en") {
  const response = await fetch(`${base}${path}`, { headers: { cookie: `locale=${locale}` }, redirect: "manual" });
  assert.equal(response.status, 200, `${locale} ${path}`);
  return visible(await response.text());
}
async function verifyStorefront() {
  const products = await db.product.findMany({ where: { isActive: true }, include: { images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 1 }, options: { include: { values: true } } } });
  assert.ok(products.length);
  for (const locale of ["ua", "en"] as const) {
    const t = translations[locale];
    const home = await page("/", locale);
    assert.ok(home.includes('id="home-product-search"') && home.includes('role="combobox"'));
    assert.ok(!home.includes("Переглянути каталог") && !home.includes("View catalog"));
    assert.doesNotMatch(home, /coming soon|незабаром|href="#"|WayForPay|Monobank|РЎ|Р /);
    for (const path of ["/about", "/delivery-payment"]) {
      const html = await page(path, locale);
      const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0] ?? "";
      assert.ok(header && !header.includes("sf-categories"), `${path} has no product category strip`);
      if (path === "/about") {
        const content = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/)?.[0] ?? "";
        assert.ok(content.includes(`<h1 class="sf-information-lead">${t.pages.about.slogan}</h1>`));
        assert.ok(!content.includes(">3D kid</h1>"));
        for (const paragraph of t.pages.about.paragraphs) assert.ok(content.includes(paragraph));
      }
    }
    const catalog = await page("/catalog", locale);
    assert.ok(catalog.includes('id="catalog-product-search"') && catalog.includes('role="combobox"') && catalog.includes("sf-catalog-filters"));
    assert.ok(!catalog.includes('class="sf-shell sf-categories"'), "Catalog filters replace the duplicate header category strip.");
    assert.ok(catalog.includes('class="sf-product-grid"') && catalog.includes('class="sf-product-card"'));
    for (const sort of ["newest", "price_asc", "price_desc", "name"]) {
      const html = await page(`/catalog?sort=${sort}`, locale);
      const positions = products.map((product) => ({ product, index: html.indexOf(`href="/product/${product.slug}"`) })).filter((item) => item.index >= 0).sort((a, b) => a.index - b.index);
      assert.equal(positions.length, Math.min(products.length, 12));
      if (sort.startsWith("price_")) for (let index = 1; index < positions.length; index++) {
        const difference = Number(positions[index].product.price) - Number(positions[index - 1].product.price);
        assert.ok(sort === "price_asc" ? difference >= 0 : difference <= 0);
      }
    }
    const product = products[0];
    const query = product.name.slice(0, 4);
    const searched = await page(`/catalog?q=${encodeURIComponent(query)}&sort=price_asc&category=toys`, locale);
    assert.ok(searched.includes(`value="${query}"`));
    const empty = await page("/catalog?q=batch13-no-such-product-9283746", locale);
    assert.ok(empty.includes(t.catalog.empty));
    const detail = await page(`/product/${product.slug}`, locale);
    assert.ok(detail.includes(getProductName(product, locale)) && detail.includes("sf-categories"));
    for (const record of products) {
      const html = record.id === product.id ? detail : await page(`/product/${record.slug}`, locale);
      const sizes = getSizeVariants(record.options);
      if (sizes.length) {
        assert.ok(html.includes('id="size-selection-help"'));
        for (const size of sizes) assert.ok(html.includes(sizeLabel(size, locale)), `${record.slug}: localized configured size`);
      } else {
        assert.ok(!html.includes('id="size-selection-help"'), `${record.slug}: simple product has no size selector`);
      }
    }
    assert.ok((await page("/cart", locale)).includes(t.cart.empty));
    // Persisted cart state is resolved after hydration; HTTP verifies its safe loading shell.
    assert.ok((await page("/checkout", locale)).includes(t.common.loading));
    const params = new URLSearchParams({ q: query.toUpperCase(), locale });
    const response = await fetch(`${base}/api/products/suggestions?${params}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    const suggestions = (await response.json()).products as { id: string; slug: string; name: string; image: string }[];
    assert.ok(suggestions.length > 0 && suggestions.length <= 6);
    for (const suggestion of suggestions) {
      assert.deepEqual(Object.keys(suggestion).sort(), ["id", "image", "name", "slug"]);
      const record = products.find((item) => item.id === suggestion.id);
      assert.ok(record); assert.equal(suggestion.name, getProductName(record, locale));
    }
    console.log(`PASS ${locale}: home/info/catalog/product/empty cart/checkout loading shell, sort/search/empty results, live autocomplete endpoint.`);
  }
  for (const query of ["", "a"]) {
    const response = await fetch(`${base}/api/products/suggestions?q=${query}`);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { products: [] });
  }
  for (const params of ["locale=ru&q=toy", `q=${"x".repeat(81)}`]) assert.equal((await fetch(`${base}/api/products/suggestions?${params}`)).status, 400);
  const pagination = await fetch(`${base}/catalog?page=999&category=toys&sort=price_asc&q=`, { redirect: "manual" });
  // Next.js can flush a streaming shell before redirect(), then emit a meta refresh.
  const redirectHtml = visible(await pagination.text());
  const refresh = redirectHtml.match(/<meta\b[^>]*http-equiv="refresh"[^>]*>/i)?.[0];
  const target = pagination.headers.get("location") ?? refresh?.match(/content="[^\"]*url=([^\"]+)"/i)?.[1];
  assert.ok([307, 308].includes(pagination.status) || (pagination.status === 200 && refresh), `Pagination HTTP ${pagination.status} must contain a redirect.`);
  assert.ok(target?.includes("category=toys") && target.includes("sort=price_asc") && target.includes("page=1"), "Out-of-range pagination preserves filters and clamps to page 1.");
  console.log(`PASS pagination bounds preserve filters. ${products.length} active records: real multi-page browsing requires >12 records; no persistent fixtures added.`);
}

async function verifyNovaPoshta() {
  const fixtures: NPWarehouse[] = [
    { Ref: "branch", Description: "Delivery point", Number: "1", TypeOfWarehouse: NP_WAREHOUSE_TYPE },
    { Ref: "postal", Description: "Delivery point", Number: "2", TypeOfWarehouseRef: "841339c7-591a-42e2-8233-7a0a00f0ed6f" },
    { Ref: "locker", Description: "Delivery point", Number: "3", TypeOfWarehouse: NP_LOCKER_TYPE },
    { Ref: "text-locker", Description: "Поштомат №4", Number: "4", TypeOfWarehouseRef: NP_WAREHOUSE_TYPE },
  ];
  assert.deepEqual(filterWarehousesByDelivery(fixtures, "np_warehouse").map((item) => item.Ref), ["branch", "postal"]);
  assert.deepEqual(filterWarehousesByDelivery(fixtures, "np_parcel_locker").map((item) => item.Ref), ["locker", "text-locker"]);
  console.log("PASS NP classification: actual type field, legacy alias, postal branch, locker and contradictory branch-type/locker-text remain disjoint.");
  if (process.argv.includes("--filters-only")) return;
  if (!process.env.NP_API_KEY) { console.log("SKIP live NP lookup: no API key configured."); return; }
  async function np(method: string, properties: object) {
    await pause(1500); // Respect upstream lookup pacing; never bypass carrier rate limits.
    const response = await fetch(`${base}/api/novaposhta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelName: "Address", calledMethod: method, methodProperties: properties }) });
    const json = await response.json();
    const error = String(json.error ?? "").replaceAll(process.env.NP_API_KEY ?? "__no_key__", "[redacted]");
    assert.equal(response.status, 200, `NP ${method}: ${error.slice(0, 200)}`);
    assert.equal(json.success, true); return json.data;
  }
  const settlements = await np("searchSettlements", { CityName: "Київ", Limit: 12, Page: 1 });
  const city = settlements[0]?.Addresses?.find((address: { DeliveryCity: string }) => address.DeliveryCity);
  assert.ok(city?.DeliveryCity, "Live city lookup returns a delivery city reference.");
  const branches: NPWarehouse[] = await np("getWarehouses", { CityRef: city.DeliveryCity, FindByString: "Відділення", Limit: 50, Page: 1 });
  const lockers: NPWarehouse[] = await np("getWarehouses", { CityRef: city.DeliveryCity, FindByString: "Поштомат", Limit: 50, Page: 1 });
  assert.ok(branches.length && lockers.length);
  const mixed = [...branches, ...lockers];
  const branchResults = filterWarehousesByDelivery(mixed, "np_warehouse");
  const lockerResults = filterWarehousesByDelivery(mixed, "np_parcel_locker");
  assert.ok(branchResults.length && lockerResults.length, "Both real branch and locker lists survive classification.");
  assert.ok(branchResults.every((branch) => !lockerResults.some((locker) => locker.Ref === branch.Ref)));
  console.log(`PASS live NP city, branch and parcel locker searches; separated ${branchResults.length} branches / ${lockerResults.length} lockers. No document/TTN methods called.`);
}
async function verify() {
  if (!process.argv.includes("--np-only") && !process.argv.includes("--filters-only")) await verifyStorefront();
  if (!process.argv.includes("--skip-np")) await verifyNovaPoshta();
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
