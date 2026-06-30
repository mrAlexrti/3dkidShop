"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().min(5),
  price: z.coerce.number().positive(),
  oldPrice: z.coerce.number().optional().nullable(),
  stock: z.coerce.number().int().nonnegative(),
  categoryId: z.string().min(1),
  imageUrl: z.string().url(),
  isFeatured: z.coerce.boolean().optional(),
  isNew: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function createProduct(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse({
    ...raw,
    isFeatured: raw.isFeatured === "on",
    isNew: raw.isNew === "on",
    isActive: raw.isActive === "on",
  });

  await prisma.product.create({
    data: {
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      price: parsed.price,
      oldPrice: parsed.oldPrice || null,
      stock: parsed.stock,
      categoryId: parsed.categoryId,
      isFeatured: !!parsed.isFeatured,
      isNew: !!parsed.isNew,
      isActive: parsed.isActive ?? true,
      images: { create: [{ url: parsed.imageUrl, order: 0 }] },
    },
  });

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
}

export async function updateProduct(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse({
    ...raw,
    isFeatured: raw.isFeatured === "on",
    isNew: raw.isNew === "on",
    isActive: raw.isActive === "on",
  });

  await prisma.product.update({
    where: { id },
    data: {
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      price: parsed.price,
      oldPrice: parsed.oldPrice || null,
      stock: parsed.stock,
      categoryId: parsed.categoryId,
      isFeatured: !!parsed.isFeatured,
      isNew: !!parsed.isNew,
      isActive: parsed.isActive ?? true,
    },
  });

  revalidatePath("/admin/products");
  revalidatePath(`/product/${parsed.slug}`);
  revalidatePath("/catalog");
}

export async function deleteProduct(id: string) {
  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
}
