import { homedir } from "node:os";
import { join } from "node:path";
import { loadDotEnv } from "./env.js";

loadDotEnv();

export const APP_HOME = process.env.QWOTED_WORKER_HOME || process.env.INFINITE_MEDIA_HOME || join(homedir(), ".infinite-media");
export const CHROME_PROFILE_DIR = process.env.QWOTED_CHROME_PROFILE || join(APP_HOME, "chrome-profile");
export const RUNS_DIR = join(APP_HOME, "runs");
export const LOGS_DIR = join(APP_HOME, "logs");
export const CONFIG_PATH = join(APP_HOME, "config.json");
export const SOURCE_REQUESTS_URL = "https://app.qwoted.com/source_requests";
export const AUTH_URL = process.env.QWOTED_AUTH_URL || SOURCE_REQUESTS_URL;
export const CHROME_PATH = process.env.QWOTED_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const SERVICE_LABEL = process.env.QWOTED_SERVICE_LABEL || process.env.INFINITE_MEDIA_SERVICE_LABEL || "com.infinite-media.agent";
export const MIN_DECISION_SCORE = Number(process.env.QWOTED_MIN_DECISION_SCORE || process.env.QWOTED_MIN_SCORE || 80);

export function intOption(options, key, fallback) {
  const value = Number(options[key] ?? process.env[`QWOTED_${key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}`] ?? fallback);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}
