import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { APP_HOME, LOGS_DIR, SERVICE_LABEL } from "./config.js";
import { ensureDirs } from "./fs.js";

const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);

export async function installLaunchAgent() {
  ensureDirs();
  const binPath = new URL("../bin/qwoted-worker.js", import.meta.url).pathname;
  const launchPath = process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
  mkdirSync(dirname(PLIST_PATH), { recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true, mode: 0o700 });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>node "${binPath}" run --limit 40 --max-submit 1 --min-score 80</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(LOGS_DIR, "launchd.out.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(LOGS_DIR, "launchd.err.log")}</string>
  <key>WorkingDirectory</key>
  <string>${APP_HOME}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapePlist(launchPath)}</string>
    <key>QWOTED_WORKER_HOME</key>
    <string>${APP_HOME}</string>
  </dict>
</dict>
</plist>
`;
  writeFileSync(PLIST_PATH, plist, { mode: 0o600 });
  spawnSync("launchctl", ["bootout", `gui/${userInfo().uid}`, PLIST_PATH], { stdio: "ignore" });
  const load = spawnSync("launchctl", ["bootstrap", `gui/${userInfo().uid}`, PLIST_PATH], { encoding: "utf8" });
  console.log(`Wrote ${PLIST_PATH}`);
  if (load.status === 0) {
    console.log(`Started ${SERVICE_LABEL}`);
  } else {
    console.log("Could not start automatically. Run:");
    console.log(`  launchctl bootstrap gui/${userInfo().uid} ${PLIST_PATH}`);
    if (load.stderr) console.log(load.stderr.trim());
  }
}

function escapePlist(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function uninstallLaunchAgent() {
  spawnSync("launchctl", ["bootout", `gui/${userInfo().uid}`, PLIST_PATH], { stdio: "ignore" });
  spawnSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
  if (existsSync(PLIST_PATH)) rmSync(PLIST_PATH);
  console.log(`Removed ${PLIST_PATH}`);
}

export async function printStatus() {
  const list = spawnSync("launchctl", ["list"], { encoding: "utf8" });
  const loaded = list.stdout.includes(SERVICE_LABEL);
  console.log(JSON.stringify({
    label: SERVICE_LABEL,
    loaded,
    plistPath: PLIST_PATH,
    plistExists: existsSync(PLIST_PATH),
    lastOut: readTail(join(LOGS_DIR, "launchd.out.log")),
    lastErr: readTail(join(LOGS_DIR, "launchd.err.log")),
  }, null, 2));
}

function readTail(path) {
  try {
    return readFileSync(path, "utf8").split("\n").slice(-20).join("\n");
  } catch {
    return "";
  }
}
