"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/require-admin";
import { isFontThemeId } from "@/lib/fonts";
import { SITE_FONT_KEY } from "@/lib/site-settings";
import { storefrontContentSchema, STOREFRONT_CONTENT_KEYS } from "@/lib/site-content";
import { assertMediaAttachable, enqueueSupersededMedia, lockMediaWrites, MEDIA_TRANSACTION_OPTIONS } from "@/lib/media-lifecycle";
import { scheduleProductMediaCleanup } from "@/lib/media-cleanup-after";
import { AdminInputError, validationResult, isUniqueFieldError, type AdminFormResult, type AdminDeleteResult } from "@/lib/admin-form-validation";
import { RetiredMediaError } from "@/lib/media-lifecycle-policy";

const categorySchema = z.object({
  name: z.string().trim().min(2),
  nameEn: z.string().trim().min(2),
  slug: z.string().trim().min(2),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  parentId: z.string().trim().optional().or(z.literal("")),
  order: z.coerce.number().int(),
});

function revalidateCategoryViews() {
  revalidatePath("/", "layout");
  revalidatePath("/catalog");
  revalidatePath("/admin/categories");
}
function categoryError(error: unknown): AdminFormResult {
  if (error instanceof AdminInputError) return { error: "validation", fieldErrors: { [error.field]: error.reason } };
  if (error instanceof RetiredMediaError) return { error: "mediaRetired" };
  if (error && typeof error === "object" && "code" in error) {
    if (isUniqueFieldError(error, "slug")) return { error: "slugDuplicate" };
    if (error.code === "P2003") return { error: "validation", fieldErrors: { parentId: "parentInvalid" } };
    if (error.code === "P2025") return { error: "notFound" };
  }
  console.warn("admin_category_or_content_save_failed"); return { error: "saveFailed" };
}

async function assertValidParent(
  tx: Prisma.TransactionClient,
  parentId: string | null,
  categoryId?: string
) {
  if (!parentId) return;

  let cursorId: string | null = parentId;
  let depth = 0;
  while (cursorId) {
    if (cursorId === categoryId) throw new AdminInputError("parentId", "parentInvalid");

    const cursor: { id: string; parentId: string | null } | null = await tx.category.findUnique({
      where: { id: cursorId },
      select: { id: true, parentId: true },
    });
    if (!cursor) throw new AdminInputError("parentId", "parentInvalid");

    if (depth === 0 && cursor.parentId !== null) {
      throw new AdminInputError("parentId", "parentInvalid");
    }

    cursorId = cursor.parentId;
    depth += 1;
    if (depth > 100) throw new AdminInputError("parentId", "parentInvalid");
  }
}

export async function createCategory(formData: FormData): Promise<AdminFormResult> {
  await requireAdmin();
  const result = categorySchema.safeParse(Object.fromEntries(formData.entries()), { reportInput: true });
  if (!result.success) return validationResult(result.error);
  const parsed = result.data;
  const parentId = parsed.parentId || null;

  try { await prisma.$transaction(async (tx) => {
    await lockMediaWrites(tx);
    await assertMediaAttachable(tx, [parsed.imageUrl, parsed.description]);
    await assertValidParent(tx, parentId);
    await tx.category.create({
      data: {
        name: parsed.name,
        nameEn: parsed.nameEn,
        slug: parsed.slug,
        description: parsed.description || null,
        imageUrl: parsed.imageUrl || null,
        parentId,
        order: parsed.order,
      },
    });
  }, MEDIA_TRANSACTION_OPTIONS); } catch (error) { return categoryError(error); }

  revalidateCategoryViews();
  scheduleProductMediaCleanup();
}

