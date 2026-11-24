BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^batch18_review_[a-f0-9]{32}$' OR current_user <> 'batch18a_qa'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'B19_LOCAL_ONLY'; END IF;
END $$;

INSERT INTO public."Category" (id,name,"nameEn",slug) VALUES ('work_category','Workload','Workload','qa-workload');
INSERT INTO public."Product" (id,name,slug,description,price,"optionMode","categoryId","updatedAt","isOrderable")
SELECT 'work_p'||p,'Product '||p,'work-'||p,'Synthetic',25,'COLOR_SIZE','work_category',now(),true FROM generate_series(1,100) p;
INSERT INTO public."ProductOption" (id,"productId",name,kind)
SELECT 'work_p'||p||'_color','work_p'||p,'Color','COLOR'::public."ProductOptionKind" FROM generate_series(1,100) p
UNION ALL SELECT 'work_p'||p||'_size','work_p'||p,'Size','SIZE' FROM generate_series(1,100) p;
INSERT INTO public."ProductOptionValue" (id,"optionId",value,"displayPosition")
SELECT 'work_p'||p||'_c'||c,'work_p'||p||'_color','Color '||c,c FROM generate_series(1,100) p CROSS JOIN generate_series(1,2) c
UNION ALL SELECT 'work_p'||p||'_s'||s,'work_p'||p||'_size',(ARRAY['Small','Medium','Large'])[s],s FROM generate_series(1,100) p CROSS JOIN generate_series(1,3) s;
INSERT INTO public."ProductVariant" (id,"productId","combinationKey",price,"updatedAt","isAvailable")
SELECT 'work_p'||p||'_v'||c||s,'work_p'||p,'COLOR=work_p'||p||'_c'||c||';SIZE=work_p'||p||'_s'||s,
  (CASE c WHEN 1 THEN 100 ELSE 10 END) + p + s,now(),true
FROM generate_series(1,100) p CROSS JOIN generate_series(1,2) c CROSS JOIN generate_series(1,3) s;
INSERT INTO public."ProductVariantSelection" ("variantId","productId","optionId","valueId")
SELECT 'work_p'||p||'_v'||c||s,'work_p'||p,'work_p'||p||'_'||o.kind,'work_p'||p||'_'||o.value
FROM generate_series(1,100) p CROSS JOIN generate_series(1,2) c CROSS JOIN generate_series(1,3) s
CROSS JOIN LATERAL (VALUES ('color','c'||c),('size','s'||s)) o(kind,value);
INSERT INTO public."Filament" (id,manufacturer,series,material,color,hex,"isAvailable") VALUES
  ('work_a','QA','Workload','PLA','Base','#123456',true),('work_b','QA','Workload','PLA','B','#234567',false),('work_c','QA','Workload','PLA','C','#345678',false);
INSERT INTO public."VariantFilamentGroup" (id,"variantId",position)
SELECT id||'_g'||pos,id,pos FROM public."ProductVariant" CROSS JOIN generate_series(0,1) pos WHERE id LIKE 'work_p%';
INSERT INTO public."VariantFilamentAlternative" ("groupId","filamentId")
SELECT id,'work_a' FROM public."VariantFilamentGroup" WHERE id LIKE 'work_p%' AND (position=0 OR "variantId" ~ 'v1[123]$')
UNION ALL SELECT id,f FROM public."VariantFilamentGroup" CROSS JOIN (VALUES ('work_b'),('work_c')) a(f)
WHERE id LIKE 'work_p%' AND position=1 AND "variantId" ~ 'v2[123]$';

INSERT INTO public."User" (id,email,role,"emailVerified")
SELECT 'work_u'||u,'work-'||u||'@example.test','CUSTOMER',now() FROM generate_series(1,20) u;
INSERT INTO public."CustomerFavorite" ("userId","productId")
SELECT 'work_u'||u,'work_p'||(u+f) FROM generate_series(1,20) u CROSS JOIN generate_series(1,8) f;
INSERT INTO public."Order" (id,number,"checkoutAcceptance","acceptedAt","createdAt","customerId","customerName","customerPhone","shippingAddress",city,"postalCode","paymentMethod",subtotal,total)
SELECT 'work_o'||o, (2000+o)::text,'ACCEPTED',now(),now()-((o-1)/7)*interval '1 day','work_u'||((o-1)%20+1),
  'Synthetic recipient','0500000000','Synthetic','Kyiv','','COD',111,111 FROM generate_series(1,49) o;
COMMIT;
ANALYZE;
