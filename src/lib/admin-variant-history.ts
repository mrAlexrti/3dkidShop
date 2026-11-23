import type { ProductConfiguration } from "./product-configuration";
// All active selections plus one bounded retired page. Omitted retired rows are
// preserved by the writer, so lifetime history does not exhaust form payload limits.
export function variantHistoryPage(config: ProductConfiguration, requested = 1) {
  const retired = config.combinations.filter((r) => r.retired).sort((a,b) => b.id.localeCompare(a.id));
  const values = config.values.filter((v) => v.retired).sort((a,b) => b.id.localeCompare(a.id));
  const pages = Math.max(1, Math.ceil(retired.length/20), Math.ceil(values.length/20));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const combinations = [...config.combinations.filter((r) => !r.retired), ...retired.slice((page-1)*20,page*20)];
  const visible = new Set([...config.values.filter((v) => !v.retired).map((v) => v.id), ...values.slice((page-1)*20,page*20).map((v) => v.id), ...combinations.flatMap((r) => Object.values(r.values))]);
  return { configuration: { ...config, combinations, values: config.values.filter((v) => visible.has(v.id)) }, page, pages };
}
