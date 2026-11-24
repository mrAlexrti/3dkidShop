import { type NextRequest, NextResponse } from "next/server";
import { customerAuthPath, customerOAuthCallback } from "@/lib/customer/auth";
import { customerOrigin, customerPost, googleEnabled, rateLimit } from "@/lib/customer/security";
import { startGoogle } from "@/lib/customer/google";

export const dynamic = "force-dynamic";

async function readForm(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded" ||
      Number(request.headers.get("content-length")) > 1024) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const buffer = new Uint8Array(1024);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return new URLSearchParams(new TextDecoder().decode(buffer.subarray(0, length)));
      if (length + value.length > buffer.length) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, length);
      length += value.length;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname !== `${customerAuthPath}/start/google`) return new Response(null, { status: 404 });
  if (!await customerPost()) return new Response(null, { status: 403 });
  const input = await readForm(request);
  if (!input) return new Response(null, { status: 400 });
  const result = await startGoogle(input);
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  const origin = customerOrigin();
  if (!googleEnabled() || request.nextUrl.pathname !== `${customerAuthPath}/callback/google`) return new Response(null, { status: 404 });
  if (request.headers.get("host") !== new URL(origin).host || !await rateLimit("googleCallback")) {
    return NextResponse.redirect(new URL("/account/sign-in?error=OAuth", origin));
  }
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, origin);
  const response = await customerOAuthCallback(new Request(url, { headers: request.headers }));
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}
