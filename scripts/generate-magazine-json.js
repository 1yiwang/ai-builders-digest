#!/usr/bin/env node
// ============================================================================
// AI Builders Digest — Magazine JSON Generator
// ============================================================================
// Fetches raw feed data → calls DeepSeek/Anthropic API → generates magazine JSON
//
// Usage:
//   node scripts/generate-magazine-json.js
//   node scripts/generate-magazine-json.js --date 2026-05-29
//   node scripts/generate-magazine-json.js --dry-run   (print JSON, don't save)
// ============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

// -- Constants ---------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_ISSUES_DIR = path.join(REPO_ROOT, 'data', 'issues');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
// Check repo config first (CI-compatible), then local ~/.follow-builders
const PROMPT_PATH_REPO = path.join(REPO_ROOT, 'config', 'prompt.md');
const PROMPT_PATH_LOCAL = path.join(os.homedir(), '.follow-builders', 'prompts', 'build-magazine-json.md');
const PROMPT_PATH = fs.existsSync(PROMPT_PATH_REPO) ? PROMPT_PATH_REPO : PROMPT_PATH_LOCAL;

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json';

// Local feed paths (preferred when available)
const LOCAL_FEED_X = path.join(REPO_ROOT, 'data', 'feeds', 'feed-x.json');
const LOCAL_FEED_PODCASTS = path.join(REPO_ROOT, 'data', 'feeds', 'feed-podcasts.json');
const LOCAL_FEED_BLOGS = path.join(REPO_ROOT, 'data', 'feeds', 'feed-blogs.json');

// -- CLI args ----------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { date: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      opts.date = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    }
  }
  return opts;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// -- Credentials -------------------------------------------------------------

function loadCredentials() {
  let apiKey, baseUrl, model;

  // 1. Check environment variables first (for CI/GitHub Actions)
  if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '';
    baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    console.error('  Using environment variables for credentials');
  }

  // 2. Fallback: ~/.claude/settings.json
  if (!apiKey && fs.existsSync(SETTINGS_PATH)) {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const env = settings.env || {};
    apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || '';
    baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    model = env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  }

  if (!apiKey) {
    console.error('ERROR: No API key found. Set ANTHROPIC_AUTH_TOKEN in ~/.claude/settings.json env block or as environment variable.');
    process.exit(1);
  }
  return { apiKey, baseUrl, model };
}

// -- Fetch helpers -----------------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// -- JSON extraction ---------------------------------------------------------

function extractJSON(text) {
  const DEBUG_DIR = path.join(REPO_ROOT, 'data', 'debug');
  const lastError = [];

  // Try to find JSON inside markdown code blocks first
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

  // Try to find a raw JSON object in the text
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

  // Last resort: try parsing the entire text
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    lastError.push(`full-text: ${e.message}`);
  }

  // All attempts failed — save debug info
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const debugPath = path.join(DEBUG_DIR, `api-response-${todayISO()}.txt`);
  fs.writeFileSync(debugPath, text, 'utf8');

  const err = new Error(`JSON extraction failed:\n  ${lastError.join('\n  ')}\n  Response saved to: ${debugPath}`);
  throw err;
}

function validateMagazineJSON(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.title) return false;
  if (!Array.isArray(data.sections)) return false;
  if (data.sections.length === 0) return false;
  // Check at least one card exists
  const hasCard = data.sections.some(s => Array.isArray(s.cards) && s.cards.length > 0);
  if (!hasCard) return false;
  return true;
}

// -- API call ----------------------------------------------------------------

async function callAPI(credentials, systemPrompt, feedData) {
  const { apiKey, baseUrl, model } = credentials;
  const endpoint = baseUrl.replace(/\/$/, '') + '/v1/messages';

  const body = {
    model,
    max_tokens: 16000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Here is the raw feed data from today. Generate the magazine JSON following the instructions above.\n\n' +
                  'IMPORTANT: Write the output JSON to the file path specified in the instructions. ' +
                  'The file path should use TODAY\'s date: ' + todayISO() + '\n\n' +
                  '=== RAW FEED DATA ===\n\n' +
                  JSON.stringify(feedData, null, 2)
          }
        ]
      }
    ]
  };

  console.error(`Calling API: ${endpoint}`);
  console.error(`Model: ${model}`);
  console.error(`Feed stats: ${feedData.stats ? JSON.stringify(feedData.stats) : 'N/A'}`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = await res.json();
  const content = json.content || [];

  // Collect all text blocks
  const text = content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  if (!text) {
    throw new Error('API returned no text content. Response: ' + JSON.stringify(json).slice(0, 500));
  }

  return text;
}

