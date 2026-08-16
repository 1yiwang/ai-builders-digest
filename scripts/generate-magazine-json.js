#!/usr/bin/env node
// ============================================================================
// AI Builders Digest — Magazine JSON Generator
// ============================================================================
// Fetches raw feed data → prepare/shortlist → DeepSeek/Ollama/Anthropic → magazine JSON
//
// Usage:
//   node scripts/generate-magazine-json.js
//   node scripts/generate-magazine-json.js --date 2026-05-29
//   node scripts/generate-magazine-json.js --dry-run
//   node scripts/generate-magazine-json.js --prepare-only
// ============================================================================

const fs = require('fs');
const path = require('path');

const { prepareFeedForModel, shortlistUrls } = require('./lib/prepare-feed');
const { estimateCostUsd } = require('./lib/model-pricing');
const { validateMagazineJSON, collectCardUrls, countCards } = require('./lib/validate-magazine');
const { loadCredentials, chat } = require('./lib/providers');
const { refreshArchiveIndex } = require('../src/archive/update-index-archive');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_ISSUES_DIR = path.join(REPO_ROOT, 'data', 'issues');
const DEBUG_DIR = path.join(REPO_ROOT, 'data', 'debug');
const PROMPT_PATH_REPO = path.join(REPO_ROOT, 'config', 'prompt.md');
const PROMPT_PATH_LOCAL = path.join(require('os').homedir(), '.follow-builders', 'prompts', 'build-magazine-json.md');
const PROMPT_PATH = fs.existsSync(PROMPT_PATH_REPO) ? PROMPT_PATH_REPO : PROMPT_PATH_LOCAL;

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json';
const LOCAL_FEED_X = path.join(REPO_ROOT, 'data', 'feeds', 'feed-x.json');
const LOCAL_FEED_PODCASTS = path.join(REPO_ROOT, 'data', 'feeds', 'feed-podcasts.json');
const LOCAL_FEED_BLOGS = path.join(REPO_ROOT, 'data', 'feeds', 'feed-blogs.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { date: null, dryRun: false, prepareOnly: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      opts.date = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (args[i] === '--prepare-only') {
      opts.prepareOnly = true;
    }
  }
  return opts;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

function extractJSON(text) {
  const lastError = [];

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      lastError.push(`code-block: ${e.message}`);
    }
  } else {
    lastError.push('code-block: no closing ``` found (response may be truncated)');
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      lastError.push(`raw-json: ${e.message}`);
    }
  } else {
    lastError.push('raw-json: no { } pair found');
  }

  try {
    return JSON.parse(text.trim());
  } catch (e) {
    lastError.push(`full-text: ${e.message}`);
  }

  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const debugPath = path.join(DEBUG_DIR, `api-response-${todayISO()}.txt`);
  fs.writeFileSync(debugPath, text, 'utf8');
  throw new Error(`JSON extraction failed:\n  ${lastError.join('\n  ')}\n  Response saved to: ${debugPath}`);
}

function loadPrompt() {
  if (fs.existsSync(PROMPT_PATH)) {
    console.error(`  Loaded from: ${PROMPT_PATH}`);
    return fs.readFileSync(PROMPT_PATH, 'utf8');
  }
  console.error(`  WARNING: Prompt not found at ${PROMPT_PATH}`);
  console.error('  Using minimal fallback prompt.');
  return 'You generate structured magazine JSON from AI builder feed data. Output valid JSON only.';
}

function buildGenerateMessage(prepared, publishDate) {
  return [
    'Here is today\'s pre-filtered shortlist. Generate the magazine JSON following the instructions.',
    `IMPORTANT: publishDate must be ${publishDate}.`,
    'Only use items and URLs from this shortlist. Output valid JSON only.',
    '',
    '=== SHORTLIST ===',
    '',
    JSON.stringify(prepared),
  ].join('\n');
}

function buildRepairMessage(magazineJSON, errors, publishDate) {
  return [
    `The previous magazine JSON failed validation. Fix the listed errors. publishDate must be ${publishDate}.`,
    'Return valid JSON only. Do not invent new source URLs.',
    '',
    'Errors:',
    ...errors.map((error) => `- ${error}`),
    '',
    'Previous JSON:',
    JSON.stringify(magazineJSON),
  ].join('\n');
}

