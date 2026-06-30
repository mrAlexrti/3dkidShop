export default function ProductLoading() {
  return (
    <div className="container-shop py-10">
      <div className="grid gap-10 md:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-xl2 bg-white" />
        <div className="space-y-4">
          <div className="h-4 w-24 animate-pulse rounded bg-pink-100" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-pink-100" />
          <div className="h-6 w-32 animate-pulse rounded bg-pink-100" />
          <div className="h-24 w-full animate-pulse rounded bg-pink-100" />
        </div>
      </div>
    </div>
  );
}
