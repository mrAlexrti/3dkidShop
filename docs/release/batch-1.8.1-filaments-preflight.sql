\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS migration_role, session_user AS login_role;

DO $$
BEGIN
  IF to_regclass('public."Filament"') IS NOT NULL
    OR to_regclass('public."VariantFilamentGroup"') IS NOT NULL
    OR to_regclass('public."VariantFilamentAlternative"') IS NOT NULL
    OR to_regprocedure('public.batch181_lock_filament_group()') IS NOT NULL
    OR to_regprocedure('public.batch181_check_filament_group()') IS NOT NULL
  THEN RAISE EXCEPTION 'B181_PREFLIGHT_OBJECTS_ALREADY_PRESENT'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public."Product"', 'batch18_product_guard'),
      ('public."ProductVariant"', 'batch18_child_guard'),
      ('public."ProductVariant"', 'batch18_integrity'),
      ('public."ProductVariantSelection"', 'batch18_integrity'),
      ('public."OrderItem"', 'batch18_order_snapshot_guard'),
      ('public."ProductImage"', 'batch18a_10_image_owner_guard'),
      ('public."ProductImage"', 'batch18a_20_image_color_guard')
    ) AS expected(relation, trigger_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=to_regclass(expected.relation) AND t.tgname=expected.trigger_name
        AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal))
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid=to_regclass('public."ProductImage"') AND conname='ProductImage_colorValueId_fkey' AND convalidated)
  THEN RAISE EXCEPTION 'B181_PREFLIGHT_BASELINE_GUARDS_MISSING'; END IF;

  IF current_user='app_3dkid'
    OR NOT has_schema_privilege(current_user, 'public', 'CREATE')
    OR NOT has_column_privilege(current_user, 'public."ProductVariant"', 'id', 'REFERENCES')
  THEN RAISE EXCEPTION 'B181_PREFLIGHT_MIGRATION_PRIVILEGES'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname='app_3dkid' AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR has_schema_privilege('app_3dkid', 'public', 'CREATE')
    OR NOT has_schema_privilege('app_3dkid', 'public', 'USAGE')
    OR NOT has_table_privilege('app_3dkid', 'public."Product"', 'SELECT')
    OR NOT has_any_column_privilege('app_3dkid', 'public."Product"', 'UPDATE')
    OR NOT has_table_privilege('app_3dkid', 'public."ProductVariant"', 'SELECT')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class
      WHERE oid IN ('public."Product"'::regclass, 'public."ProductVariant"'::regclass,
        'public."ProductImage"'::regclass, 'public."OrderItem"'::regclass)
        AND pg_has_role('app_3dkid', relowner, 'MEMBER'))
  THEN RAISE EXCEPTION 'B181_PREFLIGHT_RUNTIME_PRIVILEGES'; END IF;
END $$;
ROLLBACK;
