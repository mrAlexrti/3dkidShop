import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { AdminInputError } from "./admin-form-validation";
import { combinationKey, matchesMode, needsColor, needsSize } from "./product-configuration";
import { moneyMinorUnits } from "./payments/money";

const key = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const text = z.string().trim().max(500).optional().default("");
export const configurationInputSchema = z.object({
  mode: z.enum(["SIMPLE", "SIZE", "COLOR", "COLOR_SIZE"]),
  values: z.array(z.object({ key, id: z.string().cuid().optional(), kind: z.enum(["COLOR", "SIZE"]),
    labelUa: z.string().trim().min(1).max(100), labelEn: z.string().trim().max(100).optional().default(""),
    noteUa: text, noteEn: text, retired: z.boolean().default(false),
    displayPosition: z.number().int().min(0).max(1000000).optional(),
  })).max(160),
  combinations: z.array(z.object({ id: z.string().cuid().optional(), color: key.optional(), size: key.optional(),
    price: z.string().refine((value) => (moneyMinorUnits(value) ?? 0) > 0),
    isAvailable: z.boolean(), retired: z.boolean().default(false),
  })).max(400),
}).superRefine((data, ctx) => {
  const issue = (path: (string | number)[], message = "invalid") => ctx.addIssue({ code: "custom", path, message });
  const keys = new Set<string>(), ids = new Set<string>(), labels = new Set<string>(), tuples = new Set<string>(), variantIds = new Set<string>();
  data.values.forEach((value, i) => {
    if (keys.has(value.key) || value.id && ids.has(value.id)) issue(["values", i, "labelUa"]);
    keys.add(value.key); if (value.id) ids.add(value.id);
    const label = `${value.kind}:${value.labelUa.normalize("NFKC").toLocaleLowerCase("uk-UA")}`;
    if (!value.retired && labels.has(label)) issue(["values", i, "labelUa"], "optionDuplicate");
    if (!value.retired) labels.add(label);
    if (!value.retired && (value.kind === "COLOR" ? !needsColor(data.mode) : !needsSize(data.mode))) issue(["values", i, "retired"]);
  });
  for (const kind of ["COLOR", "SIZE"] as const) if (data.values.filter((v) => v.kind === kind && !v.retired).length > 40) issue(["values"], "configurationLimit");
  if (data.combinations.filter((v) => !v.retired).length > 200) issue(["combinations"], "configurationLimit");
  data.combinations.forEach((row, i) => {
    const color = data.values.find((v) => v.key === row.color && v.kind === "COLOR");
    const size = data.values.find((v) => v.key === row.size && v.kind === "SIZE");
    if (row.color && !color || row.size && !size || !row.color && !row.size) issue(["combinations", i]);
    if (!row.retired && (!matchesMode(data.mode, { COLOR: row.color, SIZE: row.size }) || color?.retired || size?.retired)) issue(["combinations", i]);
    const tuple = JSON.stringify([row.color ?? null, row.size ?? null]);
    if (tuples.has(tuple) || row.id && variantIds.has(row.id)) issue(["combinations", i], "combinationDuplicate");
    tuples.add(tuple); if (row.id) variantIds.add(row.id);
  });
});
export type ConfigurationInput = z.infer<typeof configurationInputSchema>;

