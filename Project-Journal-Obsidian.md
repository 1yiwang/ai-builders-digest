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

## 2026-06-07

### Project Status
active

### Current Phase
Cover redesign (fashion-magazine masthead) + theme-system simplification + Vercel deployment + external-facing docs.

### What I Did
- **Removed the theme toggle entirely** and fixed the whole site to a single dark palette. The cover relies on `mix-blend-mode: screen` (needs a dark backdrop), so a light/dark switch never made visual sense for it. Collapsed `:root` + `@media (prefers-color-scheme)` + `[data-theme="dark"]` + `[data-theme="light"]` into one dark `:root`; deleted the toggle button, its CSS/icons, and the `initTheme()` JS.
- **Redesigned the cover into a magazine masthead** (user direction = VOGUE-style B): removed the date (and the dynamic `setCoverDate()` JS), removed the `The Frontline Voices of AI` deck, made `AI Builders Digest` a large centered masthead (`clamp(2rem, 10vw, 7rem)`), kept the lightbulb centered and enlarged it (`560px → 680px`).
- **Fixed two visual bugs:** (1) lowercase `g` in "Digest" was clipped — caused by `-webkit-background-clip: text` with too-tight `line-height: 1.02`; fixed with `line-height: 1.18` + `padding-bottom`. (2) cover background didn't match the bulb PNG's background — set `--poster-bg` to pure black `#000000` so the screen-blended image is seamless.
- **Corrected the source attribution** in the cover footer: was `Datenquelle: Follow Builders · Zara Zhang` (misleading). Verified the real pipeline pulls from our own `config/sources.json`; reframed to self-curated feeds + `Inspiriert von Follow Builders · Zara Zhang`.
- **Deployed to Vercel.** First import showed "No Production Deployment"; added `vercel.json` (static, `framework: null`, `buildCommand: ""`, `outputDirectory: "."`) to avoid the build/output-dir misdetection. Now deploys on push (alongside existing GitHub Pages).
- **Created `project-description.md`** — verified business logic, a styled Mermaid architecture diagram (color-coded subgraphs, LR flow), bilingual ~150-word description, and a tech-stack reference. Intended for the personal-site AI Lab module.

### Files Changed
- `index.html` — removed theme toggle (HTML/CSS/JS); single dark `:root`; cover masthead redesign; `--poster-bg` → `#000000`; title descender-clip fix; footer source-credit copy.
- `vercel.json` — new; declares the repo as a no-build static site served from root.
- `project-description.md` — new; external-facing project summary + Mermaid diagram + bilingual description.

### Architecture & Key Decisions
- **Single fixed dark theme.** The screen-blend cover constrains the design to a dark backdrop, so a theme switch added complexity with no real payoff. Simpler palette, less dead logic.
- **Pure-black poster background.** `mix-blend-mode: screen` makes black drop out; matching `--poster-bg` to the PNG's black background guarantees a seamless cover with no visible rectangle.
- **Vercel as pure static (no build).** `outputDirectory: "."` + `framework: null` declared in `vercel.json` is the deterministic fix for the "No Output Directory" failure on no-build static repos.
- **Attribution accuracy.** Data is self-collected (9 X accounts + 11 podcasts + 10 blogs; Git is the datastore). Footer + `project-description.md` now reflect this; Follow Builders is credited as inspiration/compatible upstream only.

### Blockers
- None. (`UI2.png`, `UI3.png` remain untracked source images at repo root — intentionally not committed.)

### Next
- Optional: tidy the untracked `UI2.png` / `UI3.png` (delete or move out of repo root).
- Optional: decide whether to consolidate hosting (Vercel vs GitHub Pages) instead of running both.
- Optional: produce a React Flow version of the architecture diagram for the personal-site AI Lab module (Mermaid can't do n8n-style port-dot node cards).

### Notes for Librarian
- The project is now live on **Vercel** (auto-deploy on push) in addition to GitHub Pages.
- `project-description.md` is the new canonical **external-facing** summary — feeds the personal website's AI Lab module (cross-project link to the personal-site project).
- **Source counts in the 2026-05-30 snapshot are now stale**: it said "4 ML podcasts + 8 blogs"; actual `config/sources.json` today = 9 X accounts + 11 podcasts + 10 blogs.
- The cover is no longer the "6-node glassmorphic constellation + breathing bulb" described on 2026-05-30; it's now a fashion-magazine masthead over a single screen-blended bulb image (`assets/cover-art.png`).

### New Concepts Discovered

| Concept | Where in code | Why it matters | One-line description |
|---------|--------------|----------------|---------------------|
| mix-blend-mode-screen-seamless-bg | `index.html` (`.cover-art-img`) | Lets a raster image melt into a page with no visible bounding box | Put a black-background PNG over a pure-black container with `mix-blend-mode: screen` so the black drops out and only the bright subject + glow remain — seamless, regardless of image edges |
| background-clip-text-descender-clip | `index.html` (`.cover-title-main`) | Common silent bug in gradient text headings | `-webkit-background-clip: text` clips glyph descenders (e.g. `g`, `y`) when `line-height` is too tight; fix with adequate `line-height` (+ small `padding-bottom`) |
| vercel-static-root-deploy | `vercel.json` | Reliable fix for no-build static sites failing on Vercel import | Deploy a repo's static files from root with `framework: null`, `buildCommand: ""`, `outputDirectory: "."` to bypass build/output-dir auto-detection |

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
