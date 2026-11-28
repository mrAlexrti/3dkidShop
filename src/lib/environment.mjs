import { devConnection, localAppConnection, localMarker, neonDev, prismaDevUrl } from "./dev-target.mjs";

export const providerSandbox = Symbol.for("3dkid.ops02.provider-sandbox");
const liveIntegrationKeys = [
  "MONO_ACQUIRING_TOKEN", "LIQPAY_PUBLIC_KEY", "LIQPAY_PRIVATE_KEY", "RESEND_API_KEY",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET", "NP_API_KEY",
  "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL_BLOB_API_URL", "NEXT_PUBLIC_VERCEL_BLOB_API_URL",
  "VERCEL_BLOB_RETRIES", "BLOB_WEBHOOK_PUBLIC_KEY", "CUSTOMER_GOOGLE_CLIENT_ID", "CUSTOMER_GOOGLE_CLIENT_SECRET",
  "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "CRON_SECRET", "PRODUCT_MEDIA_CLEANUP_SCOPE",
];
const developmentUrls = ["DEV_DATABASE_APP_URL", "DEV_DATABASE_OWNER_URL"];
const mockKeys = ["OPS02_SANDBOX", "OPS02_MAIL_DIR", "BATCH19_MAIL_LOG", "BATCH19_APP_ORIGIN"];
const mockSecrets = new Set(["ops02-capture-only", "ops02-mock-only", "local-mock", "local-mock-only",
  "local-google-id", "local-google-secret", "vercel_blob_rw_ux07fixture_LOCAL_ONLY"]);

/** @param {NodeJS.ProcessEnv} env @param {string} key */
const value = (env, key) => {
  const raw = env[key]?.trim() ?? "";
  return /^".*"$|^'.*'$/.test(raw) ? raw.slice(1, -1).trim() : raw;
};

/** @param {NodeJS.ProcessEnv} env */
function deployment(env) {
  const marker = value(env, "OPS02_DEPLOYMENT");
  const labels = new Set([marker, value(env, "VERCEL_ENV"), value(env, "VERCEL_TARGET_ENV")].filter(Boolean));
  if (labels.size > 1 || [...labels].some(label => label !== "production" && label !== "preview")) {
    throw new Error("OPS02_DEPLOYMENT_IDENTITY_CONFLICT");
  }
  if (labels.has("production")) return "production";
  if (labels.has("preview")) {
    if (marker !== "preview") throw new Error("OPS02_PREVIEW_MARKER_REQUIRED");
    return "preview";
  }
  if (["VERCEL", "VERCEL_URL", "VERCEL_DEPLOYMENT_ID"].some(key => value(env, key))) {
    throw new Error("OPS02_HOSTED_IDENTITY_REQUIRED");
  }
  return undefined;
}

/** @param {NodeJS.ProcessEnv} env */
export function assertLocalTooling(env) {
  if (deployment(env)) throw new Error("OPS02_LOCAL_TOOLING_ON_HOSTED_DEPLOYMENT");
  if (["build", "start", "preinstall", "install", "postinstall"].includes(value(env, "npm_lifecycle_event"))) {
    throw new Error("OPS02_LOCAL_TOOLING_IN_STANDARD_LIFECYCLE");
  }
}

/** @param {string} url */
function validateOrdinaryUrl(url) {
  if (!url) return; // Keep Prisma's original lazy resolution for a build without a database URL.
  try {
    const parsed = new URL(url);
    const host = new URL("http://" + parsed.host).hostname.replace(/\.$/, "").toLowerCase();
    const devEndpoint = neonDev.direct.split(".")[0];
    const localHost = /^(?:localhost|.+\.localhost|127(?:\.|$)|0\.0\.0\.0$|\[::(?:1\]|\]|(?:ffff:)?7f[0-9a-f]{2}:))/i;
    const routed = [...parsed.searchParams.keys()].some(k => /^(host|hostaddr|socket|service)$/i.test(k));
    if (["postgres:", "postgresql:"].includes(parsed.protocol) && host && !host.includes(",") && !parsed.hash && !routed &&
        !localHost.test(host) && ![devEndpoint, devEndpoint + "-pooler"].includes(host.split(".")[0]) &&
        !/^\/(?:ops02_|batch18_review_)/.test(parsed.pathname)) return;
  } catch { /* Report a fixed code, never a URL or a parser exception. */ }
  throw new Error("OPS02_PRODUCTION_DATASOURCE_REJECTED");
}

