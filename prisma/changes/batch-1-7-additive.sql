-- Approved print-on-demand model and one-time mapping; local preparation only.
-- DO NOT EXECUTE: no database target or execution has been approved.
BEGIN;
-- ADD COLUMN takes a table lock held until commit. Coordinate a maintenance
-- cutover so the old application cannot resume stock-based writes afterwards.
ALTER TABLE "Product" ADD COLUMN "isOrderable" BOOLEAN;
UPDATE "Product" SET "isOrderable" = ("stock" > 0);
ALTER TABLE "Product"
  ALTER COLUMN "isOrderable" SET DEFAULT false,
  ALTER COLUMN "isOrderable" SET NOT NULL;

-- Existing orders retain NULL in all six new payment fields; no order backfill.
ALTER TABLE "Order"
  ADD COLUMN "paymentInvoiceId" TEXT,
  ADD COLUMN "paymentProviderStatus" TEXT,
  ADD COLUMN "paymentModifiedAt" TIMESTAMP(3),
  ADD COLUMN "paymentExpiresAt" TIMESTAMP(3),
  ADD COLUMN "paymentNextCheckAt" TIMESTAMP(3),
  ADD COLUMN "paymentErrorCode" TEXT;
CREATE UNIQUE INDEX "Order_paymentProvider_paymentInvoiceId_key"
  ON "Order" ("paymentProvider", "paymentInvoiceId");
CREATE INDEX "Order_paymentProvider_paymentNextCheckAt_idx"
  ON "Order" ("paymentProvider", "paymentNextCheckAt");
COMMIT;
