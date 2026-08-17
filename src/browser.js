import puppeteer from "puppeteer-core";
import { CHROME_PATH, CHROME_PROFILE_DIR } from "./config.js";
import { ensureDirs } from "./fs.js";

export async function launchBrowser({ visible = false, windowSize = null } = {}) {
  ensureDirs();
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: visible ? false : "new",
    userDataDir: CHROME_PROFILE_DIR,
    defaultViewport: windowSize ? { ...windowSize, deviceScaleFactor: 1 } : { width: 1440, height: 1200 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-notifications",
      "--disable-background-networking",
      ...(windowSize ? [`--window-size=${windowSize.width},${windowSize.height}`] : []),
    ],
  });
}

export async function settle(page, ms = 1500) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isSignedOut(page) {
  const title = await page.title();
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  return /sign in|log in/i.test(title) || /welcome back|forgot your password|remember me and stay logged in|email password/i.test(text);
}

export async function text(page) {
  return page.evaluate(() => document.body?.innerText ?? "");
}
