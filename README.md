# Infinite Press Agent

Local-first Qwoted opportunity scanner and pitching agent powered by your Codex CLI.

Press Agent keeps Qwoted browser state in a dedicated Chrome profile on your machine. It scans opportunities locally, applies deterministic exclusions, and sends only extracted opportunity text plus your configured expert profile to your local `codex` CLI for ranking and pitch drafting. It does not copy Qwoted cookies or browser state into model prompts and does not require a hosted model API key in its own configuration.

> [!CAUTION]
> A normal, non-dry run can submit a real pitch. With the current defaults, each cycle can spend one Qwoted credit and submit at most one pitch. Start with the exact dry-run command below.

## Package quickstart

Requirements: Node.js 20.18.1 or newer, Google Chrome, a Qwoted account, and an authenticated `codex` CLI.

```bash
npm install -g infinite-press-agent
press-agent init
press-agent run --once --dry-run
```

`press-agent init` opens visible Chrome so you can sign in to Qwoted manually. The dry run performs one scan/apply cycle and may open pages and fill a pitch form locally, but it does not click Qwoted's credit-spending `Start Pitching` action or the final Submit action.

Only after reviewing the dry-run output should you consider a real one-cycle run:

```bash
press-agent run --once
```

Removing `--dry-run` allows the agent to cross Qwoted's credit gate and submit a pitch. The current default is `--max-submit 1`, so one cycle can spend one Qwoted credit and submit at most one pitch. `press-agent run` without `--once` repeats after two hours plus 1–20 minutes of jitter and can submit again on later cycles.

## Configure the expert profile

Set the identity and topics the agent may represent before relying on its decisions:

```bash
export QWOTED_EXPERT_NAME="Example Expert"
export QWOTED_EXPERT_CONTEXT="Founder of Example Co, building B2B AI workflow tools."
export QWOTED_EXPERT_CAN_PITCH="AI agents, workflow automation, B2B SaaS, marketing operations"
export QWOTED_EXPERT_REJECT="medical, legal, financial, product roundups, personal anecdotes"
```

These values can also live in a local `.env` file or the local worker configuration. Never commit a real expert profile if it contains private context.

## Package commands

```bash
press-agent init                         # visible Chrome signup/login
press-agent scan                         # scan, filter, and ask Codex to rank opportunities
press-agent run --once --dry-run         # one non-submitting cycle
press-agent run --once                   # one real cycle; may spend a credit and submit
press-agent run                          # repeating real worker; may submit each cycle
press-agent install                      # install/start the macOS LaunchAgent real worker
press-agent status                       # show launchd status and recent local logs
press-agent uninstall                    # stop/remove the macOS LaunchAgent
```

The background LaunchAgent is macOS-specific and starts the same real, one-submit-per-cycle default loop. Do not install it until you have reviewed dry-run results and intend automatic submissions.

## Source development

Use this path to work on the repository rather than install the published package:

```bash
git clone https://github.com/Infinite-Labs-AI/infinite-press-agent.git
cd infinite-press-agent
npm ci
cp .env.example .env
npm run qwoted:login
npm run qwoted:dry
```

Repository scripts map to the same runtime:

```bash
npm run qwoted          # repeating real worker; current default max is one submission per cycle
npm run qwoted:once     # one real cycle
npm run qwoted:dry      # one dry cycle; never submits or spends a credit
npm run qwoted:install  # install/start the macOS LaunchAgent real worker
npm run qwoted:status   # show launchd status and logs
```

## Local data and model boundary

- Qwoted cookies, session storage, and localStorage live under `~/.infinite-press-agent/chrome-profile/` by default.
- Run reports and optional debug snapshots live under `~/.infinite-press-agent/runs/`; LaunchAgent logs live under `~/.infinite-press-agent/logs/`.
- The browser automation and orchestration run locally. Extracted opportunity text and the configured expert profile are sent to the provider/account used by your local Codex CLI for inference.
- Dry-run stops before Qwoted's credit-spending gate and final Submit. A non-dry run does not.
- Already-pitched, expired, fee-based, product-roundup, personal-anecdote, and licensed-expert requests are excluded before model ranking.

If Qwoted login expires, rerun `press-agent init` (or `npm run qwoted:login` from a source checkout).

## Ecosystem

- [Infinite agents](https://infinite.fast/agents/) — public discovery and install paths for the agent ecosystem.
- [Infinite OS](https://github.com/Infinite-Labs-AI/infinite-os) — the MIT-licensed local-first growth analytics engine and CLI.
- [Infinite Skills](https://github.com/Infinite-Labs-AI/infinite-skills) — installable Codex skills for marketing operator work.
- [Infinite for Mac](https://infinite.fast/download) — canonical desktop download.
- [Infinite Labs AI](https://github.com/Infinite-Labs-AI) — public GitHub organization.

## Project docs

- [Agent guide](AGENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Operations](docs/OPERATIONS.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
