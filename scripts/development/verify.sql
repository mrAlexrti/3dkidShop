BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog, public;
WITH cols AS (
 SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
   a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid) AS def
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
), defs AS (
 SELECT 'column' AS kind, row_to_json(cols)::text AS definition FROM cols
 UNION ALL
 SELECT 'table',concat(relname,':',relkind,':',relrowsecurity,':',relforcerowsecurity)
 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','S')
 UNION ALL
 SELECT 'constraint',concat(conname,':',conrelid::regclass,':',convalidated,':',pg_get_constraintdef(oid))
 FROM pg_constraint WHERE connamespace='public'::regnamespace
 UNION ALL
 SELECT 'index',pg_get_indexdef(indexrelid) FROM pg_index WHERE indrelid IN
   (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
 UNION ALL
 SELECT 'function',pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f'
 UNION ALL
 SELECT 'trigger',concat(tgenabled,':',pg_get_triggerdef(oid)) FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
 UNION ALL
 SELECT 'enum',concat(enumtypid::regtype,':',enumsortorder,':',enumlabel) FROM pg_enum
 WHERE enumtypid IN (SELECT oid FROM pg_type WHERE typnamespace='public'::regnamespace)
 UNION ALL
 SELECT 'sequence',concat(seqrelid::regclass,':',seqtypid::regtype,':',seqstart,':',seqincrement,':',seqmin,':',seqmax,':',seqcache,':',seqcycle)
 FROM pg_sequence WHERE seqrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
), acl AS (
 SELECT name,grant_privilege FROM (
  SELECT c.relname AS name, concat(x.grantee=0,':',x.privilege_type,':',x.is_grantable) AS grant_privilege
  FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
  WHERE c.relnamespace='public'::regnamespace AND x.grantee IN (0,'app_3dkid'::regrole)
  UNION ALL
  SELECT c.relname||'.'||a.attname, concat(x.grantee=0,':',x.privilege_type,':',x.is_grantable)
  FROM pg_class c JOIN pg_attribute a ON c.oid=a.attrelid CROSS JOIN LATERAL aclexplode(a.attacl) x
  WHERE c.relnamespace='public'::regnamespace AND x.grantee IN (0,'app_3dkid'::regrole)
  UNION ALL
  SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', concat(x.grantee=0,':',x.privilege_type,':',x.is_grantable)
  FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
  WHERE p.pronamespace='public'::regnamespace AND x.grantee IN (0,'app_3dkid'::regrole)
  UNION ALL
  SELECT t.typname, concat(x.grantee=0,':',x.privilege_type,':',x.is_grantable)
  FROM pg_type t CROSS JOIN LATERAL aclexplode(t.typacl) x
  WHERE t.typnamespace='public'::regnamespace AND x.grantee IN (0,'app_3dkid'::regrole)
 ) grants
)
SELECT 'schema_sha256='||encode(sha256(convert_to(string_agg(kind||':'||definition, E'\n' ORDER BY kind COLLATE "C",definition COLLATE "C"),'UTF8')),'hex')
FROM defs
UNION ALL
SELECT 'acl_sha256='||encode(sha256(convert_to(string_agg(name||':'||grant_privilege, E'\n' ORDER BY name COLLATE "C",grant_privilege COLLATE "C"),'UTF8')),'hex')
FROM acl
UNION ALL
SELECT 'objects='||string_agg(kind||':'||count,',' ORDER BY kind COLLATE "C") FROM (SELECT kind,count(*) FROM defs GROUP BY kind) counted;
COMMIT;
