\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['public."CustomerCart"', 'public."CustomerCartImport"', 'public."CustomerCartPurchase"'] LOOP
    IF to_regclass(relation) IS NULL OR NOT has_table_privilege('app_3dkid', relation, 'SELECT')
      OR NOT has_table_privilege('app_3dkid', relation, 'INSERT')
      OR has_table_privilege('app_3dkid', relation, 'TRUNCATE')
    THEN RAISE EXCEPTION 'UX0910_GRANTS_REQUIRED %', relation; END IF;
  END LOOP;
  IF NOT has_column_privilege('app_3dkid', 'public."CustomerCart"', 'lines', 'UPDATE')
     OR has_column_privilege('app_3dkid', 'public."CustomerCart"', 'userId', 'UPDATE')
     OR has_table_privilege('app_3dkid', 'public."CustomerCartImport"', 'DELETE')
     OR NOT has_table_privilege('app_3dkid', 'public."CustomerCartPurchase"', 'DELETE')
     OR NOT has_column_privilege('app_3dkid', 'public."CustomerCartPurchase"', 'reconcileUntil', 'UPDATE')
     OR NOT has_column_privilege('app_3dkid', 'public."CustomerCartPurchase"', 'supersededByOrderId', 'UPDATE')
     OR has_column_privilege('app_3dkid', 'public."CustomerCartPurchase"', 'lines', 'UPDATE')
     OR NOT has_column_privilege('app_3dkid', 'public."Order"', 'paymentPageUrl', 'UPDATE')
     OR to_regclass('public."CustomerCartPurchase_supersededByOrderId_idx"') IS NULL
     OR to_regclass('public."CustomerCartImport_userId_idx"') IS NULL
     OR (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND convalidated AND
          conrelid IN ('public."CustomerCart"'::regclass,'public."CustomerCartImport"'::regclass,'public."CustomerCartPurchase"'::regclass)) <> 4
  THEN RAISE EXCEPTION 'UX0910_CART_INTEGRITY_REQUIRED'; END IF;
END $$;
SELECT (SELECT count(*) FROM public."CustomerCart") AS carts,
       (SELECT count(*) FROM public."CustomerCartImport") AS import_receipts,
       (SELECT count(*) FROM public."CustomerCartPurchase") AS pending_purchases;
COMMIT;
