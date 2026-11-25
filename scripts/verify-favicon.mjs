// Official asset + actual isolated Next build/HTTP/Chrome checks. No live services.
import assert from "node:assert/strict";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as pause } from "node:timers/promises";

const directory = resolve(".next/cache/batch18-favicon");
mkdirSync(directory, { recursive: true });
const logo = readFileSync("public/hero/logo.png");
assert.deepEqual(logo, execFileSync("git", ["show", "HEAD:public/hero/logo.png"]));
const ico = readFileSync("public/favicon.ico");
assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 4);
let offset = 70;
for (const [index, size] of [16, 32, 48, 96].entries()) {
  const entry = 6 + index * 16, length = ico.readUInt32LE(entry + 8);
  assert.equal(ico[entry], size); assert.equal(ico[entry + 1], size);
  assert.equal(ico.readUInt32LE(entry + 12), offset);
  assert.equal(ico.readUInt16LE(entry + 6), 32);
  const frame = ico.subarray(offset, offset + length), meta = await sharp(frame).metadata();
  assert.equal(meta.width, size); assert.equal(meta.height, size);
  assert.ok(meta.hasAlpha);
  assert.deepEqual(frame, readFileSync(`public/favicon-${size}.png`));
  offset += length;
}
assert.equal(offset, ico.length);
const icon = await sharp("public/favicon-96.png").metadata(), apple = await sharp("public/apple-touch-icon.png").metadata();
assert.equal(icon.width, 96); assert.equal(icon.height, 96); assert.ok(icon.hasAlpha);
assert.equal(apple.width, 180); assert.equal(apple.height, 180); assert.ok(apple.hasAlpha);
const pixels = await sharp("public/favicon-96.png").ensureAlpha().raw().toBuffer();
assert.equal(pixels[3], 0, "Transparent top-left corner");
assert.equal(pixels[4 * (48 * 96 + 48) + 3], 255, "Opaque mark center");
assert.ok(ico.length < 20000 && readFileSync("public/favicon-96.png").length < 20000 && readFileSync("public/apple-touch-icon.png").length < 30000);
console.log("PASS favicon assets: unchanged storefront artwork, transparent ICO/PNG frames at 16/32/48/96 and 180 px Apple icon.");
const reuseIndex = process.argv.indexOf("--output");
if (!process.argv.includes("--build") && reuseIndex < 0) process.exit(0);

// Intercept Next's dotenv loader before config loads; do not read project secrets.
const noEnv = resolve(directory, "no-env.cjs");
writeFileSync(noEnv, `
const Module = require('node:module');
const load = Module._load;
Module._load = function(name, parent, main) {
  const result = load.call(this, name, parent, main);
  if (name === '@next/env') return { ...result, loadEnvConfig: () => ({ combinedEnv: process.env, parsedEnv: {}, loadedEnvFiles: [] }) };
  return result;
};
`);
const env = {};
for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "PATH", "Path", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"])
  if (process.env[key] !== undefined) env[key] = process.env[key];
