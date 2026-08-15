import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { LOGS_DIR } from "./config.js";
import { ensureDirs } from "./fs.js";

export function log(line, meta = undefined) {
  ensureDirs();
  const payload = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  const message = `[${new Date().toISOString()}] ${line}${payload}`;
  appendFileSync(join(LOGS_DIR, "worker.log"), `${message}\n`);
  console.log(message);
}

export function redact(value) {
  return String(value)
    .replace(/\b(access_token|refresh_token|cookie|authorization)=\S+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]");
}
