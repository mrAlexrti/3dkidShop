import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import bcrypt from "bcryptjs";
import { devConnection, localMarker, neonDev, prismaDevUrl } from "../../src/lib/dev-target.mjs";
import { assertLocalTooling } from "../../src/lib/environment.mjs";
import { browserSmoke } from "./smoke.mjs";

const root = resolve(import.meta.dirname, "../..");
const devFiles = join(root, "scripts", "development");
const releases = join(root, "docs", "release");
const pgBin = process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : process.env.OPS02_PG_BIN;
const pg = name => pgBin ? join(pgBin, name + (process.platform === "win32" ? ".exe" : "")) : name;
const next = join(root, "node_modules", "next", "dist", "bin", "next");
const preload = join(devFiles, "sandbox.cjs").replaceAll("\\", "/");
const cartRelease = "ux-09-10-customer-cart";
const cartSha = "64a946df5ff64ff25a2af3ab840c41ec99507f45be5f48faac63a619dacd8187";
const sqlLiteral = value => "'" + value.replaceAll("'", "''") + "'";
const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(SystemRoot|WINDIR|COMSPEC|PATH|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|LANG)$/i.test(key)));
const readSql = file => readFileSync(file, "utf8").replaceAll("\r\n", "\n");
const assert = (condition, code) => { if (!condition) throw new Error(code); };

