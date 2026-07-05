import { NextResponse } from "next/server";
import { getAuthDiagnostics, readServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";

function getUrlHost(value: string) {
  if (!value) return null;

  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

export function GET() {
  const diagnostics = getAuthDiagnostics();

  return NextResponse.json(
    {
      ...diagnostics,
      nextAuthUrlHost: getUrlHost(readServerEnv("NEXTAUTH_URL")),
      authUrlHost: getUrlHost(readServerEnv("AUTH_URL")),
      canonicalUrlHost: getUrlHost(
        readServerEnv("NEXT_PUBLIC_SITE_URL") || readServerEnv("SITE_URL") || readServerEnv("NEXTAUTH_URL") || readServerEnv("AUTH_URL"),
      ),
      credentialsProviderId: "credentials",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}