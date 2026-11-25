// Offline previews only. Never load application .env files or send a message.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { challengeMinutes, emailPurposes, renderChallengeEmail } from "../src/lib/customer/email-template";
import { emailLogo } from "../src/lib/notifications/branded-email";
import { CONFIGURABLE_EVENTS } from "../src/lib/notifications/events";
import { renderNotification, type OrderForNotification } from "../src/lib/notifications/templates";
import { validOrderResultToken } from "../src/lib/payments/order-result";

const output = resolve("coverage/ux-08/emails");
const previewOrigin = "https://example.invalid";
process.env.NEXT_PUBLIC_SITE_URL = previewOrigin;
process.env.AUTH_SECRET = "offline-ux08-synthetic-preview-fixture";
const logo = "data:image/png;base64," + readFileSync("public/hero/logo.png").toString("base64");
const previews: { key: string; detail: boolean }[] = [];
const deliveryStatuses: Record<string, string> = {
  DELIVERY_SHIPPED: "handed to carrier", DELIVERY_IN_TRANSIT: "in transit",
  DELIVERY_ARRIVED: "ready for pickup", DELIVERY_DELIVERED: "delivered", DELIVERY_RETURNED: "returned to sender",
};
mkdirSync(output, { recursive: true });

function preview(key: string, html: string, detail: boolean) {
  assert.ok(html.includes(emailLogo) && html.includes("<!--[if mso]>"));
  assert.ok(!/<script\b|\bonclick=/.test(html), "Email is usable without JavaScript");
  writeFileSync(join(output, key + ".html"), html.replace(emailLogo, logo));
  previews.push({ key, detail });
}

