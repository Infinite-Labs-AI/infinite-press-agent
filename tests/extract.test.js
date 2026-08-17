import test from "node:test";
import assert from "node:assert/strict";
import { extractRequestBody, hardSkipReason, normalizeLines } from "../src/extract.js";
import { nextDelayMs } from "../src/worker.js";
import { parseDecisions } from "../src/codex.js";
import { findBestPitchAction, findBestSourceAction, findBestStartPitchingAction } from "../src/apply.js";
import { buildFfmpegArgs, recordingFilename, selectOpportunityLink } from "../src/record.js";
import { isAccountDisabled } from "../src/session.js";
import { buildRunSummary } from "../src/summary.js";

test("normalizeLines removes Qwoted chrome", () => {
  const lines = normalizeLines("This website uses cookies\nOpportunities\nCopy content\nReal request body");
  assert.deepEqual(lines, ["Real request body"]);
});

test("hardSkipReason skips already pitched and product roundups", () => {
  assert.equal(hardSkipReason({ alreadyPitched: true, pitchAvailable: true, title: "AI", requestType: "", body: "" }), "already_pitched");
  assert.equal(hardSkipReason({ alreadyPitched: false, pitchAvailable: true, title: "Gift Guide", requestType: "PRODUCT REQUEST", body: "Seeking products" }), "product_roundup");
});

test("extractRequestBody strips obvious metadata", () => {
  const body = extractRequestBody(["Copy content", "Revenue Analytics Needed", "Domain Authority 27", "Need experts", "Pitch the opportunity"]);
  assert.equal(body, "Revenue Analytics Needed\nNeed experts");
});

test("nextDelayMs is 2h plus 1-20m", () => {
  assert.equal(nextDelayMs(() => 0), 2 * 60 * 60 * 1000 + 60 * 1000);
  assert.equal(nextDelayMs(() => 0.999), 2 * 60 * 60 * 1000 + 20 * 60 * 1000);
});

test("parseDecisions parses fenced/noisy JSON array", () => {
  const decisions = parseDecisions('text [{"url":"u","score":91,"shouldSubmit":true,"reason":"r","angle":"a","pitch":"p"}]');
  assert.equal(decisions[0].url, "u");
  assert.equal(decisions[0].score, 91);
});

test("findBestPitchAction prefers the opportunity CTA over nav pitch links", () => {
  const action = findBestPitchAction([
    { text: "My Pitches", href: "https://app.qwoted.com/my_pitches" },
    { text: "6 Pitch Credits | Upgrade", href: "https://app.qwoted.com/billing" },
    { text: "Pitch now", href: null },
  ]);
  assert.equal(action.text, "Pitch now");
});

test("findBestSourceAction selects the current profile source", () => {
  const action = findBestSourceAction([
    { text: "Add new", id: null },
    { text: "Unspecified *", id: "btn_unspecified" },
    { text: "Myself: Example Expert\nExample Company\nBasic", id: "source_336819" },
  ]);
  assert.equal(action.id, "source_336819");
});

test("findBestStartPitchingAction selects the credit unlock modal action", () => {
  const action = findBestStartPitchingAction([
    { text: "Cancel" },
    { text: "Start Pitching" },
    { text: "Pitch Now" },
  ]);
  assert.equal(action.text, "Start Pitching");
});

test("isAccountDisabled detects Qwoted disabled account redirects", () => {
  assert.equal(
    isAccountDisabled(
      "https://app.qwoted.com/dashboard?flash_primary=Account+temporarily+disabled.&show_account_disabled_modal=true",
      "",
    ),
    true,
  );
  assert.equal(isAccountDisabled("https://app.qwoted.com/dashboard", "chat with our support team to re-enable your account"), true);
  assert.equal(isAccountDisabled("https://app.qwoted.com/source_requests/test", "Pitch the opportunity"), false);
});

test("recordingFilename produces filesystem-safe mp4 names", () => {
  assert.equal(recordingFilename(new Date("2026-08-17T09:08:07.006Z")), "qwoted-run-2026-08-17T09-08-07-006Z.mp4");
});

test("buildFfmpegArgs encodes numbered jpg frames into a browser-safe mp4", () => {
  const args = buildFfmpegArgs({ fps: 2, framesDir: "/tmp/frames", outputPath: "/tmp/out.mp4" });
  assert.deepEqual(args, [
    "-y",
    "-framerate",
    "2",
    "-i",
    "/tmp/frames/frame-%06d.jpg",
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-movflags",
    "+faststart",
    "/tmp/out.mp4",
  ]);
});

test("selectOpportunityLink ignores nav/search links and picks the first request detail URL", () => {
  assert.equal(
    selectOpportunityLink([
      "https://app.qwoted.com/source_requests",
      "https://app.qwoted.com/source_requests/search?query=ai",
      "https://app.qwoted.com/source_requests/ai-agent-pricing",
      "https://app.qwoted.com/source_requests/another",
    ]),
    "https://app.qwoted.com/source_requests/ai-agent-pricing",
  );
});

test("buildRunSummary prints submitted and skipped opportunities", () => {
  const summary = buildRunSummary(
    {
      scanned: 40,
      eligible: 8,
      selected: [{ url: "https://app.qwoted.com/source_requests/a" }, { url: "https://app.qwoted.com/source_requests/b" }],
      opportunities: [
        { url: "https://app.qwoted.com/source_requests/a", title: "Good request" },
        { url: "https://app.qwoted.com/source_requests/b", title: "Credit gated request" },
      ],
    },
    {
      results: [
        { url: "https://app.qwoted.com/source_requests/a", status: "submitted" },
        { url: "https://app.qwoted.com/source_requests/b", status: "credit_required_dry_run" },
      ],
    },
  );
  assert.match(summary, /Submitted: 1/);
  assert.match(summary, /Good request/);
  assert.match(summary, /Credit gated request \(credit_required_dry_run\)/);
});
