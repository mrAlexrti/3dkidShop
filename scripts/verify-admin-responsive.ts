// Actual Admin pages with in-memory data, plus a hydrated sidebar in installed Edge.
// Run: npx tsx scripts/verify-admin-responsive.ts [absolute Edge/Chromium path] [--desktop-only]
// No env loading, database, API calls, notifications, or dependency installation.
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
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import sharp from "sharp";
import tailwindConfig from "../tailwind.config";
import * as utils from "../src/lib/utils";
import * as language from "../src/store/lang-store";
import { translations } from "../src/lib/i18n";
import * as variants from "../src/lib/product-variants";
import * as media from "../src/lib/product-media";
import * as status from "../src/lib/status";
import * as orderStatus from "../src/lib/order-status";
import * as fonts from "../src/lib/fonts";
import * as events from "../src/lib/notifications/events";
import * as reference from "../src/lib/order-reference";
import * as acceptance from "../src/lib/payments/acceptance";
import * as attemptDiagnostics from "../src/lib/payments/attempt-diagnostics";
import { heroAssets } from "../src/lib/hero-assets";
import { sourceModule } from "./source-module";

async function verify() {
  const accepted = "9741b1107e75350f82065d33777d71b16d9f66ba";
  const output = resolve(".next/cache/admin-responsive-qa");
  mkdirSync(output, { recursive: true });
  const h = React.createElement;
  const blocked = () => { throw new Error("SIDE_EFFECT_BLOCKED"); };
  let locale: "ua" | "en" = "ua";
  let pathname = "/admin";
  const category = { id: "c1", name: "Декор та аксесуари", nameEn: "Decor and accessories", slug: "decor", parentId: null,
    imageUrl: null, description: "Category description", order: 0, children: [], parent: null, _count: { products: 1 } };
  const product = { id: "p1", name: "Дракон з рухливими крилами", nameEn: "Dragon with moving wings", slug: "dragon", description: "Description", descriptionEn: "English description",
    price: 1234, oldPrice: 1500, isOrderable: true, categoryId: category.id, category, isActive: true, isNew: true, isFeatured: true,
    images: [{ id: "i1", url: "/images/placeholder.svg", order: 0 }], hoverGifUrl: null,
    options: [{ name: "Size", values: [{ id: "s1", value: "Компактний розмір з довгою назвою", valueEn: "Compact size with a long name", price: 1234, note: "Примітка", noteEn: "Note" }] }] };
  const order = { id: "o1", number: "3DK-12345678", status: "PROCESSING", paymentStatus: "PENDING", paymentProvider: null, paidAt: null,
    createdAt: new Date("2026-01-01T12:00:00Z"), customerName: "Покупець з довгим ім’ям", customerPhone: "+380000000000", customerEmail: "customer@example.invalid",
    shippingAddress: "Відділення 123, довга назва вулиці та адреса", city: "Київ", postalCode: "01001", paymentMethod: "cash_on_delivery", comment: "Коментар покупця",
    subtotal: 2468, shippingCost: 0, total: 2468, deliveryMethod: "np_warehouse", novaPoshtaCity: "Київ", novaPoshtaCityRef: "fixture-city-ref", novaPoshtaBranchRef: "fixture-branch-ref",
    novaPoshtaBranch: "Відділення з довгою назвою та адресою", novaPoshtaTtn: "00000000000000", novaPoshtaStatus: "ready for pickup", novaPoshtaStatusCode: "7", novaPoshtaCodStatus: "not paid",
    novaPoshtaCodAmount: 2468, novaPoshtaCreatedAt: null, novaPoshtaDeliveredAt: null, novaPoshtaSyncedAt: null, novaPoshtaError: "Fixture diagnostic",
    items: [{ id: "item1", productName: product.name, quantity: 2, price: 1234, optionsJson: JSON.stringify({ Size: "Довга назва розміру / Long size name" }) }] };
  const stressOrder = { ...order, number: "3DK-" + "1234567890".repeat(8), customerEmail: "customer".repeat(18) + "@example.invalid",
    shippingAddress: "ДужеДовгаАдресаБезПробілів".repeat(10), novaPoshtaCityRef: "city-ref".repeat(30), novaPoshtaBranchRef: "branch-ref".repeat(30),
    novaPoshtaTtn: "0".repeat(120), novaPoshtaStatus: "UNKNOWN_DIAGNOSTIC".repeat(20), novaPoshtaStatusCode: "CODE".repeat(30),
    novaPoshtaCodStatus: "UNKNOWN_COD".repeat(20), novaPoshtaError: "ERROR_WITHOUT_SPACES".repeat(20) };
  let detailOrder = order;
  const common = {
    "@/lib/payments/attempt-diagnostics": attemptDiagnostics,
    "@/lib/admin/payment-attempts": { listPaymentAttempts: async () => ({ filters: attemptDiagnostics.parseAttemptFilters({}), page: 1, pages: 3, total: 61, attempts: [
      { id: "qa-attempt-".repeat(4), createdAt: new Date("2026-11-14T12:00:00Z"), customerName: order.customerName, amount: "1234.00", currency: "UAH", provider: "mono", state: "unknown", review: true, reference: "pay_" + "a".repeat(96), invoiceId: "invoice_".repeat(15), expiresAt: null, modifiedAt: new Date("2026-11-14"), nextCheckAt: null, reason: "INVOICE_CREATE_UNCERTAIN" },
      { id: "qa-paid-review", createdAt: new Date("2026-11-14"), customerName: "QA", amount: "199.00", currency: "UAH", provider: "mono", state: "paid_unaccepted", review: true, reference: "pay_qa", invoiceId: "invoice_qa", expiresAt: null, modifiedAt: null, nextCheckAt: null, reason: "LATE_PAYMENT_REVIEW" },
    ] }) },
    "@/lib/payments/acceptance": acceptance,
    "@/lib/order-reference": reference,
    react: React, "react/jsx-runtime": jsxRuntime, "lucide-react": icons, "@/lib/utils": utils,
    "next/link": { default: (props: object) => h("a", props), __esModule: true },
    "next/image": { default: ({ fill, ...props }: Record<string, unknown>) => { delete props.unoptimized;
      return h("img", { ...props, ...(fill ? { style: { position: "absolute", inset: 0, width: "100%", height: "100%" } } : {}) }); }, __esModule: true },
    "next/navigation": { usePathname: () => pathname, useRouter: () => ({ push: blocked, refresh: blocked }), notFound: blocked },
    "next-auth/react": { signOut: blocked }, sonner: { toast: { success: blocked, error: blocked } },
    "@/store/lang-store": language, "@/lib/i18n": { translations }, "@/lib/product-variants": variants, "@/lib/product-media": media,
    "@/lib/status": status, "@/lib/order-status": orderStatus, "@/lib/fonts": fonts, "@/lib/hero-assets": { heroAssets },
    "@/lib/i18n-server": { getT: async () => translations[locale], getLocale: async () => locale },
    "@/lib/server-env": { isTestModeEnabled: () => true }, "./admin.css": {},
    "@/lib/site-settings": { SITE_FONT_KEY: "site_font" }, "@/lib/categories": { getCategoryTree: async () => [category] },
    "@/lib/notifications/events": events, "@/lib/notifications/settings": { getNotificationSettings: async () => events.defaultNotificationSettings() },
    "@/lib/actions/categories": { createCategory: blocked, updateCategory: blocked, deleteCategory: blocked, updateSiteContent: blocked },
    "@/lib/actions/products": { createProduct: blocked, updateProduct: blocked, deleteProduct: blocked },
    "@/lib/actions/orders": { updateOrderStatus: blocked, takeOrderIntoWorkAction: blocked }, "@/lib/actions/notification-settings": { updateNotificationSettings: blocked },
    "@/lib/prisma": { prisma: {
      product: { count: async () => 1, findMany: async () => [product], findUnique: async () => product },
      category: { count: async () => 1, findMany: async () => [category], findUnique: async () => category },
      order: { count: async () => 1, findMany: async () => [order], findUnique: async () => detailOrder, aggregate: async () => ({ _sum: { total: 2468 } }) },
      siteContent: { findMany: async () => [] },
    } },
  };
  type Components = Record<string, React.ElementType>;
  const pages = new Map<string, string>();
  const acceptedSources: string[] = [];
  const pageFiles = { dashboard: "page.tsx", products: "products/page.tsx", categories: "categories/page.tsx", orders: "orders/page.tsx", "payment-attempts": "payment-attempts/page.tsx",
    detail: "orders/[id]/page.tsx", "product-new": "products/new/page.tsx", "product-edit": "products/[id]/edit/page.tsx",
    "category-edit": "categories/[id]/edit/page.tsx", content: "content/page.tsx" };
  for (const version of ["current", "accepted"] as const) {
    const bindings: Record<string, unknown> = { ...common };
    const load = (file: string): Components => {
      let source = file;
      if (version === "accepted") {
        source = resolve(output, "accepted", file);
        mkdirSync(resolve(source, ".."), { recursive: true });
        let baseline = execFileSync("git", ["show", `${accepted}:${file}`], { encoding: "utf8" });
        if (file.endsWith("admin/admin-sidebar.tsx")) {
          // Normalize only the intentionally added diagnostics navigation entry.
          baseline = 'import { CreditCard } from "lucide-react";\n' + baseline.replace(
            '{ href: "/admin/orders", label: t.admin.nav.orders, icon: ShoppingCart },',
            '{ href: "/admin/orders", label: t.admin.nav.orders, icon: ShoppingCart },\n    { href: "/admin/payment-attempts", label: t.admin.nav.paymentAttempts, icon: CreditCard },');
        }
        // Apply only the approved availability control/data replacement to old
        // markup. Keep all other historical geometry/CSS comparisons strict.
        if (file.endsWith("admin/product-form.tsx")) {
          const control = readFileSync(file, "utf8").match(/<label className="flex min-h-11[\s\S]*?<\/label>/)?.[0];
          assert.ok(control);
          baseline = baseline.replace("stock?: number;", "isOrderable?: boolean;").replace(/<label[^>]*>\{tp.stock\}<\/label>\s*<input name="stock"[^\n]*\/>/, control);
          assert.ok(!baseline.includes('name="stock"'));
        }
        if (file.endsWith("admin/products/page.tsx")) baseline = baseline.replace("{tl.thStock}", "{t.admin.product.isOrderable}").replace("{p.stock}", "{p.isOrderable ? tl.orderable : tl.unavailable}");
        if (file.endsWith("admin/products/[id]/edit/page.tsx")) baseline = baseline.replace("stock: product.stock,", "isOrderable: product.isOrderable,");
        if (file.endsWith("admin/orders/[id]/page.tsx")) {
          // Normalize only the deliberately added quick action, not page geometry.
          baseline = 'import { TakeOrderIntoWorkButton } from "@/components/admin/take-order-into-work-button";\n' + baseline.replace('<OrderStatusSelect orderId={order.id} status={order.status} />', '<div className="flex flex-wrap items-center gap-3"><TakeOrderIntoWorkButton orderId={order.id} status={order.status} /><OrderStatusSelect orderId={order.id} status={order.status} /></div>');
          baseline = 'import { formatOrderReference } from "@/lib/order-reference";\n' + baseline.replace('Замовлення {order.number}', '{formatOrderReference(order.number, locale)}');
        }
        if (file === "src/app/admin/page.tsx" || file === "src/app/admin/orders/page.tsx") baseline = 'import { formatOrderReference } from "@/lib/order-reference";\n' + baseline.replaceAll('{o.number}', '{formatOrderReference(o.number, locale)}');
        writeFileSync(source, baseline);
        acceptedSources.push(readFileSync(source, "utf8"));
      }
      return sourceModule(source, bindings);
    };
    for (const name of ["ui/button", "layout/lang-switcher", "category/category-image", "admin/media-url-field", "admin/size-editor", "admin/product-form",
      "admin/category-form", "admin/delete-button", "admin/order-status-summary", "admin/order-status-select", "admin/create-ttn-button", "admin/admin-sidebar"]) {
      bindings[`@/components/${name}`] = load(`src/components/${name}.tsx`);
    }
    // New component has no historical source; share it across both render sets.
    bindings["@/components/admin/take-order-into-work-button"] = sourceModule("src/components/admin/take-order-into-work-button.tsx", bindings);
    const Sidebar = (bindings["@/components/admin/admin-sidebar"] as Components).AdminSidebar;
    bindings["@/components/admin/admin-sidebar"] = { AdminSidebar: () => h("div", { id: "qa-sidebar", className: "contents" }, h(Sidebar)) };
    const Layout = load("src/app/admin/layout.tsx").default as (props: object) => Promise<React.ReactElement>;
    for (locale of ["ua", "en"] as const) {
      for (const [key, file] of Object.entries(pageFiles)) {
        if (version === "accepted" && key === "payment-attempts") continue; // New page has no historical screenshot oracle.
        pathname = key === "dashboard" ? "/admin" : `/admin/${key.startsWith("product-") ? "products" : key === "category-edit" ? "categories" : key === "detail" ? "orders/o1" : key}`;
        const Page = load(`src/app/admin/${file}`).default as (props: object) => Promise<React.ReactElement>;
        const cases = key === "detail" ? [key, "detail-long", "detail-create-ttn", "detail-new"] : [key];
        for (const name of cases) {
          detailOrder = name === "detail-long" ? stressOrder : name === "detail-new" ? { ...order, status: "PENDING" } : name === "detail-create-ttn" ? { ...order, novaPoshtaTtn: null } as unknown as typeof order : order;
          const body = await Page({ params: Promise.resolve({ id: "fixture" }), searchParams: Promise.resolve({}) });
          pages.set(`/${version}/${locale}/${name}`, renderToStaticMarkup(h(language.LangStoreContext.Provider,
            { value: language.createLangStore(locale) }, await Layout({ children: body }))));
        }
      }
    }
  }
  // Include accepted utilities too: classes replaced by responsive variants must
  // still exist when rendering the original desktop markup (e.g. w-64/h-screen).
  const globals = (await postcss([tailwindcss({ ...tailwindConfig, content: ["./src/**/*.{js,ts,jsx,tsx,mdx}",
    { raw: acceptedSources.join("\n"), extension: "tsx" }] })]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css;
  const css = globals + readFileSync("src/app/admin/admin.css", "utf8");
  // Hydrate the real sidebar only. Server-rendered page forms cannot invoke actions.
  const bundle = await build({ bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import {hydrateRoot} from 'react-dom/client';
      import {AdminSidebar} from './src/components/admin/admin-sidebar';
      import {LangStoreContext,createLangStore} from './src/store/lang-store';
      const locale = document.documentElement.lang === 'en' ? 'en' : 'ua';
      function Ready(){React.useEffect(()=>{window.__qaReady=true;},[]);return <AdminSidebar/>;}
      hydrateRoot(document.getElementById('qa-sidebar'), <LangStoreContext.Provider value={createLangStore(locale)}><Ready/></LangStoreContext.Provider>);` },
    plugins: [{ name: "isolated-browser-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(next\/link|next\/navigation|next-auth\/react)$/ }, (args) => ({ path: args.path, namespace: "qa" }));
      builder.onLoad({ filter: /.*/, namespace: "qa" }, (args) => ({ loader: "jsx", resolveDir: process.cwd(), contents:
        args.path === "next/link" ? "import React from 'react'; export default function Link(props){return <a {...props}/>;}" :
        args.path === "next/navigation" ? "export const usePathname=()=>{if(location.pathname.startsWith('/admin'))return location.pathname; const key=location.pathname.split('/')[3]; return key==='dashboard'?'/admin':'/admin/'+(key.startsWith('product-')?'products':key==='category-edit'?'categories':key.startsWith('detail')?'orders/o1':key);}; export const useRouter=()=>({refresh(){window.__refreshes=(window.__refreshes||0)+1;}});" :
        "export function signOut(){window.__logoutBlocked=true;}" }));
    } }],
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    if (url.pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(url.searchParams.has("accepted") ? globals : css); return; }
    if (url.pathname === "/sidebar.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    if (url.pathname === "/images/placeholder.svg") { response.setHeader("Content-Type", "image/svg+xml"); response.end(readFileSync("public/images/placeholder.svg")); return; }
    let key = url.pathname;
    if (key.startsWith("/admin")) {
      const lang = request.headers.cookie?.includes("locale=en") ? "en" : "ua";
      key = `/current/${lang}/${key === "/admin" ? "dashboard" : key.slice(7)}`;
    }
    const html = pages.get(key);
    if (!html) { response.writeHead(404); response.end(); return; }
    const baseline = key.startsWith("/accepted");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="${key.includes("/en/") ? "en" : "uk"}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css${baseline ? "?accepted" : ""}"><body>${html}${baseline ? "" : '<script src="/sidebar.js"></script>'}</body></html>`);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as { port: number };
  const browser = spawn(process.argv.slice(2).find((arg) => arg !== "--desktop-only") || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${resolve(output, `edge-${Date.now()}`)}`, "about:blank"],
    { windowsHide: true, stdio: "ignore" });
  let socket: WebSocket | undefined;
  try {
    let port = "";
    const profile = browser.spawnargs.find((arg) => arg.startsWith("--user-data-dir="))!.slice(16);
    for (let i = 0; i < 100; i++) { try { port = readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; break; } catch { await pause(100); } }
    assert.ok(port, "Browser debug port unavailable");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    socket = new WebSocket(targets.find((target) => target.type === "page")!.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => { socket!.onopen = () => done(); socket!.onerror = reject; });
    let id = 0;
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: unknown) => void }>();
    socket.onmessage = ({ data }) => { const msg = JSON.parse(String(data)); const task = pending.get(msg.id); if (task) { pending.delete(msg.id); if (msg.error) task.reject(msg.error); else task.resolve(msg.result); } };
    const send = (method: string, params: object = {}) => new Promise<Record<string, unknown>>((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket!.send(JSON.stringify({ id: next, method, params })); });
    await send("Page.enable"); await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["https://*", "http://example.com/*"] });
    const evaluate = async (expression: string) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return (result.result as { value: unknown }).value;
    };
    const settle = () => pause(60);
    const navigate = async (path: string) => {
      await send("Page.navigate", { url: `http://127.0.0.1:${address.port}${path}` });
      let loaded = false;
      for (let i = 0; i < 100; i++) { if (await evaluate(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !!document.querySelector('#qa-sidebar') && (${path.startsWith("/accepted") ? "true" : "window.__qaReady"})`)) { loaded = true; break; } await pause(30); }
      assert.ok(loaded, `Fixture did not load: ${path}`); await settle();
    };
    const screenshot = async (name: string) => {
      await evaluate("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))");
      const { cssContentSize } = await send("Page.getLayoutMetrics") as { cssContentSize: { width: number; height: number } };
      const result = await send("Page.captureScreenshot", { captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } });
      writeFileSync(resolve(output, `${name}.png`), Buffer.from(result.data as string, "base64"));
      return result.data;
    };
    const results: object[] = [];
    const desktopResults: object[] = [];
    for (const [width, height] of [[320, 740], [360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [1023, 800], [1024, 768], [1280, 900], [1440, 900], [740, 320]]) {
      if (process.argv.includes("--desktop-only")) break;
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const key of pages.keys()) {
        if (!key.startsWith("/current/")) continue;
        await navigate(key);
        // Expand diagnostics so long carrier values are measured as well.
        await evaluate("document.querySelectorAll('details').forEach(el=>el.open=true)");
        const measure = await evaluate(`(() => {
          const content = document.querySelector('#admin-content').getBoundingClientRect();
          const sidebar = document.querySelector('aside');
          const tables = [...document.querySelectorAll('table')].map(el=>({width:el.offsetWidth,container:el.parentElement.clientWidth,overflow:getComputedStyle(el.parentElement).overflowX}));
          const overflow = [...document.querySelectorAll('#admin-content *')].filter(el=>el.getClientRects().length && !el.closest('[role=region]') && el.getBoundingClientRect().right > innerWidth+1).map(el=>el.tagName+'.'+el.className).slice(0,8);
          return {bodyWidth:document.documentElement.scrollWidth,contentLeft:content.left,sidebarVisible:!!sidebar.getClientRects().length,tables,overflow};
        })()`) as { bodyWidth: number; contentLeft: number; sidebarVisible: boolean; tables: { width: number; container: number; overflow: string }[]; overflow: string[] };
        assert.ok(measure.bodyWidth <= width && !measure.overflow.length, `${key} ${width}: ${JSON.stringify(measure)}`);
        assert.equal(measure.sidebarVisible, width >= 1024, `${key}: sidebar at ${width}`);
        assert.equal(measure.contentLeft, width >= 1024 ? 256 : 0, `${key}: reserved sidebar space`);
        for (const table of measure.tables) {
          assert.equal(table.overflow, "auto");
          if (width <= 430) assert.ok(table.width > table.container, `${key}: table columns crushed`);
        }
        if (width === 320 || width === 1280) await screenshot(key.slice(1).replaceAll("/", "-") + `-${width}`);
        results.push({ page: key, width, height, ...measure });
      }
      console.log(`PASS Admin layout ${width}x${height}: UA/EN, all pages and long diagnostics.`);
      if (width >= 1024) continue;
      await navigate("/current/ua/dashboard");
      const open = async () => { await evaluate("document.querySelector('header button').click()"); await settle(); };
      const closed = async () => {
        await settle();
        assert.equal(await evaluate("!document.querySelector('[role=dialog]') && document.querySelector('header button').getAttribute('aria-expanded')==='false' && !document.querySelector('#admin-content').inert && document.body.style.position!== 'fixed' && document.activeElement === document.querySelector('header button')"), true);
      };
      await open();
      assert.equal(await evaluate("document.querySelector('header button').getAttribute('aria-expanded')==='true' && document.querySelector('[role=dialog]').getAttribute('aria-modal')==='true' && document.querySelector('#admin-content').inert && document.body.style.position==='fixed' && document.activeElement === document.querySelector('aside button')"), true);
      assert.equal(await evaluate("(() => {const el=document.querySelector('aside'),r=el.getBoundingClientRect();return r.width<=innerWidth-16 && r.right<=innerWidth && r.bottom<=innerHeight+1 && getComputedStyle(el).overflowY==='auto' && document.documentElement.scrollWidth<=innerWidth;})()"), true);
      assert.equal(await evaluate("[...document.querySelectorAll('aside button,aside nav a')].every(el=>el.getBoundingClientRect().height>=44)"), true);
      await screenshot(`drawer-${width}x${height}`);
      await evaluate("document.querySelector('aside > button:last-child').focus()");
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate("document.activeElement===document.querySelector('aside button')"), true, "Forward focus trap");
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", modifiers: 8, windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate("document.activeElement===document.querySelector('aside > button:last-child')"), true, "Reverse focus trap");
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await closed();
      await open(); await evaluate("document.querySelector('aside button').click()"); await closed();
      await open(); await evaluate("document.querySelector('.fixed.inset-0').click()"); await closed();
      await open();
      await evaluate("[...document.querySelectorAll('aside [role=group] button')].find(el=>el.textContent==='EN').click()"); await settle();
      assert.equal(await evaluate(`document.querySelector('aside a[href="/admin/products"]').textContent.includes('Products') && document.querySelector('aside [aria-pressed=true]').textContent==='EN' && document.cookie.includes('locale=en') && window.__refreshes===1`), true);
      // Stop the default navigation once to verify that link selection closes the drawer.
      await evaluate(`document.querySelector('aside a[href="/admin/products"]').addEventListener('click',event=>event.preventDefault()); document.querySelector('aside a[href="/admin/products"]').click()`); await closed();
      // Then allow normal local navigation, using only the fixture server.
      await open(); await evaluate(`document.querySelector('aside a[href="/admin/orders"]').click()`);
      for (let i = 0; i < 100; i++) { if (await evaluate("location.pathname==='/admin/orders' && window.__qaReady")) break; await pause(30); }
      await settle();
      assert.equal(await evaluate("location.pathname==='/admin/orders' && !!document.querySelector('table')"), true, "Navigation works");
      if (height <= 320) {
        await open();
        assert.equal(await evaluate("document.querySelector('aside').scrollHeight > document.querySelector('aside').clientHeight"), true, "Short drawer scrolls");
      }
    }
    // Compare accepted/current desktop screenshots on identical fixtures and global CSS.
    for (const width of [1280, 1440]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const key of pages.keys()) {
        if (!key.startsWith("/current/") || key.includes("detail-long") || key.includes("payment-attempts")) continue;
        const layoutMetrics = () => evaluate("[...document.querySelectorAll('aside,h1,h2,table,form,input:not([type=hidden]),select,textarea')].map(el=>{const r=el.getBoundingClientRect();return [el.tagName,r.x,r.y,r.width,r.height]})");
        await navigate(key); const currentMetrics = await layoutMetrics();
        const current = await screenshot(`desktop-${width}-${key.slice(1).replaceAll("/", "-")}`);
        await navigate(key.replace("/current/", "/accepted/")); const baselineMetrics = await layoutMetrics();
        const baseline = await screenshot(`desktop-${width}-${key.slice(1).replaceAll("/", "-")}-accepted`);
        assert.deepEqual(currentMetrics, baselineMetrics, `Desktop geometry changed: ${key} at ${width}`);
        let changedPixels = 0;
        let totalPixels = 1;
        if (current !== baseline) {
          // Chromium can rasterize a flex heading fractionally differently even
          // with identical element geometry. Keep a strict 0.1% image ceiling.
          const [a, b] = await Promise.all([current, baseline].map((data) => sharp(Buffer.from(data as string, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
          assert.deepEqual(a.info, b.info, `Desktop image dimensions changed: ${key}`);
          totalPixels = a.info.width * a.info.height;
          for (let i = 0; i < a.data.length; i += 4) if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) changedPixels++;
          assert.ok(changedPixels / totalPixels <= 0.001, `Desktop image changed: ${key} at ${width}; ${changedPixels}/${totalPixels} pixels; comparison PNGs saved.`);
        }
        desktopResults.push({ page: key, width, identicalGeometry: true, changedPixels, changedFraction: changedPixels / totalPixels });
      }
    }
    // Resizing to desktop while open must release the body and remove modal state.
    await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 740, deviceScaleFactor: 1, mobile: false });
    await navigate("/current/ua/dashboard"); await evaluate("document.querySelector('header button').click()"); await settle();
    await send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }); await settle();
    assert.equal(await evaluate("!document.querySelector('[role=dialog]') && !document.querySelector('#admin-content').inert && document.body.style.position!== 'fixed' && !!document.querySelector('aside').getClientRects().length"), true);
    writeFileSync(resolve(output, "results.json"), JSON.stringify(results, null, 2));
    writeFileSync(resolve(output, "desktop-results.json"), JSON.stringify(desktopResults, null, 2));
    if (results.length) console.log(`PASS ${results.length} Admin viewport renders; UA/EN; five contained tables; create/edit forms, content/notifications, long diagnostics, TTN states; drawer close/Escape/backdrop/navigation, focus trap/restore, language and short-height scroll.`);
    console.log(`PASS ${desktopResults.length} desktop comparisons at 1280/1440: identical geometry; screenshot differences within 0.1% raster tolerance; drawer resize cleanup. Artifacts: ${output}`);
  } finally { socket?.close(); browser.kill(); server.closeAllConnections(); server.close(); }
}
void verify().catch((error) => { console.error(error); process.exitCode = 1; });
