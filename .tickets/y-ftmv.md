---
id: y-ftmv
status: open
deps: []
links: []
created: 2026-03-23T23:17:16Z
type: feature
priority: 2
assignee: Jibles
---
# you-ai CLI — file import commands

## Objective

Add a `you-ai` CLI package that lets users import data files (.mbox, .ics, .csv) into their You.ai instance without SSH-ing into the server or manually curling endpoints. This is the first piece of a broader CLI that will eventually handle setup, logs, start/stop, and full remote server management — but this ticket scopes to import + minimal config/status commands only.

## User Story

As a self-hoster running You.ai on a VPS, I want to import my Google Takeout and LinkedIn exports from my local machine without touching SSH, so that onboarding my personal data is as simple as running a single command.

## Context & Findings

- The API already has fully functional import endpoints that accept multipart file uploads (multer, 500MB limit):
  - `POST /api/import/mbox` — Gmail mailbox export, field name `file`
  - `POST /api/import/ics` — Google Calendar export, field name `file`
  - `POST /api/import/csv` — LinkedIn connections CSV, field name `file`, optional `source` body param
- Response shapes differ by type:
  - mbox/ics: `{ contacts: number, interactions: number }`
  - csv: `{ total: number, created: number, merged: number }`
- `GET /health` returns `{ status: "ok" }` — usable for status checks
- No existing CLI tooling in the repo. No root package.json. The only package is `api/`.
- The repo has no auth on the API — endpoints are open. Auth is out of scope for this ticket but the CLI should be structured so a bearer token header can be added later.
- `setup.sh` exists at repo root but is a standalone bash script, not part of any package.

## Design Constraints

- CLI lives in a new `cli/` directory at repo root with its own `package.json` — it's a client tool, not a server dependency
- Uses Commander.js for arg parsing and prompts
- Local config persisted in `~/.youai/config.json` (API host URL, and later SSH host, auth token, etc.)
- File type detection by extension — no magic bytes needed since the API parsers handle validation
- Must work when API is on localhost (default) or a remote host (configured via `you-ai config`)
- Structure commands as separate modules so future commands (setup, logs, start, stop, restart) slot in without refactoring

## Files

- `cli/package.json` — new, Commander.js + node-fetch (or undici) dependencies, `bin` entry pointing to dist entrypoint
- `cli/tsconfig.json` — new, target ES2022, moduleResolution NodeNext (match api/ conventions)
- `cli/src/index.ts` — new, Commander program definition, registers subcommands
- `cli/src/commands/import.ts` — new, `you-ai import <file>` command implementation
- `cli/src/commands/status.ts` — new, `you-ai status` command (hits /health)
- `cli/src/commands/config.ts` — new, `you-ai config set <key> <value>` / `you-ai config get <key>` / `you-ai config list`
- `cli/src/lib/config.ts` — new, reads/writes ~/.youai/config.json
- `cli/src/lib/api.ts` — new, thin HTTP client that resolves base URL from config, sends multipart requests. Structured so auth header can be added later.
- `api/src/routes/import.ts` — reference only, do not modify

## Acceptance Criteria

- [ ] `you-ai import path/to/file.mbox` uploads to `/api/import/mbox` and prints contact/interaction counts
- [ ] `you-ai import path/to/file.ics` uploads to `/api/import/ics` and prints contact/interaction counts
- [ ] `you-ai import path/to/file.csv` uploads to `/api/import/csv` and prints total/created/merged counts
- [ ] `you-ai import` with unsupported extension prints helpful error listing supported types
- [ ] `you-ai import` with nonexistent file prints clear error before attempting upload
- [ ] `you-ai status` hits /health and reports API status (up/down with URL shown)
- [ ] `you-ai config set host http://my-vps:3000` persists to ~/.youai/config.json
- [ ] `you-ai config list` shows current config values
- [ ] Default host is `http://localhost:3000` when no config is set
- [ ] CLI is runnable via `npx` from the cli/ directory or via `node dist/index.js`
- [ ] Commands are separate modules — adding a new command doesn't require modifying existing command files
- [ ] Lint and type-check pass

## Gotchas

- The mbox/ics endpoints return `{ contacts, interactions }` but csv returns `{ total, created, merged }` — the import command needs to handle both response shapes and format output accordingly
- node-fetch v3 is ESM-only which matches the project's module setup, but make sure tsconfig and package.json type field align
- The 500MB multer limit is server-side; for very large files the CLI should stream the upload rather than buffering the entire file in memory (use fs.createReadStream + FormData)
- ~/.youai/ directory may not exist on first run — config module must create it
- No auth exists yet — structure the API client so a `token` config key can be read and sent as `Authorization: Bearer <token>` header later without changing command code
