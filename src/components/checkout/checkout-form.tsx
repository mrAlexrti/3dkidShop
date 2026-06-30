"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/checkout";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";
import { createOrder } from "@/lib/actions/create-order";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { formatPrice } from "@/lib/utils";

export function CheckoutForm() {
  const { items, total, clear } = useCartStore();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "card" },
  });

  const onSubmit = async (data: CheckoutInput) => {
    setSubmitting(true);
    const result = await createOrder(data, items);
    setSubmitting(false);
    if (result.success) {
      clear();
      toast.success("Заказ оформлен!");
      router.push(`/checkout/success?order=${result.orderNumber}`);
    } else {
      toast.error(result.error);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <section>
        <h2 className="mb-4 font-display text-xl">Контактные данные</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <input placeholder="Имя и фамилия" className={inputClass} {...register("customerName")} />
            {errors.customerName && <p className="mt-1 text-xs text-pink-600">{errors.customerName.message}</p>}
          </div>
          <div>
            <input placeholder="Email" className={inputClass} {...register("customerEmail")} />
            {errors.customerEmail && <p className="mt-1 text-xs text-pink-600">{errors.customerEmail.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <input placeholder="Телефон" className={inputClass} {...register("customerPhone")} />
            {errors.customerPhone && <p className="mt-1 text-xs text-pink-600">{errors.customerPhone.message}</p>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl">Доставка</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <input placeholder="Адрес доставки" className={inputClass} {...register("shippingAddress")} />
            {errors.shippingAddress && <p className="mt-1 text-xs text-pink-600">{errors.shippingAddress.message}</p>}
          </div>
          <div>
            <input placeholder="Город" className={inputClass} {...register("city")} />
            {errors.city && <p className="mt-1 text-xs text-pink-600">{errors.city.message}</p>}
          </div>
          <div>
            <input placeholder="Индекс" className={inputClass} {...register("postalCode")} />
            {errors.postalCode && <p className="mt-1 text-xs text-pink-600">{errors.postalCode.message}</p>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl">Оплата</h2>
        <div className="flex gap-4">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm has-[:checked]:border-pink-500">
            <input type="radio" value="card" {...register("paymentMethod")} /> Карта онлайн
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm has-[:checked]:border-pink-500">
            <input type="radio" value="cash" {...register("paymentMethod")} /> При получении
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl">Комментарий к заказу</h2>
        <textarea
          placeholder="Пожелания к доставке (необязательно)"
          rows={3}
          className={inputClass}
          {...register("comment")}
        />
      </section>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Оформляем..." : `Оплатить ${formatPrice(total() >= 30 ? total() : total() + 4.5)}`}
      </Button>
    </form>
  );
}
