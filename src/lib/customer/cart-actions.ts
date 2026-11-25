"use server";

import { getLocale } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { activeCustomerSession, customerSession, favoritesVersion, lockCustomer } from "./session";
import { customerPost, rateLimit } from "./security";
import { cartMutation, type CartMutationResult } from "./cart-contract";
import { mutateCart } from "./cart";

export async function changeAccountCart(scope: unknown, input: unknown): Promise<CartMutationResult> {
  if (!await customerPost()) return { problem: "auth" };
  const mutation = cartMutation.safeParse(input);
  if (!mutation.success) return { problem: "retry" };
  const session = await customerSession();
  if (!session || favoritesVersion(session.binding) !== scope) return { problem: "auth" };
  if (!await rateLimit("cart:write", session.id, 240, { ip: 480, shared: 1500, global: 4800 })) return { problem: "retry" };
  const locale = await getLocale();
  return prisma.$transaction(async (tx) => {
    if (!await lockCustomer(tx, session.id) || !await activeCustomerSession(tx, session.id, session.binding)) return { problem: "auth" };
    return mutateCart(tx, session.id, mutation.data, locale);
  });
}
