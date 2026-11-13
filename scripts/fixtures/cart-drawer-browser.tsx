import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CartDrawer } from "../../src/components/cart/cart-drawer";
import { ProductCard } from "../../src/components/product/product-card";
import { ProductOptions } from "../../src/components/product/product-options";
import { useCartStore } from "../../src/store/cart-store";
import { createLangStore, LangStoreContext } from "../../src/store/lang-store";
import { messages, navigate } from "./cart-drawer-environment";

const root = createRoot(document.getElementById("root")!);
const state = () => useCartStore.getState();
const backdrop = () => document.querySelector<HTMLElement>(".fixed.inset-0");
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const settle = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
async function until(test: () => boolean) {
  const deadline = performance.now() + 3000;
  while (!test()) { check(performance.now() < deadline, "Animation/route did not settle"); await settle(); }
}
function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector); check(element, `Missing ${selector}`); element.click();
}
const product = { id: "qa", productId: "qa", name: "QA Dragon", slug: "qa", price: 20, basePrice: 20, image: "/placeholder.svg", isOrderable: true };
function render(locale: "ua" | "en") {
  flushSync(() => root.render(<React.StrictMode><LangStoreContext.Provider value={createLangStore(locale)}>
    <button id="probe">Page remains interactive</button>
    <div id="quick"><ProductCard {...product} /></div>
    <div id="choose"><ProductCard {...product} hasOptions /></div>
    <div id="unavailable"><ProductCard {...product} isOrderable={false} /></div>
    <div id="detail"><ProductOptions {...product} variants={[]} /></div>
    <div id="sizes"><ProductOptions {...product} variants={[{ id: "small", labelUa: "S", labelEn: "Small", price: 25, noteUa: null, noteEn: null }]} /></div>
    <CartDrawer />
  </LangStoreContext.Provider></React.StrictMode>));
}
async function closed() {
  await until(() => !document.querySelector('[role="dialog"]'));
  check(!backdrop(), "Backdrop remains after close");
  check(document.body.style.overflow === "auto", "Body overflow not restored");
}
async function open() {
  let changes = 0;
  const unsubscribe = useCartStore.subscribe(() => changes++);
  click("#quick .sf-product-add"); await settle(); unsubscribe();
  check(changes === 1, "Quick add must open cart once");
  check(state().isOpen && backdrop(), "Adding a product must open drawer/backdrop");
  check(document.body.style.overflow === "hidden", "Open drawer must lock scrolling");
  const panel = document.querySelector('[role="dialog"]')!;
  check(panel.contains(document.activeElement), "Initial focus must enter dialog");
  check(!messages.some((item) => item.kind === "success"), "Redundant success toast");
}
async function run(locale: "ua" | "en") {
  state().closeCart(); state().clear(); messages.length = 0;
  document.body.style.overflow = "auto";
  navigate("/catalog"); render(locale); await settle();
  const t = createLangStore(locale).getState().t;

  check(document.querySelector<HTMLButtonElement>("#unavailable button")?.disabled, "Unavailable product must remain disabled");
  check(document.querySelector("#unavailable")?.textContent?.includes(t.product.unavailable), "Unavailable feedback lost");
  const detailAdd = document.querySelector<HTMLButtonElement>("#sizes .sf-product-options > button")!;
  check(detailAdd.disabled && detailAdd.textContent?.includes(t.product.chooseSize), "Choose-size feedback lost");
  click("#choose .sf-product-add"); await settle();
  check(messages.some((item) => item.kind === "message" && item.text === t.product.chooseSize), "Choose-size informational toast lost");
  check(!state().isOpen && !state().items.length, "Size choice must not add item");
  flushSync(() => navigate("/catalog")); await settle();

  let changes = 0;
  const unsubscribe = useCartStore.subscribe(() => changes++);
  click("#detail .sf-product-options > button"); await settle(); unsubscribe();
  check(changes === 1 && state().isOpen, "Detail add must open cart once, with no redundant openCart");
  check(!messages.some((item) => item.kind === "success"), "Detail add showed success toast");
  flushSync(() => state().closeCart()); await closed();

  click("#sizes fieldset button"); await settle();
  click("#sizes .sf-product-options > button"); await settle();
  check(state().items.some((item) => item.variant?.id === "small"), "Selected size not added");
  flushSync(() => state().closeCart()); await closed();

  // Real focus trapping, Escape, and safe restoration to the opener.
  const opener = document.querySelector<HTMLButtonElement>("#quick button")!;
  opener.focus(); await open();
  const nodes = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled), [role="dialog"] a[href]')];
  nodes.at(-1)!.focus(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  check(document.activeElement === nodes[0], "Forward focus trap failed");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  check(document.activeElement === nodes.at(-1), "Backward focus trap failed");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await closed(); check(document.activeElement === opener, "Opener focus was not restored");

  await open(); flushSync(() => backdrop()!.click());
  check(!state().isOpen, "Backdrop click must close drawer");
  check(!backdrop() || backdrop()!.style.pointerEvents === "none", "Exiting backdrop intercepts clicks");
  const exiting = document.querySelector<HTMLElement>('[role="dialog"]');
  check(!exiting || (exiting.inert && exiting.style.pointerEvents === "none"), "Exiting panel remains interactive");
  await closed();

  // Route changes and back navigation discard the complete old modal immediately.
  for (const next of ["/product/qa", "/catalog"]) {
    await open(); flushSync(() => navigate(next)); await settle();
    check(!state().isOpen && !backdrop() && !document.querySelector('[role="dialog"]'), "Route change left modal layer");
    check(document.body.style.overflow === "auto", "Route change left scroll lock");
    const probe = document.querySelector<HTMLElement>("#probe")!; const box = probe.getBoundingClientRect();
    check(document.elementFromPoint(box.x + 3, box.y + 3) === probe, "Stale layer blocks page buttons");
  }
  await open(); history.back();
  await until(() => location.pathname === "/product/qa" && !state().isOpen);
  await closed(); check(!backdrop(), "Back navigation left backdrop");

  await open(); flushSync(() => state().closeCart());
  flushSync(() => navigate("/catalog")); await settle();
  check(!backdrop() && !document.querySelector('[role="dialog"]'), "Route change retained an exiting animation layer");

  await open(); click('[role="dialog"] a[href="/checkout"]'); await settle();
  check(location.pathname === "/checkout" && !state().isOpen, "Checkout link must close drawer and navigate"); await closed();

  // Focus errors or a detached opener must never prevent scroll/listener cleanup.
  for (const detached of [false, true]) {
    const target = document.createElement("button"); document.body.append(target); target.focus();
    flushSync(() => state().openCart()); await settle();
    if (detached) target.remove(); else target.focus = () => { throw new Error("FOCUS_TARGET_UNAVAILABLE"); };
    flushSync(() => state().closeCart()); await closed(); target.remove();
  }
  flushSync(() => state().openCart()); await settle();
  flushSync(() => root.unmount());
  check(!state().isOpen && document.body.style.overflow === "auto" && !backdrop(), "Unmount did not reset cart/restore body/remove backdrop");
  check(!messages.some((item) => item.kind === "success"), "Success toast must remain absent");
  return `${locale}: add/size feedback, single open, focus/Escape/backdrop, route/back, checkout, cleanup PASS`;
}

Object.assign(window, { cartQA: { run } });
