"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminDeleteResult } from "@/lib/admin-form-validation";
import { toast } from "sonner";
import { useLangStore } from "@/store/lang-store";
import { ConfirmButton, namedConfirmation } from "./confirm-button";

export function DeleteButton({ action, archiveAction, label, recordName = "", recordNameEn, recordKind = "product", disabledReason }: { action: () => Promise<AdminDeleteResult>; archiveAction?: () => Promise<AdminDeleteResult>; label?: string; recordName?: string; recordNameEn?: string | null; recordKind?: "product" | "category"; disabledReason?: string }) {
  const [isPending, startTransition] = useTransition();
  const { t, locale } = useLangStore();
  const name = locale === "en" && recordNameEn?.trim() ? recordNameEn : recordName;
  const router = useRouter(); const [failure, setFailure] = useState<Exclude<AdminDeleteResult, void>["error"] | null>(null);
  const failureText = failure ? recordKind === "category" && (failure === "referenced" || failure === "notFound" || failure === "deleteFailed")
    ? t.adminSafety[failure === "notFound" ? "categoryMissing" : failure === "deleteFailed" ? "categoryFailed" : "categoryReference"] : t.admin.deletion[failure] : "";

  return (
    <div><ConfirmButton label={label ?? t.admin.common.delete}
      disabled={isPending || Boolean(disabledReason)}
      message={namedConfirmation(t.adminSafety[recordKind], name)}
      onConfirm={async () => {
          try {
            const result = await action();
            if (result?.error) { setFailure(result.error); return; }
            setFailure(null);
            toast.success(t.admin.common.deleted);
            router.refresh();
          } catch {
            toast.error(t.admin.common.deleteFailed);
          }
      }}
      className="rounded-full p-2 text-ink/40 hover:bg-pink-50 hover:text-pink-600 disabled:opacity-50"
      title={disabledReason ?? label ?? t.admin.common.delete}
    >
      <Trash2 size={16} />
    </ConfirmButton>
    {disabledReason && <p className="max-w-xs text-xs text-ink/60">{disabledReason}</p>}
    {failure && <div role="alert" className="max-w-xs space-y-2 p-2 text-xs text-red-700"><p>{namedConfirmation(failureText, name)}</p>
      {archiveAction && (failure === "orderHistory" || failure === "referenced") && <ConfirmButton disabled={isPending} className="min-h-11 rounded-full border px-3" actionLabel={t.admin.deletion.archive} message={namedConfirmation(t.adminSafety.archive, name)} onConfirm={async () => {
        await new Promise<void>((resolve) => startTransition(async () => {
          try { const result = await archiveAction(); if (result?.error) { setFailure(result.error); return; } setFailure(null); toast.success(t.admin.deletion.archived); router.refresh(); }
          catch { toast.error(t.admin.common.saveError); }
          finally { resolve(); }
        }));
      }}>{t.admin.deletion.archive}</ConfirmButton>}
    </div>}</div>
  );
}
