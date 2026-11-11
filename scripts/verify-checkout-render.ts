// Render the actual checkout form with installed React DOM, without browser interaction or side effects.
import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as hookForm from "react-hook-form";
import * as resolvers from "@hookform/resolvers/zod";
import * as icons from "lucide-react";
import * as validation from "../src/lib/validations/checkout";
import * as cart from "../src/store/cart-store";
import * as language from "../src/store/lang-store";
import * as utils from "../src/lib/utils";
import * as lookups from "../src/components/checkout/use-np-lookups";
import type { CheckoutForm as Form } from "../src/components/checkout/checkout-form";
import { sourceModule } from "./source-module";
import * as variants from "../src/lib/product-variants";
import type { ProductOptions as Options } from "../src/components/product/product-options";

const blocked = () => { throw new Error("NO_SIDE_EFFECTS_DURING_RENDER_QA"); };
const button = sourceModule("src/components/ui/button.tsx", { react: React, "react/jsx-runtime": jsxRuntime, "@/lib/utils": utils });
function purchaseComponent(selectedSize: string | null = null) {
  // Seed a selected-size render using real React hooks. This checks rendered states,
  // not pointer/keyboard interaction, and adds no testing prop to production code.
  return sourceModule<{ ProductOptions: typeof Options }>("src/components/product/product-options.tsx", {
    react: { ...React, useState: (initial: unknown) => React.useState(initial === null ? selectedSize : initial) },
    "react/jsx-runtime": jsxRuntime, "lucide-react": icons, "@/lib/utils": utils,
    "@/components/ui/button": button, "@/store/cart-store": cart, "@/store/lang-store": language,
    "@/lib/product-variants": variants, sonner: { toast: { error: blocked, success: blocked } },
  }).ProductOptions;
}
const { CheckoutForm } = sourceModule<{ CheckoutForm: typeof Form }>("src/components/checkout/checkout-form.tsx", {
  react: React, "react/jsx-runtime": jsxRuntime, "react-hook-form": hookForm,
  "@hookform/resolvers/zod": resolvers, "lucide-react": icons,
  "@/lib/validations/checkout": validation, "@/components/ui/button": button,
  "@/store/cart-store": cart, "@/store/lang-store": language, "@/lib/utils": utils,
  "./use-np-lookups": lookups, "next/navigation": { useRouter: () => ({ push: blocked }) },
  "@/lib/actions/create-order": { createOrder: blocked }, sonner: { toast: { error: blocked, success: blocked } },
});
for (const locale of ["ua", "en"] as const) {
  const store = language.createLangStore(locale);
  const t = store.getState().t.checkout;
  const sizes: variants.SizeVariant[] = [
    { id: "small", labelUa: "Маленький", labelEn: "Small", price: 14, noteUa: "Компактний", noteEn: "Compact" },
    { id: "large", labelUa: "Великий", labelEn: "Large", price: 25, noteUa: "Збільшений", noteEn: "Larger" },
  ];
  const original = JSON.stringify(sizes);
  const renderPurchase = (configuredSizes: variants.SizeVariant[], selectedId: string | null = null, stock = 5) => renderToStaticMarkup(
    React.createElement(language.LangStoreContext.Provider, { value: store }, React.createElement(purchaseComponent(selectedId), {
      productId: "qa", name: "QA", slug: "qa", basePrice: 10, image: "/images/placeholder.svg", stock, variants: configuredSizes,
    })));
  const addButton = (html: string) => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.at(-1) ?? "";
  const simpleHtml = renderPurchase([]);
  assert.ok(!simpleHtml.includes("<fieldset"), "Simple products must have no size selector.");
  assert.ok(simpleHtml.includes(utils.formatPrice(10, "UAH")), "Simple products display their base price.");
  assert.ok(addButton(simpleHtml).includes(store.getState().t.product.addToCart));
  assert.ok(!addButton(simpleHtml).includes("disabled="), "Stocked simple products can be added immediately.");
  const unselectedHtml = renderPurchase(sizes);
  assert.ok(unselectedHtml.includes("<fieldset") && unselectedHtml.includes(store.getState().t.product.chooseSize));
  assert.equal((unselectedHtml.match(/aria-pressed="false"/g) ?? []).length, sizes.length, "No size may be selected automatically.");
  assert.ok(addButton(unselectedHtml).includes("disabled="), "A configured size must be selected before adding.");
  assert.ok(unselectedHtml.includes(utils.formatPrice(14, "UAH")), "The initial price is the minimum explicit size price.");
  for (const size of sizes) {
    const html = renderPurchase(sizes, size.id);
    assert.ok(html.includes(utils.formatPrice(size.price!, "UAH")), "Selection displays its explicit price, not base price plus a modifier.");
    assert.ok(html.includes(variants.sizeLabel(size, locale)));
    assert.ok(html.includes(locale === "en" ? size.noteEn! : size.noteUa!));
    assert.ok(!addButton(html).includes("disabled="), "A valid selected size enables Add to Cart.");
    if (locale === "en") assert.doesNotMatch(html, /[А-Яа-яІіЇїЄєҐґ]/);
  }
  assert.ok(addButton(renderPurchase(sizes, "missing-size")).includes("disabled="));
  assert.ok(addButton(renderPurchase(sizes, "small", 0)).includes("disabled="));
  assert.ok(addButton(renderPurchase([{ ...sizes[0], price: null }], "small")).includes("disabled="));
  assert.equal(JSON.stringify(sizes), original, "Rendering must not mutate variant IDs, labels, notes or prices.");
  assert.equal(variants.productLineId("qa"), "qa");
  assert.equal(variants.productLineId("qa", "small"), "qa-small");
  for (const enabled of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(language.LangStoreContext.Provider, { value: store }, React.createElement(CheckoutForm, { onlineCardEnabled: enabled }))).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
    for (const label of [t.contact.title, t.contact.surname, t.contact.phone, t.delivery.title, t.delivery.warehouse, t.delivery.locker, t.delivery.courier, t.payment.title, t.comment, t.submit]) assert.ok(html.includes(label), `${locale} missing ${label}`);
    for (const id of ["customerName", "customerSurname", "customerPhone", "customerEmail", "np-city"]) assert.ok(html.includes(`for="${id}"`) && html.includes(`id="${id}"`));
    assert.ok(html.includes('type="tel"'));
    assert.equal(html.includes(t.payment.card), enabled);
    assert.ok(html.includes(enabled ? t.payment.note : t.payment.unavailable));
    assert.doesNotMatch(html, /coming soon|незабаром|WayForPay|Monobank|Runtime|РЎ|Р /);
    if (locale === "en") assert.doesNotMatch(html, /[А-Яа-яІіЇїЄєҐґ]/);
  }
}
console.log("PASS optional-size purchase and checkout renders: UA/EN; simple products use base price with immediate Add; configured sizes require selection and show explicit prices/notes; invalid/unpriced/out-of-stock selections blocked; canonical data unchanged; checkout labels/payment states localized. Browser interaction remains a manual check.");
