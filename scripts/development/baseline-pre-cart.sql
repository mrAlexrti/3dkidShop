-- OPS-02 application schema baseline, before the reviewed UX-09 / UX-10 migration.
-- Extracted with pg_restore --schema-only --no-owner from the verified OPS-01 archive.
-- No rows, role passwords or provider-managed default ACLs are included.

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.7 (a21afb5)
-- Dumped by pg_dump version 18.7

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: CheckoutAcceptance; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CheckoutAcceptance" AS ENUM (
    'LEGACY',
    'PROVISIONAL',
    'ACCEPTED',
    'REVIEW'
);


--
-- Name: OrderStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OrderStatus" AS ENUM (
    'PENDING',
    'PAID',
    'PROCESSING',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED',
    'AWAITING_PAYMENT',
    'DELIVERED'
);


--
-- Name: ProductOptionKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductOptionKind" AS ENUM (
    'COLOR',
    'SIZE'
);


--
-- Name: ProductOptionMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProductOptionMode" AS ENUM (
    'LEGACY',
    'SIMPLE',
    'SIZE',
    'COLOR',
    'COLOR_SIZE'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'MANAGER',
    'CUSTOMER'
);


--
-- Name: batch181_check_filament_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch181_check_filament_group() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE group_id text;
BEGIN
  IF TG_TABLE_NAME='VariantFilamentGroup' THEN group_id := NEW.id;
  ELSE group_id := OLD."groupId"; END IF;
  IF EXISTS (SELECT 1 FROM public."VariantFilamentGroup" WHERE id=group_id)
    AND NOT EXISTS (SELECT 1 FROM public."VariantFilamentAlternative" WHERE "groupId"=group_id)
  THEN RAISE EXCEPTION 'B181_EMPTY_FILAMENT_GROUP' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;


--
-- Name: batch181_lock_filament_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch181_lock_filament_group() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE public."VariantFilamentGroup" SET position=position WHERE id=OLD."groupId";
  IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
  RETURN OLD;
END $$;


--
-- Name: batch18_child_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch18_child_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  prior jsonb; next_row jsonb; row_data jsonb; parent_id text; found_parent boolean;
  group_id text; typed_kind public."ProductOptionKind";
