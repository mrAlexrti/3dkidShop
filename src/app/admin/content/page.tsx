export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { updateSiteContent } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { MediaUrlField } from "@/components/admin/media-url-field";
import { getT } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { FONT_THEMES, resolveFontTheme } from "@/lib/fonts";
import { SITE_FONT_KEY } from "@/lib/site-settings";
import { heroAssets } from "@/lib/hero-assets";
import { updateNotificationSettings } from "@/lib/actions/notification-settings";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { CONFIGURABLE_EVENTS } from "@/lib/notifications/events";

export default async function AdminContentPage() {
  const t = await getT();
  const tc = t.admin.content;
  const notificationSettings = await getNotificationSettings();

  const content = await prisma.siteContent.findMany();
  const map = Object.fromEntries(content.map((c) => [c.key, c.value]));
  const currentFont = resolveFontTheme(map[SITE_FONT_KEY]);

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <div>
      <h1 className="font-display text-3xl">{tc.title}</h1>
      <p className="mt-2 text-ink/60">{tc.subtitle}</p>

      <form action={updateSiteContent} className="glass mt-6 max-w-3xl space-y-8 rounded-xl2 p-6 shadow-soft">
        <fieldset className="space-y-4">
          <legend className="mb-4 text-lg font-semibold">{tc.heroText}</legend>
          {(["ua", "en"] as const).map((locale) => (
            <div key={locale} className="space-y-4">
              <div>
                <label htmlFor={`hero_title_${locale}`} className="mb-1 block text-sm font-medium">{tc.heroTitle} ({locale.toUpperCase()})</label>
                <input id={`hero_title_${locale}`} name={`hero_title_${locale}`} defaultValue={map[`hero_title_${locale}`]} maxLength={500}
                  placeholder={translations[locale].home.hero.title} className={inputClass} />
              </div>
              <div>
                <label htmlFor={`hero_subtitle_${locale}`} className="mb-1 block text-sm font-medium">{tc.heroSubtitle} ({locale.toUpperCase()})</label>
                <textarea id={`hero_subtitle_${locale}`} name={`hero_subtitle_${locale}`} defaultValue={map[`hero_subtitle_${locale}`]} maxLength={2000} rows={2} className={inputClass} />
              </div>
            </div>
          ))}
          <p className="text-xs text-ink/60">{tc.heroTextHint}</p>
        </fieldset>
        <fieldset className="space-y-5">
          <legend className="mb-4 text-lg font-semibold">{tc.heroImages}</legend>
          {heroAssets.map((asset, index) => <MediaUrlField key={asset.key} name={asset.key} label={`${tc.heroImage} ${index + 1}`}
            help={tc.heroImageHint} defaultValue={map[asset.key]} fallback={asset.src} />)}
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="mb-4 text-lg font-semibold">{tc.socials}</legend>
          {(["instagram", "telegram", "tiktok", "youtube"] as const).map((network) => (
            <div key={network}>
              <label htmlFor={`social_${network}`} className="mb-1 block text-sm font-medium">{tc.socialUrl.replace("{network}", t.footer.social[network])}</label>
              <input id={`social_${network}`} name={`social_${network}`} type="url" pattern="https?://.*" defaultValue={map[`social_${network}`]} placeholder="https://…" className={inputClass} />
            </div>
          ))}
          <p className="text-xs text-ink/60">{tc.socialHint}</p>
        </fieldset>
        <div>
          <label htmlFor={SITE_FONT_KEY} className="mb-1 block text-sm font-medium">{tc.font}</label>
          <select id={SITE_FONT_KEY} name={SITE_FONT_KEY} defaultValue={currentFont} className={inputClass}>
            {Object.entries(FONT_THEMES).map(([id, theme]) => (
              <option key={id} value={id}>
                {theme.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink/40">{tc.fontHint}</p>
        </div>
        <Button type="submit">{tc.save}</Button>
      </form>
      <form action={updateNotificationSettings} className="glass mt-6 max-w-3xl space-y-6 rounded-xl2 p-6 shadow-soft">
        <h2 className="font-display text-xl">{t.notifications.title}</h2>
        <p className="text-sm text-ink/60">{t.notifications.description}</p>
        <div className="grid gap-6 sm:grid-cols-2">
          {(["telegram", "email"] as const).map((channel) => <fieldset key={channel} className="space-y-3">
            <legend className="mb-3 font-semibold">{t.notifications[channel]}</legend>
            {CONFIGURABLE_EVENTS.map((event) => <label key={event} className="flex items-start gap-3 text-sm">
              <input type="checkbox" name={`${channel}.${event}`} defaultChecked={notificationSettings[channel][event]} className="mt-1 accent-pink-500" />
              {t.notifications.events[event]}
            </label>)}
          </fieldset>)}
        </div>
        <Button type="submit">{t.notifications.save}</Button>
      </form>
    </div>
  );
}
