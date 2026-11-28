-- Caller must verify the fixed endpoint, database/role and OPS-02 marker.
BEGIN;
SELECT pg_advisory_xact_lock(731502);
INSERT INTO public."Category" (id,name,"nameEn",slug,"order") VALUES
  ('ops02_catalog','Навчальний каталог','Synthetic catalog','dev-catalog',0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public."Category" (id,name,"nameEn",slug,"parentId","order") VALUES
  ('ops02_toys','Іграшки DEV','DEV Toys','dev-toys','ops02_catalog',1),
  ('ops02_accessories','Аксесуари DEV','DEV Accessories','dev-accessories','ops02_catalog',2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Product" (id,name,"nameEn",slug,description,"descriptionEn",price,"categoryId",
  "updatedAt","isOrderable","isFeatured","isActive","optionMode")
SELECT 'ops02_p_'||n,'Виріб DEV '||n,'DEV Product '||n,'dev-product-'||n,
  'Синтетичний виріб для перевірки каталогу.','Synthetic product for catalog checks.',
  100+n%100,CASE WHEN n%2=0 THEN 'ops02_toys' ELSE 'ops02_accessories' END,
  TIMESTAMP '2026-01-01',n%9<>0,n<=8,n%20<>0,
  (ARRAY['COLOR_SIZE','SIMPLE','COLOR','SIZE']::public."ProductOptionMode"[])[n%4+1]
FROM generate_series(1,__PRODUCT_COUNT__) AS n ON CONFLICT (id) DO NOTHING;

INSERT INTO public."ProductImage"(id,"productId",url,alt)
SELECT id||'_image',id,'/hero/bunny-v1.webp','Synthetic fixture illustration'
FROM public."Product" WHERE id ~ '^ops02_p_[0-9]+$' ON CONFLICT (id) DO NOTHING;

INSERT INTO public."ProductOption"(id,"productId",name,kind)
SELECT p.id||'_'||k.kind,p.id,k.name,k.kind::public."ProductOptionKind"
FROM public."Product" p
CROSS JOIN (VALUES('COLOR','Колір'),('SIZE','Розмір')) k(kind,name)
WHERE p.id ~ '^ops02_p_[0-9]+$' AND (p."optionMode"::text=k.kind OR p."optionMode"='COLOR_SIZE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."ProductOptionValue"(id,"optionId",value,"valueEn","displayPosition")
SELECT o.id||n,o.id,
  (CASE o.kind WHEN 'COLOR' THEN ARRAY['Рожевий','Блакитний'] ELSE ARRAY['Малий','Великий'] END)[n],
  (CASE o.kind WHEN 'COLOR' THEN ARRAY['Pink','Blue'] ELSE ARRAY['Small','Large'] END)[n],n
FROM public."ProductOption" o CROSS JOIN generate_series(1,2) AS n
WHERE o."productId" ~ '^ops02_p_[0-9]+$' ON CONFLICT (id) DO NOTHING;

WITH member AS (
  SELECT p.id,p.price,n,
    CASE WHEN p."optionMode" IN ('COLOR','COLOR_SIZE') THEN 'COLOR='||p.id||'_COLOR'||n END AS color,
    CASE WHEN p."optionMode" IN ('SIZE','COLOR_SIZE') THEN 'SIZE='||p.id||'_SIZE'||n END AS size
  FROM public."Product" p CROSS JOIN generate_series(1,2) AS n
  WHERE p.id ~ '^ops02_p_[0-9]+$' AND p."optionMode"<>'SIMPLE'
)
INSERT INTO public."ProductVariant"(id,"productId","combinationKey",price,"isAvailable","updatedAt")
SELECT id||'_v'||n,id,concat_ws(';',color,size),price + 25*n,n=1,TIMESTAMP '2026-01-01'
FROM member ON CONFLICT (id) DO NOTHING;

INSERT INTO public."ProductVariantSelection"("variantId","productId","optionId","valueId")
SELECT v.id,v."productId",o.id,o.id||right(v.id,1)
FROM public."ProductVariant" v JOIN public."ProductOption" o ON o."productId"=v."productId"
WHERE v."productId" ~ '^ops02_p_[0-9]+$' ON CONFLICT ("variantId","optionId") DO NOTHING;

INSERT INTO public."Filament"(id,manufacturer,series,material,color,hex,"isAvailable") VALUES
 ('ops02_pla_available','DEV','Synthetic','PLA','Pink','#FA6090',true),
 ('ops02_pla_unavailable','DEV','Synthetic','PLA','Blue','#99BBDD',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."VariantFilamentGroup"(id,"variantId",position)
SELECT id||'_f1',id,1 FROM public."ProductVariant" WHERE "productId" IN ('ops02_p_2','ops02_p_3','ops02_p_4')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public."VariantFilamentAlternative"("groupId","filamentId")
SELECT id,CASE WHEN "variantId" LIKE '%_v1' THEN 'ops02_pla_available' ELSE 'ops02_pla_unavailable' END
FROM public."VariantFilamentGroup" WHERE "variantId" ~ '^ops02_p_'
ON CONFLICT ("groupId","filamentId") DO NOTHING;

INSERT INTO public."User"(id,email,"passwordHash",role,"emailVerified","firstName","lastName") VALUES
 ('ops02_customer','customer-a@example.test','__CUSTOMER_PASSWORD_HASH__','CUSTOMER',TIMESTAMP '2026-01-01','DEV','Customer A'),
 ('ops02_customer_b','customer-b@example.test','__CUSTOMER_PASSWORD_HASH__','CUSTOMER',TIMESTAMP '2026-01-01','DEV','Customer B'),
 ('ops02_admin','admin@example.test',NULL,'ADMIN',TIMESTAMP '2026-01-01','DEV','Administrator')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."CustomerFavorite"("userId","productId") VALUES ('ops02_customer','ops02_p_1'),('ops02_customer_b','ops02_p_2')
ON CONFLICT ("userId","productId") DO NOTHING;
INSERT INTO public."CustomerCart" AS cart("userId",lines) VALUES
 ('ops02_customer',jsonb_build_array(jsonb_build_object('productId','ops02_p_1','quantity',1,
   'generation','00000000-0000-4000-8000-000000000031','removed',0))),
 ('ops02_customer_b',jsonb_build_array(jsonb_build_object('productId','ops02_p_2','quantity',1,
   'generation','00000000-0000-4000-8000-000000000032','removed',0,
   'selection',jsonb_build_object('version',2,'variantId','ops02_p_2_v1','values',jsonb_build_object('COLOR','ops02_p_2_COLOR1')))))
ON CONFLICT ("userId") DO UPDATE SET lines=EXCLUDED.lines
WHERE cart."userId"='ops02_customer_b' AND cart.revision=0 AND cart.lines='[]'::jsonb;

INSERT INTO public."Order"(id,number,"checkoutAcceptance","acceptedAt","customerId","customerName","customerEmail",
  "customerPhone","shippingAddress",city,"postalCode","deliveryMethod","paymentMethod","paymentStatus",subtotal,total,status)
VALUES
 ('ops02_guest_order','790001','ACCEPTED',TIMESTAMP '2026-01-01',NULL,'DEV Guest','customer-b@example.test',
  '0500000000','Synthetic depot','DEV Kyiv','00000','branch','COD','PENDING',101,101,'PROCESSING'),
 ('ops02_paid_order','790002','ACCEPTED',TIMESTAMP '2026-01-01','ops02_customer','DEV Customer A','customer-a@example.test',
  '0500000000','Synthetic depot','DEV Kyiv','00000','branch','MONO','PAID',101,101,'PAID'),
 ('ops02_failed_order','790003','ACCEPTED',TIMESTAMP '2026-01-01','ops02_customer_b','DEV Customer B',NULL,
  '0500000000','Synthetic depot','DEV Kyiv','00000','branch','MONO','FAILED',101,101,'CANCELLED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."OrderItem"(id,"orderId","productId","productName","productImageUrl",price,quantity)
SELECT id||'_line',id,'ops02_p_1','DEV Product 1','/hero/bunny-v1.webp',101,1
FROM public."Order" WHERE id IN ('ops02_guest_order','ops02_paid_order','ops02_failed_order')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."CustomerChallenge"("tokenHash",purpose,email,"userId","orderId",expires)
SELECT encode(sha256(convert_to('ops02_dev_guest_claim_fixture_0123456789012','UTF8')),'hex'),'claim',
 'customer-b@example.test','ops02_customer_b','ops02_guest_order',(clock_timestamp() AT TIME ZONE 'UTC')+interval '1 day'
FROM public."Order" WHERE id='ops02_guest_order' AND "customerId" IS NULL
ON CONFLICT ("tokenHash") DO UPDATE SET expires=EXCLUDED.expires;

COMMIT;
SELECT 'Synthetic products='||count(*) FROM public."Product" WHERE id ~ '^ops02_p_[0-9]+$';
