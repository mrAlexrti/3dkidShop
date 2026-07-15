import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const COMMON_DESCRIPTION_EN =
  "A colorful 3D Kid product made from high-quality material. Perfect as a gift, for play, or for bringing joy to everyday life.";

const TRANSLATIONS = [
  {
    id: "cmrb2qjf700081jjbohggu03b",
    slug: "3d-іграшка-ведмедик",
    name: "3D іграшка «Ведмедик»",
    nameEn: "3D Toy ‘Teddy Bear’",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qlgd000h1jjbj7assulp",
    slug: "брелок-зірочка",
    name: "Брелок «Зірочка»",
    nameEn: "Star Keychain",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qmsq000q1jjb1rbniyby",
    slug: "набір-3d-фігурок-космос",
    name: "Набір 3D фігурок «Космос»",
    nameEn: "3D Figurine Set ‘Space’",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qo52000z1jjbo88lodk5",
    slug: "ґудзики-веселка",
    name: "Ґудзики «Веселка»",
    nameEn: "Rainbow Buttons",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qpez00181jjb2j2ws3vd",
    slug: "джибітс-смайлик",
    name: "Джибітс «Смайлик»",
    nameEn: "Smiley Crocs Charm",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qqrq001h1jjbqfta3dfr",
    slug: "кліпса-для-навушників",
    name: "Кліпса для навушників",
    nameEn: "Headphone Clip",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qs9l001q1jjbypq7631v",
    slug: "шопер-3d-kid-heart",
    name: "Шопер «3D Kid Heart»",
    nameEn: "3D Kid Heart Tote Bag",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qu2b001z1jjbtsy8reee",
    slug: "шопер-playful-shapes",
    name: "Шопер «Playful Shapes»",
    nameEn: "Playful Shapes Tote Bag",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qvhn00281jjbc704w76o",
    slug: "курс-старт-у-3d-моделюванні",
    name: "Курс «Старт у 3D моделюванні»",
    nameEn: "Getting Started with 3D Modeling Course",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
  {
    id: "cmrb2qwxc002h1jjbzz8gaohd",
    slug: "мінікурс-моделюємо-іграшку",
    name: "Мінікурс «Моделюємо іграшку»",
    nameEn: "Mini-Course ‘Modeling a Toy’",
    descriptionEn: COMMON_DESCRIPTION_EN,
  },
] as const;

type ProductRow = Awaited<ReturnType<typeof readProducts>>[number];

function readProducts(client: PrismaClient | Prisma.TransactionClient) {
  return client.product.findMany({
    where: { id: { in: TRANSLATIONS.map((item) => item.id) } },
    select: { id: true, slug: true, name: true, nameEn: true, descriptionEn: true },
  });
}

function buildPlan(products: ProductRow[]) {
  const byId = new Map(products.map((product) => [product.id, product]));

  return TRANSLATIONS.map((translation) => {
    const product = byId.get(translation.id);
    if (!product) throw new Error(`Product not found: ${translation.id}`);
    if (product.slug !== translation.slug || product.name !== translation.name) {
      throw new Error(`Product identity mismatch: ${translation.id}`);
    }

    const data: { nameEn?: string; descriptionEn?: string } = {};
    if (!product.nameEn?.trim()) data.nameEn = translation.nameEn;
    if (!product.descriptionEn?.trim()) data.descriptionEn = translation.descriptionEn;

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      current: { nameEn: product.nameEn, descriptionEn: product.descriptionEn },
      update: data,
      status: Object.keys(data).length > 0 ? "update" : "unchanged",
    };
  });
}

async function main() {
  if (!apply) {
    const plan = buildPlan(await readProducts(prisma));
    console.log(JSON.stringify({ mode: "dry-run", writesPerformed: false, plan }, null, 2));
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const plan = buildPlan(await readProducts(tx));
    for (const item of plan) {
      if (item.status === "update") {
        await tx.product.update({ where: { id: item.id }, data: item.update });
      }
    }
    return plan;
  });

  console.log(JSON.stringify({ mode: "apply", writesPerformed: true, plan: result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Product translation backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
