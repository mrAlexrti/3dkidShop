import type { Prisma } from "@prisma/client";

export async function lockProductConfiguration(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM public."Product" WHERE "id"=${id} FOR UPDATE`;
}
// Must be the FINAL database command before returning from a relevant write callback.
// Prisma 5.22 can resolve COMMIT even when PostgreSQL rolls back deferred constraints.
export async function flushVariantConstraints(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
}
