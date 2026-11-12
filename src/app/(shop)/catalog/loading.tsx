export default function CatalogLoading() {
  return (
    <div className="sf-shell sf-home-panel sf-catalog" aria-hidden="true">
      <div className="sf-catalog-skeleton animate-pulse" />
      <div className="sf-product-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="sf-product-card sf-product-skeleton animate-pulse" />
        ))}
      </div>
    </div>
  );
}
