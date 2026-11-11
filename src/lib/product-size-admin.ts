import type { Prisma } from "@prisma/client";
import type { SizeInput } from "./product-variants";
import { sizeInputSchema } from "./product-variants";

export async function syncProductSizes(tx: Prisma.TransactionClient, productId: string, sizes: SizeInput[]) {
  sizes = sizeInputSchema.parse(sizes);
  const groups = await tx.productOption.findMany({ where: { productId }, include: { values: true } });
  if (groups.length > 1 || groups.some((group) => !["Розмір", "Size"].includes(group.name))) throw new Error("Unsupported legacy option groups; preserve and review before editing sizes.");
  let group = groups[0];
  const existingIds = new Set(group?.values.filter((value) => value.price != null).map((value) => value.id));
  if (sizes.some((size) => size.id && !existingIds.has(size.id))) throw new Error("Size does not belong to this product.");
  if (!sizes.length) {
    if (group) await tx.productOptionValue.deleteMany({ where: { optionId: group.id, price: { not: null } } });
    return;
  }
  if (!group) group = { ...await tx.productOption.create({ data: { productId, name: "Розмір" } }), values: [] };
  await tx.productOptionValue.deleteMany({ where: { optionId: group.id, price: { not: null }, id: { notIn: sizes.flatMap((size) => size.id ? [size.id] : []) } } });
  for (const size of sizes) {
    const data = { value: size.labelUa, valueEn: size.labelEn || null, price: size.price, note: size.noteUa || null, noteEn: size.noteEn || null };
    if (size.id) await tx.productOptionValue.update({ where: { id: size.id }, data });
    else await tx.productOptionValue.create({ data: { ...data, optionId: group.id } });
  }
}
