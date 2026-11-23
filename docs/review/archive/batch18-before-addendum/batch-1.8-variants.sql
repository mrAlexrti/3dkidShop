-- NOT APPROVED FOR PRODUCTION EXECUTION.
-- Review-only additive DDL. Local disposable synthetic fixtures ONLY.
-- DO NOT remove the disposable-local guard without a new reviewed execution artifact.
-- Never use an existing DATABASE_URL. BEGIN/COMMIT include all DDL and safeguards.
-- REQUIRED in every future application write transaction: final SQL command
-- SET CONSTRAINTS ALL IMMEDIATE, before returning from the Prisma callback.
-- Prisma 5.22 locally resolved a deferred-COMMIT rollback without throwing.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF current_database() !~ '^batch18_review_[a-f0-9]+$'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_setting('batch18.disposable_review', true) IS DISTINCT FROM 'synthetic-fixtures-only'
  THEN RAISE EXCEPTION 'NOT APPROVED FOR PRODUCTION EXECUTION: disposable local fixture guard failed';
  END IF;
END $$;
-- CreateEnum
CREATE TYPE public."ProductOptionMode" AS ENUM ('LEGACY', 'SIMPLE', 'SIZE', 'COLOR', 'COLOR_SIZE');

-- CreateEnum
CREATE TYPE public."ProductOptionKind" AS ENUM ('COLOR', 'SIZE');

-- AlterTable
ALTER TABLE public."Product" ADD COLUMN     "optionMode" public."ProductOptionMode" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "variantRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE public."ProductOption" ADD COLUMN     "kind" public."ProductOptionKind";

-- AlterTable
ALTER TABLE public."ProductOptionValue" ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE public."OrderItem" ADD COLUMN     "productVariantId" TEXT;

-- CreateTable
CREATE TABLE public."ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "combinationKey" VARCHAR(300) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE public."ProductVariantSelection" (
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantSelection_pkey" PRIMARY KEY ("variantId","optionId")
);

