import { customerSession, favoritesVersion } from "@/lib/customer/session";
import { projectCart, readCart } from "@/lib/customer/cart";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const session = await customerSession();
  if (!session || request.headers.get("x-cart-scope") !== favoritesVersion(session.binding)) {
    return Response.json(null, { status: 401, headers });
  }
  const locale = await getLocale();
  const cart = await prisma.$transaction(async (tx) => projectCart(tx, await readCart(tx, session.id), locale),
    { isolationLevel: "RepeatableRead" });
  return Response.json(cart, { headers });
}
