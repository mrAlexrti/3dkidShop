import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/actions/require-admin";
import { blobUploadsConfigured, prepareMediaUpload, verifyMediaIntent, limitMediaUploads } from "@/lib/media-upload-server";
import { MEDIA_LIMITS, MEDIA_UPLOAD_URL, MediaUploadError, type MediaPreflight } from "@/lib/media-upload";
import { z } from "zod";

export const runtime = "nodejs";
const preflightSchema = z.object({ type: z.literal("prepare"), file: z.object({
  kind: z.enum(["image", "animation"]), contentType: z.string().max(64), size: z.number().int().positive(), headerHex: z.string().max(64),
}).strict() }).strict();
const tokenSchema = z.object({ type: z.literal("blob.generate-client-token"), payload: z.object({
  pathname: z.string().max(180), clientPayload: z.string().max(2048), multipart: z.literal(false),
}).strict() }).strict();
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
async function admin() {
  try { await requireAdmin(); } catch { throw new MediaUploadError("forbidden"); }
}
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new MediaUploadError("invalidRequest");
  const reader = request.body?.getReader();
  if (!reader) throw new MediaUploadError("invalidRequest");
  let length = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 16384) { await reader.cancel(); throw new MediaUploadError("invalidRequest"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch { throw new MediaUploadError("invalidRequest"); } finally { reader.releaseLock(); }
}

export async function GET() {
  try { await admin(); return json({ available: blobUploadsConfigured() }); }
  catch { return json({ error: "forbidden" }, 403); }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object") throw new MediaUploadError("invalidRequest");
    // Callbacks have no browser session/Origin. Only the SDK may authenticate them
    // using x-vercel-signature; they never issue upload grants or change products.
    if (body.type === "blob.upload-completed") {
      if (!blobUploadsConfigured()) throw new MediaUploadError("unavailable");
      if (!request.headers.get("x-vercel-signature") || !body.payload || typeof body.payload !== "object") throw new MediaUploadError("invalidRequest");
      return json(await handleUpload({ request, body: body as unknown as HandleUploadBody,
        onBeforeGenerateToken: async () => { throw new MediaUploadError("forbidden"); },
        onUploadCompleted: async () => { /* Upload only: product Save controls attachment. No DB write or deletion. */ },
      }));
    }
    await admin();
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new MediaUploadError("forbidden");
    if (!blobUploadsConfigured()) throw new MediaUploadError("unavailable");
    limitMediaUploads();
    if (body.type === "prepare") {
      const parsed = preflightSchema.safeParse(body);
      if (!parsed.success) throw new MediaUploadError("invalidRequest");
      return json(prepareMediaUpload(parsed.data.file as MediaPreflight));
    }
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw new MediaUploadError("invalidRequest");
    const result = await handleUpload({ request, body: parsed.data,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await admin();
        const intent = verifyMediaIntent(pathname, clientPayload);
        return { allowedContentTypes: [intent.contentType], maximumSizeInBytes: Math.min(intent.size, MEDIA_LIMITS[intent.kind]),
          validUntil: intent.expires, addRandomSuffix: false, allowOverwrite: false,
          callbackUrl: new URL(MEDIA_UPLOAD_URL, request.url).href,
          tokenPayload: JSON.stringify({ pathname: intent.pathname }) };
      },
      onUploadCompleted: async () => { /* Intentionally no product or media mutation. */ },
    });
    return json(result);
  } catch (error) {
    const code = error instanceof MediaUploadError ? error.code : "uploadFailed";
    const status = code === "forbidden" ? 403 : code === "unavailable" ? 503 : code === "rateLimited" ? 429 : 400;
    return json({ error: code }, status);
  }
}
