import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { FAVICON_BLOB_PREFIX, FAVICON_KEY, faviconRevision, type FaviconSize } from "@/lib/favicon-config";
import { FAVICON_PACK_LIMIT, faviconFrames } from "@/lib/favicon-pack";
import { isPublicBlobUrl, MediaUploadError } from "@/lib/media-upload";

const cacheTag = "storefront-favicon";
const icoType = "image/x-icon";
const getPublishedUrl = unstable_cache(async () => {
  const setting = await prisma.siteContent.findUnique({ where: { key: FAVICON_KEY }, select: { value: true } });
  return setting?.value ?? "";
}, [FAVICON_KEY], { tags: [cacheTag], revalidate: 300 });

export async function boundedFaviconBody(source: Request | Response, limit: number) {
  if (Number(source.headers.get("content-length")) > limit) throw new MediaUploadError("tooLarge");
  const reader = source.body?.getReader();
  if (!reader) throw new MediaUploadError("invalidFile");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks, size);
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new MediaUploadError("tooLarge");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function savePublishedUrl(value: string) {
  await prisma.siteContent.upsert({
    where: { key: FAVICON_KEY }, create: { key: FAVICON_KEY, value }, update: { value },
  });
  revalidateTag(cacheTag);
}

export async function publishFavicon(pack: Buffer) {
  const revision = randomUUID().replaceAll("-", "");
  const pathname = `${FAVICON_BLOB_PREFIX}${revision}.ico`;
  const blob = await put(pathname, pack, {
    access: "public", contentType: icoType, addRandomSuffix: false, allowOverwrite: false, abortSignal: AbortSignal.timeout(10000),
  });
  if (blob.pathname !== pathname || !isPublicBlobUrl(blob.url, pathname)) throw new MediaUploadError("uploadFailed");
  await savePublishedUrl(blob.url);
  return revision;
}

export async function resetFavicon() {
  await savePublishedUrl("");
}

function packagedFavicon(size: FaviconSize | "ico") {
  return readFile(join(process.cwd(), "assets", "brand", "favicon", size === "ico" ? "favicon.ico" : `favicon-${size}.png`));
}

export async function serveFavicon(request: Request, size: FaviconSize | "ico") {
  let bytes: Buffer | undefined;
  let cacheControl = "public, max-age=0, must-revalidate";
  try {
    const url = await getPublishedUrl();
    if (faviconRevision(url)) {
      // The Blob URL is immutable. Cache the bytes independently of the mutable setting.
      const response = await fetch(url, { cache: "force-cache", redirect: "error", signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new Error("Favicon storage unavailable");
      const pack = await boundedFaviconBody(response, FAVICON_PACK_LIMIT);
      const frames = faviconFrames(pack);
      bytes = size === "ico" ? pack : frames.get(size);
    }
  } catch {
    // Don't retain a fallback for a temporary database or Blob failure.
    cacheControl = "no-store";
  }
  bytes ??= await packagedFavicon(size);
  const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
  const headers = {
    "Content-Type": size === "ico" ? icoType : "image/png",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
  };
  const validators = request.headers.get("if-none-match")?.split(",").map(value => value.trim().replace(/^W\//, ""));
  if (validators?.includes(etag) || validators?.includes("*")) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
}
