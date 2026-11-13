// Structural diagnostics only. All Mono HTTP is mocked; no DB, orders or sending.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sourceModule } from "./source-module";
import * as reference from "../src/lib/order-reference";

const originalFetch = globalThis.fetch; const originalWarn = console.warn;
const token = "qa_DIAGNOSTIC_TOKEN_PRIVATE";
const invoiceId = "qaInvoiceOpaque123456789";
const pageUrl = `https://pay.mbnk.biz/${invoiceId}`;
const email = "qa-private-customer@example.invalid";
const customerName = "PRIVATE_CUSTOMER_NAME";
const phone = "PRIVATE_PHONE_380000000000";
const shipping = "PRIVATE_SHIPPING_ADDRESS";
const pathMarker = "PRIVATE_PATH_CONTENT";
const logs: unknown[][] = [];
console.warn = (...args) => { logs.push(args); };
let calls = 0; let currentValue: unknown; let rawJson: string | undefined;
globalThis.fetch = async (input, init) => {
  calls++;
  assert.equal(String(input), "https://api.monobank.ua/api/merchant/invoice/create");
  assert.equal(init?.method, "POST"); assert.equal((init?.headers as Record<string, string>)["X-Token"], token);
  return rawJson === undefined ? Response.json(currentValue) : new Response(rawJson, { status: 200 });
};
const bindings = { "node:crypto": crypto, "@/lib/order-reference": reference,
  "@/lib/server-env": { readServerEnv: (name: string) => ({ MONO_ACQUIRING_TOKEN: token, SITE_URL: "https://shop.example.invalid" })[name] || "" },
};
type Mono = typeof import("../src/lib/payments/mono");
const mono = sourceModule<Mono>("src/lib/payments/mono.ts", bindings);
// The approved Production implementation is the behavior oracle. Comparing the
// actual prior module avoids a second handwritten copy of its URL rules.
const directory = resolve(".next/cache/mono-response-diagnostics"); mkdirSync(directory, { recursive: true });
const baselineFile = resolve(directory, "mono-before.ts");
writeFileSync(baselineFile, execFileSync("git", ["show", "cebe36401a87f8ed14a1585553e8e4aaf0104a93:src/lib/payments/mono.ts"], { encoding: "utf8" }));
const baseline = sourceModule<Mono>(baselineFile, bindings);
const input = { number: "0001", amount: 19900, email, resultPath: "/checkout/success?qa" };
const expectedFields = ["responseJsonParsed", "responseIsObject", "invoiceIdPresent", "invoiceIdType", "invoiceIdValid", "invoiceIdLength", "pageUrlPresent", "pageUrlType", "pageUrlParsable", "pageUrlProtocol", "pageUrlHostname", "pageUrlHostnameMatchesExpected", "pageUrlHostnameRedacted", "pageUrlHasPort", "pageUrlHasCredentials", "pageUrlPathMatchesInvoice", "pageUrlHasQuery", "pageUrlHasHash"];
function privacy(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const privateValue of [token, invoiceId, pageUrl, email, customerName, phone, shipping, pathMarker]) {
    assert.ok(!serialized.includes(privateValue.toLowerCase()), "Diagnostics must not disclose sample private values");
  }
}
async function outcome(module: Mono) {
  try { return { accepted: true, result: await module.createMonoInvoice(input) }; }
  catch (error) {
    assert.ok(error instanceof module.MonoError);
    return { accepted: false, code: error.code, category: error.category, endpoint: error.endpoint, httpStatus: error.httpStatus, invoiceId: error.invoiceId };
  }
}

