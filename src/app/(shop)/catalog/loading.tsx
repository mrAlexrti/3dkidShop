export default function CatalogLoading() {
  return (
    <div className="container-shop py-10">
      <div className="h-9 w-48 animate-pulse rounded-lg bg-pink-100" />
      <div className="mt-6 h-16 animate-pulse rounded-xl2 bg-white shadow-soft" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-[4/5] animate-pulse rounded-xl2 bg-white" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-pink-100" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-pink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
