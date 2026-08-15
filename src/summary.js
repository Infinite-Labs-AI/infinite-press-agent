export function buildRunSummary(scanReport, applyReport) {
  const opportunities = new Map((scanReport?.opportunities ?? []).map((opportunity) => [opportunity.url, opportunity]));
  const results = applyReport?.results ?? [];
  const submitted = results.filter((result) => result.status === "submitted");
  const notSubmitted = results.filter((result) => result.status !== "submitted");
  const lines = [
    "",
    "Qwoted run complete",
    `Scanned: ${scanReport?.scanned ?? 0}`,
    `Eligible: ${scanReport?.eligible ?? 0}`,
    `Selected: ${scanReport?.selected?.length ?? 0}`,
    `Submitted: ${submitted.length}`,
  ];

  if (submitted.length > 0) {
    lines.push("", "Submitted:");
    for (const result of submitted) {
      lines.push(`- ${titleFor(result, opportunities)}`);
      lines.push(`  ${result.url}`);
    }
  }

  if (notSubmitted.length > 0) {
    lines.push("", "Not submitted:");
    for (const result of notSubmitted) {
      lines.push(`- ${titleFor(result, opportunities)} (${result.status}${result.error ? `: ${result.error}` : ""})`);
      lines.push(`  ${result.url}`);
    }
  }

  if (results.length === 0) {
    lines.push("", "No applications attempted this run.");
  }

  return lines.join("\n");
}

export function printRunSummary(scanReport, applyReport) {
  console.log(buildRunSummary(scanReport, applyReport));
}

function titleFor(result, opportunities) {
  return result.title || opportunities.get(result.url)?.title || result.url;
}
