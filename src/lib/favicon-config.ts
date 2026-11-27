import { isPublicBlobUrl } from "@/lib/media-upload";

export const FAVICON_KEY = "seo_favicon_ico";
export const FAVICON_WRITE_PATH = "/api/admin/favicon";
export const FAVICON_BLOB_PREFIX = "3dkid/favicon/";
export const FAVICON_UPLOAD_LIMIT = 2 * 1024 * 1024;
export const FAVICON_SIZES = [16, 32, 48, 96] as const;
export type FaviconSize = typeof FAVICON_SIZES[number];

export function faviconRevision(value?: string | null) {
  if (!value || !isPublicBlobUrl(value)) return null;
  const pathname = new URL(value).pathname;
  if (!pathname.startsWith("/" + FAVICON_BLOB_PREFIX)) return null;
  return /^([a-f0-9]{32})\.ico$/.exec(pathname.slice(FAVICON_BLOB_PREFIX.length + 1))?.[1] ?? null;
}
