-- PREPARED ONLY. Do not execute without separate database-target approval.
-- Maintenance-window expansion; see the review document for baseline/cutover.
-- No order, item, number, payment reference or historical notification backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TYPE "CheckoutAcceptance" AS ENUM ('LEGACY', 'PROVISIONAL', 'ACCEPTED', 'REVIEW');
ALTER TABLE "Order"
  ALTER COLUMN "number" DROP NOT NULL,
  ADD COLUMN "checkoutAcceptance" "CheckoutAcceptance" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "checkoutKeyHash" TEXT,
  ADD COLUMN "checkoutPayloadHash" TEXT,
  ADD COLUMN "checkoutLocale" TEXT,
  ADD COLUMN "paymentPageUrl" TEXT;
CREATE UNIQUE INDEX "Order_paymentReference_key" ON "Order" ("paymentReference");
CREATE UNIQUE INDEX "Order_checkoutKeyHash_key" ON "Order" ("checkoutKeyHash");
CREATE INDEX "Order_checkoutAcceptance_createdAt_idx" ON "Order" ("checkoutAcceptance", "createdAt");
CREATE TABLE "OrderNotification" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "event" TEXT NOT NULL,
  "channel" TEXT NOT NULL CHECK ("channel" IN ('telegram', 'email')),
  "state" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING', 'SENDING', 'RETRY', 'SENT', 'UNKNOWN', 'SUPPRESSED')),
  "payload" JSONB NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0 CHECK ("attemptCount" >= 0),
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "dispatchId" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "OrderNotification_orderId_event_channel_key" ON "OrderNotification" ("orderId", "event", "channel");
CREATE INDEX "OrderNotification_state_nextAttemptAt_idx" ON "OrderNotification" ("state", "nextAttemptAt");
ALTER TABLE "Order" ADD CONSTRAINT "Order_checkout_acceptance_check" CHECK (
  ("checkoutAcceptance" = 'LEGACY' AND "number" IS NOT NULL)
  OR ("checkoutAcceptance" = 'ACCEPTED' AND "number" IS NOT NULL AND "acceptedAt" IS NOT NULL)
  OR ("checkoutAcceptance" = 'PROVISIONAL' AND "number" IS NULL AND "paymentReference" IS NOT NULL)
  OR ("checkoutAcceptance" = 'REVIEW' AND "paymentReference" IS NOT NULL)
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_checkout_locale_check" CHECK ("checkoutLocale" IS NULL OR "checkoutLocale" IN ('ua', 'en'));
COMMIT;
