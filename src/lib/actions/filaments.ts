"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/require-admin";
import { filamentFacets, filamentInput, requirementInput } from "@/lib/filaments";
import { boundedJson, validationResult, type AdminFormResult } from "@/lib/admin-form-validation";
import { flushVariantConstraints, lockProductConfiguration } from "@/lib/variant-transaction";

function invalidate() {
  revalidatePath("/admin/filaments");
  revalidatePath("/admin/products/[id]/edit", "page");
  revalidatePath("/admin/products/[id]/filaments/[variantId]", "page");
  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath("/product/[slug]", "page");
}

export async function saveFilament(id: string | null, form: FormData): Promise<AdminFormResult> {
  await requireAdmin();
  const parsed = filamentInput.safeParse(Object.fromEntries(form), { reportInput: true });
  if (!parsed.success) return validationResult(parsed.error);
  try {
    await prisma.$transaction(async (tx) => {
      // Reuse spelling from existing directory entries, even on concurrent creates.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(181, 1)`;
      const data = parsed.data;
      for (const facet of filamentFacets) {
        const match = await tx.filament.findFirst({
          where: { [facet]: { equals: data[facet], mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
          orderBy: { id: "asc" },
        });
        if (match) data[facet] = match[facet];
      }
      if (id) await tx.filament.update({ where: { id }, data });
      else await tx.filament.create({ data });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "validation", fieldErrors: { color: "optionDuplicate" } };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { error: "notFound" };
    return { error: "saveFailed" };
  }
  invalidate();
}

export async function setFilamentAvailability(id: string, isAvailable: boolean): Promise<AdminFormResult> {
  await requireAdmin();
  try {
    const result = await prisma.filament.updateMany({ where: { id }, data: { isAvailable } });
    if (!result.count) return { error: "notFound" };
  } catch { return { error: "saveFailed" }; }
  invalidate();
}

export async function saveFilamentRequirements(productId: string, variantId: string, snapshot: string, form: FormData): Promise<AdminFormResult> {
  await requireAdmin();
  const parsed = requirementInput.safeParse(boundedJson(form.get("requirements"), 50000));
  const invalid = { error: "validation", fieldErrors: { requirements: "invalid" } } as const;
  if (!parsed.success) return invalid;
  try {
    const result = await prisma.$transaction(async (tx): Promise<AdminFormResult> => {
      await lockProductConfiguration(tx, productId);
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, productId, retiredAt: null },
        select: { filamentGroups: { orderBy: { position: "asc" }, select: { id: true } } },
      });
      if (!variant) return { error: "notFound" };
      if (variant.filamentGroups.map((group) => group.id).join(",") !== snapshot)
        return { error: "validation", fieldErrors: { requirements: "stale" } };
      const ids = [...new Set(parsed.data.flat())];
      if (await tx.filament.count({ where: { id: { in: ids } } }) !== ids.length) return invalid;
      await tx.variantFilamentGroup.deleteMany({ where: { variantId } });
      if (parsed.data.length) {
        const groups = parsed.data.map((_, position) => ({ id: randomUUID(), variantId, position }));
        await tx.variantFilamentGroup.createMany({ data: groups });
        await tx.variantFilamentAlternative.createMany({
          data: groups.flatMap(({ id, position }) => parsed.data[position].map((filamentId) => ({ groupId: id, filamentId }))),
        });
      }
      await flushVariantConstraints(tx);
    }, { timeout: 15000 });
    if (result) return result;
  } catch { return { error: "saveFailed" }; }
  invalidate();
}
