import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { MIN_DECISION_SCORE } from "./config.js";
import { readConfig } from "./fs.js";

export async function decideWithCodex(opportunities) {
  if (opportunities.length === 0) return [];
  return parseDecisions(await runCodex(buildDecisionPrompt(opportunities)));
}

function buildDecisionPrompt(opportunities) {
  const profile = expertProfile();
  return [
    "You are a Qwoted pitching worker.",
    `Expert profile: ${profile.name}`,
    `Expert context: ${profile.context}`,
    "",
    `The expert can pitch: ${profile.canPitch}`,
    `Reject: ${profile.reject}`,
    "",
    "Return strict JSON only: an array of objects {url, score, shouldSubmit, reason, angle, pitch}.",
    `Only set shouldSubmit=true when score >= ${MIN_DECISION_SCORE} and the pitch is directly credible.`,
    "Pitch: <=180 words, specific, journalist-useful, no generic PR opener.",
    "",
    JSON.stringify({
      opportunities: opportunities.map((opportunity) => ({
        url: opportunity.url,
        title: opportunity.title,
        outlet: opportunity.outlet,
        requestType: opportunity.requestType,
        deadline: opportunity.deadline,
        body: opportunity.body.slice(0, 2200),
      })),
    }),
  ].join("\n");
}

export function expertProfile() {
  const config = readConfig();
  return {
    name: process.env.QWOTED_EXPERT_NAME || config.expertName || "Configured expert",
    context: process.env.QWOTED_EXPERT_CONTEXT || config.expertContext || "No expert context configured yet.",
    canPitch: process.env.QWOTED_EXPERT_CAN_PITCH || config.expertCanPitch || "topics explicitly configured by the user",
    reject: process.env.QWOTED_EXPERT_REJECT || config.expertReject || "product roundups, licensed expert requests, personal anecdotes, medical/legal/financial advice, and anything requiring fake credentials",
  };
}

export function parseDecisions(text) {
  const jsonText = text.match(/\[[\s\S]*\]/)?.[0] ?? text;
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("codex_decision_not_array");
  return parsed.map((item) => ({
    url: stringField(item.url),
    score: numberField(item.score),
    shouldSubmit: item.shouldSubmit === true,
    reason: stringField(item.reason),
    angle: stringField(item.angle),
    pitch: stringField(item.pitch),
  })).filter((item) => item.url);
}

async function runCodex(prompt) {
  const outDir = join(tmpdir(), "infinite-press-agent-codex");
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const outFile = join(outDir, `last-message-${randomUUID()}.txt`);
  const args = [
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "--color",
    "never",
    "--output-last-message",
    outFile,
    ...(process.env.QWOTED_CODEX_MODEL ? ["--model", process.env.QWOTED_CODEX_MODEL] : []),
    "-",
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.QWOTED_CODEX_BIN || "codex", args, {
      cwd: process.cwd(),
      env: {
        HOME: homedir(),
        USER: process.env.USER,
        LOGNAME: process.env.LOGNAME,
        SHELL: process.env.SHELL,
        TMPDIR: process.env.TMPDIR,
        LANG: process.env.LANG,
        PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("codex_timeout"));
    }, 180_000);
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-2000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`codex_failed:${stderr || code}`));
    });
    child.stdin.end(prompt);
  });
  return (await readFile(outFile, "utf8")).trim();
}

function stringField(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}
