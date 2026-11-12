"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateOrderStatus } from "@/lib/actions/orders";
import { ORDER_STATUS_OPTIONS, getOrderStatusLabel } from "@/lib/order-status";
import { useLangStore } from "@/store/lang-store";
import type { OrderStatus } from "@prisma/client";

export function OrderStatusSelect({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [isPending, startTransition] = useTransition();
  const { locale, t } = useLangStore();

  return (
    <select
      value={status}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value as OrderStatus;
        startTransition(async () => {
          try {
            await updateOrderStatus(orderId, value);
            toast.success(t.statuses.updated);
          } catch {
            toast.error(t.statuses.updateFailed);
          }
        });
      }}
      className="rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
    >
      {!ORDER_STATUS_OPTIONS.some((option) => option.value === status) && <option value={status} disabled>{getOrderStatusLabel(status, locale)}</option>}
      {ORDER_STATUS_OPTIONS.map((statusOption) => (
        <option key={statusOption.value} value={statusOption.value}>
          {getOrderStatusLabel(statusOption.value, locale)}
        </option>
      ))}
    </select>
  );
}
