# Security

## Sensitive Data

Sensitive local data includes:

- Qwoted cookies and session storage
- Chrome profile files
- run debug snapshots that may include reporter/request/private account UI
- LaunchAgent logs
- expert private profile context, if sensitive

Do not commit any of these.

## Auth Strategy

The worker intentionally avoids manual cookie copy/paste. It stores browser auth state only inside a dedicated Chrome profile:

```text
~/.qwoted-worker/chrome-profile
```

If auth expires, run:

```bash
npm run qwoted:login
```

## Testing Safely

Use:

```bash
npm run qwoted:dry
```

Dry-run may open Qwoted pages and fill local form state, but it must not spend credits or submit pitches.

## Reporting Vulnerabilities

Until this repo is public, report issues privately through the repository owner.
