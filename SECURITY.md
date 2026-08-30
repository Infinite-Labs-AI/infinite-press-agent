# Security Policy

Infinite Press Agent is credentials-adjacent browser automation. It reuses a local Qwoted session and, outside dry-run mode, can spend a Qwoted credit and submit a real pitch.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/Infinite-Labs-AI/infinite-press-agent/security/advisories/new) where available. If you cannot use that flow, email **support@ultima.inc**.

Please do not open a public issue for a suspected vulnerability. Do not attach live cookies, session exports, tokens, private reporter requests, or screenshots containing account data. A useful report includes:

- a concise summary and potential impact;
- the affected commit/version and operating system;
- minimal reproduction steps using redacted or synthetic data; and
- whether the issue can cross the dry-run, credential, model-input, or submission boundary.

We will acknowledge the report, validate the affected boundary, coordinate a fix, and agree on disclosure timing with the reporter. Please keep details private until a fix is available or a coordinated disclosure date is reached.

## Sensitive local data

Sensitive data includes:

- Qwoted cookies, session storage, and localStorage;
- the dedicated Chrome profile under `~/.infinite-press-agent/chrome-profile/`;
- run reports, debug snapshots, and LaunchAgent logs that may contain private account or reporter/request content; and
- expert profile context if it contains private identity or company information.

These files belong in the local state directory and must never be committed, pasted into issues, or included in vulnerability reports.

## Trust boundaries

### Authentication

The agent avoids manual cookie copying. `press-agent init` opens visible Chrome for a manual Qwoted login, and later runs reuse that dedicated local profile. If authentication expires, initialize the session again; do not export or paste session values.

### Model input

The agent invokes the local `codex` CLI. It sends extracted opportunity text and configured expert profile fields for ranking and drafting, but it does not intentionally send Qwoted cookies or raw browser storage. The resulting inference is governed by the Codex account/provider the operator configured.

### Submission and credits

`press-agent run --once --dry-run` may navigate to an opportunity and fill local form state, but it must stop before the Qwoted `Start Pitching` credit action and final Submit action.

Removing `--dry-run` changes the trust boundary: the agent may click the credit gate and submit. With current defaults, each cycle can spend one Qwoted credit and submit at most one pitch. A repeating run or installed LaunchAgent can do so again on later cycles.

Use only accounts and expert identities you are authorized to operate. Never test a submission-boundary change against a real opportunity unless the account owner has explicitly approved that submission.
