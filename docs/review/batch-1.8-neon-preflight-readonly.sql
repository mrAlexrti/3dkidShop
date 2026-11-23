-- REVIEWED READ-ONLY PREFLIGHT CANDIDATE. NOT EXECUTED IN STAGE 1D.
-- Requires separate owner authorization even though this transaction is read-only.
-- Connect privately with an approved read-only role. Never paste a connection URL.
-- Session settings must name the reviewed database/connection/runtime/migration roles.
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF current_setting('batch18.readonly_preflight_approved', true) IS DISTINCT FROM 'true'
     OR current_database() IS DISTINCT FROM current_setting('batch18.expected_database', true)
     OR current_user::text IS DISTINCT FROM current_setting('batch18.expected_role', true)
     OR NULLIF(current_setting('batch18.application_role', true), '') IS NULL
     OR NULLIF(current_setting('batch18.migration_role', true), '') IS NULL
  THEN RAISE EXCEPTION 'B18_PREFLIGHT_IDENTITY_OR_APPROVAL_MISSING'; END IF;
END $$;

SELECT current_database() AS database_name, current_user AS connection_role,
       current_setting('server_version') AS postgres_version,
       pg_is_in_recovery() AS is_replica, current_setting('transaction_read_only') AS read_only;

-- Fingerprint only: function bodies/default expressions are hashed, never printed.
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

SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
  (SELECT count(*) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS indexes,
  (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f') AS foreign_keys;

SELECT c.relname AS table_name,k.conname,k.contype,k.convalidated,k.condeferrable,
       k.condeferred,pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY c.relname,k.conname;

SELECT c.relname AS table_name,i.relname AS index_name,x.indisvalid,x.indisready,pg_get_indexdef(i.oid)
FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY c.relname,i.relname;

-- No pg_authid/password columns and no business/customer rows.
SELECT r.rolname,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls
FROM pg_roles r
WHERE r.rolname IN (current_setting('batch18.application_role'),current_setting('batch18.migration_role'));

SELECT c.relname,c.relowner::regrole AS table_owner,
       pg_has_role(current_setting('batch18.application_role'),c.relowner,'MEMBER') AS runtime_is_owner_or_member,
       has_table_privilege(current_setting('batch18.application_role'),c.oid,'SELECT') AS runtime_select,
       has_table_privilege(current_setting('batch18.application_role'),c.oid,'INSERT') AS runtime_insert,
       has_table_privilege(current_setting('batch18.application_role'),c.oid,'UPDATE') AS runtime_update,
       has_table_privilege(current_setting('batch18.application_role'),c.oid,'DELETE') AS runtime_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;

SELECT has_schema_privilege(current_setting('batch18.application_role'),'public','CREATE') AS runtime_schema_create,
       has_schema_privilege(current_setting('batch18.application_role'),'public','USAGE') AS runtime_schema_usage;
SELECT m.member::regrole AS member_role,m.roleid::regrole AS granted_role,m.admin_option
FROM pg_auth_members m
WHERE m.member IN (SELECT oid FROM pg_roles WHERE rolname IN
  (current_setting('batch18.application_role'),current_setting('batch18.migration_role')));

SELECT count(*) AS products FROM public."Product";
SELECT count(*) AS product_options FROM public."ProductOption";
SELECT count(*) AS orders FROM public."Order";
-- Never print query text, parameters or contact details from active sessions.
SELECT count(*) AS other_open_transactions,
       max(clock_timestamp()-xact_start) AS oldest_transaction_age
FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL;
SELECT extname,extversion FROM pg_extension ORDER BY extname;
COMMIT;