function readDevTargets() {
  assert(process.env.LOCALAPPDATA, "OPS02_DEV_CREDENTIALS_LOCATION_REQUIRED");
  const dir = join(process.env.LOCALAPPDATA, "3dkid-dev");
  const file = join(dir, "database.env");
  const ca = join(dir, "cacert.pem").replaceAll("\\", "/");
  assert(existsSync(file) && existsSync(ca) && statSync(ca).isFile(), "OPS02_DEV_CREDENTIALS_OR_CA_MISSING");
  const values = new Map();
  for (const line of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const entry = /^\s*(DEV_DATABASE_(?:OWNER|APP)_URL)\s*=\s*(.*?)\s*$/.exec(line);
    assert(entry && !values.has(entry[1]), "OPS02_AMBIGUOUS_DEV_CREDENTIALS");
    let value = entry[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values.set(entry[1], value);
  }
  assert(values.size === 2, "OPS02_TWO_DEV_CONNECTIONS_REQUIRED");
  return { owner: devConnection(values.get("DEV_DATABASE_OWNER_URL"), "owner"),
    app: devConnection(values.get("DEV_DATABASE_APP_URL"), "app"), ca, marker: neonDev.marker };
}

function execute(binary, args, { input, env = safeEnv, tolerateFailure = false, reportSqlState = false, capture = true } = {}) {
  const result = spawnSync(binary, args, { cwd: root, env, input, encoding: "utf8", windowsHide: true,
    maxBuffer: 12 * 1024 * 1024, ...(capture ? {} : { stdio: "ignore" }) });
  if (result.error || result.status !== 0) {
    if (tolerateFailure) return null;
    const fixed = /\bOPS02_[A-Z_]+\b/.exec(result.stderr ?? "")?.[0];
    const sqlState = /ERROR:\s+([A-Z0-9]{5}):/.exec(result.stderr ?? "")?.[1];
    throw new Error(fixed ?? (reportSqlState && sqlState ? "OPS02_POSTGRES_SQLSTATE_" + sqlState : "OPS02_COMMAND_FAILED_" + binary.split(/[\\/]/).at(-1)));
  }
  return result.stdout ?? "";
}

function pgEnv(target, ca) {
  return { ...safeEnv, PGHOST: target.host, PGPORT: target.port, PGDATABASE: target.database, PGUSER: target.user,
    PGPASSWORD: target.password, PGSSLMODE: ca ? "verify-full" : "disable", PGGSSENCMODE: "disable",
    ...(ca ? { PGSSLROOTCERT: ca } : {}),
    PGAPPNAME: "3dkid-ops02", PGCONNECT_TIMEOUT: "15", PGCLIENTENCODING: "UTF8" };
}

function connect(target, ca, sql) {
  try {
    return execute(pg("psql"), ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
      { input: sql, env: pgEnv(target, ca), reportSqlState: true }).trim();
  } catch (error) {
    if (error.message.startsWith("OPS02_COMMAND_FAILED")) throw new Error(target.user === "app_3dkid" ? "OPS02_POOLED_APP_CONNECTION_FAILED" : "OPS02_DIRECT_OWNER_CONNECTION_FAILED");
    throw error;
  }
}

function identity(target, marker, allowEmpty = false) {
  const app = target.user === "app_3dkid";
  return [
    "DO $$ BEGIN",
    " IF current_database() <> " + sqlLiteral(target.database) + " OR current_user <> " + sqlLiteral(target.user) + " OR session_user <> current_user THEN RAISE EXCEPTION 'OPS02_DATABASE_IDENTITY_MISMATCH'; END IF;",
    ...(app ? [
      " IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication))",
      " OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='neon_superuser' AND pg_has_role(current_user,oid,'MEMBER'))",
      " OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('neondb_owner','ops02_owner') AND pg_has_role(current_user,oid,'MEMBER'))",
      " OR has_schema_privilege(current_user,'public','CREATE')",
      " OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','ops02_guard') AND pg_get_userbyid(c.relowner)=current_user)",
      " THEN RAISE EXCEPTION 'OPS02_APP_ROLE_ELEVATED'; END IF;",
    ] : []),
    " IF to_regclass('ops02_guard.identity') IS NULL THEN",
    ...(allowEmpty ? [
      " IF to_regnamespace('ops02_guard') IS NOT NULL OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S'))",
      " OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')",
      " OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d'))",
      " THEN RAISE EXCEPTION 'OPS02_UNMARKED_DATABASE_NOT_EMPTY'; END IF;",
    ] : [" RAISE EXCEPTION 'OPS02_DEVELOPMENT_MARKER_REQUIRED';"]),
    " ELSIF NOT EXISTS (SELECT 1 FROM ops02_guard.identity WHERE singleton AND value=" + sqlLiteral(marker) + ") THEN",
    " RAISE EXCEPTION 'OPS02_DEVELOPMENT_MARKER_MISMATCH';",
    " END IF;",
    " END $$;",
  ].join("\n");
}

function inspect(targets, allowEmpty = false, appOnly = false) {
  for (const target of appOnly ? [targets.app] : [targets.owner, targets.app]) {
    const state = connect(target, targets.ca, "BEGIN READ ONLY;\n" + identity(target, targets.marker, allowEmpty) +
      "\nSELECT CASE WHEN to_regclass('ops02_guard.identity') IS NULL THEN 'EMPTY' ELSE 'MARKED' END;\nCOMMIT;");
    console.log((target.user === "app_3dkid" ? "APP " : "OWNER ") + (targets.ca ? "TLS verify-full " : "loopback ") + state);
  }
}

function ownerSql(targets, sql) {
  return connect(targets.owner, targets.ca, "SET statement_timeout='90s'; SET lock_timeout='5s';\n" +
    identity(targets.owner, targets.marker) + "\n" + sql);
}

function artifact(path, checksum, directory) {
  const file = realpathSync(resolve(root, path));
  if (directory) {
    const locator = relative(directory, file);
    assert(locator && !locator.startsWith(".." + sep) && locator !== ".." && resolve(directory, locator) === file, "OPS02_RELEASE_PATH_REJECTED");
  }
  assert(file.endsWith(".sql"), "OPS02_SQL_FILE_REQUIRED");
  const bytes = readFileSync(file);
  if (checksum) assert(createHash("sha256").update(bytes).digest("hex") === checksum, "OPS02_SQL_CHECKSUM_MISMATCH");
  const sql = bytes.toString("utf8");
  for (const line of sql.split(/\r?\n/)) {
    assert(!line.includes("\\") || /^\s*\\set ON_ERROR_STOP on\s*$/.test(line), "OPS02_SQL_META_COMMAND_REJECTED");
  }
  return sql;
}

function bootstrap(targets) {
  // The endpoint and both roles are independently verified before any bootstrap DDL.
  inspect(targets, true);
  const baseline = readSql(join(devFiles, "baseline-pre-cart.sql"));
  const ready = connect(targets.owner, targets.ca, "BEGIN;\nSELECT pg_advisory_xact_lock(731502);\n" +
    identity(targets.owner, targets.marker, true) +
    "\nSELECT to_regclass('ops02_guard.identity') IS NULL AS ops02_bootstrap\n\\gset\n\\if :ops02_bootstrap\n" +
    baseline + "\nREVOKE CREATE ON SCHEMA public FROM PUBLIC;\n" +
    "CREATE SCHEMA ops02_guard;\nCREATE TABLE ops02_guard.identity(singleton boolean PRIMARY KEY CHECK(singleton),value text NOT NULL);\n" +
    "INSERT INTO ops02_guard.identity VALUES(true," + sqlLiteral(targets.marker) + ");\n" +
    "REVOKE ALL ON SCHEMA ops02_guard FROM PUBLIC;\nGRANT USAGE ON SCHEMA ops02_guard TO app_3dkid;\n" +
    "GRANT SELECT ON ops02_guard.identity TO app_3dkid;\n\\endif\nCOMMIT;\n" +
    "SELECT CASE WHEN to_regclass('public.\"CustomerCart\"') IS NULL THEN 'APPLY_CART' ELSE 'VERIFY_CART' END;");
  if (ready === "APPLY_CART") {
    ownerSql(targets, readSql(join(releases, cartRelease + "-preflight.sql")));
    ownerSql(targets, "SET ux0910.reviewed_execution='customer-cart-reviewed';\n" +
      artifact(join(releases, cartRelease + ".sql"), cartSha, releases));
  }
  ownerSql(targets, readSql(join(releases, cartRelease + "-verify.sql")));
  verify(targets);
}

function seed(targets, count) {
  assert([100, 500, 1000].includes(count), "OPS02_DATASET_SIZE_REJECTED");
  const hash = bcrypt.hashSync("3dkid-dev-customer-only!", "$2a$12$......................");
  console.log(ownerSql(targets, readSql(join(devFiles, "seed.sql")).replaceAll("__PRODUCT_COUNT__", String(count))
    .replaceAll("__CUSTOMER_PASSWORD_HASH__", hash)));
}

function verify(targets) {
  inspect(targets);
  const schema = ownerSql(targets, readSql(join(devFiles, "verify.sql")));
  const grants = connect(targets.app, targets.ca, identity(targets.app, targets.marker) + "\n" + readSql(join(devFiles, "verify-app.sql")));
  console.log(schema);
  console.log(grants);
}

function reset(targets) {
  ownerSql(targets, readSql(join(devFiles, "reset.sql")));
  console.log("DEV data reset. Schema and environment marker preserved.");
}

async function freePort() {
  const socket = createServer();
  await new Promise((done, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", done); });
  const port = String(socket.address().port);
  await new Promise(done => socket.close(done));
  return port;
}

async function localTargets() {
  const dir = mkdtempSync(join(tmpdir(), "3dkid-ops02-"));
  const data = join(dir, "data");
  const port = await freePort();
  const database = "ops02_" + randomBytes(16).toString("hex");
  const owner = { host: "127.0.0.1", user: "ops02_owner", port, database, password: "" };
  execute(pg("initdb"), ["-D", data, "-U", owner.user, "--auth=trust", "--locale=C", "--encoding=UTF8"]);
  execute(pg("pg_ctl"), ["-D", data, "-l", join(dir, "postgres.log"), "-o", "-h 127.0.0.1 -p " + port, "-w", "start"], { capture: false });
  const stop = () => execute(pg("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { tolerateFailure: true });
  try {
    connect({ ...owner, database: "postgres" }, undefined,
      "CREATE ROLE app_3dkid LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;\nCREATE DATABASE " + database + ";");
    return { owner, app: { ...owner, user: "app_3dkid" }, marker: localMarker, dir, stop };
  } catch (error) { stop(); throw error; }
}

function appEnv(targets, port, sandbox = true) {
  const origin = "http://127.0.0.1:" + port;
  const mode = targets.ca ? "neon" : "local";
  const url = targets.ca ? prismaDevUrl(targets.app, targets.ca) :
    "postgresql://app_3dkid@127.0.0.1:" + targets.app.port + "/" + targets.app.database;
  const preloader = sandbox ? preload : join(devFiles, "no-dotenv.cjs").replaceAll("\\", "/");
  return { ...safeEnv, OPS02_MODE: mode,
    NODE_OPTIONS: "--use-system-ca --require " + JSON.stringify(preloader),
    DATABASE_URL: url, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: origin, SITE_URL: origin, AUTH_URL: origin,
    CUSTOMER_AUTH_ORIGIN: origin, AUTH_SECRET: randomBytes(32).toString("hex"), CUSTOMER_AUTH_SECRET: randomBytes(32).toString("hex"),
    ADMIN_USERNAME: "dev-admin", ADMIN_PASSWORD_HASH: bcrypt.hashSync("3dkid-dev-admin-only!", "$2a$10$......................"),
    ONLINE_PAYMENT_MODE: "disabled", PRODUCT_MEDIA_CLEANUP_ENABLED: "false", PRODUCT_VARIANTS_ENABLED: "true",
    ...(sandbox ? { OPS02_SANDBOX: "1", OPS02_MAIL_DIR: targets.dir ?? mkdtempSync(join(tmpdir(), "3dkid-ops02-mail-")),
      RESEND_API_KEY: "ops02-capture-only", EMAIL_FROM: "3D kid DEV <dev@example.test>", NP_API_KEY: "ops02-mock-only" } : {}),
  };
}

async function runApp(targets, args, mode = "dev") {
  inspect(targets, false, true);
  const port = args[0] ?? "3000";
  assert(args.length <= 1 && /^\d{4,5}$/.test(port) && Number(port) <= 65535, "OPS02_PORT_REJECTED");
  const env = appEnv(targets, port);
  console.log("OPS-02 " + env.OPS02_MODE + " on loopback port " + port + ". Captured email: " + env.OPS02_MAIL_DIR);
  const nextArgs = mode === "build" ? [next, mode] : [next, mode, "--hostname", "127.0.0.1", "--port", port];
  const child = spawn(process.execPath, nextArgs, { cwd: root, env, stdio: "inherit", windowsHide: true });
  let stopping = false;
  const stop = () => { stopping = true; if (child.exitCode === null) child.kill(); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", done); });
    if (!stopping && code !== 0) throw new Error("OPS02_APPLICATION_EXITED_" + code);
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
}

async function waitForApp(origin, child) {
  let ready = false;
  for (let n = 0; n < 200 && !ready && child.exitCode === null; n++) {
    try { ready = (await fetch(origin + "/robots.txt", { signal: AbortSignal.timeout(3000) })).ok; } catch { /* Wait for startup. */ }
    if (!ready) await new Promise(done => setTimeout(done, 150));
  }
  assert(ready, "OPS02_SMOKE_APP_STARTUP_FAILED");
}

async function smoke(targets) {
  function orderCount() {
    const count = connect(targets.app, targets.ca, "BEGIN READ ONLY;\n" + identity(targets.app, targets.marker) +
      "\nSELECT count(*) FROM public.\"Order\" WHERE \"customerId\"='ops02_customer' AND \"customerName\"='Synthetic Recipient' AND \"checkoutAcceptance\"='ACCEPTED';\nCOMMIT;");
    assert(/^\d+$/.test(count), "OPS02_SMOKE_INVALID_ORDER_COUNT");
    return Number(count);
  }
  const countBefore = orderCount();
  const port = await freePort();
  const env = appEnv(targets, port);
  const child = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", port],
    { cwd: root, env, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  const finished = new Promise(done => child.once("close", done));
  try {
    await waitForApp(env.SITE_URL, child);
    await browserSmoke(env.SITE_URL, process.env.OPS02_EDGE_BIN);
    assert(orderCount() === countBefore + 1, "OPS02_SMOKE_EXPECTED_ONE_SYNTHETIC_ORDER");
    console.log("Restricted-role query confirmed a durable synthetic order.");
  } finally {
    if (child.exitCode === null) child.kill();
    await finished;
  }
}

async function ordinaryRehearsal(targets) {
  const npmCli = process.env.npm_execpath;
  assert(npmCli && /[/\\]npm-cli\.js$/i.test(npmCli), "OPS02_ORDINARY_REHEARSAL_REQUIRES_NPM");
  const port = await freePort();
  const env = appEnv(targets, port, false);
  const counts = () => connect(targets.app, undefined, "BEGIN READ ONLY;\n" + identity(targets.app, targets.marker) +
    '\nSELECT count(*) FROM public."Product"; SELECT count(*) FROM public."User"; SELECT count(*) FROM public."Order"; COMMIT;');
  const before = counts();
  assert(before === "0\n0\n0" || before === "0\r\n0\r\n0", "OPS02_ORDINARY_DATABASE_ALREADY_SEEDED");
  console.log(execute(process.execPath, [npmCli, "run", "build"], { env }));
  const child = spawn(process.execPath, [npmCli, "start", "--", "--hostname", "127.0.0.1", "--port", port],
    { cwd: root, env, stdio: "inherit", windowsHide: true, detached: process.platform !== "win32" });
  child.on("error", () => {});
  const finished = new Promise(done => child.once("close", done));
  try {
    await waitForApp(env.SITE_URL, child);
    for (const path of ["/", "/catalog", "/favicon-96.png"]) {
      const response = await fetch(env.SITE_URL + path, { signal: AbortSignal.timeout(15000) });
      assert(response.ok, "OPS02_ORDINARY_STORE_RESPONSE");
      await response.arrayBuffer();
    }
    assert(counts() === before, "OPS02_ORDINARY_STARTUP_MUTATED_FIXTURES");
    console.log("PASS standard npm build and start, restricted local datasource, storefront HTTP 200, zero implicit seeds or provider mocks.");
  } finally {
    if (child.pid && child.exitCode === null) {
      if (process.platform === "win32") execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { tolerateFailure: true });
      else {
        try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
    await finished;
  }
}

const [command = "dev", ...args] = process.argv.slice(2);
try {
  assertLocalTooling(process.env);
  if (command === "regression") {
    const noDotenv = join(devFiles, "no-dotenv.cjs").replaceAll("\\", "/");
    const result = spawnSync(process.execPath, [join(root, "scripts", "rehearse-batch19-customer-account.mjs"), "--commerce-regression", "--ux07", "--seo01", "--brand01a"],
      { cwd: root, env: { ...safeEnv, NODE_OPTIONS: "--require " + JSON.stringify(noDotenv) }, stdio: "inherit" });
    assert(!result.error && result.status === 0, "OPS02_REGRESSION_FAILED");
  } else if (["local", "local-start", "local-verify", "local-smoke", "build", "ordinary-rehearsal"].includes(command)) {
    const targets = await localTargets();
    try {
      bootstrap(targets);
      if (command !== "ordinary-rehearsal") seed(targets, 100);
      if (command === "ordinary-rehearsal") await ordinaryRehearsal(targets);
      else if (command === "local" || command === "local-start") await runApp(targets, args, command === "local" ? "dev" : "start");
      else if (command === "build") await runApp(targets, [], "build");
      else if (command === "local-smoke") await smoke(targets);
      else {
        let wrongMarkerRejected = false;
        try { connect(targets.app, targets.ca, identity(targets.app, "not-a-development-marker")); }
        catch (error) { wrongMarkerRejected = error.message === "OPS02_DEVELOPMENT_MARKER_MISMATCH"; }
        assert(wrongMarkerRejected, "OPS02_EXPECTED_WRONG_MARKER_REJECTION");
        console.log("Invalid DEV marker rejected");
        seed(targets, 100);
        reset(targets);
        seed(targets, 100);
        verify(targets);
        const noDotenv = join(devFiles, "no-dotenv.cjs").replaceAll("\\", "/");
        const cli = join(root, "node_modules", "prisma", "build", "index.js");
        const database = "postgresql://ops02_owner@127.0.0.1:" + targets.owner.port + "/" + targets.owner.database;
        const options = { env: { ...safeEnv, DATABASE_URL: database, NODE_OPTIONS: "--require " + JSON.stringify(noDotenv) } };
        execute(process.execPath, [cli, "validate"], options);
        execute(process.execPath, [cli, "migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], options);
        console.log("Prisma validate and public schema diff PASS");
      }
    } finally { targets.stop(); }
  } else {
    const targets = readDevTargets();
    if (command === "probe") inspect(targets, args[0] === "--before-bootstrap");
    else if (command === "bootstrap") bootstrap(targets);
    else if (command === "verify") verify(targets);
    else if (command === "seed") seed(targets, Number(args[0] ?? 100));
    else if (command === "reset") {
      assert(args.length === 1 && args[0] === "DEV-SYNTHETIC", "OPS02_RESET_REQUIRES_DEV_SYNTHETIC");
      reset(targets);
    } else if (command === "migrate") {
      assert(args.length >= 2 && args.length <= 3 && /^[a-f0-9]{64}$/.test(args[1]), "OPS02_REVIEWED_MIGRATION_HASH_REQUIRED");
      assert(!args[2] || /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*=[a-z0-9_-]+$/.test(args[2]), "OPS02_INVALID_MIGRATION_GUARD");
      const [key, guard] = (args[2] ?? "").split("=");
      ownerSql(targets, (key ? "SET " + key + "=" + sqlLiteral(guard) + ";\n" : "") + artifact(args[0], args[1], releases));
      console.log("Reviewed migration applied to verified DEV.");
    } else if (command === "sql") {
      assert(args.length === 1, "OPS02_SQL_FILE_REQUIRED");
      console.log(ownerSql(targets, artifact(args[0])));
    } else if (command === "smoke") {
      inspect(targets, false, true);
      await smoke(targets);
    } else if (command === "dev" || command === "start") await runApp(targets, args, command);
    else throw new Error("OPS02_UNKNOWN_COMMAND");
  }
} catch (error) {
  console.error(/^OPS02_[A-Za-z0-9_-]+$/.test(error?.message) ? error.message : "OPS02_OPERATION_FAILED");
  process.exitCode = 1;
}
