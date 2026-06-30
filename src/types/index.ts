export type CartItem = {
  id: string; // уникальный id строки корзины (productId + options)
  productId: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  quantity: number;
  options?: Record<string, string>;
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
