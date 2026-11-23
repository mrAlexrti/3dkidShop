import * as React from "react";
import { createRoot } from "react-dom/client";
import { ProductForm } from "../../src/components/admin/product-form";
import { CategoryForm } from "../../src/components/admin/category-form";
import { AdminForm, AdminFieldError, AdminSaveButton } from "../../src/components/admin/admin-form";
import { MediaUrlField } from "../../src/components/admin/media-url-field";
import { AboutContentFields } from "../../src/components/admin/about-content-fields";
import { ABOUT_CONTENT_LIMITS } from "../../src/lib/site-content";
import { DeleteButton } from "../../src/components/admin/delete-button";
import { ProductCard } from "../../src/components/product/product-card";
import { ProductGallery } from "../../src/components/product/product-gallery";
import { createLangStore, LangStoreContext } from "../../src/store/lang-store";
import { fixture, reducedMotion } from "./gallery-admin-environment";
import type { AdminFormResult } from "../../src/lib/admin-form-validation";

const root = createRoot(document.getElementById("root")!);
const photos = [{ id: "first", url: "https://res.cloudinary.com/fixture/first.webp", alt: "First photo" }, { id: "second", url: "https://res.cloudinary.com/fixture/second.webp", alt: "Second photo" }, { id: "third", url: "https://res.cloudinary.com/fixture/third.webp", alt: "Third photo" }];
const settle = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => boolean) { const deadline = performance.now() + 6000; while (!test()) { check(performance.now() < deadline, "Gallery/Admin fixture did not settle"); await settle(); } }
const container = (id: string) => document.getElementById(id)!;
const form = (id = "admin-probe") => container(id).querySelector<HTMLFormElement>("form")!;
const field = (name: string, id = "admin-probe") => form(id).elements.namedItem(name) as HTMLInputElement;
const snapshot = (id = "admin-probe") => JSON.stringify([...new FormData(form(id)).entries()]);
function input(name: string, value: string, id = "admin-probe") {
  const control = field(name, id); const prototype = control.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event("input", { bubbles: true })); control.dispatchEvent(new Event("change", { bubbles: true }));
}
async function submit(id = "admin-probe") { form(id).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await settle(); }
function file(): File { return new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array(24).fill(0)])], "photo.png", { type: "image/png" }); }
async function choose(picker: HTMLInputElement, files: File[]) { const transfer = new DataTransfer(); files.forEach((item) => transfer.items.add(item)); picker.files = transfer.files; picker.dispatchEvent(new Event("change", { bubbles: true })); await settle(); }
async function save(data?: FormData): Promise<AdminFormResult> {
  fixture.saves++;
  if (fixture.mode === "network") throw new Error("FIXTURE_NETWORK_ERROR");
  if (fixture.mode === "about-validation") return { error: "validation", fieldErrors: { about_body_ua: "tooLong" } };
  if (fixture.mode === "deferred") await new Promise<void>((resolve) => { fixture.completeSave = resolve; });
  if (fixture.mode === "duplicate") return { error: "slugDuplicate" };
  if (fixture.mode === "validation") return { error: "validation", fieldErrors: { nameEn: "required", price: "invalid" } };
  if (data) fixture.savedContent = [...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string");
}

async function run(locale: "ua" | "en") {
  const language = createLangStore(locale); const t = language.getState().t; const text = t.product.gallery;
  let archiveCalls = 0;
  root.render(<React.StrictMode><LangStoreContext.Provider value={language}>
    <button id="outside">Outside modal</button>
    <div className="storefront"><div id="card-probe"><ProductCard id="fixture" slug="fixture" name="Dragon" nameEn="Dragon" price={20} image={photos[0].url} images={photos} isOrderable hoverGifUrl="https://example.invalid/hover.gif" /></div>
    <div id="gallery-probe"><ProductGallery images={photos} name="Dragon" /></div>
    </div>
    <div id="admin-probe"><ProductForm categories={[{ id: "c1", slug: "c1", name: "Figures", nameEn: "Figures", imageUrl: null, order: 0, children: [] }]} action={save}
      defaults={{ name: "Дракон", nameEn: "Dragon", slug: "dragon", description: "Перший абзац\n\nДругий абзац", descriptionEn: "First paragraph\n\nSecond paragraph", price: 20, oldPrice: 25,
        images: photos.slice(0, 2), categoryId: "c1", isActive: true, isOrderable: true, isNew: true, isFeatured: true,
        variants: [{ id: "clx123456789012345678901234", labelUa: "Малий", labelEn: "Small", price: 30, noteUa: "Опис розміру", noteEn: "Size note" }] }} /></div>
    <div id="category-probe"><CategoryForm parents={[]} mode="edit" defaults={{ name: "Категорія", nameEn: "Category", slug: "category", imageUrl: photos[0].url }} action={save} /></div>
    <div id="hero-probe"><AdminForm action={save}><input name="nameEn" defaultValue="Hero" /><AdminFieldError name="nameEn" />
      <AboutContentFields content={{}} />
      {[1, 2, 3].map((number) => <MediaUrlField key={number} name={`hero_image_${number}`} label={`Hero ${number}`} help={t.admin.media.imageHelp} defaultValue={photos[0].url} uploadEnabled />)}
      <input name="social_instagram" type="url" defaultValue="https://example.invalid/social" /><AdminSaveButton /></AdminForm></div>
    <div id="delete-probe"><DeleteButton action={async () => ({ error: "orderHistory" })} archiveAction={async () => { archiveCalls++; }} /></div>
    <div id="legacy-reset"><form action={async () => { try { throw new Error("legacy-failed-save"); } catch { /* Legacy action fulfilled after catching the failure. */ } }}><input name="legacy" defaultValue="" /><button type="submit">Legacy probe</button></form></div>
  </LangStoreContext.Provider></React.StrictMode>);
  await until(() => Boolean(document.querySelector('#admin-probe form [name="nameEn"]')));
  const sizeNote = form().querySelector<HTMLInputElement>(`input[aria-label="${t.admin.sizes.noteUa} 1"]`);
  check(sizeNote, "Size editor missing"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(sizeNote, "Нотатка збережена"); sizeNote.dispatchEvent(new Event("input", { bubbles: true })); await settle();
  check(field("variants").value.includes("Нотатка збережена"), "Size draft was not registered");
  document.body.style.overflow = "auto";

  // Reproduce the actual installed React 19 reset, using isolated inputs only.
  input("legacy", "Entered before failure", "legacy-reset");
  container("legacy-reset").querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); await until(() => field("legacy", "legacy-reset").value === "");

  const card = container("card-probe"); const link = card.querySelector<HTMLAnchorElement>('.sf-product-visual a')!;
  check(card.querySelectorAll(".sf-product-add").length === 1 && !card.querySelector("input"), "Catalog cart button/quantity UX changed");
  check(card.querySelectorAll("img").length === 1, "Catalog preloaded additional photos or animation before interaction");
  link.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })); await settle();
  check([...card.querySelectorAll("img")].some((image) => image.dataset.mediaSource?.endsWith("hover.gif")), "Interaction GIF did not mount");
  const pushesBefore = fixture.pushes.length;
  card.querySelector<HTMLButtonElement>(`button[aria-label="${text.next}: Dragon"]`)!.click(); await settle();
  check(fixture.pushes.length === pushesBefore && card.querySelector("img")!.dataset.mediaSource === photos[1].url, "Carousel arrow navigated or failed to change photo");
  check(![...card.querySelectorAll("img")].some((image) => image.dataset.mediaSource?.endsWith("hover.gif")), "GIF obscured a selected photograph");
  link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 200, clientY: 80 }));
  link.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 90, clientY: 85 })); link.click(); await settle();
  check(fixture.pushes.length === pushesBefore && card.querySelector("img")!.dataset.mediaSource === photos[2].url, "Swipe caused navigation or did not change photo");
  reducedMotion(); await settle(); check(![...card.querySelectorAll("img")].some((image) => image.dataset.mediaSource?.endsWith("hover.gif")), "Reduced motion lost");

  const gallery = container("gallery-probe"); const trigger = gallery.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
  trigger.focus(); trigger.click(); await until(() => Boolean(gallery.querySelector<HTMLDialogElement>("dialog")?.open));
  const dialog = gallery.querySelector<HTMLDialogElement>("dialog")!;
  check(document.body.style.overflow === "hidden" && dialog.contains(document.activeElement), "Lightbox scroll lock/focus missing");
  check(dialog.scrollWidth <= dialog.clientWidth + 1, "Lightbox has unintended horizontal overflow");
  container("outside").focus(); check(dialog.contains(document.activeElement), "Modal allowed background focus");
  dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await settle();
  check(dialog.querySelector("img")!.dataset.mediaSource === photos[1].url, "Lightbox keyboard navigation failed");
  [...dialog.querySelectorAll("button")].find((button) => button.textContent === text.zoomIn)!.click(); await settle();
  check(dialog.querySelector('[style="width: 200%;"]'), "Zoom interaction failed");
  const viewport = dialog.querySelector<HTMLDivElement>("div.overflow-auto")!;
  check(viewport.scrollWidth > viewport.clientWidth, "Zoom does not allow horizontal panning");
  const swipe = () => { viewport.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 200, clientY: 80 })); viewport.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 80, clientY: 85 })); };
  swipe(); await settle(); check(dialog.querySelector("img")!.dataset.mediaSource === photos[1].url, "Zoomed pan changed the photo");
  [...dialog.querySelectorAll("button")].find((button) => button.textContent === text.zoomOut)!.click(); await settle();
  swipe(); await settle(); check(dialog.querySelector("img")!.dataset.mediaSource === photos[2].url, "Mobile lightbox swipe failed");
  dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await until(() => !dialog.open);
  check(String(document.body.style.overflow) === "auto" && document.activeElement === trigger, "Lightbox did not restore scroll/focus");
  gallery.querySelectorAll<HTMLButtonElement>(".sf-gallery-thumbnails button")[2].click(); await settle(); trigger.click(); await until(() => dialog.open);
  check(dialog.querySelector("img")!.dataset.mediaSource === photos[2].url, "Existing thumbnail navigation lost");
  dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await until(() => !dialog.open);

  input("nameEn", ""); await submit(); check(fixture.saves === 0 && document.activeElement === field("nameEn"), "Missing required field did not focus or reached server");
  check(field("nameEn").labels?.length && field("nameEn").getAttribute("aria-invalid") === "true" && getComputedStyle(field("nameEn")).borderTopColor === "rgb(239, 68, 68)", "Required field lacks associated label or visible invalid styling");
  check(field("description").value.includes("Другий"), "Client validation reset bilingual description"); input("nameEn", "Dragon edited"); await settle();
  const primary = form().querySelector<HTMLButtonElement>(`button[aria-label="${t.admin.gallery.makePrimary}: 2"]`)!; primary.click(); await settle();
  check(JSON.parse(field("images").value)[0].id === "second", "Primary photo ID/order lost");
  const beforeFailure = snapshot(); await submit(); check(Number(fixture.saves) === 1 && snapshot() === beforeFailure && document.activeElement === field("nameEn"), "Server validation lost values/order/focus");
  fixture.mode = "duplicate"; await submit(); check(snapshot() === beforeFailure && document.activeElement === field("slug"), "Duplicate slug reset form or lacked field error");
  fixture.mode = "network"; await submit(); check(snapshot() === beforeFailure && form().textContent?.includes(t.admin.validation.saveFailed), "Network failure reset form");

  const images = form().querySelector<HTMLElement>('[data-field-name="images"]')!;
  await choose(images.querySelector<HTMLInputElement>('input[multiple]')!, [file(), file()]);
  [...images.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === t.admin.gallery.upload)!.click(); await until(() => fixture.uploads === 1);
  const savesBeforeUpload = fixture.saves; await submit(); check(fixture.saves === savesBeforeUpload && form().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, "Active upload allowed Save");
  fixture.finish(true); await until(() => fixture.uploads === 2); fixture.finish(false);
  await until(() => !form().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled);
  check(JSON.parse(field("images").value).length === 3, "Partial upload failure discarded a completed URL");
  const completedUrl = JSON.parse(field("images").value)[2].url;
  [...images.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === t.admin.gallery.upload)!.click(); await until(() => fixture.uploads === 3);
  fixture.finish(true); await until(() => JSON.parse(field("images").value).length === 4);
  check(JSON.parse(field("images").value)[2].url === completedUrl, "Upload retry duplicated or replaced a completed URL");
  check(fixture.saves === savesBeforeUpload && JSON.parse(field("images").value).slice(2).every((image: { url: string }) => image.url.includes("blob.vercel-storage.com")), "Bulk upload failed or saved the product automatically");
  fixture.mode = "validation"; const uploadedBefore = snapshot(); await submit(); check(snapshot() === uploadedBefore, "Validation lost uploaded URLs");
  form().querySelector<HTMLButtonElement>(`button[aria-label="${t.admin.gallery.remove}: 4"]`)!.click(); await settle(); check(JSON.parse(field("images").value).length === 3, "Gallery removal failed");

  for (const [id, name] of [["category-probe", "imageUrl"], ["hero-probe", "hero_image_1"]] as const) {
    const current = form(id); await until(() => !current.querySelector<HTMLButtonElement>(`[aria-controls="${name}-file"]`)!.disabled);
    await choose(current.querySelector<HTMLInputElement>(`[id="${name}-file"]`)!, [file()]);
    const wrapper = field(name, id).parentElement!; const before = fixture.uploads;
    wrapper.querySelectorAll<HTMLButtonElement>("button")[1].click(); await until(() => fixture.uploads === before + 1);
    check(current.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, "Category/hero Save not blocked during upload");
    fixture.finish(true); await until(() => field(name, id).value.includes("blob.vercel-storage.com"));
    const captured = snapshot(id); await submit(id); check(snapshot(id) === captured, "Category/hero validation lost uploaded URL or fields");
  }
  check(form("hero-probe").querySelectorAll('[aria-controls$="-file"]').length === 3, "Social URL got upload controls or hero controls missing");
  const aboutId = "hero-probe";
  check(field("about_body_ua", aboutId).value === t.pages.about.paragraphs.join("\n\n") || field("about_body_en", aboutId).value === t.pages.about.paragraphs.join("\n\n"), "About editor did not show existing localized body fallback");
  const initialSlogan = field("about_slogan_ua", aboutId).value;
  input("about_slogan_ua", "", aboutId); const callsBeforeAbout = fixture.saves;
  await submit(aboutId); check(fixture.saves === callsBeforeAbout && document.activeElement === field("about_slogan_ua", aboutId), "Missing About slogan not blocked/focused");
  input("about_slogan_ua", initialSlogan, aboutId); input("about_body_ua", "Абзац один\nДругий рядок\n\nАбзац два <b>текст</b>", aboutId);
  input("about_body_en", "Paragraph one\nSecond line\n\nParagraph two", aboutId);
  input("about_meta_title_en", "Custom About SEO", aboutId);
  input("about_meta_description_en", "Custom About description", aboutId); await settle();
  const aboutDraft = snapshot(aboutId); const heroDraft = field("hero_image_1", aboutId).value;
  check(heroDraft.includes("blob.vercel-storage.com"), "Completed hero upload disappeared before About Save");
  fixture.mode = "about-validation"; await submit(aboutId);
  check(snapshot(aboutId) === aboutDraft && document.activeElement === field("about_body_ua", aboutId) && form(aboutId).textContent?.includes(t.admin.validation.tooLong), "About server validation lost draft, hero, focus or localized length error");
  fixture.mode = "network"; await submit(aboutId); check(snapshot(aboutId) === aboutDraft, "About network failure reset About or other content");
  check(field("about_body_ua", aboutId).maxLength === ABOUT_CONTENT_LIMITS.body && field("about_slogan_en", aboutId).labels?.length, "About limits/accessible labels missing");
  language.getState().setLocale(locale === "ua" ? "en" : "ua"); await settle();
  check(snapshot(aboutId) === aboutDraft && field("hero_image_1", aboutId).value === heroDraft, "UA/EN switch lost About/hero drafts");
  language.getState().setLocale(locale); await settle();
  const refreshBefore = fixture.refreshes; fixture.mode = "deferred";
  await submit(aboutId); const savingCalls = fixture.saves; await submit(aboutId);
  check(fixture.saves === savingCalls && form(aboutId).querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, "About Save allowed double submission");
  fixture.completeSave(); await until(() => fixture.refreshes > refreshBefore);
  check(snapshot(aboutId) === aboutDraft && fixture.savedContent.some(([key, value]) => key === "hero_image_1" && value === heroDraft), "Successful About retry lost form/hero values");
  fixture.mode = "success"; await submit(); check(fixture.pushes.includes("/admin/products"), "Successful retry did not preserve navigation");
  async function confirmDialog(label: string) { await until(() => Boolean(document.querySelector('dialog[open]'))); [...document.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((button) => button.textContent === label)!.click(); await until(() => !document.querySelector('dialog[open]')); }
  container("delete-probe").querySelector<HTMLButtonElement>("button")!.click(); await confirmDialog(t.adminSafety.delete); await until(() => container("delete-probe").textContent!.includes(t.admin.deletion.orderHistory));
  [...container("delete-probe").querySelectorAll("button")].find((button) => button.textContent === t.admin.deletion.archive)!.click(); await confirmDialog(t.admin.deletion.archive); await until(() => archiveCalls === 1);
  check(fixture.refreshes > 0, "Archive did not refresh list");
  root.unmount(); check(String(document.body.style.overflow) === "auto", "Modal cleanup leaked scroll lock");
  return `${locale}: React reset reproduced; validation/network retry preserves data and uploads; gallery IDs/order; bulk/category/hero uploads; About bilingual/SEO drafts, locale switch and double-submit guard; carousel swipe/GIF; modal keyboard/zoom/focus; archive UX PASS`;
}
Object.assign(window, { galleryAdminQA: { run } });
