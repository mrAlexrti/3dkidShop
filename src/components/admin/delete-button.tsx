"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminDeleteResult } from "@/lib/admin-form-validation";
import { toast } from "sonner";
import { useLangStore } from "@/store/lang-store";

export function DeleteButton({ action, archiveAction, label }: { action: () => Promise<AdminDeleteResult>; archiveAction?: () => Promise<AdminDeleteResult>; label?: string }) {
  const [isPending, startTransition] = useTransition();
  const { t } = useLangStore();
  const router = useRouter(); const [failure, setFailure] = useState<Exclude<AdminDeleteResult, void>["error"] | null>(null);

  return (
    <div><button type="button" aria-label={label ?? t.admin.common.delete}
      disabled={isPending}
      onClick={() => {
        if (!confirm(t.admin.common.confirmDelete)) return;
        startTransition(async () => {
          try {
            const result = await action();
            if (result?.error) { setFailure(result.error); return; }
            setFailure(null);
            toast.success(t.admin.common.deleted);
            router.refresh();
          } catch {
            toast.error(t.admin.common.deleteFailed);
          }
        });
      }}
      className="rounded-full p-2 text-ink/40 hover:bg-pink-50 hover:text-pink-600 disabled:opacity-50"
      title={label ?? t.admin.common.delete}
    >
      <Trash2 size={16} />
    </button>
    {failure && <div role="alert" className="max-w-xs space-y-2 p-2 text-xs text-red-700"><p>{t.admin.deletion[failure]}</p>
      {archiveAction && (failure === "orderHistory" || failure === "referenced") && <button type="button" disabled={isPending} className="min-h-11 rounded-full border px-3" onClick={() => {
        if (!confirm(t.admin.deletion.confirmArchive)) return;
        startTransition(async () => {
          try { const result = await archiveAction(); if (result?.error) { setFailure(result.error); return; } setFailure(null); toast.success(t.admin.deletion.archived); router.refresh(); }
          catch { toast.error(t.admin.common.saveError); }
        });
      }}>{t.admin.deletion.archive}</button>}
    </div>}</div>
  );
}
