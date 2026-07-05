"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type CreateTtnResponse = {
  success: boolean;
  ttn?: string;
  error?: string;
  missingFields?: string[];
  alreadyCreated?: boolean;
};

export function CreateTtnButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function createTtn() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/create-ttn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as CreateTtnResponse;

      if (!response.ok || !data.success) {
        const details = data.missingFields?.length ? ` (${data.missingFields.join(", ")})` : "";
        toast.error(`${data.error || "Не вдалося створити ТТН"}${details}`);
        router.refresh();
        return;
      }

      toast.success(data.alreadyCreated ? `ТТН вже створена: ${data.ttn}` : `ТТН створена: ${data.ttn}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Помилка створення ТТН. Перевірте env Нової Пошти.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" size="lg" onClick={createTtn} disabled={loading} className="w-full">
      {loading ? "Створюємо ТТН..." : "Створити ТТН"}
    </Button>
  );
}