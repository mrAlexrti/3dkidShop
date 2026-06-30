import { z } from "zod";

export const checkoutSchema = z.object({
  customerName: z.string().min(2, "Введите имя"),
  customerEmail: z.string().email("Некорректный email"),
  customerPhone: z.string().min(6, "Введите телефон"),
  shippingAddress: z.string().min(5, "Введите адрес"),
  city: z.string().min(2, "Введите город"),
  postalCode: z.string().min(3, "Введите индекс"),
  paymentMethod: z.enum(["card", "cash"]),
  comment: z.string().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
