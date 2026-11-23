-- REVIEW ONLY. Read-only checks for a separately approved operator window.
-- Execute AFTER expansion; never run the expansion implicitly from this file.
BEGIN TRANSACTION READ ONLY;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ProductImage' AND column_name='colorValueId';
SELECT conname, pg_get_constraintdef(oid), condeferrable, condeferred
FROM pg_constraint WHERE conrelid='public."ProductImage"'::regclass
AND conname='ProductImage_colorValueId_fkey';
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename='ProductImage' AND indexname='ProductImage_colorValueId_idx';
SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public."ProductImage"'::regclass AND NOT tgisinternal;
-- Must return zero. Does not reject intentionally retained retired COLOR links.
SELECT count(*) AS invalid_color_links FROM public."ProductImage" i
LEFT JOIN public."ProductOptionValue" v ON v.id=i."colorValueId"
LEFT JOIN public."ProductOption" o ON o.id=v."optionId"
WHERE i."colorValueId" IS NOT NULL
AND (v.id IS NULL OR o."productId" IS DISTINCT FROM i."productId" OR o.kind IS DISTINCT FROM 'COLOR');
SELECT count(*) AS photos, count(*) FILTER (WHERE "colorValueId" IS NOT NULL) AS scoped_photos
FROM public."ProductImage";
-- Compare with BEFORE expansion: no image IDs, URLs, alts or order may change.
SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text,'[]')) AS image_content_fingerprint
FROM (SELECT id,"productId",url,alt,"order" FROM public."ProductImage") s;
-- Compare with BEFORE expansion; the existing inactive test product is read only.
SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]')) AS existing_test_product_fingerprint
FROM public."Product" p WHERE slug='test';
COMMIT;
