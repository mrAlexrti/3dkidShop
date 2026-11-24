\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT count(*) AS filaments FROM public."Filament";
SELECT count(*) AS requirement_groups FROM public."VariantFilamentGroup";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."VariantFilamentGroup" g
    WHERE NOT EXISTS (SELECT 1 FROM public."VariantFilamentAlternative" a WHERE a."groupId"=g.id))
  THEN RAISE EXCEPTION 'B181_EMPTY_FILAMENT_GROUP'; END IF;
  IF NOT has_table_privilege('app_3dkid', 'public."Filament"', 'SELECT')
    OR NOT has_table_privilege('app_3dkid', 'public."Filament"', 'INSERT')
    OR EXISTS (
      SELECT 1 FROM (VALUES ('manufacturer'), ('series'), ('material'), ('color'), ('hex'), ('isAvailable')) AS fields(name)
      WHERE NOT has_column_privilege('app_3dkid', 'public."Filament"', fields.name, 'UPDATE'))
    OR EXISTS (
      SELECT 1 FROM (VALUES ('public."VariantFilamentGroup"'), ('public."VariantFilamentAlternative"')) AS relations(name)
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('DELETE')) AS privileges(name)
      WHERE NOT has_table_privilege('app_3dkid', relations.name, privileges.name))
    OR NOT has_column_privilege('app_3dkid', 'public."VariantFilamentGroup"', 'position', 'UPDATE')
    OR has_schema_privilege('app_3dkid', 'public', 'CREATE')
    OR has_table_privilege('app_3dkid', 'public."Filament"', 'DELETE')
    OR has_column_privilege('app_3dkid', 'public."Filament"', 'id', 'UPDATE')
    OR has_any_column_privilege('app_3dkid', 'public."VariantFilamentAlternative"', 'UPDATE')
    OR has_column_privilege('app_3dkid', 'public."VariantFilamentGroup"', 'variantId', 'UPDATE')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class
      WHERE oid IN ('public."Filament"'::regclass, 'public."VariantFilamentGroup"'::regclass,
        'public."VariantFilamentAlternative"'::regclass)
        AND pg_has_role('app_3dkid', relowner, 'MEMBER'))
  THEN RAISE EXCEPTION 'B181_RUNTIME_PRIVILEGES'; END IF;
END $$;
ROLLBACK;
