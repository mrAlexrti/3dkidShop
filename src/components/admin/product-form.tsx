"use client";

import { generateProductSlug, slugFromNameChange, type ProductSaveResult } from "@/lib/product-slug";
import { Fragment, useTransition, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";
import type { CategoryTreeNode } from "@/lib/categories";
import { MediaUrlField } from "@/components/admin/media-url-field";
import { SizeEditor } from "@/components/admin/size-editor";
import type { LegacySize, SizeVariant } from "@/lib/product-variants";

type ProductDefaults = {
  variants?: SizeVariant[];
  legacySizes?: LegacySize[];
  name?: string;
  nameEn?: string | null;
  slug?: string;
  description?: string;
  descriptionEn?: string | null;
  price?: number;
  oldPrice?: number | null;
  isOrderable?: boolean;
  categoryId?: string;
  imageUrl?: string;
  hoverGifUrl?: string | null;
  isFeatured?: boolean;
  isNew?: boolean;
  isActive?: boolean;
};

export function ProductForm({
  categories,
  defaults,
  action,
}: {
  categories: CategoryTreeNode[];
  defaults?: ProductDefaults;
  action: (formData: FormData) => Promise<ProductSaveResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useLangStore();
  const tp = t.admin.product;
  const [slugState, setSlugState] = useState({ name: defaults?.name ?? "", slug: defaults?.slug ?? "", manual: Boolean(defaults) });
  const [slugError, setSlugError] = useState<"slugInvalid" | "slugDuplicate" | null>(null);
  const activeUploads = useRef(new Set<string>());
  const [uploading, setUploading] = useState(false);
  const uploadStateChanged = (name: string, busy: boolean) => {
    if (busy) activeUploads.current.add(name); else activeUploads.current.delete(name);
    setUploading(activeUploads.current.size > 0);
  };

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <form
      action={(formData) => {
        if (activeUploads.current.size) return;
        startTransition(async () => {
          try {
            setSlugError(null);
            const result = await action(formData);
            if (result?.error) {
              if (result.error === "mediaRetired") toast.error(t.admin.media.retired);
              else setSlugError(result.error);
              return;
            }
            toast.success(t.admin.common.saved);
            router.push("/admin/products");
          } catch (e) {
            toast.error(t.admin.common.saveError);
            console.error(e);
          }
        });
      }}
      className="glass max-w-2xl space-y-5 rounded-xl2 p-4 shadow-soft sm:p-6"
    >
      <div>
        <label htmlFor="product-name-ua" className="mb-1 block text-sm font-medium">{tp.nameUa}</label>
        <input id="product-name-ua" name="name" value={slugState.name} onChange={(event) => setSlugState((state) => slugFromNameChange(state, event.target.value))} required className={inputClass} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{tp.nameEn}</label>
        <input name="nameEn" defaultValue={defaults?.nameEn ?? ""} required className={inputClass} />
      </div>

      <div>
        <label htmlFor="product-slug" className="mb-1 block text-sm font-medium">{tp.slug}</label>
        <input id="product-slug" name="slug" value={slugState.slug} onChange={(event) => { setSlugState((state) => ({ ...state, slug: event.target.value, manual: true })); setSlugError(null); }} maxLength={160} required aria-describedby="product-slug-help product-slug-error" aria-invalid={Boolean(slugError)} className={inputClass} />
        <p id="product-slug-help" className="mt-1 text-xs text-ink/60">{tp.slugHelp}</p>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => { setSlugState((state) => ({ ...state, slug: generateProductSlug(state.name), manual: false })); setSlugError(null); }}>{tp.slugRegenerate}</button>
        <p id="product-slug-error" role="alert" className="text-sm text-red-700">{slugError ? tp[slugError] : ""}</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{tp.descriptionUa}</label>
        <textarea name="description" defaultValue={defaults?.description} rows={4} required className={inputClass} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">{tp.descriptionEn}</label>
        <textarea name="descriptionEn" defaultValue={defaults?.descriptionEn ?? ""} rows={4} required className={inputClass} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">{tp.price}</label>
          <input name="price" type="number" step="0.01" defaultValue={defaults?.price} required className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{tp.oldPrice}</label>
          <input name="oldPrice" type="number" step="0.01" defaultValue={defaults?.oldPrice ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input name="isOrderable" type="checkbox" defaultChecked={defaults?.isOrderable ?? false} />
            {tp.isOrderable}
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{tp.category}</label>
          <select name="categoryId" defaultValue={defaults?.categoryId} required className={inputClass}>
            {categories.map((category) => (
              <Fragment key={category.id}>
                <option value={category.id}>{category.name}</option>
                {category.children.map((child, index) => (
                  <option key={child.id} value={child.id}>
                    {`  ${index === category.children.length - 1 ? "└" : "├"}─ ${child.name}`}
                  </option>
                ))}
              </Fragment>
            ))}
          </select>
        </div>
      </div>

      <MediaUrlField name="imageUrl" label={tp.imageUrl} help={t.admin.media.imageHelp} defaultValue={defaults?.imageUrl ?? ""} uploadEnabled required disabled={isPending} onUploadStateChange={uploadStateChanged} />
      <MediaUrlField name="hoverGifUrl" label={tp.hoverGif} help={tp.hoverGifHelp} defaultValue={defaults?.hoverGifUrl ?? ""} uploadEnabled animated disabled={isPending} onUploadStateChange={uploadStateChanged} />
      <SizeEditor defaults={defaults?.variants} legacySizes={defaults?.legacySizes} />

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
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

      <Button type="submit" size="lg" disabled={isPending || uploading}>
        {isPending ? t.admin.common.saving : t.admin.common.save}
      </Button>
    </form>
  );
}