BEGIN
  IF TG_OP <> 'INSERT' THEN prior := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN next_row := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'ProductVariantSelection' AND next_row IS DISTINCT FROM prior THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_SELECTION';
    END IF;
    IF TG_TABLE_NAME <> 'ProductVariantSelection' AND
       (next_row->>'id' IS DISTINCT FROM prior->>'id') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_ID';
    END IF;
    IF TG_TABLE_NAME = 'ProductOptionValue' THEN
      IF next_row->>'optionId' IS DISTINCT FROM prior->>'optionId' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_VALUE_OWNER';
      END IF;
    ELSIF next_row->>'productId' IS DISTINCT FROM prior->>'productId' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_PRODUCT_OWNER';
    END IF;
    IF TG_TABLE_NAME = 'ProductOption' AND prior->>'kind' IS NOT NULL
       AND next_row->>'kind' IS DISTINCT FROM prior->>'kind' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_KIND';
    END IF;
    IF TG_TABLE_NAME = 'ProductVariant' AND
       next_row->>'combinationKey' IS DISTINCT FROM prior->>'combinationKey' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_TUPLE';
    END IF;
  END IF;
  row_data := COALESCE(next_row, prior);
  IF TG_TABLE_NAME = 'ProductOptionValue' THEN
    group_id := row_data->>'optionId';
    SELECT o."productId", o."kind" INTO parent_id, typed_kind
      FROM public."ProductOption" o WHERE o."id" = group_id;
  ELSE
    parent_id := row_data->>'productId';
    IF TG_TABLE_NAME = 'ProductOption' THEN typed_kind := (row_data->>'kind')::public."ProductOptionKind"; END IF;
  END IF;
  PERFORM p."id" FROM public."Product" p WHERE p."id"=parent_id FOR UPDATE;
  found_parent := FOUND;
  IF NOT found_parent THEN
    -- A whole-product cascade may already have removed its group/parent.
    -- A live orphan INSERT/UPDATE remains rejected by these guards / ownership FKs.
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='B18_MISSING_PARENT';
  END IF;
  IF TG_OP = 'DELETE' AND (TG_TABLE_NAME IN ('ProductVariant','ProductVariantSelection')
       OR typed_kind IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_RETIRE_INSTEAD_OF_DELETE';
  END IF;
  IF TG_TABLE_NAME='ProductOptionValue' AND typed_kind IS NOT NULL
     AND (row_data->>'id') !~ '^[A-Za-z0-9_]{1,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_VALUE_ID';
  END IF;
  -- A no-op assignment goes through the Product trigger and advances its epoch.
  UPDATE public."Product" SET "variantRevision"="variantRevision" WHERE "id"=parent_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $_$;


--
-- Name: batch18_deferred_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch18_deferred_integrity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE data jsonb; parent_id text; variant_id text;
BEGIN
  IF TG_OP='DELETE' THEN data:=to_jsonb(OLD); ELSE data:=to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME='Product' THEN parent_id:=data->>'id';
  ELSIF TG_TABLE_NAME='ProductOptionValue' THEN
    SELECT "productId" INTO parent_id FROM public."ProductOption" WHERE "id"=data->>'optionId';
  ELSE parent_id:=data->>'productId'; END IF;
  IF TG_TABLE_NAME='ProductVariant' THEN variant_id:=data->>'id';
  ELSIF TG_TABLE_NAME='ProductVariantSelection' THEN variant_id:=data->>'variantId'; END IF;
  PERFORM public.batch18_validate_product(parent_id,variant_id);
  RETURN NULL;
END $$;


--
-- Name: batch18_order_snapshot_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch18_order_snapshot_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE p public."Product"; v public."ProductVariant"; snap jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (OLD."productVariantId" IS NOT NULL OR NEW."productVariantId" IS NOT NULL) AND
       ROW(NEW."id",NEW."orderId",NEW."productId",NEW."productVariantId",NEW."productName",NEW."optionsJson",NEW."price",NEW."quantity")
       IS DISTINCT FROM
       ROW(OLD."id",OLD."orderId",OLD."productId",OLD."productVariantId",OLD."productName",OLD."optionsJson",OLD."price",OLD."quantity") THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_ORDER_SNAPSHOT';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO p FROM public."Product" WHERE "id"=NEW."productId" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='B18_ORDER_PRODUCT_MISSING'; END IF;
  IF p."optionMode" IN ('LEGACY','SIMPLE') THEN
    IF NEW."productVariantId" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_UNEXPECTED_VARIANT';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v FROM public."ProductVariant" WHERE "id"=NEW."productVariantId" AND "productId"=NEW."productId";
  IF NOT FOUND OR NOT p."isActive" OR NOT p."isOrderable" OR NOT v."isAvailable"
     OR v."retiredAt" IS NOT NULL OR NEW."price"<>v."price" OR NEW."quantity"<1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE';
  END IF;
  PERFORM public.batch18_validate_product(p."id",v."id");
  BEGIN snap:=NEW."optionsJson"::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_ORDER_SNAPSHOT';
  END;
  IF snap->'version' IS DISTINCT FROM '2'::jsonb OR snap->>'variantId' IS DISTINCT FROM v."id"
     OR jsonb_typeof(snap->'dimensions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_ORDER_SNAPSHOT';
  END IF;
  IF (SELECT jsonb_agg(jsonb_build_object('kind',o."kind",'optionId',s."optionId",'valueId',s."valueId",
             'labelUa',x."value",'labelEn',x."valueEn",'noteUa',x."note",'noteEn',x."noteEn") ORDER BY o."kind"::text COLLATE "C")
      FROM public."ProductVariantSelection" s JOIN public."ProductOption" o ON o."id"=s."optionId"
      JOIN public."ProductOptionValue" x ON x."id"=s."valueId" AND x."optionId"=s."optionId"
      WHERE s."variantId"=v."id") IS DISTINCT FROM
     (SELECT jsonb_agg(jsonb_build_object('kind',d->>'kind','optionId',d->>'optionId','valueId',d->>'valueId',
             'labelUa',d->>'labelUa','labelEn',d->>'labelEn','noteUa',d->>'noteUa','noteEn',d->>'noteEn') ORDER BY d->>'kind' COLLATE "C")
      FROM jsonb_array_elements(snap->'dimensions') d) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_SNAPSHOT_SELECTION_MISMATCH';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: batch18_product_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch18_product_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_IMMUTABLE_PRODUCT_ID';
  END IF;
  IF OLD."optionMode" <> 'LEGACY' AND NEW."optionMode" = 'LEGACY' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_NO_LEGACY_DOWNGRADE';
  END IF;
  IF NEW."variantRevision" IS DISTINCT FROM OLD."variantRevision" THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_REVISION_DB_MANAGED';
  END IF;
  IF OLD."variantRevision" = 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE='22003', MESSAGE='B18_REVISION_EXHAUSTED';
  END IF;
  NEW."variantRevision" := OLD."variantRevision" + 1;
  RETURN NEW;
END $$;


--
-- Name: batch18_validate_product(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch18_validate_product(parent_id text, only_variant_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  mode public."ProductOptionMode"; v record; n integer; color_count integer;
  size_count integer; untyped_count integer; retired_count integer; expected_key text;
BEGIN
  SELECT p."optionMode" INTO mode FROM public."Product" p WHERE p."id"=parent_id;
  IF NOT FOUND THEN RETURN; END IF; -- completed product cascade
  IF mode='LEGACY' AND EXISTS (SELECT 1 FROM public."ProductOption" o
                              WHERE o."productId"=parent_id AND o."kind" IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_LEGACY_TYPED_GROUP';
  END IF;
  -- Typing an old group does not fire a trigger on its pre-existing values.
  -- Validate those too, including currently unused values, at the conversion gate.
  IF EXISTS (SELECT 1 FROM public."ProductOption" o
             JOIN public."ProductOptionValue" x ON x."optionId"=o."id"
             WHERE o."productId"=parent_id AND o."kind" IS NOT NULL
               AND (x."id" !~ '^[A-Za-z0-9_]{1,128}$' OR length(btrim(x."value")) NOT BETWEEN 1 AND 100
                    OR length(x."valueEn")>100 OR length(x."note")>500 OR length(x."noteEn")>500)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_TYPED_VALUE';
  END IF;
  FOR v IN SELECT * FROM public."ProductVariant" WHERE "productId"=parent_id
           AND (only_variant_id IS NULL OR "id"=only_variant_id) LOOP
    SELECT count(*), count(*) FILTER (WHERE o."kind"='COLOR'),
           count(*) FILTER (WHERE o."kind"='SIZE'), count(*) FILTER (WHERE o."kind" IS NULL),
           count(*) FILTER (WHERE x."retiredAt" IS NOT NULL),
           string_agg(o."kind"::text || '=' || s."valueId", ';' ORDER BY o."kind"::text COLLATE "C")
      INTO n,color_count,size_count,untyped_count,retired_count,expected_key
      FROM public."ProductVariantSelection" s
      JOIN public."ProductOption" o ON o."id"=s."optionId" AND o."productId"=s."productId"
      JOIN public."ProductOptionValue" x ON x."id"=s."valueId" AND x."optionId"=s."optionId"
      WHERE s."variantId"=v."id" AND s."productId"=parent_id;
    IF n NOT BETWEEN 1 AND 2 OR untyped_count<>0 OR color_count>1 OR size_count>1
       OR expected_key IS DISTINCT FROM v."combinationKey" THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_INVALID_COMBINATION';
    END IF;
    IF v."retiredAt" IS NULL AND (retired_count<>0 OR
      NOT ((mode='SIZE' AND size_count=1 AND color_count=0)
        OR (mode='COLOR' AND color_count=1 AND size_count=0)
        OR (mode='COLOR_SIZE' AND color_count=1 AND size_count=1))) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18_MODE_OR_RETIREMENT_MISMATCH';
    END IF;
  END LOOP;
END $_$;


--
-- Name: batch18a_image_color_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch18a_image_color_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF NEW."colorValueId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."ProductOptionValue" v
    JOIN public."ProductOption" o ON o."id"=v."optionId"
    WHERE v."id"=NEW."colorValueId" AND o."productId"=NEW."productId" AND o."kind"='COLOR'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='B18A_IMAGE_COLOR_OWNER_OR_KIND';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: batch19_guard_customer_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch19_guard_customer_user() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: batch19_guard_order_image(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch19_guard_order_image() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW."productImageUrl" IS DISTINCT FROM OLD."productImageUrl" THEN
    RAISE EXCEPTION 'B19_ORDER_IMAGE_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: batch19_guard_order_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch19_guard_order_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: batch19_guard_runtime_auth_rows(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch19_guard_runtime_auth_rows() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
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
END $_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Account" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


--
-- Name: Category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    "imageUrl" text,
    "order" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "parentId" text,
    "nameEn" text NOT NULL
);


--
-- Name: CustomerChallenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomerChallenge" (
    "tokenHash" text NOT NULL,
    purpose text NOT NULL,
    email text NOT NULL,
    "userId" text,
    "orderId" text,
    context text,
    expires timestamp(3) without time zone NOT NULL,
    CONSTRAINT "CustomerChallenge_check" CHECK (((purpose = 'register'::text) = ("userId" IS NULL))),
    CONSTRAINT "CustomerChallenge_check1" CHECK (((purpose = 'claim'::text) = ("orderId" IS NOT NULL))),
    CONSTRAINT "CustomerChallenge_purpose_check" CHECK ((purpose = ANY (ARRAY['register'::text, 'reset'::text, 'verify'::text, 'addPassword'::text, 'emailOld'::text, 'emailNew'::text, 'claim'::text, 'linkGoogle'::text]))),
    CONSTRAINT "CustomerChallenge_tokenHash_check" CHECK (("tokenHash" ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: CustomerFavorite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomerFavorite" (
    "userId" text NOT NULL,
    "productId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: CustomerRateLimit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomerRateLimit" (
    key text NOT NULL,
    expires timestamp(3) without time zone NOT NULL,
    hits integer NOT NULL,
    CONSTRAINT "CustomerRateLimit_hits_check" CHECK ((hits > 0)),
    CONSTRAINT "CustomerRateLimit_key_check" CHECK ((key ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: Filament; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Filament" (
    id text NOT NULL,
    manufacturer character varying(100) NOT NULL,
    series character varying(100) NOT NULL,
    material character varying(100) NOT NULL,
    color character varying(100) NOT NULL,
    hex character varying(7) NOT NULL,
    "isAvailable" boolean DEFAULT true NOT NULL,
    CONSTRAINT "Filament_color_check" CHECK ((((color)::text = btrim((color)::text)) AND ((color)::text <> ''::text))),
    CONSTRAINT "Filament_hex_check" CHECK (((hex)::text ~ '^#[0-9A-F]{6}$'::text)),
    CONSTRAINT "Filament_manufacturer_check" CHECK ((((manufacturer)::text = btrim((manufacturer)::text)) AND ((manufacturer)::text <> ''::text))),
    CONSTRAINT "Filament_material_check" CHECK ((((material)::text = btrim((material)::text)) AND ((material)::text <> ''::text))),
    CONSTRAINT "Filament_series_check" CHECK ((((series)::text = btrim((series)::text)) AND ((series)::text <> ''::text)))
);


--
-- Name: Order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Order" (
    id text NOT NULL,
    number text,
    status public."OrderStatus" DEFAULT 'PENDING'::public."OrderStatus" NOT NULL,
    "customerName" text NOT NULL,
    "customerEmail" text,
    "customerPhone" text NOT NULL,
    "shippingAddress" text NOT NULL,
    city text NOT NULL,
    "postalCode" text NOT NULL,
    comment text,
    "paymentMethod" text NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    "shippingCost" numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "customerFirstName" text,
    "customerLastName" text,
    "deliveryMethod" text,
    "novaPoshtaBranch" text,
    "novaPoshtaBranchRef" text,
    "novaPoshtaCity" text,
    "novaPoshtaCityRef" text,
    "novaPoshtaCreatedAt" timestamp(3) without time zone,
    "novaPoshtaError" text,
    "novaPoshtaStatus" text,
    "novaPoshtaStatusCode" text,
    "novaPoshtaTtn" text,
    "novaPoshtaTtnRef" text,
    "novaPoshtaCodAmount" numeric(10,2),
    "novaPoshtaCodStatus" text,
    "novaPoshtaCodStatusCode" text,
    "novaPoshtaDeliveredAt" timestamp(3) without time zone,
    "novaPoshtaSyncedAt" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    "paymentMode" text,
    "paymentProvider" text,
    "paymentStatus" text,
    "paymentInvoiceId" text,
    "paymentProviderStatus" text,
    "paymentModifiedAt" timestamp(3) without time zone,
    "paymentExpiresAt" timestamp(3) without time zone,
    "paymentNextCheckAt" timestamp(3) without time zone,
    "paymentErrorCode" text,
    "checkoutAcceptance" public."CheckoutAcceptance" DEFAULT 'LEGACY'::public."CheckoutAcceptance" NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "paymentReference" text,
    "checkoutKeyHash" text,
    "checkoutPayloadHash" text,
    "checkoutLocale" text,
    "paymentPageUrl" text,
    "customerId" text,
    CONSTRAINT "Order_checkout_acceptance_check" CHECK (((("checkoutAcceptance" = 'LEGACY'::public."CheckoutAcceptance") AND (number IS NOT NULL)) OR (("checkoutAcceptance" = 'ACCEPTED'::public."CheckoutAcceptance") AND (number IS NOT NULL) AND ("acceptedAt" IS NOT NULL)) OR (("checkoutAcceptance" = 'PROVISIONAL'::public."CheckoutAcceptance") AND (number IS NULL) AND ("paymentReference" IS NOT NULL)) OR (("checkoutAcceptance" = 'REVIEW'::public."CheckoutAcceptance") AND ("paymentReference" IS NOT NULL)))),
    CONSTRAINT "Order_checkout_locale_check" CHECK ((("checkoutLocale" IS NULL) OR ("checkoutLocale" = ANY (ARRAY['ua'::text, 'en'::text])))),
    CONSTRAINT "Order_customerEmail_nonempty" CHECK ((("customerEmail" IS NULL) OR (btrim("customerEmail") <> ''::text)))
);


--
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderItem" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    "productId" text NOT NULL,
    "productName" text NOT NULL,
    "optionsJson" text,
    price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    "productVariantId" text,
    "productImageUrl" text
);


--
-- Name: OrderNotification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderNotification" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    event text NOT NULL,
    channel text NOT NULL,
    state text DEFAULT 'PENDING'::text NOT NULL,
    payload jsonb NOT NULL,
    "attemptCount" integer DEFAULT 0 NOT NULL,
    "nextAttemptAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP,
    "dispatchId" text,
    "leaseUntil" timestamp(3) without time zone,
    "providerMessageId" text,
    "lastErrorCode" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sentAt" timestamp(3) without time zone,
    CONSTRAINT "OrderNotification_attemptCount_check" CHECK (("attemptCount" >= 0)),
    CONSTRAINT "OrderNotification_channel_check" CHECK ((channel = ANY (ARRAY['telegram'::text, 'email'::text]))),
    CONSTRAINT "OrderNotification_state_check" CHECK ((state = ANY (ARRAY['PENDING'::text, 'SENDING'::text, 'RETRY'::text, 'SENT'::text, 'UNKNOWN'::text, 'SUPPRESSED'::text])))
);


--
-- Name: Product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text NOT NULL,
    price numeric(10,2) NOT NULL,
    "oldPrice" numeric(10,2),
    sku text,
    stock integer DEFAULT 0 NOT NULL,
    "isFeatured" boolean DEFAULT false NOT NULL,
    "isNew" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "categoryId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "descriptionEn" text,
    "nameEn" text,
    "hoverGifUrl" text,
    "isOrderable" boolean DEFAULT false NOT NULL,
    materials text,
    "materialsDivider" character varying(128),
    "materialsEn" text,
    "optionMode" public."ProductOptionMode" DEFAULT 'LEGACY'::public."ProductOptionMode" NOT NULL,
    "variantRevision" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "Product_variantRevision_nonnegative" CHECK (("variantRevision" >= 0))
);


--
-- Name: ProductAttribute; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductAttribute" (
    id text NOT NULL,
    "productId" text NOT NULL,
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: ProductImage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductImage" (
    id text NOT NULL,
    "productId" text NOT NULL,
    url text NOT NULL,
    alt text,
    "order" integer DEFAULT 0 NOT NULL,
    "colorValueId" text
);


--
-- Name: ProductOption; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductOption" (
    id text NOT NULL,
    "productId" text NOT NULL,
    name text NOT NULL,
    kind public."ProductOptionKind"
);


--
-- Name: ProductOptionValue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductOptionValue" (
    id text NOT NULL,
    "optionId" text NOT NULL,
    value text NOT NULL,
    "priceModifier" numeric(10,2) DEFAULT 0 NOT NULL,
    note text,
    "noteEn" text,
    price numeric(10,2),
    "valueEn" text,
    "retiredAt" timestamp(3) without time zone,
    "displayPosition" integer,
    CONSTRAINT "ProductOptionValue_displayPosition_range" CHECK ((("displayPosition" >= 0) AND ("displayPosition" <= 1000000)))
);


--
-- Name: ProductVariant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductVariant" (
    id text NOT NULL,
    "productId" text NOT NULL,
    "combinationKey" character varying(300) NOT NULL,
    price numeric(10,2) NOT NULL,
    "isAvailable" boolean DEFAULT false NOT NULL,
    "retiredAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "ProductVariant_id_format" CHECK ((id ~ '^[A-Za-z0-9_]{1,128}$'::text)),
    CONSTRAINT "ProductVariant_price_bounds" CHECK (((price > (0)::numeric) AND (price <= 99999999.99)))
);


--
-- Name: ProductVariantSelection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductVariantSelection" (
    "variantId" text NOT NULL,
    "productId" text NOT NULL,
    "optionId" text NOT NULL,
    "valueId" text NOT NULL
);


--
-- Name: Review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Review" (
    id text NOT NULL,
    author text NOT NULL,
    rating integer NOT NULL,
    text text NOT NULL,
    "avatarUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


--
-- Name: SiteContent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SiteContent" (
    id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    name text,
    email text NOT NULL,
    "passwordHash" text,
    role public."Role" DEFAULT 'MANAGER'::public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "emailVerified" timestamp(3) without time zone,
    "firstName" text,
    "lastName" text,
    phone text
);


