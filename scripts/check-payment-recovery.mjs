// Inactive until an operator configures an external scheduler. No .env loading.
// Print only fixed diagnostics. Never print URL, bearer secret, body or payload.
import { pathToFileURL } from "node:url";

export function recoveryHealthy(status, body) {
  const counter = (value) => Number.isSafeInteger(value) && value >= 0;
  return status === 200 && body?.success === true &&
    [body.checked, body.updated, body.errors, body.reviewRequired, body.dueRemaining, body.overdue,
      body.notifications?.sent, body.notifications?.unknown, body.notifications?.retried,
      body.notifications?.unknownTotal, body.notifications?.dueRemaining, body.notifications?.overdue].every(counter) &&
    body.errors === 0 && body.reviewRequired === 0 && body.overdue === 0 &&
    body.notifications.unknownTotal === 0 && body.notifications.overdue === 0;
}

export async function checkRecovery(env = process.env, transport = fetch) {
  try {
    const url = new URL(env.PAYMENT_RECOVERY_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
        url.pathname !== "/api/cron/payments" || !env.CRON_SECRET) return false;
    const response = await transport(url.href, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(75000), headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
    const reader = response.body?.getReader();
    if (!reader) return false;
    const chunks = []; let length = 0;
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 16384) { await reader.cancel(); return false; }
      chunks.push(Buffer.from(chunk.value));
    }
    return recoveryHealthy(response.status, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return false; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const healthy = await checkRecovery();
  console.log(healthy ? "Payment recovery healthy" : "Payment recovery requires operator attention");
  process.exitCode = healthy ? 0 : 1;
}
