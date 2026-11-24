// Only the rehearsal's private loopback cluster can run this suite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { verifyApplication } from "./verify-batch18-application-postgres";

async function main() {
  const connection = process.env.BATCH18_QA_DATABASE_URL!;
  const address = new URL(connection);
  assert.equal(address.hostname, "127.0.0.1");
  assert.equal(address.username, "batch18a_qa");
  assert.match(address.pathname, /^\/batch18_review_[a-f0-9]+$/);
  assert.equal(readFileSync(resolve(process.env.BATCH18A_QA_DIRECTORY!, "qa-marker"), "utf8"), process.env.BATCH18A_QA_MARKER);
  assert.equal(process.env.DATABASE_URL, connection);
  const db = new PrismaClient({ datasources: { db: { url: connection } } });
  try { await verifyApplication(db, true); }
  finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