--
-- Name: VariantFilamentAlternative; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VariantFilamentAlternative" (
    "groupId" text NOT NULL,
    "filamentId" text NOT NULL
);


--
-- Name: VariantFilamentGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VariantFilamentGroup" (
    id text NOT NULL,
    "variantId" text NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "VariantFilamentGroup_position_check" CHECK (("position" >= 0))
);


--
-- Name: Account Account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: CustomerChallenge CustomerChallenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerChallenge"
    ADD CONSTRAINT "CustomerChallenge_pkey" PRIMARY KEY ("tokenHash");


--
-- Name: CustomerFavorite CustomerFavorite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerFavorite"
    ADD CONSTRAINT "CustomerFavorite_pkey" PRIMARY KEY ("userId", "productId");


--
-- Name: CustomerRateLimit CustomerRateLimit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerRateLimit"
    ADD CONSTRAINT "CustomerRateLimit_pkey" PRIMARY KEY (key);


--
-- Name: Filament Filament_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Filament"
    ADD CONSTRAINT "Filament_pkey" PRIMARY KEY (id);


--
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- Name: OrderNotification OrderNotification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderNotification"
    ADD CONSTRAINT "OrderNotification_pkey" PRIMARY KEY (id);


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- Name: ProductAttribute ProductAttribute_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductAttribute"
    ADD CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY (id);


