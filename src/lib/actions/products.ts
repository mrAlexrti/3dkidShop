"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/actions/require-admin";
import { optionalHoverGifUrl, updateMainProductImage } from "@/lib/product-media";
import { sizeInputSchema } from "@/lib/product-variants";
import { syncProductSizes } from "@/lib/product-size-admin";
import { productSlugSchema, type ProductSaveResult } from "@/lib/product-slug";

const productSchema = z.object({
  name: z.string().min(2),
  nameEn: z.string().trim().min(2),
  slug: productSlugSchema,
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

export async function createProduct(formData: FormData): Promise<ProductSaveResult> {
  await requireAdmin();

  const raw = Object.fromEntries(formData.entries());
  if (!productSlugSchema.safeParse(raw.slug).success) return { error: "slugInvalid" };
  const parsed = productSchema.parse({
    ...raw,
    isFeatured: raw.isFeatured === "on",
    isNew: raw.isNew === "on",
    isActive: raw.isActive === "on",
    isOrderable: raw.isOrderable === "on",
  });

  try {
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
  } catch (error) {
    if (isSlugCollision(error)) return { error: "slugDuplicate" };
    throw error;
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
}

export async function updateProduct(id: string, formData: FormData): Promise<ProductSaveResult> {
  await requireAdmin();

  const raw = Object.fromEntries(formData.entries());
  // Existing historical URLs remain valid when unchanged, including pre-normalization slugs.
  const existing = await prisma.product.findUnique({ where: { id }, select: { slug: true } });
  const unchangedSlug = existing?.slug === raw.slug;
  if (!unchangedSlug && !productSlugSchema.safeParse(raw.slug).success) return { error: "slugInvalid" };
  const parsed = productSchema.extend({ slug: unchangedSlug ? z.literal(existing!.slug) : productSlugSchema }).parse({
    ...raw,
    isFeatured: raw.isFeatured === "on",
    isNew: raw.isNew === "on",
    isActive: raw.isActive === "on",
    isOrderable: raw.isOrderable === "on",
  });

  try {
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
  } catch (error) {
    if (isSlugCollision(error)) return { error: "slugDuplicate" };
    throw error;
  }

  revalidatePath("/admin/products");
  revalidatePath(`/product/${parsed.slug}`);
  if (existing && existing.slug !== parsed.slug) revalidatePath(`/product/${existing.slug}`);
  revalidatePath("/catalog");
  revalidatePath("/");
}

function isSlugCollision(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return false;
  const target = "meta" in error ? (error.meta as { target?: unknown } | undefined)?.target : undefined;
  return Array.isArray(target) ? target.includes("slug") : typeof target === "string" && /slug/i.test(target);
}

export async function deleteProduct(id: string) {
  await requireAdmin();

  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
}
