// Explicit local JSON input only. Never lists a store, connects to a DB, reads
// credentials or registers retirement. Output is a review report, never a job.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { diagnoseBlobInventory, MAX_DIAGNOSTIC_INPUT_BYTES } from "./lib/blob-inventory-diagnostics";

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: tsx scripts/diagnose-blob-inventory.ts <local-inventory.json>\nOffline review only; no network, credentials, writes or deletion. See docs/batch-1.7.5c-blob-cleanup-readiness.md.");
  } else {
    if (args.length !== 1 || args[0].startsWith("-") || /^https?:/i.test(args[0])) throw new Error("INVALID_ARGUMENTS");
    const path = resolve(args[0]); const info = statSync(path);
    if (!info.isFile() || info.size > MAX_DIAGNOSTIC_INPUT_BYTES) throw new Error("INVALID_FILE");
    const input: unknown = JSON.parse(readFileSync(path, "utf8"));
    console.log(JSON.stringify(diagnoseBlobInventory(input), null, 2));
  }
} catch {
  // Do not echo untrusted input, file contents, credentials or raw exceptions.
  console.error("BLOB_DIAGNOSTIC_INPUT_REJECTED: use one bounded local JSON file matching the documented schema.");
  process.exitCode = 1;
}
