import * as React from "react";
import { createRoot } from "react-dom/client";
import { ProductSelectionProvider } from "../../src/components/product/product-selection";
import { ProductGallery } from "../../src/components/product/product-gallery";
import { ProductOptions } from "../../src/components/product/product-options";
import { ProductForm } from "../../src/components/admin/product-form";
import { LangStoreContext, createLangStore } from "../../src/store/lang-store";
import { useCartStore } from "../../src/store/cart-store";
import { formatPrice } from "../../src/lib/utils";
import { cartProducts } from "./gallery-admin-environment";
import { photos, ids, configuration, url } from "./batch18a-data";
import type { AdminFormResult } from "../../src/lib/admin-form-validation";
import type { CartItem } from "../../src/types";

const root = createRoot(document.getElementById("root")!);
const settle = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
function check(value: unknown, text: string): asserts value { if (!value) throw new Error(text); }
async function until(test: () => boolean) { const end = performance.now() + 5000; while (!test()) { check(performance.now() < end, "Color images fixture timed out"); await settle(); } }
function button(scope: Element, text: string) { const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((v) => v.textContent === text); check(found, `Missing button ${text}`); return found; }
function byLabel(scope: Element, label: string) { const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((v) => v.getAttribute("aria-label") === label); check(found, `Missing label ${label}`); return found; }
function input(node: HTMLInputElement | HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value);
  node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
