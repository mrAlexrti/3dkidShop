import { customerSession, favoritesVersion } from "@/lib/customer/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await customerSession();
  const ids = session ? (await prisma.customerFavorite.findMany({ where: { userId: session.id }, select: { productId: true } })).map((row) => row.productId) : null;
  return Response.json({ ids, version: session ? favoritesVersion(session.binding) : null },
    { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}
