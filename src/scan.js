import { join } from "node:path";
import { launchBrowser } from "./browser.js";
import { RUNS_DIR } from "./config.js";
import { decideWithCodex } from "./codex.js";
import { extractLinks, extractOpportunity, hardSkipReason } from "./extract.js";
import { ensureDirs, writeJson } from "./fs.js";
import { log, redact } from "./log.js";

export async function scan(options = {}) {
  ensureDirs();
  const limit = Number(options.limit ?? 40);
  const browser = await launchBrowser({ visible: false });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(RUNS_DIR, `${runId}.json`);
  try {
    const page = await browser.newPage();
    const links = await extractLinks(page, limit);
    const opportunities = [];
    for (const url of links) {
      const detail = await browser.newPage();
      try {
        const opportunity = await extractOpportunity(detail, url);
        opportunities.push({ ...opportunity, hardSkipReason: hardSkipReason(opportunity) });
      } catch (error) {
        opportunities.push({
          url,
          title: "Parse failed",
          body: redact(error instanceof Error ? error.message : String(error)),
          hardSkipReason: "parse_failed",
        });
      } finally {
        await detail.close().catch(() => undefined);
      }
    }
    const eligible = opportunities.filter((opportunity) => !opportunity.hardSkipReason);
    const decisions = await decideWithCodex(eligible);
    const report = {
      runId,
      createdAt: new Date().toISOString(),
      scanned: opportunities.length,
      eligible: eligible.length,
      opportunities,
      decisions,
      selected: decisions
        .filter((decision) => decision.shouldSubmit)
        .sort((a, b) => b.score - a.score),
    };
    writeJson(reportPath, report);
    writeJson(join(RUNS_DIR, "latest.json"), report);
    log("scan complete", { scanned: report.scanned, eligible: report.eligible, selected: report.selected.length, reportPath });
    return report;
  } finally {
    await browser.close();
  }
}
