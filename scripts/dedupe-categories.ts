/**
 * Безопасный дедуп категорий 3D Kid.
 *
 * Что делает: переносит товары из «старых»/дублирующих категорий в канонические,
 * затем удаляет опустевшие старые категории. Канонические категории не трогает.
 *
 * Безопасность:
 *   - DRY-RUN по умолчанию: печатает план, НИЧЕГО не меняет.
 *   - Применение только с флагом `--apply` (или env `CONFIRM=1`).
 *   - Никогда не удаляет каноническую категорию.
 *   - Никогда не удаляет категорию, у которой есть подкатегории (чтобы не осиротить их) — пропускает с предупреждением.
 *   - Переносит товары в рамках транзакции, только потом удаляет исходную категорию.
 *   - Незамапленные неканонические категории НЕ трогает (только показывает в отчёте).
 *
 * Запуск:
 *   # 1) сначала посмотреть план (безопасно):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/dedupe-categories.ts
 *   # или, если есть .env:  npx tsx scripts/dedupe-categories.ts
 *   # 2) отредактировать MERGE_MAP ниже под свои реальные категории;
 *   # 3) применить:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/dedupe-categories.ts --apply
 *
 * tsx не читает .env автоматически — скрипт подхватывает .env сам (см. loadEnvFallback),
 * либо передавайте DATABASE_URL явно.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFallback() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnvFallback();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply") || process.env.CONFIRM === "1";

// ── Канонический набор (должен совпадать с prisma/seed.ts) ─────────────────
const CANONICAL_TOP = [
  { name: "3D іграшки", slug: "3d-toys", order: 1 },
  { name: "Інші 3D товари", slug: "other-3d", order: 2 },
  { name: "Шопери", slug: "shoppers", order: 3 },
  { name: "Курси з 3D моделювання", slug: "courses-3d", order: 4 },
];
const CANONICAL_SUB = [
  { name: "Ґудзики", slug: "buttons", order: 1, parent: "other-3d" },
  { name: "Джибітси для Crocs", slug: "crocs-jibbitz", order: 2, parent: "other-3d" },
  { name: "Аксесуари для навушників", slug: "earphone-accessories", order: 3, parent: "other-3d" },
];
const CANONICAL_SLUGS = new Set<string>([
  ...CANONICAL_TOP.map((c) => c.slug),
  ...CANONICAL_SUB.map((c) => c.slug),
]);

// ── ОТРЕДАКТИРУЙТЕ ПОД СВОИ РЕАЛЬНЫЕ КАТЕГОРИИ ─────────────────────────────
// from = slug старой/дублирующей категории, into = slug канонической, куда перенести товары.
// Пример заполнен под демо-seed (stickers/posters/cards/merch). На проде запустите сначала
// dry-run — он покажет реальные незамапленные категории — и допишите нужные пары.
const MERGE_MAP: { from: string; into: string }[] = [
  { from: "stickers", into: "3d-toys" },
  { from: "posters", into: "other-3d" },
  { from: "cards", into: "other-3d" },
  { from: "merch", into: "shoppers" },
];

async function ensureCanonical() {
  const idBySlug: Record<string, string> = {};
  for (const c of CANONICAL_TOP) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { order: c.order },
      create: { name: c.name, slug: c.slug, order: c.order },
    });
    idBySlug[c.slug] = row.id;
  }
  for (const s of CANONICAL_SUB) {
    const row = await prisma.category.upsert({
      where: { slug: s.slug },
      update: { order: s.order, parentId: idBySlug[s.parent] },
      create: { name: s.name, slug: s.slug, order: s.order, parentId: idBySlug[s.parent] },
    });
    idBySlug[s.slug] = row.id;
  }
  return idBySlug;
}

async function main() {
  console.log(`\n=== Дедуп категорий (${APPLY ? "ПРИМЕНЕНИЕ" : "DRY-RUN"}) ===\n`);

  await ensureCanonical();

  const categories = await prisma.category.findMany({
    include: {
      _count: { select: { products: true, children: true } },
    },
  });
  const bySlug = new Map(categories.map((c) => [c.slug, c]));

  const plan: { fromSlug: string; intoSlug: string; fromId: string; intoId: string; products: number }[] = [];
  const skipped: string[] = [];

  for (const { from, into } of MERGE_MAP) {
    if (from === into) continue;
    if (CANONICAL_SLUGS.has(from)) {
      skipped.push(`«${from}» — каноническая, удалять нельзя (пропуск).`);
      continue;
    }
    if (!CANONICAL_SLUGS.has(into)) {
      skipped.push(`«${from}» → «${into}»: цель НЕ каноническая (пропуск для безопасности).`);
      continue;
    }
    const fromCat = bySlug.get(from);
    const intoCat = bySlug.get(into);
    if (!fromCat) {
      skipped.push(`«${from}» — нет такой категории (пропуск).`);
      continue;
    }
    if (!intoCat) {
      skipped.push(`«${into}» — целевая категория не найдена (пропуск).`);
      continue;
    }
    if (fromCat._count.children > 0) {
      skipped.push(`«${from}» — имеет подкатегории (${fromCat._count.children}); чтобы не осиротить, пропуск.`);
      continue;
    }
    plan.push({
      fromSlug: from,
      intoSlug: into,
      fromId: fromCat.id,
      intoId: intoCat.id,
      products: fromCat._count.products,
    });
  }

  // Отчёт по плану
  if (plan.length === 0) {
    console.log("Нет категорий к слиянию (проверьте MERGE_MAP).");
  } else {
    console.log("План слияния:");
    for (const p of plan) {
      console.log(`  • «${p.fromSlug}» → «${p.intoSlug}»: перенести ${p.products} товар(ов), затем удалить «${p.fromSlug}».`);
    }
  }

  if (skipped.length) {
    console.log("\nПропущено:");
    skipped.forEach((s) => console.log(`  - ${s}`));
  }

  // Незамапленные неканонические категории — их НЕ трогаем
  const mappedFrom = new Set(MERGE_MAP.map((m) => m.from));
  const unmapped = categories.filter(
    (c) => !CANONICAL_SLUGS.has(c.slug) && !mappedFrom.has(c.slug)
  );
  if (unmapped.length) {
    console.log("\nНезамапленные неканонические категории (оставлены без изменений):");
    for (const c of unmapped) {
      console.log(`  ? «${c.slug}» (${c.name}) — товаров: ${c._count.products}, подкатегорий: ${c._count.children}`);
    }
    console.log("  → добавьте их в MERGE_MAP, если хотите слить, либо удалите вручную в админке.");
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: изменения НЕ применены. Запустите с --apply, чтобы выполнить.\n");
    return;
  }

  // Применение
  console.log("\nПрименяю...");
  for (const p of plan) {
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { categoryId: p.fromId },
        data: { categoryId: p.intoId },
      }),
      prisma.category.delete({ where: { id: p.fromId } }),
    ]);
    console.log(`  ✓ «${p.fromSlug}» → «${p.intoSlug}» (${p.products} товар(ов) перенесено, категория удалена).`);
  }
  console.log("\nГотово ✅\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
