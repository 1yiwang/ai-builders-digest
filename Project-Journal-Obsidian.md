# Project Journal — ai-builders-digest

> **Append a new dated section at the top** of this file (newest first).
> Every entry MUST use the canonical structure below — same section order, same headings.
> `New Concepts Discovered` is part of every entry; if a fresh scan finds nothing new, write a single row `| None | — | — | — |` so it's clear the scan happened and produced nothing.
> See `.cursor/rules/knowledge-capture.mdc` for the rules on **when** to add a concept row.

## Canonical entry template

````markdown
## YYYY-MM-DD

### Project Status
active / paused / completed

### Current Phase
e.g. MVP build, UI polish, architecture refactor, bug fix, productization

### What I Did
- Completed feature / fix / decision

### Files Changed
- `src/file.py` — what changed and why

### Architecture & Key Decisions
- Why this choice over the alternatives

### Blockers
- What's stuck (write `None` if nothing)

### Next
- Concrete next step(s)

### Notes for Librarian
- Knowledge points or cross-project connections worth surfacing in Obsidian

### New Concepts Discovered

| Concept | Where in code | Why it matters | One-line description |
|---------|--------------|----------------|---------------------|
| concept-name | `path/to/file.ts` | Why this is worth knowing beyond this project | 1-sentence what-it-is and how it's used here |
````

---

## 2026-05-30

### Project Status
active

### Current Phase
Pipeline live (M/W/F CI auto-publish + Telegram push). Today: workflow infrastructure bootstrap + earlier-day `publish.ps1` path fix.

### What I Did
- (Earlier today, from `swiss-job-agent-web` Cursor window)
  - Moved repo from `C:\Users\Monica\ai-builders-digest` → `D:\Projects\ai-builders-digest` (cross-drive move). A leftover empty `.git` directory at the source had to be force-deleted afterwards.
  - Made `scripts/publish.ps1` location-agnostic by replacing the hard-coded `$RepoRoot = "C:\Users\Monica\ai-builders-digest"` with `$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path`. Committed as `f2536e9 fix(publish): derive repo root from script location instead of hard-coded path`.
- (Now) Installed `.cursor/rules/knowledge-capture.mdc` and `.cursor/rules/journal-workflow.mdc`, identical to the master copies in `swiss-job-agent-web`.
- Installed `scripts/journal-archive.ps1` (monthly journal archive script — separate from the existing `publish.ps1`).
- Created this `Project-Journal-Obsidian.md` with the canonical 9-section template at the top.

### Files Changed
- `scripts/publish.ps1` — replaced hard-coded `$RepoRoot` with a `$PSScriptRoot`-derived path so the script keeps working after folder moves.
- `.cursor/rules/knowledge-capture.mdc` — new
- `.cursor/rules/journal-workflow.mdc` — new
- `scripts/journal-archive.ps1` — new
- `Project-Journal-Obsidian.md` — new (this file)

### Architecture & Key Decisions
- Path-agnostic script approach: derive repo root from `$PSScriptRoot` rather than hard-coding an absolute path. Survives any future folder moves; today's path fix was triggered by exactly the failure mode this prevents.
- Same workflow scaffolding as sibling projects under `D:\Projects\`. Existing `PROGRESS.md` left **in place** as the legacy feature-grouped progress doc (refreshed today to 2026-05-30). New dated entries from today onward go in this file.

### Project Snapshot (as of 2026-05-30)
- **Status**: live in production. CI auto-publishes Mon/Wed/Fri 06:00 UTC + Telegram push.
- **Latest issue**: `2026-05-29` (6 cards across 3 sections, v2 prompt). Prior: `2026-05-25` (8 cards). Both rendered under `issues/`.
- **Pipeline**: `npm run full` = feed → magazine JSON → render HTML → update archive → Telegram. Triggered by `.github/workflows/daily-digest.yml`.
- **AI backend**: DeepSeek (Anthropic-compatible gateway `api.deepseek.com/anthropic`), with Anthropic-format fallback. Switching is env-var-driven (`DEEPSEEK_API_KEY` vs `ANTHROPIC_API_KEY`) — zero-cost migration.
- **Sources**: 9 X/Twitter accounts (Nitter RSS by default, X API v2 if `X_BEARER_TOKEN` set) + 4 ML podcasts + 8 blogs (HF/OpenAI/Together + Karpathy/Simon Willison/Chip Huyen + 2 中文). Sources frozen in `config/sources.json`.
- **UI**: cover (`index.html`) with 6-node glassmorphic constellation + breathing-light bulb; per-issue page with EN/DE tabs, priority sort, light/dark toggle, mobile-responsive (480px breakpoint, WCAG AA touch targets).
- **Data shape**: `data/issues/*.json` is the source of truth (cards + priority + sections). `data/feeds/*.json` cached feeds. `data/state-feed.json` dedup state + X user-id cache.
- **Known runtime-state leak**: Telegram bot token + a few configs still live in `~/.follow-builders/.env` on `C:` drive (kept by design for the `follow-builders` Cursor skill). Critical configs (prompt, author identities, avatars manifest) are in repo `config/`.
- **Backlog**: 多领域分版 (金融 / 政策 / 生物科技). Single-line backlog from `PROGRESS.md`; no started work yet.
- **Authoritative progress doc**: `PROGRESS.md` (feature-grouped, refreshed 2026-05-30 to include today's workflow-scaffold work).

### Blockers
- A leftover file with mojibake filename `ui修改.txt` at repo root (looks like a stale Windows note from an earlier session). Not blocking anything; can be renamed or removed at convenience.
- Telegram bot token still lives in `~/.follow-builders/.env` (state path, kept by design for the `follow-builders` Cursor skill). It means a piece of this project's runtime state still lives on `C:`. Acceptable trade-off; documented for visibility.

### Next
- (TBD on the next active session.) From legacy `PROGRESS.md` backlog (2026-05-29): "多领域分版 (金融 / 政策 / 生物科技)".

### Notes for Librarian
- Authoritative progress doc: `PROGRESS.md` at repo root — feature-grouped, refreshed 2026-05-30 to include today's workflow-scaffold work. New **dated** entries go in this journal; PROGRESS.md continues to grow as the by-feature truth.
- Repo location: `D:\Projects\ai-builders-digest` (moved today from `C:\Users\Monica\ai-builders-digest`).
- Paired Cursor skill: `follow-builders` (in `~/.cursor/skills/follow-builders/`); runtime state in `~/.follow-builders/` was kept in place by design.
- Sister projects under `D:\Projects\`: `swiss-job-agent-web` (master copy of these workflow rules), `CV-site`, `permit-advisor`.
- The `path-agnostic-script-root` concept captured in today's NCD generalizes: apply the same `$PSScriptRoot`-relative pattern to any cross-machine PowerShell script (and `__dirname` / `import.meta.url` in Node).

### New Concepts Discovered

| Concept | Where in code | Why it matters | One-line description |
|---------|--------------|----------------|---------------------|
| path-agnostic-script-root | `scripts/publish.ps1` | Defensive scripting so folder moves don't silently break automation | Derive `$RepoRoot` from `$PSScriptRoot` (or `__dirname` / `import.meta.url` in Node) rather than hard-coding an absolute path; survives folder reorgs with zero code changes |
