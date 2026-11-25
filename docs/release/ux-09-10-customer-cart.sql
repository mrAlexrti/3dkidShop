\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF current_setting('ux0910.reviewed_execution', true) IS DISTINCT FROM 'customer-cart-reviewed'
     OR to_regprocedure('public.batch19_guard_order_owner()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_3dkid' AND NOT rolsuper AND NOT rolbypassrls)
  THEN RAISE EXCEPTION 'UX0910_REVIEW_OR_BASELINE_GUARD_MISSING'; END IF;
END $$;

CREATE TABLE public."CustomerCart" (
  "userId" TEXT PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  lines JSONB NOT NULL CHECK (CASE WHEN jsonb_typeof(lines) = 'array' THEN jsonb_array_length(lines) <= 100 ELSE false END)
);
CREATE TABLE public."CustomerCartImport" (
  id UUID PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public."CustomerCart"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  accepted JSONB NOT NULL CHECK (jsonb_typeof(accepted) = 'object')
);
CREATE INDEX "CustomerCartImport_userId_idx" ON public."CustomerCartImport"("userId");
CREATE TABLE public."CustomerCartPurchase" (
  "orderId" TEXT PRIMARY KEY REFERENCES public."Order"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  lines JSONB NOT NULL CHECK (CASE WHEN jsonb_typeof(lines) = 'array' THEN jsonb_array_length(lines) BETWEEN 1 AND 100 ELSE false END)
);

CREATE FUNCTION public.ux0910_require_customer_cart_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id = NEW."userId" AND role = 'CUSTOMER') THEN
    RAISE EXCEPTION 'UX0910_CUSTOMERS_ONLY';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ux0910_customer_cart_owner BEFORE INSERT OR UPDATE OF "userId" ON public."CustomerCart"
FOR EACH ROW EXECUTE FUNCTION public.ux0910_require_customer_cart_owner();
REVOKE ALL ON FUNCTION public.ux0910_require_customer_cart_owner() FROM PUBLIC;
REVOKE ALL ON public."CustomerCart", public."CustomerCartImport", public."CustomerCartPurchase" FROM PUBLIC;
GRANT SELECT, INSERT ON public."CustomerCart", public."CustomerCartImport", public."CustomerCartPurchase" TO app_3dkid;
GRANT UPDATE (revision, lines) ON public."CustomerCart" TO app_3dkid;
GRANT DELETE ON public."CustomerCartPurchase" TO app_3dkid;
COMMIT;