-- CreateIndex
CREATE INDEX "ProductVariant_productId_retiredAt_isAvailable_idx" ON public."ProductVariant"("productId", "retiredAt", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_id_key" ON public."ProductVariant"("productId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_combinationKey_key" ON public."ProductVariant"("productId", "combinationKey");

-- CreateIndex
CREATE INDEX "ProductVariantSelection_optionId_valueId_idx" ON public."ProductVariantSelection"("optionId", "valueId");

-- CreateIndex
CREATE INDEX "ProductVariantSelection_productId_variantId_idx" ON public."ProductVariantSelection"("productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_id_key" ON public."ProductOption"("productId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_kind_key" ON public."ProductOption"("productId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_optionId_id_key" ON public."ProductOptionValue"("optionId", "id");

-- CreateIndex
CREATE INDEX "OrderItem_productId_productVariantId_idx" ON public."OrderItem"("productId", "productVariantId");

-- AddForeignKey
ALTER TABLE public."OrderItem" ADD CONSTRAINT "OrderItem_productId_productVariantId_fkey" FOREIGN KEY ("productId", "productVariantId") REFERENCES public."ProductVariant"("productId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE public."ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE public."ProductVariantSelection" ADD CONSTRAINT "ProductVariantSelection_productId_variantId_fkey" FOREIGN KEY ("productId", "variantId") REFERENCES public."ProductVariant"("productId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE public."ProductVariantSelection" ADD CONSTRAINT "ProductVariantSelection_productId_optionId_fkey" FOREIGN KEY ("productId", "optionId") REFERENCES public."ProductOption"("productId", "id") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE public."ProductVariantSelection" ADD CONSTRAINT "ProductVariantSelection_optionId_valueId_fkey" FOREIGN KEY ("optionId", "valueId") REFERENCES public."ProductOptionValue"("optionId", "id") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- End of Prisma 5.22 generated additive DDL. Required SQL-only invariants follow.
ALTER TABLE public."ProductVariantSelection" ALTER CONSTRAINT "ProductVariantSelection_productId_optionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."ProductVariantSelection" ALTER CONSTRAINT "ProductVariantSelection_optionId_valueId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."ProductVariant" ADD CONSTRAINT "ProductVariant_price_bounds" CHECK ("price" > 0 AND "price" <= 99999999.99);
ALTER TABLE public."ProductVariant" ADD CONSTRAINT "ProductVariant_id_format" CHECK ("id" ~ '^[A-Za-z0-9_]{1,128}$');
ALTER TABLE public."Product" ADD CONSTRAINT "Product_variantRevision_nonnegative" CHECK ("variantRevision" >= 0);

-- All functions are invoker-rights; application roles must not own/disable guards.
-- Revision is a DB-maintained epoch, NOT exactly one increment per transaction.
CREATE FUNCTION public.batch18_product_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_PRODUCT_ID';
  END IF;
  IF OLD."optionMode" <> 'LEGACY' AND NEW."optionMode" = 'LEGACY' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_NO_LEGACY_DOWNGRADE';
  END IF;
  IF NEW."variantRevision" IS DISTINCT FROM OLD."variantRevision" THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_REVISION_DB_MANAGED';
  END IF;
  IF OLD."variantRevision" = 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE='22003', MESSAGE='B18_REVISION_EXHAUSTED';
  END IF;
  NEW."variantRevision" := OLD."variantRevision" + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER batch18_product_guard BEFORE UPDATE ON public."Product"
FOR EACH ROW EXECUTE FUNCTION public.batch18_product_guard();

-- BEFORE-row backstop. Application writers MUST prelock parent(s) before children
-- and take the existing media lock before Product locks. Rogue child-first writes
-- can deadlock and roll back; the guard does not promise deadlock-free arbitrary SQL.
CREATE FUNCTION public.batch18_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  prior jsonb; next_row jsonb; row_data jsonb; parent_id text; found_parent boolean;
  group_id text; typed_kind public."ProductOptionKind";
BEGIN
  IF TG_OP <> 'INSERT' THEN prior := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN next_row := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'ProductVariantSelection' AND next_row IS DISTINCT FROM prior THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_SELECTION';
    END IF;
    IF TG_TABLE_NAME <> 'ProductVariantSelection' AND
       (next_row->>'id' IS DISTINCT FROM prior->>'id') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_ID';
    END IF;
    IF TG_TABLE_NAME = 'ProductOptionValue' THEN
      IF next_row->>'optionId' IS DISTINCT FROM prior->>'optionId' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_VALUE_OWNER';
      END IF;
    ELSIF next_row->>'productId' IS DISTINCT FROM prior->>'productId' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_PRODUCT_OWNER';
    END IF;
    IF TG_TABLE_NAME = 'ProductOption' AND prior->>'kind' IS NOT NULL
       AND next_row->>'kind' IS DISTINCT FROM prior->>'kind' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_KIND';
    END IF;
    IF TG_TABLE_NAME = 'ProductVariant' AND
       next_row->>'combinationKey' IS DISTINCT FROM prior->>'combinationKey' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_TUPLE';
    END IF;
  END IF;
  row_data := COALESCE(next_row, prior);
  IF TG_TABLE_NAME = 'ProductOptionValue' THEN
    group_id := row_data->>'optionId';
    SELECT o."productId", o."kind" INTO parent_id, typed_kind
      FROM public."ProductOption" o WHERE o."id" = group_id;
  ELSE
    parent_id := row_data->>'productId';
    IF TG_TABLE_NAME = 'ProductOption' THEN typed_kind := (row_data->>'kind')::public."ProductOptionKind"; END IF;
  END IF;
  PERFORM p."id" FROM public."Product" p WHERE p."id"=parent_id FOR UPDATE;
  found_parent := FOUND;
  IF NOT found_parent THEN
    -- A whole-product cascade may already have removed its group/parent.
    -- A live orphan INSERT/UPDATE remains rejected by these guards / ownership FKs.
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='B18_MISSING_PARENT';
  END IF;
  IF TG_OP = 'DELETE' AND (TG_TABLE_NAME IN ('ProductVariant','ProductVariantSelection')
       OR typed_kind IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_RETIRE_INSTEAD_OF_DELETE';
  END IF;
  IF TG_TABLE_NAME='ProductOptionValue' AND typed_kind IS NOT NULL
     AND (row_data->>'id') !~ '^[A-Za-z0-9_]{1,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_VALUE_ID';
  END IF;
  -- A no-op assignment goes through the Product trigger and advances its epoch.
  UPDATE public."Product" SET "variantRevision"="variantRevision" WHERE "id"=parent_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER batch18_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ProductOption"
FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();
CREATE TRIGGER batch18_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ProductOptionValue"
FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();
CREATE TRIGGER batch18_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ProductVariant"
FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();
CREATE TRIGGER batch18_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public."ProductVariantSelection"
FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();

CREATE FUNCTION public.batch18_validate_product(parent_id text, only_variant_id text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  mode public."ProductOptionMode"; v record; n integer; color_count integer;
  size_count integer; untyped_count integer; retired_count integer; expected_key text;
BEGIN
  SELECT p."optionMode" INTO mode FROM public."Product" p WHERE p."id"=parent_id;
  IF NOT FOUND THEN RETURN; END IF; -- completed product cascade
  IF mode='LEGACY' AND EXISTS (SELECT 1 FROM public."ProductOption" o
                              WHERE o."productId"=parent_id AND o."kind" IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_LEGACY_TYPED_GROUP';
  END IF;
  -- Typing an old group does not fire a trigger on its pre-existing values.
  -- Validate those too, including currently unused values, at the conversion gate.
  IF EXISTS (SELECT 1 FROM public."ProductOption" o
             JOIN public."ProductOptionValue" x ON x."optionId"=o."id"
             WHERE o."productId"=parent_id AND o."kind" IS NOT NULL
               AND (x."id" !~ '^[A-Za-z0-9_]{1,128}$' OR length(btrim(x."value")) NOT BETWEEN 1 AND 100
                    OR length(x."valueEn")>100 OR length(x."note")>500 OR length(x."noteEn")>500)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_TYPED_VALUE';
  END IF;
  FOR v IN SELECT * FROM public."ProductVariant" WHERE "productId"=parent_id
           AND (only_variant_id IS NULL OR "id"=only_variant_id) LOOP
    SELECT count(*), count(*) FILTER (WHERE o."kind"='COLOR'),
           count(*) FILTER (WHERE o."kind"='SIZE'), count(*) FILTER (WHERE o."kind" IS NULL),
           count(*) FILTER (WHERE x."retiredAt" IS NOT NULL),
           string_agg(o."kind"::text || '=' || s."valueId", ';' ORDER BY o."kind"::text COLLATE "C")
      INTO n,color_count,size_count,untyped_count,retired_count,expected_key
      FROM public."ProductVariantSelection" s
      JOIN public."ProductOption" o ON o."id"=s."optionId" AND o."productId"=s."productId"
      JOIN public."ProductOptionValue" x ON x."id"=s."valueId" AND x."optionId"=s."optionId"
      WHERE s."variantId"=v."id" AND s."productId"=parent_id;
    IF n NOT BETWEEN 1 AND 2 OR untyped_count<>0 OR color_count>1 OR size_count>1
       OR expected_key IS DISTINCT FROM v."combinationKey" THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_COMBINATION';
    END IF;
    IF v."retiredAt" IS NULL AND (retired_count<>0 OR
      NOT ((mode='SIZE' AND size_count=1 AND color_count=0)
        OR (mode='COLOR' AND color_count=1 AND size_count=0)
        OR (mode='COLOR_SIZE' AND color_count=1 AND size_count=1))) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_MODE_OR_RETIREMENT_MISMATCH';
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.batch18_deferred_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE data jsonb; parent_id text; variant_id text;
BEGIN
  IF TG_OP='DELETE' THEN data:=to_jsonb(OLD); ELSE data:=to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME='Product' THEN parent_id:=data->>'id';
  ELSIF TG_TABLE_NAME='ProductOptionValue' THEN
    SELECT "productId" INTO parent_id FROM public."ProductOption" WHERE "id"=data->>'optionId';
  ELSE parent_id:=data->>'productId'; END IF;
  IF TG_TABLE_NAME='ProductVariant' THEN variant_id:=data->>'id';
  ELSIF TG_TABLE_NAME='ProductVariantSelection' THEN variant_id:=data->>'variantId'; END IF;
  PERFORM public.batch18_validate_product(parent_id,variant_id);
  RETURN NULL;
END $$;
-- A revision-only parent touch must not queue a full-product scan for every child.
-- Group/value changes validate the product; tuple changes validate their variant.
CREATE CONSTRAINT TRIGGER batch18_integrity AFTER UPDATE OF "optionMode" ON public."Product"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();
CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR UPDATE OR DELETE ON public."ProductOption"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();
CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR UPDATE OR DELETE ON public."ProductOptionValue"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();
CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR UPDATE OR DELETE ON public."ProductVariant"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();
CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR UPDATE OR DELETE ON public."ProductVariantSelection"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();

-- Additional correction: old binaries cannot insert a native option order at
-- Product.price without a variant FK. Existing legacy attempts are NOT repriced.
CREATE FUNCTION public.batch18_order_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE p public."Product"; v public."ProductVariant"; snap jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (OLD."productVariantId" IS NOT NULL OR NEW."productVariantId" IS NOT NULL) AND
       ROW(NEW."id",NEW."orderId",NEW."productId",NEW."productVariantId",NEW."productName",NEW."optionsJson",NEW."price",NEW."quantity")
       IS DISTINCT FROM
       ROW(OLD."id",OLD."orderId",OLD."productId",OLD."productVariantId",OLD."productName",OLD."optionsJson",OLD."price",OLD."quantity") THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_ORDER_SNAPSHOT';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO p FROM public."Product" WHERE "id"=NEW."productId" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='B18_ORDER_PRODUCT_MISSING'; END IF;
  IF p."optionMode" IN ('LEGACY','SIMPLE') THEN
    IF NEW."productVariantId" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_UNEXPECTED_VARIANT';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v FROM public."ProductVariant" WHERE "id"=NEW."productVariantId" AND "productId"=NEW."productId";
  IF NOT FOUND OR NOT p."isActive" OR NOT p."isOrderable" OR NOT v."isAvailable"
     OR v."retiredAt" IS NOT NULL OR NEW."price"<>v."price" OR NEW."quantity"<1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE';
  END IF;
  PERFORM public.batch18_validate_product(p."id",v."id");
  BEGIN snap:=NEW."optionsJson"::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_ORDER_SNAPSHOT';
  END;
  IF snap->'version' IS DISTINCT FROM '2'::jsonb OR snap->>'variantId' IS DISTINCT FROM v."id"
     OR jsonb_typeof(snap->'dimensions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_ORDER_SNAPSHOT';
  END IF;
  IF (SELECT jsonb_agg(jsonb_build_object('kind',o."kind",'optionId',s."optionId",'valueId',s."valueId",
             'labelUa',x."value",'labelEn',x."valueEn",'noteUa',x."note",'noteEn',x."noteEn") ORDER BY o."kind"::text COLLATE "C")
      FROM public."ProductVariantSelection" s JOIN public."ProductOption" o ON o."id"=s."optionId"
      JOIN public."ProductOptionValue" x ON x."id"=s."valueId" AND x."optionId"=s."optionId"
      WHERE s."variantId"=v."id") IS DISTINCT FROM
     (SELECT jsonb_agg(jsonb_build_object('kind',d->>'kind','optionId',d->>'optionId','valueId',d->>'valueId',
             'labelUa',d->>'labelUa','labelEn',d->>'labelEn','noteUa',d->>'noteUa','noteEn',d->>'noteEn') ORDER BY d->>'kind' COLLATE "C")
      FROM jsonb_array_elements(snap->'dimensions') d) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_SNAPSHOT_SELECTION_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch18_order_snapshot_guard BEFORE INSERT OR UPDATE ON public."OrderItem"
FOR EACH ROW EXECUTE FUNCTION public.batch18_order_snapshot_guard();

-- No product conversion or order backfill. Verify in a fresh baseline fixture.
COMMIT;
