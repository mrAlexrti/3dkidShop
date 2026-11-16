// Native Blob upload regressions: mocked storage, auth, fetch and Prisma boundaries.
import assert from "node:assert/strict";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { sourceModule } from "./source-module";
import * as policy from "../src/lib/media-upload";
import * as media from "../src/lib/product-media";
import * as slug from "../src/lib/product-slug";
import { translations } from "../src/lib/i18n";
import type { HandleUploadOptions, UploadOptions } from "@vercel/blob/client";
import { handleUpload as verifySdkCallback } from "@vercel/blob/client";

const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
const savedFetch = globalThis.fetch;
const token = "vercel_blob_rw_isolated_READ_WRITE_SECRET";
process.env.BLOB_READ_WRITE_TOKEN = token;
const blocked = () => { throw new Error("EXTERNAL_EFFECT_FORBIDDEN"); };
globalThis.fetch = blocked;
const server = sourceModule<typeof import("../src/lib/media-upload-server")>("src/lib/media-upload-server.ts", {
  "server-only": {}, "node:crypto": crypto, "@/lib/media-upload": policy,
});
const png = "89504e470d0a1a0a".padEnd(64, "0");
const gif = Buffer.from("GIF89a").toString("hex").padEnd(64, "0");
const webp = Buffer.alloc(32); webp.write("RIFF", 0); webp.write("WEBPVP8X", 8); webp[20] = 2;
const info: policy.MediaPreflight = { kind: "image", contentType: "image/png", size: 1024, headerHex: png };
let role: string | undefined = "ADMIN";
let sdkCalls = 0; let options: Awaited<ReturnType<HandleUploadOptions["onBeforeGenerateToken"]>> | undefined;
const sdkMock = async (args: HandleUploadOptions) => {
  sdkCalls++;
  if (args.body.type === "blob.upload-completed") {
    // Storage signature checking is owned by the SDK, never by browser auth.
    if (args.request instanceof Request && args.request.headers.get("x-vercel-signature") !== "fixture-verified") throw new Error("BAD_CALLBACK_SIGNATURE");
    await args.onUploadCompleted?.(args.body.payload);
    return { type: "blob.upload-completed", response: "ok" };
  }
  options = await args.onBeforeGenerateToken(args.body.payload.pathname, args.body.payload.clientPayload, args.body.payload.multipart);
  return { type: "blob.generate-client-token", clientToken: "short-lived-scoped-fixture-grant" };
};
const routes = sourceModule<typeof import("../src/app/api/product-media/upload/route")>("src/app/api/product-media/upload/route.ts", {
  "@vercel/blob/client": { handleUpload: sdkMock }, "@/lib/media-upload-server": server, "@/lib/media-upload": policy, zod: { z },
  "@/lib/actions/require-admin": { requireAdmin: async () => { if (role !== "ADMIN") throw new Error("Unauthorized"); } },
});
const request = (body: unknown, headers: Record<string, string> = {}) => new Request(`https://shop.example.invalid${policy.MEDIA_UPLOAD_URL}`, {
  method: "POST", headers: { "Content-Type": "application/json", origin: "https://shop.example.invalid", ...headers }, body: JSON.stringify(body),
});
async function send(body: unknown, headers?: Record<string, string>) { return routes.POST(request(body, headers)); }
let groups = 0;
const pass = (label: string) => { groups++; console.log(`PASS ${label}`); };

