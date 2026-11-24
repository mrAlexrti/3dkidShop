import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { publicProductInclude } from "./product-query";
export { publicProductInclude } from "./product-query";

// Prices, ordering, page boundaries and relation reads share one DB snapshot.
export async function catalogProducts(input: { where: Prisma.ProductWhereInput; orderBy: Prisma.ProductOrderByWithRelationInput; categoryIds?: string[] | null; q?: string; sort?: string; page: number; pageSize: number }) {
  return prisma.$transaction(async (tx) => {
    const total = await tx.product.count({ where: input.where });
    if (input.sort !== "price_asc" && input.sort !== "price_desc") return { total, products: await tx.product.findMany({ where: input.where, orderBy: [input.orderBy, { id: "asc" }], include: publicProductInclude, skip: (input.page - 1) * input.pageSize, take: input.pageSize }) };
    const category = input.categoryIds ? input.categoryIds.length ? Prisma.sql`AND p."categoryId" IN (${Prisma.join(input.categoryIds)})` : Prisma.sql`AND FALSE` : Prisma.empty;
    const search = input.q ? Prisma.sql`AND (p."name" ILIKE ${`%${input.q}%`} OR p."nameEn" ILIKE ${`%${input.q}%`})` : Prisma.empty;
    const direction = input.sort === "price_desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p."id" FROM public."Product" p
      LEFT JOIN LATERAL (
        SELECT CASE WHEN p."optionMode"='LEGACY' THEN COALESCE(
          (SELECT min(x."price") FROM public."ProductOption" o JOIN public."ProductOptionValue" x ON x."optionId"=o."id"
           WHERE o."productId"=p."id" AND o."name" IN ('Розмір','Size') AND x."price">0 AND x."price"<=99999999.99),
          CASE WHEN p."price">0 AND p."price"<=99999999.99 THEN p."price" END)
        WHEN p."optionMode"='SIMPLE' THEN CASE WHEN p."price">0 AND p."price"<=99999999.99 THEN p."price" END
        ELSE (SELECT min(v."price") FROM public."ProductVariant" v WHERE v."productId"=p."id"
          AND v."isAvailable" AND v."retiredAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public."VariantFilamentGroup" g WHERE g."variantId"=v."id"
              AND NOT EXISTS (
                SELECT 1 FROM public."VariantFilamentAlternative" a
                JOIN public."Filament" f ON f."id"=a."filamentId"
                WHERE a."groupId"=g."id" AND f."isAvailable"))
          AND NOT EXISTS (SELECT 1 FROM public."ProductVariantSelection" s JOIN public."ProductOptionValue" x ON x."id"=s."valueId" WHERE s."variantId"=v."id" AND x."retiredAt" IS NOT NULL)) END AS price
      ) offer ON TRUE
      WHERE p."isActive" ${category} ${search}
      ORDER BY offer.price ${direction} NULLS LAST, p."id" ASC
      LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`);
    const rows = await tx.product.findMany({ where: { id: { in: ids.map((row) => row.id) } }, include: publicProductInclude });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return { total, products: ids.flatMap(({ id }) => byId.has(id) ? [byId.get(id)!] : []) };
  }, { isolationLevel: "RepeatableRead" });
}
