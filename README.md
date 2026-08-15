# Qwoted Worker

Local-first Qwoted scanner and pitching worker.

It uses a dedicated Chrome profile for Qwoted login state, local browser automation for scanning/submission, and a BYO `codex` CLI for ranking opportunities and drafting pitches. It does not require hosted model API keys.

## Quick Start

```bash
npm install
cp .env.example .env
npm run qwoted:login
npm run qwoted
```

`npm run qwoted` scans immediately, submits at most one pitch, prints a short summary, then repeats every 2 hours plus 1-20 minutes of jitter.

## Commands

```bash
npm run qwoted          # foreground loop: scan/apply, sleep, repeat
npm run qwoted:once     # one real scan/apply cycle
npm run qwoted:dry      # one safe dry run; never submits or spends a credit
npm run qwoted:login    # opens visible Chrome for signup/login
npm run qwoted:install  # macOS LaunchAgent background worker
npm run qwoted:status   # background worker status/log tail
```

## Expert Profile

Configure the expert identity before real use:

```bash
QWOTED_EXPERT_NAME="Example Expert"
QWOTED_EXPERT_CONTEXT="Founder of Example Co, building B2B AI workflow tools."
QWOTED_EXPERT_CAN_PITCH="AI agents, workflow automation, B2B SaaS, marketing operations"
QWOTED_EXPERT_REJECT="medical, legal, financial, product roundups, personal anecdotes"
```

These can live in `.env`, shell profile, or `~/.qwoted-worker/config.json`.

## Auth Model

`npm run qwoted:login` opens Chrome with a dedicated profile:

```text
~/.qwoted-worker/chrome-profile
```

Sign up or log in manually. Future headless runs reuse that same browser profile. The worker does not print cookies, passwords, tokens, or Qwoted session values.

## Safety Model

- Dedicated browser profile and state directory: `~/.qwoted-worker`
- Logs and reports: `~/.qwoted-worker/runs`
- Dry-run stops before final submit and before Qwoted's credit-spending gate.
- Already-pitched, expired, fee-based, product roundup, personal anecdote, and licensed-expert requests are skipped before model ranking.
- If login expires, run `npm run qwoted:login` again.

## Development

```bash
npm test
npm run lint
npm run qwoted:dry -- --limit 3
```

See:

- [Agent Guide](AGENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Operations](docs/OPERATIONS.md)
