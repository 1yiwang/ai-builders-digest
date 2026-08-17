# AI Builders Digest

A bilingual (EN/DE) magazine generated three times a week from public AI-builder feeds. Live site: [1yiwang.github.io/ai-builders-digest](https://1yiwang.github.io/ai-builders-digest/). Latest issue: [2026-08-17](https://1yiwang.github.io/ai-builders-digest/issues/ai-builders-digest-2026-08-17.html).

The interesting part is not the HTML. It is a **low-cost generation pipeline**: rule-based intake, a 12-item shortlist, one structured LLM call, schema repair, and Git as the datastore.

## Problem

AI builders publish constantly on X, blogs, YouTube, and podcasts. A raw scrape is too long to dump into a model (tens of thousands of characters, much of it stale or empty). Paying for that context is wasteful, and the model will invent URLs if you let it.

This repo treats that as an applied-AI systems problem: **filter before you generate, constrain the output, measure cost, fail closed.**

## Pipeline

```
RSS / Atom / Nitter (optional X API)
        │
        ▼
generate-feed.js          72h date gate, skip undated/stale items
        │                 data/feeds/*.json  +  data/state-feed.json
        ▼
prepare-feed.js           density extract + score + caps
        │                 12-item shortlist, ~token budget 12k
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

## Design choices

| Choice | Why |
|---|---|
| Rules before the model | Date gate, junk-tweet filter, sentence-density extract, and source caps cost $0 |
| One LLM call per issue | A 12-item shortlist is small enough to select *across* sources in one pass; per-item calls would cost more and lose that ranking |
| No vector DB | This is not a retrieval product. The corpus is a 72-hour window, not a library to search |
| Git as datastore | Every shortlist, issue, and cost ledger is diffable and replayable |
| Cheap model + repair | DeepSeek writes JSON; if schema fails, errors are sent back once; a second failure skips the edition instead of shipping garbage |

## Hard constraints (enforced in code)

- Cards may only use `sourceUrl`s from the shortlist (`validate-magazine.js`)
- At most **10** cards, at most **2** from the same source
- Each card needs `authorKey`, `priority` ∈ {1,2,3}, and non-empty `en` / `de` rewrites
- Feed items older than **72 hours**, or blogs with no parseable date, are dropped
- Eval (`npm run eval`) replays every `data/issues/*.json` with no model call

Soft warnings (do not block publish): rewrite bullets without a number; bullets longer than 30 words; unknown `authorKey`.

## Measured (2026-08-17 rebuild)

From `data/issues/ai-builders-digest-2026-08-17.json` `meta`:

| Metric | Value |
|---|---|
| Raw feed | 41,304 chars |
| Prepared shortlist | 2,964 chars (**93% cut**) |
| Candidates → shortlist → cards | 18 → 10 → 7 |
| API tokens | 4,129 in / 10,129 out (includes system prompt) |
| Estimated cost | **$0.0034** |
| Repair attempts | 0 |
| Latency | ~129 s |

`npm run eval` on 2026-08-17: 34 issues, current schema failures 0.

## Layout

```
config/           sources, prompt, author identities, avatar manifest
scripts/          feed → prepare → generate → eval → avatars
scripts/lib/      prepare-feed.js, validate-magazine.js, providers.js
data/feeds/       last raw intake
data/issues/      magazine JSON (source of truth)
data/eval/        last eval report
issues/           rendered HTML
.github/workflows/daily-digest.yml
```

## Run locally

Needs Node 22+. Put `DEEPSEEK_API_KEY` (or `ANTHROPIC_*` pointing at DeepSeek’s Anthropic-compatible gateway) in the environment.

```bash
npm run feed          # refresh data/feeds
npm run prepare-feed  # shortlist only, no API call
npm run generate      # DeepSeek → data/issues/ai-builders-digest-YYYY-MM-DD.json
npm run eval          # schema replay, no API call
npm run full          # feed → generate → render → archive → Telegram
```

`npm run prepare-feed` is the cheap loop while iterating on scoring or truncation.

## Sources

Public RSS/Atom first (Hugging Face, OpenAI, Simon Willison, The Decoder, TechCrunch AI, TLDR AI, Latent Space, Interconnects, …). X via Nitter, with optional API fallback. YouTube via public channel Atom feeds. The shortlist prefers items with numbers and named models; Nitter is treated as unreliable, which is why high-frequency blogs exist.

## Status

Shipped: 72h freshness, density extraction, cost ledger, schema repair, CI degrade-to-green.

Next (see [`docs/applied-ai-next-plan.md`](docs/applied-ai-next-plan.md)): faithfulness eval (numbers in cards must appear in source text), gold-set shortlist regression, and treating each feed run as the full 72h window rather than “new since last run.”
