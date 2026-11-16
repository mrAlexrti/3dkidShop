export const MAX_PRODUCT_IMAGES = 10;
export type ProductPhoto = { id: string; url: string; alt?: string | null };
export function gallerySnapshot(images: ProductPhoto[]) {
  return JSON.stringify(images.map(({ id, url, alt }) => ({ id, url, alt: alt ?? "" })));
}
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25 ? dx < 0 ? 1 : -1 : 0;
}
export function photoPosition(template: string, index: number, count: number) {
  return template.replace("{current}", String(index + 1)).replace("{total}", String(count));
}
