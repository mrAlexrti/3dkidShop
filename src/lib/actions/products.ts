"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/actions/require-admin";
import { httpMediaUrl, optionalHoverGifUrl, updateMainProductImage } from "@/lib/product-media";
import { sizeInputSchema } from "@/lib/product-variants";
import { syncProductSizes } from "@/lib/product-size-admin";
import { productSlugSchema, type ProductSaveResult } from "@/lib/product-slug";
import { galleryInputSchema, syncProductGallery } from "@/lib/product-gallery-admin";
import { gallerySnapshot } from "@/lib/gallery";
import { AdminInputError, boundedJson, validationResult, isUniqueFieldError, type AdminDeleteResult } from "@/lib/admin-form-validation";
import { assertMediaAttachable, enqueueSupersededMedia, lockMediaWrites, MEDIA_TRANSACTION_OPTIONS } from "@/lib/media-lifecycle";
import { RetiredMediaError } from "@/lib/media-lifecycle-policy";
import { scheduleProductMediaCleanup } from "@/lib/media-cleanup-after";

const money = z.coerce.number().finite().positive().max(99999999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < .000001);
const productSchema = z.object({
  name: z.string().trim().min(2), nameEn: z.string().trim().min(2), slug: productSlugSchema,
  description: z.string().min(5), descriptionEn: z.string().trim().min(5),
  price: money, oldPrice: z.preprocess((value) => value === "" ? null : value, money.optional().nullable()),
  isOrderable: z.boolean(), categoryId: z.string().min(1), imageUrl: httpMediaUrl.optional(),
  images: z.preprocess((value) => boundedJson(value), galleryInputSchema.optional()),
  imagesSnapshot: z.string().max(50000).optional(),
  hoverGifUrl: optionalHoverGifUrl, variants: z.preprocess((value) => boundedJson(value), sizeInputSchema.optional()),
  isFeatured: z.boolean(), isNew: z.boolean(), isActive: z.boolean(),
});

function parseProduct(formData: FormData, previousSlug?: string) {
  const raw = Object.fromEntries(formData.entries());
  const schema = previousSlug !== undefined && previousSlug === raw.slug ? productSchema.extend({ slug: z.literal(previousSlug) }) : productSchema;
  const result = schema.safeParse({ ...raw, isFeatured: raw.isFeatured === "on", isNew: raw.isNew === "on", isActive: raw.isActive === "on", isOrderable: raw.isOrderable === "on" });
  if (!result.success) {
    if (result.error.issues.some((issue) => issue.path[0] === "slug")) return { error: { error: "slugInvalid" } as ProductSaveResult };
    const error = validationResult(result.error);
    if (error && result.error.issues.some((issue) => issue.path[0] === "images" && issue.code === "too_big")) error.fieldErrors = { ...error.fieldErrors, images: "galleryLimit" };
    return { error };
  }
  if (!result.data.images && !result.data.imageUrl) return { error: { error: "validation", fieldErrors: { imageUrl: "required" } } as ProductSaveResult };
  return { data: result.data };
}

function code(error: unknown): string | undefined { return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined; }
function saveError(error: unknown): ProductSaveResult {
  if (error instanceof RetiredMediaError) return { error: "mediaRetired" };
  if (error instanceof AdminInputError) return { error: "validation", fieldErrors: { [error.field]: error.reason } };
  if (isUniqueFieldError(error, "slug")) return { error: "slugDuplicate" };
  if (code(error) === "P2003") return { error: "validation", fieldErrors: { categoryId: "invalid" } };
  if (code(error) === "P2025") return { error: "notFound" };
  console.warn("admin_product_save_failed");
  return { error: "saveFailed" };
}
function invalidate(slugs: (string | undefined)[] = []) {
  revalidatePath("/admin/products"); revalidatePath("/catalog"); revalidatePath("/");
  for (const slug of new Set(slugs)) if (slug) revalidatePath(`/product/${slug}`);
}

