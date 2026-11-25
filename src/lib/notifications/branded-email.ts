import type { Locale } from "@/lib/i18n";

export const emailLogo = "https://www.3dkid.shop/hero/logo.png";
const copy = {
  ua: { fallback: "Якщо кнопка не працює, скопіюйте це посилання у браузер.", footer: "3D Kid · Інтернет-магазин іграшок" },
  en: { fallback: "If the button doesn’t work, copy this link into your browser.", footer: "3D Kid · Online toy shop" },
} as const;

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

type Email = {
  locale: Locale;
  title: string;
  intro: string;
  details?: string[];
  items?: { title: string; lines: string[] };
  address?: string;
  action: { label: string; url: string; fallback?: boolean };
  note?: string;
};

export function renderBrandedEmail({ locale, title, intro, details, items, address, action, note }: Email) {
  const text = copy[locale];
  const paragraph = (value: string) => `<p style="margin:0 0 12px">${escape(value)}</p>`;
  const link = escape(action.url);
  return `<!doctype html>
<html lang="${locale === "ua" ? "uk" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#fff7f4">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fff7f4" style="background:#fff7f4"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;font-family:Arial,sans-serif;color:#31222a">
<tr><td align="center" bgcolor="#fbdce8" style="padding:20px;background:#fbdce8;border-radius:20px 20px 0 0">
<img src="${emailLogo}" alt="3D Kid" width="45" height="50" style="display:block;margin:0 auto 8px;border:0"><strong style="color:#81244a">3D Kid</strong>
</td></tr>
<tr><td bgcolor="#ffffff" style="padding:26px 22px;background:#ffffff;font-size:16px;line-height:1.55;overflow-wrap:anywhere;word-wrap:break-word">
<h1 style="font-size:26px;line-height:1.26;margin:0 0 14px;color:#421e32">${escape(title)}</h1>${paragraph(intro)}
${details?.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#fff5f8" style="padding:16px 16px 4px;border-radius:12px">${details.map(paragraph).join("")}</td></tr></table>` : ""}
${items ? `<h2 style="margin:20px 0 8px;font-size:18px">${escape(items.title)}</h2><ul style="margin:0 0 14px;padding-left:21px">${items.lines.map(line => `<li>${escape(line)}</li>`).join("")}</ul>` : ""}
${address ? paragraph(address) : ""}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0"><tr><td bgcolor="#922653" style="background:#922653;border-radius:10px;text-align:center;mso-padding-alt:12px 18px">
<a href="${link}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:bold;line-height:24px;padding:12px 18px;mso-padding-alt:0">${escape(action.label)}</a>
</td></tr></table>
${action.fallback ? `<p style="margin:0 0 6px;color:#584551;font-size:14px">${escape(text.fallback)}</p><p style="margin:0 0 14px;word-break:break-all;overflow-wrap:anywhere;font-size:13px"><a style="color:#81244a" href="${link}">${link}</a></p>` : ""}
${note ? `<p style="margin:16px 0 0;color:#584551;font-size:14px">${escape(note)}</p>` : ""}
</td></tr>
<tr><td align="center" bgcolor="#fbdce8" style="padding:16px;background:#fbdce8;border-radius:0 0 20px 20px;color:#59243f;font-size:13px">
${escape(text.footer)}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
