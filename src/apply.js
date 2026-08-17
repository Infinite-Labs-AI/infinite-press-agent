import { readFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, settle } from "./browser.js";
import { RUNS_DIR } from "./config.js";
import { writeJson } from "./fs.js";
import { log } from "./log.js";
import { assertHeadlessSession } from "./session.js";

export async function applyLatest(options = {}) {
  const latest = JSON.parse(readFileSync(join(RUNS_DIR, "latest.json"), "utf8"));
  const maxSubmit = Number(options.maxSubmit ?? 1);
  const minScore = Number(options.minScore ?? 80);
  const dryRun = options.dryRun === true;
  const debug = options.debug === true;
  const visible = options.visible === true;
  const candidates = latest.selected
    .filter((decision) => decision.score >= minScore && decision.pitch?.trim().length >= 80)
    .slice(0, maxSubmit);
  const results = [];
  const browser = await launchBrowser({ visible });
  try {
    for (const [index, decision] of candidates.entries()) {
      const page = await browser.newPage();
      try {
        await page.goto(decision.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await assertHeadlessSession(page);
        await settle(page);
        const submitResult = await submitPitch(page, decision.pitch, {
          submit: !dryRun,
          debug,
          debugPrefix: `apply-${index + 1}`,
        });
        results.push({
          ...decision,
          status: submitResult.status ?? (dryRun ? "filled_dry_run" : "submitted"),
          submittedAt: dryRun || submitResult.status ? undefined : new Date().toISOString(),
          debugPath: submitResult.debugPath,
        });
      } catch (error) {
        const debugPath = debug ? await writeDebugSnapshot(page, `apply-${index + 1}-failed`) : undefined;
        results.push({
          ...decision,
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          debugPath,
        });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }
  const applyReport = { createdAt: new Date().toISOString(), dryRun, results };
  writeJson(join(RUNS_DIR, "latest-apply.json"), applyReport);
  log("apply complete", { dryRun, submitted: results.filter((result) => result.status === "submitted").length, attempted: results.length });
  return applyReport;
}

async function submitPitch(page, pitch, { submit = true, debug = false, debugPrefix = "apply" } = {}) {
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  if (/Read by Reporter|Pitch submitted|Thanks for submitting|Your Pitch:\s*(Submitted|Sent|Read)/i.test(body)) {
    throw new Error("already_pitched");
  }
  let filled = await fillPitchEditor(page, pitch);
  if (!filled && await tryClickSourceAction(page)) {
    await settle(page, 1500);
    filled = await fillPitchEditor(page, pitch);
  }
  if (!filled) {
    await clickPitchAction(page);
    await settle(page, 1500);
    await assertHeadlessSession(page);
    const unlocked = await handleStartPitchingGate(page, { submit, debug, debugPrefix });
    if (unlocked.status) return unlocked;
    await assertHeadlessSession(page);
    filled = await fillPitchEditor(page, pitch);
    if (!filled && await tryClickSourceAction(page)) {
      await settle(page, 1500);
      filled = await fillPitchEditor(page, pitch);
    }
  }
  if (!filled) throw new Error("pitch_editor_not_found");
  const debugPath = debug ? await writeDebugSnapshot(page, `${debugPrefix}-filled`) : undefined;
  if (!submit) return { debugPath };
  await clickSubmitAction(page);
  await page.waitForFunction(
    () => /thanks for submitting|submitted|read by reporter|your pitch/i.test(document.body?.innerText ?? ""),
    { timeout: 30_000 },
  );
  return { debugPath };
}

export async function preparePitchDraft(page, pitch, options = {}) {
  return submitPitch(page, pitch, { ...options, submit: false });
}

export function findBestPitchAction(actions) {
  return actions
    .map((action) => ({ ...action, score: scorePitchAction(action) }))
    .filter((action) => action.score > 0)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function findBestSourceAction(actions) {
  return actions
    .map((action) => ({ ...action, score: scoreSourceAction(action) }))
    .filter((action) => action.score > 0)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function findBestStartPitchingAction(actions) {
  return actions
    .map((action) => ({ ...action, score: scoreStartPitchingAction(action) }))
    .filter((action) => action.score > 0)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function scorePitchAction(action) {
  const text = action.text?.replace(/\s+/g, " ").trim() ?? "";
  const href = action.href ?? "";
  const combined = `${text} ${href}`;
  if (/my[_\s-]?pitches|pitch credits|upgrade|pitch intelligence/i.test(combined)) return 0;
  if (/^pitch now$/i.test(text)) return 100;
  if (/^submit a pitch$/i.test(text)) return 100;
  if (/^respond now$/i.test(text)) return 90;
  if (/complete your pitch/i.test(text)) return 85;
  if (/^pitch$/i.test(text)) return 70;
  return 0;
}

function scoreStartPitchingAction(action) {
  const text = action.text?.replace(/\s+/g, " ").trim() ?? "";
  if (/^start pitching$/i.test(text)) return 100;
  if (/^cancel$/i.test(text)) return 0;
  return 0;
}

function scoreSourceAction(action) {
  const text = action.text?.replace(/\s+/g, " ").trim() ?? "";
  const id = action.id ?? "";
  if (/^source_\d+$/i.test(id) && /^myself:/i.test(text)) return 100;
  if (/^myself:/i.test(text)) return 90;
  if (/add new|unspecified|pitch intelligence|upgrade/i.test(text)) return 0;
  return 0;
}

async function clickPitchAction(page) {
  const actions = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button, a, [role='button']"))
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          index,
          text: node.innerText?.trim() || node.textContent?.trim() || "",
          href: node.href || "",
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((action) => action.visible);
  });
  const target = findBestPitchAction(actions);
  if (!target) throw new Error("pitch_button_not_found");
  const clicked = await page.evaluate((targetIndex) => {
    const node = Array.from(document.querySelectorAll("button, a, [role='button']"))[targetIndex];
    if (!node) return false;
    node.click();
    return true;
  }, target.index);
  if (!clicked) throw new Error("pitch_button_not_found");
}

async function handleStartPitchingGate(page, { submit, debug, debugPrefix }) {
  const hasGate = await page.evaluate(() => /Ready to pitch\?|Use a credit to get started|Start Pitching/i.test(document.body?.innerText ?? ""));
  if (!hasGate) return {};
  if (!submit) {
    return {
      status: "credit_required_dry_run",
      debugPath: debug ? await writeDebugSnapshot(page, `${debugPrefix}-credit-required`) : undefined,
    };
  }
  const clicked = await clickStartPitchingAction(page);
  if (!clicked) throw new Error("start_pitching_button_not_found");
  await settle(page, 2000);
  await assertHeadlessSession(page);
  return {};
}

async function clickStartPitchingAction(page) {
  const actions = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button, a, [role='button']"))
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          index,
          text: node.innerText?.trim() || node.textContent?.trim() || "",
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((action) => action.visible);
  });
  const target = findBestStartPitchingAction(actions);
  if (!target) return false;
  return page.evaluate((targetIndex) => {
    const node = Array.from(document.querySelectorAll("button, a, [role='button']"))[targetIndex];
    if (!node) return false;
    node.click();
    return true;
  }, target.index);
}

async function tryClickSourceAction(page) {
  const actions = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button, a, [role='button'], div"))
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          index,
          id: node.id || "",
          text: node.innerText?.trim() || node.textContent?.trim() || "",
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((action) => action.visible);
  });
  const target = findBestSourceAction(actions);
  if (!target) return false;
  const clicked = await page.evaluate((targetIndex) => {
    const node = Array.from(document.querySelectorAll("button, a, [role='button'], div"))[targetIndex];
    if (!node) return false;
    node.scrollIntoView({ block: "center" });
    node.click();
    return true;
  }, target.index);
  return clicked;
}

