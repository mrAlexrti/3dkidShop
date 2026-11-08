import { z } from "zod";
import { translations, type Locale } from "@/lib/i18n";

export function getCheckoutSchema(locale: Locale = "ua") {
  const message = translations[locale].checkout.validation;
  return z.object({
  customerName: z.string().trim().min(2, message.name),
  customerSurname: z.string().trim().min(2, message.surname),
  customerEmail: z.string().trim().email(message.email),
  customerPhone: z.string().trim().refine((value) => /^[+\d\s()-]+$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, "")), message.phone),

  deliveryType: z.enum(["np_warehouse", "np_parcel_locker", "np_courier"], { errorMap: () => ({ message: message.invalid }) }),

  npCityRef: z.string().optional(),
  npCityName: z.string().trim().min(2, message.city),
  npWarehouseRef: z.string().optional(),
  npWarehouseAddress: z.string().optional(),
  npCourierAddress: z.string().optional(),

  paymentMethod: z.enum(["card_online", "cash_on_delivery", "pay_on_pickup"], { errorMap: () => ({ message: message.invalid }) }),

  comment: z.string().optional(),
}).superRefine((data, ctx) => {
  if ((data.deliveryType === "np_warehouse" || data.deliveryType === "np_parcel_locker") && !data.npWarehouseRef?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["npWarehouseRef"],
      message: data.deliveryType === "np_parcel_locker" ? message.locker : message.branch,
    });
  }

  if ((data.deliveryType === "np_warehouse" || data.deliveryType === "np_parcel_locker") && !data.npWarehouseAddress?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["npWarehouseAddress"],
      message: data.deliveryType === "np_parcel_locker" ? message.locker : message.branch,
    });
  }

  if (data.deliveryType === "np_courier" && !data.npCourierAddress?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["npCourierAddress"],
      message: message.address,
    });
  }
});
}

export const checkoutSchema = getCheckoutSchema();

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const DELIVERY_LABELS: Record<CheckoutInput["deliveryType"], string> = {
  np_warehouse: "Нова Пошта — відділення",
  np_parcel_locker: "Нова Пошта — поштомат",
  np_courier: "Кур'єр Нова Пошта",
};

export const PAYMENT_LABELS: Record<CheckoutInput["paymentMethod"], string> = {
  card_online: "Оплата карткою онлайн",
  cash_on_delivery: "Накладений платіж",
  pay_on_pickup: "Оплата при отриманні",
};
