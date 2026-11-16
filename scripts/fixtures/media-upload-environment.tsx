// Browser-only storage simulation. No live Blob API, product action or credentials.
import type { UploadOptions } from "@vercel/blob/client";
import { MEDIA_UPLOAD_URL, MEDIA_PREFIX } from "../../src/lib/media-upload";
export { Image, Link, usePathname, useRouter, toast } from "./cart-drawer-environment";

export const fixture = { available: true, chooser: 0, saves: 0, calls: 0, entries: [] as [string, FormDataEntryValue][], finish: (() => {}) as (success: boolean) => void };
const nativeClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function () { if (this.type === "file") fixture.chooser++; else nativeClick.call(this); };
globalThis.fetch = async (input, init) => {
  if (input !== MEDIA_UPLOAD_URL) throw new Error("EXTERNAL_FETCH_FORBIDDEN");
  if (init?.method !== "POST") return Response.json({ available: fixture.available });
  const body = JSON.parse(String(init.body));
  if (body.type !== "prepare") throw new Error("UNEXPECTED_PREPARE");
  const extension = ({ "image/png": "png", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[body.file.contentType];
  return Response.json({ pathname: `${MEDIA_PREFIX}${body.file.kind}/${crypto.randomUUID()}.${extension}`, clientPayload: "signed-fixture" });
};
export async function upload(pathname: string, _file: File, options: UploadOptions) {
  fixture.calls++;
  options.onUploadProgress?.({ loaded: 16, total: 32, percentage: 50 });
  await new Promise<void>((resolve, reject) => { fixture.finish = (success) => success ? resolve() : reject(new Error("SIMULATED_UPLOAD_FAILURE")); });
  return { pathname, url: `https://fixture.public.blob.vercel-storage.com/${pathname}`, contentType: options.contentType };
}
