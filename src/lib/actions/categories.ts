"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/require-admin";
import { isFontThemeId } from "@/lib/fonts";
import { SITE_FONT_KEY } from "@/lib/site-settings";

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

async function assertValidParent(
  tx: Prisma.TransactionClient,
  parentId: string | null,
  categoryId?: string
) {
  if (!parentId) return;

  let cursorId: string | null = parentId;
  let depth = 0;
  while (cursorId) {
    if (cursorId === categoryId) throw new Error("Категория не может быть собственным предком");

    const cursor: { id: string; parentId: string | null } | null = await tx.category.findUnique({
      where: { id: cursorId },
      select: { id: true, parentId: true },
    });
    if (!cursor) throw new Error("Родительская категория не существует");

    if (depth === 0 && cursor.parentId !== null) {
      throw new Error("Разрешён только один уровень подкатегорий");
    }

    cursorId = cursor.parentId;
    depth += 1;
    if (depth > 100) throw new Error("Обнаружен цикл категорий");
  }
}

export async function createCategory(formData: FormData) {
  await requireAdmin();
  const parsed = categorySchema.parse(Object.fromEntries(formData.entries()));
  const parentId = parsed.parentId || null;

  await prisma.$transaction(async (tx) => {
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
  });

  revalidateCategoryViews();
}

export async function updateCategory(id: string, formData: FormData) {
  await requireAdmin();
  const parsed = categorySchema.parse(Object.fromEntries(formData.entries()));
  const parentId = parsed.parentId || null;

  await prisma.$transaction(async (tx) => {
    const current = await tx.category.findUnique({
      where: { id },
      select: { id: true, children: { select: { id: true }, take: 1 } },
    });
    if (!current) throw new Error("Категория не существует");
    if (parentId && current.children.length > 0) {
      throw new Error("Категория с подкатегориями не может стать подкатегорией");
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
  });

  revalidateCategoryViews();
}

export async function deleteCategory(id: string) {
  await requireAdmin();

  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id },
      select: { _count: { select: { products: true, children: true } } },
    });
    if (!category) return;
    if (category._count.products > 0 || category._count.children > 0) {
      throw new Error("Нельзя удалить непустую категорию или категорию с подкатегориями");
    }
    await tx.category.delete({ where: { id } });
  });

  revalidateCategoryViews();
}

export async function updateSiteContent(formData: FormData) {
  await requireAdmin();

  const entries = Object.fromEntries(formData.entries()) as Record<string, string>;
  const siteFont = entries[SITE_FONT_KEY];
  if (siteFont !== undefined && !isFontThemeId(siteFont)) {
    throw new Error("Недопустимая тема шрифта");
  }

  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) =>
      prisma.siteContent.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  revalidatePath("/", "layout");
  revalidatePath("/admin/content");
}
