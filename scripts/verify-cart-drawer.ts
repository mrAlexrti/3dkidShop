// Real React + Framer Motion in an isolated, loopback-only Edge profile.
// Only Next navigation/images and Sonner delivery are stubbed; no server or DB imports.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as pause } from "node:timers/promises";
import { build } from "esbuild";

async function verify() {
  const fixture = resolve("scripts/fixtures/cart-drawer-environment.tsx");
  const modules: Record<string, string> = { "next/image": "Image as default", "next/link": "Link as default", "next/navigation": "usePathname, useRouter", sonner: "toast" };
  const bundle = await build({ entryPoints: ["scripts/fixtures/cart-drawer-browser.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "isolated-next-and-toast", setup(api) {
      api.onResolve({ filter: /^(next\/image|next\/link|next\/navigation|sonner)$/ }, ({ path }) => ({ path, namespace: "qa" }));
      api.onLoad({ filter: /.*/, namespace: "qa" }, ({ path }) => ({ contents: `export { ${modules[path]} } from ${JSON.stringify(fixture)};`, resolveDir: process.cwd() }));
    } }],
  });
  const server = createServer((request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; connect-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    if (request.url === "/qa.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === "/placeholder.svg") { response.setHeader("Content-Type", "image/svg+xml"); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>'); }
    else { response.setHeader("Content-Type", "text/html"); response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      body{margin:0} #root>div:not(:last-child){margin:4px} img{width:40px;height:40px} button{min-height:24px}
      .fixed{position:fixed}.inset-0{inset:0}[class*="z-[60]"]{z-index:60;background:#0005}
      aside[role=dialog]{right:0;top:0;width:min(100%,384px);height:100%;z-index:70;background:white}
      aside img,aside svg{width:20px;height:20px}
      </style></head><body><div id="root"></div><script src="/qa.js"></script></body></html>`); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const output = resolve(".next/cache/cart-drawer-qa"); mkdirSync(output, { recursive: true });
  const profile = resolve(output, `edge-${Date.now()}`);
  const browser = spawn(process.argv[2] || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket: WebSocket | undefined;
  try {
    let port = "";
    for (let attempt = 0; attempt < 100; attempt++) { try { port = readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; break; } catch { await pause(100); } }
    assert.ok(port, "Edge debugging port unavailable");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    socket = new WebSocket(targets.find((target) => target.type === "page")!.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => { socket!.onopen = () => done(); socket!.onerror = reject; });
    let id = 0;
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: unknown) => void }>();
    const exceptions: unknown[] = [];
    socket.onmessage = ({ data }) => {
      const msg = JSON.parse(String(data));
      if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params);
      const task = pending.get(msg.id); if (task) { pending.delete(msg.id); if (msg.error) task.reject(msg.error); else task.resolve(msg.result); }
    };
    const send = (method: string, params: object = {}) => new Promise<Record<string, unknown>>((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket!.send(JSON.stringify({ id: next, method, params })); });
    await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["https://*"] });
    const evaluate = async (expression: string) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return (result.result as { value: unknown }).value;
    };
    for (const width of [390, 1280]) for (const locale of ["ua", "en"]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
      await send("Page.navigate", { url: `${origin}/catalog` });
      let loaded = false;
      for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate("document.readyState === 'complete' && !!window.cartQA")) { loaded = true; break; } await pause(50); }
      assert.ok(loaded, "Local cart fixture failed to load");
      console.log(`PASS ${width}px ${await evaluate(`window.cartQA.run(${JSON.stringify(locale)})`)}`);
    }
    assert.deepEqual(exceptions, [], "Unhandled browser exceptions");
    console.log("PASS real drawer lifecycle: UA/EN desktop/mobile, actual React StrictMode/Framer/Zustand, no external requests or production data.");
  } finally { socket?.close(); browser.kill(); server.closeAllConnections(); server.close(); }
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
