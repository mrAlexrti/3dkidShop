import { Prisma } from "@prisma/client";

export async function allocateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Dedicated two-int key; transaction-scoped, never session-scoped (pooler safe).
  // Cast void to text so Prisma does not have to deserialize PostgreSQL void.
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(334354, 173)::text AS locked`);
  const rows = await tx.$queryRaw<{ maximum: string }[]>(Prisma.sql`SELECT COALESCE(MAX("number"::numeric), 0)::text AS maximum FROM "Order" WHERE "number" ~ '^[0-9]+$'`);
  const maximum = rows[0]?.maximum;
  if (typeof maximum !== "string" || !/^[0-9]+$/.test(maximum) || maximum.length > 100) throw new Error("ORDER_NUMBER_OUT_OF_RANGE");
  const next = (BigInt(maximum) + BigInt(1)).toString().padStart(4, "0");
  if (next.length > 100) throw new Error("ORDER_NUMBER_OUT_OF_RANGE");
  return next;
}

export function isOrderNumberCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; meta?: { target?: unknown } };
  const target = candidate.meta?.target;
  return candidate.code === "P2002" && (Array.isArray(target) ? target.length === 1 && target[0] === "number" : target === "Order_number_key");
}