--
-- Name: ProductImage ProductImage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_pkey" PRIMARY KEY (id);


--
-- Name: ProductOptionValue ProductOptionValue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductOptionValue"
    ADD CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY (id);


--
-- Name: ProductOption ProductOption_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductOption"
    ADD CONSTRAINT "ProductOption_pkey" PRIMARY KEY (id);


--
-- Name: ProductVariantSelection ProductVariantSelection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductVariantSelection"
    ADD CONSTRAINT "ProductVariantSelection_pkey" PRIMARY KEY ("variantId", "optionId");


--
-- Name: ProductVariant ProductVariant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: Review Review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: SiteContent SiteContent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteContent"
    ADD CONSTRAINT "SiteContent_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VariantFilamentAlternative VariantFilamentAlternative_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VariantFilamentAlternative"
    ADD CONSTRAINT "VariantFilamentAlternative_pkey" PRIMARY KEY ("groupId", "filamentId");


--
-- Name: VariantFilamentGroup VariantFilamentGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VariantFilamentGroup"
    ADD CONSTRAINT "VariantFilamentGroup_pkey" PRIMARY KEY (id);


--
-- Name: VariantFilamentGroup VariantFilamentGroup_variantId_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VariantFilamentGroup"
    ADD CONSTRAINT "VariantFilamentGroup_variantId_position_key" UNIQUE ("variantId", "position");


