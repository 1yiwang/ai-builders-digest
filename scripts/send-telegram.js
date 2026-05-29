#!/usr/bin/env node
// ============================================================================
// AI Builders Digest — Telegram Publisher
// ============================================================================
// Sends the latest magazine issue to a Telegram channel/chat.
//
// Setup (one-time):
//   1. Create a bot via @BotFather on Telegram → get bot token
//   2. Create a channel, add your bot as admin
//   3. Send a test message in the channel
//   4. Get chat ID: https://api.telegram.org/bot<TOKEN>/getUpdates
//   5. Store in ~/.claude/settings.json:
//      "env": {
//        "TELEGRAM_BOT_TOKEN": "123:abc",
//        "TELEGRAM_CHAT_ID": "-100xxx"
//      }
//
// Usage:
//   node scripts/send-telegram.js
//   node scripts/send-telegram.js --date 2026-05-29
//   node scripts/send-telegram.js --dry-run
// ============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

// -- Constants ---------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_ISSUES_DIR = path.join(REPO_ROOT, 'data', 'issues');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const FOLLOW_BUILDERS_ENV = path.join(os.homedir(), '.follow-builders', '.env');
const FOLLOW_BUILDERS_CONFIG = path.join(os.homedir(), '.follow-builders', 'config.json');
const GITHUB_REPO = '1yiwang/ai-builders-digest';
const GITHUB_PAGES = `https://${GITHUB_REPO.replace('/', '.github.io/')}`;
// Fallback: htmlpreview renders raw HTML in browser
const GITHUB_RAW_PREVIEW = `https://htmlpreview.github.io/?https://raw.githubusercontent.com/${GITHUB_REPO}/main`;

// -- CLI args ----------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { date: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) { opts.date = args[i + 1]; i++; }
    else if (args[i] === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// -- Credentials -------------------------------------------------------------

function loadTelegramCredentials(dryRun) {
  // 1. Check environment variables first (for CI/GitHub Actions)
  let botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  let chatId = process.env.TELEGRAM_CHAT_ID || '';

  // 2. Fallback: ~/.claude/settings.json
  if ((!botToken || !chatId) && fs.existsSync(SETTINGS_PATH)) {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const env = settings.env || {};
    botToken = botToken || env.TELEGRAM_BOT_TOKEN || '';
    chatId = chatId || env.TELEGRAM_CHAT_ID || '';
  }

  // 3. Fallback: .follow-builders/.env + config.json
  if (!botToken && fs.existsSync(FOLLOW_BUILDERS_ENV)) {
    const envContent = fs.readFileSync(FOLLOW_BUILDERS_ENV, 'utf8');
    const match = envContent.match(/TELEGRAM_BOT_TOKEN=(.+)/);
    if (match) botToken = match[1].trim();
  }
  if (!chatId && fs.existsSync(FOLLOW_BUILDERS_CONFIG)) {
    try {
      const config = JSON.parse(fs.readFileSync(FOLLOW_BUILDERS_CONFIG, 'utf8'));
      chatId = config.delivery?.chatId || '';
    } catch {}
  }

  if (!botToken || !chatId) {
    if (dryRun) {
      console.error('⚠  Credentials not set — showing preview only.');
      console.error('   Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to ~/.claude/settings.json env block,');
      console.error('   or ensure ~/.follow-builders/.env and config.json are configured.');
      console.error('');
      return { botToken: 'DRY_RUN', chatId: 'DRY_RUN' };
    }
    if (!botToken) {
      console.error('ERROR: TELEGRAM_BOT_TOKEN not found.');
      console.error('  Checked: ~/.claude/settings.json, ~/.follow-builders/.env');
    }
    if (!chatId) {
      console.error('ERROR: TELEGRAM_CHAT_ID not found.');
      console.error('  Checked: ~/.claude/settings.json, ~/.follow-builders/config.json');
    }
    process.exit(1);
  }
  return { botToken, chatId };
}

// -- Load latest issue -------------------------------------------------------

function loadIssue(publishDate) {
  const jsonPath = path.join(DATA_ISSUES_DIR, `ai-builders-digest-${publishDate}.json`);
  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: Issue not found: ${jsonPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

// -- Format message ----------------------------------------------------------

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTelegramMessage(issue, publishDate) {
  const archiveTitle = issue.archive?.title || 'AI Builders Digest';
  const archiveDesc = issue.archive?.desc || '';
  const intro = issue.intro?.text || '';

  // Count sections and cards for stats
  const sectionCount = issue.sections?.length || 0;
  const cardCount = (issue.sections || []).reduce((sum, s) => sum + (s.cards?.length || 0), 0);

  // Collect source names for variety
  const sources = new Set();
  (issue.sections || []).forEach(s =>
    (s.cards || []).forEach(c => {
      if (c.sourceName) sources.add(c.sourceName);
      else if (c.authorKey) sources.add(c.authorKey.replace(/^(podcast|blog|x):/, ''));
    })
  );

  // Try GitHub Pages first, fall back to htmlpreview
  const pagePath = `issues/ai-builders-digest-${publishDate}.html`;
  const url = `${GITHUB_RAW_PREVIEW}/${pagePath}`;
  const archiveUrl = `${GITHUB_PAGES}/`;

  // Telegram HTML parse mode — limited tags: <b>, <i>, <u>, <s>, <code>, <pre>, <a>
  const lines = [
    `<b>🤖 AI Builders Digest</b>`,
    `<b>${escapeHtml(archiveTitle)}</b>`,
    ``,
    `${escapeHtml(archiveDesc)}`,
    ``,
    `📊 ${cardCount} Karten • ${sectionCount} Themen • ${sources.size} Quellen`,
  ];

  // Add first 3 card titles as highlights
  const highlights = [];
  (issue.sections || []).forEach(s => {
    (s.cards || []).forEach(c => {
      if (highlights.length < 5) {
        const firstBullet = (c.en?.rewrite || [])[0] || '';
        if (firstBullet) {
          highlights.push(`• ${escapeHtml(firstBullet.slice(0, 120))}${firstBullet.length > 120 ? '...' : ''}`);
        }
      }
    });
  });

  if (highlights.length > 0) {
    lines.push(``);
    lines.push(`<b>🔥 Highlights</b>`);
    lines.push(...highlights);
  }

  lines.push(``);
  lines.push(`<a href="${url}">📖 Vollständige Ausgabe lesen</a>`);
  lines.push(`<a href="${archiveUrl}">📚 Alle Ausgaben</a>`);

  return lines.join('\n');
}

// -- Send to Telegram --------------------------------------------------------

async function sendToTelegram(botToken, chatId, message) {
  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  return res.json();
}

// -- Main --------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const publishDate = opts.date || todayISO();

  console.error(`=== AI Builders Digest — Telegram Publisher ===`);
  console.error(`Date: ${publishDate}`);

  // 1. Load credentials
  const { botToken, chatId } = loadTelegramCredentials(opts.dryRun);
  console.error(`Chat ID: ${chatId}`);

  // 2. Load issue
  const issue = loadIssue(publishDate);
  console.error(`Issue: ${issue.archive?.title || publishDate}`);

  // 3. Format message
  const message = formatTelegramMessage(issue, publishDate);

  if (opts.dryRun) {
    console.error('');
    console.error('=== DRY RUN — message preview ===');
    console.log(message);
    console.error('');
    console.error('=== END PREVIEW ===');
    console.error('Message length:', message.length, 'chars');
    return;
  }

  // 4. Send
  console.error(`Sending to Telegram...`);
  const result = await sendToTelegram(botToken, chatId, message);
  console.error(`✓ Sent! message_id=${result.result?.message_id}`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
