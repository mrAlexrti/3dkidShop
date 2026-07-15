/** Утверждённая структура категорий для seed и maintenance-задач (не runtime). */
export const ROOT_CATEGORIES = [
  { name: "3D іграшки", nameEn: "3D Toys", slug: "toys-3d", order: 10 },
  { name: "Інші 3D товари", nameEn: "Other 3D Products", slug: "other-3d", order: 20 },
  { name: "Шопери", nameEn: "Tote Bags", slug: "shoppers", order: 30 },
  {
    name: "Курси з 3D моделювання",
    nameEn: "3D Modeling Courses",
    slug: "courses-3d-modeling",
    order: 40,
  },
] as const;

export const CHILD_CATEGORIES = [
  { name: "Ґудзики", nameEn: "Buttons", slug: "buttons", order: 10, parentSlug: "other-3d" },
  {
    name: "Джибітси для Crocs",
    nameEn: "Crocs Charms",
    slug: "jibbitz-crocs",
    order: 20,
    parentSlug: "other-3d",
  },
  {
    name: "Аксесуари для навушників",
    nameEn: "Headphone Accessories",
    slug: "headphone-accessories",
    order: 30,
    parentSlug: "other-3d",
  },
] as const;
