\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $$
BEGIN
  IF to_regclass('public."CustomerFavorite"') IS NULL
     OR to_regprocedure('public.batch19_guard_order_owner()') IS NULL
     OR to_regclass('public."CustomerCart"') IS NOT NULL
     OR to_regclass('public."CustomerCartImport"') IS NOT NULL
     OR to_regclass('public."CustomerCartPurchase"') IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_3dkid' AND NOT rolsuper AND NOT rolbypassrls)
  THEN RAISE EXCEPTION 'UX0910_BASELINE_REQUIRED'; END IF;
END $$;
COMMIT;
