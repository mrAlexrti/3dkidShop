"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateOrderStatus } from "@/lib/actions/orders";
import { ORDER_STATUS_OPTIONS } from "@/lib/order-status";
import type { OrderStatus } from "@prisma/client";

export function OrderStatusSelect({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value as OrderStatus;
        startTransition(async () => {
          await updateOrderStatus(orderId, value);
          toast.success("Статус оновлено");
        });
      }}
      className="rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
    >
      {ORDER_STATUS_OPTIONS.map((statusOption) => (
        <option key={statusOption.value} value={statusOption.value}>
          {statusOption.label}
        </option>
      ))}
    </select>
  );
}