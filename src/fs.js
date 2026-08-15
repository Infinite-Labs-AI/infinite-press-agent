import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { APP_HOME, CONFIG_PATH, LOGS_DIR, RUNS_DIR } from "./config.js";

export function ensureDirs() {
  mkdirSync(APP_HOME, { recursive: true, mode: 0o700 });
  mkdirSync(RUNS_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(LOGS_DIR, { recursive: true, mode: 0o700 });
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function readConfig() {
  return readJson(CONFIG_PATH, {});
}

export function writeConfig(config) {
  writeJson(CONFIG_PATH, config);
}
