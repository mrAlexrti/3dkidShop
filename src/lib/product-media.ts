import { z } from "zod";
import type { Prisma } from "@prisma/client";

// Validate URLs without fetching administrator-supplied remote resources on the server.
export const httpMediaUrl = z.string().trim().url().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
});

export const optionalHoverGifUrl = z.string().trim().pipe(z.union([z.literal(""), httpMediaUrl]))
  .optional().transform((value) => value || null);

// Edit the same first image shown by the storefront; preserve gallery records and IDs.
export async function updateMainProductImage(tx: Prisma.TransactionClient, productId: string, url: string) {
  const main = await tx.productImage.findFirst({
    where: { productId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  if (!main) {
    await tx.productImage.create({ data: { productId, url, order: 0 } });
  } else if (main.url !== url) {
    await tx.productImage.update({ where: { id: main.id }, data: { url } });
  }
}
