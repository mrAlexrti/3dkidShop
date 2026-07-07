import { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Очікує",
  AWAITING_PAYMENT: "Очікує оплати",
  PROCESSING: "В обробці",
  SHIPPED: "Відправлено",
  DELIVERED: "Доставлено",
  PAID: "Оплачено",
  COMPLETED: "Завершено",
  CANCELLED: "Скасовано",
};

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({
  value: value as OrderStatus,
  label,
}));

export function getOrderStatusLabel(status: OrderStatus | string) {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

function isFinalStatus(status: OrderStatus) {
  return status === OrderStatus.CANCELLED || status === OrderStatus.COMPLETED;
}

export function getInitialOrderStatus(paymentMethod: string) {
  return paymentMethod === "card_online" ? OrderStatus.AWAITING_PAYMENT : OrderStatus.PROCESSING;
}

export function getOrderStatusAfterPaymentReceived(currentStatus: OrderStatus, isDelivered: boolean) {
  if (isFinalStatus(currentStatus)) return currentStatus;
  return isDelivered || currentStatus === OrderStatus.DELIVERED ? OrderStatus.COMPLETED : OrderStatus.PAID;
}

export function getOrderStatusAfterTtnCreated(currentStatus: OrderStatus) {
  if (isFinalStatus(currentStatus)) return currentStatus;
  return OrderStatus.SHIPPED;
}

export function getOrderStatusAfterNovaPoshtaSync({
  currentStatus,
  isDelivered,
  isPaid,
}: {
  currentStatus: OrderStatus;
  isDelivered: boolean;
  isPaid: boolean;
}) {
  if (isFinalStatus(currentStatus)) return currentStatus;
  if (isDelivered && isPaid) return OrderStatus.COMPLETED;
  if (isDelivered) return OrderStatus.DELIVERED;
  if (isPaid) return OrderStatus.PAID;
  return currentStatus;
}