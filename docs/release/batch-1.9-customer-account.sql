\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
DO $$
BEGIN
  IF current_setting('batch19.reviewed_execution', true) IS DISTINCT FROM 'customer-account-reviewed'
    OR current_user = 'app_3dkid'
    OR EXISTS (
      SELECT FROM (VALUES ('Product','batch18_product_guard'),('ProductVariant','batch18_integrity'),
        ('ProductOptionValue','batch18_child_guard'),('OrderItem','batch18_order_snapshot_guard'),
        ('ProductImage','batch18a_10_image_owner_guard'),('ProductImage','batch18a_20_image_color_guard'),
        ('VariantFilamentGroup','batch181_nonempty_group'),('VariantFilamentAlternative','batch181_lock_filament_group')) expected(rel,nm)
      WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_trigger
        WHERE tgrelid=to_regclass(format('public.%I',rel)) AND tgname=nm AND tgenabled IN ('O','A') AND NOT tgisinternal))
  THEN RAISE EXCEPTION 'B19_REVIEW_OR_BASELINE_GUARD_MISSING'; END IF;
END $$;

-- The new enum label is used only after this transaction commits.
ALTER TYPE public."Role" ADD VALUE IF NOT EXISTS 'CUSTOMER';
ALTER TABLE public."User"
  ADD COLUMN "emailVerified" timestamp(3), ADD COLUMN "firstName" text, ADD COLUMN "lastName" text, ADD COLUMN phone text;
CREATE UNIQUE INDEX "User_email_casefold_key" ON public."User" (lower(email));
CREATE INDEX "Session_userId_expires_idx" ON public."Session" ("userId", expires);
ALTER TABLE public."Order" ALTER COLUMN "customerEmail" DROP NOT NULL,
  ADD CONSTRAINT "Order_customerEmail_nonempty" CHECK ("customerEmail" IS NULL OR btrim("customerEmail") <> ''),
  ADD COLUMN "customerId" text,
  ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "Order_customerId_createdAt_id_idx" ON public."Order" ("customerId","createdAt",id);
ALTER TABLE public."OrderItem" ADD COLUMN "productImageUrl" text;
ALTER TABLE public."ProductOptionValue" ADD COLUMN "displayPosition" integer,
  ADD CONSTRAINT "ProductOptionValue_displayPosition_range" CHECK ("displayPosition" BETWEEN 0 AND 1000000);

CREATE TABLE public."CustomerFavorite" (
  "userId" text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "productId" text NOT NULL REFERENCES public."Product"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "productId")
);
CREATE INDEX "CustomerFavorite_productId_idx" ON public."CustomerFavorite" ("productId");

CREATE TABLE public."CustomerChallenge" (
  "tokenHash" text PRIMARY KEY CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('register','reset','verify','addPassword','emailOld','emailNew','claim','linkGoogle')),
  email text NOT NULL,
  "userId" text REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "orderId" text REFERENCES public."Order"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  context text,
  expires timestamp(3) NOT NULL,
  CHECK ((purpose = 'register') = ("userId" IS NULL)),
  CHECK ((purpose = 'claim') = ("orderId" IS NOT NULL))
);
CREATE INDEX "CustomerChallenge_userId_idx" ON public."CustomerChallenge" ("userId");
CREATE INDEX "CustomerChallenge_orderId_idx" ON public."CustomerChallenge" ("orderId");
CREATE INDEX "CustomerChallenge_expires_idx" ON public."CustomerChallenge" (expires);

CREATE TABLE public."CustomerRateLimit" (
  key text PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'), expires timestamp(3) NOT NULL, hits integer NOT NULL CHECK (hits > 0)
);
CREATE INDEX "CustomerRateLimit_expires_idx" ON public."CustomerRateLimit" (expires);

CREATE FUNCTION public.batch19_guard_order_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW."customerId" IS NOT DISTINCT FROM OLD."customerId" THEN RETURN NEW; END IF;
    IF OLD."customerId" IS NOT NULL THEN RAISE EXCEPTION 'B19_ORDER_OWNER_IMMUTABLE' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."customerId" IS NOT NULL AND NOT EXISTS
    (SELECT FROM public."User" WHERE id=NEW."customerId" AND role::text='CUSTOMER')
  THEN RAISE EXCEPTION 'B19_ORDER_OWNER_MUST_BE_CUSTOMER' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch19_guard_order_owner BEFORE INSERT OR UPDATE OF "customerId" ON public."Order"
  FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_order_owner();

