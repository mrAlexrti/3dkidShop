\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF current_setting('batch181.reviewed_execution', true) IS DISTINCT FROM 'filaments-reviewed'
    OR EXISTS (
      SELECT 1 FROM (VALUES
        ('public."ProductVariant"', 'batch18_child_guard'),
        ('public."ProductVariant"', 'batch18_integrity'),
        ('public."ProductImage"', 'batch18a_10_image_owner_guard'),
        ('public."ProductImage"', 'batch18a_20_image_color_guard')
      ) AS expected(relation, trigger_name)
      WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid=to_regclass(expected.relation) AND t.tgname=expected.trigger_name
          AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal))
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ProductImage' AND column_name='colorValueId')
  THEN RAISE EXCEPTION 'B181_REVIEW_OR_BASELINE_GUARD_MISSING'; END IF;
END $$;

CREATE TABLE public."Filament" (
  "id" text PRIMARY KEY,
  "manufacturer" varchar(100) NOT NULL CHECK (manufacturer = btrim(manufacturer) AND manufacturer <> ''),
  "series" varchar(100) NOT NULL CHECK (series = btrim(series) AND series <> ''),
  "material" varchar(100) NOT NULL CHECK (material = btrim(material) AND material <> ''),
  "color" varchar(100) NOT NULL CHECK (color = btrim(color) AND color <> ''),
  "hex" varchar(7) NOT NULL CHECK (hex ~ '^#[0-9A-F]{6}$'),
  "isAvailable" boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "Filament_identity_key" ON public."Filament"
  (lower(manufacturer), lower(series), lower(material), lower(color));

CREATE TABLE public."VariantFilamentGroup" (
  "id" text PRIMARY KEY,
  "variantId" text NOT NULL REFERENCES public."ProductVariant" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
  "position" integer NOT NULL CHECK (position >= 0),
  UNIQUE ("variantId", "position")
);
CREATE TABLE public."VariantFilamentAlternative" (
  "groupId" text NOT NULL REFERENCES public."VariantFilamentGroup" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
  "filamentId" text NOT NULL REFERENCES public."Filament" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY ("groupId", "filamentId")
);
CREATE INDEX "VariantFilamentAlternative_filamentId_idx" ON public."VariantFilamentAlternative" ("filamentId");

-- Advance the parent row version before removing an alternative. Concurrent
-- removals serialize at Read Committed and conflict under snapshot isolation.
-- A cascade from a group already removed by this transaction skips the update.
CREATE FUNCTION public.batch181_lock_filament_group() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public."VariantFilamentGroup" SET position=position WHERE id=OLD."groupId";
  IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER batch181_lock_filament_group
  BEFORE DELETE OR UPDATE ON public."VariantFilamentAlternative"
  FOR EACH ROW EXECUTE FUNCTION public.batch181_lock_filament_group();

CREATE FUNCTION public.batch181_check_filament_group() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE group_id text;
BEGIN
  IF TG_TABLE_NAME='VariantFilamentGroup' THEN group_id := NEW.id;
  ELSE group_id := OLD."groupId"; END IF;
  IF EXISTS (SELECT 1 FROM public."VariantFilamentGroup" WHERE id=group_id)
    AND NOT EXISTS (SELECT 1 FROM public."VariantFilamentAlternative" WHERE "groupId"=group_id)
  THEN RAISE EXCEPTION 'B181_EMPTY_FILAMENT_GROUP' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER batch181_nonempty_group AFTER INSERT ON public."VariantFilamentGroup"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch181_check_filament_group();
CREATE CONSTRAINT TRIGGER batch181_nonempty_group AFTER DELETE OR UPDATE ON public."VariantFilamentAlternative"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch181_check_filament_group();

REVOKE ALL ON FUNCTION public.batch181_lock_filament_group(), public.batch181_check_filament_group() FROM PUBLIC;
REVOKE ALL ON public."Filament", public."VariantFilamentGroup", public."VariantFilamentAlternative" FROM PUBLIC, app_3dkid;
GRANT SELECT, INSERT ON public."Filament" TO app_3dkid;
GRANT UPDATE (manufacturer, series, material, color, hex, "isAvailable") ON public."Filament" TO app_3dkid;
GRANT SELECT, INSERT, DELETE ON public."VariantFilamentGroup", public."VariantFilamentAlternative" TO app_3dkid;
-- The integrity trigger advances the group row version using this column.
GRANT UPDATE (position) ON public."VariantFilamentGroup" TO app_3dkid;
COMMIT;
