-- Synthetic records for the Batch 1.9 privately initialized cluster.
DO $$ BEGIN
  IF current_database() !~ '^batch18_review_[a-f0-9]{32}$' OR current_user <> 'batch18a_qa'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'B19_LOCAL_ONLY'; END IF;
END $$;

INSERT INTO public."Category" (id,name,"nameEn",slug) VALUES ('qa_category','Тест','Test','qa') ON CONFLICT (id) DO NOTHING;
INSERT INTO public."Product" (id,name,"nameEn",slug,description,price,"categoryId","updatedAt","isOrderable")
VALUES ('qa_product','Кіт','Cat','qa-cat','Synthetic',100,'qa_category',now(),true);
INSERT INTO public."ProductImage" (id,"productId",url) VALUES ('qa_photo','qa_product','/images/placeholder.svg');
INSERT INTO public."Order" (id,number,"checkoutAcceptance","acceptedAt","customerName","customerEmail","customerPhone","shippingAddress",city,"postalCode","paymentMethod",subtotal,total)
VALUES ('claim_order','101','ACCEPTED',now(),'Historic recipient','qa.customer@gmail.com','0501234567','Recorded address','Kyiv','123','COD',37,37),
       ('phone_order','102','ACCEPTED',now(),'Another recipient',NULL,'0501234567','Recorded address','Kyiv','123','Накладений платіж',38,38);
UPDATE public."Order" SET "novaPoshtaCity"='Kyiv' WHERE id='claim_order';
INSERT INTO public."OrderItem" (id,"orderId","productId","productName","optionsJson",price,quantity)
VALUES ('historic_item','claim_order','qa_product','Historical name','{"Size":"Historical medium"}',37,1);

INSERT INTO public."Product" (id,name,"nameEn",slug,description,price,"categoryId","updatedAt","isActive","isOrderable")
VALUES ('qa_native','Кольори','Colors','qa-colors','Synthetic',100,'qa_category',now(),true,true);
BEGIN;
UPDATE public."Product" SET "optionMode"='COLOR_SIZE' WHERE id='qa_native';
INSERT INTO public."ProductOption" (id,"productId",name,kind) VALUES ('qa_color','qa_native','Колір','COLOR'),('qa_size','qa_native','Розмір','SIZE');
INSERT INTO public."ProductOptionValue" (id,"optionId",value,"valueEn") VALUES
  ('pink','qa_color','Рожевий','Pink'),('blue','qa_color','Блакитний','Light blue'),
  ('large','qa_size','Великий','Large'),('small','qa_size','Малий','Small'),('medium','qa_size','Середній','Medium'),('custom','qa_size','Міні 3 см','Mini 3 cm');
WITH v(id,c,s,available) AS (VALUES ('v1','pink','small',true),('v2','pink','medium',true),('v3','blue','large',false),('v4','blue','custom',true))
INSERT INTO public."ProductVariant" (id,"productId","combinationKey",price,"isAvailable","updatedAt")
SELECT id,'qa_native','COLOR='||c||';SIZE='||s,200,available,now() FROM v;
WITH v(id,c,s) AS (VALUES ('v1','pink','small'),('v2','pink','medium'),('v3','blue','large'),('v4','blue','custom'))
INSERT INTO public."ProductVariantSelection" ("variantId","productId","optionId","valueId")
SELECT id,'qa_native','qa_color',c FROM v UNION ALL SELECT id,'qa_native','qa_size',s FROM v;
INSERT INTO public."Filament" (id,manufacturer,series,material,color,hex,"isAvailable")
VALUES ('f1','QA','QA','PLA','Pink','#FF0000',true),('f2','QA','QA','PLA','Blue','#0000FF',false);
INSERT INTO public."VariantFilamentGroup" (id,"variantId",position) VALUES ('g1','v1',0),('g2','v1',1),('g3','v3',0),('g4','v4',0);
INSERT INTO public."VariantFilamentAlternative" ("groupId","filamentId")
VALUES ('g1','f1'),('g1','f2'),('g2','f1'),('g3','f1'),('g4','f2');
COMMIT;
