\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public."Filament", public."VariantFilamentGroup", public."VariantFilamentAlternative" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF current_setting('batch181.reviewed_execution', true) IS DISTINCT FROM 'filaments-reviewed'
    OR EXISTS (SELECT 1 FROM public."Filament")
    OR EXISTS (SELECT 1 FROM public."VariantFilamentGroup")
  THEN RAISE EXCEPTION 'B181_USE_FORWARD_RECOVERY'; END IF;
END $$;
DROP TABLE public."VariantFilamentAlternative", public."VariantFilamentGroup", public."Filament";
DROP FUNCTION public.batch181_lock_filament_group(), public.batch181_check_filament_group();
COMMIT;
