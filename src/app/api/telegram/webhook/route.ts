import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readServerEnv } from "@/lib/server-env";
import { parseOrderWorkCallback, parseCodOrderCallback } from "@/lib/notifications/telegram-actions";
import { answerTelegramCallback } from "@/lib/notifications/telegram";
import { actOnTelegramWork, actOnCodOrder, type CodActionResult } from "@/lib/orders/take-into-work";
import { translations } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 32768;
const telegramId = z.number().int().positive().safe();
const updateSchema = z.object({
  update_id: z.number().int().nonnegative().safe(),
  callback_query: z.object({
    id: z.string().min(1).max(256), data: z.string().max(64).optional(),
    from: z.object({ id: telegramId, is_bot: z.literal(false) }),
    message: z.object({ chat: z.object({ id: telegramId, type: z.literal("private") }) }),
  }).optional(),
});

export async function POST(request: Request) {
  const reply = (status: number) => NextResponse.json({ success: status === 200 }, { status });
  const secret = readServerEnv("TELEGRAM_WEBHOOK_SECRET");
  const adminId = readServerEnv("TELEGRAM_ADMIN_CHAT_ID");
  // Private owner callbacks only. Group/channel membership is not authorization.
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret) || !/^[1-9]\d{0,15}$/.test(adminId) || !Number.isSafeInteger(Number(adminId)) || !readServerEnv("TELEGRAM_BOT_TOKEN")) return reply(503);
  const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || supplied.length > 256 || !timingSafeEqual(digest(secret), digest(supplied))) return reply(401);
  if (Number(request.headers.get("content-length")) > MAX_BODY) return reply(413);
  const reader = request.body?.getReader();
  if (!reader) return reply(400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return reply(413); }
      chunks.push(chunk.value);
    }
  } catch { return reply(400); }
  let update;
  try { update = updateSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { return reply(400); }
  const query = update.callback_query;
  if (!query) return reply(200); // Other authenticated update types are ignored.
  if (String(query.message.chat.id) !== adminId || String(query.from.id) !== adminId) return reply(403);
  const cod = parseCodOrderCallback(query.data);
  const id = cod?.id ?? parseOrderWorkCallback(query.data);
  if (!id) {
    await answerTelegramCallback(query.id, translations.ua.statuses.cod.unknownAction);
    return reply(200);
  }
  try {
    const acknowledge = async ({ result, status }: CodActionResult) => {
      const t = translations.ua.statuses;
      const text = result === "ineligible"
        ? `${t.cod.ineligible} ${t.cod.current}: ${t.cod.states[status as keyof typeof t.cod.states] ?? t.work.conflict}`
        : result === "taken" && cod ? t.cod.confirmed : result === "cancelled" ? t.cod.cancelled : t.work[result];
      await answerTelegramCallback(query.id, text);
    };
    // Historical COD ow1 buttons receive the same strict eligibility/CAS guard.
    const result = cod ? await actOnCodOrder(id, cod.action, "ua", acknowledge) : await actOnTelegramWork(id, acknowledge);
    revalidatePath("/admin/orders"); revalidatePath(`/admin/orders/${id}`);
    return reply(result.result === "conflict" ? 503 : 200);
  } catch {
    await answerTelegramCallback(query.id, translations.ua.statuses.updateFailed);
    return reply(503);
  }
}
