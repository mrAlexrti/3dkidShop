import { cache } from "react";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { customerSession } from "./session";
import { operationalOrderWhere } from "@/lib/payments/acceptance";

export const requireCustomer = cache(async () => {
  const customer = await customerSession();
  if (!customer) redirect("/account/sign-in");
  return customer;
});

export function ownedOrders(customerId: string): Prisma.OrderWhereInput {
  return { customerId, ...customerVisibleOrder };
}

export const customerVisibleOrder: Prisma.OrderWhereInput = {
  AND: [operationalOrderWhere, { OR: [{ paymentMode: null }, { paymentMode: { not: "sandbox" } }] }],
};
