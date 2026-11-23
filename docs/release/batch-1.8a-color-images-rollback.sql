-- REVIEW ONLY. Prefer application rollback with expanded schema retained.
-- Destructive schema contraction is permitted only before any color links exist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
  IF current_setting('batch18a.reviewed_execution', true) IS DISTINCT FROM 'color-images-reviewed' THEN
    RAISE EXCEPTION 'B18A_REVIEW_REQUIRED';
  END IF;
END $$;
LOCK TABLE public."ProductImage" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."ProductImage" WHERE "colorValueId" IS NOT NULL) THEN
    RAISE EXCEPTION 'B18A_LINKS_EXIST_USE_FORWARD_RECOVERY';
  END IF;
END $$;
DROP TRIGGER batch18a_20_image_color_guard ON public."ProductImage";
DROP TRIGGER batch18a_10_image_owner_guard ON public."ProductImage";
DROP FUNCTION public.batch18a_image_color_guard();
ALTER TABLE public."ProductImage" DROP CONSTRAINT "ProductImage_colorValueId_fkey";
DROP INDEX public."ProductImage_colorValueId_idx";
ALTER TABLE public."ProductImage" DROP COLUMN "colorValueId";
COMMIT;
