/* eslint-disable @typescript-eslint/no-require-imports -- Node preloads this file. */
const { assertLocalTooling, providerSandbox, resolveEnvironment } = require("../../src/lib/environment.mjs");
assertLocalTooling(process.env);
if (process.env.OPS02_SANDBOX !== "1" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.CUSTOMER_AUTH_ORIGIN ?? "")) {
  throw new Error("OPS02_SANDBOX_IDENTITY_REQUIRED");
}
resolveEnvironment(process.env, "development");
require("./no-dotenv.cjs");
const { MockAgent, setGlobalDispatcher } = require("undici");
const { appendFileSync } = require("node:fs");
const { join } = require("node:path");
// Catch the Blob SDK's separate Undici transport. Prisma uses its verified
// database socket independently of the HTTP dispatcher.
const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect(/^127\.0\.0\.1:\d+$/);
setGlobalDispatcher(agent);
globalThis[providerSandbox] = "development";
const fetchOriginal = globalThis.fetch;
const city = "00000000-0000-4000-8000-000000000021";
const depot = "00000000-0000-4000-8000-000000000022";
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.protocol === "http:" && url.hostname === "127.0.0.1") return fetchOriginal(input, init);
  if (url.href === "https://api.resend.com/emails") {
    const message = JSON.parse(init?.body ?? await input.text());
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    if (recipients.some(value => !String(value).toLowerCase().endsWith("@example.test"))) {
      return Response.json({ error: "synthetic_recipients_only" }, { status: 422 });
    }
    appendFileSync(join(process.env.OPS02_MAIL_DIR, "mail.ndjson"), JSON.stringify(message) + "\n", { mode: 0o600 });
    return Response.json({ id: "ops02-captured" });
  }
  if (url.origin === "https://api.novaposhta.ua") {
    const { modelName, calledMethod } = JSON.parse(init?.body ?? await input.text());
    const settlement = { Description: "DEV Київ", Present: "DEV Київ", Ref: city, DeliveryCity: city };
    const warehouse = { Description: "DEV Відділення №1", Ref: depot, CityRef: city, Number: "1",
      TypeOfWarehouse: "9a68df70-0267-42a8-bb5c-37f427e36ee4" };
    const methods = { getCities: [settlement], searchSettlements: [{ Addresses: [settlement] }], getWarehouses: [warehouse] };
    if (modelName === "Address" || modelName === "AddressGeneral") {
      if (Object.hasOwn(methods, calledMethod)) return Response.json({ success: true, data: methods[calledMethod], errors: [] });
    }
    return Response.json({ success: false, data: [], errors: ["OPS02_PROVIDER_ACTION_DISABLED"] });
  }
  throw new Error("OPS02_EXTERNAL_HTTP_BLOCKED");
};
