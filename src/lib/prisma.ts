import { PrismaClient } from "@prisma/client";
import { resolveEnvironment } from "@/lib/environment.mjs";

const target = resolveEnvironment(process.env);
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(target.kind === "preview" ? { datasourceUrl: target.datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
