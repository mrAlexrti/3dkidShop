import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getCanonicalHost() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!siteUrl) return "";

  try {
    return new URL(siteUrl).host;
  } catch {
    return "";
  }
}

function shouldRedirectToCanonical(req: NextRequest) {
  const canonicalHost = getCanonicalHost();
  const requestHost = req.nextUrl.host;

  return (
    process.env.VERCEL_ENV === "production" &&
    Boolean(canonicalHost) &&
    requestHost !== canonicalHost &&
    requestHost.startsWith("3dkid-shop-y8ut-") &&
    requestHost.endsWith(".vercel.app")
  );
}

export default async function middleware(req: NextRequest) {
  if (shouldRedirectToCanonical(req)) {
    const canonicalUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${getCanonicalHost()}`);
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");

  if (isAdminRoute) {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET });
    const isAdmin = token?.role === "ADMIN";

    if (!isAdmin) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
