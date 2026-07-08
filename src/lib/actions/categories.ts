"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/actions/require-admin";

const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  parentId: z.string().optional().or(z.literal("")),
});

export async function createCategory(formData: FormData) {
  await requireAdmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = categorySchema.parse(raw);
  await prisma.category.create({
    data: {
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description || null,
      imageUrl: parsed.imageUrl || null,
      parentId: parsed.parentId || null,
    },
  });
  revalidatePath("/admin/categories");
  revalidatePath("/");
}

export async function updateCategory(id: string, formData: FormData) {
  await requireAdmin();

  const raw = Object.fromEntries(formData.entries());
  const parsed = categorySchema.parse(raw);
  // Категория не может быть собственным родителем.
  const parentId = parsed.parentId && parsed.parentId !== id ? parsed.parentId : null;
  await prisma.category.update({
    where: { id },
    data: {
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description || null,
      imageUrl: parsed.imageUrl || null,
      parentId,
    },
  });
  revalidatePath("/admin/categories");
  revalidatePath("/");
}

export async function deleteCategory(id: string) {
  await requireAdmin();

  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categories");
  revalidatePath("/");
}

export async function updateSiteContent(formData: FormData) {
  await requireAdmin();

  const entries = Object.fromEntries(formData.entries()) as Record<string, string>;
  await Promise.all(
    Object.entries(entries).map(([key, value]) =>
      prisma.siteContent.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );
  revalidatePath("/");
  revalidatePath("/admin/content");
}
