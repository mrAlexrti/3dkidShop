"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

export async function createCategory(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = categorySchema.parse(raw);
  await prisma.category.create({
    data: { ...parsed, imageUrl: parsed.imageUrl || null },
  });
  revalidatePath("/admin/categories");
  revalidatePath("/");
}

export async function deleteCategory(id: string) {
  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categories");
  revalidatePath("/");
}

export async function updateSiteContent(formData: FormData) {
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
