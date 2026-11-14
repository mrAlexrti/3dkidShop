-- Post-expansion operator checks only. Not executed against any existing DB.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT "checkoutAcceptance", "paymentStatus", count(*)
FROM "Order" GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) FILTER (WHERE "paidAt" IS NOT NULL AND "checkoutAcceptance" IN ('PROVISIONAL','REVIEW')) AS paid_unaccepted,
 count(*) FILTER (WHERE "checkoutAcceptance" = 'ACCEPTED' AND (number IS NULL OR "acceptedAt" IS NULL)) AS broken_acceptance,
 count(*) FILTER (WHERE "paymentNextCheckAt" <= now()) AS due_payments,
 count(*) FILTER (WHERE "paymentNextCheckAt" < now() - interval '10 minutes') AS overdue_payments,
 count(*) FILTER (WHERE "checkoutAcceptance" IN ('PROVISIONAL','REVIEW') AND "paymentNextCheckAt" IS NULL) AS unscheduled_attempts
FROM "Order";
SELECT state,channel,count(*),min("createdAt") AS oldest_created,
 min("nextAttemptAt") AS oldest_next_attempt
FROM "OrderNotification" GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) AS expired_sender_leases FROM "OrderNotification"
WHERE state = 'SENDING' AND "leaseUntil" < now();
COMMIT;
