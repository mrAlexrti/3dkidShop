import "server-only";
import { after } from "next/server";
import { runProductMediaCleanup } from "@/lib/media-lifecycle";

// Register only after a successful mutation transaction. Durable queue rows are
// retried by subsequent Admin mutations if the process/scheduler/provider fails.
export function scheduleProductMediaCleanup() {
  try { after(async () => { try { await runProductMediaCleanup(); } catch { console.warn("media_cleanup_background_failed"); } }); }
  catch { console.warn("media_cleanup_schedule_failed"); }
}
