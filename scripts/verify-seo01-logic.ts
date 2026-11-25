import assert from "node:assert/strict";
import { productStructuredData } from "../src/lib/product-seo";
import { storefrontContentSchema } from "../src/lib/site-content";
import { resolveSeo } from "../src/lib/seo";
import { seoLimits } from "../src/lib/seo-config";

const colors = { id: "option-col", kind: "COLOR" as const, name: "Колір", values: [
  { id: "pink", value: "Рожевий", valueEn: "Pink" },
  { id: "blue", value: "Блакитний", valueEn: "Blue" },
] };
const sizes = { id: "option-size", kind: "SIZE" as const, name: "Розмір", values: [{ id: "small", value: "Малий", valueEn: "Small" }] };
const product = {
  id: "seo-fixture", slug: "fixture", price: "100.00", optionMode: "COLOR_SIZE" as const, isActive: true, isOrderable: true,
  images: [
    { url: "/hero/bunny-v1.webp", alt: "Universal", colorValueId: null },
    { url: "/hero/robot-v1.webp", alt: "Pink", colorValueId: "pink" },
  ],
  options: [colors, sizes],
  variants: [
    { id: "pink-small", price: "149.25", isAvailable: true, filamentGroups: [], selections: [
      { optionId: colors.id, valueId: "pink" }, { optionId: sizes.id, valueId: "small" },
    ] },
    { id: "blue-small", price: "55.00", isAvailable: true, filamentGroups: [{ id: "blocked" }], selections: [
      { optionId: colors.id, valueId: "blue" }, { optionId: sizes.id, valueId: "small" },
    ] },
    { id: "retired", price: "10.00", isAvailable: true, retiredAt: new Date(0), filamentGroups: [], selections: [
      { optionId: colors.id, valueId: "blue" }, { optionId: sizes.id, valueId: "small" },
    ] },
  ],
};
const group = productStructuredData(product, product.images, "Toy", "Actual description", "3D kid", "en");
assert.equal(group["@type"], "ProductGroup");
assert.ok("hasVariant" in group && group.hasVariant);
const [pink, blue] = group.hasVariant;
assert.equal(group.hasVariant.length, 2);
assert.equal(pink.name, "Toy — Pink — Small");
assert.deepEqual(pink.image, ["https://www.3dkid.shop/hero/robot-v1.webp"]);
assert.equal(pink.offers.price, "149.25");
assert.equal(pink.offers.availability, "https://schema.org/InStock");
assert.deepEqual(blue.image, ["https://www.3dkid.shop/hero/bunny-v1.webp"]);
assert.equal(blue.offers.price, undefined);
assert.equal(blue.offers.availability, "https://schema.org/OutOfStock");
const blocked = productStructuredData({ ...product, isOrderable: false }, product.images, "Іграшка", "Опис", "3D kid", "ua");
assert.ok("hasVariant" in blocked && blocked.hasVariant?.every(variant => variant.offers.availability.endsWith("/OutOfStock")));
assert.ok(blocked.hasVariant?.[0].name.includes("Рожевий"));
assert.ok(!JSON.stringify(group).includes("aggregateRating"));

assert.equal(resolveSeo(storefrontContentSchema.parse({ seo_site_name: "" }), "en").name, "3D kid");
assert.equal(resolveSeo(storefrontContentSchema.parse({ seo_home_title_en: "  Updated title  " }), "en").title, "Updated title");
for (const url of ["http://example.invalid/image.png", "https://user@example.invalid/image.png", "javascript:alert(1)", "data:image/png;base64,a"]) {
  assert.equal(storefrontContentSchema.safeParse({ seo_social_image: url }).success, false);
}
assert.equal(storefrontContentSchema.safeParse({ seo_home_title_ua: "x".repeat(seoLimits.title + 1) }).success, false);
console.log("PASS SEO-01 native variant prices and availability, retired/material rules, localized snapshots, media fallbacks and content validation");
