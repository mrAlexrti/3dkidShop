import { NextResponse } from "next/server";
import { findProductSuggestions, MAX_SEARCH_LENGTH } from "@/lib/product-search";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const locale = params.get("locale") ?? "ua";
  if (query.length > MAX_SEARCH_LENGTH || (locale !== "ua" && locale !== "en")) {
    return NextResponse.json({ products: [] }, { status: 400, headers });
  }
  try {
    return NextResponse.json({ products: await findProductSuggestions(query, locale) }, { headers });
  } catch {
    console.error("Product suggestion query failed");
    return NextResponse.json({ products: [] }, { status: 503, headers });
  }
}
