"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { useLangStore } from "@/store/lang-store";

export function DeleteButton({ action, label }: { action: () => Promise<void>; label?: string }) {
  const [isPending, startTransition] = useTransition();
  const { t } = useLangStore();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (!confirm(t.admin.common.confirmDelete)) return;
        startTransition(async () => {
          try {
            await action();
            toast.success(t.admin.common.deleted);
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
  );
}
