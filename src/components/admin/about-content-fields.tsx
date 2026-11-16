"use client";

import { AdminFieldError } from "@/components/admin/admin-form";
import { ABOUT_CONTENT_LIMITS, resolveAboutCopy, type StorefrontContent } from "@/lib/site-content";
import { useLangStore } from "@/store/lang-store";

export function AboutContentFields({ content }: { content: StorefrontContent }) {
  const { t } = useLangStore(); const text = t.admin.content;
  const fields = [
    { key: "slogan", value: "slogan", label: text.aboutSlogan },
    { key: "body", value: "body", label: text.aboutBody },
    { key: "meta_title", value: "metaTitle", label: text.aboutMetaTitle },
    { key: "meta_description", value: "metaDescription", label: text.aboutMetaDescription },
  ] as const;
  const inputClass = "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";
  return <fieldset className="min-w-0 space-y-5">
    <legend className="mb-4 text-lg font-semibold">{text.about}</legend>
    <p className="text-xs leading-relaxed text-ink/60">{text.aboutHelp}</p>
    {(["ua", "en"] as const).map((locale) => {
      const values = resolveAboutCopy(content, locale);
      return <fieldset key={locale} className="min-w-0 space-y-4 rounded-xl border border-ink/10 p-3 sm:p-4">
        <legend className="px-2 text-sm font-semibold">{text.about} ({locale.toUpperCase()})</legend>
        {fields.map(({ key, value, label }) => {
          const name = `about_${key}_${locale}`;
          const props = { id: name, name, lang: locale === "ua" ? "uk" : "en", defaultValue: values[value], maxLength: ABOUT_CONTENT_LIMITS[key], required: true, "aria-describedby": `${name}-help`, className: inputClass };
          return <div key={key}>
            <label htmlFor={name} className="mb-1 block text-sm font-medium">{label} ({locale.toUpperCase()}) *</label>
            {key === "body" || key === "meta_description" ? <textarea {...props} rows={key === "body" ? 10 : 3} /> : <input {...props} type="text" />}
            <p id={`${name}-help`} className="mt-1 text-xs leading-relaxed text-ink/60">
              {key === "body" && <>{text.aboutBodyHelp} </>}{text.aboutLimit.replace("{max}", String(ABOUT_CONTENT_LIMITS[key]))}
            </p>
            <AdminFieldError name={name} />
          </div>;
        })}
      </fieldset>;
    })}
  </fieldset>;
}
