import { PrismaClient } from "@prisma/client";
import { CHILD_CATEGORIES, ROOT_CATEGORIES } from "./category-data";

const prisma = new PrismaClient();

async function main() {
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

  const idBySlug = new Map<string, string>();
  for (const category of ROOT_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...category, parentId: null },
      update: {
        name: category.name,
        nameEn: category.nameEn,
        order: category.order,
        parentId: null,
      },
    });
    idBySlug.set(category.slug, row.id);
  }

  for (const category of CHILD_CATEGORIES) {
    const parentId = idBySlug.get(category.parentSlug);
    if (!parentId) throw new Error(`Seed parent not found: ${category.parentSlug}`);
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        name: category.name,
        nameEn: category.nameEn,
        slug: category.slug,
        order: category.order,
        parentId,
      },
      update: { name: category.name, nameEn: category.nameEn, order: category.order, parentId },
    });
  }

  await prisma.siteContent.upsert({
    where: { key: "hero_title" },
    update: {},
    create: { key: "hero_title", value: "Творимо у 3D разом" },
  });
  await prisma.siteContent.upsert({
    where: { key: "hero_subtitle" },
    update: {},
    create: { key: "hero_subtitle", value: "Яскраві 3D товари та навчання для творчих ідей" },
  });
  await prisma.siteContent.upsert({
    where: { key: "site_font" },
    update: { value: "fredoka-nunito" },
    create: { key: "site_font", value: "fredoka-nunito" },
  });

  console.log("Seed завершён");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
