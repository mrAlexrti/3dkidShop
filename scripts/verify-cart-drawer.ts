// Real React + Framer Motion in an isolated, loopback-only Edge profile.
// Only Next navigation/images and Sonner delivery are stubbed; no server or DB imports.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as pause } from "node:timers/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config";

async function verify() {
  const mediaUploads = process.argv.includes("--media-upload");
  const galleryAdmin = process.argv.includes("--gallery-admin");
  const variants = process.argv.includes("--variants");
  const addendum = process.argv.includes("--addendum");
  const fixture = resolve(galleryAdmin || variants || addendum ? "scripts/fixtures/gallery-admin-environment.tsx" : mediaUploads ? "scripts/fixtures/media-upload-environment.tsx" : "scripts/fixtures/cart-drawer-environment.tsx");
  const modules: Record<string, string> = { "next/image": "Image as default", "next/link": "Link as default", "next/navigation": "usePathname, useRouter", sonner: "toast", "@/lib/actions/reconcile-cart": "lookupCartProducts", "@vercel/blob/client": "upload" };
  const bundle = await build({ entryPoints: [addendum ? "scripts/fixtures/addendum-browser.tsx" : variants ? "scripts/fixtures/variants-browser.tsx" : galleryAdmin ? "scripts/fixtures/gallery-admin-browser.tsx" : mediaUploads ? "scripts/fixtures/media-upload-browser.tsx" : "scripts/fixtures/cart-drawer-browser.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "isolated-next-and-toast", setup(api) {
      api.onResolve({ filter: /^(next\/image|next\/link|next\/navigation|sonner|@\/lib\/actions\/reconcile-cart|@vercel\/blob\/client)$/ }, ({ path }) => ({ path, namespace: "qa" }));
      api.onLoad({ filter: /.*/, namespace: "qa" }, ({ path }) => ({ contents: `export { ${modules[path]} } from ${JSON.stringify(fixture)};`, resolveDir: process.cwd() }));
    } }],
  });
  const actualStyles = galleryAdmin || variants || addendum ? (await postcss([tailwindcss(tailwindConfig)]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css + readFileSync("src/app/(shop)/storefront.css", "utf8") : "";
  const server = createServer((request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; connect-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    if (request.url === "/qa.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === "/placeholder.svg") { response.setHeader("Content-Type", "image/svg+xml"); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>'); }
    else { response.setHeader("Content-Type", "text/html"); response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      ${galleryAdmin || addendum || variants ? actualStyles : `body{margin:0} #root>div:not(:last-child){margin:4px} img{width:40px;height:40px} button{min-height:24px}
      .fixed{position:fixed}.inset-0{inset:0}[class*="z-[60]"]{z-index:60;background:#0005}
      aside[role=dialog]{right:0;top:0;width:min(100%,384px);height:100%;z-index:70;background:white}
      aside img,aside svg{width:20px;height:20px}`}
      </style></head><body><div id="root"></div><script src="/qa.js"></script></body></html>`); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const output = resolve(".next/cache/cart-drawer-qa"); mkdirSync(output, { recursive: true });
  if (galleryAdmin) writeFileSync(resolve(output, "gallery-admin-qa.js"), bundle.outputFiles[0].contents);
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
    const qa = addendum ? "addendumQA" : variants ? "variantsQA" : galleryAdmin ? "galleryAdminQA" : mediaUploads ? "mediaUploadQA" : "cartQA";
    for (const width of mediaUploads || galleryAdmin || variants || addendum ? [320, 390, 1280] : [390, 1280]) for (const locale of ["ua", "en"]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
      if (addendum) {
        await send("Emulation.setTouchEmulationEnabled", { enabled: width < 700, maxTouchPoints: 1 });
        await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
      }
      await send("Page.navigate", { url: `${origin}/catalog` });
      let loaded = false;
      for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(`document.readyState === 'complete' && !!window.${qa}`)) { loaded = true; break; } await pause(50); }
      assert.ok(loaded, "Local cart fixture failed to load");
      if (mediaUploads) {
        await evaluate(`window.${qa}.setup(${JSON.stringify(locale)})`);
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      }
      console.log(`PASS ${width}px ${await evaluate(`window.${qa}.run(${JSON.stringify(locale)})`)}`);
      if (addendum) {
        await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
        assert.equal(await evaluate("window.addendumQA.reduced()"), true);
        assert.equal(await evaluate("window.addendumQA.openDialog()"), true);
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate("document.activeElement===document.querySelector('dialog[open] button:last-child')"), true);
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        assert.equal(await evaluate("window.addendumQA.closedByKeyboard()"), true);
      }
    }
    assert.deepEqual(exceptions, [], "Unhandled browser exceptions");
    console.log(addendum ? "PASS addendum: actual React/DOM at 320/390/1280, UA/EN, Unicode divider, coarse-pointer autoplay, keyboard confirmations, reduced motion and simulated visibility; no live services." : variants ? "PASS native variants: actual React/DOM, sparse choices and Admin preservation, UA/EN mobile/desktop, no live services." : galleryAdmin ? "PASS gallery/Admin reliability: real React/DOM and native dialogs, UA/EN mobile/desktop, mocked Blob and actions, no live services." : mediaUploads ? "PASS real Admin media uploads: UA/EN desktop/mobile, native keyboard activation, actual React StrictMode/product form, mocked Blob SDK, no external requests or production data."
      : "PASS real drawer lifecycle: UA/EN desktop/mobile, actual React StrictMode/Framer/Zustand, no external requests or production data.");
  } finally { socket?.close(); browser.kill(); server.closeAllConnections(); server.close(); }
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
