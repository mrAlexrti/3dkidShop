import { prisma } from "@/lib/prisma";
import { verifyDevelopmentIdentity } from "@/lib/environment.mjs";

export async function verifyDevelopmentRuntime(target: { kind: string; database: string; marker: string }) {
  await verifyDevelopmentIdentity(target, () => prisma.$queryRaw<{ database: string; role: string; marker: string; restricted: boolean }[]>`
    SELECT current_database() AS database, current_user AS role, value AS marker,
      session_user = current_user AND
      (SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
        FROM pg_roles WHERE rolname = current_user) AND
      NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('neon_superuser','neondb_owner','ops02_owner','batch18a_qa')
        AND pg_has_role(current_user,oid,'MEMBER')) AND
      NOT has_schema_privilege(current_user,'public','CREATE') AND
      NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','ops02_guard') AND pg_get_userbyid(c.relowner)=current_user) AS restricted
    FROM ops02_guard.identity WHERE singleton
  `);
}
