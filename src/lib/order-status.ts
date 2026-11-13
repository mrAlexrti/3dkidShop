import { OrderStatus } from "@prisma/client";
import { translations, type Locale } from "@/lib/i18n";

export const ORDER_STATUS_LABELS = Object.fromEntries(Object.values(OrderStatus).map((status) => [status, getOrderStatusLabel(status)])) as Record<OrderStatus, string>;

export const EDITABLE_ORDER_STATUSES = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.COMPLETED, OrderStatus.CANCELLED] as const;
export const ORDER_STATUS_OPTIONS = EDITABLE_ORDER_STATUSES.map((value) => ({ value, label: getOrderStatusLabel(value) }));

export function getOrderStatusLabel(status: OrderStatus | string, locale: Locale = "ua") {
  const t = translations[locale].statuses;
  const labels: Record<OrderStatus, string> = {
    PENDING: t.order.NEW, AWAITING_PAYMENT: t.payment.PENDING,
    PROCESSING: t.order.PROCESSING, PAID: t.payment.PAID,
    SHIPPED: t.delivery.SHIPPED, DELIVERED: t.delivery.DELIVERED,
    COMPLETED: t.order.COMPLETED, CANCELLED: t.order.CANCELLED,
  };
  return Object.hasOwn(labels, status) ? labels[status as OrderStatus] : t.order.NEW;
}

function isFinalStatus(status: OrderStatus) {
  return status === OrderStatus.CANCELLED || status === OrderStatus.COMPLETED;
}

export function getInitialOrderStatus() {
  return OrderStatus.PENDING;
}

export function getOrderStatusAfterPaymentReceived(currentStatus: OrderStatus, isDelivered: boolean) {
  if (isFinalStatus(currentStatus)) return currentStatus;
  return isDelivered || currentStatus === OrderStatus.DELIVERED ? OrderStatus.COMPLETED : currentStatus;
}

export function getOrderStatusAfterTtnCreated(currentStatus: OrderStatus) {
  // A label being created is not evidence of carrier handover.
  return currentStatus;
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
  return currentStatus;
}
