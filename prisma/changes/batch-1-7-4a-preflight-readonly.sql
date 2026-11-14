-- OPERATOR REVIEW ONLY. Never run automatically or during local verification.
-- Uses catalog metadata/aggregates only; no customer, capability or payload rows.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SELECT current_setting('server_version') AS server_version,
       current_schema() AS schema_name, pg_is_in_recovery() AS is_replica;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('Order','OrderItem','OrderNotification')
ORDER BY table_name, ordinal_position;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('Order','OrderItem','OrderNotification')
ORDER BY tablename,indexname;
SELECT conrelid::regclass::text AS relation, conname, contype, convalidated,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('Order','OrderItem','OrderNotification'));
SELECT typname, enumlabel FROM pg_type JOIN pg_enum ON enumtypid = pg_type.oid
WHERE typname IN ('CheckoutAcceptance','OrderStatus') ORDER BY typname,enumsortorder;
SELECT count(*) AS orders, count(*) FILTER (WHERE number IS NULL) AS null_numbers,
 count(*) FILTER (WHERE number ~ '^[0-9]+$' AND length(number) > 100) AS oversized_numbers,
 max(CASE WHEN number ~ '^[0-9]+$' AND length(number) <= 100 THEN number::numeric END) AS maximum_numeric_number
FROM "Order";
SELECT count(*) AS order_items FROM "OrderItem";
SELECT "paymentProvider", "paymentMode", "paymentStatus", status,
 ("paymentInvoiceId" IS NOT NULL) AS has_invoice,
 ("paymentNextCheckAt" IS NULL) AS no_scheduled_check, count(*)
FROM "Order" WHERE "paymentProvider" = 'mono'
GROUP BY 1,2,3,4,5,6 ORDER BY 1,2,3,4,5,6;
SELECT count(*) AS active_transactions,
 count(*) FILTER (WHERE xact_start < now() - interval '30 seconds') AS transactions_over_30s
FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL;
COMMIT;