type Element = React.ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element; return [element, ...elements(element.props.children)];
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function verify() {
  assert.equal((await routes.GET()).status, 200);
  for (const denied of [undefined, "USER", "MANAGER"]) {
    role = denied; assert.equal((await routes.GET()).status, 403);
    assert.equal((await send({ type: "prepare", file: info })).status, 403);
    assert.equal((await send({ type: "blob.generate-client-token", payload: { pathname: "arbitrary", clientPayload: "", multipart: false } })).status, 403);
  }
  assert.equal(sdkCalls, 0); role = "ADMIN";
  assert.equal((await send({ type: "prepare", file: info }, { origin: "https://attacker.invalid" })).status, 403);
  const preparedResponse = await send({ type: "prepare", file: info }); assert.equal(preparedResponse.status, 200);
  const prepared = await preparedResponse.json();
  assert.match(prepared.pathname, /^3dkid\/product-media\/image\/[a-f0-9-]{36}\.png$/);
  const tokenBody = { type: "blob.generate-client-token", payload: { ...prepared, multipart: false } };
  assert.equal((await send(tokenBody)).status, 200);
  assert.deepEqual(options?.allowedContentTypes, ["image/png"]); assert.equal(options?.maximumSizeInBytes, info.size);
  assert.equal(options?.allowOverwrite, false); assert.equal(options?.addRandomSuffix, false);
  assert.ok(options!.validUntil! <= Date.now() + server.UPLOAD_AUTH_TTL);
  assert.ok(!JSON.stringify(prepared).includes(token));
  pass("Admin-only scoped token issuance, same-origin protection, server UUID paths and no persistent credentials in responses");

  const second = server.prepareMediaUpload(info); assert.notEqual(second.pathname, prepared.pathname);
  for (const bad of ["../overwrite.png", "existing.png", "https://evil.invalid/p.png", prepared.pathname.replace("image", "animation")]) {
    assert.throws(() => server.verifyMediaIntent(bad, prepared.clientPayload));
  }
  assert.throws(() => server.verifyMediaIntent(prepared.pathname, prepared.clientPayload.slice(0, -1) + (prepared.clientPayload.endsWith("0") ? "1" : "0")));
  const now = Date.now; Date.now = () => now() + server.UPLOAD_AUTH_TTL + 1;
  try { assert.throws(() => server.verifyMediaIntent(prepared.pathname, prepared.clientPayload)); } finally { Date.now = now; }
  assert.equal((await send({ ...tokenBody, payload: { ...tokenBody.payload, multipart: true } })).status, 400);
  assert.equal((await send({ ...tokenBody, payload: { ...tokenBody.payload, pathname: "arbitrary.png" } })).status, 400);
  pass("tampered/expired authorization and arbitrary storage paths rejected; overwrites and multipart disabled");

  for (const contentType of ["image/svg+xml", "text/html", "application/javascript", "image/gif"]) {
    assert.equal((await send({ type: "prepare", file: { ...info, contentType } })).status, 400);
  }
  for (const kind of ["image", "animation"] as const) {
    const input = { ...info, kind, contentType: kind === "image" ? "image/png" : "image/gif", headerHex: kind === "image" ? png : gif, size: policy.MEDIA_LIMITS[kind] };
    assert.ok(server.prepareMediaUpload(input));
    assert.throws(() => server.prepareMediaUpload({ ...input, size: input.size + 1 }), /tooLarge/);
  }
  for (const invalid of [{ ...info, headerHex: "3c68746d6c3e".padEnd(64, "0") }, { ...info, size: 0 }, { ...info, headerHex: "x" }, { ...info, size: 1.5 }]) assert.throws(() => server.prepareMediaUpload(invalid));
  assert.ok(server.prepareMediaUpload({ ...info, kind: "animation", contentType: "image/webp", headerHex: webp.toString("hex") }));
  const staticWebp = Buffer.from(webp); staticWebp[20] = 0;
  assert.throws(() => server.prepareMediaUpload({ ...info, kind: "animation", contentType: "image/webp", headerHex: staticWebp.toString("hex") }), /notAnimated/);
  assert.equal((await send({ type: "prepare", file: { ...info, pathname: "overwrite.png" } })).status, 400);
  assert.equal((await routes.POST(request("x".repeat(17000)))).status, 400);
  assert.equal((await routes.POST(new Request(`https://shop.example.invalid${policy.MEDIA_UPLOAD_URL}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" }))).status, 400);
  pass("format signatures, static 5 MB/animation 12 MB boundaries, animated WebP flag and bounded/malformed request checks");

  role = undefined;
  const callback = { type: "blob.upload-completed", payload: { blob: { url: "https://fixture.public.blob.vercel-storage.com/file.png" }, tokenPayload: "{}" } };
  assert.equal((await send(callback, { origin: "", "x-vercel-signature": "fixture-verified" })).status, 200);
  assert.equal((await send(callback, { "x-vercel-signature": "bad" })).status, 400);
  assert.equal((await send(callback)).status, 400);
  // A local cryptographic SDK probe complements the mocked storage operations.
  // No upload/token is requested, no fetch occurs and only a fixture secret is used.
  const callbackRoutes = sourceModule<typeof routes>("src/app/api/product-media/upload/route.ts", {
    "@vercel/blob/client": { handleUpload: verifySdkCallback }, "@/lib/media-upload-server": server, "@/lib/media-upload": policy, zod: { z },
    "@/lib/actions/require-admin": { requireAdmin: blocked },
  });
  const signature = crypto.createHmac("sha256", token).update(JSON.stringify(callback)).digest("hex");
  const signedRequest = (sig: string) => new Request(`https://shop.example.invalid${policy.MEDIA_UPLOAD_URL}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-vercel-signature": sig }, body: JSON.stringify(callback),
  });
  assert.equal((await callbackRoutes.POST(signedRequest(signature))).status, 200);
  assert.equal((await callbackRoutes.POST(signedRequest("00".repeat(32)))).status, 400);
  role = "ADMIN"; delete process.env.BLOB_READ_WRITE_TOKEN;
  assert.deepEqual(await (await routes.GET()).json(), { available: false });
  assert.equal((await send({ type: "prepare", file: info })).status, 503);
  process.env.BLOB_READ_WRITE_TOKEN = token;
  // Fresh limiter isolates the fixed window from earlier route tests.
  const limiter = sourceModule<typeof server>("src/lib/media-upload-server.ts", { "server-only": {}, "node:crypto": crypto, "@/lib/media-upload": policy });
  for (let i = 0; i < 40; i++) limiter.limitMediaUploads(120000);
  assert.throws(() => limiter.limitMediaUploads(120001), /rateLimited/); limiter.limitMediaUploads(180001);
  pass("provider completion verified by actual SDK with local signed/forged fixtures, no browser session; missing config and abuse limits handled");

  const path = "3dkid/product-media/image/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.png";
  const url = `https://fixture.public.blob.vercel-storage.com/${path}`;
  const file = new File([Buffer.from(png, "hex")], "local product.png", { type: "image/png" });
  let failUpload = false; const available = true; let uploadCalls = 0; let resolveUpload: (() => void) | undefined; let delay = false;
  let lastOptions: UploadOptions | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, policy.MEDIA_UPLOAD_URL);
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)); assert.equal(body.type, "prepare"); assert.equal(body.file.contentType, "image/png");
      assert.ok(!String(init.body).includes("local product"));
      return Response.json({ pathname: path, clientPayload: "signed-fixture-intent" });
    }
    return Response.json({ available });
  };
  const client = sourceModule<typeof import("../src/lib/media-upload-client")>("src/lib/media-upload-client.ts", {
    "@/lib/media-upload": policy, "@vercel/blob/client": { upload: async (pathname: string, body: File, opts: UploadOptions) => {
      uploadCalls++; lastOptions = opts; assert.equal(body, file); assert.equal(pathname, path);
      opts.onUploadProgress?.({ loaded: 16, total: 32, percentage: 50 });
      if (delay) await new Promise<void>((resolve) => { resolveUpload = resolve; });
      if (failUpload) throw new Error("SDK_FAILURE_WITH_PRIVATE_DETAILS");
      return { pathname: path, url, contentType: "image/png" };
    } },
  });
  assert.equal(await client.uploadProductMedia(file, "image", () => {}), url);
  assert.equal(lastOptions?.access, "public"); assert.equal(lastOptions?.handleUploadUrl, policy.MEDIA_UPLOAD_URL);
  assert.ok(!JSON.stringify(lastOptions).includes(token));
  for (const invalid of ["javascript:alert(1)", "https://fixture.private.blob.vercel-storage.com/file", "https://evil.invalid/file", "https://fixture.public.blob.vercel-storage.com.evil.invalid/file"]) assert.equal(policy.isPublicBlobUrl(invalid), false);
  pass("client direct upload success returns only matching permanent public URL, with SDK progress and no storage credentials");

  for (const locale of ["ua", "en"] as const) {
    const state: unknown[] = []; let cursor = 0; const effects: (() => void | (() => void))[] = [];
    const busyEvents: boolean[] = [];
    const { MediaUrlField } = sourceModule<typeof import("../src/components/admin/media-url-field")>("src/components/admin/media-url-field.tsx", {
      react: { useState: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = initial;
        return [state[index], (value: unknown) => { state[index] = value; }]; },
        useRef: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
        useEffect: (callback: () => void) => { if (!effects.includes(callback)) effects.push(callback); },
      }, "react/jsx-runtime": jsx, "next/image": { default: "img", __esModule: true },
      "@/lib/product-media": media, "@/lib/media-upload": policy, "@/lib/media-upload-client": client,
      "@/store/lang-store": { useLangStore: () => ({ t: translations[locale], locale }) },
    });
    const oldUrl = "https://res.cloudinary.com/fixture/image/upload/old.webp";
    const props = { name: "imageUrl", label: "Product image", help: "Manual URL", defaultValue: oldUrl, uploadEnabled: true, required: true, onUploadStateChange: (_name: string, busy: boolean) => busyEvents.push(busy) };
    const render = () => { cursor = 0; return elements(MediaUrlField(props)); };
    const urlField = () => render().find((node) => node.props.name === "imageUrl")!;
    render(); effects.slice(0, 2).forEach((effect) => effect()); await flush();
    const fileField = render().find((node) => node.props.type === "file")!;
    assert.equal(fileField.props.name, undefined, "Binary must never be part of the product Save FormData");
    assert.equal(fileField.props.accept, "image/jpeg,image/png,image/webp");
    (fileField.props.onChange as (event: unknown) => void)({ target: { files: [file], value: "" } }); await flush();
    const uploadButton = () => render().find((node) => node.type === "button" && node.props.children === translations[locale].admin.media.upload)!;
    assert.equal(uploadButton().props.disabled, false); assert.equal(urlField().props.value, oldUrl);
    const before = uploadCalls; failUpload = true; delay = true;
    const repeatedClick = uploadButton().props.onClick as () => void;
    repeatedClick(); repeatedClick(); await flush();
    assert.equal(uploadCalls, before + 1); assert.equal(urlField().props.disabled, true);
    resolveUpload!(); await flush(); assert.equal(urlField().props.value, oldUrl);
    assert.ok(render().some((node) => node.props.children === translations[locale].admin.media.uploadErrors.uploadFailed));
    failUpload = false; delay = false; (uploadButton().props.onClick as () => void)(); await flush();
    assert.equal(urlField().props.value, url); assert.equal(busyEvents.at(-1), false);
    assert.ok(render().some((node) => node.type === "img" && node.props.src === url && String(node.props.alt).includes("Product image")));
    (urlField().props.onChange as (event: unknown) => void)({ target: { value: "javascript:alert(1)", setCustomValidity: () => {} } });
    assert.ok(!render().some((node) => node.type === "img"));
    assert.ok(render().some((node) => node.props["aria-controls"] === "imageUrl-file"));
  }
  pass("UA/EN actual field handlers: filename selection, repeated upload guard, failure retains old URL, success fills preview, safe manual URL and keyboard labels");

  // Actual ProductForm action boundary: an upload cannot submit the product.
  let saves = 0; const state: unknown[] = []; let cursor = 0;
  const form = sourceModule<typeof import("../src/components/admin/product-form")>("src/components/admin/product-form.tsx", {
    react: { Fragment: React.Fragment, useTransition: () => [false, (callback: () => void) => callback()],
      useState: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value: unknown) => { state[index] = value; }]; },
      useRef: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
    }, "react/jsx-runtime": jsx, "@/lib/product-slug": slug, "@/store/lang-store": { useLangStore: () => ({ t: translations.en }) },
    "next/navigation": { useRouter: () => ({ push: () => {} }) }, sonner: { toast: { error: blocked, success: () => {} } },
    "@/components/admin/media-url-field": { MediaUrlField: "media-field" }, "@/components/admin/size-editor": { SizeEditor: "size-editor" }, "@/components/ui/button": { Button: "button" },
  });
  const renderForm = () => { cursor = 0; return elements(form.ProductForm({ categories: [], action: async () => { saves++; } })); };
  const fields = renderForm().filter((node) => node.type === "media-field"); assert.equal(fields.length, 2);
  const update = fields[0].props.onUploadStateChange as (name: string, busy: boolean) => void;
  update("imageUrl", true); (renderForm()[0].props.action as (data: FormData) => void)(new FormData()); assert.equal(saves, 0);
  update("imageUrl", false); assert.equal(saves, 0);
  (renderForm()[0].props.action as (data: FormData) => void)(new FormData()); await flush(); assert.equal(saves, 1);
  pass("product attachment changes only on explicit Save; active upload also blocks keyboard/form action submission");

  const source = readFileSync("src/app/api/product-media/upload/route.ts", "utf8");
  assert.ok(!/prisma|\bdel\s*\(/.test(source));
  for (const filePath of ["src/components/admin/media-url-field.tsx", "src/lib/media-upload-client.ts", "src/lib/media-upload.ts"]) assert.ok(!/BLOB_READ_WRITE_TOKEN|media-upload-server/.test(readFileSync(filePath, "utf8")));
  assert.equal(media.storefrontImage(url), url);
  assert.equal(media.storefrontImage("https://res.cloudinary.com/fixture/a.webp"), "https://res.cloudinary.com/fixture/a.webp");
  pass("no callback database/deletion effects, no server credential imports in client modules, existing Cloudinary and new Blob image compatibility");
  console.log(`PASS Stage 1.5: ${groups} isolated upload regression groups. No live storage, credentials or database access.`);
}
void verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = savedFetch;
  if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
});
