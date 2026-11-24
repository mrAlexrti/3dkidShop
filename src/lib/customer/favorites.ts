"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { activeCustomerSession, customerSession, favoritesVersion, lockCustomer } from "./session";
import { customerPost, identifier } from "./security";

export async function changeFavorites(version: unknown, input: unknown) {
  if (!await customerPost()) return null;
  const session = await customerSession();
  if (!session || version !== favoritesVersion(session.binding)) return null;
  const action = z.discriminatedUnion("type", [
    z.object({ type: z.literal("set"), productId: identifier, saved: z.boolean() }),
    z.object({ type: z.literal("merge"), ids: z.array(identifier).max(200) }),
  ]).safeParse(input);
  if (!action.success) return null;
  const productIds = action.data.type === "merge" ? action.data.ids : [action.data.productId];
  const save = () => prisma.$transaction(async (tx) => {
    if (!await lockCustomer(tx, session.id) || !await activeCustomerSession(tx, session.id, session.binding)) return null;
    if (action.data.type === "set" && !action.data.saved) {
      await tx.customerFavorite.deleteMany({ where: { userId: session.id, productId: action.data.productId } });
    } else {
      const products = await tx.product.findMany({ where: { id: { in: productIds }, isActive: true }, select: { id: true } });
      if (products.length) await tx.customerFavorite.createMany({ data: products.map(({ id }) => ({ userId: session.id, productId: id })), skipDuplicates: true });
    }
    return (await tx.customerFavorite.findMany({ where: { userId: session.id }, select: { productId: true } })).map((row) => row.productId);
  });
  // A catalog deletion can win between lookup and insertion.
  const result = await save().catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return save();
    throw error;
  });
  if (result) revalidatePath("/account/favorites");
  return result;
}
