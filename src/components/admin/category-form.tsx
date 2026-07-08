"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";

type ParentOption = { id: string; name: string };

type CategoryDefaults = {
  name?: string;
  slug?: string;
  imageUrl?: string | null;
  description?: string | null;
  parentId?: string | null;
};

export function CategoryForm({
  parents,
  defaults,
  action,
  mode,
}: {
  parents: ParentOption[];
  defaults?: CategoryDefaults;
  action: (formData: FormData) => Promise<void>;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useLangStore();
  const tc = t.admin.categories;

  const [imageUrl, setImageUrl] = useState(defaults?.imageUrl ?? "");
  const [imgError, setImgError] = useState(false);
  const showPreview = imageUrl.trim() !== "" && !imgError;

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          try {
            await action(formData);
            toast.success(t.admin.common.saved);
            if (mode === "edit") router.push("/admin/categories");
            else router.refresh();
          } catch (e) {
            toast.error(t.admin.common.saveError);
            console.error(e);
          }
        });
      }}
      className="space-y-3"
    >
      <input name="name" defaultValue={defaults?.name} placeholder={tc.name} required className={inputClass} />
      <input name="slug" defaultValue={defaults?.slug} placeholder={tc.slug} required className={inputClass} />

      <div>
        <label className="mb-1 block text-xs font-medium text-ink/50">{tc.parent}</label>
        <select name="parentId" defaultValue={defaults?.parentId ?? ""} className={inputClass}>
          <option value="">{t.admin.common.none}</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <input
          name="imageUrl"
          value={imageUrl}
          onChange={(e) => {
            setImageUrl(e.target.value);
            setImgError(false);
          }}
          placeholder={tc.image}
          className={inputClass}
        />
        <div className="mt-2 flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-pink-100 bg-pink-50">
            {showPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-pink-300">
                <ImageOff size={20} />
              </div>
            )}
          </div>
          <span className="text-xs text-ink/40">
            {showPreview ? t.admin.common.preview : tc.imageHint}
          </span>
        </div>
      </div>

      <textarea
        name="description"
        defaultValue={defaults?.description ?? ""}
        placeholder={tc.description}
        rows={2}
        className={inputClass}
      />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t.admin.common.saving : mode === "edit" ? t.admin.common.save : t.admin.common.create}
      </Button>
    </form>
  );
}