for (const locale of ["ua", "en"] as const) {
  for (const purpose of emailPurposes) {
    const url = `${previewOrigin}/account/confirm?mode=${purpose}#preview`;
    const { html, subject } = renderChallengeEmail(purpose, locale, url);
    assert.ok(subject.length > 0);
    assert.equal(html.match(/href="/g)?.length, 2, "Button and fallback use the same URL");
    assert.ok(html.split(url).length >= 4, "Fallback URL is also visible as text");
    assert.ok(html.includes(String(challengeMinutes(purpose))), "Expiry is shown");
    preview(`${locale}-${purpose}`, html, purpose === "register" || purpose === "reset");
  }
  for (const event of CONFIGURABLE_EVENTS) {
    const order: OrderForNotification = {
      id: "preview-order", number: "3DK-PREVIEW-01", status: event === "ORDER_CREATED" ? "NEW" : "PROCESSING", paymentProvider: "mono",
      paymentStatus: event.startsWith("PAYMENT_") ? event.slice(8) : "PAID",
      novaPoshtaTtn: event.startsWith("DELIVERY_") ? "20400000000000" : null,
      novaPoshtaStatus: deliveryStatuses[event] ?? null,
      createdAt: new Date("2026-11-25T10:00:00Z"), customerName: locale === "ua" ? "Марія Тестова" : "Maria Sample",
      customerPhone: "", city: locale === "ua" ? "Тестове місто" : "Sample city",
      shippingAddress: locale === "ua" ? "Навчальне відділення № 1" : "Sample branch 1", total: 498,
      items: [{ productName: locale === "ua" ? "Рожевий дракончик" : "Pink pocket dragon",
        optionsJson: null, quantity: 2, price: 249 }],
    };
    if (order.paymentStatus === "PAID") order.paidAt = new Date("2026-11-25T10:08:00Z");
    if (event === "ORDER_COMPLETED") order.status = "COMPLETED";
    if (event === "ORDER_CANCELLED") order.status = "CANCELLED";
    const { html, subject } = renderNotification(event, order, locale);
    const action = html.match(/href="([^"]+)"/)?.[1];
    assert.ok(typeof action === "string", "Order status email has an action");
    const link = new URL(action.replaceAll("&amp;", "&"));
    const number = String(order.number);
    assert.equal(link.origin, previewOrigin);
    assert.equal(link.pathname, "/checkout/success");
    assert.equal(link.searchParams.get("order"), number);
    assert.ok(validOrderResultToken(number, link.searchParams.get("token") ?? ""), "Existing status capability is valid");
    assert.ok(subject.includes(number) && html.includes(order.items[0].productName));
    preview(`${locale}-${event.toLowerCase()}`, html.replace(action, previewOrigin + "/order-preview"), event === "ORDER_CREATED");
  }
}

writeFileSync(join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>3D Kid email previews</title>
<body style="font:16px system-ui;padding:24px;line-height:1.6"><h1>3D Kid email previews</h1>
<p>Synthetic data. Action links use a non-deliverable example domain.</p><ul>${previews.map(({ key, detail }) =>
  `<li><a href="${key}.html">${key}</a>${detail ? ` · <a href="${key}-desktop.png">desktop</a> · <a href="${key}-mobile.png">mobile</a>` : ""}</li>`
).join("")}</ul></body></html>`);

async function verifyLayouts() {
  const profile = mkdtempSync(resolve(output, "edge-profile-"));
  const browser = spawn(process.env.BATCH19_EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  const closed = new Promise<void>((resolve, reject) => {
    browser.once("error", reject);
    browser.once("close", () => resolve());
  });
  void closed.catch(() => {});
  let driver: WebSocket | undefined;
  try {
    let port = "";
    for (let attempt = 0; attempt < 80 && !port; attempt++) {
      try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; }
      catch { await pause(100); }
    }
    assert.match(port, /^\d+$/, "Edge is listening on loopback");
    const tabs: { type: string; webSocketDebuggerUrl: string }[] = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
    const page = tabs.find((tab) => tab.type === "page");
    assert.ok(page);
    const socket = driver = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = reject; });
    let counter = 0;
    function send<T = unknown>(method: string, params = {}) {
      return new Promise<T>((resolve, reject) => {
        const id = ++counter;
        const timeout = setTimeout(() => reject(new Error("CDP timeout: " + method)), 5000);
        socket.onmessage = ({ data }) => {
          const result = JSON.parse(String(data));
          if (result.id !== id) return;
          clearTimeout(timeout);
          if (result.error) reject(new Error(result.error.message));
          else resolve(result.result);
        };
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["http://*", "https://*"] });
    for (const [device, width, height] of [["mobile", 390, 960], ["desktop", 960, 900]] as const) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 680 });
      for (const { key, detail } of previews) {
        const url = pathToFileURL(join(output, key + ".html")).href;
        await send("Page.navigate", { url });
        let layout: { fits: boolean; logo: boolean } | undefined;
        for (let wait = 0; wait < 60 && !layout; wait++) {
          const frame = await send<{ result: { value?: typeof layout } }>("Runtime.evaluate", { returnByValue: true, expression:
            `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && ({
              fits: document.documentElement.scrollWidth <= innerWidth && innerWidth === ${width},
              logo: document.querySelector('img')?.naturalWidth > 0
            })`,
          });
          if (frame.result.value) layout = frame.result.value;
          else await pause(50);
        }
        assert.ok(layout?.fits && layout.logo, `${key} fits with logo at ${width}px`);
        if (detail) {
          const screenshot = await send<{ data: string }>("Page.captureScreenshot", { format: "png" });
          writeFileSync(join(output, `${key}-${device}.png`), Buffer.from(screenshot.data, "base64"));
        }
      }
    }
  } finally {
    driver?.close();
    browser.kill();
    await closed;
    assert.equal(dirname(profile), output);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  }
}

void verifyLayouts().then(() => {
  console.log(`PASS ${previews.length} localized templates, ${previews.length * 2} offline desktop/mobile layout checks, 12 detailed PNG previews`);
}).catch(error => { console.error(error); process.exitCode = 1; });
