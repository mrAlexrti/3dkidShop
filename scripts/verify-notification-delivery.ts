// Actual adapters with fake configuration and mocked HTTP; never load .env.
import assert from "node:assert/strict";
import { sourceModule } from "./source-module";
const savedFetch = globalThis.fetch;
const savedEmailKey = process.env.RESEND_API_KEY; const savedFrom = process.env.EMAIL_FROM;
process.env.RESEND_API_KEY = "qa-private-key"; process.env.EMAIL_FROM = "qa@example.invalid";
const telegram = sourceModule<typeof import("../src/lib/notifications/telegram")>("src/lib/notifications/telegram.ts", { "@/lib/server-env": { readServerEnv: (name: string) => name === "TELEGRAM_BOT_TOKEN" ? "qa-bot" : "123" } });
const email = sourceModule<typeof import("../src/lib/notifications/email")>("src/lib/notifications/email.ts", {});
async function verify() {
  for (const provider of ["telegram", "email"] as const) {
    const send = () => provider === "telegram" ? telegram.sendTelegramMessage("QA ONLY") : email.sendEmail({ to: "qa@example.invalid", subject: "QA", html: "QA ONLY" });
    for (const [status, outcome] of [[429, "retry"], [403, "permanent"], [500, "unknown"]] as const) {
      globalThis.fetch = async (url, init) => { assert.ok(init?.signal); assert.equal(String(url), provider === "telegram" ? "https://api.telegram.org/botqa-bot/sendMessage" : "https://api.resend.com/emails"); return Response.json({ ok: false, error_code: status }, { status }); };
      const result = await send(); assert.equal(result.sent, false); if (!result.sent) assert.equal(result.outcome, outcome);
    }
    globalThis.fetch = async () => { throw new Error("PRIVATE_TIMEOUT"); };
    const uncertain = await send(); assert.ok(!uncertain.sent && uncertain.outcome === "unknown");
    globalThis.fetch = async () => Response.json(provider === "telegram" ? { ok: true, result: { message_id: 123 } } : { id: "qa-receipt" });
    assert.deepEqual(await send(), { sent: true, providerMessageId: provider === "telegram" ? "123" : "qa-receipt" });
  }
  console.log("PASS delivery adapters: acknowledged receipts; definite 429 retry; permanent 403; ambiguous 5xx/timeout never auto-retried. Mocked HTTP and fake configuration only.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = savedFetch;
  if (savedEmailKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedEmailKey;
  if (savedFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = savedFrom;
});