--
-- Name: Account_provider_providerAccountId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON public."Account" USING btree (provider, "providerAccountId");


--
-- Name: Category_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Category_parentId_idx" ON public."Category" USING btree ("parentId");


--
-- Name: Category_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Category_slug_key" ON public."Category" USING btree (slug);


--
-- Name: CustomerChallenge_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomerChallenge_expires_idx" ON public."CustomerChallenge" USING btree (expires);


--
-- Name: CustomerChallenge_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomerChallenge_orderId_idx" ON public."CustomerChallenge" USING btree ("orderId");


--
-- Name: CustomerChallenge_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomerChallenge_userId_idx" ON public."CustomerChallenge" USING btree ("userId");


--
-- Name: CustomerFavorite_productId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomerFavorite_productId_idx" ON public."CustomerFavorite" USING btree ("productId");


--
-- Name: CustomerRateLimit_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomerRateLimit_expires_idx" ON public."CustomerRateLimit" USING btree (expires);


--
-- Name: Filament_identity_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Filament_identity_key" ON public."Filament" USING btree (lower((manufacturer)::text), lower((series)::text), lower((material)::text), lower((color)::text));


--
-- Name: OrderItem_productId_productVariantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderItem_productId_productVariantId_idx" ON public."OrderItem" USING btree ("productId", "productVariantId");


--
-- Name: OrderNotification_orderId_event_channel_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrderNotification_orderId_event_channel_key" ON public."OrderNotification" USING btree ("orderId", event, channel);


--
-- Name: OrderNotification_state_nextAttemptAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderNotification_state_nextAttemptAt_idx" ON public."OrderNotification" USING btree (state, "nextAttemptAt");


