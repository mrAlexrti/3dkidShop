import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type CategoryTreeChild = {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  imageUrl: string | null;
  order: number;
};

export type CategoryTreeNode = CategoryTreeChild & {
  children: CategoryTreeChild[];
};

/** Единственный read-only источник дерева категорий для runtime-компонентов. */
export const getCategoryTree = cache(async (): Promise<CategoryTreeNode[]> => {
  return prisma.category.findMany({
    where: { parentId: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      imageUrl: true,
      order: true,
      children: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          nameEn: true,
          slug: true,
          imageUrl: true,
          order: true,
        },
      },
    },
  });
});

export function getCategoryIdsForSlug(tree: CategoryTreeNode[], slug?: string) {
  if (!slug) return null;

  const root = tree.find((category) => category.slug === slug);
  if (root) return [root.id, ...root.children.map((child) => child.id)];

  const child = tree.flatMap((category) => category.children).find((category) => category.slug === slug);
  return child ? [child.id] : [];
}
