import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { httpMediaUrl } from "@/lib/product-media";
import { AdminInputError } from "@/lib/admin-form-validation";

import { MAX_PRODUCT_IMAGES } from "@/lib/gallery";
export { MAX_PRODUCT_IMAGES } from "@/lib/gallery";
export const galleryInputSchema = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional(),
  url: httpMediaUrl.pipe(z.string().max(2048)),
  alt: z.string().trim().max(300).optional().nullable(),
})).min(1).max(MAX_PRODUCT_IMAGES).refine((images) => {
  const ids = images.flatMap((image) => image.id ? [image.id] : []);
  return new Set(ids).size === ids.length;
});
export type GalleryInput = z.infer<typeof galleryInputSchema>;
export type { ProductPhoto } from "@/lib/gallery";

// Call under the media-write lock, in the same transaction as Product Save.
export async function syncProductGallery(tx: Prisma.TransactionClient, productId: string, images: GalleryInput) {
  const existing = await tx.productImage.findMany({ where: { productId }, select: { id: true } });
  const owned = new Set(existing.map((image) => image.id));
  if (images.some((image) => image.id && !owned.has(image.id))) throw new AdminInputError("images", "galleryOwnership");
  await tx.productImage.deleteMany({ where: { productId, id: { notIn: images.flatMap((image) => image.id ? [image.id] : []) } } });
  for (const [order, image] of images.entries()) {
    const data = { url: image.url, alt: image.alt || null, order };
    if (image.id) await tx.productImage.update({ where: { id: image.id }, data });
    else await tx.productImage.create({ data: { ...data, productId } });
  }
}
