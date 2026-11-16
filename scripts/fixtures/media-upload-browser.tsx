import * as React from "react";
import { createRoot } from "react-dom/client";
import { ProductForm } from "../../src/components/admin/product-form";
import { createLangStore, LangStoreContext } from "../../src/store/lang-store";
import { fixture } from "./media-upload-environment";

const root = createRoot(document.getElementById("root")!);
const oldUrl = "https://res.cloudinary.com/fixture/image/upload/old.webp";
const input = (name: string) => document.getElementById(name) as HTMLInputElement;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => boolean) {
  const end = performance.now() + 5000;
  while (!test()) { check(performance.now() < end, "Upload fixture did not settle"); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); }
}
const wrapper = (name: string) => input(name).parentElement!;
const choose = (name: string) => wrapper(name).querySelector<HTMLButtonElement>(`[aria-controls="${name}-file"]`)!;
const uploadButton = (name: string) => wrapper(name).querySelectorAll<HTMLButtonElement>("button")[1];
function render(locale: "ua" | "en", key: string) {
  root.render(<React.StrictMode><LangStoreContext.Provider value={createLangStore(locale)}><ProductForm key={key}
    categories={[{ id: "category", name: "QA", nameEn: "QA", slug: "qa", imageUrl: null, order: 0, children: [] }]}
    defaults={{ name: "Дракон", nameEn: "Dragon", slug: "dragon", description: "Description", descriptionEn: "Description", price: 20, categoryId: "category", imageUrl: oldUrl }}
    action={async (formData) => { fixture.saves++; fixture.entries = [...formData.entries()]; }} />
  </LangStoreContext.Provider></React.StrictMode>);
}
async function setup(locale: "ua" | "en") {
  fixture.available = true; render(locale, "configured");
  await until(() => Boolean(input("imageUrl")) && !choose("imageUrl").disabled);
  choose("imageUrl").focus();
}
async function select(name: string, file: File) {
  const transfer = new DataTransfer(); transfer.items.add(file);
  input(`${name}-file`).files = transfer.files;
  input(`${name}-file`).dispatchEvent(new Event("change", { bubbles: true }));
  await until(() => !uploadButton(name).disabled);
}
async function complete(name: string, success: boolean) {
  const before = fixture.calls; uploadButton(name).click();
  await until(() => fixture.calls === before + 1);
  check(input(name).disabled, "URL editing must pause during upload");
  check(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, "Save must pause during upload");
  await until(() => !!wrapper(name).querySelector("progress"));
  check(wrapper(name).querySelector<HTMLProgressElement>("progress")?.value === 50, "Progress not shown");
  fixture.finish(success);
  await until(() => !input(name).disabled);
}
async function run(locale: "ua" | "en") {
  const t = createLangStore(locale).getState().t;
  check(fixture.chooser >= 1, `Native keyboard Enter must activate the file-selection button (count ${fixture.chooser}, focus ${document.activeElement?.outerHTML})`);
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array(24).fill(0)]);
  const image = new File([png], "Local product image with a long name.png", { type: "image/png" });
  await select("imageUrl", image);
  check(wrapper("imageUrl").textContent?.includes(image.name) && wrapper("imageUrl").textContent?.includes("32 B"), "File name/size must be visible before upload");
  check(input("imageUrl").value === oldUrl && fixture.saves === 0, "Selection must not save/change URL");
  await complete("imageUrl", false);
  check(input("imageUrl").value === oldUrl && fixture.saves === 0, "Upload failure must preserve old URL/product");
  check(wrapper("imageUrl").textContent?.includes(t.admin.media.uploadErrors.uploadFailed), "Localized upload failure missing");
  await complete("imageUrl", true);
  check(input("imageUrl").value.includes(".public.blob.vercel-storage.com/3dkid/product-media/image/"), "Permanent Blob URL must populate input");
  check(wrapper("imageUrl").querySelector("img")?.alt.includes(t.admin.common.preview), "Accessible preview missing");
  check(fixture.saves === 0, "Upload must not automatically save product");
  const gif = new File([new TextEncoder().encode("GIF89a"), new Uint8Array(26)], "turn.gif", { type: "image/gif" });
  await select("hoverGifUrl", gif); await complete("hoverGifUrl", true);
  check(input("hoverGifUrl").value.endsWith(".gif"), "GIF upload failed");
  const webp = new Uint8Array(32); webp.set(new TextEncoder().encode("RIFF")); webp.set(new TextEncoder().encode("WEBPVP8X"), 8); webp[20] = 2;
  await select("hoverGifUrl", new File([webp], "turn.webp", { type: "image/webp" })); await complete("hoverGifUrl", true);
  check(input("hoverGifUrl").value.endsWith(".webp"), "Animated WebP upload failed");
  document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); await until(() => fixture.saves === 1);
  check(fixture.entries.every(([, value]) => typeof value === "string"), "Product Save must contain only text, no binary");
  check(fixture.entries.find(([name]) => name === "imageUrl")?.[1].toString().includes("blob.vercel-storage.com"), "Save must receive uploaded URL");
  fixture.available = false; render(locale, "missing-storage");
  await until(() => Boolean(wrapper("imageUrl").textContent?.includes(t.admin.media.uploadErrors.unavailable)));
  check(choose("imageUrl").disabled && !input("imageUrl").disabled, "Missing config must disable upload and keep manual URL entry usable");
  check(input("imageUrl").value === oldUrl, "Remount must preserve existing external URL");
  const clear = [...wrapper("imageUrl").querySelectorAll("button")].find((button) => button.textContent === t.admin.media.clear)!;
  clear.click(); await until(() => input("imageUrl").value === "");
  check(!wrapper("imageUrl").querySelector("img"), "Cleared field must clear preview");
  return `${locale}: keyboard choose, metadata/progress, failure/replace, GIF/WebP, explicit URL-only Save, missing config/manual clear PASS`;
}
Object.assign(window, { mediaUploadQA: { setup, run } });
