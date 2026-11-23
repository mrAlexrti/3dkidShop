// Creates and stops its OWN PostgreSQL cluster. Never imports .env, accepts a
// connection URL, executes Prisma migrate/db push or targets an existing service.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const root = process.cwd(), bin = 'C:/Program Files/PostgreSQL/18/bin';
const directory = mkdtempSync(join(tmpdir(), 'batch18a-qa-')), data = join(directory, 'data');
const marker = randomBytes(24).toString('hex'), database = `batch18_review_${randomBytes(8).toString('hex')}`;
writeFileSync(join(directory, 'qa-marker'), marker);
const env = { ...process.env, DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/not_used', PRODUCT_MEDIA_CLEANUP_ENABLED: 'false' };
for (const key of Object.keys(env)) if (key.startsWith('PG') || key.startsWith('BATCH18')) delete env[key];
writeFileSync(join(directory, 'empty.pgpass'), '');
env.PGPASSFILE = join(directory, 'empty.pgpass'); env.PGSSLMODE = 'disable';
function run(executable, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd: directory, env, windowsHide: true, ...options });
    let output = ''; child.stdout?.on('data', (part) => output += part); child.stderr?.on('data', (part) => output += part);
    child.on('error', fail); child.on('close', (code) => code === 0 ? done(output) : fail(new Error(`${executable} exited ${code}: ${output}`)));
  });
}
const exe = (name) => join(bin, `${name}.exe`);
let started = false;
try {
  assert.match(await run(exe('postgres'), ['--version']), /PostgreSQL\) 18\./);
  await run(exe('initdb'), ['-D', data, '-U', 'batch18a_qa', '--auth=trust', '--locale=C', '--encoding=UTF8']);
  const server = createServer(); await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port; await new Promise((done) => server.close(done));
  await run(exe('pg_ctl'), ['-D', data, '-l', join(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${port} -c max_connections=20`, '-w', 'start'], { stdio: 'ignore' }); started = true;
  const connection = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'batch18a_qa', '-d', 'postgres'];
  await run(exe('psql'), [...connection, '-c', `CREATE DATABASE ${database}`]); connection[connection.length - 1] = database;
  const sql = (file, allow = false) => run(exe('psql'), [...connection,
    ...(allow ? ['-c', "SET batch18a.reviewed_execution='color-images-reviewed'"] : []), '-f', resolve(root, file)]);
  await sql('scripts/fixtures/batch18a-baseline.sql');
  await run(exe('psql'), [...connection, '-c', "SET batch18.disposable_review='synthetic-fixtures-only'", '-f', resolve(root, 'docs/review/batch-1.8-variants.sql')]);
  // Seed before expansion: existing images must retain ID/data and become universal.
  await run(exe('psql'), [...connection, '-c', `INSERT INTO "Category" (id,name,"nameEn",slug) VALUES ('qa_category','QA','QA','qa');
    INSERT INTO "Product" (id,name,slug,description,price,"categoryId","updatedAt") VALUES ('legacy','QA','legacy','Description',10,'qa_category',now());
    INSERT INTO "ProductImage" (id,"productId",url,alt) VALUES ('legacy_image','legacy','https://res.cloudinary.com/fixture/legacy.webp','Original');
    INSERT INTO "OrderItem" (id,"orderId","productId","productName",price,quantity) VALUES ('history','synthetic_order','legacy','Historical',10,1);`]);
  await assert.rejects(sql('docs/release/batch-1.8a-color-images.sql'), /B18A_REVIEW_OR_BASELINE_GUARD_MISSING/);
  await sql('docs/release/batch-1.8a-color-images.sql', true);
  assert.equal((await run(exe('psql'), [...connection, '-Atc', `SELECT "colorValueId" IS NULL AND alt='Original' FROM "ProductImage" WHERE id='legacy_image'`])).trim(), 't');
  console.log('PASS migration guard; existing photo ID/URL/alt remain universal.');
  await sql('docs/release/batch-1.8a-color-images-rollback.sql', true);
  await sql('docs/release/batch-1.8a-color-images.sql', true);
  // Inject failure after DDL to prove atomic rollback, then restore the expansion.
  await sql('docs/release/batch-1.8a-color-images-rollback.sql', true);
  writeFileSync(join(directory, 'failed.sql'), readFileSync(resolve(root, 'docs/release/batch-1.8a-color-images.sql'), 'utf8').replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;'));
  await assert.rejects(sql(join(directory, 'failed.sql'), true), /division by zero/);
  assert.equal((await run(exe('psql'), [...connection, '-Atc', `SELECT count(*)=0 FROM information_schema.columns WHERE table_name='ProductImage' AND column_name='colorValueId'`])).trim(), 't');
  await sql('docs/release/batch-1.8a-color-images.sql', true);
  console.log('PASS empty-link rollback/reapply and injected DDL failure atomicity.');
  await sql('scripts/fixtures/batch18a-runtime-role.sql');
  const url = `postgresql://app_3dkid_fixture@127.0.0.1:${port}/${database}?schema=public&connection_limit=4`;
  const missingRevisionUrl = `postgresql://batch18a_missing_revision@127.0.0.1:${port}/${database}?schema=public&connection_limit=2`;
  const applicationEnv = { ...env, DATABASE_URL: url, BATCH18A_QA_DATABASE_URL: url, BATCH18A_QA_DIRECTORY: directory, BATCH18A_QA_MARKER: marker, BATCH18A_QA_MISSING_REVISION_URL: missingRevisionUrl };
  process.stdout.write(await run(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'scripts/verify-batch18a-postgres.ts')], {
    cwd: root, env: applicationEnv,
  }));
  process.stdout.write(await run(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'scripts/verify-batch18a-runtime-role.ts')], { cwd: root, env: applicationEnv }));
  await assert.rejects(sql('docs/release/batch-1.8a-color-images-rollback.sql', true), /B18A_LINKS_EXIST_USE_FORWARD_RECOVERY/);
  console.log('PASS contraction refuses to discard existing links.');
  await sql('docs/release/batch-1.8a-color-images-verify.sql');
  console.log('PASS read-only rollout verification SQL executes against the expanded synthetic schema.');
} finally {
  if ((started || existsSync(join(data, 'postmaster.pid'))) && readFileSync(join(directory, 'qa-marker'), 'utf8') === marker)
    await run(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  console.log(`Private synthetic cluster stopped; evidence retained at ${directory}`);
}