export async function createProduct(formData: FormData): Promise<ProductSaveResult> {
  await requireAdmin();
  const parsed = parseProduct(formData); if (!parsed.data) return parsed.error;
  const { images, imageUrl, imagesSnapshot: _snapshot, variants, ...data } = parsed.data;
  void _snapshot;
  if (images?.some((image) => image.id)) return { error: "validation", fieldErrors: { images: "galleryOwnership" } };
  const photos = images ?? [{ url: imageUrl!, alt: null }];
  try {
    await prisma.$transaction(async (tx) => {
      await lockMediaWrites(tx);
      await assertMediaAttachable(tx, [...photos.map((image) => image.url), data.hoverGifUrl, data.description, data.descriptionEn]);
      const product = await tx.product.create({ data: { ...data, images: { create: photos.map((image, order) => ({ url: image.url, alt: image.alt || null, order })) } } });
      await syncProductSizes(tx, product.id, variants ?? []);
    }, MEDIA_TRANSACTION_OPTIONS);
  } catch (error) { return saveError(error); }
  invalidate(); scheduleProductMediaCleanup();
}

export async function updateProduct(id: string, formData: FormData): Promise<ProductSaveResult> {
  await requireAdmin();
  try {
    const existing = await prisma.product.findUnique({ where: { id }, select: { slug: true } });
    if (!existing) return { error: "notFound" };
    const parsed = parseProduct(formData, existing.slug); if (!parsed.data) return parsed.error;
    const { images, imageUrl, imagesSnapshot, variants, ...data } = parsed.data;
    await prisma.$transaction(async (tx) => {
      await lockMediaWrites(tx);
      const previous = await tx.product.findUnique({ where: { id }, select: { images: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, url: true, alt: true } }, hoverGifUrl: true, description: true, descriptionEn: true } });
      if (!previous) throw { code: "P2025" };
      if (images && imagesSnapshot !== undefined && imagesSnapshot !== gallerySnapshot(previous.images)) throw new AdminInputError("images", "galleryOwnership");
      // Legacy single-image callers preserve every other gallery record.
      const nextUrls = images?.map((image) => image.url) ?? [imageUrl!, ...previous.images.slice(1).map((image) => image.url)];
      await assertMediaAttachable(tx, [...nextUrls, data.hoverGifUrl, data.description, data.descriptionEn]);
      await tx.product.update({ where: { id }, data });
      if (images) await syncProductGallery(tx, id, images);
      else await updateMainProductImage(tx, id, imageUrl!);
      if (variants !== undefined) await syncProductSizes(tx, id, variants);
      await enqueueSupersededMedia(tx, [...previous.images.map((image) => image.url), previous.hoverGifUrl, previous.description, previous.descriptionEn], [...nextUrls, data.hoverGifUrl, data.description, data.descriptionEn]);
    }, MEDIA_TRANSACTION_OPTIONS);
    invalidate([existing.slug, data.slug]);
  } catch (error) { return saveError(error); }
  scheduleProductMediaCleanup();
}

export async function deleteProduct(id: string): Promise<AdminDeleteResult> {
  try { await requireAdmin(); } catch { return { error: "forbidden" }; }
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockMediaWrites(tx);
      const previous = await tx.product.findUnique({ where: { id }, select: { slug: true, images: { select: { url: true } }, hoverGifUrl: true, description: true, descriptionEn: true } });
      if (!previous) return;
      if (await tx.orderItem.count({ where: { productId: id } }) > 0) return { error: "orderHistory" as const };
      await tx.product.delete({ where: { id } });
      await enqueueSupersededMedia(tx, [...previous.images.map((image) => image.url), previous.hoverGifUrl, previous.description, previous.descriptionEn]);
      return { slug: previous.slug };
    }, MEDIA_TRANSACTION_OPTIONS);
    if (result?.error) return { error: result.error };
    invalidate([result?.slug]); scheduleProductMediaCleanup();
  } catch (error) {
    if (["P2003", "P2014"].includes(code(error) ?? "")) return { error: "referenced" };
    if (code(error) === "P2025") return { error: "notFound" };
    console.warn("admin_product_delete_failed"); return { error: "deleteFailed" };
  }
}

export async function archiveProduct(id: string): Promise<AdminDeleteResult> {
  try { await requireAdmin(); } catch { return { error: "forbidden" }; }
  try {
    const product = await prisma.$transaction(async (tx) => {
      await lockMediaWrites(tx);
      return tx.product.update({ where: { id }, data: { isActive: false, isOrderable: false }, select: { slug: true } });
    }, MEDIA_TRANSACTION_OPTIONS);
    // Media remains referenced by the hidden product; no retirement is registered.
    invalidate([product.slug]);
  } catch (error) {
    if (code(error) === "P2025") return { error: "notFound" };
    console.warn("admin_product_archive_failed"); return { error: "deleteFailed" };
  }
}
