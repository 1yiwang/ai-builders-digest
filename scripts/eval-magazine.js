#!/usr/bin/env node
// Hard-metric replay over data/issues/*.json. No model calls.

const fs = require('fs');
const path = require('path');
const { validateMagazineJSON, validateLegacyIssue, collectCardUrls } = require('./lib/validate-magazine');

const REPO_ROOT = path.resolve(__dirname, '..');
const ISSUES_DIR = path.join(REPO_ROOT, 'data', 'issues');
const REPORT_PATH = path.join(REPO_ROOT, 'data', 'eval', 'last-report.json');

function listIssueFiles() {
  if (!fs.existsSync(ISSUES_DIR)) return [];
  return fs
    .readdirSync(ISSUES_DIR)
    .filter((name) => /^ai-builders-digest-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
}

function evaluateIssue(fileName) {
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

  return {
    file: fileName,
    date: data.publishDate || fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0],
    kind: legacy ? 'legacy' : 'current',
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings || [],
  };
}

function main() {
  const issues = listIssueFiles().map(evaluateIssue);
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

  if (current.some((item) => !item.ok)) process.exit(1);
}

main();
