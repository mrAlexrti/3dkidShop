// Focused browser tests against the rehearsal's production build and mock providers.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

const directory = process.env.BATCH19_QA_DIRECTORY;
const origin = process.env.BATCH19_APP_ORIGIN;
const dbUrl = new URL(process.env.BATCH19_OWNER_DATABASE_URL);
assert.equal(dbUrl.hostname, "127.0.0.1");
assert.equal(dbUrl.username, "batch18a_qa");
assert.equal(dbUrl.pathname, "/batch18_review_" + process.env.BATCH19_QA_MARKER);
assert.equal(new URL(origin).hostname, "127.0.0.1");
assert.equal(readFileSync(join(directory, "qa-marker"), "utf8"), process.env.BATCH19_QA_MARKER);
const db = new PrismaClient({ datasourceUrl: dbUrl.href });
const profile = join(directory, "edge");
const browser = spawn(process.env.BATCH19_EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let driver;
let selectedGoogle = "new";
let badState = false;
const credentials = { email: "qa.customer@gmail.com", password: "Registration!123" };
const main = "main";
const newPassword = "Recovery!123";
const savedId = "qa_product";
const favoritesApi = "/api/customer-favorites";
const currentMail = () => readFileSync(process.env.BATCH19_MAIL_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const request = (path, cookie) => fetch(origin + path, { headers: cookie ? { cookie } : undefined, redirect: "manual" });
const passes = (message) => console.log("PASS " + message);
async function until(test, description) {
  for (let i = 0; i < 110; i++) {
    const result = await test();
    if (result) return result;
    await pause(90);
  }
  throw new Error("Timed out waiting for " + description);
}

try {
  const port = await until(() => {
    try { return readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; } catch { return ""; }
  }, "headless browser");
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
  driver = new WebSocket(targets.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((done, fail) => { driver.onopen = done; driver.onerror = fail; });
  let counter = 0;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((done, fail) => {
      const id = ++counter;
      pending.set(id, { done, fail });
      driver.send(JSON.stringify({ id, method, params }));
    });
  }
  let providerFailure;
  let googleRequests = 0;
  let interceptionFailure;
  let browserException;
  function finishRequest(method, parameters) {
    void send(method, parameters).catch((error) => {
      // Navigation can cancel a subresource after Edge reports it as paused.
      if (!/invalid interception|request is already handled|invalid request id/i.test(error.message)) interceptionFailure ??= error.message;
    });
  }
  driver.onmessage = ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      browserException = (details.exception?.description ?? details.text).split("\n")[0];
    }
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request: { url } } = message.params;
      if (url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")) {
        googleRequests++;
        const params = new URL(url).searchParams;
        if (params.get("redirect_uri") !== origin + "/api/customer-auth/callback/google") providerFailure = "Incorrect Google callback URL";
        if (params.get("code_challenge_method") !== "S256" || !params.get("nonce") || !params.get("state")) providerFailure = "Missing Google callback checks";
        const code = [selectedGoogle, params.get("nonce"), params.get("code_challenge")].join(".");
        const callback = new URL(origin + "/api/customer-auth/callback/google");
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", badState ? "invalid-local-state" : params.get("state"));
        finishRequest("Fetch.fulfillRequest", { requestId, responseCode: 302, responseHeaders: [{ name: "location", value: callback.href }] });
      } else if (url.startsWith(origin + "/")) finishRequest("Fetch.continueRequest", { requestId });
      else finishRequest("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    }
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); if (message.error) task.fail(new Error(message.error.message)); else task.done(message.result); }
  };
  await send("Page.enable");
  await send("Network.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "http://*" }, { urlPattern: "https://*" }] });
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Browser script failed: " + (result.result.description || expression));
    return result.result.value;
  }
  async function path(expected) {
    try {
      await until(() => evaluate(`location.pathname === ${JSON.stringify(expected)} && document.readyState === "complete"`), expected);
    } catch (error) {
      const current = await evaluate("({ url: location.origin + location.pathname, text: document.querySelector('main')?.innerText?.slice(0, 450) })");
      throw new Error(`${error.message} from ${current.url}; Google requests ${googleRequests}; ${providerFailure ?? ""} ${browserException ?? ""} ${current.text ?? ""}`);
    }
  }
  async function go(url, expected = new URL(url, origin).pathname) {
    const target = new URL(url, origin);
    assert.equal(target.origin, origin);
    await send("Page.navigate", { url: target.href });
    await path(expected);
  }
  async function fill(selector, value) {
    await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), selector);
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
  }
  async function submit(selector = "main form") {
    await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})?.querySelector('button:not(:disabled)')`), selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
  }
  async function textIncludes(value, selector = "body") {
    try {
      await until(() => evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText.includes(${JSON.stringify(value)})`), value);
    } catch (error) {
      const active = await evaluate("({ path: location.pathname, text: document.querySelector('main')?.innerText?.slice(0, 500) })");
      throw new Error(`${error.message} in ${active.path}: ${active.text}`);
    }
  }
  async function accountCookie() {
    const { cookies } = await send("Network.getCookies", { urls: [origin] });
    const session = cookies.find((cookie) => cookie.name === "3dkid.customer.session");
    assert.ok(session?.httpOnly && session.sameSite === "Lax", "Customer session cookie attributes");
    return session.name + "=" + session.value;
  }
  async function messageLink(mode, indexBefore) {
    const mail = await until(() => currentMail().slice(indexBefore).find((entry) => entry.html.includes("mode=" + mode + "#")), mode + " email");
    const match = mail.html.match(/href="([^"]+)"/);
    assert.ok(match);
    assert.equal(new URL(match[1]).origin, origin);
    return match[1];
  }
  async function emailForm(mode, email) {
    const before = currentMail().length;
    await go("/account/sign-in?mode=" + mode);
    await fill("main [name=email]", email);
    await submit();
    await textIncludes("you’ll receive an email", main);
    return before;
  }
  async function confirm(link, password, expected = "Changes saved.") {
    await send("Page.navigate", { url: "about:blank" });
    await until(() => evaluate("location.href === 'about:blank'"), "fresh confirmation navigation");
    await go(link);
    await until(() => evaluate("document.querySelector('input[name=token]')?.value.length === 43 && !location.hash"), "token form");
    if (password) await fill("main input[name=password]", password);
    await submit();
    await textIncludes(expected, main);
  }
  async function signIn(email, password, expected = "/account") {
    await go("/account/sign-in");
    await fill("main input[name=email]", email);
    await fill("main input[name=password]", password);
    await submit();
    if (expected === "/account") await path(expected);
    else await textIncludes(expected, main);
  }
  async function signOut() {
    await go("/account");
    await submit("main nav form");
    await path("/account/sign-in");
  }
  async function addCart() {
    await go("/catalog");
    await evaluate(`[...document.querySelectorAll('article')].find(el => el.querySelector('a[href="/product/qa-cat"]')).querySelector('.sf-product-add').click()`);
    await go("/checkout");
    await until(() => evaluate("!!document.querySelector('#customerEmail')"), "checkout after guest add");
  }

  async function deniedOrder(id, cookie) {
    const response = await request("/account/orders/" + id, cookie);
    // A loading boundary may start the response before Next sends the not-found entry.
    const html = await response.text();
    assert.ok(response.status === 404 || (response.status === 200 && html.includes("NEXT_HTTP_ERROR_FALLBACK;404")));
    assert.doesNotMatch(html, /Historic recipient|Gift Recipient|Historical medium/);
  }
  async function checkout(details) {
    for (const [selector, value] of Object.entries(details)) await fill(selector, value);
    await fill("#np-city", "Kyiv");
    await fill("#np-warehouse", "Test branch");
    await until(() => evaluate("!!document.querySelector('.sf-checkout-form button[type=submit]:not(:disabled)')"), "checkout cart reconciled");
    await evaluate("document.querySelector('.sf-checkout-form button[type=submit]').click()");
    await path("/checkout/success");
  }

  const outside = await request("/account/orders/claim_order");
  assert.ok([200, 307].includes(outside.status));
  assert.match(outside.headers.get("location") ?? await outside.text(), /account\/sign-in/);
  await go("/account/orders/claim_order", "/account/sign-in");
  assert.match((await request(favoritesApi)).headers.get("cache-control"), /private.*no-store/);
  assert.match((await request("/account/sign-in")).headers.get("cache-control"), /no-store/);
  assert.equal(await (await request(favoritesApi)).json().then((x) => x.ids), null);
  assert.equal((await fetch(origin + favoritesApi, { method: "POST", headers: { origin } })).status, 405);
  assert.equal((await fetch(origin + "/api/customer-auth/start/google", {
    method: "POST", headers: { origin: "https://cross-origin.example.test" }, body: new URLSearchParams({ mode: "signin" }),
  })).status, 403);

  await go("/catalog");
  await evaluate("document.cookie = 'locale=en; path=/'");
  await go("/catalog");
  const cardSelector = '.sf-product-card:has(a[href="/product/qa-cat"])';
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(cardSelector + " .sf-product-visual button[aria-pressed]:not(:disabled)")})`), "catalog favorite ready");
  for (const width of [320, 768, 1280]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    assert.equal(await evaluate(`(() => {
      const card = document.querySelector(${JSON.stringify(cardSelector)});
      const visual = card.querySelector('.sf-product-visual').getBoundingClientRect();
      const heart = card.querySelector('button[aria-pressed]').getBoundingClientRect();
      const cart = card.querySelector('.sf-product-add').getBoundingClientRect();
      return heart.width > 0 && heart.right <= visual.right && heart.bottom <= visual.bottom && cart.top >= visual.bottom;
    })()`), true, `catalog favorite and cart control geometry at ${width}px`);
  }
  await evaluate(`document.querySelector(${JSON.stringify(cardSelector + ' button[aria-pressed]')}).click()`);
  await until(() => evaluate("JSON.parse(localStorage.getItem('3dkid.guest-favorites'))?.includes('qa_product')"), "catalog favorite storage");
  await path("/catalog");
  await go("/product/qa-cat");
  await until(() => evaluate("!!document.querySelector('main button[aria-label^=Remove]:not(:disabled)[aria-pressed=true]')"), "catalog and product detail share guest favorites");
  await addCart();
  assert.equal(await evaluate("document.querySelector('#customerEmail').value"), "");
  await checkout({ "#customerName": "Guest", "#customerSurname": "Recipient", "#customerPhone": "0501112211" });
  assert.equal(await db.order.count({ where: { customerName: "Guest Recipient", customerEmail: null, customerId: null } }), 1);
  await addCart();
  const index = await emailForm("register", credentials.email);
  const registration = await messageLink("register", index);
  await confirm(registration, credentials.password);
  await confirm(registration, credentials.password, "Check your details.");
  const duplicateIndex = await emailForm("register", credentials.email);
  await signIn(credentials.email, credentials.password);
  const nativeCookie = await accountCookie();
  assert.equal(currentMail().slice(duplicateIndex).some((message) => message.html.includes("mode=register")), false);
  await until(async () => (await (await request(favoritesApi, nativeCookie)).json()).ids.includes(savedId), "guest favorite merge");
  const user = await db.user.findUniqueOrThrow({ where: { email: credentials.email } });
  assert.equal(user.role, "CUSTOMER");
  assert.equal(await db.customerFavorite.count({ where: { userId: user.id } }), 1);
  await go("/account/favorites");
  await textIncludes("Cat", main);
  await until(() => evaluate("!!document.querySelector('main button[aria-label^=Remove]:not(:disabled)[aria-pressed]')"), "favorite removal control");
  await evaluate("document.querySelector('main button[aria-label^=Remove][aria-pressed]').click()");
  await until(async () => (await db.customerFavorite.count({ where: { userId: user.id } })) === 0, "favorite removal");
  await until(() => evaluate("!!localStorage.getItem('3dkid.favorites-sync')"), "authenticated favorite cross-tab notification");
  await go("/product/qa-cat");
  await until(() => evaluate("!!document.querySelector('main button[aria-label^=Add]:not(:disabled)[aria-pressed]')"), "account favorite control");
  await evaluate("document.querySelector('main button[aria-label^=Add][aria-pressed]').click()");
  await until(async () => (await db.customerFavorite.count({ where: { userId: user.id } })) === 1, "favorite restored");
  await db.product.update({ where: { id: savedId }, data: { isOrderable: false } });
  await go("/account/favorites");
  assert.equal(await evaluate("document.querySelector('.sf-product-add')?.disabled"), true);
  await db.product.update({ where: { id: savedId }, data: { isOrderable: true } });
  const temporaryFavorite = await db.product.create({ data: {
    name: "Temporary favorite", slug: "qa-temporary-favorite", description: "Synthetic", price: 20, categoryId: "qa_category",
  }, select: { id: true } });
  await go("/product/qa-temporary-favorite");
  await until(() => evaluate("!!document.querySelector('main button[aria-label^=Add]:not(:disabled)[aria-pressed]')"), "temporary favorite control");
  await evaluate("document.querySelector('main button[aria-label^=Add][aria-pressed]').click()");
  await until(async () => (await db.customerFavorite.count({ where: { userId: user.id, productId: temporaryFavorite.id } })) === 1, "temporarily saved");
  await db.product.delete({ where: { id: temporaryFavorite.id } });
  const savedFavorites = await (await request(favoritesApi, nativeCookie)).json();
  assert.deepEqual(savedFavorites.ids, [savedId]);
  assert.match(savedFavorites.version, /^[a-f0-9]{64}$/);
  const admin = await request("/admin", nativeCookie);
  assert.match(admin.headers.get("location"), /\/login/);
  assert.equal((await fetch(origin + "/api/admin/orders/claim_order/create-ttn", { method: "POST", headers: { cookie: nativeCookie } })).status, 401);
  await deniedOrder("claim_order", nativeCookie);
  passes("guest checkout with NULL email, verification/replay, native session, guest merge, cache isolation and admin boundaries");

  await go("/account/profile");
  await fill("main [name=firstName]", "Profile");
  await fill("main [name=lastName]", "Name");
  await fill("main [name=phone]", "0501234567");
  await submit("main section form");
  await until(async () => (await db.user.findUnique({ where: { id: user.id }, select: { firstName: true } }))?.firstName === "Profile", "profile write");
  await textIncludes("Changes saved.", main);
  await go("/checkout");
  await until(() => evaluate("document.querySelector('#customerEmail')?.value === 'qa.customer@gmail.com'"), "checkout prefill and cart preservation");
  assert.equal(await evaluate("document.querySelector('#customerName').value"), "Profile");
  await checkout({ "#customerEmail": "", "#customerName": "Gift", "#customerSurname": "Recipient", "#customerPhone": "0502223344" });
  const gift = await db.order.findFirstOrThrow({ where: { customerName: "Gift Recipient" }, include: { items: true } });
  assert.equal(gift.customerId, user.id);
  assert.equal(gift.customerEmail, null);
  assert.equal(gift.customerPhone, "0502223344");
  assert.equal(gift.items[0].productImageUrl, "/images/placeholder.svg");
  await addCart();
  await checkout({ "#customerEmail": "other@example.test", "#customerName": "Different", "#customerSurname": "Contact" });
  const different = await db.order.findFirstOrThrow({ where: { customerName: "Different Contact" } });
  assert.equal(different.customerId, user.id);
  assert.equal(different.customerEmail, "other@example.test");
  await go("/account/orders/" + gift.id);
  await textIncludes("Gift Recipient", main);

  await go("/account/orders");
  const claimIndex = currentMail().length;
  await fill("main input[name=number]", "102");
  await submit("main article form, main section > div form");
  await textIncludes("you’ll receive an email", main);
  assert.equal(await db.customerChallenge.count({ where: { orderId: "phone_order" } }), 0);
  await fill("main input[name=number]", "101");
  await submit("main article form, main section > div form");
  const expiredClaim = await messageLink("claim", claimIndex);
  await db.customerChallenge.updateMany({ where: { orderId: "claim_order", purpose: "claim" }, data: { expires: new Date(0) } });
  await confirm(expiredClaim, undefined, "Check your details.");
  await go("/account/orders");
  const freshClaimIndex = currentMail().length;
  await fill("main input[name=number]", "101");
  await submit("main article form, main section > div form");
  const claim = await messageLink("claim", freshClaimIndex);
  const conflictingIndex = currentMail().length;
  await fill("main input[name=number]", "101");
  await submit("main article form, main section > div form");
  const conflictingClaim = await messageLink("claim", conflictingIndex);
  await confirm(claim);
  await confirm(conflictingClaim, undefined, "Check your details.");
  await confirm(claim, undefined, "Check your details.");
  await db.product.update({ where: { id: savedId }, data: { name: "New name", price: 444, isActive: false } });
  await go("/account/orders/claim_order");
  await textIncludes("Historical name", main);
  await textIncludes("Historical medium", main);
  await textIncludes("Historic recipient", main);
  await textIncludes("Recorded address", main);
  await textIncludes("Cash on Delivery", main);
  assert.equal(await db.order.count({ where: { customerId: user.id, id: "claim_order", total: 37 } }), 1);
  await go("/account/favorites");
  await textIncludes("haven’t saved any favorites", main);
  await db.product.update({ where: { id: savedId }, data: { isActive: true } });
  passes("checkout prefill, guest cart through sign-in, cleared and differing recipient/email, verified guest claim and historical snapshots");

  await signOut();
  assert.equal((await (await request(favoritesApi, nativeCookie)).json()).ids, null);
  const resetIndex = await emailForm("reset", credentials.email);
  const recovery = await messageLink("reset", resetIndex);
  await db.customerChallenge.updateMany({ where: { userId: user.id, purpose: "reset" }, data: { expires: new Date(0) } });
  await confirm(recovery, newPassword, "Check your details.");
  const resetAgain = await emailForm("reset", credentials.email);
  const freshRecovery = await messageLink("reset", resetAgain);
  await signIn(credentials.email, credentials.password);
  const beforeReset = await accountCookie();
  await confirm(freshRecovery, newPassword);
  assert.equal((await (await request(favoritesApi, beforeReset)).json()).ids, null);
  await confirm(freshRecovery, newPassword, "Check your details.");
  await signIn(credentials.email, credentials.password, "Sign-in failed.");
  await signIn(credentials.email, newPassword);
  passes("expired and used recovery proof rejected, password reset revokes sessions, new credential persists");

  // Protected linking uses the existing password, OAuth state and the same signed-in customer.
  await go("/account/profile");
  selectedGoogle = "same";
  await fill("main [name=password]", newPassword);
  await submit("main form:has(input[name=password])");
  await path("/account");
  assert.equal(providerFailure, undefined);
  assert.equal((await db.account.findFirstOrThrow({ where: { providerAccountId: "same" } })).userId, user.id);
  await signOut();
  async function googleSignIn(identity, expected, forgedState = false) {
    selectedGoogle = identity;
    badState = forgedState;
    await go("/account/sign-in");
    await submit("main section > div > form");
    await path(expected);
    await pause(250);
  }
  await googleSignIn("same", "/account/sign-in", true);
  await textIncludes("Google sign-in could not continue", main);
  await googleSignIn("unverified", "/account/sign-in");
  await googleSignIn("unhosted", "/account/sign-in");
  assert.equal(await db.user.count({ where: { email: "qa.external@example.test" } }), 0);
  await textIncludes("Google sign-in could not continue", main);
  await googleSignIn("unlinked", "/account/sign-in");
  await textIncludes("Google sign-in could not continue", main);
  assert.equal(await db.account.count({ where: { providerAccountId: "unlinked" } }), 0);
  await googleSignIn("same", "/account");
  assert.equal(await db.user.count({ where: { email: credentials.email } }), 1);
  await signOut();
  await googleSignIn("new", "/account");
  const other = await accountCookie();
  assert.deepEqual((await (await request(favoritesApi, other)).json()).ids, []);
  await deniedOrder(gift.id, other);
  await go("/account/profile?userId=" + user.id);
  assert.deepEqual(await evaluate("[document.querySelector('main [name=firstName]').value,document.querySelector('main [name=lastName]').value]"), ["Mock", "Google"]);
  passes("mock Google code/PKCE/nonce/state, verified subject, deliberate linking, email collision, independent customer and data");

  await go("/account/profile");
  const addPasswordIndex = currentMail().length;
  await submit("main section form:has(button):not(:has(input:not([type=hidden])))");
  const add = await messageLink("addPassword", addPasswordIndex);
  await confirm(add, newPassword);
  await signIn("google.only@gmail.com", newPassword);
  const emailChangeIndex = currentMail().length;
  await go("/account/profile");
  await fill("main input[name=email]", "changed@example.test");
  await submit("main form:has(input[name=email])");
  const old = await messageLink("emailOld", emailChangeIndex);
  await confirm(old, undefined, "you’ll receive an email");
  assert.equal(await db.user.count({ where: { email: "changed@example.test" } }), 0);
  await confirm(await messageLink("emailNew", emailChangeIndex));
  await signIn("changed@example.test", newPassword);
  assert.equal(await db.account.count({ where: { user: { email: "changed@example.test" }, providerAccountId: "new" } }), 1);
  await signOut();
  passes("Google account adds native credentials, email change requires both addresses and keeps internal identity");

  const rateAddress = "qa.rate@example.test";
  for (let i = 0; i < 6; i++) await emailForm("register", rateAddress);
  await until(() => currentMail().filter((mail) => mail.to === rateAddress).length === 5, "registration email cap");
  assert.equal(currentMail().filter((mail) => mail.to === rateAddress).length, 5);
  passes("database-backed registration throttle limits delivery while preserving the generic response");

  await go("/login");
  await until(() => evaluate('!!document.querySelector("input[autocomplete=username]") && !!document.querySelector("input[autocomplete=current-password]")'), "admin credentials form");
  assert.equal(await evaluate(`(async () => {
    const { csrfToken } = await (await fetch("/api/auth/csrf")).json();
    const result = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ csrfToken, username: "local-admin", password: "isolated-admin-password", callbackUrl: location.origin + "/admin" }),
    });
    const session = await (await fetch("/api/auth/session")).json();
    return result.ok && session.user?.role === "ADMIN";
  })()`), true, "existing administrator credentials and session");
  await go("/admin");
  await db.product.update({ where: { id: "qa_native" }, data: { isActive: false } });
  for (const width of [390, 1280]) for (const locale of ["ua", "en"]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    await evaluate(`document.cookie = "locale=${locale}; path=/"`);
    await go("/admin/products/qa_native/edit");
    await until(() => evaluate(`!!document.querySelector('details a[href$="/v1"]')`), "admin variant links");
    await evaluate(`document.querySelector('details:has(a[href$="/v1"]) summary').click()`);
    const expected = locale === "en" ? ["Groups (2)", "Filament alternatives (3)", "Materials available", "Filaments not configured", "Materials unavailable", "Blocking groups (1)", "Variant disabled manually"] :
      ["Групи (2)", "Альтернативні філаменти (3)", "Матеріали доступні", "Філаменти не налаштовано", "Матеріали недоступні", "Заблоковані групи (1)", "Варіант вимкнено вручну"];
    for (const label of expected) await textIncludes(label, 'details:has(a[href$="/v1"])');
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    await evaluate(`document.querySelector('details a[href$="/v1"]').click()`);
    await path("/admin/products/qa_native/filaments/v1");
  }
  await db.product.update({ where: { id: "qa_native" }, data: { isActive: true } });
  for (const width of [390, 1280]) for (const locale of ["ua", "en"]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    await evaluate(`document.cookie = "locale=${locale}; path=/"`);
    await go("/product/qa-colors");
    const sizes = () => evaluate("[...document.querySelectorAll('.sf-product-options fieldset:nth-child(2) button')].map(x=>x.textContent)");
    const labels = locale === "en" ? ["Small", "Medium", "Large", "Mini 3 cm"] : ["Малий", "Середній", "Великий", "Міні 3 см"];
    await db.filament.update({ where: { id: "f2" }, data: { isAvailable: false } });
    await go("/product/qa-colors");
    assert.deepEqual(await sizes(), labels);
    await db.filament.update({ where: { id: "f2" }, data: { isAvailable: true } });
    await send("Page.reload");
    await path("/product/qa-colors");
    assert.deepEqual(await sizes(), labels);
    await evaluate("document.querySelector('.sf-product-options fieldset button:not(:disabled)').click()");
    assert.deepEqual(await sizes(), labels);
    assert.equal(await evaluate("document.querySelector('.sf-product-options fieldset:nth-child(2) button:nth-child(3)').disabled"), true);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    await go("/account/sign-in");
    await textIncludes(locale === "en" ? "Sign in" : "Увійти", main);
  }
  const variantIds = (await db.productVariant.findMany({ where: { productId: "qa_native" }, orderBy: { id: "asc" } })).map((row) => row.id);
  await db.productOptionValue.update({ where: { id: "custom" }, data: { displayPosition: 0 } });
  for (const locale of ["ua", "en"]) {
    await evaluate(`document.cookie = "locale=${locale}; path=/"`);
    await go("/product/qa-colors");
    assert.equal(await evaluate("document.querySelector('.sf-product-options fieldset:nth-child(2) button').textContent"), locale === "en" ? "Mini 3 cm" : "Міні 3 см");
    await go("/account/sign-in");
  }
  assert.deepEqual((await db.productVariant.findMany({ where: { productId: "qa_native" }, orderBy: { id: "asc" } })).map((row) => row.id), variantIds);
  assert.ok(await db.customerRateLimit.count({ where: { hits: { gt: 1 } } }));
  assert.equal(await db.account.count({ where: { provider: "google" } }), 2);
  assert.equal(await db.account.count({ where: { provider: "legacy", userId: "qa_existing_admin" } }), 1);
  assert.equal(interceptionFailure, undefined);
  passes("real admin credentials, mobile and desktop UA/EN storefront, clickable filament summaries, stable standard/custom option order");
} finally {
  driver?.close();
  browser.kill();
  await db.$disconnect();
  await pause(50);
}
