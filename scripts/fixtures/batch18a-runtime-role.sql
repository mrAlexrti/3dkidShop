-- Private-cluster fixture ONLY; never a Production grant script.
-- Models app_3dkid catalog capabilities without ownership/DDL/order mutation rights.
-- Actual Production ACL equivalence requires a separately supplied sanitized ACL.
DO $$ BEGIN
  IF current_database() !~ '^batch18_review_[a-f0-9]+$'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_user <> 'batch18a_qa' THEN
    RAISE EXCEPTION 'LOCAL_RESTRICTED_ROLE_FIXTURE_ONLY';
  END IF;
END $$;
CREATE ROLE app_3dkid_fixture LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE batch18a_missing_revision LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_3dkid_fixture, batch18a_missing_revision;
GRANT USAGE ON TYPE public."ProductOptionMode", public."ProductOptionKind"
  TO app_3dkid_fixture, batch18a_missing_revision;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."Product", public."ProductImage" TO app_3dkid_fixture;
GRANT SELECT, INSERT, UPDATE ON public."ProductOption", public."ProductOptionValue",
  public."ProductVariant", public."ProductVariantSelection" TO app_3dkid_fixture;
GRANT SELECT ON public."Category", public."OrderItem" TO app_3dkid_fixture;
GRANT EXECUTE ON FUNCTION public.batch18_product_guard(), public.batch18_child_guard(),
  public.batch18_validate_product(text,text), public.batch18_deferred_integrity(),
  public.batch18a_image_color_guard() TO app_3dkid_fixture;
-- Negative control can row-lock Product via UPDATE(name), but cannot touch its epoch.
GRANT SELECT ON public."Product", public."ProductOption", public."ProductOptionValue"
  TO batch18a_missing_revision;
GRANT UPDATE (name) ON public."Product" TO batch18a_missing_revision;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."ProductImage" TO batch18a_missing_revision;
