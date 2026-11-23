// REVIEW ONLY. Creates its OWN disposable PostgreSQL 18 cluster; synthetic data only.
// Never imports .env or accepts an existing DATABASE_URL. No db push/client generation.
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { verifySqlSyntax } from "./verify-batch18-sql-syntax.mjs";

const root = process.cwd();
const bin = "C:/Program Files/PostgreSQL/18/bin";
const directory = mkdtempSync(join(tmpdir(), "batch18-variant-review-"));
const data = join(directory, "data");
const marker = randomBytes(24).toString("hex");
const database = `batch18_review_${randomBytes(8).toString("hex")}`;
writeFileSync(join(directory, "qa-marker"), marker);
const env = { ...process.env, DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/not_used" };
for (const name of Object.keys(env)) if (name.startsWith("PG") || name.startsWith("BATCH18_")) delete env[name];
writeFileSync(join(directory, "empty.pgpass"), "");
env.PGPASSFILE = join(directory, "empty.pgpass");
env.PGSSLMODE = "disable";
function run(executable, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd: directory, env, windowsHide: true, ...options });
    let output = "";
    child.stdout?.on("data", (part) => { output += part; });
    child.stderr?.on("data", (part) => { output += part; });
    child.on("error", fail);
    child.on("close", (code) => code === 0 ? done(output) : fail(new Error(`${executable} exited ${code}: ${output}`)));
  });
}
const exe = (name) => join(bin, `${name}.exe`);
const prisma = resolve(root, "node_modules/prisma/build/index.js");
let started = false;
try {
  const version = await run(exe("postgres"), ["--version"]);
  if (!/PostgreSQL\) 18\./.test(version)) throw new Error("PostgreSQL 18 required");
  console.log(version.trim());
  const head = (await run("git", ["-C", root, "rev-parse", "HEAD"])).trim();
  if (head !== "76621cf01ebe482bfee9a80aaed4a4b5b9dfed22") throw new Error("Unexpected review baseline");
  const baseline = await run("git", ["-C", root, "show", `${head}:prisma/schema.prisma`]);
  const modelText = (text) => text.replaceAll("\r\n", "\n").split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  if (modelText(readFileSync(resolve(root, "prisma/schema.prisma"), "utf8")) !== modelText(readFileSync(resolve(root,"docs/review/batch-1.8-variants.prisma"),"utf8"))) throw new Error("Actual and review model differ");
  const baselineFile = join(directory, "baseline.prisma");
  const proposalFile = join(directory, "proposal.prisma");
  writeFileSync(baselineFile, baseline);
  writeFileSync(proposalFile, readFileSync(resolve(root, "docs/review/batch-1.8-variants.prisma")));
  console.log((await run(process.execPath, [prisma, "validate", "--schema", proposalFile])).trim());
  const baselineSql = await run(process.execPath, [prisma, "migrate", "diff", "--from-empty", "--to-schema-datamodel", baselineFile, "--script"]);
  writeFileSync(join(directory, "baseline.sql"), baselineSql);
  const reviewSql = readFileSync(resolve(root, "docs/review/batch-1.8-variants.sql"), "utf8");
  if (!reviewSql.startsWith("-- NOT APPROVED FOR PRODUCTION EXECUTION.")) throw new Error("Missing safety notice");
  writeFileSync(join(directory, "rollback.sql"), reviewSql.replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;\n"));
  await run(exe("initdb"), ["-D", data, "-U", "batch18_qa", "--auth=trust", "--locale=C", "--encoding=UTF8"]);
  const server = createServer();
  await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  await run(exe("pg_ctl"), ["-D", data, "-l", join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${port} -c max_connections=20`, "-w", "start"], { stdio: "ignore" });
  started = true;
  const connection = ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "batch18_qa", "-d", "postgres"];
  for (const name of [database, `${database}0`, `${database}a`, `${database}b`, `${database}c`]) {
    await run(exe("psql"), [...connection, "-c", `CREATE DATABASE ${name}`]);
    const local = [...connection]; local[local.length - 1] = name;
    await run(exe("psql"), [...local, "-f", join(directory, "baseline.sql")]);
  }
  const primary = [...connection]; primary[primary.length - 1] = database;
  const rollback = [...connection]; rollback[rollback.length - 1] = `${database}0`;
  const allow = ["-c", "SET batch18.disposable_review='synthetic-fixtures-only'"];
  const syntax = [...connection]; syntax[syntax.length - 1] = `${database}c`;
  await verifySqlSyntax({ root, directory, run, psql: exe("psql"), connection: syntax, allow });
  // This MUST fail before any DDL, even on our owned cluster, without the sentinel.
  let guardRejected = false;
  try { await run(exe("psql"), [...primary, "-f", resolve(root, "docs/review/batch-1.8-variants.sql")]); }
  catch (error) { if (!String(error).includes("disposable local fixture guard failed")) throw error; guardRejected = true; }
  if (!guardRejected) throw new Error("DDL guard failed open");
  let rolledBack = false;
  try { await run(exe("psql"), [...rollback, ...allow, "-f", join(directory, "rollback.sql")]); }
  catch (error) { if (!String(error).includes("division by zero")) throw error; rolledBack = true; }
  if (!rolledBack) throw new Error("Rollback injection did not fail");
  const rollbackEvidence = await run(exe("psql"), [...rollback, "-At", "-c", `SELECT to_regclass('public."ProductVariant"') IS NULL AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='optionMode') AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ProductOptionMode') AND (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')=14`]);
  if (rollbackEvidence.trim() !== "t") throw new Error("DDL did not roll back fully");
  console.log("PASS actual PostgreSQL execution guard + injected DDL transaction rollback (14-table synthetic baseline intact).");
  // Seed legacy-only fixtures BEFORE expansion to check defaults and unchanged snapshots.
  writeFileSync(join(directory, "legacy-fixtures.sql"), `INSERT INTO "Category" (id,name,"nameEn",slug) VALUES ('qa_category','QA','QA','qa'); INSERT INTO "Product" (id,name,slug,description,price,"categoryId","updatedAt","isOrderable") VALUES ('legacy_simple','Legacy simple','legacy-simple','QA',123.45,'qa_category',now(),true),('legacy_size','Legacy size','legacy-size','QA',99,'qa_category',now(),true); INSERT INTO "ProductOption" (id,"productId",name) VALUES ('legacy_group','legacy_size','Розмір'); INSERT INTO "ProductOptionValue" (id,"optionId",value,"valueEn",price,"priceModifier") VALUES ('legacy_small','legacy_group','Маленький','Small',199.00,987.65),('legacy_unpriced','legacy_group','Old',NULL,NULL,50);
    INSERT INTO "Order" (id,"customerName","customerEmail","customerPhone","shippingAddress",city,"postalCode","paymentMethod",subtotal,total) VALUES ('before_order','Synthetic QA','qa@example.invalid','000','QA','QA','000','cod',398,398);
    INSERT INTO "OrderItem" (id,"orderId","productId","productName","optionsJson",price,quantity) VALUES ('before_v1','before_order','legacy_size','Before expansion','{"version":1,"size":{"id":"legacy_small","labelUa":"Маленький","labelEn":"Small"}}',199,1),('before_flat','before_order','legacy_size','Before expansion','{"Size":"Historical small"}',199,1);`);
  await run(exe("psql"), [...primary, "-f", join(directory, "legacy-fixtures.sql")]);  await run(exe("psql"), [...primary, ...allow, "-f", resolve(root, "docs/review/batch-1.8-variants.sql")]);
  const url = `postgresql://batch18_qa@127.0.0.1:${port}/${database}?schema=public&connection_limit=3`;
  const drift = await run(process.execPath, [prisma, "migrate", "diff", "--from-url", url, "--to-schema-datamodel", proposalFile, "--script"]);
  if (!drift.includes("This is an empty migration")) throw new Error(`Prisma relational drift: ${drift}`);
  console.log("PASS applied proposal has empty Prisma 5 relational diff; CHECKs/triggers/deferrability are separately asserted by SQL tests.");
  process.stdout.write(await run(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), resolve(root, "scripts/verify-batch18-postgres.ts")], {
    cwd: root, env: { ...env, BATCH18_QA_DATABASE_URL: url, BATCH18_QA_CLUSTER_DIR: directory, BATCH18_QA_MARKER: marker },
  }));
  // Combined addendum on fresh synthetic baseline databases, including the
  // manually maintained checkout CHECK absent from Prisma's datamodel.
  const seed = `INSERT INTO public."Category" (id,name,"nameEn",slug) VALUES ('addendum_baseline_category','Synthetic','Synthetic','addendum-baseline');
    INSERT INTO public."Product" (id,name,slug,description,price,"categoryId","updatedAt")
    SELECT 'addendum_baseline_'||i,'Synthetic '||i,'addendum-baseline-'||i,'Unchanged paragraph '||i||E'\\n\\nOriginal materials remain here',(101+i)+0.25,'addendum_baseline_category',now() FROM generate_series(0,4) i;`;
  const acceptance = readFileSync(resolve(root, "prisma/changes/batch-1-7-4a-checkout-acceptance.sql"),"utf8").match(/ALTER TABLE "Order" ADD CONSTRAINT "Order_checkout_acceptance_check" CHECK \([\s\S]*?\);/)?.[0];
  if (!acceptance) throw new Error("Checkout acceptance CHECK missing");
  writeFileSync(join(directory,"addendum-baseline.sql"),acceptance+"\n"+seed);
  for (const suffix of ["a","b"]) {
    const args=[...connection];args[args.length-1]=`${database}${suffix}`;
    await run(exe("psql"),[...args,"-f",join(directory,"addendum-baseline.sql")]);
    if(suffix==="b") {
      let failed=false;
      try {await run(exe("psql"),[...args,...allow,"-f",join(directory,"rollback.sql")]);}
      catch(error){if(!String(error).includes("division by zero"))throw error;failed=true;}
      if(!failed)throw new Error("Combined rollback did not fail");
      const evidence=await run(exe("psql"),[...args,"-At","-c",`SELECT (SELECT count(*) FROM public."Product" WHERE id LIKE 'addendum_baseline_%')=5
        AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name IN ('materials','materialsEn','materialsDivider','optionMode'))
        AND EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Category_parentId_fkey' AND conrelid='public."Category"'::regclass AND confdeltype='n')
        AND to_regclass('public."ProductVariant"') IS NULL`]);
      if(evidence.trim()!=="t")throw new Error("Combined fields/hierarchy rollback failed");
      console.log("PASS combined migration rollback restores Materials absence, SET NULL baseline FK and five synthetic products.");
    } else {
      await run(exe("psql"),[...args,...allow,"-f",resolve(root,"docs/review/batch-1.8-variants.sql")]);
      const addonUrl=`postgresql://batch18_qa@127.0.0.1:${port}/${database}a?schema=public&connection_limit=3`;
      process.stdout.write(await run(process.execPath,[resolve(root,"node_modules/tsx/dist/cli.mjs"),resolve(root,"scripts/verify-batch18-addendum-postgres.ts")],{
        cwd:root,env:{...env,BATCH18_QA_DATABASE_URL:addonUrl,BATCH18_QA_CLUSTER_DIR:directory,BATCH18_QA_MARKER:marker},
      }));
    }
  }
} finally {
  // Stop ONLY the newly initialized cluster, including partial-start failures.
  if ((started || existsSync(join(data, "postmaster.pid"))) && readFileSync(join(directory, "qa-marker"), "utf8") === marker)
    await run(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
  console.log(`Private synthetic rehearsal directory retained: ${directory}. Cluster stopped; no existing service targeted.`);
}
