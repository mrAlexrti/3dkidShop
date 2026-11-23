-- READ-ONLY POST-MIGRATION / PRE-DEPLOYMENT CHECK. Not a rollback script.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='30s';
SELECT set_config('batch18.expected_database', :'expected_database', true) AS expected_database,
       set_config('batch18.expected_role', :'connection_role', true) AS connection_role,
       set_config('batch18.application_role', :'application_role', true) AS application_role,
       set_config('batch18.migration_role', :'migration_role', true) AS migration_role
\gset b18_setting_

DO $$ BEGIN
 IF current_database() IS DISTINCT FROM current_setting('batch18.expected_database')
 OR current_user::text IS DISTINCT FROM current_setting('batch18.expected_role') OR pg_is_in_recovery()
 THEN RAISE EXCEPTION 'B18_READONLY_TARGET_MISMATCH'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p'))<>16
 OR (SELECT count(*) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')<>42
 OR (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f')<>16
 THEN RAISE EXCEPTION 'B18_POST_MIGRATION_OBJECT_SET_DIFFERS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (NOT x.indisvalid OR NOT x.indisready))
 THEN RAISE EXCEPTION 'B18_INVALID_INDEX'; END IF;
 IF EXISTS(SELECT 1 FROM public."Product" WHERE "optionMode"<>'LEGACY' OR "variantRevision"<>0)
 OR EXISTS(SELECT 1 FROM public."Product" WHERE materials IS NOT NULL OR "materialsEn" IS NOT NULL OR "materialsDivider" IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public."ProductVariant") OR EXISTS(SELECT 1 FROM public."ProductVariantSelection")
 OR EXISTS(SELECT 1 FROM public."ProductOption" WHERE kind IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public."ProductOptionValue" WHERE "retiredAt" IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public."OrderItem" WHERE "productVariantId" IS NOT NULL)
 THEN RAISE EXCEPTION 'B18_UNEXPECTED_CONVERSION_AT_CUTOVER'; END IF;
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN ('batch18_product_guard','batch18_child_guard','batch18_integrity','batch18_order_snapshot_guard'))<>11
 OR (SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public' AND k.conname IN ('ProductVariantSelection_productId_optionId_fkey','ProductVariantSelection_optionId_valueId_fkey') AND k.convalidated AND k.condeferrable AND k.condeferred)<>2
 THEN RAISE EXCEPTION 'B18_POST_MIGRATION_GUARDS_DIFFER'; END IF;
 IF EXISTS (SELECT 1 FROM (VALUES ('batch18_product_guard','38d7e532fe7ae93349f57661d87159cd'),('batch18_child_guard','aca46935d30db8cbfe056ce186e92a1d'),('batch18_validate_product','a6fd14c2f213342f31e9cdc12c87d236'),('batch18_deferred_integrity','ed55824d0dc86513fa9a061875384475'),('batch18_order_snapshot_guard','4b58db7ee5a96975f1bd371afc255b62')) e(name,hash)
 LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace
 WHERE p.oid IS NULL OR md5(p.prosrc)<>e.hash OR p.prosecdef OR p.proconfig IS NULL OR NOT ('search_path=pg_catalog'=ANY(p.proconfig)))
 THEN RAISE EXCEPTION 'B18_GUARD_BODY_OR_CONTEXT_DIFFERS'; END IF;
 IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
 AND p.proname IN ('batch18_product_guard','batch18_child_guard','batch18_validate_product','batch18_deferred_integrity','batch18_order_snapshot_guard'))<>5
 OR EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal AND t.tgname LIKE 'batch18_%'
 AND (t.tgenabled<>'O' OR (t.tgname='batch18_integrity' AND (NOT t.tgdeferrable OR NOT t.tginitdeferred))))
 THEN RAISE EXCEPTION 'B18_GUARD_SET_OR_ENABLEMENT_DIFFERS'; END IF;
 -- After DDL COMMIT a failure here blocks deployment; it cannot undo the migration.
 IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
 WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('ProductVariant','ProductVariantSelection')
 AND NOT has_table_privilege(current_setting('batch18.application_role'),c.oid,p.privilege))
 OR NOT has_function_privilege(current_setting('batch18.application_role'),'public.batch18_validate_product(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'B18_RUNTIME_PRIVILEGE_REVIEW_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Category_parentId_fkey' AND conrelid='public."Category"'::regclass AND confdeltype='r' AND convalidated)
 THEN RAISE EXCEPTION 'B18_CATEGORY_HIERARCHY_NOT_RESTRICTED'; END IF;
END $;
SELECT md5(coalesce(jsonb_agg(item ORDER BY item::text COLLATE "C")::text, '[]')) AS schema_fingerprint
FROM (
  SELECT jsonb_build_array('table', c.relname, c.relkind, c.relispartition,
                          c.relrowsecurity, c.relforcerowsecurity) AS item
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  UNION ALL
  SELECT jsonb_build_array('column', c.relname, a.attname, a.attnum,
           format_type(a.atttypid,a.atttypmod), a.attnotnull, a.attidentity,
           a.attgenerated, pg_get_expr(d.adbin,d.adrelid), a.attcollation::regcollation::text)
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT jsonb_build_array('constraint', c.relname, k.conname, k.contype,
           k.condeferrable,k.condeferred,k.convalidated,pg_get_constraintdef(k.oid))
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  UNION ALL
  SELECT jsonb_build_array('index', c.relname,i.relname,x.indisvalid,x.indisready,pg_get_indexdef(i.oid))
  FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
  JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
  UNION ALL
  SELECT jsonb_build_array('enum',t.typname,e.enumlabel,e.enumsortorder)
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public'
  UNION ALL
  SELECT jsonb_build_array('trigger',c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid))
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
  UNION ALL
  SELECT jsonb_build_array('routine',p.proname,pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind IN ('f','p')
) fingerprint_objects;
SELECT jsonb_object_agg(name,n ORDER BY name) FROM (SELECT 'Account' AS name,count(*)::bigint AS n FROM public."Account" UNION ALL SELECT 'Category' AS name,count(*)::bigint AS n FROM public."Category" UNION ALL SELECT 'Order' AS name,count(*)::bigint AS n FROM public."Order" UNION ALL SELECT 'OrderItem' AS name,count(*)::bigint AS n FROM public."OrderItem" UNION ALL SELECT 'OrderNotification' AS name,count(*)::bigint AS n FROM public."OrderNotification" UNION ALL SELECT 'Product' AS name,count(*)::bigint AS n FROM public."Product" UNION ALL SELECT 'ProductAttribute' AS name,count(*)::bigint AS n FROM public."ProductAttribute" UNION ALL SELECT 'ProductImage' AS name,count(*)::bigint AS n FROM public."ProductImage" UNION ALL SELECT 'ProductOption' AS name,count(*)::bigint AS n FROM public."ProductOption" UNION ALL SELECT 'ProductOptionValue' AS name,count(*)::bigint AS n FROM public."ProductOptionValue" UNION ALL SELECT 'Review' AS name,count(*)::bigint AS n FROM public."Review" UNION ALL SELECT 'Session' AS name,count(*)::bigint AS n FROM public."Session" UNION ALL SELECT 'SiteContent' AS name,count(*)::bigint AS n FROM public."SiteContent" UNION ALL SELECT 'User' AS name,count(*)::bigint AS n FROM public."User") counts;
-- Individual privilege checks; a comma-separated list would mean ANY, not ALL.
SELECT c.relname AS table_name,p.privilege,
 has_table_privilege(current_setting('batch18.application_role'),c.oid,p.privilege) AS permitted
FROM pg_class c CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('ProductVariant','ProductVariantSelection');
COMMIT;
