"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

export function DeleteButton({ action, label = "Удалить" }: { action: () => Promise<void>; label?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (!confirm("Вы уверены? Действие необратимо.")) return;
        startTransition(async () => {
          try {
            await action();
            toast.success("Удалено");
          } catch {
            toast.error("Не удалось удалить");
          }
        });
      }}
      className="rounded-full p-2 text-ink/40 hover:bg-pink-50 hover:text-pink-600 disabled:opacity-50"
      title={label}
    >
      <Trash2 size={16} />
    </button>
  );
}