/** @param {NodeJS.ProcessEnv} env @param {unknown} sandbox */
function isolatedProviders(env, sandbox) {
  if (value(env, "ONLINE_PAYMENT_MODE") !== "disabled" || value(env, "PRODUCT_MEDIA_CLEANUP_ENABLED") !== "false" ||
      value(env, "TEST_MODE") === "1") throw new Error("OPS02_ISOLATED_PROVIDER_CONFIGURATION_REQUIRED");
  for (const key of liveIntegrationKeys) {
    const setting = value(env, key);
    if (!setting) continue;
    const testBlob = sandbox === "regression" && (
      (key === "VERCEL_BLOB_API_URL" && /^http:\/\/127\.0\.0\.1:\d+\/api\/blob$/.test(setting)) ||
      (key === "VERCEL_BLOB_RETRIES" && setting === "0"));
    if (!testBlob && !(sandbox && mockSecrets.has(setting))) throw new Error("OPS02_LIVE_PROVIDER_IN_ISOLATION");
  }
}

/**
 * Validate configuration before constructing a Prisma client or loading route modules.
 * Ordinary applications keep Prisma's schema datasource. Preview alone needs an override.
 * @param {NodeJS.ProcessEnv} env
 * @param {unknown} [sandbox]
 * @returns {{kind: "ordinary"} | {kind: "preview" | "neon" | "local", database: string, marker: string, datasourceUrl?: string}}
 */
export function resolveEnvironment(env, sandbox = Reflect.get(globalThis, providerSandbox)) {
  const hosted = deployment(env);
  const mode = value(env, "OPS02_MODE");
  const mocks = sandbox || mockKeys.some(key => value(env, key)) ||
    /(?:sandbox|batch19-mock-providers)\.cjs/i.test(value(env, "NODE_OPTIONS"));
  if (hosted === "preview") {
    if (mode !== "neon" || mocks || ["DATABASE_URL", "DIRECT_URL", "DATABASE_URL_UNPOOLED", "DEV_DATABASE_OWNER_URL"]
      .some(key => value(env, key))) throw new Error("OPS02_UNSAFE_PREVIEW_CONFIGURATION");
    isolatedProviders(env, undefined);
    return { kind: "preview", database: neonDev.database, marker: neonDev.marker,
      datasourceUrl: prismaDevUrl(devConnection(value(env, "DEV_DATABASE_APP_URL"), "app")) };
  }
  if (!hosted && mode) {
    if (developmentUrls.some(key => value(env, key)) || ["DIRECT_URL", "DATABASE_URL_UNPOOLED"].some(key => value(env, key))) {
      throw new Error("OPS02_CONFLICTING_DEVELOPMENT_CREDENTIALS");
    }
    if (mocks && !sandbox) throw new Error("OPS02_DEVELOPMENT_SANDBOX_REQUIRED");
    isolatedProviders(env, sandbox);
    const url = value(env, "DATABASE_URL");
    if (mode === "local") return { kind: "local", database: localAppConnection(url), marker: localMarker };
    if (mode === "neon") {
      devConnection(url, "app");
      const settings = new URL(url).searchParams;
      if (settings.get("sslmode") !== "require" || settings.get("sslaccept") !== "strict") {
        throw new Error("OPS02_PRISMA_TLS_REQUIRED");
      }
      return { kind: "neon", database: neonDev.database, marker: neonDev.marker };
    }
    throw new Error("OPS02_UNKNOWN_MODE");
  }

  if (mode || mocks || developmentUrls.some(key => value(env, key)) || value(env, "TEST_MODE") === "1" ||
      liveIntegrationKeys.some(key => mockSecrets.has(value(env, key)))) {
    throw new Error("OPS02_PRODUCTION_DEVELOPMENT_CONFLICT");
  }
  if (!hosted && ["development", "test"].includes(env.NODE_ENV ?? "")) throw new Error("OPS02_USE_GUARDED_DEV_COMMAND");
  for (const key of ["DATABASE_URL", "DIRECT_URL", "DATABASE_URL_UNPOOLED"]) validateOrdinaryUrl(value(env, key));
  return { kind: "ordinary" };
}

/**
 * @param {{ kind: string, database: string, marker: string }} target
 * @param {() => PromiseLike<{ database: string, role: string, marker: string, restricted: boolean }[]>} readIdentity
 */
export async function verifyDevelopmentIdentity(target, readIdentity) {
  try {
    const [identity] = await readIdentity();
    if (identity?.database === target.database && identity.role === "app_3dkid" &&
        identity.restricted && identity.marker === target.marker) return;
  } catch { /* Keep Prisma and connection diagnostics private. */ }
  throw new Error("OPS02_RUNTIME_IDENTITY_UNVERIFIED");
}
