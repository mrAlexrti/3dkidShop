type SendTelegramResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "request_failed" };

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function getTelegramConfig() {
  const botToken = readEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readEnv("TELEGRAM_ADMIN_CHAT_ID");

  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

export function isTelegramConfigured() {
  return Boolean(getTelegramConfig());
}

export async function sendTelegramMessage(text: string): Promise<SendTelegramResult> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("Telegram notification skipped: Telegram env is not configured.");
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      console.warn("Telegram notification failed:", response.status, await response.text().catch(() => ""));
      return { sent: false, reason: "request_failed" };
    }

    return { sent: true };
  } catch (error) {
    console.warn("Telegram notification failed:", error instanceof Error ? error.message : "unknown error");
    return { sent: false, reason: "request_failed" };
  }
}