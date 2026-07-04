import { z } from "zod";

export const checkoutSchema = z.object({
  customerName: z.string().min(2, "Введіть ім'я"),
  customerSurname: z.string().min(2, "Введіть прізвище"),
  customerEmail: z.string().email("Некоректний email"),
  customerPhone: z.string().min(10, "Введіть номер телефону"),

  deliveryType: z.enum(["np_warehouse", "np_parcel_locker", "np_courier"]),

  npCityRef: z.string().optional(),
  npCityName: z.string().min(2, "Оберіть місто"),
  npWarehouseRef: z.string().optional(),
  npWarehouseAddress: z.string().optional(),
  npCourierAddress: z.string().optional(),

  paymentMethod: z.enum(["card_online", "cash_on_delivery", "pay_on_pickup"]),

  comment: z.string().optional(),
}).superRefine((data, ctx) => {
  if ((data.deliveryType === "np_warehouse" || data.deliveryType === "np_parcel_locker") && !data.npWarehouseRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["npWarehouseRef"],
      message: data.deliveryType === "np_parcel_locker" ? "Оберіть поштомат" : "Оберіть відділення",
    });
  }

  if ((data.deliveryType === "np_warehouse" || data.deliveryType === "np_parcel_locker") && !data.npWarehouseAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["npWarehouseAddress"],
      message: data.deliveryType === "np_parcel_locker" ? "Оберіть поштомат" : "Оберіть відділення",
    });
  }

  if (data.deliveryType === "np_courier" && !data.npCourierAddress?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["npCourierAddress"],
      message: "Введіть адресу доставки",
    });
  }
});

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
