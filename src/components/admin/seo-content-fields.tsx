"use client";

import { useState } from "react";
import Image from "next/image";
import { AdminFieldError } from "@/components/admin/admin-form";
import { MediaUrlField } from "@/components/admin/media-url-field";
import { translations, type Locale } from "@/lib/i18n";
import { brandName, defaultSocialImage, faviconPath, seoLimits, siteOrigin } from "@/lib/seo-config";
import type { StorefrontContent } from "@/lib/site-content";
import { useLangStore } from "@/store/lang-store";

const languages = ["ua", "en"] as const;
const inputClass = "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

export function SeoContentFields({ content }: { content: StorefrontContent }) {
  const { t, locale } = useLangStore();
  const copy = t.seo.admin;
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  const [name, setName] = useState(content.seo_site_name ?? "");
  const [titles, setTitles] = useState({ ua: content.seo_home_title_ua ?? "", en: content.seo_home_title_en ?? "" });
  const [descriptions, setDescriptions] = useState({
    ua: content.seo_home_description_ua ?? "", en: content.seo_home_description_en ?? "",
  });
  const previewCopy = translations[previewLocale].seo;
  return <fieldset id="seo-content" className="min-w-0 space-y-5">
    <legend className="mb-3 text-lg font-semibold">{copy.section}</legend>
    <p className="text-sm text-ink/70">{copy.introduction}</p>
    <div>
      <label htmlFor="seo_site_name" className="mb-1 block text-sm font-medium">{copy.name}</label>
      <input id="seo_site_name" name="seo_site_name" maxLength={seoLimits.name} value={name} placeholder={brandName}
        onChange={event => setName(event.target.value)} aria-describedby="seo-site-name-help" className={inputClass} />
      <p id="seo-site-name-help" className="mt-1 text-xs text-ink/60">{copy.nameHelp}</p>
      <AdminFieldError name="seo_site_name" />
    </div>
    {languages.map(lang => {
      const languageCopy = translations[lang].seo;
      const titleKey = `seo_home_title_${lang}`;
      const descriptionKey = `seo_home_description_${lang}`;
      return <div className="grid min-w-0 gap-4 sm:grid-cols-2" key={lang}>
        <div className="min-w-0">
          <label htmlFor={titleKey} className="mb-1 block text-sm font-medium">{copy.title} ({lang.toUpperCase()})</label>
          <input id={titleKey} name={titleKey} maxLength={seoLimits.title} value={titles[lang]}
            placeholder={languageCopy.homeTitle} onChange={event => setTitles(previous => ({ ...previous, [lang]: event.target.value }))}
            aria-describedby={`${titleKey}-help`} className={inputClass} />
          <p id={`${titleKey}-help`} className="mt-1 text-xs text-ink/60">{copy.titleHelp} <span className="tabular-nums">{titles[lang].length || languageCopy.homeTitle.length}/{seoLimits.title}</span></p>
          <AdminFieldError name={titleKey} />
        </div>
        <div className="min-w-0">
          <label htmlFor={descriptionKey} className="mb-1 block text-sm font-medium">{copy.description} ({lang.toUpperCase()})</label>
          <textarea id={descriptionKey} name={descriptionKey} maxLength={seoLimits.description} rows={3}
            value={descriptions[lang]} placeholder={languageCopy.homeDescription}
            onChange={event => setDescriptions(previous => ({ ...previous, [lang]: event.target.value }))}
            aria-describedby={`${descriptionKey}-help`} className={inputClass} />
          <p id={`${descriptionKey}-help`} className="mt-1 text-xs text-ink/60">{copy.descriptionHelp} <span className="tabular-nums">{descriptions[lang].length || languageCopy.homeDescription.length}/{seoLimits.description}</span></p>
          <AdminFieldError name={descriptionKey} />
        </div>
      </div>;
    })}
    <MediaUrlField name="seo_social_image" label={copy.image} help={copy.imageHelp} defaultValue={content.seo_social_image}
      fallback={defaultSocialImage} resetLabel={copy.reset} uploadEnabled widePreview />
    <div className="flex items-center gap-3">
      <Image src={faviconPath} alt="" width={48} height={48} unoptimized />
      <div><p className="text-sm font-medium">{copy.favicon}</p><p className="text-xs text-ink/60">{copy.faviconHelp}</p></div>
    </div>
    <div className="space-y-3 rounded-xl border border-ink/10 bg-white p-4" id="seo-search-preview">
      <p className="text-sm font-semibold">{copy.preview}</p>
      <p className="text-xs text-ink/60">{copy.previewNote}</p>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {copy.previewLocale}
        <select value={previewLocale} onChange={event => setPreviewLocale(event.target.value === "en" ? "en" : "ua")}
          className="rounded-lg border border-ink/15 px-2 py-1">
          {languages.map(lang => <option key={lang} value={lang}>{t.language[lang]}</option>)}
        </select>
      </label>
      <div className="break-words rounded-xl border border-ink/10 bg-[#fffafb] p-4">
        <div className="flex items-center gap-2 text-sm">
          <Image src={faviconPath} alt="" width={24} height={24} unoptimized />
          <div className="min-w-0"><p>{name.trim() || brandName}</p><p className="text-xs text-ink/60">{siteOrigin}</p></div>
        </div>
        <p className="mt-2 line-clamp-2 text-xl text-blue-800">{titles[previewLocale].trim() || previewCopy.homeTitle}</p>
        <p className="mt-1 line-clamp-3 text-sm text-ink/70">{descriptions[previewLocale].trim() || previewCopy.homeDescription}</p>
      </div>
    </div>
  </fieldset>;
}
