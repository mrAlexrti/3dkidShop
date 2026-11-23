-- READ ONLY: collect missing rehearsal baseline metadata, not a new rehearsal.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'restore_3dkid_batch18' OR current_user::text<>'postgres'
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432
 OR current_setting('server_version_num')::int<>180007 OR pg_is_in_recovery()
 OR lower(rtrim(replace(current_setting('data_directory'),chr(92),'/'),'/'))<>'c:/users/alexa/appdata/local/3dkid-pg18-restore'
 THEN RAISE EXCEPTION 'B18_WRONG_BASELINE_TARGET'; END IF;
END $$;
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
COMMIT;