async function run(locale: "ua" | "en") {
  const language = createLangStore(locale), t = language.getState().t;
  useCartStore.getState().clear();
  let candidate: CartItem | undefined;
  const addItem = useCartStore.getState().addItem;
  useCartStore.setState({ addItem: (item) => { candidate = item; return addItem(item); } });
  const render = (node: React.ReactNode) => root.render(<LangStoreContext.Provider value={language}>{node}</LangStoreContext.Provider>);
  function store(key: string, images = photos, config = configuration) {
    cartProducts.set("color_photo_fixture", { id: "color_photo_fixture", name: "Synthetic product", nameEn: null, slug: "fixture", price: 1, image: images[0]?.url ?? "/images/placeholder.svg", images, isOrderable: true, optionMode: config.mode, configuration: config, variants: [] });
    render(<div className="container-shop py-4"><ProductSelectionProvider key={key} images={images}><div className="grid gap-6 md:grid-cols-2">
      <ProductGallery images={images} name="Synthetic product" /><div><h1>Synthetic product</h1><ProductOptions productId="color_photo_fixture" name="Synthetic product" slug="fixture" basePrice={1} image={images[0]?.url ?? "/images/placeholder.svg"} variants={[]} configuration={config} isOrderable /></div>
    </div></ProductSelectionProvider></div>);
  }
  store("start"); await until(() => Boolean(document.querySelector(".sf-product-gallery")));
  const options = () => document.querySelector(".sf-product-options")!;
  const gallery = () => document.querySelector(".sf-product-gallery")!;
  const image = () => gallery().querySelector("button[aria-haspopup] img")?.getAttribute("data-media-source");
  const count = () => gallery().querySelectorAll(".sf-gallery-thumbnails button").length;
  const blue = locale === "ua" ? "Блакитний" : "Blue", pink = locale === "ua" ? "Рожевий" : "Pink";
  const medium = locale === "ua" ? "Середній" : "Medium", small = locale === "ua" ? "Малий" : "Small", large = locale === "ua" ? "Великий" : "Large";
  button(options(), blue).click(); await until(() => image() === url("blue.gif"));
  check(count() === 2 && options().textContent?.includes(formatPrice(279, "UAH")) && options().textContent?.includes(t.product.from), "Blue partial price/gallery incorrect");
  check(button(options(), small).disabled && button(options(), large).disabled, "Absent/unavailable Blue sizes selectable");
  byLabel(gallery(), t.product.gallery.next).click(); await until(() => image() === url("universal.webp"));
  button(options(), medium).click(); await settle();
  check(image() === url("universal.webp"), "Size selection reset manual photo navigation");
  button(options(), t.product.addToCart).click(); await settle();
  check(candidate?.image === url("blue.gif") && useCartStore.getState().items[0].price === 279 && useCartStore.getState().items[0].image === "/images/placeholder.svg", "Cart candidate lost selected-color primary or unverified media was trusted");
  useCartStore.setState({ addItem });
  button(options(), pink).click(); await until(() => image() === url("pink1.webp"));
  check(count() === 3 && options().textContent?.includes(formatPrice(249, "UAH")), "Compatible size/price lost");
  button(options(), small).click(); await settle();
  check(options().textContent?.includes(formatPrice(199, "UAH")), "Pink small price wrong");
  button(options(), blue).click(); await settle();
  check(options().textContent?.includes(t.variantConfig.cleared) && options().textContent?.includes(formatPrice(279, "UAH")), "Incompatible size was not cleared with Blue minimum");
  button(options(), pink).click(); await until(() => image() === url("pink1.webp"));
  const surface = gallery().querySelector("[style*='touch-action']")!;
  surface.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 200, clientY: 60 }));
  surface.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 100, clientY: 61 }));
  await until(() => image() === url("pink2.webp"));
  // Open native lightbox after the swipe's click suppression interval has elapsed.
  await new Promise((done) => setTimeout(done, 520));
  const opener = gallery().querySelector<HTMLButtonElement>("button[aria-haspopup]")!;
  opener.focus(); opener.click(); await until(() => Boolean(gallery().querySelector("dialog[open]")));
  const dialog = gallery().querySelector<HTMLDialogElement>("dialog")!;
  check(dialog.contains(document.activeElement), "Lightbox focus not trapped on opening");
  dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await settle();
  check(dialog.querySelector("img")?.getAttribute("data-media-source") === url("universal.webp"), "Lightbox keyboard navigation failed");
  button(dialog, t.product.gallery.zoomIn).click(); await settle();
  check(button(dialog, t.product.gallery.zoomOut).getAttribute("aria-pressed") === "true", "Zoom failed");
  dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await until(() => !dialog.open);
  check(document.activeElement === gallery().querySelector("button[aria-haspopup]"), "Lightbox focus not restored");
  check(document.documentElement.scrollWidth <= innerWidth + 1, "Storefront horizontal overflow");
  store("fallback", photos.filter((v) => v.colorValueId !== ids.blue)); await settle();
  button(options(), blue).click(); await until(() => image() === url("universal.webp")); check(count() === 0, "No-photo color fallback not universal-only");
  store("simple", [photos[0]], { mode: "SIMPLE", values: [], combinations: [] }); await settle();
  check(options().querySelectorAll("fieldset").length === 0 && image() === url("universal.webp"), "Product without colors regressed");
  let saves = 0, failure = "field";
  const action = async (): Promise<AdminFormResult> => { saves++; if (failure === "network") throw new Error("SYNTHETIC_NETWORK"); return { error: "validation", fieldErrors: failure === "stale" ? { configuration: "stale" } : { images: "galleryColor" } }; };
  render(<div className="container-shop py-4"><ProductForm allowNative action={action} categories={[{ id: "category", name: "Category", nameEn: "Category", slug: "category", imageUrl: null, order: 0, children: [] }]} defaults={{ name: "Synthetic product", nameEn: "Synthetic product", slug: "fixture", description: "Description", descriptionEn: "Description", price: 1, categoryId: "category", optionMode: "COLOR_SIZE", variantRevision: 7, configuration, images: photos }} /></div>);
  await until(() => Boolean(document.querySelector("form")) && !document.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled);
  const form = document.querySelector("form")!;
  const hidden = (name: string) => form.querySelector<HTMLInputElement>(`input[name='${name}']`)!;
  const imageRows = () => [...form.querySelectorAll<HTMLElement>("[data-field-name=images] > div.space-y-2")];
  const originalSnapshot = hidden("imagesSnapshot").value;
  button(imageRows()[2], t.admin.gallery.makeColorPrimary).click(); await settle();
  check(JSON.parse(hidden("images").value)[1].id === "pink2", "Color primary reorder failed");
  button(form, t.variantConfig.addColor).click(); await settle();
  const draft = JSON.parse(hidden("configuration").value), index = draft.values.length - 1, key = draft.values[index].key;
  input(hidden(`configuration.values.${index}.labelUa`), "Зелений"); input(hidden(`configuration.values.${index}.labelEn`), "Green"); await settle();
  const select = imageRows()[3].querySelector<HTMLSelectElement>("select")!;
  check([...select.options].some((option) => option.value === key && option.text === (locale === "ua" ? "Зелений" : "Green")), "New unsaved color missing from gallery");
  input(select, key); await settle();
  check(JSON.parse(hidden("images").value)[3].colorKey === key, "Draft color reference not serialized");
  const snapshot = () => JSON.stringify([...new FormData(form).entries()]);
  const before = snapshot();
  for (const kind of ["field", "network", "stale"]) {
    failure = kind; const previous = saves; form.requestSubmit(); await until(() => saves > previous && !form.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled); await settle();
    check(snapshot() === before && hidden("imagesSnapshot").value === originalSnapshot, `Draft/gallery/configuration lost after ${kind} error`);
  }
  check(form.textContent?.includes(t.admin.validation.stale), "Stale error missing");
  check(document.documentElement.scrollWidth <= innerWidth + 1, "Admin horizontal overflow");
  // Leave the gallery in view for the runner's screenshot artifacts.
  form.querySelector("[data-field-name=images]")!.scrollIntoView({ block: "start" });
  return `${locale}: selected prices 199/249/279, sparse availability, galleries/GIF/fallback, manual arrows/swipe/lightbox/zoom/keyboard/focus, cart primary, new draft color and form error preservation`;
}
Object.assign(window, { colorImagesQA: { run } });
