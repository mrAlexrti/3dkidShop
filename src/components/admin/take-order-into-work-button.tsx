"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";
import { normalizeOrderStage } from "@/lib/status";
import { takeOrderIntoWorkAction } from "@/lib/actions/orders";

export function TakeOrderIntoWorkButton({ orderId, status }: { orderId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { t, locale } = useLangStore();
  if (normalizeOrderStage(status) !== "NEW") return null;
  return <Button type="button" disabled={pending} onClick={() => startTransition(async () => {
    try {
      const result = await takeOrderIntoWorkAction(orderId, locale);
      if (result === "taken") toast.success(t.statuses.work.taken);
      else toast.message(t.statuses.work[result]);
      router.refresh();
    } catch { toast.error(t.statuses.updateFailed); }
  })}>{pending ? t.statuses.work.taking : t.statuses.work.take}</Button>;
}
