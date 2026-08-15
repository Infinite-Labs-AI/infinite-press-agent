# Operations

## First Run

```bash
npm install
cp .env.example .env
npm run qwoted:login
npm run qwoted:dry
```

After validating dry-run behavior:

```bash
npm run qwoted
```

## Background Install

macOS:

```bash
npm run qwoted:install
npm run qwoted:status
```

The LaunchAgent starts immediately and runs the same one-submit-per-cycle loop as `npm run qwoted`.

## Periodic Behavior

Defaults:

- scan limit: `40`
- minimum score: `80`
- max submissions per cycle: `1`
- interval: `2 hours + 1-20 minutes jitter`

Override with CLI flags:

```bash
npm run qwoted -- --limit 20 --max-submit 1 --min-score 85
```

## Auth Expiry

If the worker reports `needs_human_login`, run:

```bash
npm run qwoted:login
```

The next cycle will reuse the refreshed browser profile.
