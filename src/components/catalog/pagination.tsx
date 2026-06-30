import Link from "next/link";
import { cn } from "@/lib/utils";

export function Pagination({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => v && params.set(k, v));
    params.set("page", String(page));
    return `/catalog?${params.toString()}`;
  };

  return (
    <div className="mt-12 flex justify-center gap-2">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <Link
          key={page}
          href={buildHref(page)}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full text-sm font-medium transition-colors",
            page === currentPage ? "bg-pink-500 text-white" : "bg-white text-ink/70 hover:bg-pink-50"
          )}
        >
          {page}
        </Link>
      ))}
    </div>
  );
}
