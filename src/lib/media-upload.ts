export type MediaKind = "image" | "animation";
export const MEDIA_UPLOAD_URL = "/api/product-media/upload";
export const MEDIA_PREFIX = "3dkid/product-media/";
export const MEDIA_LIMITS = { image: 5_000_000, animation: 12_000_000 } as const;
export const MEDIA_TYPES = { image: ["image/jpeg", "image/png", "image/webp"], animation: ["image/gif", "image/webp"] } as const;
export const UPLOAD_ERROR_CODES = ["unsupported", "tooLarge", "invalidFile", "notAnimated", "unavailable", "forbidden", "rateLimited", "invalidRequest", "uploadFailed"] as const;
export type UploadErrorCode = typeof UPLOAD_ERROR_CODES[number];
export class MediaUploadError extends Error {
  constructor(public code: UploadErrorCode) { super(code); }
}
export function uploadErrorCode(error: unknown): UploadErrorCode {
  return error instanceof MediaUploadError ? error.code : "uploadFailed";
}
export type MediaPreflight = { kind: MediaKind; contentType: string; size: number; headerHex: string };

// Small header preflight, not a decoder or malware scan. No remote URL is fetched.
export function validateMediaPreflight(input: MediaPreflight) {
  if (!input || !["image", "animation"].includes(input.kind)) throw new MediaUploadError("invalidRequest");
  if (!(MEDIA_TYPES[input.kind] as readonly string[]).includes(input.contentType)) throw new MediaUploadError("unsupported");
  if (!Number.isSafeInteger(input.size) || input.size < 1) throw new MediaUploadError("invalidFile");
  if (input.size > MEDIA_LIMITS[input.kind]) throw new MediaUploadError("tooLarge");
  if (typeof input.headerHex !== "string" || !/^(?:[0-9a-f]{2}){3,32}$/.test(input.headerHex)) throw new MediaUploadError("invalidFile");
  const bytes = Uint8Array.from(input.headerHex.match(/../g)!, (hex) => parseInt(hex, 16));
  if (bytes.length !== Math.min(32, input.size)) throw new MediaUploadError("invalidFile");
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const webp = ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(ascii(12, 4));
  const signatures: Record<string, boolean> = {
    "image/jpeg": bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    "image/png": input.headerHex.startsWith("89504e470d0a1a0a"),
    "image/gif": ["GIF87a", "GIF89a"].includes(ascii(0, 6)),
    "image/webp": webp,
  };
  if (!signatures[input.contentType]) throw new MediaUploadError("invalidFile");
  if (input.kind === "animation" && input.contentType === "image/webp" &&
    !(ascii(12, 4) === "VP8X" && bytes.length >= 30 && (bytes[20] & 2))) throw new MediaUploadError("notAnimated");
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[input.contentType];
}

export async function inspectMediaFile(file: File, kind: MediaKind): Promise<MediaPreflight> {
  if (!(MEDIA_TYPES[kind] as readonly string[]).includes(file.type)) throw new MediaUploadError("unsupported");
  if (file.size > MEDIA_LIMITS[kind]) throw new MediaUploadError("tooLarge");
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const preflight = { kind, contentType: file.type, size: file.size, headerHex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") };
  validateMediaPreflight(preflight);
  return preflight;
}

export function isPublicBlobUrl(value: string, pathname?: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) &&
      !url.port && !url.username && !url.password && !url.search && !url.hash && (!pathname || url.pathname === `/${pathname}`);
  } catch { return false; }
}
