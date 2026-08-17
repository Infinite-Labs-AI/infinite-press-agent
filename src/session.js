import { AUTH_URL, SOURCE_REQUESTS_URL } from "./config.js";
import { launchBrowser, isSignedOut, settle } from "./browser.js";
import { readConfig, writeConfig } from "./fs.js";
import { log } from "./log.js";

export async function login({ visible = true } = {}) {
  const browser = await launchBrowser({ visible });
  try {
    const page = await browser.newPage();
    await page.goto(AUTH_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (await isSignedOut(page)) {
      if (!visible) throw new Error("needs_human_login");
      log("Qwoted login required. Use the opened Chrome window; waiting up to 5 minutes.");
      await page.waitForFunction(
        () => !/sign in|log in|welcome back|forgot your password/i.test(`${document.title}\n${document.body?.innerText ?? ""}`),
        { timeout: 300_000 },
      );
      await page.goto(SOURCE_REQUESTS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }
    await settle(page);
    if (await isSignedOut(page)) throw new Error("login_failed");
    writeConfig({ ...readConfig(), loggedInAt: new Date().toISOString() });
    log("Qwoted login/profile ready.");
  } finally {
    await browser.close();
  }
}

export async function assertHeadlessSession(page) {
  if (await isSignedOut(page)) {
    throw new Error("needs_human_login: run `infinite-media init`");
  }
  const url = page.url();
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  if (isAccountDisabled(url, body)) {
    throw new Error("account_temporarily_disabled: contact Qwoted support to re-enable the account");
  }
}

export function isAccountDisabled(url, body) {
  return /show_account_disabled_modal=true|account\+temporarily\+disabled/i.test(url)
    || /account temporarily disabled|chat with our support team to re-enable your account/i.test(body);
}
