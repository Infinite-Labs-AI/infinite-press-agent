import { SOURCE_REQUESTS_URL } from "./config.js";
import { assertHeadlessSession } from "./session.js";
import { settle } from "./browser.js";

export async function extractLinks(page, limit) {
  await page.goto(SOURCE_REQUESTS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertHeadlessSession(page);
  await settle(page, 2000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
  await settle(page, 1000);
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href*='/source_requests/']"))
      .map((anchor) => new URL(anchor.href, window.location.origin).toString())
      .filter((href) => /\/source_requests\/[^/?#]+/.test(href))
      .filter((href) => !/\/source_requests\/search(?:[/?#]|$)/.test(href)),
  );
  return Array.from(new Set(links)).slice(0, limit);
}

export async function extractOpportunity(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertHeadlessSession(page);
  await settle(page, 1200);
  const raw = await page.evaluate(() => {
    const body = document.body?.innerText ?? "";
    const h1 = document.querySelector("h1")?.textContent?.trim();
    const title = h1 || document.title.replace(/\s*\|\s*Qwoted\s*$/i, "").trim();
    const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    return { title, body, buttons };
  });
  const lines = normalizeLines(raw.body);
  const title = raw.title || firstUsefulLine(lines) || "Untitled Qwoted opportunity";
  return {
    url,
    id: sourceRequestId(url),
    title: cleanTitle(title),
    outlet: inferOutlet(lines),
    requestType: inferRequestType(lines),
    deadline: inferDeadline(lines),
    body: extractRequestBody(lines),
    alreadyPitched: /Your Pitch:|Read by Reporter|Pitch submitted|Thanks for submitting/i.test(raw.body),
    pitchAvailable: raw.buttons.some((button) => /pitch|respond|submit/i.test(button)),
    rawState: {
      buttons: raw.buttons.slice(0, 30),
      pageTextPrefix: raw.body.slice(0, 500),
    },
  };
}

export function normalizeLines(text) {
  const drop = [
    /^this website uses cookies/i,
    /^we use cookies/i,
    /^consent selection/i,
    /^necessary$/i,
    /^preferences$/i,
    /^statistics$/i,
    /^marketing$/i,
    /^show details$/i,
    /^allow all$/i,
    /^deny$/i,
    /^new! celebrating/i,
    /^opportunities$/i,
    /^media database$/i,
    /^media moves$/i,
    /^my pitches$/i,
    /^press releases$/i,
    /^\d+\s+pitch credits/i,
    /^upgrade$/i,
    /^rb$/i,
    /^copy content$/i,
    /^add to saved\/favorites/i,
    /^powered by$/i,
  ];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !drop.some((pattern) => pattern.test(line)));
}

export function extractRequestBody(lines) {
  const start = lines.findIndex((line) => /^copy content$/i.test(line));
  const usable = start >= 0 ? lines.slice(start + 1) : lines;
  const end = usable.findIndex((line) => /^pitch the opportunity|^your pitch:|^submit pitch|^upgrade to get/i.test(line));
  const bodyLines = (end >= 0 ? usable.slice(0, end) : usable)
    .filter((line) => !/^domain authority|^deadline|^new$|^approaching deadline/i.test(line));
  return bodyLines.join("\n").slice(0, 5000);
}

export function hardSkipReason(opportunity) {
  const text = `${opportunity.title}\n${opportunity.requestType}\n${opportunity.body}`.toLowerCase();
  if (opportunity.alreadyPitched) return "already_pitched";
  if (!opportunity.pitchAvailable) return "pitch_not_available";
  if (/fee-based|paid opportunity|payment required/.test(text)) return "fee_based";
  if (/product request|gift guide|products? for testing|seeking .*products?|snacks|apparel|candles|backpacks/.test(text)) return "product_roundup";
  if (/doctor|physician|dermatologist|podiatrist|nutritionist|dietitian|lawyer|attorney|financial advisor|therapist|psychologist|psychiatrist|licensed/.test(text)) return "licensed_or_regulated";
  if (/combover|worn a|lived with|personal experience|couples who have used/.test(text)) return "personal_anecdote";
  if (/chef|sommelier|mixologist|pitmaster|whiskey expert|wine pairing|perfect scrambled eggs/.test(text)) return "food_beverage_operator";
  return null;
}

function sourceRequestId(url) {
  return url.match(/\/source_requests\/([^/?#]+)/)?.[1] ?? url;
}

function cleanTitle(title) {
  return title.replace(/\s+/g, " ").replace(/\.\.\.$/, "").trim();
}

function firstUsefulLine(lines) {
  return lines.find((line) => line.length > 8 && !/^domain authority|deadline|online\/print/i.test(line));
}

function inferOutlet(lines) {
  const deadlineIndex = lines.findIndex((line) => /^deadline/i.test(line) || /in \d+ (day|hour|month)/i.test(line));
  if (deadlineIndex >= 0 && lines[deadlineIndex + 1] && !/^copy content$/i.test(lines[deadlineIndex + 1])) {
    return lines[deadlineIndex + 1];
  }
  return null;
}

function inferRequestType(lines) {
  return lines.find((line) => /request$/i.test(line) && line.length < 80) ?? null;
}

function inferDeadline(lines) {
  return lines.find((line) => /^deadline|approaching deadline|mon |tue |wed |thu |fri |sat |sun /i.test(line)) ?? null;
}