// -- Main --------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const publishDate = opts.date || todayISO();
  const jsonPath = path.join(DATA_ISSUES_DIR, `ai-builders-digest-${publishDate}.json`);

  console.error(`=== AI Builders Digest — Magazine JSON Generator ===`);
  console.error(`Date: ${publishDate}`);
  console.error(`Output: ${jsonPath}`);
  console.error('');

  // 1. Load credentials
  console.error('[1/5] Loading credentials...');
  const credentials = loadCredentials();
  console.error(`  Base URL: ${credentials.baseUrl}`);

  // 2. Fetch feeds — prefer local files over remote URLs
  console.error('[2/5] Loading feed data...');
  let feedX, feedPodcasts, feedBlogs;

  // Helper: load JSON from local file or remote URL
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
      totalTweets: (feedX?.x || []).reduce((sum, a) => sum + (a.tweets?.length || 0), 0),
      podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
      blogPosts: feedBlogs?.blogs?.length || 0
    }
  };

  console.error(`  X builders: ${feedData.stats.xBuilders}`);
  console.error(`  Tweets: ${feedData.stats.totalTweets}`);
  console.error(`  Podcast episodes: ${feedData.stats.podcastEpisodes}`);
  console.error(`  Blog posts: ${feedData.stats.blogPosts}`);

  // Check for content
  if (feedData.stats.xBuilders === 0 && feedData.stats.podcastEpisodes === 0 && feedData.stats.blogPosts === 0) {
    console.error('');
    console.error('NO_CONTENT: No new updates from builders today.');
    process.exit(0);
  }

  // 3. Load prompt
  console.error('[3/5] Loading prompt...');
  let systemPrompt;
  if (fs.existsSync(PROMPT_PATH)) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf8');
    console.error(`  Loaded from: ${PROMPT_PATH}`);
  } else {
    console.error(`  WARNING: Prompt not found at ${PROMPT_PATH}`);
    console.error('  Using minimal fallback prompt.');
    systemPrompt = 'You generate structured magazine JSON from AI builder feed data. Output valid JSON only.';
  }

  // 4. Call API
  console.error('[4/5] Calling AI to generate magazine JSON...');
  console.error('  (this may take 30-90 seconds)');
  let responseText;
  try {
    responseText = await callAPI(credentials, systemPrompt, feedData);
  } catch (err) {
    console.error(`  API call failed: ${err.message}`);
    process.exit(1);
  }

  // 5. Extract and validate JSON
  console.error('[5/5] Extracting and validating JSON...');
  let magazineJSON;
  try {
    magazineJSON = extractJSON(responseText);
  } catch (err) {
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  if (!validateMagazineJSON(magazineJSON)) {
    // Save failed JSON for debugging
    const debugDir = path.join(REPO_ROOT, 'data', 'debug');
    fs.mkdirSync(debugDir, { recursive: true });
    const debugPath = path.join(debugDir, `invalid-json-${publishDate}.json`);
    fs.writeFileSync(debugPath, JSON.stringify(magazineJSON, null, 2), 'utf8');
    console.error('  ERROR: Generated JSON failed validation.');
    console.error(`  Invalid JSON saved to: ${debugPath}`);
    process.exit(1);
  }

  // Ensure publishDate is correct
  magazineJSON.publishDate = publishDate;
  magazineJSON.footerNote = `Source: Follow Builders curated daily digest. Generated on ${publishDate}.`;

  console.error(`  Valid: ✓`);
  console.error(`  Sections: ${magazineJSON.sections.length}`);
  const totalCards = magazineJSON.sections.reduce((sum, s) => sum + (s.cards?.length || 0), 0);
  console.error(`  Cards: ${totalCards}`);

  // Save
  if (opts.dryRun) {
    console.log(JSON.stringify(magazineJSON, null, 2));
    console.error('');
    console.error('DRY RUN — not saved to disk.');
  } else {
    fs.mkdirSync(DATA_ISSUES_DIR, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(magazineJSON, null, 2), 'utf8');
    console.error(`  Saved: ${jsonPath}`);
    console.log(jsonPath);
  }

  console.error('');
  console.error('Done! ✓');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
