// OFFLINE ONLY: no child processes, database clients, environment files or network.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertSqlSyntaxArtifacts} from './verify-batch18-sql-syntax.mjs';
assertSqlSyntaxArtifacts();
const read=(path)=>readFileSync(path,'utf8');
const hash=(text,algorithm='sha256')=>createHash(algorithm).update(text).digest('hex');
const original=read('docs/review/batch-1.8-production-candidate.sql');
const reviewed=read('docs/review/batch-1.8-variants.sql');
const prior=read('docs/review/batch-1.8-neon-preflight-readonly.sql');
const manifest=JSON.parse(read('docs/review/batch-1.8-addendum-manifest.json'));
for (const [path, expected] of Object.entries(manifest.artifacts)) assert.equal(hash(read(path)), expected, `Artifact hash differs: ${path}`);
assert.equal(hash(original),manifest.artifacts['docs/review/batch-1.8-production-candidate.sql']);
assert.equal(hash(reviewed),manifest.artifacts['docs/review/batch-1.8-variants.sql']);
assert.equal(hash(prior),'0be460b0027a909716bfc92f05eb71f62ec298fcefa1b9e067d215592882ee8f');
const pre=read('docs/release/batch-1.8-production-preflight.sql');
const migration=read('docs/release/batch-1.8-production-migration.sql');
const verify=read('docs/release/batch-1.8-production-verify.sql');
const restored=read('docs/release/batch-1.8-restored-fingerprint-readonly.sql');
const body=(text)=>text.split('-- B18_PRESERVED_REVIEW_BODY_BEGIN')[1].split('-- B18_PRESERVED_REVIEW_BODY_END')[0];
assert.equal(body(migration),body(original));
console.log('PASS production preparation 1: combined manifest hashes and exact reviewed additive/trigger body verified.');

