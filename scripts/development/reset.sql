-- Explicit reset of app records in an identity-checked, dedicated synthetic database.
BEGIN;
SELECT pg_advisory_xact_lock(731502);
TRUNCATE TABLE public."Account",public."Category",public."CustomerCart",public."CustomerCartImport",
  public."CustomerCartPurchase",public."CustomerChallenge",public."CustomerFavorite",public."CustomerRateLimit",
  public."Filament",public."Order",public."OrderItem",public."OrderNotification",public."Product",
  public."ProductAttribute",public."ProductImage",public."ProductOption",public."ProductOptionValue",
  public."ProductVariant",public."ProductVariantSelection",public."Review",public."Session",public."SiteContent",
  public."User",public."VariantFilamentAlternative",public."VariantFilamentGroup" RESTART IDENTITY RESTRICT;
COMMIT;
