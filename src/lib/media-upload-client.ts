"use client";

import { inspectMediaFile, isPublicBlobUrl, MEDIA_PREFIX, MEDIA_UPLOAD_URL, MediaUploadError, UPLOAD_ERROR_CODES, type MediaKind, type UploadErrorCode } from "@/lib/media-upload";

async function responseJson(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new MediaUploadError(UPLOAD_ERROR_CODES.includes(result?.error) ? result.error as UploadErrorCode : "uploadFailed");
  return result;
}
export async function mediaUploadsAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const result = await responseJson(await fetch(MEDIA_UPLOAD_URL, { credentials: "same-origin", cache: "no-store", signal }));
    return result?.available === true;
  } catch { return false; }
}
export async function uploadProductMedia(file: File, kind: MediaKind, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> {
  const preflight = await inspectMediaFile(file, kind);
  const prepared = await responseJson(await fetch(MEDIA_UPLOAD_URL, { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "prepare", file: preflight }), signal }));
  if (typeof prepared?.pathname !== "string" || !prepared.pathname.startsWith(`${MEDIA_PREFIX}${kind}/`) ||
    !/^3dkid\/product-media\/(image|animation)\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(prepared.pathname) ||
    typeof prepared.clientPayload !== "string" || prepared.clientPayload.length > 2048) throw new MediaUploadError("uploadFailed");
  // Keep the Blob browser SDK out of initial/manual-only Admin field loading.
  const { upload } = await import("@vercel/blob/client");
  const result = await upload(prepared.pathname, file, { access: "public", handleUploadUrl: MEDIA_UPLOAD_URL,
    contentType: preflight.contentType, clientPayload: prepared.clientPayload, abortSignal: signal,
    onUploadProgress: ({ percentage }) => { if (Number.isFinite(percentage)) onProgress(Math.max(0, Math.min(100, Math.round(percentage)))); },
  });
  if (!isPublicBlobUrl(result.url, prepared.pathname) || result.pathname !== prepared.pathname || result.contentType !== preflight.contentType) throw new MediaUploadError("uploadFailed");
  return result.url;
}
