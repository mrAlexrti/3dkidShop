import { z } from "zod";
import type { CartItem } from "@/types";
import { MAX_CART_LINES, MAX_QUANTITY } from "@/lib/cart-limits";
import { requestedSizeId } from "@/lib/cart-items";
import { combinationSelectionSchema } from "@/lib/product-configuration";
import { productLineId } from "@/lib/product-variants";
import type { CartIssue } from "@/lib/cart-reconciliation";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const quantity = z.number().int().min(1).max(MAX_QUANTITY);
export const cartRevision = z.number().int().min(0).max(MAX_QUANTITY);
export const cartProof = z.object({ scope: z.string().regex(/^[a-f0-9]{64}$/), revision: cartRevision }).strict();

const configuration = z.object({
  productId: id,
  sizeId: id.optional(),
  selection: combinationSelectionSchema.optional(),
  quantity,
}).strict();
export type CartLineInput = z.infer<typeof configuration>;
const inputLine = configuration.refine((line) => !line.sizeId || !line.selection);
export const cartLineId = (line: CartLineInput) => line.selection
  ? line.productId + ":variant:" + line.selection.variantId
  : productLineId(line.productId, line.sizeId);

// Include all selections so a forged alternate selection for an existing ID
// cannot match or silently update the stored line.
export const cartLineKey = (line: CartLineInput) => JSON.stringify([
  line.productId, line.sizeId ?? null, line.selection?.variantId ?? null,
  line.selection?.values.COLOR ?? null, line.selection?.values.SIZE ?? null,
]);
export function cartLineInput(item: CartItem): CartLineInput {
  const sizeId = requestedSizeId(item);
  return { productId: item.productId, quantity: item.quantity,
    ...(item.selection && !sizeId ? { selection: item.selection } : sizeId ? { sizeId } : {}) };
}

const storedLine = configuration.extend({ generation: z.string().uuid(), removed: z.number().int().nonnegative() })
  .refine((line) => !line.sizeId || !line.selection);
export const storedCart = z.array(storedLine).max(MAX_CART_LINES);
export type StoredCartLine = z.infer<typeof storedLine>;
export const purchaseLines = z.array(z.object({
  generation: z.string().uuid(), removed: z.number().int().nonnegative(), quantity,
}).strict()).max(MAX_CART_LINES);

export const cartMutation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), line: inputLine, revision: cartRevision }).strict(),
  z.object({ type: z.literal("set"), id: z.string().min(1).max(265), quantity: z.number().int().min(0).max(MAX_QUANTITY), revision: cartRevision }).strict(),
  z.object({ type: z.literal("merge"), batch: z.string().uuid(), lines: z.array(inputLine).min(1).max(MAX_CART_LINES) }).strict(),
]);

export type CartMutation = z.infer<typeof cartMutation>;
export type CartSnapshot = {
  revision: number;
  items: CartItem[];
  issues: Record<string, CartIssue>;
};
export type CartMutationResult = { snapshot: CartSnapshot; accepted?: Record<string, number>; problem?: "conflict" | "limit" | "unavailable" | "merge" } |
  { problem: "auth" | "retry" };
