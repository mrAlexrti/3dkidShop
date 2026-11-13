import { readServerEnv } from "@/lib/server-env";

type SendTelegramResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "request_failed" };
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
  if (!config) return { sent: false, reason: "not_configured" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const result: unknown = response.ok ? await response.json() : null;
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
      console.warn("Telegram request failed.");
      return { sent: false, reason: "request_failed" };
    }
    return { sent: true };
  } catch {
    // Never log the exception/URL: the Bot API embeds the token in its URL.
    console.warn("Telegram request unavailable.");
    return { sent: false, reason: "request_failed" };
  }
}
export async function sendTelegramMessage(text: string, keyboard?: TelegramInlineKeyboard): Promise<SendTelegramResult> {
  const config = getTelegramConfig();
  if (!config) return { sent: false, reason: "not_configured" };
  return telegramRequest("sendMessage", { chat_id: config.chatId, text, disable_web_page_preview: true, ...(keyboard ? { reply_markup: keyboard } : {}) });
}
export async function answerTelegramCallback(queryId: string, text: string): Promise<SendTelegramResult> {
  return telegramRequest("answerCallbackQuery", { callback_query_id: queryId, text, cache_time: 0 });
}