--
-- Name: Order_checkoutAcceptance_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Order_checkoutAcceptance_createdAt_idx" ON public."Order" USING btree ("checkoutAcceptance", "createdAt");


--
-- Name: Order_checkoutKeyHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Order_checkoutKeyHash_key" ON public."Order" USING btree ("checkoutKeyHash");


--
-- Name: Order_customerId_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Order_customerId_createdAt_id_idx" ON public."Order" USING btree ("customerId", "createdAt", id);


--
-- Name: Order_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Order_number_key" ON public."Order" USING btree (number);


--
-- Name: Order_paymentProvider_paymentInvoiceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Order_paymentProvider_paymentInvoiceId_key" ON public."Order" USING btree ("paymentProvider", "paymentInvoiceId");


--
-- Name: Order_paymentProvider_paymentNextCheckAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Order_paymentProvider_paymentNextCheckAt_idx" ON public."Order" USING btree ("paymentProvider", "paymentNextCheckAt");


--
-- Name: Order_paymentReference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Order_paymentReference_key" ON public."Order" USING btree ("paymentReference");


--
-- Name: ProductImage_colorValueId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProductImage_colorValueId_idx" ON public."ProductImage" USING btree ("colorValueId");


--
-- Name: ProductOptionValue_optionId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProductOptionValue_optionId_id_key" ON public."ProductOptionValue" USING btree ("optionId", id);


--
-- Name: ProductOption_productId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProductOption_productId_id_key" ON public."ProductOption" USING btree ("productId", id);


--
-- Name: ProductOption_productId_kind_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProductOption_productId_kind_key" ON public."ProductOption" USING btree ("productId", kind);


--
-- Name: ProductVariantSelection_optionId_valueId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProductVariantSelection_optionId_valueId_idx" ON public."ProductVariantSelection" USING btree ("optionId", "valueId");


--
-- Name: ProductVariantSelection_productId_variantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProductVariantSelection_productId_variantId_idx" ON public."ProductVariantSelection" USING btree ("productId", "variantId");


--
-- Name: ProductVariant_productId_combinationKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProductVariant_productId_combinationKey_key" ON public."ProductVariant" USING btree ("productId", "combinationKey");


--
-- Name: ProductVariant_productId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProductVariant_productId_id_key" ON public."ProductVariant" USING btree ("productId", id);


--
-- Name: ProductVariant_productId_retiredAt_isAvailable_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProductVariant_productId_retiredAt_isAvailable_idx" ON public."ProductVariant" USING btree ("productId", "retiredAt", "isAvailable");


--
-- Name: Product_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Product_categoryId_idx" ON public."Product" USING btree ("categoryId");


--
-- Name: Product_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Product_sku_key" ON public."Product" USING btree (sku);


--
-- Name: Product_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Product_slug_key" ON public."Product" USING btree (slug);


--
-- Name: Session_sessionToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Session_sessionToken_key" ON public."Session" USING btree ("sessionToken");


--
-- Name: Session_userId_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_userId_expires_idx" ON public."Session" USING btree ("userId", expires);


--
-- Name: SiteContent_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SiteContent_key_key" ON public."SiteContent" USING btree (key);


--
-- Name: User_email_casefold_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_casefold_key" ON public."User" USING btree (lower(email));


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: VariantFilamentAlternative_filamentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VariantFilamentAlternative_filamentId_idx" ON public."VariantFilamentAlternative" USING btree ("filamentId");


--
-- Name: VariantFilamentAlternative batch181_lock_filament_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch181_lock_filament_group BEFORE DELETE OR UPDATE ON public."VariantFilamentAlternative" FOR EACH ROW EXECUTE FUNCTION public.batch181_lock_filament_group();


--
-- Name: VariantFilamentAlternative batch181_nonempty_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER batch181_nonempty_group AFTER DELETE OR UPDATE ON public."VariantFilamentAlternative" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch181_check_filament_group();


--
-- Name: VariantFilamentGroup batch181_nonempty_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER batch181_nonempty_group AFTER INSERT ON public."VariantFilamentGroup" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch181_check_filament_group();


--
-- Name: ProductOption batch18_child_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18_child_guard BEFORE INSERT OR DELETE OR UPDATE ON public."ProductOption" FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();


--
-- Name: ProductOptionValue batch18_child_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18_child_guard BEFORE INSERT OR DELETE OR UPDATE ON public."ProductOptionValue" FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();


--
-- Name: ProductVariant batch18_child_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18_child_guard BEFORE INSERT OR DELETE OR UPDATE ON public."ProductVariant" FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();


--
-- Name: ProductVariantSelection batch18_child_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18_child_guard BEFORE INSERT OR DELETE OR UPDATE ON public."ProductVariantSelection" FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();


--
-- Name: Product batch18_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER batch18_integrity AFTER UPDATE OF "optionMode" ON public."Product" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();


--
-- Name: ProductOption batch18_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR DELETE OR UPDATE ON public."ProductOption" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();


--
-- Name: ProductOptionValue batch18_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR DELETE OR UPDATE ON public."ProductOptionValue" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();


--
-- Name: ProductVariant batch18_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR DELETE OR UPDATE ON public."ProductVariant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();


--
-- Name: ProductVariantSelection batch18_integrity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER batch18_integrity AFTER INSERT OR DELETE OR UPDATE ON public."ProductVariantSelection" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.batch18_deferred_integrity();


