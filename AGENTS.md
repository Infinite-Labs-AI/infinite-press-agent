# Agent Instructions

This repo automates Qwoted browser sessions. Treat it as a credentials-adjacent automation project.

## Do

- Keep all Qwoted session state out of git.
- Use `npm run qwoted:dry` for browser E2E checks unless the user explicitly approves a real submission.
- Keep expert identity configurable; do not hardcode a real person's name, company, social profile, cookie, or session token.
- Run `npm test` and `npm run lint` before claiming changes work.
- Prefer small, testable changes in `src/` and unit coverage in `tests/`.
- Keep docs current when command behavior or safety semantics change.

## Do Not

- Do not print, persist, or commit cookies, localStorage, session dumps, screenshots with private data, or Chrome profiles.
- Do not use hosted model API keys by default. Ranking/pitching uses the local `codex` CLI unless the project explicitly adds a provider abstraction.
- Do not run real apply/submit commands for tests without explicit user approval.
- Do not bypass Qwoted gates in dry-run mode. Dry-run must stop before final submit and before spending a pitch credit.

## Useful Commands

```bash
npm test
npm run lint
npm run qwoted:dry -- --limit 3
```

## Code Map

- `src/session.js`: visible signup/login and login verification.
- `src/scan.js`: headless opportunity discovery and extraction.
- `src/codex.js`: local Codex prompt construction and decision parsing.
- `src/apply.js`: Qwoted form automation and submit/dry-run behavior.
- `src/worker.js`: repeated scan/apply loop and jitter.
- `src/service.js`: macOS LaunchAgent install/status.
