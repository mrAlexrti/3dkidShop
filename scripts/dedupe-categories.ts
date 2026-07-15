/**
 * Безопасная очистка тестовых категорий 3D Kid.
 *
 * По умолчанию выполняется строго read-only dry-run.
 * Изменения разрешены только с явным флагом --apply и выполняются одной
 * транзакцией Prisma.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { CHILD_CATEGORIES, ROOT_CATEGORIES } from "../prisma/category-data";

function loadEnvFallback() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvFallback();

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const LEGACY_CATEGORIES = [
  {
    name: "Стикеры",
    slug: "stickers",
    products: [
      "Набор стикеров «Котики»",
      "Набор стикеров «Еда»",
      "Стикер «Растение монстера»",
    ],
  },
  {
    name: "Постеры",
    slug: "posters",
    products: ["Постер «Минимализм #1»", "Постер «Город ночью»", "Постер «Ботаника»"],
  },
  {
    name: "Открытки",
    slug: "cards",
    products: ["Открытка «С днём рождения»", "Открытка «Спасибо»"],
  },
  {
    name: "Мерч",
    slug: "merch",
    products: [
      "Холщовая сумка с принтом",
      "Набор значков «Эмоции»",
      "Кружка «Доброе утро»",
    ],
  },
] as const;

const FORBIDDEN_VARIANT_SLUGS = [
  "3d-toys",
  "crocs-jibbitz",
  "earphone-accessories",
  "courses-3d",
] as const;

const TARGET_SLUGS = new Set<string>([
  ...ROOT_CATEGORIES.map((category) => category.slug),
  ...CHILD_CATEGORIES.map((category) => category.slug),
]);
const LEGACY_SLUGS = new Set<string>(LEGACY_CATEGORIES.map((category) => category.slug));
const EXPECTED_LEGACY_PRODUCT_NAMES = new Set<string>(
  LEGACY_CATEGORIES.flatMap((category) => [...category.products])
);

type AuditCategory = Prisma.CategoryGetPayload<{
  include: {
    parent: { select: { name: true } };
    children: { select: { id: true } };
    products: {
      select: {
        id: true;
        name: true;
        _count: { select: { orderItems: true } };
      };
    };
    _count: { select: { children: true; products: true } };
  };
}>;

async function readCategories(client: PrismaClient | Prisma.TransactionClient) {
  return client.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { name: true } },
      children: { select: { id: true } },
      products: {
        select: {
          id: true,
          name: true,
          _count: { select: { orderItems: true } },
        },
      },
      _count: { select: { children: true, products: true } },
    },
  });
}

function isMissingLocalCategoryImage(imageUrl: string | null) {
  if (!imageUrl?.startsWith("/images/categories/")) return false;
  return !existsSync(resolve(process.cwd(), "public", imageUrl.replace(/^\//, "")));
}

function validateAudit(categories: AuditCategory[]) {
  const forbidden = categories.filter((category) =>
    FORBIDDEN_VARIANT_SLUGS.includes(
      category.slug as (typeof FORBIDDEN_VARIANT_SLUGS)[number]
    )
  );
  const unexpected = categories.filter(
    (category) => !TARGET_SLUGS.has(category.slug) && !LEGACY_SLUGS.has(category.slug)
  );
  const legacy = categories.filter((category) => LEGACY_SLUGS.has(category.slug));

  const unexpectedLegacyProducts = legacy.flatMap((category) =>
    category.products.filter((product) => !EXPECTED_LEGACY_PRODUCT_NAMES.has(product.name))
  );
  const legacyWithChildren = legacy.filter((category) => category._count.children > 0);

  const errors: string[] = [];
  if (forbidden.length > 0) {
    errors.push(`Найдены запрещённые варианты slug: ${forbidden.map((c) => c.slug).join(", ")}`);
  }
  if (unexpected.length > 0) {
    errors.push(`Найдены неожиданные категории: ${unexpected.map((c) => c.slug).join(", ")}`);
  }
  if (unexpectedLegacyProducts.length > 0) {
    errors.push(
      `В legacy-категориях есть неутверждённые товары: ${unexpectedLegacyProducts
        .map((product) => product.name)
        .join(", ")}`
    );
  }
  if (legacyWithChildren.length > 0) {
    errors.push(
      `Legacy-категории имеют дочерние категории: ${legacyWithChildren
        .map((category) => category.slug)
        .join(", ")}`
    );
  }

  return { errors, legacy };
}

async function readDependentOrders(client: PrismaClient | Prisma.TransactionClient) {
  return client.order.findMany({
    where: {
      items: {
        some: {
          product: { category: { slug: { in: [...LEGACY_SLUGS] } } },
        },
      },
    },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      status: true,
      items: {
        select: {
          product: { select: { category: { select: { slug: true } } } },
        },
      },
    },
  });
}

function findMixedOrders(orders: Awaited<ReturnType<typeof readDependentOrders>>) {
  return orders.filter((order) =>
    order.items.some((item) => !LEGACY_SLUGS.has(item.product.category.slug))
  );
}

function printTree(categories: AuditCategory[]) {
  const roots = categories.filter((category) => category.parentId === null);
  for (const root of roots) {
    console.log(
      `- ${root.name} [${root.slug}] — товаров: ${root._count.products}, дочерних: ${root._count.children}`
    );
    const children = categories.filter((category) => category.parentId === root.id);
    for (const child of children) {
      console.log(`  └─ ${child.name} [${child.slug}] — товаров: ${child._count.products}`);
    }
  }
}

async function printDryRun(categories: AuditCategory[]) {
  const { errors, legacy } = validateAudit(categories);
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  const siteFont = await prisma.siteContent.findUnique({ where: { key: "site_font" } });
  const dependentOrders = await readDependentOrders(prisma);
  const mixedOrders = findMixedOrders(dependentOrders);

  if (mixedOrders.length > 0) {
    errors.push(
      `Есть смешанные заказы с legacy и целевыми товарами: ${mixedOrders
        .map((order) => order.number)
        .join(", ")}`
    );
  }

  console.log("=== DRY-RUN: очистка тестовых категорий 3D Kid ===\n");
  console.log("Удаление legacy-товаров:");
  if (legacy.length === 0) console.log("- нечего удалять");
  for (const category of legacy) {
    console.log(`- ${category.name} [${category.slug}]: ${category.products.length} товар(а)`);
    for (const product of category.products) console.log(`  • ${product.name}`);
  }

  console.log("\nЗависимые тестовые заказы (удаляются до товаров из-за FK):");
  if (dependentOrders.length === 0) console.log("- нет");
  for (const order of dependentOrders) {
    console.log(`- ${order.number} [${order.status}], позиций: ${order.items.length}`);
  }

  console.log("\nУдаление legacy-категорий:");
  if (legacy.length === 0) console.log("- нечего удалять");
  for (const category of legacy) console.log(`- ${category.name} [${category.slug}]`);

  console.log("\nЦелевые категории:");
  for (const target of [...ROOT_CATEGORIES, ...CHILD_CATEGORIES]) {
    const existing = bySlug.get(target.slug);
    console.log(`- ${target.name} [${target.slug}]: ${existing ? "обновить без дублирования" : "создать"}`);
  }

  console.log("\nИзменения parentId:");
  const parent = bySlug.get("other-3d");
  for (const child of CHILD_CATEGORIES) {
    const existing = bySlug.get(child.slug);
    console.log(
      `- ${child.slug}: ${existing?.parentId ?? "null"} → ${parent?.id ?? "id создаваемой other-3d"}`
    );
  }

  console.log("\nАнглийские названия:");
  for (const target of [...ROOT_CATEGORIES, ...CHILD_CATEGORIES]) {
    const existing = bySlug.get(target.slug);
    console.log(`- ${target.slug}: ${existing?.nameEn ?? "null"} → ${target.nameEn}`);
  }

  const brokenImages = categories.filter(
    (category) => TARGET_SLUGS.has(category.slug) && isMissingLocalCategoryImage(category.imageUrl)
  );
  console.log("\nБитые локальные imageUrl → null:");
  if (brokenImages.length === 0) console.log("- нет");
  for (const category of brokenImages) console.log(`- ${category.slug}: ${category.imageUrl}`);

  console.log(`\nsite_font: ${siteFont?.value ?? "<отсутствует>"} → fredoka-nunito`);

  if (errors.length > 0) {
    console.log("\nОШИБКИ, применение запрещено:");
    for (const error of errors) console.log(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nDry-run завершён: БД не изменена.");
  console.log("Для применения запустите тот же скрипт с --apply.");
}

async function applyCleanup() {
  const result = await prisma.$transaction(async (tx) => {
    const before = await readCategories(tx);
    const { errors, legacy } = validateAudit(before);
    const dependentOrders = await readDependentOrders(tx);
    const mixedOrders = findMixedOrders(dependentOrders);
    if (mixedOrders.length > 0) {
      errors.push(
        `Есть смешанные заказы с legacy и целевыми товарами: ${mixedOrders
          .map((order) => order.number)
          .join(", ")}`
      );
    }
    if (errors.length > 0) throw new Error(errors.join("\n"));

    const legacyIds = legacy.map((category) => category.id);
    const dependentOrderIds = dependentOrders.map((order) => order.id);
    if (dependentOrderIds.length > 0) {
      await tx.order.deleteMany({ where: { id: { in: dependentOrderIds } } });
    }
    if (legacyIds.length > 0) {
      await tx.product.deleteMany({ where: { categoryId: { in: legacyIds } } });
      await tx.category.deleteMany({ where: { id: { in: legacyIds } } });
    }

    const idBySlug = new Map<string, string>();
    for (const target of ROOT_CATEGORIES) {
      const existing = await tx.category.findUnique({ where: { slug: target.slug } });
      const category = await tx.category.upsert({
        where: { slug: target.slug },
        create: {
          name: target.name,
          nameEn: target.nameEn,
          slug: target.slug,
          order: target.order,
          parentId: null,
          imageUrl: null,
        },
        update: {
          name: target.name,
          nameEn: target.nameEn,
          order: target.order,
          parentId: null,
          ...(isMissingLocalCategoryImage(existing?.imageUrl ?? null) ? { imageUrl: null } : {}),
        },
      });
      idBySlug.set(target.slug, category.id);
    }

    for (const target of CHILD_CATEGORIES) {
      const parentId = idBySlug.get(target.parentSlug);
      if (!parentId) throw new Error(`Не найден родитель ${target.parentSlug}`);
      const existing = await tx.category.findUnique({ where: { slug: target.slug } });
      const category = await tx.category.upsert({
        where: { slug: target.slug },
        create: {
          name: target.name,
          nameEn: target.nameEn,
          slug: target.slug,
          order: target.order,
          parentId,
          imageUrl: null,
        },
        update: {
          name: target.name,
          nameEn: target.nameEn,
          order: target.order,
          parentId,
          ...(isMissingLocalCategoryImage(existing?.imageUrl ?? null) ? { imageUrl: null } : {}),
        },
      });
      idBySlug.set(target.slug, category.id);
    }

    await tx.siteContent.upsert({
      where: { key: "site_font" },
      create: { key: "site_font", value: "fredoka-nunito" },
      update: { value: "fredoka-nunito" },
    });

    const after = await readCategories(tx);
    if (after.length !== TARGET_SLUGS.size) {
      throw new Error(`Ожидалось ${TARGET_SLUGS.size} категорий, получено ${after.length}`);
    }
    if (after.some((category) => !TARGET_SLUGS.has(category.slug))) {
      throw new Error("После очистки остались нецелевые категории");
    }
    const other3d = after.find((category) => category.slug === "other-3d");
    if (!other3d) throw new Error("После очистки отсутствует other-3d");
    for (const child of CHILD_CATEGORIES) {
      const row = after.find((category) => category.slug === child.slug);
      if (!row || row.parentId !== other3d.id) {
        throw new Error(`Некорректный parentId у ${child.slug}`);
      }
    }

    const remainingLegacyProducts = await tx.product.count({
      where: { name: { in: [...EXPECTED_LEGACY_PRODUCT_NAMES] } },
    });
    if (remainingLegacyProducts !== 0) {
      throw new Error(`Осталось legacy-товаров: ${remainingLegacyProducts}`);
    }

    return after;
  }, { timeout: 30_000 });

  console.log("=== APPLY: очистка завершена одной транзакцией ===\n");
  printTree(result);
  const productCount = await prisma.product.count();
  console.log(`\nВсего категорий: ${result.length}`);
  console.log(`Всего товаров: ${productCount}`);
  console.log("site_font: fredoka-nunito");
}

async function main() {
  if (APPLY) {
    await applyCleanup();
    return;
  }

  const categories = await readCategories(prisma);
  await printDryRun(categories);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
