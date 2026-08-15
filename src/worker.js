import { applyLatest } from "./apply.js";
import { intOption } from "./config.js";
import { log } from "./log.js";
import { scan } from "./scan.js";
import { printRunSummary } from "./summary.js";

export function nextDelayMs(random = Math.random) {
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const jitterMinutes = 1 + Math.floor(random() * 20);
  return twoHoursMs + jitterMinutes * 60 * 1000;
}

export async function runWorker(options = {}) {
  const once = options.once === true;
  do {
    const scanReport = await scan({ limit: intOption(options, "limit", 40) });
    const applyReport = await applyLatest({
      maxSubmit: intOption(options, "maxSubmit", 1),
      minScore: intOption(options, "minScore", 80),
      dryRun: options.dryRun === true,
      debug: options.debug === true,
      visible: options.visible === true,
    });
    printRunSummary(scanReport, applyReport);
    if (once) return { scanReport, applyReport };
    const delay = nextDelayMs();
    log("sleeping until next run", { minutes: Math.round(delay / 60_000) });
    await new Promise((resolve) => setTimeout(resolve, delay));
  } while (true);
}