--
-- Name: OrderItem batch18_order_snapshot_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18_order_snapshot_guard BEFORE INSERT OR UPDATE ON public."OrderItem" FOR EACH ROW EXECUTE FUNCTION public.batch18_order_snapshot_guard();


--
-- Name: Product batch18_product_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18_product_guard BEFORE UPDATE ON public."Product" FOR EACH ROW EXECUTE FUNCTION public.batch18_product_guard();


--
-- Name: ProductImage batch18a_10_image_owner_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18a_10_image_owner_guard BEFORE INSERT OR DELETE OR UPDATE ON public."ProductImage" FOR EACH ROW EXECUTE FUNCTION public.batch18_child_guard();


--
-- Name: ProductImage batch18a_20_image_color_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch18a_20_image_color_guard BEFORE INSERT OR UPDATE ON public."ProductImage" FOR EACH ROW EXECUTE FUNCTION public.batch18a_image_color_guard();


--
-- Name: Account batch19_guard_customer_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch19_guard_customer_account BEFORE INSERT OR DELETE OR UPDATE ON public."Account" FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_runtime_auth_rows();


--
-- Name: Session batch19_guard_customer_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch19_guard_customer_session BEFORE INSERT OR DELETE OR UPDATE ON public."Session" FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_runtime_auth_rows();


--
-- Name: User batch19_guard_customer_user; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch19_guard_customer_user BEFORE INSERT OR UPDATE ON public."User" FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_customer_user();


--
-- Name: OrderItem batch19_guard_order_image; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch19_guard_order_image BEFORE UPDATE OF "productImageUrl" ON public."OrderItem" FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_order_image();


--
-- Name: Order batch19_guard_order_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER batch19_guard_order_owner BEFORE INSERT OR UPDATE OF "customerId" ON public."Order" FOR EACH ROW EXECUTE FUNCTION public.batch19_guard_order_owner();


