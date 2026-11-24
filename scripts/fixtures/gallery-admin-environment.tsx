// Isolated browser environment: no Next server, database or live Blob operations.
import * as React from "react";
import type { CartProduct } from "../../src/lib/cart-reconciliation";
import type { UploadOptions } from "@vercel/blob/client";
import { MEDIA_UPLOAD_URL, MEDIA_PREFIX } from "../../src/lib/media-upload";

export const fixture = { uploads: 0, finish: (() => {}) as (success: boolean) => void, completeSave: (() => {}) as () => void, savedContent: [] as [string, string][], pushes: [] as string[], refreshes: 0, saves: 0, mode: "validation", animation: true };
export const toast = { success: () => {}, error: () => {}, message: () => {} };
export const usePathname = () => "/catalog";
export const useRouter = () => ({ push: (path: string) => { fixture.pushes.push(path); }, refresh: () => { fixture.refreshes++; } });
export const cartProducts = new Map<string, CartProduct>();
export async function lookupCartProducts(input: { lines: { productId: string }[] }) {
  return input.lines.flatMap(({ productId }) => cartProducts.get(productId) ?? []);
}
export function Link({ href, children, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); fixture.pushes.push(href!); } }}>{children}</a>;
}
export function Image({ fill: _fill, sizes: _sizes, unoptimized: _unoptimized, priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean; priority?: boolean }) {
  void _fill; void _sizes; void _unoptimized; void _priority;
  // eslint-disable-next-line @next/next/no-img-element -- Preserve requested source metadata, keep actual traffic local.
  return <img {...props} style={_fill ? { ...props.style, position: "absolute", inset: 0, width: "100%", height: "100%" } : props.style} data-media-source={props.src} src={props.src?.startsWith("https://example.invalid/card-") ? "/qa-preview.gif" : "/placeholder.svg"} alt={props.alt ?? ""} />;
}
const originalMatchMedia = window.matchMedia.bind(window); const mediaListeners = new Set<() => void>();
window.matchMedia = (query) => {
  const native = originalMatchMedia(query);
  return query.includes("hover: hover") ? ({ matches: fixture.animation && native.matches, media: query,
    addEventListener: (_name: string, listener: () => void) => { mediaListeners.add(listener); native.addEventListener("change", listener); },
    removeEventListener: (_name: string, listener: () => void) => { mediaListeners.delete(listener); native.removeEventListener("change", listener); } } as unknown as MediaQueryList) : native;
};
export function reducedMotion() { fixture.animation = false; mediaListeners.forEach((listener) => listener()); }
globalThis.fetch = async (url, init) => {
  if (url !== MEDIA_UPLOAD_URL) throw new Error("LIVE_NETWORK_FORBIDDEN");
  if (init?.method !== "POST") return Response.json({ available: true });
  const data = JSON.parse(String(init.body));
  if (data.type !== "prepare") throw new Error("UNEXPECTED_REQUEST");
  const extension = data.file.contentType === "image/gif" ? "gif" : "png";
  return Response.json({ pathname: `${MEDIA_PREFIX}${data.file.kind}/${crypto.randomUUID()}.${extension}`, clientPayload: "fixture-only" });
};
export async function upload(pathname: string, _file: File, options: UploadOptions) {
  fixture.uploads++; options.onUploadProgress?.({ loaded: 16, total: 32, percentage: 50 });
  await new Promise<void>((resolve, reject) => { fixture.finish = (success) => success ? resolve() : reject(new Error("FIXTURE_UPLOAD_FAILURE")); });
  return { pathname, url: `https://fixture.public.blob.vercel-storage.com/${pathname}`, contentType: options.contentType };
}