async function fillPitchEditor(page, pitch) {
  return page.evaluate((pitchText) => {
    const visibleBox = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 120 && rect.height > 20;
    };
    const editable = Array.from(
      document.querySelectorAll("[contenteditable='true'], [role='textbox'], .ql-editor, .ProseMirror, trix-editor"),
    ).find((node) => visibleBox(node));
    if (editable) {
      editable.focus();
      editable.innerText = pitchText;
      editable.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: pitchText }));
      return true;
    }
    const textarea = Array.from(document.querySelectorAll("textarea")).find((node) => !node.disabled);
    if (textarea) {
      textarea.focus();
      textarea.value = pitchText;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }, pitch);
}

async function clickSubmitAction(page) {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("button, input[type='submit'], [role='button']"));
    const target = candidates.find((node) => {
      const text = node.innerText?.trim() || node.textContent?.trim() || "";
      const value = node.value?.trim() || "";
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && /^(submit pitch|submit|send)$/i.test(text || value);
    });
    if (!target) return false;
    target.click();
    return true;
  });
  if (!clicked) throw new Error("submit_button_not_found");
}

async function writeDebugSnapshot(page, name) {
  const path = join(RUNS_DIR, `${name}-debug.json`);
  const snapshot = await page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const pick = (node) => ({
      tag: node.tagName,
      text: (node.innerText || node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 220),
      type: node.getAttribute("type"),
      id: node.id || null,
      name: node.getAttribute("name"),
      role: node.getAttribute("role"),
      className: node.className?.toString().slice(0, 160),
      href: node.href || null,
      ariaLabel: node.getAttribute("aria-label"),
      placeholder: node.getAttribute("placeholder"),
      visible: visible(node),
    });
    return {
      createdAt: new Date().toISOString(),
      title: document.title,
      url: location.href,
      bodyStart: (document.body?.innerText || "").slice(0, 3000),
      actions: Array.from(document.querySelectorAll("button, a, [role='button'], input[type='submit']")).map(pick).slice(0, 120),
      editors: Array.from(
        document.querySelectorAll("textarea, input, [contenteditable='true'], [role='textbox'], .ql-editor, .ProseMirror, trix-editor"),
      ).map(pick).slice(0, 120),
      iframes: Array.from(document.querySelectorAll("iframe")).map(pick).slice(0, 30),
    };
  });
  writeJson(path, snapshot);
  return path;
}
