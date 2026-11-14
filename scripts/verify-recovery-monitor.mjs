import assert from "node:assert/strict";
import { checkRecovery, recoveryHealthy } from "./check-payment-recovery.mjs";
const healthy = { success: true, checked: 3, updated: 1, errors: 0, reviewRequired: 0, dueRemaining: 1, overdue: 0, notifications: { sent: 3, unknown: 0, retried: 0, unknownTotal: 0, dueRemaining: 1, overdue: 0 } };
assert.equal(recoveryHealthy(200, healthy), true);
for (const body of [{ ...healthy, errors: 1 }, { ...healthy, reviewRequired: 1 }, { ...healthy, overdue: 1 }, { ...healthy, notifications: { ...healthy.notifications, unknownTotal: 1 } }, { ...healthy, notifications: { ...healthy.notifications, overdue: 1 } }, {}, { ...healthy, dueRemaining: -1 }]) assert.equal(recoveryHealthy(200, body), false);
assert.equal(recoveryHealthy(503, healthy), false);
const env = { PAYMENT_RECOVERY_URL: "https://shop.example.invalid/api/cron/payments", CRON_SECRET: "qa-monitor-secret" };
let calls = 0;
assert.equal(await checkRecovery(env, async (url, init) => {
  calls++; assert.equal(url, env.PAYMENT_RECOVERY_URL); assert.equal(init.redirect, "error"); assert.equal(init.headers.Authorization, "Bearer qa-monitor-secret");
  return Response.json(healthy);
}), true);
assert.equal(calls, 1, "No automatic retries");
for (const url of ["http://shop.example.invalid/api/cron/payments", "https://user:password@shop.example.invalid/api/cron/payments", "https://shop.example.invalid/api/cron/payments?secret=qa", "https://shop.example.invalid/other"]) assert.equal(await checkRecovery({ ...env, PAYMENT_RECOVERY_URL: url }, async () => { throw new Error("Must not dispatch"); }), false);
assert.equal(await checkRecovery(env, async () => { throw new Error("Ambiguous network failure"); }), false);
assert.equal(await checkRecovery(env, async () => new Response("x".repeat(16385))), false);
assert.equal(await checkRecovery(env, async () => Response.json({ success: true })), false);
console.log("PASS recovery monitor: strict authenticated target, no redirect/retry, bounded body, fail-closed counters, provider errors, overdue backlog, REVIEW and UNKNOWN alerts. All transport mocked.");
