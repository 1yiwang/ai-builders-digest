#!/usr/bin/env node
// Hard-metric replay over data/issues/*.json. No model calls.

const fs = require('fs');
const path = require('path');
const { validateMagazineJSON, validateLegacyIssue, collectCardUrls } = require('./lib/validate-magazine');
const { indexFeeds, evaluateFaithfulness } = require('./lib/faithfulness');
const { appendJsonl, makeRunId } = require('./lib/ledger');

const REPO_ROOT = path.resolve(__dirname, '..');
const ISSUES_DIR = path.join(REPO_ROOT, 'data', 'issues');
const REPORT_PATH = path.join(REPO_ROOT, 'data', 'eval', 'last-report.json');
const RUN_LEDGER_PATH = path.join(REPO_ROOT, 'data', 'eval', 'run-ledger.jsonl');
const IDENTITIES_PATH = path.join(REPO_ROOT, 'config', 'author-identities.json');
const FEEDS_DIR = path.join(REPO_ROOT, 'data', 'feeds');
const DEBUG_DIR = path.join(REPO_ROOT, 'data', 'debug');

function loadIdentities() {
  return loadJson(IDENTITIES_PATH).entries || {};
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadSourceIndex() {
  const feedX = loadJson(path.join(FEEDS_DIR, 'feed-x.json'));
  const feedPodcasts = loadJson(path.join(FEEDS_DIR, 'feed-podcasts.json'));
  const feedBlogs = loadJson(path.join(FEEDS_DIR, 'feed-blogs.json'));
  const feedYoutube = loadJson(path.join(FEEDS_DIR, 'feed-youtube.json'));
  const shortlist = [];
  if (fs.existsSync(DEBUG_DIR)) {
    for (const name of fs.readdirSync(DEBUG_DIR)) {
      if (!/^shortlist-.*\.json$/.test(name)) continue;
      const payload = loadJson(path.join(DEBUG_DIR, name));
      if (Array.isArray(payload.shortlist)) shortlist.push(...payload.shortlist);
    }
  }
  return indexFeeds({
    x: feedX.x || [],
    podcasts: feedPodcasts.podcasts || [],
    blogs: feedBlogs.blogs || [],
    videos: feedYoutube.videos || [],
    shortlist,
  });
}

function lookupIdentity(identities, authorKey) {
  if (!authorKey) return null;
  if (identities[authorKey]) return identities[authorKey];
  const stripped = authorKey.replace(/^([a-z]+):@/i, '$1:');
  if (identities[stripped]) return identities[stripped];
  const withAt = authorKey.replace(/^([a-z]+):(?!@)/i, '$1:@');
  if (withAt !== authorKey && identities[withAt]) return identities[withAt];
  return null;
}

function collectCards(data) {
  const cards = [];
  for (const section of data.sections || []) {
    for (const card of section.cards || []) cards.push(card);
  }
  return cards;
}

function softEvaluate(data, identities) {
  const warnings = [];
  collectCards(data).forEach((card, index) => {
    const loc = `card[${index}]`;
    const bullets = [...(card.en?.rewrite || []), ...(card.de?.rewrite || [])];
    const text = bullets.join(' ');
    if (text && !/\d/.test(text)) warnings.push(`${loc} no number in rewrite bullets`);
    for (const bullet of bullets) {
      const words = String(bullet).trim().split(/\s+/).filter(Boolean);
      if (words.length > 30) warnings.push(`${loc} bullet has ${words.length} words (soft max 30)`);
    }
    if (card.authorKey && !lookupIdentity(identities, card.authorKey)) {
      warnings.push(`${loc} unknown authorKey: ${card.authorKey}`);
    }
    if (/^(this|it|the model|ai)\b/i.test(String(card.en?.rewrite?.[0] || '').trim())) {
      warnings.push(`${loc} first bullet starts too generically`);
    }
  });
  const meta = data.meta || {};
  if (meta.tokensIn > 12000) warnings.push(`meta tokensIn ${meta.tokensIn} exceeds 12000 budget`);
  if (meta.estCostUsd > 0.02) warnings.push(`meta estCostUsd ${meta.estCostUsd} exceeds $0.02 guardrail`);
  if (meta.repairAttempts > 1) warnings.push(`meta repairAttempts ${meta.repairAttempts} exceeds 1`);
  return warnings;
}

function listIssueFiles() {
  if (!fs.existsSync(ISSUES_DIR)) return [];
  return fs
    .readdirSync(ISSUES_DIR)
    .filter((name) => /^ai-builders-digest-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
}

function evaluateIssue(fileName, identities, sourceIndex) {
  const filePath = path.join(ISSUES_DIR, fileName);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const legacy = !data.meta;
  const result = legacy ? validateLegacyIssue(data) : validateMagazineJSON(data);
  const sourceUrls = data.meta?.sourceUrls;

  if (!legacy && Array.isArray(sourceUrls) && sourceUrls.length > 0) {
    const allowed = new Set(sourceUrls);
    for (const url of collectCardUrls(data)) {
      if (!allowed.has(url)) {
        result.errors.push(`sourceUrl missing from meta.sourceUrls: ${url}`);
        result.ok = false;
      }
    }
  }

  const warnings = [...(result.warnings || [])];
  let faithfulness = null;
  if (!legacy) {
    warnings.push(...softEvaluate(data, identities));
    const grounded = evaluateFaithfulness(data, sourceIndex);
    warnings.push(...grounded.warnings);
    faithfulness = grounded.stats;
  }

  return {
    file: fileName,
    date: data.publishDate || fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0],
    kind: legacy ? 'legacy' : 'current',
    ok: result.ok,
    errors: result.errors,
    warnings,
    faithfulness,
  };
}

function main() {
  const runId = process.env.DIGEST_RUN_ID || makeRunId('eval');
  const identities = loadIdentities();
  const sourceIndex = loadSourceIndex();
  const issues = listIssueFiles().map((fileName) => evaluateIssue(fileName, identities, sourceIndex));
  const current = issues.filter((item) => item.kind === 'current');
  const legacy = issues.filter((item) => item.kind === 'legacy');
  const faithfulness = current.reduce(
    (acc, item) => {
      const stats = item.faithfulness || {};
      acc.checked += stats.checked || 0;
      acc.skippedNoSource += stats.skippedNoSource || 0;
      acc.numberMisses += stats.numberMisses || 0;
      acc.quoteMisses += stats.quoteMisses || 0;
      return acc;
    },
    { checked: 0, skippedNoSource: 0, numberMisses: 0, quoteMisses: 0 }
  );
  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      issues: issues.length,
      current: current.length,
      legacy: legacy.length,
      currentFailed: current.filter((item) => !item.ok).length,
      legacyFailed: legacy.filter((item) => !item.ok).length,
      faithfulness,
    },
    issues,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  appendJsonl(RUN_LEDGER_PATH, {
    runId,
    stage: 'eval',
    status: current.some((item) => !item.ok) ? 'failed' : 'ok',
    generatedAt: report.generatedAt,
    currentIssues: current.length,
    legacyIssues: legacy.length,
    currentFailed: report.totals.currentFailed,
    legacyFailed: report.totals.legacyFailed,
    faithfulness,
    warningIssues: issues.filter((row) => (row.warnings || []).length > 0).length,
  });

  console.error(`Eval: ${issues.length} issue(s) — current ${report.totals.currentFailed}/${current.length} failed, legacy ${report.totals.legacyFailed}/${legacy.length} failed`);
  console.error(`Faithfulness: ${faithfulness.checked} card(s) with source text, ${faithfulness.numberMisses} number miss(es), ${faithfulness.quoteMisses} quote miss(es), ${faithfulness.skippedNoSource} skipped (source not on disk)`);
  console.error(`Report: ${REPORT_PATH}`);
  for (const item of issues.filter((row) => !row.ok)) {
    console.error(`  FAIL ${item.kind} ${item.file}`);
    item.errors.forEach((error) => console.error(`    - ${error}`));
  }

  const warned = issues.filter((row) => (row.warnings || []).length > 0);
  if (warned.length > 0) {
    console.error(`Soft warnings: ${warned.length} issue(s)`);
    for (const item of warned) {
      console.error(`  WARN ${item.file}`);
      item.warnings.slice(0, 8).forEach((warning) => console.error(`    - ${warning}`));
      if (item.warnings.length > 8) console.error(`    - … ${item.warnings.length - 8} more`);
    }
  }

  if (current.some((item) => !item.ok)) process.exit(1);
}

main();
