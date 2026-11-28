import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as pause } from "node:timers/promises";

async function until(test, label) {
  for (let n = 0; n < 160; n++) {
    if (await test()) return;
    await pause(100);
  }
  throw new Error("OPS02_SMOKE_" + label);
}

export async function browserSmoke(origin, edgePath) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const profile = mkdtempSync(join(tmpdir(), "3dkid-ops02-browser-"));
  const edge = edgePath || (process.platform === "win32"
    ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : "chromium");
  const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking",
    "--disable-sync", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], {
    windowsHide: true, stdio: "ignore",
  });
  let socket;
  let failure;
  const authResponses = [];
  browser.on("error", () => { failure = true; });
  try {
    let port;
    await until(() => {
      if (failure) throw new Error("OPS02_SMOKE_BROWSER_UNAVAILABLE");
      try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; } catch { return false; }
      return /^\d+$/.test(port);
    }, "BROWSER_PORT");
    const tabs = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
    socket = new WebSocket(tabs.find(tab => tab.type === "page").webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
    const tasks = new Map();
    const hydration = [];
    let sequence = 0;
    socket.onmessage = ({ data }) => {
      const result = JSON.parse(String(data));
      if (result.method === "Runtime.exceptionThrown" || result.method === "Runtime.consoleAPICalled") {
        if (/hydrat|#418|did not match/i.test(JSON.stringify(result.params))) hydration.push(true);
      }
      if (result.method === "Network.responseReceived") {
        const { url, status } = result.params.response;
        const address = new URL(url);
        if (address.origin === origin && /^\/(account\/sign-in|api\/customer-auth\/)/.test(address.pathname)) {
          authResponses.push(status);
        }
      }
      const task = tasks.get(result.id);
      if (task) {
        tasks.delete(result.id);
        clearTimeout(task.timeout);
        if (result.error) task.reject(new Error("OPS02_SMOKE_BROWSER_PROTOCOL")); else task.done(result.result);
      }
    };
    function send(method, params = {}) {
      return new Promise((done, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => { tasks.delete(id); reject(new Error("OPS02_SMOKE_BROWSER_PROTOCOL_TIMEOUT")); }, 15000);
        tasks.set(id, { done, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error("OPS02_SMOKE_BROWSER_EVALUATION");
      return result.result.value;
    }
    const check = (expression, label) => until(() => evaluate(expression), label);
    const hydrated = selector => "Object.keys(document.querySelector(" + JSON.stringify(selector) +
      ") || {}).some(key => key.startsWith('__reactProps$'))";
    async function go(path, expectation) {
      await send("Page.navigate", { url: origin + path });
      await check("document.readyState === 'complete' && location.pathname === " + JSON.stringify(path) +
        " && (" + expectation + ")", "PAGE_" + path.replace(/[^a-z0-9]/gi, "_"));
    }
    async function fill(selector, value) {
      await check("!!document.querySelector(" + JSON.stringify(selector) + ")", "FIELD");
      await evaluate("(() => { const input = document.querySelector(" + JSON.stringify(selector) + "); " +
        "Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input," + JSON.stringify(value) + ");" +
        "input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()");
    }
    const matchingButton = text => "[...document.querySelectorAll('.sf-checkout-form button')].find(button => button.textContent.includes(" + JSON.stringify(text) + "))";
    async function choose(label, stage) {
      await check("!!" + matchingButton(label), stage);
      await evaluate(matchingButton(label) + ".click()");
    }
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["https://*"] });
    await send("Network.setCookie", { name: "locale", value: "en", url: origin });
    await go("/", "!!document.querySelector('main h1')");
    await go("/catalog", "document.querySelector('main')?.innerText.includes('DEV Product')");
    await go("/product/dev-product-1", "document.querySelector('main h1')?.innerText.includes('DEV Product 1')");
    await go("/account/sign-in", hydrated("main form"));
    await fill("main input[name=email]", "customer-a@example.test");
    await fill("main input[name=password]", "3dkid-dev-customer-only!");
    await check("!!document.querySelector('main form button[type=submit]:enabled')", "SIGN_IN_READY");
    await evaluate("document.querySelector('main form').requestSubmit()");
    await check("location.pathname === '/account' && !!document.querySelector('main h1')", "CUSTOMER_ACCOUNT");
    await check("!!document.querySelector('[data-cart-state=ready]')", "RESTRICTED_CART_READY");
    if (await evaluate("document.querySelector('.sf-cart-count')?.textContent === '0'")) {
      await go("/catalog", "!!document.querySelector('[data-cart-state=ready]')");
      const add = "[...document.querySelectorAll('article')].find(card=>card.querySelector('a[href=\"/product/dev-product-1\"]'))?.querySelector('.sf-product-add')";
      await check("!!(" + add + ")", "CART_ADD_CONTROL");
      await evaluate("(" + add + ").click()");
      await check("document.querySelector('.sf-cart-count')?.textContent === '1'", "CART_ADD_RESTRICTED");
    }
    await go("/cart", "document.querySelector('main')?.innerText.includes('DEV Product 1')");
    await go("/checkout", hydrated(".sf-checkout-form"));
    await fill("#customerName", "Synthetic");
    await fill("#customerSurname", "Recipient");
    await fill("#customerPhone", "0500000000");
    await fill("#np-city", "DEV");
    await choose("DEV Київ", "MOCK_DELIVERY_CITY");
    await fill("#np-warehouse", "DEV");
    await choose("DEV Відділення", "MOCK_DELIVERY_WAREHOUSE");
    await check("!!document.querySelector('.sf-checkout-form button[type=submit]:enabled')", "CHECKOUT_READY");
    await evaluate("document.querySelector('.sf-checkout-form button[type=submit]').click()");
    await check("location.pathname === '/checkout/success' && !!document.querySelector('main h1')", "CHECKOUT_SUCCESS");
    if (hydration.length) throw new Error("OPS02_SMOKE_HYDRATION");
    console.log("Browser storefront, catalog, product, credentials, cart and mocked checkout PASS. No hydration errors.");
  } catch (error) {
    if (error.message === "OPS02_SMOKE_CUSTOMER_ACCOUNT") console.error("Synthetic auth HTTP statuses: " + authResponses.join(", "));
    throw error;
  } finally { socket?.close(); browser.kill(); }
}
