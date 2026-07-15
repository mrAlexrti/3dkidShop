export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { updateSiteContent } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n-server";
import { FONT_THEMES, resolveFontTheme } from "@/lib/fonts";
import { SITE_FONT_KEY } from "@/lib/site-settings";

export default async function AdminContentPage() {
  const t = await getT();
  const tc = t.admin.content;

  const content = await prisma.siteContent.findMany();
  const map = Object.fromEntries(content.map((c) => [c.key, c.value]));
  const currentFont = resolveFontTheme(map[SITE_FONT_KEY]);

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <div>
      <h1 className="font-display text-3xl">{tc.title}</h1>
      <p className="mt-2 text-ink/60">{tc.subtitle}</p>

      <form action={updateSiteContent} className="glass mt-6 max-w-xl space-y-4 rounded-xl2 p-6 shadow-soft">
        <div>
          <label className="mb-1 block text-sm font-medium">{tc.heroTitle}</label>
          <input name="hero_title" defaultValue={map.hero_title} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{tc.heroSubtitle}</label>
          <textarea name="hero_subtitle" defaultValue={map.hero_subtitle} rows={2} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{tc.font}</label>
          <select name={SITE_FONT_KEY} defaultValue={currentFont} className={inputClass}>
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
    </div>
  );
}