--
-- Name: Account Account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Category Category_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomerChallenge CustomerChallenge_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerChallenge"
    ADD CONSTRAINT "CustomerChallenge_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomerChallenge CustomerChallenge_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerChallenge"
    ADD CONSTRAINT "CustomerChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomerFavorite CustomerFavorite_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerFavorite"
    ADD CONSTRAINT "CustomerFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomerFavorite CustomerFavorite_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerFavorite"
    ADD CONSTRAINT "CustomerFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OrderItem OrderItem_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OrderItem OrderItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OrderItem OrderItem_productId_productVariantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_productId_productVariantId_fkey" FOREIGN KEY ("productId", "productVariantId") REFERENCES public."ProductVariant"("productId", id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: OrderNotification OrderNotification_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderNotification"
    ADD CONSTRAINT "OrderNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Order Order_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."User"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: ProductAttribute ProductAttribute_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductAttribute"
    ADD CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductImage ProductImage_colorValueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_colorValueId_fkey" FOREIGN KEY ("colorValueId") REFERENCES public."ProductOptionValue"(id) ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ProductImage ProductImage_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductOptionValue ProductOptionValue_optionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductOptionValue"
    ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES public."ProductOption"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductOption ProductOption_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductOption"
    ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductVariantSelection ProductVariantSelection_optionId_valueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductVariantSelection"
    ADD CONSTRAINT "ProductVariantSelection_optionId_valueId_fkey" FOREIGN KEY ("optionId", "valueId") REFERENCES public."ProductOptionValue"("optionId", id) ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ProductVariantSelection ProductVariantSelection_productId_optionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductVariantSelection"
    ADD CONSTRAINT "ProductVariantSelection_productId_optionId_fkey" FOREIGN KEY ("productId", "optionId") REFERENCES public."ProductOption"("productId", id) ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ProductVariantSelection ProductVariantSelection_productId_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductVariantSelection"
    ADD CONSTRAINT "ProductVariantSelection_productId_variantId_fkey" FOREIGN KEY ("productId", "variantId") REFERENCES public."ProductVariant"("productId", id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: ProductVariant ProductVariant_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: Product Product_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: VariantFilamentAlternative VariantFilamentAlternative_filamentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VariantFilamentAlternative"
    ADD CONSTRAINT "VariantFilamentAlternative_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES public."Filament"(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: VariantFilamentAlternative VariantFilamentAlternative_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VariantFilamentAlternative"
    ADD CONSTRAINT "VariantFilamentAlternative_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public."VariantFilamentGroup"(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: VariantFilamentGroup VariantFilamentGroup_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VariantFilamentGroup"
    ADD CONSTRAINT "VariantFilamentGroup_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO app_3dkid;


--
-- Name: TYPE "ProductOptionKind"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TYPE public."ProductOptionKind" TO app_3dkid;


--
-- Name: TYPE "ProductOptionMode"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TYPE public."ProductOptionMode" TO app_3dkid;


--
-- Name: FUNCTION batch181_check_filament_group(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.batch181_check_filament_group() FROM PUBLIC;


--
-- Name: FUNCTION batch181_lock_filament_group(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.batch181_lock_filament_group() FROM PUBLIC;


--
-- Name: FUNCTION batch18_validate_product(parent_id text, only_variant_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.batch18_validate_product(parent_id text, only_variant_id text) TO app_3dkid;


--
-- Name: FUNCTION batch19_guard_customer_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.batch19_guard_customer_user() FROM PUBLIC;


--
-- Name: FUNCTION batch19_guard_order_image(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.batch19_guard_order_image() FROM PUBLIC;


--
-- Name: FUNCTION batch19_guard_order_owner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.batch19_guard_order_owner() FROM PUBLIC;


--
-- Name: FUNCTION batch19_guard_runtime_auth_rows(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.batch19_guard_runtime_auth_rows() FROM PUBLIC;


--
-- Name: COLUMN "Account".id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id),INSERT(id) ON TABLE public."Account" TO app_3dkid;


--
-- Name: COLUMN "Account"."userId"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("userId"),INSERT("userId") ON TABLE public."Account" TO app_3dkid;


--
-- Name: COLUMN "Account".type; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(type) ON TABLE public."Account" TO app_3dkid;


--
-- Name: COLUMN "Account".provider; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider),INSERT(provider) ON TABLE public."Account" TO app_3dkid;


--
-- Name: COLUMN "Account"."providerAccountId"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("providerAccountId"),INSERT("providerAccountId") ON TABLE public."Account" TO app_3dkid;


--
-- Name: TABLE "Category"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Category" TO app_3dkid;


--
-- Name: TABLE "CustomerChallenge"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public."CustomerChallenge" TO app_3dkid;


--
-- Name: TABLE "CustomerFavorite"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public."CustomerFavorite" TO app_3dkid;


--
-- Name: COLUMN "CustomerRateLimit".key; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(key),INSERT(key) ON TABLE public."CustomerRateLimit" TO app_3dkid;


--
-- Name: COLUMN "CustomerRateLimit".expires; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(expires) ON TABLE public."CustomerRateLimit" TO app_3dkid;


--
-- Name: COLUMN "CustomerRateLimit".hits; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(hits),INSERT(hits),UPDATE(hits) ON TABLE public."CustomerRateLimit" TO app_3dkid;


--
-- Name: TABLE "Filament"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."Filament" TO app_3dkid;


--
-- Name: COLUMN "Filament".manufacturer; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(manufacturer) ON TABLE public."Filament" TO app_3dkid;


--
-- Name: COLUMN "Filament".series; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(series) ON TABLE public."Filament" TO app_3dkid;


--
-- Name: COLUMN "Filament".material; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(material) ON TABLE public."Filament" TO app_3dkid;


--
-- Name: COLUMN "Filament".color; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(color) ON TABLE public."Filament" TO app_3dkid;


--
-- Name: COLUMN "Filament".hex; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(hex) ON TABLE public."Filament" TO app_3dkid;


--
-- Name: COLUMN "Filament"."isAvailable"; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE("isAvailable") ON TABLE public."Filament" TO app_3dkid;


--
-- Name: TABLE "Order"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public."Order" TO app_3dkid;


--
-- Name: COLUMN "Order"."customerId"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("customerId"),INSERT("customerId"),UPDATE("customerId") ON TABLE public."Order" TO app_3dkid;


--
-- Name: TABLE "OrderItem"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public."OrderItem" TO app_3dkid;


--
-- Name: COLUMN "OrderItem"."productImageUrl"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("productImageUrl"),INSERT("productImageUrl") ON TABLE public."OrderItem" TO app_3dkid;


--
-- Name: TABLE "OrderNotification"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public."OrderNotification" TO app_3dkid;


--
-- Name: TABLE "Product"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Product" TO app_3dkid;


--
-- Name: TABLE "ProductAttribute"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProductAttribute" TO app_3dkid;


--
-- Name: TABLE "ProductImage"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProductImage" TO app_3dkid;


--
-- Name: TABLE "ProductOption"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProductOption" TO app_3dkid;


--
-- Name: TABLE "ProductOptionValue"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProductOptionValue" TO app_3dkid;


--
-- Name: COLUMN "ProductOptionValue"."displayPosition"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("displayPosition"),INSERT("displayPosition"),UPDATE("displayPosition") ON TABLE public."ProductOptionValue" TO app_3dkid;


--
-- Name: TABLE "ProductVariant"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProductVariant" TO app_3dkid;


--
-- Name: TABLE "ProductVariantSelection"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."ProductVariantSelection" TO app_3dkid;


--
-- Name: TABLE "Review"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public."Review" TO app_3dkid;


--
-- Name: TABLE "Session"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public."Session" TO app_3dkid;


--
-- Name: TABLE "SiteContent"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."SiteContent" TO app_3dkid;


--
-- Name: COLUMN "User".id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id),INSERT(id) ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User".email; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(email),INSERT(email),UPDATE(email) ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User"."passwordHash"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("passwordHash"),INSERT("passwordHash"),UPDATE("passwordHash") ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User".role; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(role),INSERT(role) ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User"."createdAt"; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT("createdAt") ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User"."emailVerified"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("emailVerified"),INSERT("emailVerified"),UPDATE("emailVerified") ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User"."firstName"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("firstName"),INSERT("firstName"),UPDATE("firstName") ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User"."lastName"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("lastName"),INSERT("lastName"),UPDATE("lastName") ON TABLE public."User" TO app_3dkid;


--
-- Name: COLUMN "User".phone; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(phone),UPDATE(phone) ON TABLE public."User" TO app_3dkid;


--
-- Name: TABLE "VariantFilamentAlternative"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public."VariantFilamentAlternative" TO app_3dkid;


--
-- Name: TABLE "VariantFilamentGroup"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public."VariantFilamentGroup" TO app_3dkid;


--
-- Name: COLUMN "VariantFilamentGroup"."position"; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE("position") ON TABLE public."VariantFilamentGroup" TO app_3dkid;

--
-- PostgreSQL database dump complete
--
