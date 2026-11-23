-- PRODUCTION READ-ONLY PREFLIGHT. No DDL, DML, ledger writes or secret/customer output.
-- psql 18 script; required nonsecret variables are listed in the rollout report.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT set_config('batch18.expected_database', :'expected_database', true) AS expected_database,
       set_config('batch18.expected_role', :'connection_role', true) AS connection_role,
       set_config('batch18.application_role', :'application_role', true) AS application_role,
       set_config('batch18.migration_role', :'migration_role', true) AS migration_role
\gset b18_setting_

DO $$ BEGIN
 IF current_database() IS DISTINCT FROM current_setting('batch18.expected_database')
 OR current_user::text IS DISTINCT FROM current_setting('batch18.expected_role')
 OR nullif(current_setting('batch18.application_role'),'') IS NULL
 OR nullif(current_setting('batch18.migration_role'),'') IS NULL
 THEN RAISE EXCEPTION 'B18_READONLY_TARGET_MISMATCH'; END IF;
END $$;
SELECT current_database() AS database_name,current_user AS connection_role,
 current_setting('server_version') AS server_version,pg_is_in_recovery() AS is_replica,
 current_setting('transaction_read_only') AS read_only;
-- B18_SCHEMA_FINGERPRINT_BEGIN
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
-- B18_SCHEMA_FINGERPRINT_END
SELECT c.relname AS table_name,c.relowner::regrole AS owner,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;
-- Hash definitions: never emit defaults, function bodies or potentially secret expressions.
SELECT c.relname AS table_name,a.attname,a.attnotnull,format_type(a.atttypid,a.atttypmod) AS type,
 md5(coalesce(pg_get_expr(d.adbin,d.adrelid),'')) AS default_hash
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum;
SELECT c.relname AS table_name,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,
 k.confdeltype,k.confupdtype,k.conkey,k.confkey,k.confrelid::regclass AS reference,
 md5(pg_get_constraintdef(k.oid)) AS definition_hash
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY c.relname,k.conname;
SELECT c.relname AS table_name,i.relname AS index_name,x.indisvalid,x.indisready,x.indisunique,
 md5(pg_get_indexdef(i.oid)) AS definition_hash
FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,i.relname;
SELECT c.relname AS table_name,t.tgname,t.tgenabled,t.tgdeferrable,t.tginitdeferred,
 md5(pg_get_triggerdef(t.oid)) AS definition_hash,md5(p.prosrc) AS function_body_hash
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;
SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder;
SELECT r.rolname,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls
FROM pg_roles r WHERE r.rolname IN (current_user,current_setting('batch18.application_role'),current_setting('batch18.migration_role'));
SELECT c.relname AS table_name,c.relowner::regrole AS owner,
 pg_has_role(current_setting('batch18.migration_role'),c.relowner,'USAGE') AS migration_effective_owner,
 pg_has_role(current_setting('batch18.application_role'),c.relowner,'MEMBER') AS runtime_owner_or_member,
 has_table_privilege(current_setting('batch18.application_role'),c.oid,'SELECT') AS runtime_select,
 has_table_privilege(current_setting('batch18.application_role'),c.oid,'INSERT') AS runtime_insert,
 has_table_privilege(current_setting('batch18.application_role'),c.oid,'UPDATE') AS runtime_update,
 has_table_privilege(current_setting('batch18.application_role'),c.oid,'DELETE') AS runtime_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;
SELECT has_schema_privilege(current_setting('batch18.migration_role'),'public','CREATE') AS migration_schema_create,
 has_schema_privilege(current_setting('batch18.migration_role'),'public','USAGE') AS migration_schema_usage,
 has_language_privilege(current_setting('batch18.migration_role'),'plpgsql','USAGE') AS migration_plpgsql_usage,
 has_schema_privilege(current_setting('batch18.application_role'),'public','CREATE') AS runtime_schema_create;
SELECT extname,extversion FROM pg_extension ORDER BY extname;
SELECT jsonb_object_agg(name,n ORDER BY name) FROM (SELECT 'Account' AS name,count(*)::bigint AS n FROM public."Account" UNION ALL SELECT 'Category' AS name,count(*)::bigint AS n FROM public."Category" UNION ALL SELECT 'Order' AS name,count(*)::bigint AS n FROM public."Order" UNION ALL SELECT 'OrderItem' AS name,count(*)::bigint AS n FROM public."OrderItem" UNION ALL SELECT 'OrderNotification' AS name,count(*)::bigint AS n FROM public."OrderNotification" UNION ALL SELECT 'Product' AS name,count(*)::bigint AS n FROM public."Product" UNION ALL SELECT 'ProductAttribute' AS name,count(*)::bigint AS n FROM public."ProductAttribute" UNION ALL SELECT 'ProductImage' AS name,count(*)::bigint AS n FROM public."ProductImage" UNION ALL SELECT 'ProductOption' AS name,count(*)::bigint AS n FROM public."ProductOption" UNION ALL SELECT 'ProductOptionValue' AS name,count(*)::bigint AS n FROM public."ProductOptionValue" UNION ALL SELECT 'Review' AS name,count(*)::bigint AS n FROM public."Review" UNION ALL SELECT 'Session' AS name,count(*)::bigint AS n FROM public."Session" UNION ALL SELECT 'SiteContent' AS name,count(*)::bigint AS n FROM public."SiteContent" UNION ALL SELECT 'User' AS name,count(*)::bigint AS n FROM public."User") counts;
SELECT count(*) AS option_values,count(*) FILTER (WHERE price IS NOT NULL) AS absolute_price_values,
 count(*) FILTER (WHERE price IS NULL AND "priceModifier"<>0) AS modifier_only_values FROM public."ProductOptionValue";
SELECT count(DISTINCT "productId") AS products_with_options FROM public."ProductOption";
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_prisma_ledger
\gset
\if :has_prisma_ledger
 SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back
 FROM public._prisma_migrations ORDER BY migration_name;
 SELECT count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unfinished_migrations FROM public._prisma_migrations;
\else
 SELECT 'ABSENT: repository currently uses reviewed manual SQL' AS prisma_migration_history;
\endif
-- No query text, query parameters, connection strings, customer IDs or addresses.
SELECT usename,backend_type,state,md5(coalesce(application_name,'')) AS application_name_hash,
 count(*) AS sessions,max(clock_timestamp()-xact_start) AS oldest_transaction_age
FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
GROUP BY usename,backend_type,state,md5(coalesce(application_name,''));
SELECT count(*) FILTER (WHERE datname=current_database() AND pid<>pg_backend_pid()) AS sessions_visible
FROM pg_stat_activity;
COMMIT;