async function verify() {
  currentValue = { invoiceId: "p2_9ZgpZVsl3", pageUrl: "https://pay.mbnk.biz/p2_9ZgpZVsl3" };
  const documented = mono.inspectMonoCreateInvoiceResponse(currentValue);
  assert.equal(documented.valid, true); assert.deepEqual(await mono.createMonoInvoice(input), currentValue); assert.equal(logs.length, 0);
  currentValue = { invoiceId, pageUrl };
  assert.equal(mono.inspectMonoCreateInvoiceResponse(currentValue).valid, true); await mono.createMonoInvoice(input); assert.equal(logs.length, 0);
  // Fixed hosted-payment allowlist: this is the sole intentional behavior delta
  // from the diagnostic batch's prior Production oracle below.
  for (const host of ["pay.mbnk.biz", "pay.monobank.ua"]) {
    currentValue = { invoiceId, pageUrl: `https://${host}/${invoiceId}` };
    const inspected = mono.inspectMonoCreateInvoiceResponse(currentValue);
    assert.equal(inspected.valid, true); assert.equal(inspected.diagnostics.pageUrlHostnameMatchesExpected, true);
    assert.equal(mono.validHostedPage((currentValue as { pageUrl: string }).pageUrl, invoiceId), true);
    assert.deepEqual(await mono.createMonoInvoice(input), currentValue); assert.equal(logs.length, 0);
  }
  const cases: { name: string; value: unknown; field: string; expected: unknown }[] = [
    { name: "missing ID", value: { pageUrl }, field: "invoiceIdPresent", expected: false },
    { name: "invalid ID", value: { invoiceId: `${invoiceId}/invalid`, pageUrl }, field: "invoiceIdValid", expected: false },
    { name: "numeric ID", value: { invoiceId: 123, pageUrl }, field: "invoiceIdType", expected: "number" },
    { name: "null ID", value: { invoiceId: null, pageUrl }, field: "invoiceIdType", expected: "null" },
    { name: "missing URL", value: { invoiceId }, field: "pageUrlPresent", expected: false },
    { name: "non-string URL", value: { invoiceId, pageUrl: 123 }, field: "pageUrlType", expected: "number" },
    { name: "URL syntax", value: { invoiceId, pageUrl: `https://[${pathMarker}` }, field: "pageUrlParsable", expected: false },
    { name: "unexpected host", value: { invoiceId, pageUrl: `https://unexpected.example.invalid/${invoiceId}` }, field: "pageUrlHostname", expected: "unexpected.example.invalid" },
    { name: "unexpected path", value: { invoiceId, pageUrl: `https://pay.mbnk.biz/${pathMarker}` }, field: "pageUrlPathMatchesInvoice", expected: false },
    { name: "query", value: { invoiceId, pageUrl: `${pageUrl}?token=${token}&email=${encodeURIComponent(email)}` }, field: "pageUrlHasQuery", expected: true },
    { name: "fragment", value: { invoiceId, pageUrl: `${pageUrl}#${token}` }, field: "pageUrlHasHash", expected: true },
    { name: "HTTP", value: { invoiceId, pageUrl: pageUrl.replace("https:", "http:") }, field: "pageUrlProtocol", expected: "http:" },
    { name: "port", value: { invoiceId, pageUrl: `https://pay.mbnk.biz:8443/${invoiceId}` }, field: "pageUrlHasPort", expected: true },
    { name: "credentials", value: { invoiceId, pageUrl: `https://${encodeURIComponent(email)}:${token}@pay.mbnk.biz/${invoiceId}` }, field: "pageUrlHasCredentials", expected: true },
    { name: "ID in hostname", value: { invoiceId, pageUrl: `https://${invoiceId.toLowerCase()}.invalid/${invoiceId}` }, field: "pageUrlHostnameRedacted", expected: true },
    { name: "private scheme", value: { invoiceId, pageUrl: `private-scheme:${token}/${pathMarker}` }, field: "pageUrlProtocol", expected: "other" },
    { name: "null response", value: null, field: "responseIsObject", expected: false },
    { name: "array response", value: [], field: "responseIsObject", expected: false },
    { name: "primitive response", value: "PRIVATE_RESPONSE_BODY", field: "responseIsObject", expected: false },
  ];
  for (const host of ["evil.monobank.ua", "pay.monobank.ua.evil.example", "monobank.ua", "www.pay.monobank.ua", "pay-mono.bank.ua"]) {
    cases.push({ name: `untrusted lookalike ${host}`, value: { invoiceId, pageUrl: `https://${host}/${invoiceId}` }, field: "pageUrlHostnameMatchesExpected", expected: false });
  }
  for (const host of ["pay.mbnk.biz", "pay.monobank.ua"]) {
    for (const [url, field] of [
      [`http://${host}/${invoiceId}`, "pageUrlProtocol"],
      [`https://${host}/${pathMarker}`, "pageUrlPathMatchesInvoice"],
      [`https://${host}/${invoiceId}/`, "pageUrlPathMatchesInvoice"],
      [`https://${host}/${invoiceId}?private=${token}`, "pageUrlHasQuery"],
      [`https://${host}/${invoiceId}#${token}`, "pageUrlHasHash"],
      [`https://qa-user@${host}/${invoiceId}`, "pageUrlHasCredentials"],
      [`https://:${token}@${host}/${invoiceId}`, "pageUrlHasCredentials"],
      [`https://${host}:8443/${invoiceId}`, "pageUrlHasPort"],
    ] as const) {
      const expected = field === "pageUrlProtocol" ? "http:" : field === "pageUrlPathMatchesInvoice" ? false : true;
      cases.push({ name: `${host} ${field}`, value: { invoiceId, pageUrl: url }, field, expected });
    }
  }
  for (const test of cases) {
    currentValue = test.value; rawJson = undefined;
    const inspected = mono.inspectMonoCreateInvoiceResponse(currentValue);
    assert.equal(inspected.valid, false, test.name);
    assert.deepEqual(Object.keys(inspected.diagnostics).sort(), expectedFields.slice().sort());
    assert.equal(inspected.diagnostics[test.field as keyof typeof inspected.diagnostics], test.expected, test.name);
    assert.equal(inspected.diagnostics.responseJsonParsed, true); privacy(inspected.diagnostics);
    const original = await outcome(baseline); assert.deepEqual(await outcome(mono), original, `Response behavior changed: ${test.name}`);
    try { await mono.createMonoInvoice(input); assert.fail("Invalid response accepted"); }
    catch (error) {
      assert.ok(error instanceof mono.MonoError); assert.equal(error.definiteRejection, false);
      assert.equal(error.createInvoiceDiagnostics?.invoiceIdValid, inspected.diagnostics.invoiceIdValid);
      mono.logMonoInitializationError(error, "0001");
    }
    const output = logs.at(-1)!; privacy(output);
    assert.equal(output[0], "Mono initialization");
    const fields = output[1] as Record<string, unknown>;
    assert.equal(fields.endpoint, "invoice/create"); assert.equal(fields.category, "invalid_response"); assert.equal(fields.httpStatus, 200); assert.equal(fields.orderNumber, "0001");
    assert.deepEqual(Object.keys(fields).sort(), [...expectedFields, "endpoint", "category", "httpStatus", "orderNumber"].sort());
  }
  // Unrecognized response keys and values are not copied into diagnostics/logs.
  currentValue = { invoiceId, pageUrl: `${pageUrl}?private=${token}`, token, email, customerName, phone, shipping, [token]: pageUrl };
  const hostile = mono.inspectMonoCreateInvoiceResponse(currentValue); privacy(hostile.diagnostics);
  assert.equal(Object.hasOwn(hostile.diagnostics, token), false);
  // The logger independently allowlists metadata keys, never spreading arbitrary extras.
  mono.logMonoInitializationError(new mono.MonoError("MONO_INVALID_RESPONSE", { endpoint: "invoice/create", category: "invalid_response", httpStatus: 200,
    createInvoiceDiagnostics: { ...hostile.diagnostics, email, customerName, token, pageUrl } as typeof hostile.diagnostics,
  }), "0001"); privacy(logs.at(-1));

  rawJson = "PRIVATE_INVALID_JSON_BODY";
  assert.deepEqual(await outcome(mono), await outcome(baseline), "JSON parse failure semantics changed");
  try { await mono.createMonoInvoice(input); assert.fail("Invalid JSON accepted"); }
  catch (error) {
    assert.ok(error instanceof mono.MonoError); assert.equal(error.createInvoiceDiagnostics?.responseJsonParsed, false);
    assert.equal(error.createInvoiceDiagnostics?.responseIsObject, false); assert.equal(error.definiteRejection, false);
    mono.logMonoInitializationError(error, "0001");
  }
  assert.ok(!JSON.stringify(logs).includes(rawJson)); privacy(logs);
  rawJson = undefined;
  // Keep URL normalization edge behavior exactly as it was in the approved base.
  const parityUrls = [pageUrl, pageUrl + "?", pageUrl + "#", `https://pay.mbnk.biz:443/${invoiceId}`, pageUrl.replace("pay.mbnk.biz", "PAY.MBNK.BIZ"),
    `  ${pageUrl}  `, pageUrl + "/", `https://pay.mbnk.biz/%71aInvoiceOpaque123456789`, "/relative", "", "mailto:qa@example.invalid"];
  for (const url of parityUrls) {
    assert.equal(mono.validHostedPage(url, invoiceId), baseline.validHostedPage(url, invoiceId));
    currentValue = { invoiceId, pageUrl: url };
    assert.deepEqual(await outcome(mono), await outcome(baseline), "URL acceptance/recovery behavior changed");
  }
  const before = calls; mono.inspectMonoCreateInvoiceResponse({ invoiceId, pageUrl }); assert.equal(calls, before, "Inspector must not request anything");
  console.log(`PASS Mono response diagnostics: both exact trusted hosts accepted/no logs; ${cases.length} invalid structures/lookalikes/URL conditions; HTTPS/path/query/hash/credentials/port enforced on both hosts; malformed JSON; allowlisted metadata/privacy; prior validator/recovery parity outside the intended host addition. Mocked HTTP only; no DB/orders/sends.`);
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; console.warn = originalWarn; });
