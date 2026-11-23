import { createHash, createHmac } from "node:crypto";
import { getAuthSecret } from "@/lib/server-env";
import { checkoutSelectionLines } from "@/lib/cart-items";
import type { CartItem } from "@/types";

export function checkoutIdentity(key: string, data: object, items: CartItem[]) {
  if (!/^[a-f0-9-]{36,64}$/i.test(key)) throw new Error("INVALID_CHECKOUT_KEY");
  const secret = getAuthSecret();
  if (!secret) throw new Error("CHECKOUT_SECRET_MISSING");
  const lines = checkoutSelectionLines(items);
  return {
    checkoutKeyHash: createHash("sha256").update(key).digest("hex"),
    checkoutPayloadHash: createHmac("sha256", secret).update(JSON.stringify({ data, lines })).digest("hex"),
  };
}
