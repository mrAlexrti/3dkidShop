-- Synthetic, non-customer fixtures. Used ONLY by the private-cluster runner.
INSERT INTO "Category" (id,name,"nameEn",slug) VALUES ('qa-category','QA','QA','qa-category');
INSERT INTO "Product" (id,name,slug,description,price,"categoryId","updatedAt")
VALUES ('qa-product','QA','qa-product','QA',199,'qa-category',CURRENT_TIMESTAMP);
INSERT INTO "Order" (id,number,"customerName","customerEmail","customerPhone","shippingAddress",city,"postalCode","paymentMethod","subtotal",total,"paymentProvider","paymentInvoiceId","paymentStatus","paidAt",status)
VALUES ('qa-history-numeric','0007','Synthetic QA','qa@example.invalid','000','QA','QA','000','card_online',199,199,'mono','qa-historic-invoice','PAID',CURRENT_TIMESTAMP,'COMPLETED'),
('qa-history-legacy','3DK-QA-OLD','Synthetic QA','qa@example.invalid','000','QA','QA','000','cod',199,199,NULL,NULL,NULL,NULL,'PENDING');
INSERT INTO "OrderItem" (id,"orderId","productId","productName",price,quantity)
VALUES ('qa-history-item','qa-history-numeric','qa-product','QA',199,1);
