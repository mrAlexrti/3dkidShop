\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_enum WHERE enumtypid='public."Role"'::regtype AND enumlabel='CUSTOMER')
    OR EXISTS (SELECT FROM (VALUES
      ('User','emailVerified'),('User','firstName'),('User','lastName'),('User','phone'),('Order','customerId'),
      ('OrderItem','productImageUrl'),('ProductOptionValue','displayPosition')) e(rel,nm)
      WHERE NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name=rel AND column_name=nm))
    OR NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public'
      AND table_name='Order' AND column_name='customerEmail' AND is_nullable='YES')
    OR to_regclass('public."User_email_casefold_key"') IS NULL
    OR to_regclass('public."Order_customerId_createdAt_id_idx"') IS NULL
    OR to_regclass('public."CustomerFavorite_pkey"') IS NULL
    OR to_regclass('public."CustomerFavorite_productId_idx"') IS NULL
    OR to_regclass('public."CustomerChallenge_pkey"') IS NULL
    OR to_regclass('public."CustomerChallenge_expires_idx"') IS NULL
    OR to_regclass('public."CustomerRateLimit_pkey"') IS NULL
    OR to_regclass('public."CustomerRateLimit_expires_idx"') IS NULL
    OR to_regclass('public."Session_userId_expires_idx"') IS NULL
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_constraint WHERE conrelid='public."Order"'::regclass AND conname='Order_customerId_fkey' AND contype='f' AND convalidated)
    OR EXISTS (SELECT FROM (VALUES ('Order','batch19_guard_order_owner'),('User','batch19_guard_customer_user'),
      ('Account','batch19_guard_customer_account'),('Session','batch19_guard_customer_session'),('OrderItem','batch19_guard_order_image'),
      ('OrderItem','batch18_order_snapshot_guard'),('VariantFilamentGroup','batch181_nonempty_group')) e(rel,nm)
      WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_trigger WHERE tgrelid=to_regclass(format('public.%I',rel)) AND tgname=nm AND tgenabled IN ('O','A')))
  THEN RAISE EXCEPTION 'B19_SCHEMA_VERIFICATION_FAILED'; END IF;

  IF NOT has_column_privilege('app_3dkid','public."User"','passwordHash','UPDATE')
    OR NOT has_column_privilege('app_3dkid','public."Order"','customerId','UPDATE')
    OR NOT has_column_privilege('app_3dkid','public."CustomerRateLimit"','hits','UPDATE')
    OR NOT has_table_privilege('app_3dkid','public."Session"','DELETE')
    OR NOT has_table_privilege('app_3dkid','public."CustomerFavorite"','INSERT')
    OR NOT has_table_privilege('app_3dkid','public."CustomerChallenge"','DELETE')
    OR has_table_privilege('app_3dkid','public."CustomerRateLimit"','DELETE')
    OR has_schema_privilege('app_3dkid','public','CREATE')
  THEN RAISE EXCEPTION 'B19_ACL_VERIFICATION_FAILED'; END IF;
END $$;

SELECT count(*) FILTER (WHERE "customerId" IS NOT NULL) AS owned_orders,
       count(*) FILTER (WHERE "customerEmail" IS NULL) AS orders_without_email,
       count(*) AS total_orders FROM public."Order";
SELECT count(*) FILTER (WHERE role='CUSTOMER') AS customers, count(*) FILTER (WHERE role<>'CUSTOMER') AS other_users FROM public."User";
ROLLBACK;
