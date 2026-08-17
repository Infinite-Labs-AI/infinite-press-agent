# Architecture

Infinite Media is a local browser automation loop for media workflows. The first worker automates Qwoted scanning and pitching.

## Runtime Loop

1. `login/init` opens visible Chrome with a dedicated user data directory.
2. User signs up or logs into Qwoted manually.
3. `run` opens the same Chrome profile headlessly.
4. `scan` collects source request links and extracts request text.
5. `extract` applies deterministic hard skips.
6. `codex` asks the local `codex` CLI to score and draft pitches for eligible requests.
7. `apply` opens selected requests, handles Qwoted pitch gates, fills the editor, and submits unless dry-run is enabled.
8. `worker` prints a concise summary, sleeps 2 hours plus 1-20 minutes, and repeats.

## State

Default state directory:

```text
~/.infinite-media
```

Important subdirectories:

- `chrome-profile/`: Chrome cookies/session/localStorage.
- `runs/`: JSON run reports and debug snapshots.
- `logs/`: worker and LaunchAgent logs.

None of these should be committed.

## Model Boundary

The worker shells out to the local `codex` CLI. It does not pass cookies or browser state into the model prompt. The prompt receives only extracted opportunity text and generic expert profile fields.

## Submission Boundary

Dry-run must never:

- click final Submit
- click Qwoted's credit-spending `Start Pitching` modal action

Real apply may click those gates for selected opportunities.
