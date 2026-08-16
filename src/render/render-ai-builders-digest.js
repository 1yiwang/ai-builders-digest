#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
// Check repo config first (CI-compatible), then local ~/.follow-builders
const AUTHOR_IDENTITIES_PATH_REPO = path.join(REPO_ROOT, 'config', 'author-identities.json');
const AUTHOR_IDENTITIES_PATH_LOCAL = path.join(os.homedir(), '.follow-builders', 'assets', 'author-identities.json');
const AUTHOR_IDENTITIES_PATH = fs.existsSync(AUTHOR_IDENTITIES_PATH_REPO) ? AUTHOR_IDENTITIES_PATH_REPO : AUTHOR_IDENTITIES_PATH_LOCAL;

const AVATAR_MANIFEST_PATH_REPO = path.join(REPO_ROOT, 'config', 'avatar-manifest.json');
const AVATAR_MANIFEST_PATH_LOCAL = path.join(os.homedir(), '.follow-builders', 'assets', 'avatar-manifest.json');
const AVATAR_MANIFEST_PATH = fs.existsSync(AVATAR_MANIFEST_PATH_REPO) ? AVATAR_MANIFEST_PATH_REPO : AVATAR_MANIFEST_PATH_LOCAL;
const SITE_AVATAR_DIR = path.join('assets', 'avatars');
const ISSUE_HTML_DIR = 'issues';
const DATA_ISSUES_DIR = path.join('data', 'issues');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadEntries(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const data = readJson(filePath);
  return data.entries || {};
}

