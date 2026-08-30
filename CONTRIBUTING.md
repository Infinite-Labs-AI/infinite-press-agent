# Contributing to Infinite Press Agent

Thanks for helping improve Press Agent. This project controls a logged-in browser and can submit real Qwoted pitches, so contributions must preserve the dry-run and credential boundaries.

## Development setup

Requirements:

- Node.js 20.18.1 or newer;
- npm;
- Google Chrome for browser-flow testing; and
- an authenticated local `codex` CLI only when testing ranking/drafting behavior.

Fork the repository, create a focused branch from `main`, then install the locked dependency set:

```bash
git clone https://github.com/<your-account>/infinite-press-agent.git
cd infinite-press-agent
npm ci
```

Copy `.env.example` to `.env` only when a local browser test needs configuration. Keep real expert context, Qwoted state, cookies, tokens, Chrome profiles, run reports, debug snapshots, and logs out of git.

## Required checks

Run both repository gates before opening a pull request:

```bash
npm run lint
npm test
```

For a browser-flow change, also exercise the dry-run boundary against an account and opportunities you are authorized to use:

```bash
npm run qwoted:dry -- --limit 3
```

Do not run a real apply/submit flow as a contribution test. Dry-run may inspect and fill a form locally, but it must not click Qwoted's credit-spending action or final Submit.

## Pull requests

Keep pull requests small and explain:

- what changed and why;
- which trust boundary is affected;
- the commands you ran and their results; and
- any documentation or tests updated with the behavior.

Add or update unit coverage for behavior changes. Keep CLI help, README, architecture, operations, and security copy synchronized with any command or safety-semantic change.

Never commit generated runtime state or secrets. Review staged files before pushing, and redact logs or screenshots included in a pull request.

## Security reports

Do not report vulnerabilities in a public issue or pull request. Follow the private process in [SECURITY.md](SECURITY.md).
