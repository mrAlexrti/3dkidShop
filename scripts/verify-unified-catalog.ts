// Actual components with fail-closed, in-memory boundaries. No DB or external calls.
import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "lucide-react";
import * as utils from "../src/lib/utils";
import * as media from "../src/lib/product-media";
import * as content from "../src/lib/product-content";
import * as categoryNames from "../src/lib/category-name";
import { translations } from "../src/lib/i18n";
import { sourceModule } from "./source-module";
import type { ProductCard as Card } from "../src/components/product/product-card";
import type { CatalogFilters as Filters } from "../src/components/catalog/catalog-filters";
import type { Pagination as Pages } from "../src/components/catalog/pagination";

type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...elements(element.props.children)];
}
const Link = () => null;
const Image = () => null;
for (const locale of ["ua", "en"] as const) {
  const t = translations[locale];
  const pushes: string[] = [];
  const cart: unknown[] = [];
  const errors: string[] = [];
  let state: unknown[] = [];
  let cursor = 0;
  let animationAllowed = true;
  const { ProductCard } = sourceModule<{ ProductCard: typeof Card }>("src/components/product/product-card.tsx", {
    "react/jsx-runtime": jsxRuntime,
    react: { useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: unknown) => { state[index] = value; }];
    }, useSyncExternalStore: () => animationAllowed },
    "next/image": Image, "next/link": Link,
    "next/navigation": { useRouter: () => ({ push: (path: string) => pushes.push(path) }) },
    "lucide-react": icons, "@/lib/utils": utils, "@/lib/product-media": media,
    "@/lib/product-content": content,
    "@/store/lang-store": { useLangStore: () => ({ locale, t }) },
    "@/store/cart-store": { useCartStore: (selector: (store: unknown) => unknown) => selector({ addItem: (item: unknown) => cart.push(item) }) },
    sonner: { toast: { error: (text: string) => errors.push(text), message: () => {}, success: () => {} } },
  });
  const base = { id: "fixture", slug: "fixture", name: "Тест", nameEn: "Test", price: 123, image: "/images/placeholder.svg", stock: 3, hoverGifUrl: "https://example.invalid/hover.gif" };
  const render = (overrides = {}) => { cursor = 0; return ProductCard({ ...base, ...overrides }); };
  const nodes = (overrides = {}) => elements(render(overrides));
  const button = (overrides = {}) => nodes(overrides).find((node) => node.type === "button")!;
  const click = (overrides = {}) => (button(overrides).props.onClick as (event: unknown) => void)({ preventDefault() {} });
  assert.equal(render().type, "article");
  assert.equal(nodes().filter((node) => node.type === Link).length, 2);
  assert.ok(nodes().filter((node) => node.type === Link).every((node) => node.props.href === "/product/fixture"));
  assert.equal(nodes().some((node) => node.type === Image && node.props.src === base.hoverGifUrl), false);
  click();
  assert.equal(cart.length, 1);
  assert.equal((cart[0] as { name: string }).name, locale === "ua" ? base.name : base.nameEn);
  click({ hasOptions: true });
  assert.deepEqual(pushes, ["/product/fixture"]);
  assert.equal(cart.length, 1, "A configured size must never be silently selected.");
  assert.equal(button({ hasOptions: true }).props["aria-label"], `${t.product.chooseSize}: ${locale === "ua" ? base.name : base.nameEn}`);
  click({ stock: 0 }); click({ stock: 0, hasOptions: true });
  assert.equal(cart.length, 1); assert.equal(pushes.length, 1);
  assert.deepEqual(errors, [t.product.outOfStock, t.product.outOfStock]);
  assert.equal(button({ stock: 0 }).props["aria-disabled"], true);
  assert.ok(nodes({ hasOptions: true }).some((node) => node.type === "span" && (node.props.children as unknown[])?.includes(`${t.product.from} `)));
  const pointer = (type: string) => (render().props.onPointerEnter as (event: unknown) => void)({ pointerType: type });
  pointer("touch"); assert.equal(nodes().some((node) => node.props.src === base.hoverGifUrl), false);
  pointer("mouse"); assert.equal(nodes().some((node) => node.props.src === base.hoverGifUrl), true);
  animationAllowed = false; assert.equal(nodes().some((node) => node.props.src === base.hoverGifUrl), false);
  animationAllowed = true;
  const overlay = nodes().find((node) => node.props.src === base.hoverGifUrl)!;
  (overlay.props.onError as () => void)();
  assert.equal(nodes().some((node) => node.props.src === base.hoverGifUrl), false);
  state = []; cursor = 0;
  (render().props.onFocusCapture as (event: unknown) => void)({ target: { matches: () => true } });
  assert.equal(nodes().some((node) => node.props.src === base.hoverGifUrl), true);

  const query = new URLSearchParams("category=child&q=toy&sort=name&page=3&campaign=qa");
  const { CatalogFilters } = sourceModule<{ CatalogFilters: typeof Filters }>("src/components/catalog/catalog-filters.tsx", {
    "react/jsx-runtime": jsxRuntime,
    react: { useState: (value: unknown) => [value, () => {}], useEffect: () => {}, useTransition: () => [false, (callback: () => void) => callback()] },
    "next/navigation": { useRouter: () => ({ push: (path: string) => pushes.push(path) }), useSearchParams: () => query, usePathname: () => "/catalog" },
    "lucide-react": icons, "@/lib/utils": utils, "@/lib/category-name": categoryNames,
    "@/store/lang-store": { useLangStore: () => ({ locale, t }) }, "@/components/catalog/product-search-input": { ProductSearchInput: () => null },
  });
  const filters = elements(CatalogFilters({ categories: [{ id: "parent", slug: "parent", name: "Батьківська", nameEn: "Parent", children: [{ id: "child", slug: "child", name: "Дочірня", nameEn: "Child" }] }] }));
  assert.equal(filters.filter((node) => node.type === "button" && node.props["aria-pressed"] === true).length, 2);
  const sort = filters.find((node) => node.type === "select")!;
  (sort.props.onChange as (event: unknown) => void)({ target: { value: "price_desc" } });
  let next = new URL(pushes.at(-1)!, "http://localhost").searchParams;
  assert.equal(next.get("category"), "child"); assert.equal(next.get("q"), "toy"); assert.equal(next.get("sort"), "price_desc");
  assert.equal(next.get("campaign"), "qa"); assert.equal(next.has("page"), false);
  const all = filters.find((node) => node.type === "button" && node.props.children === t.catalog.all)!;
  (all.props.onClick as () => void)();
  next = new URL(pushes.at(-1)!, "http://localhost").searchParams;
  assert.equal(next.has("category"), false); assert.equal(next.get("q"), "toy");
  const { Pagination } = sourceModule<{ Pagination: typeof Pages }>("src/components/catalog/pagination.tsx", { "react/jsx-runtime": jsxRuntime, "next/link": Link, "@/lib/utils": utils });
  const pages = elements(Pagination({ currentPage: 2, totalPages: 3, searchParams: Object.fromEntries(query) })).filter((node) => node.type === Link);
  assert.equal(pages.length, 3); assert.equal(pages[1].props["aria-current"], "page");
  next = new URL(pages[2].props.href as string, "http://localhost").searchParams;
  assert.equal(next.get("page"), "3"); assert.equal(next.get("category"), "child"); assert.equal(next.get("sort"), "name");
  console.log(`PASS ${locale}: shared semantic card, links, quick add, size routing/from price, stock guard, mouse/focus GIF and reduced motion/error fallback; parent/child filters, query preservation/page reset, pagination.`);
}