for(const text of [pre,verify,restored]) {
 assert.match(text,/BEGIN(?: ISOLATION LEVEL REPEATABLE READ)? READ ONLY;/);
 assert.equal((text.match(/^COMMIT;/gm)||[]).length,1);
 const executable=text.replace(/--[^\r\n]*/g,'');
 assert.doesNotMatch(executable,/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE)\b/im);
 assert.doesNotMatch(executable,/\\gexec|pg_authid|rolpassword|customerName|customerEmail|customerPhone|SELECT\s+\*/i);
}
assert.match(pre,/md5\(coalesce\(application_name/);
assert.match(pre,/unfinished_migrations/);
assert.match(pre,/has_prisma_ledger/);
assert.match(pre,/migration_effective_owner/);
assert.match(pre,/modifier_only_values/);
console.log('PASS production preparation 2: read-only metadata/count/role/writer/history scripts omit secret and customer-row output.');

const fp=(text)=>text.split('-- B18_SCHEMA_FINGERPRINT_BEGIN')[1].split('-- B18_SCHEMA_FINGERPRINT_END')[0].trim();
assert.equal(fp(pre),fp(prior));assert.equal(fp(restored),fp(prior));
assert.ok(migration.includes(fp(prior).replace('AS schema_fingerprint','INTO actual_fingerprint')));
for(const token of ['127.0.0.1','55432','180007','restore_3dkid_batch18','3dkid-pg18-restore']) assert.ok(restored.includes(token));
console.log('PASS production preparation 3: exact comparable schema fingerprints; restored baseline retains strict read-only identity guards.');

assert.match(migration,/NOT APPROVED FOR EXECUTION/);
for(const name of ['expected_database','migration_role','approved_schema_fingerprint','production_approved','approval_reference','approved_direct_endpoint','expected_server_major','backup_sha256','backup_created_utc']) {
 assert.ok(migration.includes(`:'${name}'`),`Missing quoted psql manifest variable ${name}`);
 assert.doesNotMatch(migration,new RegExp(`\\\\set\\s+${name}\\s+`));
}
for(const guard of ['B18_PRODUCTION_APPROVAL_OR_TARGET_MISMATCH','B18_VERIFIED_DIRECT_ENDPOINT_REQUIRED','B18_SERVER_VERSION_REVIEW_REQUIRED','B18_FRESH_INDEPENDENT_BACKUP_REQUIRED','B18_BACKUP_OUTSIDE_REVIEWED_WINDOW','B18_MIGRATION_OWNERSHIP_OR_PRIVILEGES_MISSING','B18_PRISMA_HISTORY_RECONCILIATION_REQUIRED','B18_RLS_REVIEW_REQUIRED','B18_REVIEWED_SCHEMA_FINGERPRINT_DIFFERS']) assert.ok(migration.includes(guard));
assert.match(migration,/LIKE '%-pooler\.%'/);
assert.match(migration,/interval '2 hours'/);
assert.match(migration,/current_database\(\)='restore_3dkid_batch18'/);
assert.match(migration,/current_database\(\) ~ '\^batch18_'/);
assert.doesNotMatch(migration,/LOCAL_REHEARSAL|disposable_review/);
console.log('PASS production preparation 4: unbound approval/target/version/backup/privilege/history checks fail closed.');

const begin=migration.indexOf('\nBEGIN;'),lock=migration.indexOf('\nLOCK TABLE '),drift=migration.indexOf('B18_REVIEWED_SCHEMA_FINGERPRINT_DIFFERS'),ddl=migration.indexOf('-- B18_PRESERVED_REVIEW_BODY_BEGIN');
assert.ok(begin>=0&&begin<lock&&lock<drift&&drift<ddl);
assert.match(migration,/IN SHARE ROW EXCLUSIVE MODE;/);
assert.match(migration,/SET LOCAL lock_timeout='5s'/);
assert.match(migration,/SET LOCAL statement_timeout='30s'/);
assert.match(migration,/B18_BUSINESS_ROW_COUNTS_CHANGED/);
assert.equal((migration.match(/^BEGIN;/gm)||[]).length,1);
assert.equal((migration.match(/^COMMIT;/gm)||[]).length,1);
assert.match(migration,/SET CONSTRAINTS ALL IMMEDIATE;\s*COMMIT;\s*$/);
assert.doesNotMatch(migration.replace(/--[^\r\n]*/g,''),/\b(?:GRANT|REVOKE|TRUNCATE)\b/);
console.log('PASS production preparation 5: ordered maintenance locks, locked drift check, row counts and original atomic commit/constraint flush.');

for(const m of body(original).matchAll(/CREATE FUNCTION public\.(batch18_[a-z_]+)\(.*?\) RETURNS \w+[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)) assert.ok(verify.includes(`('${m[1]}','${hash(m[2],'md5')}')`));
for(const guard of ['B18_POST_MIGRATION_OBJECT_SET_DIFFERS','B18_UNEXPECTED_CONVERSION_AT_CUTOVER','B18_GUARD_BODY_OR_CONTEXT_DIFFERS','B18_GUARD_SET_OR_ENABLEMENT_DIFFERS','B18_RUNTIME_PRIVILEGE_REVIEW_REQUIRED']) assert.ok(verify.includes(guard));
assert.match(verify,/p\.proconfig IS NULL/);
assert.match(verify,/\('SELECT'\),\('INSERT'\),\('UPDATE'\),\('DELETE'\)/);
assert.match(verify,/t\.tgenabled<>'O'/);
for (const name of ['materials','materialsEn','materialsDivider']) assert.ok(migration.includes(`\"${name}\"`));
assert.match(migration,/FOREIGN KEY \("parentId"\) REFERENCES public\."Category"\("id"\) ON DELETE RESTRICT/);
console.log('PASS production preparation 6: postflight verifies guard bodies/context/enablement and individual runtime privileges.');

assert.equal(existsSync('prisma/migrations'),false,'Unexpected new history directory requires explicit reconciliation');
assert.match(read('src/lib/variant-rollout.ts'),/process\.env\.PRODUCT_VARIANTS_ENABLED === "true"/);
for(const path of ['src/app/favicon.ico','src/app/icon.png','src/app/apple-icon.png']) assert.ok(existsSync(path));
for(const text of [pre,migration,verify,restored]) assert.doesNotMatch(text,/postgres(?:ql)?:\/\/|vercel_blob_rw_|BLOB_READ_WRITE_TOKEN\s*=/);
console.log('PASS production preparation 7: manual-history gate, default-off activation and official favicon files preserved; no embedded connection secrets.');
console.log('NOT EXECUTED: live preflight, backup, production wrapper SQL, grants, migration tracking writes, deployment and native activation.');
