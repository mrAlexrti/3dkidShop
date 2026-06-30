"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateOrderStatus } from "@/lib/actions/orders";
import type { OrderStatus } from "@prisma/client";

const STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "PENDING", label: "Ожидает" },
  { value: "PAID", label: "Оплачен" },
  { value: "PROCESSING", label: "В обработке" },
  { value: "SHIPPED", label: "Отправлен" },
  { value: "COMPLETED", label: "Завершён" },
  { value: "CANCELLED", label: "Отменён" },
];

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
          toast.success("Статус обновлён");
        });
      }}
      className="rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
