import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launchBrowser, settle } from "./browser.js";
import { APP_HOME, SOURCE_REQUESTS_URL } from "./config.js";
import { decideWithCodex } from "./codex.js";
import { ensureDirs } from "./fs.js";
import { hardSkipReason, normalizeLines } from "./extract.js";
import { preparePitchDraft } from "./apply.js";
import { log } from "./log.js";

const execFileAsync = promisify(execFile);

export async function recordQwotedRun(options = {}) {
  ensureDirs();
  const fps = Number(options.fps ?? 20);
  const recordingsDir = options.outputDir || join(process.cwd(), "recordings");
  const outputPath = options.outputPath || join(recordingsDir, recordingFilename());
  const framesDir = join(APP_HOME, "recording-frames");
  await mkdir(recordingsDir, { recursive: true });
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const searchQuery = recordingSearchQuery(options);
  progress("Preparing Qwoted recording demo", {
    search: searchQuery,
    opportunities: Number(options.opportunities ?? 3),
  });
  const targetUrls = await selectRecordingTargetUrls({ ...options, searchQuery });
  progress("AI selected opportunities for the recording", { selected: targetUrls.length });

  progress("Opening visible Chrome and starting capture");
  const browser = await launchBrowser({ visible: true, windowSize: recordingWindowSize() });
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...recordingWindowSize(), deviceScaleFactor: 1 });
    await page.goto(SOURCE_REQUESTS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page, 1200);
    const recorder = await startTabScreencast(page, { fps, framesDir });
    let flowError;
    try {
      await runRecordedPitchFlow(page, { ...options, searchQuery, targetUrls });
    } catch (error) {
      flowError = error;
    } finally {
      await recorder.stop();
    }
    await encodeFrames({ fps, framesDir, outputPath });
    progress("Recording encoded", { outputPath, frames: recorder.frameCount() });
    if (flowError) {
      const message = flowError instanceof Error ? flowError.message : String(flowError);
      throw new Error(`recording_flow_failed: ${message}; partial recording saved: ${outputPath}`);
    }
    return { outputPath, frameCount: recorder.frameCount() };
  } finally {
    await browser.close();
    await rm(framesDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function recordingFilename(date = new Date()) {
  return `qwoted-run-${date.toISOString().replace(/[:.]/g, "-")}.mp4`;
}

export function recordingWindowSize() {
  return { width: 1440, height: 1000 };
}

export function buildFfmpegArgs({ fps, framesDir, outputPath }) {
  return [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    join(framesDir, "frame-%06d.jpg"),
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export function selectOpportunityLink(links) {
  return selectOpportunityLinks(links, 1)[0] ?? null;
}

export function selectOpportunityLinks(links, count = 3) {
  const usable = links.filter((href) => /\/source_requests\/[^/?#]+/.test(href) && !/\/source_requests\/search(?:[/?#]|$)/.test(href));
  return Array.from(new Set(usable)).slice(0, count);
}

async function runRecordedPitchFlow(page, options) {
  const opportunityCount = Number(options.opportunities ?? 3);
  await applyOpportunitySearch(page, options.searchQuery);
  await slowScroll(page, { maxScrolls: 2 });
  const links = options.targetUrls ?? await collectOpportunityLinks(page, Number(options.limit ?? 20));
  const targetUrls = selectOpportunityLinks(links, opportunityCount);
  if (!targetUrls.length) throw new Error("recording_opportunity_not_found");
  let visited = 0;
  for (const [index, targetUrl] of targetUrls.entries()) {
    await ensureOpportunitiesPage(page);
    if (index > 0) await settle(page, 350);
    await clickOpportunityLink(page, targetUrl);
    await settle(page, 900);
    await slowScroll(page, { maxScrolls: 1 });
    try {
      await preparePitchDraft(page, options.pitch || defaultRecordingPitch(index + 1), { debug: false });
      visited += 1;
      await settle(page, 1000);
    } catch {
      await settle(page, 500);
    }
  }
  if (!visited) throw new Error("recording_pitch_draft_not_available");
}

async function selectRecordingTargetUrls(options) {
  const opportunityCount = Number(options.opportunities ?? 3);
  const scanLimit = Number(options.limit ?? 12);
  const focus = options.focus || "AI, technology, startups, software, automation, B2B SaaS, marketing technology, data, cybersecurity, crypto/web3 where credible";
  progress("Searching Qwoted opportunities for AI/tech matches", {
    search: options.searchQuery,
    limit: scanLimit,
  });
  const browser = await launchBrowser({ visible: false });
  try {
    const page = await browser.newPage();
    await page.goto(SOURCE_REQUESTS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page, 1500);
    await applyOpportunitySearch(page, options.searchQuery);
    await slowScroll(page, { maxScrolls: 4 });
    const summaries = (await collectOpportunityCardSummaries(page, scanLimit))
      .map(opportunitySummaryFromCard)
      .filter((opportunity) => !hardSkipReason(opportunity));
    if (!summaries.length) throw new Error("recording_no_eligible_opportunities");
    progress("Ranking opportunities with AI", { candidates: summaries.length });
    const decisions = await decideWithCodex(summaries, { focus });
    const selected = decisions
      .filter((decision) => decision.shouldSubmit)
      .sort((left, right) => right.score - left.score)
      .slice(0, opportunityCount)
      .map((decision) => decision.url);
    const fallback = summaries
      .filter((opportunity) => techKeywordScore(opportunity) > 0 && !selected.includes(opportunity.url))
      .sort((left, right) => techKeywordScore(right) - techKeywordScore(left))
      .map((opportunity) => opportunity.url);
    const targetUrls = Array.from(new Set([...selected, ...fallback])).slice(0, opportunityCount);
    log("recording selection complete", {
      scanned: summaries.length,
      selected: targetUrls.length,
      focus,
      searchQuery: options.searchQuery,
      method: "main_page_cards",
    });
    if (!targetUrls.length) throw new Error("recording_no_ai_tech_opportunities_selected");
    return targetUrls;
  } finally {
    await browser.close();
  }
}

function progress(message, meta = undefined) {
  log(message, meta);
}

function recordingSearchQuery(options) {
  return options.search || options.query || "AI technology startup software";
}

async function applyOpportunitySearch(page, query) {
  if (!query) return;
  await page.waitForSelector("input[type='search']", { timeout: 10_000 });
  const client = await page.target().createCDPSession();
  await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.18 }).catch(() => undefined);
  await page.click("input[type='search']", { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(query, { delay: 16 });
  await settle(page, 1200);
  await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => undefined);
  await client.detach().catch(() => undefined);
  await settle(page, 900);
}

function techKeywordScore(opportunity) {
  const text = `${opportunity.title}\n${opportunity.body}`.toLowerCase();
  const matches = text.match(/\b(ai|artificial intelligence|agent|automation|saas|software|startup|technology|cybersecurity|data|analytics|crypto|web3|fintech|marketing tech|martech)\b/g);
  return matches?.length ?? 0;
}

async function collectOpportunityCardSummaries(page, limit) {
  const cards = await page.evaluate(() => {
    const cardText = (anchor) => {
      let node = anchor;
      for (let depth = 0; depth < 7 && node; depth += 1) {
        const text = (node.innerText || node.textContent || "").trim().replace(/[ \t]+/g, " ");
        if (text.length > 40 && text.length < 1800) return text;
        node = node.parentElement;
      }
      return (anchor.innerText || anchor.textContent || "").trim();
    };
    return Array.from(document.querySelectorAll("a[href*='/source_requests/']"))
      .map((anchor) => ({
        url: new URL(anchor.href, window.location.origin).toString(),
        text: cardText(anchor),
      }))
      .filter((item) => /\/source_requests\/[^/?#]+/.test(item.url))
      .filter((item) => !/\/source_requests\/search(?:[/?#]|$)/.test(item.url));
  });
  const byUrl = new Map();
  for (const card of cards) {
    if (!byUrl.has(card.url)) byUrl.set(card.url, card);
  }
  return Array.from(byUrl.values()).slice(0, limit);
}

export function opportunitySummaryFromCard(card) {
  const lines = normalizeLines(card.text);
  const requestIndex = lines.findIndex((line) => /request$/i.test(line));
  const title = lines[requestIndex + 1] || lines.find((line) => line.length > 8 && !/^online\/print|^expert request|^posted:|^deadline/i.test(line)) || "Untitled Qwoted opportunity";
  return {
    url: card.url,
    title,
    outlet: inferCardOutlet(lines),
    requestType: requestIndex >= 0 ? lines[requestIndex] : null,
    deadline: lines.find((line) => /^deadline|in about|about \d+ hours|posted:/i.test(line)) ?? null,
    body: lines.join("\n").slice(0, 1800),
    alreadyPitched: /Your Pitch:|Read by Reporter|Pitch submitted|Thanks for submitting/i.test(card.text),
    pitchAvailable: true,
  };
}

function inferCardOutlet(lines) {
  const requestIndex = lines.findIndex((line) => /request$/i.test(line));
  if (requestIndex > 0) return lines[requestIndex - 1];
  return null;
}

async function slowScroll(page, { maxScrolls = 4 } = {}) {
  for (let index = 0; index < maxScrolls; index += 1) {
    await page.evaluate(async () => {
      const distance = Math.round(window.innerHeight * 0.7);
      const steps = 24;
      for (let step = 0; step < steps; step += 1) {
        window.scrollBy(0, distance / steps);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
    await settle(page, 120);
  }
  await page.evaluate(async () => {
    const start = window.scrollY;
    const steps = 28;
    for (let step = 0; step < steps; step += 1) {
      window.scrollTo(0, start * (1 - ((step + 1) / steps)));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
  await settle(page, 220);
}

async function ensureOpportunitiesPage(page) {
  if (page.url().replace(/[#?].*$/, "") === SOURCE_REQUESTS_URL) return;
  await page.goto(SOURCE_REQUESTS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page, 700);
}

async function collectOpportunityLinks(page, limit) {
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href*='/source_requests/']"))
      .map((anchor) => new URL(anchor.href, window.location.origin).toString())
      .filter((href) => /\/source_requests\/[^/?#]+/.test(href))
      .filter((href) => !/\/source_requests\/search(?:[/?#]|$)/.test(href)),
  );
  return Array.from(new Set(links)).slice(0, limit);
}

async function clickOpportunityLink(page, targetUrl) {
  const clicked = await page.evaluate((href) => {
    const target = Array.from(document.querySelectorAll("a[href*='/source_requests/']")).find((anchor) => new URL(anchor.href, window.location.origin).toString() === href);
    if (!target) return false;
    target.scrollIntoView({ block: "center" });
    target.click();
    return true;
  }, targetUrl);
  if (!clicked) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return;
  }
  await settle(page, 1200);
  if (page.url().replace(/[#?].*$/, "") !== targetUrl) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
}

async function startTabScreencast(page, { fps, framesDir }) {
  const intervalMs = Math.max(33, Math.round(1000 / fps));
  const client = await page.target().createCDPSession();
  let frames = 0;
  let lastFrameAt = 0;
  const writes = new Set();
  const onFrame = (event) => {
    client.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
    const now = Date.now();
    if (now - lastFrameAt < intervalMs) return;
    lastFrameAt = now;
    frames += 1;
    const write = writeFile(join(framesDir, `frame-${String(frames).padStart(6, "0")}.jpg`), Buffer.from(event.data, "base64"))
      .finally(() => writes.delete(write));
    writes.add(write);
  };
  client.on("Page.screencastFrame", onFrame);
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 86,
    everyNthFrame: 1,
  });
  return {
    frameCount: () => frames,
    stop: async () => {
      await client.send("Page.stopScreencast").catch(() => undefined);
      client.off("Page.screencastFrame", onFrame);
      await Promise.allSettled(Array.from(writes));
      await client.detach().catch(() => undefined);
      if (frames < 2) {
        throw new Error("recording_no_frames_captured");
      }
    }
  };
}

async function encodeFrames({ fps, framesDir, outputPath }) {
  if (!existsSync("/opt/homebrew/bin/ffmpeg") && !existsSync("/usr/local/bin/ffmpeg") && !await commandExists("ffmpeg")) {
    throw new Error("ffmpeg_not_found: install ffmpeg to encode the recording");
  }
  await execFileAsync("ffmpeg", buildFfmpegArgs({ fps, framesDir, outputPath }), { maxBuffer: 10 * 1024 * 1024 });
}

async function commandExists(command) {
  try {
    await execFileAsync("which", [command]);
    return true;
  } catch {
    return false;
  }
}

function defaultRecordingPitch(index = 1) {
  return [
    `Demo pitch ${index}: I can comment on this from the perspective of a founder building AI agents and growth automation systems.`,
    "The practical question is not whether AI replaces a workflow, but how companies redesign pricing, trust and accountability when software starts completing work instead of just exposing dashboards.",
    "A useful angle is that the winning products will package measurable work capacity, human oversight and clear quality bounds rather than simply charging for seats or tokens.",
  ].join("\n\n");
}
