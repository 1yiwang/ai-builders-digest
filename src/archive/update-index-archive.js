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
  // Fallback: first section title (bilingual "EN / DE")
  const firstSectionTitle = data.sections?.[0]?.title || '';
  const mainTitle = firstSectionTitle.split(' / ')[1]?.trim() || firstSectionTitle.split(' / ')[0]?.trim();
  return mainTitle || `AI Builders Digest — ${publishDate}`;
}

function deriveArchiveDesc(data) {
  if (data.archive?.desc) return data.archive.desc;
  return String(data.intro?.text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
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
  // Handle both LF and CRLF line endings
  return indexHtml.replace(
    /(<ul class="archive-list">\r?\n)[\s\S]*?(\r?\n\s*<\/ul>)/,
    `$1${renderedItems.join('\n')}$2`
  );
}

// -- Cover date formatting ---------------------------------------------------

const MONTH_NAMES = [
  'Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.',
  'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'
];

function formatCoverDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const monthIndex = parseInt(month, 10) - 1;
  const dayNum = parseInt(day, 10);
  return `${MONTH_NAMES[monthIndex] || month} ${dayNum}, ${year}`;
}

// -- Latest issue data -------------------------------------------------------

function getLatestIssue(jsonEntries) {
  if (jsonEntries.length === 0) return null;
  return jsonEntries
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

// -- Cover placeholder replacement --------------------------------------------

function replaceCoverPlaceholders(html, latestIssue) {
  let result = html;

  if (latestIssue) {
    result = result.replace('{{COVER_DATE}}', formatCoverDate(latestIssue.date));
    result = result.replace('{{LATEST_HREF}}', latestIssue.href);
    result = result.replace('{{LATEST_TITLE}}', escapeHtml(latestIssue.title));
  } else {
    // Fallback: use today's date, hide latest link
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    result = result.replace('{{COVER_DATE}}', formatCoverDate(todayStr));
    result = result.replace('{{LATEST_HREF}}', '#archive');
    result = result.replace('{{LATEST_TITLE}}', 'Noch keine Ausgaben — bald verfügbar');
  }

  return result;
}

// -- Main --------------------------------------------------------------------

function main() {
  const indexPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INDEX_PATH;
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  const existingArchive = parseExistingArchive(indexHtml);
  const jsonEntries = loadJsonEntries();

  jsonEntries.forEach((entry) => {
    existingArchive.set(entry.date, entry);
  });

  const chronologicalEntries = Array.from(existingArchive.values()).sort((a, b) => a.date.localeCompare(b.date));
  chronologicalEntries.forEach((entry, index) => {
    entry.issue = `Nr. ${pad2(index + 1)}`;
  });

  const renderedItems = chronologicalEntries
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(renderArchiveItem);

  // Replace archive list
  indexHtml = replaceArchiveList(indexHtml, renderedItems);

  // Replace cover placeholders
  const latestIssue = getLatestIssue(jsonEntries);
  indexHtml = replaceCoverPlaceholders(indexHtml, latestIssue);

  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log(`Updated index: ${jsonEntries.length} issue(s) in archive, cover date from ${latestIssue ? latestIssue.date : 'today'}`);
}

module.exports = { main };

if (require.main === module) {
  main();
}
