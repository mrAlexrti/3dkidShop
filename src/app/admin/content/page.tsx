export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { updateSiteContent } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";

export default async function AdminContentPage() {
  const content = await prisma.siteContent.findMany();
  const map = Object.fromEntries(content.map((c) => [c.key, c.value]));

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <div>
      <h1 className="font-display text-3xl">Контент сайта</h1>
      <p className="mt-2 text-ink/60">Управление текстами главной страницы (Hero-блок)</p>

      <form action={updateSiteContent} className="glass mt-6 max-w-xl space-y-4 rounded-xl2 p-6 shadow-soft">
        <div>
          <label className="mb-1 block text-sm font-medium">Заголовок Hero</label>
          <input name="hero_title" defaultValue={map.hero_title} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Подзаголовок Hero</label>
          <textarea name="hero_subtitle" defaultValue={map.hero_subtitle} rows={2} className={inputClass} />
        </div>
        <Button type="submit">Сохранить</Button>
      </form>
    </div>
  );
}
