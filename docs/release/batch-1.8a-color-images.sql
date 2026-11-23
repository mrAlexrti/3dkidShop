-- REVIEW ONLY. Not approved for Production execution. No data backfill.
-- Requires deployed Batch 1.8 guards. Run only after separately approved rollout.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
  IF current_setting('batch18a.reviewed_execution', true) IS DISTINCT FROM 'color-images-reviewed'
     OR to_regprocedure('public.batch18_child_guard()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public."Product"'::regclass
                    AND tgname='batch18_product_guard' AND tgenabled='O')
     OR (SELECT count(*) FROM pg_trigger WHERE tgname='batch18_child_guard' AND tgenabled='O'
         AND tgrelid IN ('public."ProductOption"'::regclass,'public."ProductOptionValue"'::regclass)) <> 2 THEN
    RAISE EXCEPTION 'B18A_REVIEW_OR_BASELINE_GUARD_MISSING';
  END IF;
END $$;

ALTER TABLE public."ProductImage" ADD COLUMN "colorValueId" TEXT;
CREATE INDEX "ProductImage_colorValueId_idx" ON public."ProductImage"("colorValueId");
ALTER TABLE public."ProductImage" ADD CONSTRAINT "ProductImage_colorValueId_fkey"
  FOREIGN KEY ("colorValueId") REFERENCES public."ProductOptionValue"("id")
  ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- Reuse parent locking, immutable image ID/owner, and DB-managed revision bump.
-- Runs first, so color validation shares the lock used by all option/value writers.
CREATE TRIGGER batch18a_10_image_owner_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public."ProductImage" FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();

CREATE FUNCTION public.batch18a_image_color_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW."colorValueId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."ProductOptionValue" v
    JOIN public."ProductOption" o ON o."id"=v."optionId"
    WHERE v."id"=NEW."colorValueId" AND o."productId"=NEW."productId" AND o."kind"='COLOR'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18A_IMAGE_COLOR_OWNER_OR_KIND';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch18a_20_image_color_guard BEFORE INSERT OR UPDATE
  ON public."ProductImage" FOR EACH ROW EXECUTE FUNCTION public.batch18a_image_color_guard();
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
