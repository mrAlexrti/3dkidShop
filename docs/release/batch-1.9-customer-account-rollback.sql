\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
DO $$
BEGIN
  IF current_setting('batch19.reviewed_execution', true) IS DISTINCT FROM 'customer-account-reviewed'
    OR current_user = 'app_3dkid' THEN RAISE EXCEPTION 'B19_REVIEW_REQUIRED'; END IF;
END $$;

LOCK TABLE public."User", public."Account", public."Session", public."Order", public."OrderItem", public."ProductOptionValue",
  public."CustomerFavorite", public."CustomerChallenge", public."CustomerRateLimit" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT FROM public."User" WHERE role='CUSTOMER' OR "emailVerified" IS NOT NULL OR "firstName" IS NOT NULL OR "lastName" IS NOT NULL OR phone IS NOT NULL)
    OR EXISTS (SELECT FROM public."Order" WHERE "customerId" IS NOT NULL OR "customerEmail" IS NULL)
    OR EXISTS (SELECT FROM public."OrderItem" WHERE "productImageUrl" IS NOT NULL)
    OR EXISTS (SELECT FROM public."ProductOptionValue" WHERE "displayPosition" IS NOT NULL)
    OR EXISTS (SELECT FROM public."CustomerFavorite")
    OR EXISTS (SELECT FROM public."CustomerChallenge")
  THEN RAISE EXCEPTION 'B19_USE_FORWARD_RECOVERY'; END IF;
END $$;

DROP TRIGGER batch19_guard_order_owner ON public."Order";
DROP TRIGGER batch19_guard_customer_user ON public."User";
DROP TRIGGER batch19_guard_customer_account ON public."Account";
DROP TRIGGER batch19_guard_customer_session ON public."Session";
DROP TRIGGER batch19_guard_order_image ON public."OrderItem";
DROP FUNCTION public.batch19_guard_order_owner(), public.batch19_guard_customer_user(),
  public.batch19_guard_runtime_auth_rows(), public.batch19_guard_order_image();
DROP TABLE public."CustomerFavorite", public."CustomerChallenge", public."CustomerRateLimit";
DROP INDEX public."Order_customerId_createdAt_id_idx", public."User_email_casefold_key", public."Session_userId_expires_idx";
ALTER TABLE public."Order" DROP COLUMN "customerId", DROP CONSTRAINT "Order_customerEmail_nonempty",
  ALTER COLUMN "customerEmail" SET NOT NULL;
ALTER TABLE public."OrderItem" DROP COLUMN "productImageUrl";
ALTER TABLE public."ProductOptionValue" DROP COLUMN "displayPosition";
ALTER TABLE public."User" DROP COLUMN "emailVerified", DROP COLUMN "firstName", DROP COLUMN "lastName", DROP COLUMN phone;
-- PostgreSQL cannot drop one enum value. Keep the unused label and the baseline ACLs.
-- Existing-table grants must be reconciled against the preflight ACL capture by the operator.
COMMIT;
