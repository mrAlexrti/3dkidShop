"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/actions/require-admin";
import { optionalHoverGifUrl, updateMainProductImage } from "@/lib/product-media";
import { sizeInputSchema } from "@/lib/product-variants";
import { syncProductSizes } from "@/lib/product-size-admin";
import { productSlugSchema, type ProductSaveResult } from "@/lib/product-slug";
import { assertMediaAttachable, enqueueSupersededMedia, lockMediaWrites, MEDIA_TRANSACTION_OPTIONS } from "@/lib/media-lifecycle";
import { RetiredMediaError } from "@/lib/media-lifecycle-policy";
import { scheduleProductMediaCleanup } from "@/lib/media-cleanup-after";

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
  await lockMediaWrites(tx);
  await assertMediaAttachable(tx, [parsed.imageUrl, parsed.hoverGifUrl, parsed.description, parsed.descriptionEn]);
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
  }, MEDIA_TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof RetiredMediaError) return { error: "mediaRetired" };
    if (isSlugCollision(error)) return { error: "slugDuplicate" };
    throw error;
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
  scheduleProductMediaCleanup();
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
    await lockMediaWrites(tx);
    const previous = await tx.product.findUnique({ where: { id }, select: {
      hoverGifUrl: true, description: true, descriptionEn: true,
      images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 1, select: { url: true } },
    } });
    await assertMediaAttachable(tx, [parsed.imageUrl, parsed.hoverGifUrl, parsed.description, parsed.descriptionEn]);
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
    if (previous) await enqueueSupersededMedia(tx, [previous.images[0]?.url, previous.hoverGifUrl, previous.description, previous.descriptionEn],
      [parsed.imageUrl, parsed.hoverGifUrl, parsed.description, parsed.descriptionEn]);
  }, MEDIA_TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof RetiredMediaError) return { error: "mediaRetired" };
    if (isSlugCollision(error)) return { error: "slugDuplicate" };
    throw error;
  }

  revalidatePath("/admin/products");
  revalidatePath(`/product/${parsed.slug}`);
  if (existing && existing.slug !== parsed.slug) revalidatePath(`/product/${existing.slug}`);
  revalidatePath("/catalog");
  revalidatePath("/");
  scheduleProductMediaCleanup();
}

function isSlugCollision(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return false;
  const target = "meta" in error ? (error.meta as { target?: unknown } | undefined)?.target : undefined;
  return Array.isArray(target) ? target.includes("slug") : typeof target === "string" && /slug/i.test(target);
}

export async function deleteProduct(id: string) {
  await requireAdmin();

  await prisma.$transaction(async (tx) => {
    await lockMediaWrites(tx);
    const previous = await tx.product.findUnique({ where: { id }, select: { images: { select: { url: true } }, hoverGifUrl: true, description: true, descriptionEn: true } });
    if (!previous) return;
    await tx.product.delete({ where: { id } });
    await enqueueSupersededMedia(tx, [...previous.images.map((image) => image.url), previous.hoverGifUrl, previous.description, previous.descriptionEn]);
  }, MEDIA_TRANSACTION_OPTIONS);
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  scheduleProductMediaCleanup();
}
