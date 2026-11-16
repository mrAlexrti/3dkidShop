import { z } from "zod";

const ukrainian: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya",
};
export function generateProductSlug(name: string) {
  return [...name.normalize("NFC").toLowerCase()].map((char) => ukrainian[char] ?? char).join("")
    .replace(/['’ʼ`]/g, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160).replace(/-+$/g, "");
}

// Custom slugs are validated as approved; never transliterate/rename them on save.
export const productSlugSchema = z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type ProductSaveResult = import("@/lib/admin-form-validation").AdminFormResult;
export function slugFromNameChange(state: { name: string; slug: string; manual: boolean }, name: string) {
  return { ...state, name, slug: state.manual ? state.slug : generateProductSlug(name) };
}
