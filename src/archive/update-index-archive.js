#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_INDEX_PATH = path.join(REPO_ROOT, 'index.html');
const ISSUE_HTML_DIR = 'issues';
const DATA_ISSUES_DIR = path.join(REPO_ROOT, 'data', 'issues');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseExistingArchive(indexHtml) {
  const entries = new Map();
  const itemRegex = /<a class="archive-link" href="([^"]+)">[\s\S]*?<div class="archive-date">([^<]+)<\/div>[\s\S]*?<h3 class="archive-entry-title">([^<]+)<\/h3>[\s\S]*?<p class="archive-entry-desc">([^<]+)<\/p>[\s\S]*?<span class="archive-issue">([^<]+)<\/span>/g;

  let match;
  while ((match = itemRegex.exec(indexHtml))) {
    const [, href, date, title, desc, issue] = match;
    entries.set(date, { href, date, title, desc, issue });
  }

  return entries;
}

function deriveArchiveTitle(data, publishDate) {
  if (data.archive?.title) return data.archive.title;
  const firstSectionTitle = data.sections?.[0]?.title || '';
  const zhTitle = firstSectionTitle.split(' / ')[0]?.trim();
  return zhTitle ? `${zhTitle}日报` : `${publishDate} 日报`;
}

function deriveArchiveDesc(data) {
  if (data.archive?.desc) return data.archive.desc;
  return String(data.intro?.text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function loadJsonEntries() {
  if (!fs.existsSync(DATA_ISSUES_DIR)) {
    return [];
  }

  const entries = [];
  fs.readdirSync(DATA_ISSUES_DIR).forEach((fileName) => {
    const match = fileName.match(/^ai-builders-digest-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) return;

    const publishDate = match[1];
    const filePath = path.join(DATA_ISSUES_DIR, fileName);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    entries.push({
      href: `./${ISSUE_HTML_DIR}/ai-builders-digest-${publishDate}.html`,
      date: publishDate,
      title: deriveArchiveTitle(data, publishDate),
      desc: deriveArchiveDesc(data),
      issue: '',
    });
  });

  return entries;
}

function renderArchiveItem(entry) {
  return `          <li class="archive-item">
            <a class="archive-link" href="${escapeHtml(entry.href)}">
              <div class="archive-date">${escapeHtml(entry.date)}</div>
              <div>
                <h3 class="archive-entry-title">${escapeHtml(entry.title)}</h3>
                <p class="archive-entry-desc">${escapeHtml(entry.desc)}</p>
              </div>
              <div class="archive-meta">
                <span class="archive-issue">${escapeHtml(entry.issue)}</span>
                <span class="archive-arrow">Ausgabe öffnen →</span>
              </div>
            </a>
          </li>`;
}

function replaceArchiveList(indexHtml, renderedItems) {
  return indexHtml.replace(
    /(<ul class="archive-list">\n)[\s\S]*?(\n\s*<\/ul>)/,
    `$1${renderedItems.join('\n')}$2`
  );
}

function main() {
  const indexPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INDEX_PATH;
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const existingArchive = parseExistingArchive(indexHtml);
  const jsonEntries = loadJsonEntries();

  jsonEntries.forEach((entry) => {
    existingArchive.set(entry.date, entry);
  });

  const chronologicalEntries = Array.from(existingArchive.values()).sort((a, b) => a.date.localeCompare(b.date));
  chronologicalEntries.forEach((entry, index) => {
    entry.issue = `Issue ${pad2(index + 1)}`;
  });

  const renderedItems = chronologicalEntries
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(renderArchiveItem);

  fs.writeFileSync(indexPath, replaceArchiveList(indexHtml, renderedItems), 'utf8');
  console.log(`Updated archive list in ${indexPath}`);
}

module.exports = { main };

if (require.main === module) {
  main();
}
