import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import Image from "next/image";
import Link from "next/link";
import * as language from "../src/store/lang-store";
import * as content from "../src/lib/site-content";
import * as category from "../src/lib/category-name";
import type { Footer as FooterType } from "../src/components/layout/footer";
import { sourceModule } from "./source-module";

const { Footer } = sourceModule<{ Footer: typeof FooterType }>("src/components/layout/footer.tsx", {
  "react/jsx-runtime": jsxRuntime, "next/image": { default: Image, __esModule: true }, "next/link": { default: Link, __esModule: true },
  "@/store/lang-store": language, "@/lib/site-content": content, "@/lib/category-name": category,
  "@/components/layout/social-icon": { SocialIcon: () => React.createElement("svg", { "aria-hidden": true }) },
});
const networks = ["instagram", "telegram", "tiktok", "youtube"] as const;
for (const locale of ["ua", "en"] as const) {
  for (let mask = 0; mask < 16; mask++) {
    const settings = Object.fromEntries(networks.map((network, index) => [`social_${network}`, mask & (1 << index) ? `https://${network}.example.invalid/3dkid` : ""]));
    const html = renderToStaticMarkup(React.createElement(language.LangStoreContext.Provider, { value: language.createLangStore(locale) }, React.createElement(Footer, { categories: [], content: settings })));
    for (const [index, network] of networks.entries()) {
      const url = settings[`social_${network}`];
      assert.equal(html.includes(`href="${url}"`), Boolean(mask & (1 << index)));
      if (url) assert.ok(html.includes(`href="${url}" aria-label="${language.createLangStore(locale).getState().t.footer.social[network]}" target="_blank" rel="noopener noreferrer"`));
      assert.equal(content.storefrontContentSchema.safeParse({ [`social_${network}`]: url }).success, true);
      for (const invalid of ["no-url", "javascript:alert(1)", "https://user:secret@example.invalid/"]) assert.equal(content.storefrontContentSchema.safeParse({ [`social_${network}`]: invalid }).success, false);
    }
    assert.ok(!html.includes('href="#"'));
  }
}
console.log("PASS socials: 16 independent configured/empty combinations in UA/EN, exact URL mapping, safe external attributes, empty icons hidden, URL validation/clear supported.");
