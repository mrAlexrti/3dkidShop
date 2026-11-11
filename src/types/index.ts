export type CartItem = {
  id: string; // productId for simple products; productId + stable size ID for variants.
  productId: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  quantity: number;
  options?: Record<string, string>;
  variant?: { id: string; labelUa: string; labelEn: string | null };
};

export type ProductWithRelations = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  oldPrice?: number | null;
  stock: number;
  isFeatured: boolean;
  isNew: boolean;
  category: { id: string; name: string; slug: string };
  images: { id: string; url: string; alt?: string | null }[];
  options: {
    id: string;
    name: string;
    values: { id: string; value: string; priceModifier: number }[];
  }[];
  attributes: { id: string; key: string; value: string }[];
};