CREATE FUNCTION public.batch19_guard_customer_user() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user = 'app_3dkid' THEN
    IF TG_OP='UPDATE' AND OLD.role::text <> 'CUSTOMER' THEN
      RAISE EXCEPTION 'B19_RUNTIME_CUSTOMERS_ONLY' USING ERRCODE='23514';
    END IF;
    IF NEW.role::text <> 'CUSTOMER' THEN
      RAISE EXCEPTION 'B19_RUNTIME_CUSTOMERS_ONLY' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch19_guard_customer_user BEFORE INSERT OR UPDATE ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_customer_user();

CREATE FUNCTION public.batch19_guard_runtime_auth_rows() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE identity_id text;
BEGIN
  IF current_user = 'app_3dkid' THEN
    IF TG_OP = 'UPDATE' OR (TG_TABLE_NAME = 'Account' AND TG_OP <> 'INSERT') THEN
      RAISE EXCEPTION 'B19_RUNTIME_AUTH_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    identity_id := CASE WHEN TG_OP='DELETE' THEN OLD."userId" ELSE NEW."userId" END;
    IF NOT EXISTS (SELECT FROM public."User" WHERE id=identity_id AND role::text='CUSTOMER') THEN
      RAISE EXCEPTION 'B19_RUNTIME_CUSTOMERS_ONLY' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME = 'Account' THEN
      IF NEW.provider <> 'google' OR NEW.type <> 'oidc' THEN
        RAISE EXCEPTION 'B19_RUNTIME_GOOGLE_ONLY' USING ERRCODE='23514';
      END IF;
    ELSIF TG_OP = 'INSERT' AND NEW."sessionToken" !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'B19_SESSION_DIGEST_REQUIRED' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch19_guard_customer_account BEFORE INSERT OR UPDATE OR DELETE ON public."Account"
  FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_runtime_auth_rows();
CREATE TRIGGER batch19_guard_customer_session BEFORE INSERT OR UPDATE OR DELETE ON public."Session"
  FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_runtime_auth_rows();

CREATE FUNCTION public.batch19_guard_order_image() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."productImageUrl" IS DISTINCT FROM OLD."productImageUrl" THEN
    RAISE EXCEPTION 'B19_ORDER_IMAGE_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch19_guard_order_image BEFORE UPDATE OF "productImageUrl" ON public."OrderItem"
  FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_order_image();

REVOKE ALL ON public."CustomerFavorite", public."CustomerChallenge", public."CustomerRateLimit" FROM PUBLIC, app_3dkid;
REVOKE ALL ON FUNCTION public.batch19_guard_order_owner(), public.batch19_guard_customer_user(),
  public.batch19_guard_runtime_auth_rows(), public.batch19_guard_order_image() FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON public."CustomerFavorite", public."CustomerChallenge" TO app_3dkid;
GRANT SELECT (key,hits), INSERT (key,expires,hits), UPDATE (hits) ON public."CustomerRateLimit" TO app_3dkid;
GRANT SELECT (id,email,role,"passwordHash","emailVerified","firstName","lastName",phone),
  INSERT (id,email,role,"passwordHash","createdAt","emailVerified","firstName","lastName"),
  UPDATE (email,"emailVerified","passwordHash","firstName","lastName",phone) ON public."User" TO app_3dkid;
GRANT SELECT (id,"userId",provider,"providerAccountId"),
  INSERT (id,"userId",provider,"providerAccountId",type) ON public."Account" TO app_3dkid;
GRANT SELECT, INSERT, DELETE ON public."Session" TO app_3dkid;
GRANT SELECT ("customerId"), INSERT ("customerId"), UPDATE ("customerId") ON public."Order" TO app_3dkid;
GRANT SELECT ("productImageUrl"), INSERT ("productImageUrl") ON public."OrderItem" TO app_3dkid;
GRANT SELECT ("displayPosition"), INSERT ("displayPosition"), UPDATE ("displayPosition") ON public."ProductOptionValue" TO app_3dkid;
COMMIT;
