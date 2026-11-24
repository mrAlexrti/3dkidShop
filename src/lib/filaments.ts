import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const filamentFacets = ["manufacturer", "series", "material", "color"] as const;
const label = z.string().trim().min(1).max(100).transform((value) => value.replace(/\s+/g, " "));
export const filamentInput = z.object({
  manufacturer: label, series: label, material: label, color: label,
  hex: z.string().trim().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toUpperCase()),
});

const filamentId = z.string().cuid();
export const requirementInput = z.array(z.array(filamentId).min(1).max(32)
  .refine((ids) => new Set(ids).size === ids.length)).max(24);

export function filamentFilter(input: Record<string, string | string[] | undefined>): Prisma.FilamentWhereInput {
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim().slice(0, 100) : "";
  const availability = text("availability");
  const q = text("q");
  return {
    ...(availability === "available" || availability === "unavailable" ? { isAvailable: availability === "available" } : {}),
    ...(q ? { OR: filamentFacets.map((key) => ({ [key]: { contains: q, mode: "insensitive" } })) } : {}),
    ...Object.fromEntries(filamentFacets.flatMap((key) => text(key) ? [[key, { equals: text(key), mode: "insensitive" }]] : [])),
  };
}

export const filamentOrder = [
  { manufacturer: "asc" }, { series: "asc" }, { material: "asc" }, { color: "asc" }, { id: "asc" },
] satisfies Prisma.FilamentOrderByWithRelationInput[];

export function filamentLabel(filament: Record<typeof filamentFacets[number], string>) {
  return filamentFacets.map((key) => filament[key]).join(" · ");
}
