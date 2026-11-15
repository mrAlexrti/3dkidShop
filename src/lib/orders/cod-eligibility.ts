import type { Prisma } from "@prisma/client";
import { isCashOnDelivery } from "../payments/payment-method";
import { isOperationalOrder } from "../payments/acceptance";
import type { StatusSnapshot } from "../status";

type CodSnapshot = StatusSnapshot & {
  number?: string | null; checkoutAcceptance?: string; paymentInvoiceId?: string | null;
  novaPoshtaTtnRef?: string | null; novaPoshtaCreatedAt?: Date | null;
  novaPoshtaSyncedAt?: Date | null; novaPoshtaCodStatus?: string | null; novaPoshtaCodStatusCode?: string | null;
};

export function isGenuineCod(order: CodSnapshot) {
  return isCashOnDelivery(order.paymentMethod) && order.paymentProvider == null && order.paymentInvoiceId == null;
}

// Pickup address/branch and quoted COD amount are checkout data, not fulfillment.
const untouchedFields = ["novaPoshtaTtn", "novaPoshtaTtnRef", "novaPoshtaStatus", "novaPoshtaStatusCode", "novaPoshtaCreatedAt", "novaPoshtaSyncedAt", "novaPoshtaDeliveredAt", "novaPoshtaCodStatus", "novaPoshtaCodStatusCode"] as const;
export function isCodActionEligible(order: CodSnapshot) {
  return isOperationalOrder(order) && isGenuineCod(order) && order.status === "PENDING"
    && !order.paidAt && (order.paymentStatus == null || order.paymentStatus === "PENDING")
    && untouchedFields.every((key) => order[key] == null);
}

// Include every eligibility fact in the CAS; a TTN/payment arriving between the
// read and write must invalidate the action, even if status remains PENDING.
export function codActionSnapshotWhere(order: CodSnapshot): Prisma.OrderWhereInput {
  return {
    paymentMethod: order.paymentMethod, paymentProvider: null, paymentInvoiceId: null,
    paidAt: null, paymentStatus: order.paymentStatus ?? null,
    ...Object.fromEntries(untouchedFields.map((key) => [key, null])),
  };
}
