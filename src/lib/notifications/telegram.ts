import { readServerEnv } from "@/lib/server-env";
import type { DeliveryResult } from "./delivery";

type SendTelegramResult = DeliveryResult;
export type TelegramInlineKeyboard = {
  inline_keyboard: ({ text: string; callback_data: string; url?: never } | { text: string; url: string; callback_data?: never })[][];
};

function getTelegramConfig() {
  const botToken = readServerEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readServerEnv("TELEGRAM_ADMIN_CHAT_ID");
  return botToken && chatId ? { botToken, chatId } : null;
}
export function isTelegramConfigured() { return Boolean(getTelegramConfig()); }

async function telegramRequest(method: "sendMessage" | "answerCallbackQuery", body: object): Promise<SendTelegramResult> {
  const config = getTelegramConfig();
  if (!config) return { sent: false, reason: "not_configured", outcome: "retry" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || !result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
      console.warn("Telegram request failed.");
      const rejected = result && typeof result === "object" && "ok" in result && result.ok === false && "error_code" in result;
      const code = rejected ? (result as { error_code: unknown }).error_code : null;
      return { sent: false, reason: "request_failed", outcome: code === 429 ? "retry" : typeof code === "number" && code >= 400 && code < 500 ? "permanent" : "unknown" };
    }
    const message = "result" in result ? result.result as { message_id?: unknown } : null;
    return { sent: true, ...(message && Number.isSafeInteger(message.message_id) ? { providerMessageId: String(message.message_id) } : {}) };
  } catch {
    // Never log the exception/URL: the Bot API embeds the token in its URL.
    console.warn("Telegram request unavailable.");
    return { sent: false, reason: "request_failed", outcome: "unknown" };
  }
}
export async function sendTelegramMessage(text: string, keyboard?: TelegramInlineKeyboard): Promise<SendTelegramResult> {
  const config = getTelegramConfig();
  if (!config) return { sent: false, reason: "not_configured", outcome: "retry" };
  return telegramRequest("sendMessage", { chat_id: config.chatId, text, disable_web_page_preview: true, ...(keyboard ? { reply_markup: keyboard } : {}) });
}
export async function answerTelegramCallback(queryId: string, text: string): Promise<SendTelegramResult> {
  return telegramRequest("answerCallbackQuery", { callback_query_id: queryId, text, cache_time: 0 });
}
