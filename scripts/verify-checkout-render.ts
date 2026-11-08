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
import * as productContent from "../src/lib/product-content";
import type { ProductOptions as Options } from "../src/components/product/product-options";

const blocked = () => { throw new Error("NO_SIDE_EFFECTS_DURING_RENDER_QA"); };
const button = sourceModule("src/components/ui/button.tsx", { react: React, "react/jsx-runtime": jsxRuntime, "@/lib/utils": utils });
const { ProductOptions } = sourceModule<{ ProductOptions: typeof Options }>("src/components/product/product-options.tsx", {
  react: React, "react/jsx-runtime": jsxRuntime, "lucide-react": icons, "@/lib/utils": utils,
  "@/components/ui/button": button, "@/store/cart-store": cart, "@/store/lang-store": language,
  "@/lib/product-content": productContent, sonner: { toast: { error: blocked, success: blocked } },
});
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
  const option = { id: "size", name: "Розмір", values: ["Маленький", "Середній", "Великий"].map((value, index) => ({ id: String(index), value, priceModifier: 0 })) };
  const original = JSON.stringify(option);
  const optionsHtml = renderToStaticMarkup(React.createElement(language.LangStoreContext.Provider, { value: store }, React.createElement(ProductOptions, { productId: "qa", name: "QA", slug: "qa", basePrice: 10, image: "/images/placeholder.svg", stock: 5, options: [option] })));
  assert.equal(JSON.stringify(option), original, "Localization must not mutate canonical options.");
  for (const text of locale === "en" ? ["Size", "Small", "Medium", "Large"] : ["Розмір", "Маленький", "Середній", "Великий"]) assert.ok(optionsHtml.includes(text));
  if (locale === "en") assert.doesNotMatch(optionsHtml, /[А-Яа-яІіЇїЄєҐґ]/);
  assert.equal(productContent.getProductOptionLabel("Custom material", locale), "Custom material");
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
console.log("PASS actual checkout form and product options static render: UA/EN, canonical values preserved, localized size labels, associated labels/tel input, configured/unconfigured payment controls, no stale providers or Cyrillic in EN. Interactive validation remains a browser check.");
