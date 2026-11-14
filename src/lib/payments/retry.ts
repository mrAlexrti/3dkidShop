import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAuthSecret } from "@/lib/server-env";
import { validAttemptResultToken } from "./order-result";
import { canStartNewPayment } from "./retry-state";
import { queryMonoInvoice } from "./mono";
import { monoEvidence } from "./mono-state";
import { applyPaymentEvidence } from "./transitions";

export type PaymentRetrySource = { reference: string; token: string };

// No invoice is created here. Unknown responses, refunds and financial review
// fail closed. This is also checked again at checkout, immediately before creation.
export async function verifiedPaymentRetry(source: PaymentRetrySource): Promise<string | null> {
  if (!source || !validAttemptResultToken(source.reference, source.token)) return null;
  const before = await prisma.order.findUnique({ where: { paymentReference: source.reference } });
  if (!before || !canStartNewPayment(before) || !before.checkoutKeyHash) return null;
  const snapshot = await queryMonoInvoice(before.paymentInvoiceId!);
  if (snapshot.invoiceId !== before.paymentInvoiceId || snapshot.reference !== source.reference) return null;
  const outcome = await applyPaymentEvidence(monoEvidence(snapshot), { authoritativeSnapshot: true });
  if (!["applied", "duplicate"].includes(outcome)) return null;
  const after = await prisma.order.findUnique({ where: { id: before.id } });
  if (!after || !canStartNewPayment(after)) return null;
  const secret = getAuthSecret();
  if (!secret) return null;
  // Repeated clicks/tabs share one successor identity; the previous identity and
  // record remain immutable. Each later failed successor can authorize its own retry.
  return createHmac("sha256", secret).update(`checkout-retry:v1:${source.reference}:${before.checkoutKeyHash}`).digest("hex");
}