function usage() {
  console.log('Usage: node render-ai-builders-digest.js <input.json> [output.html]');
  process.exit(1);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function collectIssueDates(repoRoot) {
  const issueDates = new Set();
  const scanDir = (targetDir) => {
    if (!fs.existsSync(targetDir)) return;
    fs.readdirSync(targetDir).forEach((fileName) => {
      const match = fileName.match(/^ai-builders-digest-(\d{4}-\d{2}-\d{2})(?:-rerun)?\.(?:json|html)$/);
      if (match) issueDates.add(match[1]);
    });
  };
  scanDir(path.join(repoRoot, DATA_ISSUES_DIR));
  scanDir(path.join(repoRoot, ISSUE_HTML_DIR));
  return Array.from(issueDates).sort();
}

function formatIssueNumber(publishDateString, issueDates) {
  const orderedDates = Array.isArray(issueDates) && issueDates.length ? issueDates : [];
  const issueIndex = orderedDates.indexOf(publishDateString);
  if (issueIndex === -1) return null;
  return pad2(issueIndex + 1);
}

function formatThemeLabel(index) {
  return `Theme ${pad2(index + 1)}`;
}

function getInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function normalizeHandle(handle) {
  if (!handle) return '';
  return handle.startsWith('@') ? handle : `@${handle}`;
}

function youtubeHandleFromUrl(url) {
  const match = String(url || '').match(/\/@([A-Za-z0-9_.-]+)/);
  return match ? match[1] : '';
}

function authorKeyCandidates(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return [];
  const keys = [key];
  const withAt = key.replace(/^([a-z]+):(?!@)/i, '$1:@');
  const withoutAt = key.replace(/^([a-z]+):@/i, '$1:');
  if (withAt !== key) keys.push(withAt);
  if (withoutAt !== key) keys.push(withoutAt);
  return keys;
}

function lookupRecord(map, rawKey) {
  for (const key of authorKeyCandidates(rawKey)) {
    if (map[key]) return { key, value: map[key] };
  }
  return { key: rawKey || '', value: {} };
}

function identitiesFromSources(sources) {
  const entries = {};
  for (const account of sources.x || []) {
    entries[`x:${account.handle}`] = {
      name: account.name,
      handle: `@${String(account.handle || '').replace(/^@/, '')}`,
      label: account.label || 'X',
    };
  }
  for (const channel of sources.youtube || []) {
    const handle = youtubeHandleFromUrl(channel.url);
    if (!handle) continue;
    entries[`youtube:@${handle}`] = {
      name: channel.name,
      handle: `@${handle}`,
      label: 'YouTube',
    };
  }
  for (const podcast of sources.podcasts || []) {
    entries[`podcast:${podcast.name}`] = {
      name: podcast.name,
      handle: '',
      label: 'Podcast',
    };
  }
  for (const blog of [...(sources.blogs || []), ...(sources.blogRSS || [])]) {
    entries[`blog:${blog.name}`] = {
      name: blog.name,
      handle: '',
      label: 'Blog',
    };
  }
  return entries;
}

function handleFromAuthorKey(rawKey) {
  const match = String(rawKey || '').match(/^(?:x|youtube):@?([A-Za-z0-9_.-]+)$/i);
  return match ? `@${match[1]}` : '';
}

function toLocalPath(value) {
  if (!value) return '';
  if (value.startsWith('file://')) {
    return decodeURIComponent(value.replace('file://', ''));
  }
  // Resolve repo-relative paths (used in config/avatar-manifest.json for CI compatibility)
  if (!path.isAbsolute(value) && !value.startsWith('http')) {
    return path.resolve(REPO_ROOT, value);
  }
  return value;
}

function toRelativeUrl(fromDir, targetPath) {
  const relativePath = path.relative(fromDir, targetPath).replace(/\\/g, '/');
  if (!relativePath) return './';
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function renderBlock(block) {
  if (typeof block === 'string') {
    return `<p>${escapeHtml(block)}</p>`;
  }

  if (!block || typeof block !== 'object') {
    return '';
  }

  if (block.type === 'code') {
    return `<p><span class="inline-code">${escapeHtml(block.text || '')}</span></p>`;
  }

  if (block.type === 'ordered') {
    const items = (block.items || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  }

  if (block.type === 'html') {
    return block.html || '';
  }

  return '';
}

function renderBlocks(blocks) {
  return (blocks || []).map(renderBlock).join('\n');
}

function resolveAuthorMeta(card, authorIdentities, avatarManifest, outputPath) {
  const rawKey = card.authorKey || '';
  const identityHit = lookupRecord(authorIdentities, rawKey);
  const avatarHit = lookupRecord(avatarManifest, identityHit.key || rawKey);
  const identity = identityHit.value || {};
  const avatar = avatarHit.value || {};
  const localAvatar = avatar.localPath ? toLocalPath(avatar.localPath) : '';
  const avatarSourcePath = localAvatar && fs.existsSync(localAvatar)
    ? localAvatar
    : (card.authorAvatar && fs.existsSync(toLocalPath(card.authorAvatar)) ? toLocalPath(card.authorAvatar) : '');
  const outputDir = path.dirname(outputPath);

  const name = identity.name || card.authorName || card.sourceName || '';
  const handle = normalizeHandle(identity.handle || card.authorHandle || handleFromAuthorKey(rawKey));
  const tag = identity.label || card.authorTag || '';
  const key = identityHit.key || rawKey;
  const avatarUrl = avatarSourcePath
    ? toRelativeUrl(outputDir, path.join(REPO_ROOT, SITE_AVATAR_DIR, path.basename(avatarSourcePath)))
    : '';

  return {
    key,
    name,
    handle,
    tag,
    avatarSourcePath,
    avatarUrl,
    initials: getInitials(name),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyUsedAvatars(outputPath, data, authorIdentities, avatarManifest) {
  const targetDir = path.join(REPO_ROOT, SITE_AVATAR_DIR);
  ensureDir(targetDir);

  const copied = new Set();
  (data.sections || []).forEach((section) => {
    (section.cards || []).forEach((card) => {
      const author = resolveAuthorMeta(card, authorIdentities, avatarManifest, outputPath);
      if (!author.avatarSourcePath || copied.has(author.avatarSourcePath) || !fs.existsSync(author.avatarSourcePath)) {
        return;
      }

      const fileName = path.basename(author.avatarSourcePath);
      fs.copyFileSync(author.avatarSourcePath, path.join(targetDir, fileName));
      copied.add(author.avatarSourcePath);
    });
  });
}

function renderCard(card, authorIdentities, avatarManifest, labels, outputPath, isHidden) {
  const author = resolveAuthorMeta(card, authorIdentities, avatarManifest, outputPath);
  const sourceLabel = card.sourceLabel || 'Quelle / Source →';
  const hiddenClass = isHidden ? ' is-low-priority' : '';

  return `    <article class="card${hiddenClass}" data-author-key="${escapeHtml(author.key)}" data-author-name="${escapeHtml(author.name)}" data-author-tag="${escapeHtml(author.tag)}" data-author-handle="${escapeHtml(author.handle)}" data-author-avatar="${escapeHtml(author.avatarUrl)}" data-priority="${card.priority || ''}">
      <div class="card-header">
        <div class="avatar${author.avatarUrl ? '' : ' is-fallback'}"><img src="${escapeHtml(author.avatarUrl)}" alt="${escapeHtml(author.name ? `${author.name} avatar` : 'Author avatar')}"><span class="avatar-fallback">${escapeHtml(author.initials)}</span></div>
        <div class="author-info">
          <div class="author-name-row">
            <span class="author-name">${escapeHtml(author.name)}</span>
            <span class="author-tag">${escapeHtml(author.tag)}</span>
          </div>
          <div class="author-handle">${escapeHtml(author.handle)}</div>
        </div>
        <div class="card-tabs">
          <button class="lang-tab is-active" type="button" data-lang="de">Deutsch</button>
          <button class="lang-tab" type="button" data-lang="en">English</button>
        </div>
      </div>
      <div class="card-body">
        <div class="lang-panel de is-active" data-lang="de">
${indent(renderBlocks(card.de?.rewrite || []), 10)}
        </div>
        <div class="lang-panel en" data-lang="en">
${indent(renderBlocks(card.en?.rewrite || []), 10)}
        </div>
      </div>
      <div class="card-footer"><a href="${escapeHtml(card.sourceUrl || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLabel)}</a></div>
    </article>`;
}

function indent(value, spaces) {
  const prefix = ' '.repeat(spaces);
  return String(value || '')
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : ''))
    .join('\n');
}

function renderSection(section, index, authorIdentities, avatarManifest, labels, outputPath) {
  const sortedCards = (section.cards || []).slice().sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const visibleCards = sortedCards.filter((c) => (c.priority || 99) <= 2);
  const hiddenCards = sortedCards.filter((c) => (c.priority || 99) > 2);

  const visibleHtml = visibleCards
    .map((card) => renderCard(card, authorIdentities, avatarManifest, labels, outputPath))
    .join('\n\n');
  const hiddenHtml = hiddenCards
    .map((card) => renderCard(card, authorIdentities, avatarManifest, labels, outputPath, true))
    .join('\n\n');

  const toggleHtml = hiddenCards.length > 0
    ? `\n    <button class="section-toggle" type="button" data-section="${escapeHtml(formatThemeLabel(index))}"><span class="section-toggle-show">+ ${hiddenCards.length} weitere Beiträge anzeigen</span><span class="section-toggle-hide">– Weniger anzeigen</span></button>`
    : '';

  return `  <section class="section-header">
    <div class="section-label">${escapeHtml(section.label || formatThemeLabel(index))}</div>
    <h2 class="section-title">${escapeHtml(section.title || '')}</h2>
    <p class="section-desc">${escapeHtml(section.desc || '')}</p>
  </section>
  <section class="feed">
${visibleHtml}${hiddenHtml}${toggleHtml}
  </section>`;
}

function renderPage(data, authorIdentities, avatarManifest, outputPath) {
  const issueDates = collectIssueDates(REPO_ROOT);
  const publishDate = data.publishDate;
  const issueNumber = formatIssueNumber(publishDate, issueDates) || '';
  const outputDir = path.dirname(outputPath);
  const returnHref = toRelativeUrl(outputDir, path.join(REPO_ROOT, 'index.html'));
  const labels = {
    rewrite: data.viewLabels?.rewrite || 'Kurz',
    original: data.viewLabels?.original || 'Original',
  };
  const title = data.title || 'AI Builders Digest';
  const subtitle = data.subtitle || 'Bilingual edition · Zweisprachige Ausgabe';
  const editionName = data.editionName || 'DE+EN Ausgabe';
  const introKicker = data.intro?.kicker || "Einleitung / Editor's Note";
  const introText = data.intro?.text || '';
  const sourceNote = data.footerNote || `Source: Follow Builders curated daily digest. Rebuilt from the ${publishDate} source draft.`;

  const selectedCount = (data.sections || []).reduce((sum, section) => sum + (section.cards || []).length, 0);
  const authorKeys = new Set();
  (data.sections || []).forEach((section) => {
    (section.cards || []).forEach((card) => {
      if (card.authorKey) authorKeys.add(card.authorKey);
    });
  });
  const themeCount = (data.sections || []).length;
  const editionStrip = `Nr. ${issueNumber}｜${publishDate}｜${editionName}｜${selectedCount} Beiträge｜${authorKeys.size} Autoren｜${themeCount} Themen`;
  const sectionsHtml = (data.sections || [])
    .map((section, index) => renderSection(section, index, authorIdentities, avatarManifest, labels, outputPath))
    .join('\n\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} · ${escapeHtml(publishDate)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Crimson+Text:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f0f2f5;
    --card-bg: #ffffff;
    --border: #e2e8f0;
    --text-primary: #1a1f2c;
    --text-body: #334155;
    --text-muted: #64748b;
    --tag-bg: rgba(99, 102, 241, 0.08);
    --tag-text: #6366f1;
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    --edition-bg: rgba(255,255,255,0.6);
    --footer-bg: #f8fafc;
    --tabs-bg: rgba(0,0,0,0.04);
    --card-hover-border: #cbd5e1;
    --accent-start: #6366f1;
    --accent-end: #a855f7;
    --card-radius: 12px;
    --max-width: 720px;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0d111a;
      --card-bg: #161b26;
      --border: #232a3b;
      --text-primary: #ffffff;
      --text-body: #e2e8f0;
      --text-muted: #8b949e;
      --tag-bg: rgba(99, 102, 241, 0.12);
      --tag-text: #a5b4fc;
      --shadow: none;
      --edition-bg: rgba(22, 27, 38, 0.5);
      --footer-bg: rgba(0,0,0,0.15);
      --tabs-bg: rgba(255,255,255,0.04);
      --card-hover-border: #363f58;
    }
  }

  :root[data-theme="dark"] {
    --bg: #0d111a;
    --card-bg: #161b26;
    --border: #232a3b;
    --text-primary: #ffffff;
    --text-body: #e2e8f0;
    --text-muted: #8b949e;
    --tag-bg: rgba(99, 102, 241, 0.12);
    --tag-text: #a5b4fc;
    --shadow: none;
    --edition-bg: rgba(22, 27, 38, 0.5);
    --footer-bg: rgba(0,0,0,0.15);
    --tabs-bg: rgba(255,255,255,0.04);
    --card-hover-border: #363f58;
  }

  :root[data-theme="light"] {
    --bg: #f0f2f5;
    --card-bg: #ffffff;
    --border: #e2e8f0;
    --text-primary: #1a1f2c;
    --text-body: #334155;
    --text-muted: #64748b;
    --tag-bg: rgba(99, 102, 241, 0.08);
    --tag-text: #6366f1;
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    --edition-bg: rgba(255,255,255,0.6);
    --footer-bg: #f8fafc;
    --tabs-bg: rgba(0,0,0,0.04);
    --card-hover-border: #cbd5e1;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--text-body);
    font-family: 'IBM Plex Sans', sans-serif;
    line-height: 1.7;
    overflow-x: hidden;
  }
  img { max-width: 100%; height: auto; }

  .masthead, .intro, .section-header, .feed, footer {
    max-width: var(--max-width);
    margin: 0 auto;
    padding-left: 24px;
    padding-right: 24px;
  }

  .masthead { padding-top: 56px; }
  .masthead-rule { border: none; border-top: 2px solid var(--border); margin: 0 0 16px; }
  .masthead-inner { display: flex; justify-content: center; gap: 16px; align-items: baseline; border-bottom: 1px solid var(--border); padding-bottom: 14px; flex-wrap: wrap; }
  .masthead-title {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.4px;
    background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .masthead-subtitle { margin-top: 10px; padding-bottom: 12px; color: var(--text-muted); font-size: 13px; text-align: center; }

  .theme-toggle {
    position: relative;
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--card-bg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    line-height: 1;
    padding: 0;
    transition: background 200ms ease, border-color 200ms ease, transform 200ms ease;
    overflow: hidden;
  }
  .theme-toggle:hover { transform: scale(1.08); border-color: var(--accent-start); }
  .theme-icon-light, .theme-icon-dark {
    position: absolute;
    transition: opacity 200ms ease, transform 200ms ease;
  }
  .theme-icon-light { opacity: 1; transform: rotate(0deg); }
  .theme-icon-dark { opacity: 0; transform: rotate(90deg); }
  [data-theme="dark"] .theme-icon-light { opacity: 0; transform: rotate(-90deg); }
  [data-theme="dark"] .theme-icon-dark { opacity: 1; transform: rotate(0deg); }


  .edition-strip {
    position: relative;
    margin-top: 10px;
    min-height: 46px;
    padding: 10px 120px 12px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: var(--edition-bg);
    color: var(--text-muted);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.2px;
    text-align: center;
  }

  .edition-strip .edition-sep { margin: 0 8px; color: var(--text-muted); opacity: 0.5; }
  .edition-strip-text { display: block; }
  .edition-return-link {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 999px;
    color: var(--accent-start);
    text-decoration: none;
    font-size: 12px;
    line-height: 1;
    letter-spacing: 0.06em;
    background: rgba(99, 102, 241, 0.08);
    transition: background 200ms ease, border-color 200ms ease, transform 200ms ease;
  }
  .edition-return-link:hover, .edition-return-link:focus-visible {
    background: rgba(99, 102, 241, 0.15);
    border-color: var(--accent-start);
    transform: translateY(-50%) translateX(-2px);
  }
  .edition-return-link:focus-visible { outline: none; }

  .intro { padding-top: 28px; }
  .intro-inner { max-width: 680px; margin: 0 auto; padding: 0 0 0 20px; border-left: 3px solid var(--accent-start); }
  .intro-kicker {
    margin: 0 0 8px;
    background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }
  .intro p {
    margin: 0;
    max-width: none;
    color: var(--text-muted);
    font-size: clamp(15px, 1.6vw, 16px);
    line-height: 1.9;
    text-wrap: pretty;
    font-family: 'Crimson Text', 'Georgia', serif;
    overflow-wrap: anywhere;
  }

  .section-header { margin-top: 48px; }
  .section-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 6px;
  }
  .section-title {
    font-family: 'Playfair Display', serif;
    font-size: 26px;
    margin: 0 0 8px;
    color: var(--text-primary);
    line-height: 1.25;
  }
  .section-desc { margin: 0 0 22px; color: var(--text-muted); font-size: 14px; line-height: 1.6; }

  .feed { display: flex; flex-direction: column; gap: 24px; }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--card-radius);
    overflow: hidden;
    box-shadow: var(--shadow);
    transition: border-color 200ms ease;
  }
  .card:hover { border-color: var(--card-hover-border); }

  .card-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.2);
    color: var(--accent-start);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
    overflow: hidden;
    border: 2px solid rgba(99, 102, 241, 0.25);
  }
  .avatar img { width: 100%; height: 100%; display: block; object-fit: cover; }
  .avatar-fallback { display: none; align-items: center; justify-content: center; width: 100%; height: 100%; color: #a5b4fc; }
  .avatar.is-fallback img { display: none; }
  .avatar.is-fallback .avatar-fallback { display: flex; }

  .author-info { flex: 1; min-width: 140px; }
  .author-name { font-weight: 600; font-size: 15px; color: var(--text-primary); }
  .author-name-row { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .author-handle { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .author-tag {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    background: var(--tag-bg);
    color: var(--tag-text);
    padding: 3px 8px;
    border-radius: 999px;
  }

  .card-tabs {
    display: inline-flex;
    gap: 4px;
    background: var(--tabs-bg);
    border-radius: 999px;
    padding: 3px;
    border: 1px solid var(--border);
  }
  .lang-tab {
    border: none;
    background: transparent;
    color: var(--text-muted);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.06em;
    transition: all 200ms ease;
  }
  .lang-tab.is-active {
    background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
    color: #fff;
  }
  .lang-tab:not(.is-active):hover { color: var(--text-body); }

  .card-body { padding: 0; }
  .lang-panel {
    display: none;
    padding: 22px 24px 24px;
    animation: fadeSlideIn 220ms ease;
  }
  .lang-panel.is-active { display: block; }
  .lang-panel p { margin: 0 0 1.2rem; font-size: 15px; line-height: 1.75; color: var(--text-body); }
  .lang-panel p:last-child { margin-bottom: 0; }
  .lang-panel ol { margin: 0 0 1.2rem 22px; padding: 0; }
  .lang-panel li { margin: 0 0 8px; font-size: 15px; line-height: 1.7; }
  .inline-code {
    display: inline-block;
    font-family: 'IBM Plex Mono', monospace;
    background: var(--tag-bg);
    color: var(--tag-text);
    padding: 3px 8px;
    border-radius: 6px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card-footer {
    padding: 14px 24px 18px;
    border-top: 1px solid var(--border);
    background: var(--footer-bg);
  }
  .card-footer a {
    background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    display: inline-block;
    transition: transform 200ms ease;
  }
  .card.is-low-priority { display: none; }
  .card.is-low-priority.is-visible { display: block; }

  .section-toggle {
    display: block;
    width: 100%;
    padding: 10px 0;
    border: 1px dashed var(--border);
    border-radius: var(--card-radius);
    background: transparent;
    color: var(--text-muted);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: border-color 200ms ease, color 200ms ease, background 200ms ease;
  }
  .section-toggle:hover {
    border-color: var(--accent-start);
    color: var(--accent-start);
    background: var(--tag-bg);
  }
  .section-toggle .section-toggle-hide { display: none; }
  .section-toggle.is-expanded .section-toggle-show { display: none; }
  .section-toggle.is-expanded .section-toggle-hide { display: inline; }

  .card-footer a:hover {
    transform: translateX(4px);
    text-decoration: underline;
    text-decoration-color: var(--accent-start);
  }

  footer { padding-top: 32px; padding-bottom: 56px; color: var(--text-muted); font-size: 13px; text-align: center; }

  @media (max-width: 680px) {
    .masthead-inner { align-items: center; }
    .edition-strip { padding-right: 12px; padding-left: 12px; }
    .edition-strip-text { padding-right: 0; }
    .edition-return-link { position: static; transform: none; margin-top: 8px; font-size: 11px; }
    .edition-return-link:hover { transform: translateX(-2px); }
    .card-header { padding: 16px 18px 14px; }
    .card-tabs { margin-left: 0; margin-top: 4px; }
    .lang-panel { padding: 18px 18px 20px; }
    .card-footer { padding: 12px 18px 16px; }
    .edition-strip .edition-sep { margin: 0 5px; }
    .intro-inner { padding-left: 14px; }
    .intro p { line-height: 1.84; }
  }

  @media (max-width: 480px) {
    :root { --max-width: 100%; }
    .masthead { padding-top: 32px; }
    .masthead-title { font-size: 24px; }
    .masthead-subtitle { font-size: 11px; }
    .edition-strip { padding: 8px 12px 10px; font-size: 11px; }
    .edition-return-link { position: static; transform: none; margin-top: 6px; font-size: 11px; }
    .edition-return-link:hover { transform: translateX(-2px); }
    .edition-strip .edition-sep { margin: 0 4px; }
    .intro { padding-top: 20px; }
    .intro-inner { padding-left: 12px; border-left-width: 2px; }
    .intro-kicker { font-size: 10px; }
    .intro-copy { font-size: 14px; line-height: 1.78; }
    .section-header { margin-top: 32px; }
    .section-label { font-size: 10px; }
    .section-title { font-size: 20px; }
    .section-desc { font-size: 13px; margin-bottom: 16px; }
    .feed { gap: 18px; }
    .card-header { padding: 12px 14px 12px; gap: 10px; }
    .avatar { width: 36px; height: 36px; }
    .author-name { font-size: 14px; }
    .author-handle { font-size: 11px; }
    .author-tag { font-size: 11px; padding: 2px 6px; }
    .author-info { min-width: 0; }
    .card-tabs { margin-left: 0; margin-top: 4px; }
    .lang-tab { padding: 10px 16px; font-size: 12px; }
    .lang-panel { padding: 14px 14px 16px; }
    .lang-panel p { font-size: 14px; }
    .lang-panel li { font-size: 14px; }
    .lang-panel ol { margin-left: 16px; }
    .inline-code { font-size: 12px; padding: 2px 6px; }
    .card-footer { padding: 10px 14px 14px; }
    .card-footer a { font-size: 13px; }
    .section-toggle { padding: 14px 0; font-size: 12px; }
    .theme-toggle { width: 44px; height: 44px; }
    .theme-icon-light, .theme-icon-dark { font-size: 18px; }
    .masthead, .intro, .section-header, .feed, footer { padding-left: 14px; padding-right: 14px; }
    footer { padding-top: 24px; padding-bottom: 40px; font-size: 12px; }
  }
</style>
</head>
<body data-publish-date="${escapeHtml(publishDate)}" data-issue-number="${escapeHtml(issueNumber)}" data-edition-name="${escapeHtml(editionName)}">
  <header class="masthead">
    <hr class="masthead-rule">
    <div class="masthead-inner">
      <div class="masthead-title">${escapeHtml(title)}</div>
      <button class="theme-toggle" type="button" aria-label="Toggle theme" title="Toggle light/dark mode">
        <span class="theme-icon-light">☀</span>
        <span class="theme-icon-dark">☽</span>
      </button>
    </div>
    <div class="masthead-subtitle">${escapeHtml(subtitle)}</div>
    <div class="edition-strip">
      <span class="edition-strip-text" id="edition-strip-text">${escapeHtml(editionStrip)}</span>
      <a class="edition-return-link" href="${escapeHtml(returnHref)}">Zurück</a>
    </div>
  </header>

  <section class="intro" data-kicker="${escapeHtml(introKicker)}" data-text="${escapeHtml(introText)}">
    <div class="intro-inner">
      <div class="intro-kicker">${escapeHtml(introKicker)}</div>
      <p class="intro-copy">${escapeHtml(introText)}</p>
    </div>
  </section>

${sectionsHtml}

  <footer data-source-note="${escapeHtml(sourceNote)}">${escapeHtml(sourceNote)}</footer>

  <script>
    window.AI_BUILDERS_TEMPLATE_SOURCES = {
      identities: ${JSON.stringify(authorIdentities)},
      avatars: ${JSON.stringify(avatarManifest)}
    };

    function getTemplateAuthorSources() {
      var sources = window.AI_BUILDERS_TEMPLATE_SOURCES || {};
      return { identities: sources.identities || {}, avatars: sources.avatars || {} };
    }

    function getAuthorInitials(name) {
      return (name || '').split(/\\s+/).filter(Boolean).slice(0, 2).map(function(part) { return part[0]; }).join('').toUpperCase();
    }

    function hydrateTemplateCopy() {
      var intro = document.querySelector('.intro');
      if (intro) {
        var kicker = intro.querySelector('.intro-kicker');
        var copy = intro.querySelector('.intro-copy');
        if (kicker) kicker.textContent = intro.dataset.kicker || '';
        if (copy) copy.textContent = intro.dataset.text || '';
      }
      var footer = document.querySelector('footer');
      if (footer) footer.textContent = footer.dataset.sourceNote || '';
    }

    function lookupAuthorRecord(map, authorKey) {
      if (!authorKey) return {};
      if (map[authorKey]) return map[authorKey];
      var stripped = authorKey.replace(/^([a-z]+):@/i, '$1:');
      if (map[stripped]) return map[stripped];
      var withAt = authorKey.replace(/^([a-z]+):(?!@)/i, '$1:@');
      if (withAt !== authorKey && map[withAt]) return map[withAt];
      return {};
    }

    function hydrateAuthorMeta() {
      var sources = getTemplateAuthorSources();
      document.querySelectorAll('.card').forEach(function(card) {
        var authorKey = card.dataset.authorKey || '';
        var identity = lookupAuthorRecord(sources.identities, authorKey);

        var name = identity.name || card.dataset.authorName || '';
        var rawHandle = identity.handle || card.dataset.authorHandle || '';
        var handle = rawHandle && rawHandle.indexOf('@') === 0 ? rawHandle : (rawHandle ? '@' + rawHandle : '');
        var tag = identity.label || card.dataset.authorTag || '';
        var avatar = card.dataset.authorAvatar || '';

        var nameNode = card.querySelector('.author-name');
        var tagNode = card.querySelector('.author-tag');
        var handleNode = card.querySelector('.author-handle');
        var avatarNode = card.querySelector('.avatar');
        var avatarImg = card.querySelector('.avatar img');
        var avatarFallback = card.querySelector('.avatar-fallback');

        if (nameNode) nameNode.textContent = name;
        if (tagNode) tagNode.textContent = tag;
        if (handleNode) handleNode.textContent = handle;
        if (avatarImg) {
          avatarImg.src = avatar;
          avatarImg.alt = name ? name + ' avatar' : 'Author avatar';
        }
        if (avatarNode) avatarNode.classList.toggle('is-fallback', !avatar);
        if (avatarFallback) avatarFallback.textContent = getAuthorInitials(name);
      });
    }

    function updateEditionStrip() {
      var publishDate = document.body.dataset.publishDate;
      var editionName = document.body.dataset.editionName || 'DE+EN Ausgabe';
      var editionStrip = document.getElementById('edition-strip-text');
      if (!publishDate || !editionStrip) return;

      var issueNumber = document.body.dataset.issueNumber || '';
      if (!issueNumber) return;

      var selectedCount = document.querySelectorAll('.card').length;
      var authorCount = new Set([].slice.call(document.querySelectorAll('.author-handle')).map(function(node) { return node.textContent.trim(); }).filter(Boolean)).size;
      var themeCount = document.querySelectorAll('.section-header').length;
      var parts = ['Nr. ' + issueNumber, publishDate, editionName, selectedCount + ' Beitr\\u00e4ge', authorCount + ' Autoren', themeCount + ' Themen'];
      editionStrip.innerHTML = parts.map(function(part) { return '<span class="edition-item">' + part + '</span>'; }).join('<span class="edition-sep">|</span>');
    }

    document.querySelectorAll('.card').forEach(function(card) {
      var tabs = card.querySelectorAll('.lang-tab');
      var panels = card.querySelectorAll('.lang-panel');

      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          var lang = tab.dataset.lang;
          if (tab.classList.contains('is-active')) return;

          tabs.forEach(function(t) { t.classList.toggle('is-active', t === tab); });
          panels.forEach(function(p) { p.classList.toggle('is-active', p.dataset.lang === lang); });
        });
      });
    });

    (function initTheme() {
      var html = document.documentElement;
      var toggle = document.querySelector('.theme-toggle');
      var saved = localStorage.getItem('ai-builders-digest-theme');

      function detectSystem() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      function applyTheme(theme) {
        html.setAttribute('data-theme', theme);
        localStorage.setItem('ai-builders-digest-theme', theme);
      }

      html.setAttribute('data-theme', saved || detectSystem());

      if (toggle) {
        toggle.addEventListener('click', function() {
          var current = html.getAttribute('data-theme');
          applyTheme(current === 'dark' ? 'light' : 'dark');
        });
      }
    })();

    document.querySelectorAll('.section-toggle').forEach(function(toggle) {
      toggle.addEventListener('click', function() {
        var feed = toggle.parentElement;
        var cards = feed.querySelectorAll('.card.is-low-priority');
        var expanded = toggle.classList.toggle('is-expanded');
        cards.forEach(function(card) { card.classList.toggle('is-visible', expanded); });
      });
    });

    hydrateTemplateCopy();
    hydrateAuthorMeta();
    updateEditionStrip();
  </script>
</body>
</html>`;
}

function main() {
  const inputPath = process.argv[2];
  const outputPathArg = process.argv[3];

  if (!inputPath) usage();

  const input = readJson(path.resolve(inputPath));
  const outputPath = outputPathArg
    ? path.resolve(outputPathArg)
    : path.resolve(REPO_ROOT, ISSUE_HTML_DIR, `ai-builders-digest-${input.publishDate || 'output'}.html`);

  const sourcesPath = path.join(REPO_ROOT, 'config', 'sources.json');
  const fromSources = fs.existsSync(sourcesPath) ? identitiesFromSources(readJson(sourcesPath)) : {};
  const authorIdentities = { ...fromSources, ...loadEntries(AUTHOR_IDENTITIES_PATH) };
  const avatarManifest = loadEntries(AVATAR_MANIFEST_PATH);
  const html = renderPage(input, authorIdentities, avatarManifest, outputPath);

  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, html, 'utf8');
  copyUsedAvatars(outputPath, input, authorIdentities, avatarManifest);
  console.log(`Rendered ${outputPath}`);
}

module.exports = { main };

if (require.main === module) {
  main();
}
