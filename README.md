# AI Builders Digest

A bilingual (EN/DE) magazine generated three times a week from public AI-builder feeds. Live site: [1yiwang.github.io/ai-builders-digest](https://1yiwang.github.io/ai-builders-digest/). Latest issue: [2026-08-17](https://1yiwang.github.io/ai-builders-digest/issues/ai-builders-digest-2026-08-17.html).

The interesting part is not the HTML. It is a **scheduled LLM ETL pipeline**: rule-based intake, evidence-aware preprocessing, one structured LLM call, schema repair, source-health telemetry, and Git as the datastore.

## Problem

AI builders publish constantly on X, blogs, YouTube, and podcasts. A raw scrape is too long to dump into a model (tens of thousands of characters, much of it stale or empty). Paying for that context is wasteful, and the model will invent URLs if you let it.

This repo treats that as an applied-AI systems problem: **filter before you generate, constrain the output, measure cost, fail closed.**

## Pipeline

```
RSS / Atom / Nitter (optional X API)
        │
        ▼
generate-feed.js          72h date gate; skip URLs already used in a prior issue
        │                 same-day reruns still return the full window
        ▼
prepare-feed.js           evidence chunks + score + caps
        │                 shortlist, duplicate control, ~token budget 12k
        ▼
DeepSeek (one call)       bilingual magazine JSON
        │                 URLs must come from the shortlist
        ▼
validate + 1 repair       schema, ≤10 cards, ≤2 cards/source
        │                 on failure: skip the issue, CI stays green
        ▼
render HTML → archive → Telegram → git push
```

GitHub Actions runs this Mon/Wed/Fri at 06:00 UTC. There is no database, no vector index, and no long-running server. Issues are JSON in `data/issues/`; pages are static HTML.

## Architecture

The system is intentionally a CLI pipeline, not a long-running backend. `generate-feed.js` extracts public updates into feed JSON, `prepare-feed.js` transforms raw text into scored evidence chunks, and `generate-magazine-json.js` loads a validated issue into `data/issues/`. Static rendering and Telegram publishing happen only after a valid issue exists.

## Observability

Every feed run appends source-level rows to `data/eval/source-health.jsonl`: source type, source name, status, items used, and any fetch error. Generation and eval append run rows to `data/eval/run-ledger.jsonl`, including run ID, raw/prepared chars, token usage, estimated cost, card count, repair attempts, prompt hash, and prepare version.

## Eval

`npm run eval` is fully offline. It replays all generated issues for schema and faithfulness checks, then runs gold shortlist fixtures for freshness, source caps, duplicate suppression, long-article compression, bad dates, and prior-issue URL semantics. CI runs `node --check` plus this eval suite on pull requests.

## Failure Modes

Publishing is fail-closed. If feed fetching has partial failures, the job records source-health rows and continues with available feeds. If generation cannot produce valid JSON after one repair pass, the issue is skipped rather than rendered or sent to Telegram. The scheduled job stays green for no-content days, while local and PR evals are allowed to fail loudly.

## Design choices

| Choice | Why |
|---|---|
| Rules before the model | Date gate, junk-tweet filter, evidence chunks, duplicate control, and source caps cost $0 |
| One LLM call per issue | A 12-item shortlist is small enough to select *across* sources in one pass; per-item calls would cost more and lose that ranking |
| No vector DB | This is not a retrieval product. The corpus is a 72-hour window, not a library to search |
| Git as datastore | Every shortlist, issue, and cost ledger is diffable and replayable |
| Cheap model + repair | DeepSeek writes JSON; if schema fails, errors are sent back once; a second failure skips the edition instead of shipping garbage |

## Hard constraints (enforced in code)

- Cards may only use `sourceUrl`s from the shortlist (`validate-magazine.js`)
- At most **10** cards, at most **2** from the same source
- Each card needs `authorKey`, `priority` ∈ {1,2,3}, and non-empty `en` / `de` rewrites
- Feed items older than **72 hours**, or blogs with no parseable date, are dropped
- Each feed run is the **full 72h window**; only URLs already used as cards in a *previous* issue are skipped (same-day reruns stay full)
- Eval (`npm run eval`) replays every `data/issues/*.json` plus gold shortlist fixtures, with no model call
- Faithfulness (current issues only, warnings): numbers and English `original` lines must appear in on-disk feed text for that `sourceUrl`. Cards whose source is no longer in `data/feeds/` are skipped.

Soft warnings (do not block publish): rewrite bullets without a number; bullets longer than 30 words; unknown `authorKey`.

## Measured (2026-08-17 live feed + prepare)

From `npm run feed` then `npm run prepare-feed` on 2026-08-17:

| Metric | Value |
|---|---|
| Source health | 37 sources, 11 ok / 26 no_content / 0 error |
| Raw feed | 85,273 chars |
| Prepared shortlist | 4,020 chars (**95% cut**) |
| Candidates → shortlist | 24 → 12 (1 duplicate dropped) |
| Estimated prompt tokens | 1,005 before system prompt |
| Published issue cost | **$0.0034** (7 cards, 0 repair) |

`npm run eval` on 2026-08-17: 34 issues, current schema failures 0.

## Layout

```
config/           sources, prompt, author identities, avatar manifest
scripts/          feed → prepare → generate → eval → avatars
scripts/lib/      prepare-feed.js, validate-magazine.js, providers.js
data/feeds/       last raw intake
data/issues/      magazine JSON (source of truth)
data/eval/        last eval report, source/run ledgers, gold shortlist fixtures
data/debug/       shortlist and prepare reports
issues/           rendered HTML
.github/workflows/daily-digest.yml
```

## Run locally

Needs Node 22+. Put `DEEPSEEK_API_KEY` (or `ANTHROPIC_*` pointing at DeepSeek’s Anthropic-compatible gateway) in the environment.

```bash
npm run feed          # refresh data/feeds
npm run prepare-feed  # shortlist only, no API call
npm run generate      # DeepSeek → data/issues/ai-builders-digest-YYYY-MM-DD.json
npm run eval          # schema + faithfulness + gold shortlist, no API call
npm run full          # feed → generate → render → archive → Telegram
```

`npm run prepare-feed` is the cheap loop while iterating on scoring or truncation.

## Sources

Public RSS/Atom first (Hugging Face, OpenAI, Simon Willison, The Decoder, TechCrunch AI, TLDR AI, Latent Space, Interconnects, …). X via Nitter, with optional API fallback. YouTube via public channel Atom feeds. The shortlist prefers items with numbers and named models; Nitter is treated as unreliable, which is why high-frequency blogs exist.

## Status

Shipped: 72h full-window feeds (prior-issue URL gate, not seen-since-last-run), density extraction, cost ledger, schema repair, CI degrade-to-green, faithfulness warnings, gold shortlist regression.

Current upgrade: source-health JSONL, run ledger, evidence-aware preprocessing, duplicate gold fixtures, prompt fingerprint, Docker CLI runtime, and PR CI checks.
