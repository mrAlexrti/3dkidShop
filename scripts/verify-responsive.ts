// Render actual shop components with isolated data, then measure them in installed Edge.
// No dependency install, DB access, real checkout submission, or external requests.
// Run: tsx scripts/verify-responsive.ts [absolute path to Edge/Chromium]
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as pause } from "node:timers/promises";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config";
import * as utils from "../src/lib/utils";
import * as language from "../src/store/lang-store";
import { translations } from "../src/lib/i18n";
import * as content from "../src/lib/site-content";
import * as productContent from "../src/lib/product-content";
import * as categoryNames from "../src/lib/category-name";
import * as variants from "../src/lib/product-variants";
import * as media from "../src/lib/product-media";
import * as hookForm from "react-hook-form";
import * as resolvers from "@hookform/resolvers/zod";
import * as validation from "../src/lib/validations/checkout";
import { heroAssets } from "../src/lib/hero-assets";
import { sourceModule } from "./source-module";

async function verify() {
  const h = React.createElement;
  const output = resolve(".next/cache/responsive-qa");
  mkdirSync(output, { recursive: true });
  const blocked = () => { throw new Error("NO_SIDE_EFFECTS_IN_RESPONSIVE_QA"); };
  const motion = new Proxy({}, { get: (_, tag: string) => ({ children, ...props }: Record<string, unknown>) => {
    for (const key of ["initial", "animate", "exit", "transition", "layout", "whileInView", "viewport"]) delete props[key];
    return h(tag, props, children as React.ReactNode);
  } });
  const image = ({ fill, ...props }: Record<string, unknown>) => {
    delete props.priority; delete props.unoptimized;
    return h("img", { ...props, ...(fill ? { style: { position: "absolute", inset: 0, height: "100%", width: "100%" } } : {}) });
  };
  const link = ({ ...props }: Record<string, unknown>) => { delete props.prefetch; return h("a", props); };
  const categories = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, slug: `category-${i}`,
    name: ["Фігурки", "Брелоки", "Дракони", "Декор та аксесуари"][i % 4],
    nameEn: ["Figures", "Keychains", "Dragons", "Decor and accessories"][i % 4],
    children: [{ id: `s${i}`, slug: `child-${i}`, name: "Маленькі фігурки", nameEn: "Small figures" }],
  }));
  const sizes = [{ id: "small", labelUa: "Компактний розмір з довгою назвою", labelEn: "Compact size with a long name", price: 1200,
    noteUa: "Примітка щодо обраного розміру", noteEn: "A note about the selected size" }];
  const products = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, productId: `p${i}`, slug: `product-${i}`,
    name: i === 0 ? "Супердовганазвабезпробілівдляперевіркиперенесення" : "Дракон з рухливими крилами",
    nameEn: i === 0 ? "Extraordinarilylongunbrokenproductnameforwrapping" : "Dragon with moving wings",
    price: 1234, oldPrice: 1450, quantity: 2, isOrderable: i !== 0, isNew: true, hasOptions: i === 1,
    image: "/hero/dragon-v1.webp", variant: sizes[0],
  }));

  let pathname = "/catalog";
  let params = new URLSearchParams("category=child-0");
  let cartOpen = false;
  let delivery = "np_warehouse";
  let locale: "ua" | "en" = "ua";
  let stressProduct = false;
  const cartState = { items: products, isOpen: false, closeCart: blocked, removeItem: blocked, updateQuantity: blocked,
    openCart: blocked, addItem: blocked, clear: blocked, count: () => 8, total: () => 9872 };
  const common = {
    react: React, "react/jsx-runtime": jsxRuntime, "lucide-react": icons, "next/image": { default: image, __esModule: true },
    "next/link": { default: link, __esModule: true }, "next/navigation": { usePathname: () => pathname,
      useSearchParams: () => params, useRouter: () => ({ push: blocked, refresh: blocked }), notFound: blocked },
    "@/lib/utils": utils, "@/lib/product-content": productContent, "@/lib/product-media": media,
    "@/lib/i18n": { translations },
    "@/lib/product-variants": variants, "@/lib/category-name": categoryNames, "@/lib/site-content": content,
    "@/store/lang-store": language, "@/store/cart-store": { useCartStore: (selector?: (s: typeof cartState) => unknown) => {
      const state = { ...cartState, isOpen: cartOpen }; return selector ? selector(state) : state;
    } },
    "framer-motion": { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => children },
    sonner: { toast: { error: blocked, success: blocked, message: blocked } },
  };
  // Component signatures vary; bindings are checked by the fail-closed loader.
  function load(file: string, bindings: Record<string, unknown> = {}): Record<string, React.ElementType> {
    return sourceModule(file, { ...common, ...bindings });
  }
  const button = load("src/components/ui/button.tsx");
  const categoryNav = load("src/components/layout/category-nav.tsx");
  const langSwitcher = load("src/components/layout/lang-switcher.tsx");
  const header = load("src/components/layout/header.tsx", { "@/components/layout/category-nav": categoryNav, "@/components/layout/lang-switcher": langSwitcher });
  const footer = load("src/components/layout/footer.tsx", { "@/components/layout/social-icon": load("src/components/layout/social-icon.tsx") });
  const card = load("src/components/product/product-card.tsx");
  const search = load("src/components/catalog/product-search-input.tsx", {
    react: { ...React, useState: (initial: unknown) => React.useState(initial === false ? true : initial === "" ? "toy" : initial === null
      ? { key: `${locale}:toy`, products: products.map((p) => ({ ...p, name: locale === "en" ? p.nameEn : p.name })) } : initial) },
  });
  const filters = load("src/components/catalog/catalog-filters.tsx", { "@/components/catalog/product-search-input": search });
  const gallery = load("src/components/product/product-gallery.tsx");
  const options = load("src/components/product/product-options.tsx", { "@/components/ui/button": button,
    react: { ...React, useState: (initial: unknown) => React.useState(initial === null ? "small" : initial) } });
  const cartPage = load("src/app/(shop)/cart/page.tsx", { "@/components/ui/button": button });
  const drawer = load("src/components/cart/cart-drawer.tsx", { "@/components/ui/button": button });
  const checkoutForm = load("src/components/checkout/checkout-form.tsx", {
    "@/components/ui/button": button, "react-hook-form": { ...hookForm, useWatch: (args: { name: string }) =>
      args.name === "deliveryType" ? delivery : args.name === "npCityRef" ? "fixture-city" : "cash_on_delivery" },
    "@hookform/resolvers/zod": resolvers, "@/lib/validations/checkout": validation,
    "@/lib/actions/create-order": { createOrder: blocked }, "./use-np-lookups": {
      useCitySearch: () => ({ cities: [{ Ref: "fixture-city", Description: "Київ — Kyiv, long city description for wrapping" }], loading: false, error: false, search: blocked, clear: blocked }),
      useWarehouses: () => ({ warehouses: [{ Ref: "fixture-branch", Number: "12345", Description: "Відділення — warehouse with a long address to verify wrapping" }], loading: false, error: false, search: blocked, clear: blocked }),
    },
  });
  const checkoutPage = load("src/components/checkout/checkout-page.tsx", { "@/components/ui/button": button,
    "@/components/checkout/checkout-form": checkoutForm, react: { ...React, useState: () => React.useState(true) } });
  const productGrid = load("src/components/catalog/product-grid.tsx", { "@/components/product/product-card": card });
  const animated = load("src/components/shared/animated-section.tsx");
  const related = load("src/components/product/related-products.tsx", { "@/components/catalog/product-grid": productGrid, "@/components/shared/animated-section": animated });
  const serverBindings = {
    "@/lib/i18n-server": { getLocale: async () => locale, getT: async () => language.createLangStore(locale).getState().t },
    "@/lib/categories": { getCategoryTree: async () => categories }, "@/lib/hero-assets": { heroAssets },
    "@/lib/site-settings": { getStorefrontContent: async () => ({}) },
  };
  const hero = load("src/components/home/hero.tsx", { ...serverBindings, "@/components/home/hero-doodle": load("src/components/home/hero-doodle.tsx"),
    "@/components/home/hero-image": load("src/components/home/hero-image.tsx"), "@/components/layout/category-nav": categoryNav });
  const featured = load("src/components/home/featured-products.tsx", { ...serverBindings, "@/components/catalog/product-search-input": search, "@/components/product/product-card": card });
  const benefits = load("src/components/home/benefits.tsx", serverBindings);
  const productPage = load("src/app/(shop)/product/[slug]/page.tsx", { ...serverBindings,
    "@/lib/prisma": { prisma: { product: { findFirst: async () => ({ ...products[stressProduct ? 0 : 1], description: "Long description / Довгий опис ".repeat(8), category: categories[0],
      images: Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, url: products[0].image })),
      options: [{ name: "Size", values: sizes.map((s) => ({ id: s.id, value: s.labelUa, valueEn: s.labelEn, price: s.price, note: s.noteUa, noteEn: s.noteEn })) }],
      attributes: [{ id: "a", key: "Довгахарактеристикабезпробілів", value: "Verylongunbrokencharacteristicvalue" }] }), findMany: async () => products.map((p) => ({ ...p, images: [{ url: p.image }], options: [] })) } } },
    "@/lib/i18n": { translations: { ua: language.createLangStore("ua").getState().t, en: language.createLangStore("en").getState().t } },
    "@/components/product/product-gallery": gallery, "@/components/product/product-options": options,
    "@/components/product/related-products": related, "@/components/shared/animated-section": animated,
  });
  const asyncComponent = async (component: React.ElementType, props: object = {}) =>
    await (component as (props: object) => Promise<React.ReactNode>)(props);

  const pages = new Map<string, string>();
  for (locale of ["ua", "en"] as const) {
    const t = language.createLangStore(locale).getState().t;
    for (const page of ["home", "catalog", "product", "product-long", "cart", "drawer", "checkout", "locker", "courier"]) {
      pathname = page === "home" ? "/" : `/${page}`; cartOpen = page === "drawer";
      delivery = page === "courier" ? "np_courier" : page === "locker" ? "np_parcel_locker" : "np_warehouse";
      params = new URLSearchParams("category=child-0&q=toy");
      stressProduct = page === "product-long";
      let body: React.ReactNode;
      if (page === "home") body = h(React.Fragment, null, await asyncComponent(hero.Hero), await asyncComponent(featured.FeaturedProducts, { products }), await asyncComponent(benefits.Benefits));
      else if (page === "catalog") body = h("section", { className: "sf-shell sf-home-panel sf-catalog" },
        h(filters.CatalogFilters, { categories }), h("div", { className: "sf-product-grid" }, products.map((p) => h(card.ProductCard, { ...p, key: p.id }))));
      else if (page.startsWith("product")) body = await asyncComponent(productPage.default, { params: Promise.resolve({ slug: "fixture" }) });
      else if (["checkout", "locker", "courier"].includes(page)) body = h(checkoutPage.CheckoutPageContent, { onlineCardEnabled: true });
      else body = h(cartPage.default);
      pages.set(`/${locale}/${page}`, renderToStaticMarkup(h(language.LangStoreContext.Provider, { value: language.createLangStore(locale) },
        h("div", { className: "storefront", style: { "--font-body": "Comfortaa, system-ui", "--font-display": "Comfortaa, system-ui" } as React.CSSProperties },
          h(header.Header, { categories }), h("main", { id: "main-content" }, body), h(footer.Footer, { categories, content: { social_instagram: "https://example.com" } }), h(drawer.CartDrawer)))));
      assert.ok(t.nav.categories);
    }
  }
  const cssPath = "src/app/(shop)/storefront.css";
  const globals = (await postcss([tailwindcss(tailwindConfig)]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css;
  const styles = { current: globals + readFileSync(cssPath, "utf8"), accepted: globals + execFileSync("git", ["show", `d8cc9215cbf9862d1b5398c81daccb3880a60096:${cssPath}`], { encoding: "utf8" }) };
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(styles[url.searchParams.get("version") === "accepted" ? "accepted" : "current"]); }
    else if (pages.has(url.pathname)) {
      // Accepted markup did not contain the new mobile selector (hidden on current desktop).
      const markup = url.searchParams.get("version") === "accepted"
        ? pages.get(url.pathname)!.replace(/<label class="sf-mobile-category-filter sf-sort">[\s\S]*?<\/label>/, "") : pages.get(url.pathname);
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css?version=${url.searchParams.get("version") || "current"}"><body>${markup}</body></html>`);
    }
    else {
      const path = resolve("public", `.${url.pathname}`);
      if (!path.startsWith(resolve("public") + "/") && !path.startsWith(resolve("public") + "\\")) { response.writeHead(403); response.end(); return; }
      try {
        const type = path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".webp") ? "image/webp" : path.endsWith(".png") ? "image/png" : "font/ttf";
        response.setHeader("Content-Type", type); response.end(readFileSync(path));
      } catch { response.writeHead(404); response.end(); }
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as { port: number };
  const executable = process.argv[2] || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const profile = resolve(output, `edge-${Date.now()}`);
  const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket: WebSocket | undefined;
  try {
    let port = "";
    for (let attempt = 0; attempt < 100; attempt++) {
      try { port = readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; break; } catch { await pause(100); }
    }
    assert.ok(port, "Edge debugging port did not become available.");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    socket = new WebSocket(targets.find((target) => target.type === "page")!.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => { socket!.onopen = () => done(); socket!.onerror = reject; });
    let id = 0;
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: unknown) => void }>();
    socket.onmessage = ({ data }) => { const msg = JSON.parse(String(data)); const task = pending.get(msg.id); if (task) { pending.delete(msg.id); if (msg.error) task.reject(msg.error); else task.resolve(msg.result); } };
    const send = (method: string, params: object = {}) => new Promise<Record<string, unknown>>((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket!.send(JSON.stringify({ id: next, method, params })); });
    await send("Page.enable");
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["https://*", "http://example.com/*"] });
    const evaluate = async (expression: string) => {
      const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!value.exceptionDetails, JSON.stringify(value.exceptionDetails));
      return (value.result as { value: unknown }).value;
    };
    const navigate = async (path: string) => {
      await send("Page.navigate", { url: `http://127.0.0.1:${address.port}${path}` });
      let loaded = false;
      for (let i = 0; i < 60; i++) { if (await evaluate(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('.storefront')`)) { loaded = true; break; } await pause(50); }
      assert.ok(loaded, `Fixture did not finish loading: ${path}`);
      await evaluate("document.fonts.ready.then(() => true)");
    };
    const screenshot = async () => {
      const { cssContentSize } = await send("Page.getLayoutMetrics") as { cssContentSize: { width: number; height: number } };
      return (await send("Page.captureScreenshot", { captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } })).data as string;
    };
    const results: object[] = [];
    for (const [width, height] of [[320, 740], [360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [980, 800], [981, 800], [1024, 768], [1280, 900], [1440, 900], [740, 360]]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const key of pages.keys()) {
        await navigate(key);
        const measure = await evaluate(`(() => {
          const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
          const overflow = [...document.querySelectorAll('body *')].filter(el => visible(el) && !el.closest('.sf-skip, .sr-only') && !(innerWidth > 1024 && el.closest('.sf-categories--home')) && (() => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; })()).map(el => el.tagName + '.' + el.className).slice(0, 8);
          return { bodyWidth: document.documentElement.scrollWidth, overflow,
            columns: [...document.querySelectorAll('.sf-product-grid')].map(el => getComputedStyle(el).gridTemplateColumns.split(' ').length),
            categoryOverflow: [...document.querySelectorAll('.sf-categories--home')].some(el => el.scrollWidth > el.clientWidth + 1) };
        })()`) as { bodyWidth: number; overflow: string[]; columns: number[]; categoryOverflow: boolean };
        assert.ok(measure.bodyWidth <= width && !measure.overflow.length, `${key} ${width}x${height}: ${JSON.stringify(measure)}`);
        if (width <= 1024) assert.ok(!measure.categoryOverflow, `${key}: categories require horizontal scroll`);
        assert.ok(measure.columns.every((count) => count === (width <= 980 ? 2 : 4)), `${key}: wrong grid at ${width}`);
        if (key.endsWith("catalog")) {
          assert.equal(await evaluate("(() => { const select = document.querySelector('.sf-mobile-category-filter select'); return select.value === 'child-0' && [...select.options].some(option => option.value === 'category-0'); })()"), true, `Child and parent must be distinct selector options at ${width}`);
        }
        if (width <= 680 && !key.endsWith("home")) {
          assert.equal(await evaluate("Math.abs(document.querySelector('.sf-header .sf-brand').getBoundingClientRect().top - document.querySelector('.sf-controls').getBoundingClientRect().top) < 8"), true, `Header wraps at ${width}`);
        }
        if (width === 320 || width === 1280) {
          writeFileSync(resolve(output, `${key.slice(1).replaceAll("/", "-")}-${width}.png`), Buffer.from(await screenshot(), "base64"));
        }
        if (width <= 680 && !key.endsWith("home")) {
          await evaluate("document.querySelector('.sf-mobile-menu').setAttribute('aria-expanded', 'true'); document.querySelector('header').insertAdjacentHTML('beforeend', '<nav class=\"sf-mobile-links\">' + document.querySelector('.sf-footer nav').innerHTML.repeat(4) + '</nav>')");
          assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('.sf-mobile-links').getBoundingClientRect().bottom <= innerHeight"), true, `Menu exceeds ${width}x${height}`);
        }
        results.push({ page: key, width, height, ...measure });
      }
    }
    // Exact screenshot comparison using accepted/current CSS on identical component markup.
    for (const width of [1280, 1440]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const key of pages.keys()) {
        if (key.endsWith("product-long")) continue; // This demonstrated desktop overflow defect is intentionally corrected.
        await navigate(key); const current = await screenshot();
        await navigate(`${key}?version=accepted`); const accepted = await screenshot();
        if (current !== accepted) {
          const name = `${key.slice(1).replaceAll("/", "-")}-${width}`;
          writeFileSync(resolve(output, `${name}-current.png`), Buffer.from(current, "base64"));
          writeFileSync(resolve(output, `${name}-accepted.png`), Buffer.from(accepted, "base64"));
        }
        assert.ok(current === accepted, `Desktop CSS changed ${key} at ${width}; comparison PNGs saved.`);
      }
    }
    writeFileSync(resolve(output, "results.json"), JSON.stringify(results, null, 2));
    console.log(`PASS ${results.length} viewport renders; UA/EN; home/catalog/product/cart/drawer/checkout/locker/courier; no horizontal overflow; 2/4 product columns; wrapped home categories; bounded mobile menu. Desktop CSS screenshots identical at 1280/1440. Artifacts: ${output}`);
    console.log("Isolated SSR fixtures: interactions covered by existing UI scripts; native keyboards, touch, and live carrier data still need device review.");
  } finally {
    socket?.close(); browser.kill(); server.closeAllConnections(); server.close();
  }
}
void verify().catch((error) => { console.error(error); process.exitCode = 1; });