Object.assign(env, { NODE_OPTIONS: `--require=${JSON.stringify(noEnv)}`, NEXT_TELEMETRY_DISABLED: "1", ONLINE_PAYMENT_MODE: "disabled", VERCEL_ENV: "", PRODUCT_VARIANTS_ENABLED: "", PRODUCT_MEDIA_CLEANUP_ENABLED: "", DATABASE_URL: "" });
let output;
if (reuseIndex >= 0) {
  output = process.argv[reuseIndex + 1];
  assert.match(output, /^\.next\/cache\/batch17-build-output-\d+$/);
  assert.equal(JSON.parse(readFileSync(`${output}/required-server-files.json`, "utf8")).config.distDir, output);
} else {
  const before = new Set(readdirSync(".next/cache"));
  const build = spawn(process.execPath, ["scripts/verify-build-isolated.mjs"], { env, stdio: "inherit", windowsHide: true });
  await new Promise((done, fail) => { build.once("error", fail); build.once("exit", (code) => code === 0 ? done() : fail(new Error(`Isolated build exit ${code}`))); });
  const outputs = readdirSync(".next/cache").filter((name) => /^batch17-build-output-\d+$/.test(name) && !before.has(name));
  assert.equal(outputs.length, 1, "Use only this run's fresh build output");
  output = `.next/cache/${outputs[0]}`;
}
const portProbe = createServer();
await new Promise((done) => portProbe.listen(0, "127.0.0.1", done));
const port = portProbe.address().port;
await new Promise((done) => portProbe.close(done));
const prismaFixture = resolve(".next/cache/batch17-build/isolated-prisma.cjs");
assert.ok(readFileSync(prismaFixture, "utf8").includes(`distDir: ${JSON.stringify(output)}`), "Fixture must target the exact selected isolated build");
env.NODE_OPTIONS += ` --use-system-ca --require=${JSON.stringify(prismaFixture)}`;
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, windowsHide: true, stdio: "ignore" });
const origin = `http://127.0.0.1:${port}`;
let browser, socket;
const results = { output, assets: {}, http: [], browser: [] };
try {
  let ready = false;
  for (let i = 0; i < 120; i++) { try { ready = (await fetch(`${origin}/robots.txt`)).ok; } catch { /* local startup */ } if (ready) break; await pause(250); }
  assert.ok(ready, "Isolated Next server failed to become ready");
  const robot = await (await fetch(`${origin}/robots.txt`)).text();
  assert.match(robot, /Allow: \/\s/); assert.match(robot, /Disallow: \/admin/);
  assert.ok(!/Disallow:.*(?:favicon|icon\.png|\/$)/m.test(robot));
  let sharedLinks;
  for (const locale of ["ua", "en"]) for (const route of ["/", "/catalog"]) {
    const response = await fetch(`${origin}${route}`, { headers: { cookie: `locale=${locale}`, "user-agent": "Googlebot" }, redirect: "manual" });
    assert.equal(response.status, 200);
    const html = await response.text(), head = html.slice(html.indexOf("<head>"), html.indexOf("</head>") + 7);
    writeFileSync(resolve(directory, `metadata-${locale}-${route === "/" ? "home" : "catalog"}.html`), html);
    assert.ok(html.includes(`lang="${locale === "en" ? "en" : "uk"}"`));
    // Next 15 streams metadata for JS-capable Googlebot, then hoists icon links.
    // Preserve the app's existing streaming policy; verify the final DOM below.
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])))
      .filter(({ rel }) => rel === "icon" || rel === "apple-touch-icon");
    assert.equal(links.length, 6, "One ICO, four PNG sizes, and one Apple icon");
    assert.ok(links.some((l) => l.href.startsWith("/favicon.ico")));
    assert.ok(links.some((l) => l.href === "/favicon-96.png" && l.sizes === "96x96"));
    assert.ok(links.some((l) => l.href === "/apple-touch-icon.png" && l.sizes === "180x180"));
    assert.ok(head.includes('rel="icon"') || html.includes("document.head.appendChild"), "Streamed icons must be hoisted into head");
    if (sharedLinks) assert.deepEqual(links, sharedLinks); else sharedLinks = links;
    for (const link of links) {
      assert.equal(new URL(link.href, "https://www.3dkid.shop").origin, "https://www.3dkid.shop");
      const asset = await fetch(new URL(link.href, origin), { headers: { "user-agent": "Googlebot-Image" }, redirect: "manual" });
      assert.equal(asset.status, 200); assert.match(asset.headers.get("content-type"), /image\//);
      const pathname = new URL(link.href, origin).pathname;
      assert.deepEqual(Buffer.from(await asset.arrayBuffer()), readFileSync(`src/app${pathname}`));
      assert.equal((await fetch(new URL(link.href, origin), { method: "HEAD", redirect: "manual" })).status, 200);
      results.assets[pathname] = { type: asset.headers.get("content-type"), bytes: readFileSync(`src/app${pathname}`).length };
    }
    results.http.push({ locale, route, status: 200, links });
  }
  const limited = await (await fetch(origin, { headers: { "user-agent": "Bingbot" } })).text();
  const limitedHead = limited.slice(limited.indexOf("<head>"), limited.indexOf("</head>"));
  assert.ok(limitedHead.includes('href="/favicon.ico"') && limitedHead.includes('href="/favicon-96.png"') && limitedHead.includes('href="/apple-touch-icon.png"'));
  console.log("PASS actual Next HTTP: UA/EN metadata/hoisting, HTML-limited crawler head links, stable URLs, anonymous GET/HEAD 200, Googlebot/Image and robots compatibility.");

  const profile = resolve(directory, `chrome-${Date.now()}`);
  browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-extensions", "--disable-sync", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let browserPort;
  for (let i = 0; i < 100; i++) { try { browserPort = readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; break; } catch { await pause(100); } }
  assert.ok(browserPort, "Local Chrome debugging port unavailable");
  const targets = await (await fetch(`http://127.0.0.1:${browserPort}/json`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let id = 0; const pending = new Map();
  socket.onmessage = ({ data }) => { const msg = JSON.parse(String(data)), item = pending.get(msg.id); if (item) { pending.delete(msg.id); if (msg.error) item.fail(new Error(msg.error.message)); else item.done(msg.result); } };
  const send = (method, params = {}) => new Promise((done, fail) => { const next = ++id; pending.set(next, { done, fail }); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, "Browser assertion failed"); return r.result.value; };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["https://*", "http://*.google.com/*"] });
  for (const locale of ["ua", "en"]) for (const mobile of [false, true]) for (const theme of ["light", "dark"]) {
    await send("Network.setCookie", { name: "locale", value: locale, url: origin });
    await send("Emulation.setDeviceMetricsOverride", { width: mobile ? 390 : 1280, height: 900, deviceScaleFactor: 1, mobile });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
    await send("Page.navigate", { url: `${origin}/catalog` });
    let loaded = false;
    for (let i = 0; i < 100; i++) { loaded = await evaluate('Boolean(location.pathname==="/catalog" && document.querySelector("header a.sf-brand img") && document.querySelectorAll(\'head link[rel="icon"]\').length===5)'); if (loaded) break; await pause(100); }
    assert.ok(loaded, "Catalog icon metadata/header missing");
    const info = await evaluate(`(async()=>{const links=[...document.querySelectorAll('head link[rel="icon"],head link[rel="apple-touch-icon"]')].map(l=>l.getAttribute('href'));for(const href of links){const i=new Image();i.src=href;await i.decode();if(!i.naturalWidth)throw Error('decode');}const a=document.querySelector('a.sf-brand');if(a.getAttribute('href')!=='/'||a.querySelector('img').alt!=='3D kid')throw Error('brand');a.focus();return {lang:document.documentElement.lang,links,focused:document.activeElement===a};})()`);
    assert.equal(info.lang, locale === "en" ? "en" : "uk"); assert.equal(info.links.length, 3); assert.ok(info.focused);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    let navigated = false;
    for (let i = 0; i < 100; i++) { navigated = await evaluate('location.pathname==="/"'); if (navigated) break; await pause(100); }
    assert.ok(navigated, "Existing header logo must still navigate home");
    results.browser.push({ locale, width: mobile ? 390 : 1280, theme, imageDecode: true, headerKeyboardNavigation: true });
    console.log(`PASS Chrome ${locale} ${mobile ? 390 : 1280}px ${theme}: icon decoding/metadata and header logo home link.`);
  }
  results.sourceSha256 = createHash("sha256").update(logo).digest("hex");
  writeFileSync(resolve(directory, "results.json"), JSON.stringify(results, null, 2));
  console.log("PASS favicon integration. Physical mobile/Safari, native tab/bookmark UI and deployed Google recrawl remain NOT TESTED.");
} finally {
  socket?.close(); browser?.kill(); server.kill();
}
