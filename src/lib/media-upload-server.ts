import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { MEDIA_PREFIX, MediaUploadError, validateMediaPreflight, type MediaPreflight } from "@/lib/media-upload";

export const UPLOAD_AUTH_TTL = 5 * 60 * 1000;
type Intent = { pathname: string; kind: "image" | "animation"; contentType: string; size: number; expires: number };
export function blobUploadsConfigured() { return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()); }
function secret() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new MediaUploadError("unavailable");
  return token;
}
function sign(payload: string) { return createHmac("sha256", secret()).update(`3dkid-media-intent:${payload}`).digest("hex"); }
export function prepareMediaUpload(input: MediaPreflight) {
  const extension = validateMediaPreflight(input);
  const pathname = `${MEDIA_PREFIX}${input.kind}/${randomUUID()}.${extension}`;
  const intent: Intent = { pathname, kind: input.kind, contentType: input.contentType, size: input.size, expires: Date.now() + UPLOAD_AUTH_TTL };
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  return { pathname, clientPayload: `${payload}.${sign(payload)}` };
}
export function verifyMediaIntent(pathname: string, clientPayload: string | null): Intent {
  if (!clientPayload || clientPayload.length > 2048) throw new MediaUploadError("invalidRequest");
  const parts = clientPayload.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[0])) throw new MediaUploadError("invalidRequest");
  if (!timingSafeEqual(Buffer.from(parts[1], "hex"), Buffer.from(sign(parts[0]), "hex"))) throw new MediaUploadError("invalidRequest");
  let intent: Intent;
  try { intent = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { throw new MediaUploadError("invalidRequest"); }
  if (!intent || intent.pathname !== pathname || !pathname.startsWith(MEDIA_PREFIX) || !Number.isFinite(intent.expires) ||
    intent.expires <= Date.now() || intent.expires > Date.now() + UPLOAD_AUTH_TTL) throw new MediaUploadError("invalidRequest");
  return intent;
}

// Bounded per-instance abuse control, in addition to Admin auth and Blob's signed
// object/type/size constraints. Deployments with many writers can add a shared limit.
let windowStart = 0;
let requests = 0;
export function limitMediaUploads(now = Date.now()) {
  if (now - windowStart >= 60000) { windowStart = now; requests = 0; }
  if (++requests > 40) throw new MediaUploadError("rateLimited");
}
