import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const img = (seed: string) =>
  `https://images.unsplash.com/${seed}?auto=format&fit=crop&w=1200&q=80`;

async function main() {
  // --- Admin user for local DB tools (optional, auth uses env credentials) ---
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (adminUsername?.includes("@") && adminPasswordHash) {
    await prisma.user.upsert({
      where: { email: adminUsername },
      update: { passwordHash: adminPasswordHash, role: "ADMIN" },
      create: {
        email: adminUsername,
        name: "Admin",
        role: "ADMIN",
        passwordHash: adminPasswordHash,
      },
    });
  }

  // --- Категории ---
  const categoriesData = [
    { name: "Стикеры", slug: "stickers", description: "Виниловые и бумажные стикеры", imageUrl: img("photo-1531403009284-440f080d1e12") },
    { name: "Постеры", slug: "posters", description: "Художественные постеры для интерьера", imageUrl: img("photo-1513519245088-0e12902e5a38") },
    { name: "Открытки", slug: "cards", description: "Открытки на любой повод", imageUrl: img("photo-1518998053901-5348d3961a04") },
    { name: "Мерч", slug: "merch", description: "Сумки, значки, кружки", imageUrl: img("photo-1503342217505-b0a15ec3261c") },
  ];

  const categories = [];
  for (const c of categoriesData) {
    categories.push(
      await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c })
    );
  }

  // --- Товары ---
  const productSeed = [
    { name: "Набор стикеров «Котики»", price: 249, cat: "stickers", featured: true, isNew: false, img: "photo-1517960413843-0aee8e2b3285" },
    { name: "Стикер «Растение монстера»", price: 133, cat: "stickers", featured: true, isNew: true, img: "photo-1485955900006-10f4d324d411" },
    { name: "Постер «Минимализм #1»", price: 349, cat: "posters", featured: true, isNew: false, img: "photo-1547826039-bfc35e0f1ea8" },
    { name: "Постер «Город ночью»", price: 449, cat: "posters", featured: false, isNew: true, img: "photo-1480714378408-67cf0d13bc1b" },
    { name: "Открытка «С днём рождения»", price: 119, cat: "cards", featured: false, isNew: true, img: "photo-1513201099705-a9746e1e201f" },
    { name: "Открытка «Спасибо»", price: 99, cat: "cards", featured: false, isNew: false, img: "photo-1521017432531-fbd92d768814" },
    { name: "Холщовая сумка с принтом", price: 499, cat: "merch", featured: true, isNew: false, img: "photo-1591561954557-26941169b49e" },
    { name: "Набор значков «Эмоции»", price: 299, cat: "merch", featured: false, isNew: true, img: "photo-1611930022073-b7a4ba5fcccd" },
    { name: "Стикер «Облако радуга»", price: 129, cat: "stickers", featured: false, isNew: true, img: "photo-1499781350541-7783f6c6a0c8" },
    { name: "Постер «Ботаника»", price: 399, cat: "posters", featured: false, isNew: false, img: "photo-1462275646964-a0e3386b89fa" },
    { name: "Кружка «Доброе утро»", price: 349, cat: "merch", featured: true, isNew: false, img: "photo-1495474472287-4d71bcdd2085" },
    { name: "Набор стикеров «Еда»", price: 219, cat: "stickers", featured: false, isNew: false, img: "photo-1606107557195-0e29a4b5b4aa" },
  ];

  for (const p of productSeed) {
    const slug = p.name.toLowerCase().replace(/[«»]/g, "").replace(/[^a-zа-я0-9]+/gi, "-");
    const category = categories.find((c) => c.slug === p.cat)!;
    const product = await prisma.product.upsert({
      where: { slug },
      update: { price: p.price },
      create: {
        name: p.name,
        slug,
        description:
          "Качественный товар из плотного материала, устойчив к выцветанию и влаге. Идеально подходит для оформления ноутбука, бутылки или интерьера.",
        price: p.price,
        stock: 50,
        isFeatured: p.featured,
        isNew: p.isNew,
        categoryId: category.id,
        images: { create: [{ url: img(p.img), alt: p.name, order: 0 }] },
        options: {
          create: [
            {
              name: "Размер",
              values: { create: [{ value: "Маленький" }, { value: "Средний", priceModifier: 50 }, { value: "Большой", priceModifier: 100 }] },
            },
          ],
        },
        attributes: {
          create: [
            { key: "Материал", value: "Винил / плотная бумага" },
            { key: "Влагостойкость", value: "Да" },
          ],
        },
      },
    });
    await prisma.productOptionValue.updateMany({
      where: { option: { productId: product.id }, priceModifier: 1.5 },
      data: { priceModifier: 50 },
    });
    await prisma.productOptionValue.updateMany({
      where: { option: { productId: product.id }, priceModifier: 3 },
      data: { priceModifier: 100 },
    });
    void product;
  }

  // --- Отзывы ---
  const reviewsData = [
    { author: "Анна К.", rating: 5, text: "Очень качественные стикеры, держатся отлично, цвета яркие!" },
    { author: "Игорь П.", rating: 5, text: "Заказывал постеры — пришли быстро, упаковка супер." },
    { author: "Мария С.", rating: 4, text: "Красивый дизайн, но хотелось бы больше размеров." },
  ];
  for (const r of reviewsData) {
    await prisma.review.create({ data: r });
  }

  // --- Контент сайта ---
  await prisma.siteContent.upsert({
    where: { key: "hero_title" },
    update: {},
    create: { key: "hero_title", value: "Наклей немного радости" },
  });
  await prisma.siteContent.upsert({
    where: { key: "hero_subtitle" },
    update: {},
    create: { key: "hero_subtitle", value: "Стикеры, постеры и мерч, которые поднимают настроение" },
  });

  console.log("Seed завершён ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
