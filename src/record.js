import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launchBrowser, settle } from "./browser.js";
import { APP_HOME, SOURCE_REQUESTS_URL } from "./config.js";
import { ensureDirs } from "./fs.js";
import { preparePitchDraft } from "./apply.js";

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

  const browser = await launchBrowser({ visible: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.goto(SOURCE_REQUESTS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page, 1800);
    const recorder = await startTabScreencast(page, { fps, framesDir });
    let flowError;
    try {
      await runRecordedPitchFlow(page, options);
    } catch (error) {
      flowError = error;
    } finally {
      await recorder.stop();
    }
    await encodeFrames({ fps, framesDir, outputPath });
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
  return links.find((href) => /\/source_requests\/[^/?#]+/.test(href) && !/\/source_requests\/search(?:[/?#]|$)/.test(href)) ?? null;
}

async function runRecordedPitchFlow(page, options) {
  await slowScroll(page);
  const links = await collectOpportunityLinks(page, Number(options.limit ?? 20));
  const targetUrl = selectOpportunityLink(links);
  if (!targetUrl) throw new Error("recording_opportunity_not_found");
  await clickOpportunityLink(page, targetUrl);
  await settle(page, 1800);
  await slowScroll(page, { maxScrolls: 2 });
  await preparePitchDraft(page, options.pitch || defaultRecordingPitch(), { debug: false });
  await settle(page, 3000);
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
    await settle(page, 250);
  }
  await page.evaluate(async () => {
    const start = window.scrollY;
    const steps = 28;
    for (let step = 0; step < steps; step += 1) {
      window.scrollTo(0, start * (1 - ((step + 1) / steps)));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
  await settle(page, 400);
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
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
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

function defaultRecordingPitch() {
  return [
    "I can comment on this from the perspective of a founder building AI agents and growth automation systems.",
    "The practical question is not whether AI replaces a workflow, but how companies redesign pricing, trust and accountability when software starts completing work instead of just exposing dashboards.",
    "A useful angle is that the winning products will package measurable work capacity, human oversight and clear quality bounds rather than simply charging for seats or tokens.",
  ].join("\n\n");
}