export async function updateCategory(id: string, formData: FormData): Promise<AdminFormResult> {
  await requireAdmin();
  const result = categorySchema.safeParse(Object.fromEntries(formData.entries()), { reportInput: true });
  if (!result.success) return validationResult(result.error);
  const parsed = result.data;
  const parentId = parsed.parentId || null;

  try { await prisma.$transaction(async (tx) => {
    await lockMediaWrites(tx);
    await assertMediaAttachable(tx, [parsed.imageUrl, parsed.description]);
    const current = await tx.category.findUnique({
      where: { id },
      select: { id: true, imageUrl: true, description: true, children: { select: { id: true }, take: 1 } },
    });
    if (!current) throw { code: "P2025" };
    if (parentId && current.children.length > 0) {
      throw new AdminInputError("parentId", "parentInvalid");
    }

    await assertValidParent(tx, parentId, id);
    await tx.category.update({
      where: { id },
      data: {
        name: parsed.name,
        nameEn: parsed.nameEn,
        slug: parsed.slug,
        description: parsed.description || null,
        imageUrl: parsed.imageUrl || null,
        parentId,
        order: parsed.order,
      },
    });
    await enqueueSupersededMedia(tx, [current.imageUrl, current.description], [parsed.imageUrl, parsed.description]);
  }, MEDIA_TRANSACTION_OPTIONS); } catch (error) { return categoryError(error); }

  revalidateCategoryViews();
  scheduleProductMediaCleanup();
}

export async function deleteCategory(id: string): Promise<AdminDeleteResult> {
  try { await requireAdmin(); } catch { return { error: "forbidden" }; }

  try { const result = await prisma.$transaction(async (tx) => {
    await lockMediaWrites(tx);
    // FK attachments take KEY SHARE on this parent. Serialize the dependency
    // check with inserts/reparenting; RESTRICT remains the backstop for all writers.
    await tx.$queryRaw`SELECT id FROM public."Category" WHERE id=${id} FOR UPDATE`;
    const category = await tx.category.findUnique({
      where: { id },
      select: { imageUrl: true, description: true, _count: { select: { products: true, children: true } } },
    });
    if (!category) return { error: "notFound" as const };
    if (category._count.products > 0) return { error: "categoryProducts" as const };
    if (category._count.children > 0) return { error: "categoryChildren" as const };
    await tx.category.delete({ where: { id } });
    await enqueueSupersededMedia(tx, [category.imageUrl, category.description]);
  }, MEDIA_TRANSACTION_OPTIONS);
  if (result?.error) return result;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const sqlState = error && typeof error === "object" && "meta" in error ? (error.meta as { code?: string } | undefined)?.code : undefined;
    if (["P2003", "P2014"].includes(String(code)) || ["23001", "23503"].includes(sqlState ?? "")) return { error: "referenced" };
    if (code === "P2025") return { error: "notFound" };
    console.warn("admin_category_delete_failed"); return { error: "deleteFailed" };
  }

  revalidateCategoryViews();
  scheduleProductMediaCleanup();
}

export async function updateSiteContent(formData: FormData): Promise<AdminFormResult> {
  await requireAdmin();

  const raw = Object.fromEntries(formData.entries());
  const result = storefrontContentSchema.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([key]) => STOREFRONT_CONTENT_KEYS.includes(key))), { reportInput: true }
  );
  if (!result.success) return validationResult(result.error);
  const entries: Record<string, string> = result.data;
  if (typeof raw[SITE_FONT_KEY] === "string") entries[SITE_FONT_KEY] = raw[SITE_FONT_KEY];
  const siteFont = entries[SITE_FONT_KEY];
  if (siteFont !== undefined && !isFontThemeId(siteFont)) {
    return { error: "validation", fieldErrors: { [SITE_FONT_KEY]: "invalid" } };
  }

  try { await prisma.$transaction(async (tx) => {
    await lockMediaWrites(tx);
    await assertMediaAttachable(tx, Object.values(entries));
    const previous = await tx.siteContent.findMany({ where: { key: { in: Object.keys(entries) } }, select: { value: true } });
    for (const [key, value] of Object.entries(entries)) {
      await tx.siteContent.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    await enqueueSupersededMedia(tx, previous.map((row) => row.value), Object.values(entries));
  }, MEDIA_TRANSACTION_OPTIONS); } catch (error) { return categoryError(error); }

  revalidatePath("/", "layout");
  revalidatePath("/admin/content");
  revalidatePath("/about");
  scheduleProductMediaCleanup();
}
