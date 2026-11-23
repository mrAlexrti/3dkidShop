-- Synthetic pre-1.8 catalog subset for the private-cluster test runner only.
-- Deliberately contains no production data, auth, checkout or payment tables.
CREATE TABLE "Category" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "nameEn" TEXT NOT NULL,
 slug TEXT UNIQUE NOT NULL, description TEXT, "imageUrl" TEXT, "order" INT NOT NULL DEFAULT 0,
 "parentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
 CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"(id) ON DELETE SET NULL);
CREATE TABLE "Product" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "nameEn" TEXT, slug TEXT UNIQUE NOT NULL,
 description TEXT NOT NULL, "descriptionEn" TEXT, "hoverGifUrl" TEXT,
 price DECIMAL(10,2) NOT NULL, "oldPrice" DECIMAL(10,2), sku TEXT UNIQUE, stock INT NOT NULL DEFAULT 0,
 "isFeatured" BOOLEAN NOT NULL DEFAULT false, "isNew" BOOLEAN NOT NULL DEFAULT false,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "isOrderable" BOOLEAN NOT NULL DEFAULT false,
 "categoryId" TEXT NOT NULL REFERENCES "Category"(id) ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "ProductImage" (id TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
 url TEXT NOT NULL, alt TEXT, "order" INT NOT NULL DEFAULT 0);
CREATE TABLE "ProductOption" (id TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE, name TEXT NOT NULL);
CREATE TABLE "ProductOptionValue" (id TEXT PRIMARY KEY, "optionId" TEXT NOT NULL REFERENCES "ProductOption"(id) ON DELETE CASCADE,
 value TEXT NOT NULL, "valueEn" TEXT, price DECIMAL(10,2), note TEXT, "noteEn" TEXT, "priceModifier" DECIMAL(10,2) NOT NULL DEFAULT 0);
CREATE TABLE "OrderItem" (id TEXT PRIMARY KEY, "orderId" TEXT NOT NULL,
 "productId" TEXT NOT NULL REFERENCES "Product"(id), "productName" TEXT NOT NULL,
 "optionsJson" TEXT, price DECIMAL(10,2) NOT NULL, quantity INT NOT NULL);
