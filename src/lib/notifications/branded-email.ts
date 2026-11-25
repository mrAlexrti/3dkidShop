import type { Locale } from "@/lib/i18n";

const storeUrl = "https://www.3dkid.shop/";
export const emailLogo = storeUrl + "hero/logo.png";
const copy = {
  ua: { fallback: "Якщо кнопка не працює, скопіюйте це посилання у браузер.", footer: "Інтернет-магазин іграшок" },
  en: { fallback: "If the button doesn’t work, copy this link into your browser.", footer: "Online toy shop" },
} as const;

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

const tones = {
  positive: "background:#e9f4eb;color:#2c5c3b",
  attention: "background:#fff0d9;color:#744a19",
  negative: "background:#fce9ed;color:#852c44",
  neutral: "background:#f3edf2;color:#503c4a",
};
export type EmailTone = keyof typeof tones;
type Field = { label: string; value: string; tone?: EmailTone };
type Items = {
  title: string;
  productLabel: string;
  quantityLabel: string;
  priceLabel: string;
  lines: { name: string; quantity: number; unitPrice: string }[];
};
type Email = {
  locale: Locale;
  title: string;
  intro: string;
  summary?: { reference: string; total: Field };
  statuses?: Field[];
  details?: Field[];
  items?: Items;
  action: { label: string; url: string; fallback?: boolean };
  note?: string;
};

const wrap = "overflow-wrap:anywhere;word-wrap:break-word";

function renderFields(fields: Field[]) {
  if (!fields.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;margin:0 0 16px;font-size:14px">
${fields.map(({ label, value, tone }) => `<tr><td width="33%" style="padding:6px 8px 6px 0;color:#584551;vertical-align:top;${wrap}"><strong>${escape(label)}</strong></td>
<td style="padding:6px 0;vertical-align:top;${wrap}">${tone ? `<span style="display:inline-block;padding:2px 8px;border-radius:8px;${tones[tone]}">${escape(value)}</span>` : escape(value)}</td></tr>`).join("")}
</table>`;
}

function renderItems(items: Items) {
  return `<h2 style="margin:20px 0 8px;font-size:18px">${escape(items.title)}</h2>
<table width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;border-collapse:collapse;margin:0 0 16px;font-size:14px">
<thead><tr bgcolor="#fff5f8" style="text-align:left;color:#59243f">
<th scope="col" width="53%" style="padding:8px 6px;${wrap}">${escape(items.productLabel)}</th>
<th scope="col" width="14%" style="padding:8px 3px;text-align:center;${wrap}">${escape(items.quantityLabel)}</th>
<th scope="col" style="padding:8px 6px;text-align:right;${wrap}">${escape(items.priceLabel)}</th>
</tr></thead><tbody>
${items.lines.map(item => `<tr><td style="padding:8px 6px;border-bottom:1px solid #f1dce4;${wrap}">${escape(item.name)}</td>
<td style="padding:8px 3px;text-align:center;border-bottom:1px solid #f1dce4;${wrap}">${escape(String(item.quantity))}</td>
<td style="padding:8px 6px;text-align:right;border-bottom:1px solid #f1dce4;${wrap}">${escape(item.unitPrice)}</td></tr>`).join("")}
</tbody></table>`;
}

export function renderBrandedEmail({ locale, title, intro, summary, statuses = [], details = [], items, action, note }: Email) {
  const labels = copy[locale];
  const link = escape(action.url);
  const html = `<!doctype html>
<html lang="${locale === "ua" ? "uk" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#fff7f4">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fff7f4" style="background:#fff7f4"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;max-width:600px;font-family:Arial,sans-serif;color:#31222a">
<tr><td align="center" bgcolor="#fbdce8" style="padding:20px;background:#fbdce8;border-radius:20px 20px 0 0">
<img src="${emailLogo}" alt="3D kid" width="63" height="70" style="display:block;width:63px;height:70px;margin:0 auto 8px;border:0;color:#81244a"><strong style="color:#81244a">3D kid</strong>
</td></tr>
<tr><td bgcolor="#ffffff" style="padding:26px 22px;background:#ffffff;font-size:16px;line-height:1.55;${wrap}">
<h1 style="font-size:26px;line-height:1.26;margin:0 0 14px;color:#421e32">${escape(title)}</h1>
<p style="margin:0 0 16px">${escape(intro)}</p>
${summary ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;margin:0 0 12px"><tr>
<td bgcolor="#fff5f8" style="padding:13px 16px;border-radius:12px;${wrap}"><h2 style="margin:0 0 5px;font-size:19px;color:#421e32">${escape(summary.reference)}</h2>
<p style="margin:0;color:#59243f">${escape(summary.total.label)}: <strong style="font-size:18px">${escape(summary.total.value)}</strong></p></td></tr></table>` : ""}
${renderFields(statuses)}
${items?.lines.length ? renderItems(items) : ""}
${renderFields(details)}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0"><tr><td bgcolor="#922653" style="background:#922653;border-radius:10px;text-align:center;mso-padding-alt:12px 18px">
<a href="${link}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:bold;line-height:24px;padding:12px 18px;mso-padding-alt:0">${escape(action.label)}</a>
</td></tr></table>
${action.fallback ? `<p style="margin:0 0 6px;color:#584551;font-size:14px">${escape(labels.fallback)}</p><p style="margin:0 0 14px;word-break:break-all;${wrap};font-size:13px"><a style="color:#81244a" href="${link}">${link}</a></p>` : ""}
${note ? `<p style="margin:16px 0 0;color:#584551;font-size:14px">${escape(note)}</p>` : ""}
</td></tr>
<tr><td align="center" bgcolor="#fbdce8" style="padding:16px;background:#fbdce8;border-radius:0 0 20px 20px;color:#59243f;font-size:13px">
<a style="color:#59243f;text-decoration:underline;font-weight:bold" href="${storeUrl}">3D kid</a> · ${escape(labels.footer)}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const fieldText = ({ label, value }: Field) => `${label}: ${value}`;
  const text = [
    title, intro, summary && `${summary.reference}\n${fieldText(summary.total)}`, statuses.map(fieldText).join("\n"),
    items?.lines.length ? [items.title, ...items.lines.map(item => `${item.name} × ${item.quantity} · ${items.priceLabel}: ${item.unitPrice}`)].join("\n") : "",
    details.map(fieldText).join("\n"), `${action.label}\n${action.url}`, note, `3D kid · ${labels.footer}\n${storeUrl}`,
  ].filter(Boolean).join("\n\n");
  return { html, text };
}
