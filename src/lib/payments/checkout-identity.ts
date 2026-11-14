import { createHash, createHmac } from "node:crypto";
import { getAuthSecret } from "@/lib/server-env";
import { requestedSizeId } from "@/lib/cart-items";
import type { CartItem } from "@/types";

export function checkoutIdentity(key: string, data: object, items: CartItem[]) {
  if (!/^[a-f0-9-]{36,64}$/i.test(key)) throw new Error("INVALID_CHECKOUT_KEY");
  const secret = getAuthSecret();
  if (!secret) throw new Error("CHECKOUT_SECRET_MISSING");
  const lines = items.map((item) => ({ productId: item.productId, size: requestedSizeId(item) ?? null, quantity: item.quantity }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    checkoutKeyHash: createHash("sha256").update(key).digest("hex"),
    checkoutPayloadHash: createHmac("sha256", secret).update(JSON.stringify({ data, lines })).digest("hex"),
  };
}
