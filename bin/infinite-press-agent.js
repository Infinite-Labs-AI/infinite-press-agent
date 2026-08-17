#!/usr/bin/env node

import { applyLatest } from "../src/apply.js";
import { installLaunchAgent, printStatus, uninstallLaunchAgent } from "../src/service.js";
import { login } from "../src/session.js";
import { scan } from "../src/scan.js";
import { runWorker } from "../src/worker.js";

const command = process.argv[2] || "help";
const args = process.argv.slice(3);

try {
  let shouldExit = true;
  if (command === "init" || command === "login") {
    await login({ visible: true });
  } else if (command === "scan") {
    await scan(parseOptions(args));
  } else if (command === "apply") {
    await applyLatest(parseOptions(args));
  } else if (command === "run") {
    const options = parseOptions(args);
    await runWorker(options);
    shouldExit = options.once === true;
  } else if (command === "install") {
    await installLaunchAgent(parseOptions(args));
  } else if (command === "uninstall") {
    await uninstallLaunchAgent();
  } else if (command === "status") {
    await printStatus();
  } else {
    printHelp();
  }
  if (shouldExit) process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[infinite-press-agent] ${message}`);
  process.exitCode = 1;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--once") options.once = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const next = args[index + 1];
      if (!next || next.startsWith("--")) options[key] = true;
      else {
        options[key] = next;
        index += 1;
      }
    }
  }
  return options;
}

function printHelp() {
  console.log(`infinite-press-agent

Commands:
  init/login        Open visible Chrome once so you can log into Qwoted
  scan              Headless scan, clean extract, hard filter, Codex shortlist
  apply             Apply latest scan decisions
  run               Scan + apply now, then every 2h + 1-20m jitter unless --once
  install           Write and start macOS LaunchAgent background worker
  uninstall         Unload/remove macOS LaunchAgent plist
  status            Print launchd/log status

Options:
  --limit 40
  --max-submit 1
  --min-score 80
  --dry-run
  --debug
  --visible
  --once
`);
}
