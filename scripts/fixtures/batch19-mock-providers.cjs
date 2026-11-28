// Injected only into the privately spawned test server. Denies unknown outbound fetches.
/* eslint-disable @typescript-eslint/no-require-imports -- Node loads this fixture with --require. */
const { assertLocalTooling, providerSandbox, resolveEnvironment } = require("../../src/lib/environment.mjs");
assertLocalTooling(process.env);
if (!process.env.BATCH19_MAIL_LOG || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.BATCH19_APP_ORIGIN ?? "") ||
    resolveEnvironment(process.env, "regression").kind !== "local") throw new Error("B19_MOCK_PRIVATE_ONLY");
require("../development/no-dotenv.cjs");
const { appendFileSync, readFileSync } = require("node:fs");
const { createHash, generateKeyPairSync, sign } = require("node:crypto");
const { basename, join } = require("node:path");
const google = "https://accounts.google.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "local", alg: "RS256", use: "sig" };
const tokenUrl = "https://oauth2.googleapis.com/token";
const jwks = "https://www.googleapis.com/oauth2/v3/certs";
const original = globalThis.fetch;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
// The Blob SDK has its own Undici fetch. Restrict that transport too.
{
  const { MockAgent, setGlobalDispatcher } = require("undici");
  const agent = new MockAgent();
  agent.disableNetConnect();
  agent.enableNetConnect(/^(?:127\.0\.0\.1|localhost):\d+$/);
  setGlobalDispatcher(agent);
}
globalThis[providerSandbox] = "regression";
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const target = new URL(url);
  if (target.protocol === "http:" && ["127.0.0.1", "localhost"].includes(target.hostname)) return original(input, init);
  if (target.origin === "https://res.cloudinary.com" && target.pathname.startsWith("/fixture/")) {
    return new Response(readFileSync("assets/brand/favicon/favicon-96.png"), { headers: { "Content-Type": "image/png" } });
  }
  if (process.env.BATCH19_BRAND01A === "1") {
    const faviconOrigin = "https://ux07fixture.public.blob.vercel-storage.com";
    if (target.origin === faviconOrigin && /^\/3dkid\/favicon\/[a-f0-9]{32}\.ico$/.test(target.pathname)) {
      return new Response(readFileSync(join(process.env.BATCH19_QA_DIRECTORY, basename(target.pathname))), {
        headers: { "Content-Type": "image/x-icon" },
      });
    }
  }
  if (process.env.BATCH19_UX07 === "1" && target.origin === "https://ux07fixture.public.blob.vercel-storage.com" &&
      /^\/3dkid\/product-media\/image\/[0-9a-f-]{36}\.webp$/.test(target.pathname)) {
    return new Response(readFileSync(join(process.env.BATCH19_QA_DIRECTORY, basename(target.pathname))), {
      headers: { "Content-Type": "image/webp" },
    });
  }
  if (url === google + "/.well-known/openid-configuration") return Response.json({
    issuer: google, authorization_endpoint: google + "/o/oauth2/v2/auth", token_endpoint: tokenUrl, jwks_uri: jwks,
    userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    code_challenge_methods_supported: ["S256"], id_token_signing_alg_values_supported: ["RS256"],
    response_types_supported: ["code"], subject_types_supported: ["public"],
  });
  if (url === jwks) return Response.json({ keys: [jwk] });
  if (url === tokenUrl) {
    const body = new URLSearchParams(init?.body ?? await input.text());
    const [identity, nonce, challenge] = (body.get("code") || "").split(".");
    const verifier = createHash("sha256").update(body.get("code_verifier") || "").digest("base64url");
    if (verifier !== challenge || body.get("redirect_uri") !== process.env.BATCH19_APP_ORIGIN + "/api/customer-auth/callback/google") {
      const callback = new URL(body.get("redirect_uri"));
      console.warn("Mock Google rejected the exchange", { pkce: verifier === challenge, callback: callback.origin + callback.pathname });
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const email = identity === "new" ? "google.only@gmail.com" : identity === "unhosted" ? "qa.external@example.test" : "qa.customer@gmail.com";
    const now = Math.floor(Date.now() / 1000);
    const jwt = encode({ alg: "RS256", kid: "local" }) + "." + encode({
      iss: google, aud: "local-google-id", sub: identity, nonce, email, email_verified: identity !== "unverified",
      given_name: "Mock", family_name: "Google", iat: now, exp: now + 300,
    });
    return Response.json({ access_token: "mock-access", token_type: "Bearer", expires_in: 300, id_token: jwt + "." + sign("RSA-SHA256", Buffer.from(jwt), privateKey).toString("base64url") });
  }
  if (url === "https://api.resend.com/emails") {
    const message = JSON.parse(init?.body ?? await input.text());
    appendFileSync(process.env.BATCH19_MAIL_LOG, JSON.stringify({ to: message.to, html: message.html, text: message.text }) + "\n");
    return Response.json({ id: "mock-resend" });
  }
  if (target.origin === "https://api.monobank.ua" && target.pathname === "/api/merchant/invoice/status" && init?.headers?.["X-Token"] === "local-mock-only") {
    const invoiceId = target.searchParams.get("invoiceId");
    if (invoiceId === "cart_browser_en" || invoiceId === "cart_browser_ua") {
      const en = invoiceId.endsWith("_en");
      return Response.json({ invoiceId, reference: "pay_" + (en ? "e" : "a").repeat(32), status: en ? "created" : "expired",
        amount: 10000, ccy: 980, modifiedDate: new Date().toISOString() });
    }
  }
  throw new Error(`B19_UNEXPECTED_EXTERNAL_FETCH ${target.origin}${target.pathname}`);
};
