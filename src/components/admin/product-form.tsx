"use client";

import { generateProductSlug, slugFromNameChange, type ProductSaveResult } from "@/lib/product-slug";
import { MaterialsFields } from "./materials-fields";
import { Fragment, useState } from "react";
import { useLangStore } from "@/store/lang-store";
import type { CategoryTreeNode } from "@/lib/categories";
import { MediaUrlField } from "@/components/admin/media-url-field";
import { SizeEditor } from "@/components/admin/size-editor";
import { AdminForm, AdminFieldError, AdminSaveButton } from "@/components/admin/admin-form";
import { GalleryEditor } from "@/components/admin/gallery-editor";
import type { ProductPhoto } from "@/lib/product-gallery-admin";
import type { LegacySize, SizeVariant } from "@/lib/product-variants";
import { VariantEditor } from "./variant-editor";
import type { ProductConfiguration, OptionMode } from "@/lib/product-configuration";

type ProductDefaults = {
  optionMode?: OptionMode;
  variantRevision?: number;
  configuration?: ProductConfiguration;
  history?: { page: number; pages: number; href: string };
  variants?: SizeVariant[];
  legacySizes?: LegacySize[];
  name?: string;
  nameEn?: string | null;
  slug?: string;
  description?: string;
  descriptionEn?: string | null;
  materials?: string | null;
  materialsEn?: string | null;
  materialsDivider?: string | null;
  price?: number;
  oldPrice?: number | null;
  isOrderable?: boolean;
  categoryId?: string;
  imageUrl?: string;
  images?: ProductPhoto[];
  hoverGifUrl?: string | null;
  isFeatured?: boolean;
  isNew?: boolean;
  isActive?: boolean;
};

export function ProductForm({
  categories,
  defaults,
  action,
  allowNative = false,
}: {
  categories: CategoryTreeNode[];
  defaults?: ProductDefaults;
  action: (formData: FormData) => Promise<ProductSaveResult>;
  allowNative?: boolean;
}) {
  const { t } = useLangStore();
  const tp = t.admin.product;
  const legacy = Boolean(defaults) && (!defaults?.optionMode || defaults.optionMode === "LEGACY");
  const [nativeEditing, setNativeEditing] = useState(!legacy && (Boolean(defaults) || allowNative));
  const [slugState, setSlugState] = useState({ name: defaults?.name ?? "", slug: defaults?.slug ?? "", manual: Boolean(defaults) });

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <AdminForm action={action} successHref="/admin/products"
      className="glass max-w-2xl space-y-5 rounded-xl2 p-4 shadow-soft sm:p-6"
    >
      <input type="hidden" name="variantRevision" value={defaults?.variantRevision ?? 0} />
      <div>
        <label htmlFor="product-name-ua" className="mb-1 block text-sm font-medium">{tp.nameUa} *</label>
        <input id="product-name-ua" name="name" minLength={2} value={slugState.name} onChange={(event) => setSlugState((state) => slugFromNameChange(state, event.target.value))} required className={inputClass} /><AdminFieldError name="name" />
      </div>

      <div>
        <label htmlFor="product-name-en" className="mb-1 block text-sm font-medium">{tp.nameEn} *</label>
        <input id="product-name-en" name="nameEn" minLength={2} defaultValue={defaults?.nameEn ?? ""} required className={inputClass} /><AdminFieldError name="nameEn" />
      </div>

      <div>
        <label htmlFor="product-slug" className="mb-1 block text-sm font-medium">{tp.slug} *</label>
        <input id="product-slug" name="slug" value={slugState.slug} onChange={(event) => setSlugState((state) => ({ ...state, slug: event.target.value, manual: true }))} maxLength={160} required aria-describedby="product-slug-help" className={inputClass} />
        <p id="product-slug-help" className="mt-1 text-xs text-ink/60">{tp.slugHelp}</p>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => setSlugState((state) => ({ ...state, slug: generateProductSlug(state.name), manual: false }))}>{tp.slugRegenerate}</button>
        <AdminFieldError name="slug" />
      </div>

      <div>
        <label htmlFor="product-description-ua" className="mb-1 block text-sm font-medium">{tp.descriptionUa} *</label>
        <textarea id="product-description-ua" name="description" minLength={5} defaultValue={defaults?.description} rows={4} required className={inputClass} /><AdminFieldError name="description" />
      </div>

      <div>
        <label htmlFor="product-description-en" className="mb-1 block text-sm font-medium">{tp.descriptionEn} *</label>
        <textarea id="product-description-en" name="descriptionEn" minLength={5} defaultValue={defaults?.descriptionEn ?? ""} rows={4} required className={inputClass} /><AdminFieldError name="descriptionEn" />
      </div>

      <MaterialsFields defaults={defaults} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="product-price" className="mb-1 block text-sm font-medium">{tp.price} *</label>
          <input id="product-price" name="price" type="number" min="0.01" max="99999999.99" step="0.01" defaultValue={defaults?.price} required className={inputClass} /><AdminFieldError name="price" />
          <p className="mt-1 text-xs text-ink/60">{t.variantConfig.basePriceHelp}</p>
        </div>
        <div>
          <label htmlFor="product-old-price" className="mb-1 block text-sm font-medium">{tp.oldPrice}</label>
          <input id="product-old-price" name="oldPrice" type="number" min="0.01" max="99999999.99" step="0.01" defaultValue={defaults?.oldPrice ?? ""} className={inputClass} /><AdminFieldError name="oldPrice" />
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
          <label htmlFor="product-category" className="mb-1 block text-sm font-medium">{tp.category} *</label>
          <select id="product-category" name="categoryId" defaultValue={defaults?.categoryId} required className={inputClass}>
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
          <AdminFieldError name="categoryId" />
        </div>
      </div>

      <GalleryEditor images={defaults?.images} imageUrl={defaults?.imageUrl} />
      <MediaUrlField name="hoverGifUrl" label={tp.hoverGif} help={tp.hoverGifHelp} defaultValue={defaults?.hoverGifUrl ?? ""} uploadEnabled animated />
      <VariantEditor configuration={defaults?.configuration} legacySizes={defaults?.variants} enabled={nativeEditing} onEnabled={setNativeEditing} legacy={legacy} history={defaults?.history} allowNative={allowNative} />
      <fieldset disabled={nativeEditing} hidden={nativeEditing}><SizeEditor defaults={defaults?.variants} legacySizes={defaults?.legacySizes} /><AdminFieldError name="variants" /></fieldset>

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

      <AdminSaveButton size="lg" />
    </AdminForm>
  );
}
