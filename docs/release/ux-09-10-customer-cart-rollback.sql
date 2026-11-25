\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF current_setting('ux0910.reviewed_execution', true) IS DISTINCT FROM 'customer-cart-reviewed'
  THEN RAISE EXCEPTION 'UX0910_REVIEW_REQUIRED'; END IF;
END $$;
LOCK TABLE public."CustomerCart", public."CustomerCartImport", public."CustomerCartPurchase" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."CustomerCart") OR EXISTS (SELECT 1 FROM public."CustomerCartImport")
    OR EXISTS (SELECT 1 FROM public."CustomerCartPurchase")
  THEN RAISE EXCEPTION 'UX0910_ROLLBACK_REFUSED_AFTER_USE'; END IF;
END $$;
DROP TABLE public."CustomerCartPurchase", public."CustomerCartImport", public."CustomerCart";
DROP FUNCTION public.ux0910_require_customer_cart_owner();
COMMIT;
