// Only the owned synthetic-cluster harness calls the execution function below.
// No credentials, environment files, existing database URLs or clients are read here.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const archive = 'docs/review/archive/batch18-before-syntax-fix';
const paths = ['docs/review/batch-1.8-production-candidate.sql','docs/release/batch-1.8-production-migration.sql','docs/release/batch-1.8-production-verify.sql'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const repaired = (value) => value.replace(/^DO \$ BEGIN$/gm, () => 'DO $$ BEGIN').replace(/^END \$;$/gm, () => 'END $$;');

export function assertSqlSyntaxArtifacts(root = process.cwd()) {
  const read = (path) => readFileSync(resolve(root,path),'utf8');
  const oldManifest = JSON.parse(read(`${archive}/batch-1.8-addendum-manifest.json`));
  const manifest = JSON.parse(read('docs/review/batch-1.8-addendum-manifest.json'));
  for (const path of paths) {
    const original = read(`${archive}/${path.split('/').at(-1)}`), current = read(path);
    assert.equal(hash(original), oldManifest.artifacts[path], `Historical fixture changed: ${path}`);
    assert.equal(current, repaired(original), `Correction changed more than broken delimiters: ${path}`);
    assert.doesNotMatch(current, /^DO \$ BEGIN$|^END \$;$/m);
  }
  for (const [path, expected] of Object.entries(manifest.artifacts)) assert.equal(hash(read(path)), expected, `Hash differs: ${path}`);
  const body = (text) => text.split('-- B18_PRESERVED_REVIEW_BODY_BEGIN')[1].split('-- B18_PRESERVED_REVIEW_BODY_END')[0];
  assert.equal(body(read(paths[0])), body(read(paths[1])));
  return { read, paths };
}

export async function verifySqlSyntax({ root, directory, run, psql, connection, allow }) {
  const { read } = assertSqlSyntaxArtifacts(root);
  const review = read('docs/review/batch-1.8-variants.sql');
  const candidate = read(paths[0]), production = read(paths[1]);
  const original = read(`${archive}/batch-1.8-production-candidate.sql`);
  const badBlock = original.slice(original.lastIndexOf('\nDO $ BEGIN'), original.lastIndexOf('SET CONSTRAINTS ALL IMMEDIATE;'));
  assert.match(badBlock,/B18_CATEGORY_DELETION_NOT_PROTECTED/);
  const args = [...connection,'-v','VERBOSITY=verbose'];
  const file = (name, sql) => { const path=join(directory,name); writeFileSync(path,name.endsWith('.ps1') ? '\ufeff'+sql : sql); return path; };
  const failure = async (work, state, guard) => {
    let output=''; try { await work(); } catch (error) { output=String(error); }
    assert.match(output,new RegExp(`\\b${state}\\b`),'Expected PostgreSQL error was not observed');
    if (guard) assert.ok(output.includes(guard),'Expected guard did not reject');
  };

  // Reproduce the exact archived postcheck AFTER the unchanged variant DDL.
  // This isolates the original 42601 and proves the pending DDL rolls back.
  await failure(() => run(psql,[...args,...allow,'-f',file('syntax-original.sql',review.replace(/COMMIT;\s*$/,()=>badBlock+'\nCOMMIT;\n'))]),'42601');
  const baseline = await run(psql,[...args,'-At','-c',`SELECT to_regclass('public."ProductVariant"') IS NULL
    AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='materials')
    AND EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Category_parentId_fkey' AND conrelid='public."Category"'::regclass AND confdeltype='n')`]);
  assert.equal(baseline.trim(),'t');
  console.log('PASS SQL syntax 1: exact archived category postcheck reproduces 42601 after variant DDL; all DDL rolls back, including Materials and category RESTRICT.');

  const target = connection.at(-1);
  const variables = ['-v',`expected_database=${target}`,'-v','connection_role=batch18_qa','-v','application_role=batch18_qa','-v','migration_role=batch18_qa'];
  await failure(() => run(psql,[...args,...variables,'-f',resolve(root,archive,'batch-1.8-production-verify.sql')]),'42601');
  console.log('PASS SQL syntax 2: complete archived read-only verification file reproduces its mismatched-dollar 42601.');

  // Load only reviewed function definitions, not the operator main/prompt/clients.
  const assembled=join(directory,'runner-settings.sql'), operator=resolve(root,'scripts/operator/batch18-rehearse.ps1');
  const literal = (text) => "'"+text.replaceAll("'","''")+"'";
  const assembly=file('assemble-runner.ps1',`$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${literal(operator)},[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Operator parse failure'}
foreach($definition in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){. ([scriptblock]::Create($definition.Extent.Text))}
$script:Baseline='restore_3dkid_batch18'
$script:OwnedDatabases=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$fixture='batch18_rehearsal_'+('e'*32); [void]$script:OwnedDatabases.Add($fixture)
function Invoke-CloneSql([string]$Database,[string]$Sql,[object[]]$SourceMap){[IO.File]::WriteAllText(${literal(assembled)},$Sql,[Text.UTF8Encoding]::new($false))}
Invoke-Candidate $fixture ('a'*32) 'SELECT 1;'
`);
  await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',assembly]);
  await run(psql,[...args,'-f',assembled]);
  console.log('PASS SQL syntax 3: SQL assembled by the actual Invoke-Candidate client-settings function executes; the runner was not the delimiter source.');

  await run(psql,[...args,...allow,'-f',resolve(root,'docs/review/batch-1.8-variants.sql')]);
  const marker='-- B18_PRESERVED_REVIEW_BODY_END';
  const tail=(sql)=>sql.slice(sql.indexOf(marker)+marker.length);
  await run(psql,[...args,'-f',file('candidate-postchecks.sql','BEGIN;\nSET LOCAL search_path=pg_catalog;\n'+tail(candidate))]);
  const counts=production.slice(production.lastIndexOf('DO $$ BEGIN',production.indexOf('-- B18_PRESERVED_REVIEW_BODY_BEGIN')),production.indexOf('-- B18_PRESERVED_REVIEW_BODY_BEGIN'));
  assert.match(counts,/set_config\('batch18.before_counts'/);
  await run(psql,[...args,'-f',file('production-postchecks.sql','BEGIN;\nSET LOCAL search_path=pg_catalog;\n'+counts+tail(production))]);
  console.log('PASS SQL syntax 4: exact corrected candidate and Production postcheck sections execute with count/data/category guards and final constraint flush/COMMIT.');

  await run(psql,[...args,...variables,'-f',resolve(root,'docs/release/batch-1.8-production-verify.sql')]);
  console.log('PASS SQL syntax 5: complete corrected read-only Production verification file succeeds on the expanded private synthetic schema.');

  const category=candidate.slice(candidate.lastIndexOf('\nDO $$ BEGIN'),candidate.lastIndexOf('SET CONSTRAINTS ALL IMMEDIATE;'));
  await failure(()=>run(psql,[...args,'-f',file('category-guard-rejection.sql','BEGIN;\nALTER TABLE public."Category" DROP CONSTRAINT "Category_parentId_fkey";\n'+category+'\nCOMMIT;\n')]),'P0001','B18_CATEGORY_DELETION_NOT_PROTECTED');
  const restored=await run(psql,[...args,'-At','-c',`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Category_parentId_fkey' AND conrelid='public."Category"'::regclass AND confdeltype='r' AND convalidated)`]);
  assert.equal(restored.trim(),'t');
  console.log('PASS SQL syntax 6: category postcheck still rejects missing RESTRICT protection; failed test transaction restores the FK.');
}
