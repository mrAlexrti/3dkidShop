\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SELECT current_database() AS database_name, current_user AS migration_role;

DO $$
BEGIN
  IF to_regclass('public."CustomerFavorite"') IS NOT NULL OR to_regclass('public."CustomerRateLimit"') IS NOT NULL
    OR to_regclass('public."CustomerChallenge"') IS NOT NULL
    OR EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public' AND
      (table_name,column_name) IN (('Order','customerId'),('User','emailVerified'),('OrderItem','productImageUrl'),('ProductOptionValue','displayPosition')))
  THEN RAISE EXCEPTION 'B19_ALREADY_EXPANDED'; END IF;

  IF EXISTS (
    SELECT FROM (VALUES ('Product','batch18_product_guard'),('ProductVariant','batch18_integrity'),
      ('ProductOptionValue','batch18_child_guard'),('OrderItem','batch18_order_snapshot_guard'),
      ('ProductImage','batch18a_10_image_owner_guard'),('ProductImage','batch18a_20_image_color_guard'),
      ('VariantFilamentGroup','batch181_nonempty_group'),('VariantFilamentAlternative','batch181_lock_filament_group')) expected(rel,nm)
    WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_trigger
      WHERE tgrelid=to_regclass(format('public.%I', rel)) AND tgname=nm AND tgenabled IN ('O','A') AND NOT tgisinternal))
  THEN RAISE EXCEPTION 'B19_BASELINE_GUARD_MISSING'; END IF;

  IF current_user='app_3dkid' OR NOT has_schema_privilege(current_user, 'public', 'CREATE')
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname='app_3dkid'
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR has_schema_privilege('app_3dkid','public','CREATE')
    OR NOT has_schema_privilege('app_3dkid','public','USAGE')
    OR EXISTS (SELECT FROM pg_catalog.pg_class WHERE oid IN ('public."User"'::regclass, 'public."Account"'::regclass,
      'public."Session"'::regclass, 'public."Order"'::regclass, 'public."OrderItem"'::regclass, 'public."ProductOptionValue"'::regclass)
      AND pg_has_role('app_3dkid',relowner,'MEMBER'))
  THEN RAISE EXCEPTION 'B19_ROLE_MISMATCH'; END IF;

  IF EXISTS (SELECT FROM public."User" GROUP BY lower(email) HAVING count(*) > 1)
    OR EXISTS (SELECT FROM public."Order" WHERE btrim("customerEmail") = '')
  THEN RAISE EXCEPTION 'B19_REVIEW_EXISTING_EMAIL_DATA'; END IF;
END $$;

SELECT count(*) AS existing_users FROM public."User";
SELECT count(*) AS existing_orders FROM public."Order";
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee='app_3dkid' AND table_schema='public' AND table_name IN ('User','Account','Session','Order','OrderItem','ProductOptionValue')
ORDER BY table_name, privilege_type;
SELECT table_name, column_name, privilege_type FROM information_schema.role_column_grants
WHERE grantee='app_3dkid' AND table_schema='public' AND table_name IN ('User','Account','Session','Order','OrderItem','ProductOptionValue')
ORDER BY table_name, column_name, privilege_type;
ROLLBACK;
