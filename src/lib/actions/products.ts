"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/actions/require-admin";
import { optionalHoverGifUrl, updateMainProductImage } from "@/lib/product-media";
import { sizeInputSchema } from "@/lib/product-variants";
import { syncProductSizes } from "@/lib/product-size-admin";

const productSchema = z.object({
  name: z.string().min(2),
  nameEn: z.string().trim().min(2),
  slug: z.string().min(2),
  description: z.string().min(5),
  descriptionEn: z.string().trim().min(5),
  price: z.coerce.number().positive(),
  oldPrice: z.coerce.number().optional().nullable(),
  isOrderable: z.boolean(),
  categoryId: z.string().min(1),
  imageUrl: z.string().url(),
  hoverGifUrl: optionalHoverGifUrl,
  variants: z.preprocess((value) => typeof value === "string" ? JSON.parse(value) : value, sizeInputSchema.optional()),
  isFeatured: z.coerce.boolean().optional(),
  isNew: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function createProduct(formData: FormData) {
  await requireAdmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse({
    ...raw,
    isFeatured: raw.isFeatured === "on",
    isNew: raw.isNew === "on",
    isActive: raw.isActive === "on",
    isOrderable: raw.isOrderable === "on",
  });

  await prisma.$transaction(async (tx) => {
  const product = await tx.product.create({
    data: {
      name: parsed.name,
      nameEn: parsed.nameEn,
      slug: parsed.slug,
      description: parsed.description,
      descriptionEn: parsed.descriptionEn,
      price: parsed.price,
      oldPrice: parsed.oldPrice || null,
      isOrderable: parsed.isOrderable,
      categoryId: parsed.categoryId,
      isFeatured: !!parsed.isFeatured,
      isNew: !!parsed.isNew,
      isActive: parsed.isActive ?? true,
      images: { create: [{ url: parsed.imageUrl, order: 0 }] },
      hoverGifUrl: parsed.hoverGifUrl,
    },
  });
  await syncProductSizes(tx, product.id, parsed.variants ?? []);
  });

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
}

export async function updateProduct(id: string, formData: FormData) {
  await requireAdmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse({
    ...raw,
    isFeatured: raw.isFeatured === "on",
    isNew: raw.isNew === "on",
    isActive: raw.isActive === "on",
    isOrderable: raw.isOrderable === "on",
  });

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        name: parsed.name,
        nameEn: parsed.nameEn,
        slug: parsed.slug,
        description: parsed.description,
        descriptionEn: parsed.descriptionEn,
        price: parsed.price,
        oldPrice: parsed.oldPrice || null,
        isOrderable: parsed.isOrderable,
        categoryId: parsed.categoryId,
        isFeatured: !!parsed.isFeatured,
        isNew: !!parsed.isNew,
        isActive: parsed.isActive ?? true,
        hoverGifUrl: parsed.hoverGifUrl,
      },
    });
    await updateMainProductImage(tx, id, parsed.imageUrl);
    if (parsed.variants !== undefined) await syncProductSizes(tx, id, parsed.variants);
  });

  revalidatePath("/admin/products");
  revalidatePath(`/product/${parsed.slug}`);
  revalidatePath("/catalog");
  revalidatePath("/");
}

export async function deleteProduct(id: string) {
  await requireAdmin();

  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
}
