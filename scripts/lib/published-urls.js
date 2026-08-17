const fs = require('fs');
const path = require('path');
const { normalizeUrl } = require('./faithfulness');
const { collectCardUrls } = require('./validate-magazine');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tweetUrl(handle, id) {
  const h = String(handle || '').replace(/^@/, '');
  if (!h || !id) return '';
  return `https://x.com/${h}/status/${id}`;
}

function loadPublishedUrls(repoRoot, exceptDate) {
  const except = exceptDate || todayISO();
  const used = new Set();
  const issuesDir = path.join(repoRoot, 'data', 'issues');
  if (!fs.existsSync(issuesDir)) return used;

  for (const name of fs.readdirSync(issuesDir)) {
    const match = name.match(/^ai-builders-digest-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) continue;
    if (match[1] >= except) continue;
    const data = JSON.parse(fs.readFileSync(path.join(issuesDir, name), 'utf8'));
    for (const url of collectCardUrls(data)) {
      if (!url) continue;
      used.add(normalizeUrl(url));
    }
  }
  return used;
}

function isPublished(url, used) {
  if (!url || !used || used.size === 0) return false;
  return used.has(url) || used.has(normalizeUrl(url));
}

module.exports = {
  todayISO,
  tweetUrl,
  loadPublishedUrls,
  isPublished,
};