function buildMeta({ credentials, usage, latencyMs, stats, repairAttempts, magazineJSON }) {
  const tokensIn = usage?.tokensIn || stats.estimatedTokens;
  const tokensOut = usage?.tokensOut || 0;
  return {
    generatedAt: new Date().toISOString(),
    provider: credentials.provider,
    model: credentials.model,
    fallbackUsed: false,
    repairAttempts,
    latencyMs: latencyMs || 0,
    tokensIn,
    tokensOut,
    estCostUsd: estimateCostUsd(credentials.model, tokensIn, tokensOut, credentials.provider),
    candidatesIn: stats.candidatesIn,
    shortlistSize: stats.shortlistSize,
    cardsPublished: countCards(magazineJSON),
    truncation: {
      rawChars: stats.rawChars,
      preparedChars: stats.preparedChars,
      budgetTokens: stats.budgetTokens,
    },
    sourceUrls: collectCardUrls(magazineJSON),
  };
}

function writeDebug(name, value) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const filePath = path.join(DEBUG_DIR, name);
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

async function main() {
  const opts = parseArgs();
  const publishDate = opts.date || todayISO();
  const jsonPath = path.join(DATA_ISSUES_DIR, `ai-builders-digest-${publishDate}.json`);

  console.error('=== AI Builders Digest — Magazine JSON Generator ===');
  console.error(`Date: ${publishDate}`);
  console.error(`Output: ${jsonPath}`);
  console.error('');

  console.error('[1/5] Loading credentials...');
  let credentials = null;
  if (!opts.prepareOnly) {
    credentials = loadCredentials();
    if (!credentials) {
      console.error('ERROR: No API key found. Set DEEPSEEK_API_KEY, or DIGEST_PROVIDER=ollama.');
      process.exit(1);
    }
    console.error(`  Provider: ${credentials.provider}`);
    console.error(`  Model: ${credentials.model}`);
    console.error(`  Base URL: ${credentials.baseUrl}`);
  } else {
    console.error('  Skipped (--prepare-only)');
  }

  console.error('[2/5] Loading feed data...');
  async function loadFeed(localPath, remoteUrl, label) {
    if (fs.existsSync(localPath)) {
      console.error(`  ${label}: local → ${localPath}`);
      return JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }
    console.error(`  ${label}: remote → ${remoteUrl}`);
    try {
      return await fetchJSON(remoteUrl);
    } catch (err) {
      console.error(`  ${label}: remote fetch failed (${err.message}), using empty fallback`);
      return null;
    }
  }

  let feedX;
  let feedPodcasts;
  let feedBlogs;
  try {
    [feedX, feedPodcasts, feedBlogs] = await Promise.all([
      loadFeed(LOCAL_FEED_X, FEED_X_URL, 'X'),
      loadFeed(LOCAL_FEED_PODCASTS, FEED_PODCASTS_URL, 'Podcasts'),
      loadFeed(LOCAL_FEED_BLOGS, FEED_BLOGS_URL, 'Blogs'),
    ]);
  } catch (err) {
    console.error(`  Feed loading failed: ${err.message}`);
    process.exit(1);
  }

  const feedData = {
    generatedAt: new Date().toISOString(),
    x: feedX?.x || [],
    podcasts: feedPodcasts?.podcasts || [],
    blogs: feedBlogs?.blogs || [],
    stats: {
      xBuilders: feedX?.x?.length || 0,
      totalTweets: (feedX?.x || []).reduce((sum, account) => sum + (account.tweets?.length || 0), 0),
      podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
      blogPosts: feedBlogs?.blogs?.length || 0,
    },
  };

  console.error(`  X builders: ${feedData.stats.xBuilders}`);
  console.error(`  Tweets: ${feedData.stats.totalTweets}`);
  console.error(`  Podcast episodes: ${feedData.stats.podcastEpisodes}`);
  console.error(`  Blog posts: ${feedData.stats.blogPosts}`);

  if (feedData.stats.xBuilders === 0 && feedData.stats.podcastEpisodes === 0 && feedData.stats.blogPosts === 0) {
    console.error('');
    console.error('NO_CONTENT: No new updates from builders today.');
    process.exit(0);
  }

  const { prepared, stats, shortlist } = prepareFeedForModel(feedData);
  console.error(`  Raw chars: ${stats.rawChars}`);
  console.error(`  Prepared chars: ${stats.preparedChars} (${Math.round((1 - stats.preparedChars / stats.rawChars) * 100)}% less)`);
  console.error(`  Est. tokens in: ${stats.estimatedTokens} / budget ${stats.budgetTokens}`);
  console.error(`  Candidates: ${stats.candidatesIn} → shortlist ${stats.shortlistSize}`);
  writeDebug(`shortlist-${publishDate}.json`, { stats, shortlist });

  if (opts.prepareOnly) {
    console.error('');
    console.error('PREPARE ONLY — no model call.');
    console.log(JSON.stringify({ stats, shortlist: shortlist.map((item) => ({ kind: item.kind, score: item.score, url: item.url })) }, null, 2));
    return;
  }

  console.error('[3/5] Loading prompt...');
  const systemPrompt = loadPrompt();

  console.error('[4/5] Calling AI to generate magazine JSON...');
  const allowedUrls = shortlistUrls(shortlist);
  let response;
  try {
    response = await chat({
      credentials,
      systemPrompt,
      userMessage: buildGenerateMessage(prepared, publishDate),
      maxTokens: 4000,
    });
  } catch (err) {
    console.error(`  API call failed: ${err.message}`);
    process.exit(1);
  }

  console.error('[5/5] Extracting and validating JSON...');
  let magazineJSON;
  try {
    magazineJSON = extractJSON(response.text);
  } catch (err) {
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  magazineJSON.publishDate = publishDate;
  magazineJSON.footerNote = `Source: AI Builders Digest. Generated on ${publishDate}.`;

  let repairAttempts = 0;
  let validation = validateMagazineJSON(magazineJSON, { allowedUrls });
  if (!validation.ok) {
    console.error(`  Validation failed (${validation.errors.length} error(s)); attempting one repair...`);
    validation.errors.forEach((error) => console.error(`    - ${error}`));
    repairAttempts = 1;
    try {
      const repaired = await chat({
        credentials,
        systemPrompt,
        userMessage: buildRepairMessage(magazineJSON, validation.errors, publishDate),
        maxTokens: 4000,
      });
      response = {
        text: repaired.text,
        usage: {
          tokensIn: (response.usage?.tokensIn || 0) + (repaired.usage?.tokensIn || 0),
          tokensOut: (response.usage?.tokensOut || 0) + (repaired.usage?.tokensOut || 0),
        },
        latencyMs: (response.latencyMs || 0) + (repaired.latencyMs || 0),
      };
      magazineJSON = extractJSON(repaired.text);
      magazineJSON.publishDate = publishDate;
      magazineJSON.footerNote = `Source: AI Builders Digest. Generated on ${publishDate}.`;
      validation = validateMagazineJSON(magazineJSON, { allowedUrls });
    } catch (err) {
      console.error(`  Repair failed: ${err.message}`);
    }
  }

  if (!validation.ok) {
    const debugPath = writeDebug(`invalid-json-${publishDate}.json`, magazineJSON);
    console.error('  ERROR: Generated JSON failed validation after repair.');
    console.error(`  Invalid JSON saved to: ${debugPath}`);
    validation.errors.forEach((error) => console.error(`    - ${error}`));
    process.exit(0);
  }

  magazineJSON.meta = buildMeta({
    credentials,
    usage: response.usage,
    latencyMs: response.latencyMs,
    stats,
    repairAttempts,
    magazineJSON,
  });

  console.error('  Valid: ✓');
  console.error(`  Sections: ${magazineJSON.sections.length}`);
  console.error(`  Cards: ${magazineJSON.meta.cardsPublished}`);
  console.error(`  Tokens: ${magazineJSON.meta.tokensIn} in / ${magazineJSON.meta.tokensOut} out`);
  console.error(`  Est. cost: $${magazineJSON.meta.estCostUsd}`);

  if (opts.dryRun) {
    console.log(JSON.stringify(magazineJSON, null, 2));
    console.error('');
    console.error('DRY RUN — not saved to disk.');
  } else {
    fs.mkdirSync(DATA_ISSUES_DIR, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(magazineJSON, null, 2), 'utf8');
    refreshArchiveIndex();
    console.error(`  Saved: ${jsonPath}`);
    console.log(jsonPath);
  }

  console.error('');
  console.error('Done! ✓');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
