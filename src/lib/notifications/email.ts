type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "missing_recipient" | "request_failed" };

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function getEmailConfig() {
  const apiKey = readEnv("RESEND_API_KEY");
  const from = readEnv("EMAIL_FROM");

  if (!apiKey || !from) return null;
  return { apiKey, from, adminEmail: readEnv("ADMIN_EMAIL") };
}

export function isEmailConfigured() {
  return Boolean(getEmailConfig());
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to?: string | string[] | null;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  if (!to || (Array.isArray(to) && to.length === 0)) return { sent: false, reason: "missing_recipient" };

  const config = getEmailConfig();
  if (!config) {
    console.warn("Email notification skipped: Resend env is not configured.");
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      console.warn("Email notification failed:", response.status, await response.text().catch(() => ""));
      return { sent: false, reason: "request_failed" };
    }

    return { sent: true };
  } catch (error) {
    console.warn("Email notification failed:", error instanceof Error ? error.message : "unknown error");
    return { sent: false, reason: "request_failed" };
  }
}