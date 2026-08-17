#!/usr/bin/env node
// Hard-metric replay over data/issues/*.json. No model calls.

const fs = require('fs');
const path = require('path');
const { validateMagazineJSON, validateLegacyIssue, collectCardUrls } = require('./lib/validate-magazine');

const REPO_ROOT = path.resolve(__dirname, '..');
const ISSUES_DIR = path.join(REPO_ROOT, 'data', 'issues');
const REPORT_PATH = path.join(REPO_ROOT, 'data', 'eval', 'last-report.json');
const IDENTITIES_PATH = path.join(REPO_ROOT, 'config', 'author-identities.json');

function loadIdentities() {
  if (!fs.existsSync(IDENTITIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(IDENTITIES_PATH, 'utf8')).entries || {};
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
  });
  return warnings;
}

function listIssueFiles() {
  if (!fs.existsSync(ISSUES_DIR)) return [];
  return fs
    .readdirSync(ISSUES_DIR)
    .filter((name) => /^ai-builders-digest-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
}

function evaluateIssue(fileName, identities) {
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
  if (!legacy) warnings.push(...softEvaluate(data, identities));

  return {
    file: fileName,
    date: data.publishDate || fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0],
    kind: legacy ? 'legacy' : 'current',
    ok: result.ok,
    errors: result.errors,
    warnings,
  };
}

function main() {
  const identities = loadIdentities();
  const issues = listIssueFiles().map((fileName) => evaluateIssue(fileName, identities));
  const current = issues.filter((item) => item.kind === 'current');
  const legacy = issues.filter((item) => item.kind === 'legacy');
  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      issues: issues.length,
      current: current.length,
      legacy: legacy.length,
      currentFailed: current.filter((item) => !item.ok).length,
      legacyFailed: legacy.filter((item) => !item.ok).length,
    },
    issues,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.error(`Eval: ${issues.length} issue(s) — current ${report.totals.currentFailed}/${current.length} failed, legacy ${report.totals.legacyFailed}/${legacy.length} failed`);
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
