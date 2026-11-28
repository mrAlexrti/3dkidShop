BEGIN;
SET LOCAL statement_timeout='15s';
DO $$ BEGIN
  IF NOT has_table_privilege(current_user,'public."Product"','SELECT') OR
     EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) privilege
       WHERE NOT has_table_privilege(current_user,'public."SiteContent"',privilege)) OR
     NOT has_table_privilege(current_user,'public."CustomerCart"','SELECT') OR
     NOT has_column_privilege(current_user,'public."CustomerCart"','lines','UPDATE') OR
     has_column_privilege(current_user,'public."CustomerCart"','userId','UPDATE') OR
     has_column_privilege(current_user,'public."User"','role','UPDATE') OR
     has_table_privilege(current_user,'public."Order"','DELETE') OR
     has_table_privilege(current_user,'ops02_guard.identity','UPDATE') THEN RAISE EXCEPTION 'OPS02_APP_GRANTS_MISMATCH';
  END IF;
  BEGIN
    CREATE TABLE public.ops02_forbidden_probe (id integer);
    RAISE EXCEPTION 'OPS02_APP_DDL_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public."CustomerFavorite";
    RAISE EXCEPTION 'OPS02_APP_TRUNCATE_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT 'APP permissions and rejected DDL/TRUNCATE PASS';
ROLLBACK;
