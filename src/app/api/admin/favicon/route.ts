import { requireAdmin } from "@/lib/actions/require-admin";
import { FAVICON_UPLOAD_LIMIT } from "@/lib/favicon-config";
import { renderFavicon } from "@/lib/favicon-image";
import { boundedFaviconBody, publishFavicon, resetFavicon } from "@/lib/favicon-store";
import { MEDIA_TYPES, MediaUploadError, uploadErrorCode } from "@/lib/media-upload";
import { blobUploadsConfigured, limitMediaUploads } from "@/lib/media-upload-server";

function result(data: { revision: string | null } | { error: string }, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

async function authorize(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new MediaUploadError("forbidden");
  try { await requireAdmin(); } catch { throw new MediaUploadError("forbidden"); }
  limitMediaUploads();
}

function failure(error: unknown) {
  const code = uploadErrorCode(error);
  const statuses = { forbidden: 403, unavailable: 503, rateLimited: 429, tooLarge: 413, unsupported: 415, uploadFailed: 500 };
  return result({ error: code }, statuses[code as keyof typeof statuses] ?? 400);
}

export async function POST(request: Request) {
  try {
    await authorize(request);
    if (!blobUploadsConfigured()) throw new MediaUploadError("unavailable");
    const type = request.headers.get("content-type") ?? "";
    if (!(MEDIA_TYPES.image as readonly string[]).includes(type)) throw new MediaUploadError("unsupported");
    const pack = await renderFavicon(await boundedFaviconBody(request, FAVICON_UPLOAD_LIMIT), type);
    return result({ revision: await publishFavicon(pack) });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    await authorize(request);
    await resetFavicon();
    return result({ revision: null });
  } catch (error) { return failure(error); }
}
