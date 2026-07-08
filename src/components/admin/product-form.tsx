"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";

type Category = { id: string; name: string };

type ProductDefaults = {
  name?: string;
  slug?: string;
  description?: string;
  price?: number;
  oldPrice?: number | null;
  stock?: number;
  categoryId?: string;
  imageUrl?: string;
  isFeatured?: boolean;
  isNew?: boolean;
  isActive?: boolean;
};

export function ProductForm({
  categories,
  defaults,
  action,
}: {
  categories: Category[];
  defaults?: ProductDefaults;
  action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useLangStore();
  const tp = t.admin.product;

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          try {
            await action(formData);
            toast.success(t.admin.common.saved);
            router.push("/admin/products");
          } catch (e) {
            toast.error(t.admin.common.saveError);
            console.error(e);
          }
        });
      }}
      className="glass max-w-2xl space-y-5 rounded-xl2 p-6 shadow-soft"
    >
      <div>
        <label className="mb-1 block text-sm font-medium">{tp.name}</label>
        <input name="name" defaultValue={defaults?.name} required className={inputClass} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{tp.slug}</label>
        <input name="slug" defaultValue={defaults?.slug} required className={inputClass} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{tp.description}</label>
        <textarea name="description" defaultValue={defaults?.description} rows={4} required className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{tp.price}</label>
          <input name="price" type="number" step="0.01" defaultValue={defaults?.price} required className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{tp.oldPrice}</label>
          <input name="oldPrice" type="number" step="0.01" defaultValue={defaults?.oldPrice ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{tp.stock}</label>
          <input name="stock" type="number" defaultValue={defaults?.stock ?? 0} required className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{tp.category}</label>
          <select name="categoryId" defaultValue={defaults?.categoryId} required className={inputClass}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{tp.imageUrl}</label>
        <input name="imageUrl" type="url" defaultValue={defaults?.imageUrl} required className={inputClass} />
      </div>

      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isFeatured" defaultChecked={defaults?.isFeatured} /> {tp.featured}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isNew" defaultChecked={defaults?.isNew} /> {tp.isNew}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={defaults?.isActive ?? true} /> {tp.active}
        </label>
      </div>

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? t.admin.common.saving : t.admin.common.save}
      </Button>
    </form>
  );
}
