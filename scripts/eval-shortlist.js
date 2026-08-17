#!/usr/bin/env node
// Replay prepareFeedForModel against frozen gold fixtures. No model calls.

const fs = require('fs');
const path = require('path');
const { prepareFeedForModel, shortlistUrls } = require('./lib/prepare-feed');
const { loadPublishedUrls, isPublished } = require('./lib/published-urls');

const REPO_ROOT = path.resolve(__dirname, '..');
const GOLD_DIR = path.join(REPO_ROOT, 'data', 'eval', 'gold');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listGoldFiles() {
  if (!fs.existsSync(GOLD_DIR)) return [];
  return fs.readdirSync(GOLD_DIR).filter((name) => name.endsWith('.json')).sort();
}

function sourceCounts(shortlist) {
  const counts = {};
  for (const item of shortlist) {
    const key = item.name || item.handle || item.kind;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function evaluateGoldCase(caseData, fileName) {
  const errors = [];
  const now = caseData.asOf || caseData.feed?.generatedAt;
  const { shortlist, stats } = prepareFeedForModel(caseData.feed, { now });
  const urls = shortlistUrls(shortlist);
  const expect = caseData.expect || {};
  const size = expect.shortlistSize || {};

  if (size.exact != null && urls.length !== size.exact) {
    errors.push(`shortlist size ${urls.length} !== exact ${size.exact}`);
  }
  if (size.min != null && urls.length < size.min) {
    errors.push(`shortlist size ${urls.length} < min ${size.min}`);
  }
  if (size.max != null && urls.length > size.max) {
    errors.push(`shortlist size ${urls.length} > max ${size.max}`);
  }

  const maxPerSource = expect.maxPerSource;
  if (maxPerSource != null) {
    for (const [source, count] of Object.entries(sourceCounts(shortlist))) {
      if (count > maxPerSource) {
        errors.push(`${source} has ${count} items (max ${maxPerSource})`);
      }
    }
  }

  for (const url of expect.mustInclude || []) {
    if (!urls.includes(url)) errors.push(`missing required URL: ${url}`);
  }
  for (const url of expect.mustExclude || []) {
    if (urls.includes(url)) errors.push(`unexpected URL: ${url}`);
  }

  if (Array.isArray(expect.urlsExact)) {
    const expected = expect.urlsExact;
    if (urls.length !== expected.length || expected.some((url) => !urls.includes(url))) {
      errors.push(`shortlist URLs drifted\n    got: ${urls.join('\n    got: ')}\n    want: ${expected.join('\n    want: ')}`);
    }
  }

  return {
    file: fileName,
    name: caseData.name || fileName,
    ok: errors.length === 0,
    errors,
    urls,
    stats,
  };
}

function evaluatePublishedUrlSemantics() {
  const errors = [];
  const used = loadPublishedUrls(REPO_ROOT, '2026-08-17');
  const fromPrior = 'https://x.com/rauchg/status/2088020529039180204';
  const fromToday = 'https://techcrunch.com/2026/08/16/stripe-will-reportedly-acquire-ai-gateway-startup-openrouter-for-7b/';

  if (!isPublished(fromPrior, used)) {
    errors.push('2026-08-16 card URL should be excluded when generating 2026-08-17');
  }
  if (isPublished(fromToday, used)) {
    errors.push('2026-08-17 card URL should stay available for a same-day rerun');
  }

  const after = loadPublishedUrls(REPO_ROOT, '2026-08-18');
  if (!isPublished(fromToday, after)) {
    errors.push('2026-08-17 card URL should be excluded on 2026-08-18');
  }

  return {
    file: 'published-urls',
    name: 'prior-issue URL gate',
    ok: errors.length === 0,
    errors,
  };
}

function main() {
  const gold = listGoldFiles().map((fileName) => {
    const caseData = loadJson(path.join(GOLD_DIR, fileName));
    return evaluateGoldCase(caseData, fileName);
  });
  const extra = evaluatePublishedUrlSemantics();
  const results = [...gold, extra];
  const failed = results.filter((row) => !row.ok);

  console.error(`Shortlist gold: ${gold.length} fixture(s) + URL gate — ${failed.length} failed`);
  for (const row of results) {
    if (row.ok) {
      const n = row.urls ? row.urls.length : 'n/a';
      console.error(`  PASS ${row.name} (${n} URLs)`);
    } else {
      console.error(`  FAIL ${row.name}`);
      row.errors.forEach((error) => console.error(`    - ${error}`));
    }
  }

  if (failed.length > 0) process.exit(1);
}

main();