// Caller holds the media lock, then the Product FOR UPDATE lock, and checks revision.
// Caller must finish with flushVariantConstraints after all writes.
export async function syncProductConfiguration(tx: Prisma.TransactionClient, productId: string, raw: ConfigurationInput) {
  const input = configurationInputSchema.parse(raw);
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, include: { options: { include: { values: true } }, variants: { include: { selections: true } } } });
  const groups = product.options;
  if (product.optionMode === "LEGACY" && (groups.length > 1 || groups.some((g) => !["Розмір", "Size"].includes(g.name)))) throw new AdminInputError("configuration", "invalid");
  const existingValues = new Map(groups.flatMap((g) => g.values.map((v) => [v.id, { ...v, kind: g.kind ?? (product.optionMode === "LEGACY" ? "SIZE" : null) }] as const)));
  const groupIds = new Map(groups.filter((g) => g.kind).map((g) => [g.kind!, g.id]));
  const valueIds = new Map<string, string>();
  for (const [i, value] of input.values.entries()) {
    const existing = value.id ? existingValues.get(value.id) : undefined;
    if (value.id && (!existing || existing.kind !== value.kind || product.optionMode === "LEGACY" && existing.price === null)) throw new AdminInputError(`configuration.values.${i}.labelUa`, "invalid");
    let groupId = groupIds.get(value.kind);
    if (!groupId) {
      const legacy = value.kind === "SIZE" && product.optionMode === "LEGACY" ? groups[0] : undefined;
      const group = legacy ? await tx.productOption.update({ where: { id: legacy.id }, data: { kind: "SIZE" } }) :
        await tx.productOption.create({ data: { productId, name: value.kind === "SIZE" ? "Розмір" : "Колір", kind: value.kind } });
      groupId = group.id; groupIds.set(value.kind, group.id);
    }
    const data = { value: value.labelUa, valueEn: value.labelEn || null, note: value.noteUa || null, noteEn: value.noteEn || null,
      ...(value.displayPosition === undefined ? {} : { displayPosition: value.displayPosition }),
      retiredAt: value.retired ? existing?.retiredAt ?? new Date() : null };
    const saved = value.id ? await tx.productOptionValue.update({ where: { id: value.id }, data }) : await tx.productOptionValue.create({ data: { ...data, optionId: groupId } });
    valueIds.set(value.key, saved.id);
  }
  const retainedValues = input.values.flatMap((v) => v.id ? [v.id] : []);
  for (const g of groups) for (const v of g.values) if ((g.kind || product.optionMode === "LEGACY" && groupIds.get("SIZE") === g.id) && !retainedValues.includes(v.id) && !v.retiredAt)
    await tx.productOptionValue.update({ where: { id: v.id }, data: { retiredAt: new Date() } });
  const retainedVariants: string[] = [];
  const newSelections: Prisma.ProductVariantSelectionCreateManyInput[] = [];
  for (const [i, row] of input.combinations.entries()) {
    const choices = { ...(row.color ? { COLOR: valueIds.get(row.color)! } : {}), ...(row.size ? { SIZE: valueIds.get(row.size)! } : {}) };
    const canonical = combinationKey(choices);
    const supplied = row.id ? product.variants.find((v) => v.id === row.id) : undefined;
    if (row.id && (!supplied || supplied.combinationKey !== canonical)) throw new AdminInputError(`configuration.combinations.${i}`, "invalid");
    const existing = supplied ?? product.variants.find((v) => v.combinationKey === canonical);
    const data = { price: row.price, isAvailable: row.isAvailable, retiredAt: row.retired ? existing?.retiredAt ?? new Date() : null };
    const saved = existing ? await tx.productVariant.update({ where: { id: existing.id }, data }) : await tx.productVariant.create({ data: { ...data, productId, combinationKey: canonical } });
    // Explicit child writes avoid Prisma 5's overlapping composite-FK nested
    // create input, which removes productId as part of the parent relation.
    if (!existing) for (const [kind, valueId] of Object.entries(choices)) newSelections.push({ variantId: saved.id, productId, optionId: groupIds.get(kind as "COLOR" | "SIZE")!, valueId });
    retainedVariants.push(saved.id);
  }
  if (newSelections.length) await tx.productVariantSelection.createMany({ data: newSelections });
  await tx.productVariant.updateMany({ where: { productId, retiredAt: null, id: { notIn: retainedVariants } }, data: { retiredAt: new Date() } });
  await tx.product.update({ where: { id: productId }, data: { optionMode: input.mode } });
  return valueIds;
}
