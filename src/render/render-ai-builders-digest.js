#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AUTHOR_IDENTITIES_PATH = path.join(os.homedir(), '.follow-builders/assets/author-identities.json');
const AVATAR_MANIFEST_PATH = path.join(os.homedir(), '.follow-builders/assets/avatar-manifest.json');
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

function toLocalPath(value) {
  if (!value) return '';
  if (value.startsWith('file://')) {
    return decodeURIComponent(value.replace('file://', ''));
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
  const key = card.authorKey || '';
  const identity = authorIdentities[key] || {};
  const avatar = avatarManifest[key] || {};
  const avatarSourcePath = toLocalPath(avatar.localPath || avatar.fileUrl || card.authorAvatar || '');
  const outputDir = path.dirname(outputPath);

  const name = identity.name || card.authorName || '';
  const handle = normalizeHandle(identity.handle || card.authorHandle || '');
  const tag = identity.label || card.authorTag || '';
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

function renderCard(card, authorIdentities, avatarManifest, labels, outputPath) {
  const author = resolveAuthorMeta(card, authorIdentities, avatarManifest, outputPath);
  const sourceLabel = card.sourceLabel || 'Quelle / Source →';

  return `    <article class="card" data-author-key="${escapeHtml(author.key)}" data-author-name="${escapeHtml(author.name)}" data-author-tag="${escapeHtml(author.tag)}" data-author-handle="${escapeHtml(author.handle)}" data-author-avatar="${escapeHtml(author.avatarUrl)}">
      <div class="card-header">
        <div class="avatar${author.avatarUrl ? '' : ' is-fallback'}"><img src="${escapeHtml(author.avatarUrl)}" alt="${escapeHtml(author.name ? `${author.name} avatar` : 'Author avatar')}"><span class="avatar-fallback">${escapeHtml(author.initials)}</span></div>
        <div class="author-info">
          <div class="author-name-row">
            <div class="author-name">${escapeHtml(author.name)}</div>
            <div class="author-tag is-inline">${escapeHtml(author.tag)}</div>
          </div>
          <div class="author-handle">${escapeHtml(author.handle)}</div>
        </div>
        <div class="card-controls">
          <button class="view-toggle is-active" type="button" data-view-target="rewrite">${escapeHtml(labels.rewrite)}</button>
          <button class="view-toggle" type="button" data-view-target="original">${escapeHtml(labels.original)}</button>
        </div>
      </div>
      <div class="card-body">
        <div class="lang-col de">
          <div class="lang-label">${escapeHtml(card.germanLabel || 'Deutsch')}</div>
          <div class="content-shell">
            <div class="content-variant is-active" data-view="rewrite">
${indent(renderBlocks(card.de?.rewrite || []), 14)}
            </div>
            <div class="content-variant" data-view="original">
${indent(renderBlocks(card.de?.original || []), 14)}
            </div>
          </div>
        </div>
        <div class="lang-col en">
          <div class="lang-label">${escapeHtml(card.englishLabel || 'English')}</div>
          <div class="content-shell">
            <div class="content-variant is-active" data-view="rewrite">
${indent(renderBlocks(card.en?.rewrite || []), 14)}
            </div>
            <div class="content-variant" data-view="original">
${indent(renderBlocks(card.en?.original || []), 14)}
            </div>
          </div>
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
  const cards = (section.cards || [])
    .map((card) => renderCard(card, authorIdentities, avatarManifest, labels, outputPath))
    .join('\n\n');

  return `  <section class="section-header">
    <div class="section-label">${escapeHtml(section.label || formatThemeLabel(index))}</div>
    <h2 class="section-title">${escapeHtml(section.title || '')}</h2>
    <p class="section-desc">${escapeHtml(section.desc || '')}</p>
  </section>
  <section class="feed">
${cards}
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
    --ink: #1a1a1a;
    --paper: #f6f3ed;
    --accent: #c0392b;
    --accent-light: #e8d5c4;
    --border: #d4cdc0;
    --muted: #7a7265;
    --tag-bg: #e8e2d6;
    --en-bg: #ffffff;
    --de-bg: #faf7f2;
    --shadow: 0 2px 8px rgba(0,0,0,0.06);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: 'IBM Plex Sans', sans-serif;
    line-height: 1.7;
  }

  .masthead, .intro, .section-header, .feed, footer {
    max-width: 980px;
    margin: 0 auto;
    padding-left: 24px;
    padding-right: 24px;
  }

  .masthead { padding-top: 48px; }
  .masthead-rule { border: none; border-top: 3px solid var(--ink); margin: 0 0 12px; }
  .masthead-inner { display: flex; justify-content: center; gap: 16px; align-items: baseline; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
  .masthead-title { font-family: 'Playfair Display', serif; font-size: 34px; font-weight: 700; letter-spacing: -0.4px; }
  .masthead-subtitle { margin-top: 8px; padding-bottom: 10px; color: var(--muted); font-size: 13px; text-align: center; }

  .edition-strip {
    position: relative;
    margin-top: 8px;
    min-height: 46px;
    padding: 10px 132px 12px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.34);
    color: var(--muted);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.2px;
    text-align: center;
  }

  .edition-strip .edition-sep { margin: 0 8px; color: #b8ae9f; }
  .edition-strip-text { display: block; }
  .edition-return-link { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border: 1px dashed rgba(192, 57, 43, 0.55); border-radius: 999px; color: var(--accent); text-decoration: none; font-size: 12px; line-height: 1; letter-spacing: 0.06em; background: rgba(255, 255, 255, 0.45); transition: background 160ms ease, border-color 160ms ease, transform 160ms ease; }
  .edition-return-link:hover, .edition-return-link:focus-visible { background: rgba(255, 255, 255, 0.82); border-color: var(--accent); transform: translateY(-50%) translateX(-1px); }
  .edition-return-link:focus-visible { outline: none; }
  .intro { padding-top: 22px; }
  .intro-inner { max-width: 920px; margin: 0 auto; padding: 0 0 0 18px; border-left: 3px solid #d9cdbc; }
  .intro-kicker { margin: 0 0 8px; color: var(--accent); font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; }
  .intro p { margin: 0; max-width: none; color: var(--muted); font-size: clamp(15px, 1.6vw, 16px); line-height: 1.9; text-wrap: pretty; font-family: 'Crimson Text', 'Georgia', serif; overflow-wrap: anywhere; }

  .section-header { margin-top: 40px; }
  .section-label { font-family: 'IBM Plex Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--accent); margin-bottom: 4px; }
  .section-title { font-family: 'Playfair Display', serif; font-size: 24px; margin: 0 0 6px; }
  .section-desc { margin: 0 0 18px; color: var(--muted); font-size: 14px; }

  .feed { display: flex; flex-direction: column; gap: 20px; }
  .card { background: var(--en-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; box-shadow: var(--shadow); }
  .card-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px 12px; border-bottom: 1px solid #eee7dd; flex-wrap: wrap; }
  .avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--accent-light); color: var(--accent); display: flex; align-items: center; justify-content: center; font-family: 'Playfair Display', serif; font-weight: 700; flex-shrink: 0; overflow: hidden; }
  .avatar img { width: 100%; height: 100%; display: block; object-fit: cover; }
  .avatar-fallback { display: none; align-items: center; justify-content: center; width: 100%; height: 100%; }
  .avatar.is-fallback img { display: none; }
  .avatar.is-fallback .avatar-fallback { display: flex; }

  .author-info { flex: 1; min-width: 160px; }
  .author-name { font-weight: 600; font-size: 15px; }
  .author-name-row { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .author-handle { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted); }
  .author-tag { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; background: var(--tag-bg); color: var(--muted); padding: 4px 8px; border-radius: 999px; }
  .author-tag.is-inline { padding: 3px 8px; }

  .card-controls { margin-left: auto; display: inline-flex; gap: 8px; }
  .view-toggle { border: 1px solid var(--border); background: transparent; color: var(--muted); padding: 6px 10px; border-radius: 999px; font-size: 12px; line-height: 1; cursor: pointer; font-family: 'IBM Plex Mono', monospace; transition: all 160ms ease; }
  .view-toggle.is-active { background: var(--ink); color: #fff; border-color: var(--ink); }

  .card-body { display: grid; grid-template-columns: 1fr 1fr; }
  .lang-col { padding: 18px 20px 22px; }
  .lang-col.de { background: var(--de-bg); border-right: 1px solid #f0ece4; font-family: 'Crimson Text', 'Georgia', serif; }
  .lang-col.en { background: var(--en-bg); }
  .lang-label { margin-bottom: 10px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); }
  .content-shell { position: relative; transition: height 220ms cubic-bezier(0.22, 1, 0.36, 1); }
  .content-variant { position: absolute; inset: 0; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(4px); transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms; will-change: opacity, transform; }
  .content-variant.is-active { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1), transform 200ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 0s; }
  .content-variant p, .content-variant li { margin: 0 0 12px; font-size: 14px; }
  .content-variant ol { margin: 0 0 12px 20px; padding: 0; }
  .inline-code { display: inline-block; font-family: 'IBM Plex Mono', monospace; background: #f4efe7; padding: 3px 6px; border-radius: 6px; margin-bottom: 8px; }

  .card-footer { padding: 12px 20px 16px; border-top: 1px solid #eee7dd; background: #fcfaf6; }
  .card-footer a { color: var(--accent); text-decoration: none; font-size: 14px; }
  footer { padding-top: 24px; padding-bottom: 48px; color: var(--muted); font-size: 13px; }

  @media (max-width: 680px) {
    .masthead-inner { align-items: center; }
    .edition-strip { padding-right: 12px; padding-left: 12px; }
    .edition-strip-text { padding-right: 0; }
    .edition-return-link { position: static; transform: none; margin-top: 8px; font-size: 11px; }
    .card-controls { margin-left: 0; }
    .card-body { grid-template-columns: 1fr; }
    .lang-col.de { border-right: none; border-bottom: 1px solid #f0ece4; }
    .edition-strip .edition-sep { margin: 0 5px; }
    .intro-inner { padding-left: 14px; }
    .intro p { line-height: 1.84; }
  }
</style>
</head>
<body data-publish-date="${escapeHtml(publishDate)}" data-issue-number="${escapeHtml(issueNumber)}" data-edition-name="${escapeHtml(editionName)}" data-view-label-rewrite="${escapeHtml(labels.rewrite)}" data-view-label-original="${escapeHtml(labels.original)}" data-author-identities-path="${escapeHtml(AUTHOR_IDENTITIES_PATH)}" data-avatar-manifest-path="${escapeHtml(AVATAR_MANIFEST_PATH)}">
  <header class="masthead">
    <hr class="masthead-rule">
    <div class="masthead-inner">
      <div class="masthead-title">${escapeHtml(title)}</div>
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
    function getTemplateAuthorSources() {
      const sources = window.AI_BUILDERS_TEMPLATE_SOURCES || {};
      return { identities: sources.identities || {}, avatars: sources.avatars || {} };
    }

    function getAuthorInitials(name) {
      return (name || '').split(/\\s+/).filter(Boolean).slice(0, 2).map(function(part) { return part[0]; }).join('').toUpperCase();
    }

    function hydrateTemplateCopy() {
      const intro = document.querySelector('.intro');
      if (intro) {
        const kicker = intro.querySelector('.intro-kicker');
        const copy = intro.querySelector('.intro-copy');
        if (kicker) kicker.textContent = intro.dataset.kicker || '';
        if (copy) copy.textContent = intro.dataset.text || '';
      }

      const footer = document.querySelector('footer');
      if (footer) footer.textContent = footer.dataset.sourceNote || '';

      const rewriteLabel = document.body.dataset.viewLabelRewrite || 'Kurz';
      const originalLabel = document.body.dataset.viewLabelOriginal || 'Original';
      document.querySelectorAll('.view-toggle').forEach(function(button) {
        if (button.dataset.viewTarget === 'rewrite') button.textContent = rewriteLabel;
        if (button.dataset.viewTarget === 'original') button.textContent = originalLabel;
      });
    }

    function hydrateAuthorMeta() {
      const sources = getTemplateAuthorSources();
      document.querySelectorAll('.card').forEach(function(card) {
        const authorKey = card.dataset.authorKey || '';
        const identity = sources.identities[authorKey] || {};
        const avatarEntry = sources.avatars[authorKey] || {};

        const name = identity.name || card.dataset.authorName || '';
        const rawHandle = identity.handle || card.dataset.authorHandle || '';
        const handle = rawHandle && rawHandle.startsWith('@') ? rawHandle : (rawHandle ? '@' + rawHandle : '');
        const tag = identity.label || card.dataset.authorTag || '';
        const avatar = avatarEntry.fileUrl || avatarEntry.localPath || card.dataset.authorAvatar || '';

        const nameNode = card.querySelector('.author-name');
        const tagNode = card.querySelector('.author-tag');
        const handleNode = card.querySelector('.author-handle');
        const avatarNode = card.querySelector('.avatar');
        const avatarImg = card.querySelector('.avatar img');
        const avatarFallback = card.querySelector('.avatar-fallback');

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
      const publishDate = document.body.dataset.publishDate;
      const editionName = document.body.dataset.editionName || 'DE+EN Ausgabe';
      const editionStrip = document.getElementById('edition-strip-text');
      if (!publishDate || !editionStrip) return;

      const issueNumber = document.body.dataset.issueNumber || '';
      if (!issueNumber) return;

      const selectedCount = document.querySelectorAll('.card').length;
      const authorCount = new Set([].slice.call(document.querySelectorAll('.author-handle')).map(function(node) { return node.textContent.trim(); }).filter(Boolean)).size;
      const themeCount = document.querySelectorAll('.section-header').length;
      const parts = ['Nr. ' + issueNumber, publishDate, editionName, selectedCount + ' Beiträge', authorCount + ' Autoren', themeCount + ' Themen'];
      editionStrip.innerHTML = parts.map(function(part) { return '<span class="edition-item">' + part + '</span>'; }).join('<span class="edition-sep">|</span>');
    }

    function measureVariantHeight(variant) {
      const prevPosition = variant.style.position;
      const prevInset = variant.style.inset;
      const prevVisibility = variant.style.visibility;
      const prevPointerEvents = variant.style.pointerEvents;
      const prevOpacity = variant.style.opacity;
      const prevTransform = variant.style.transform;
      const prevTransition = variant.style.transition;
      const prevOverflowY = variant.style.overflowY;
      const prevDisplay = variant.style.display;

      variant.style.position = 'relative';
      variant.style.inset = 'auto';
      variant.style.visibility = 'hidden';
      variant.style.pointerEvents = 'none';
      variant.style.opacity = '1';
      variant.style.transform = 'none';
      variant.style.transition = 'none';
      variant.style.overflowY = 'visible';
      variant.style.display = 'block';

      const height = variant.scrollHeight;

      variant.style.position = prevPosition;
      variant.style.inset = prevInset;
      variant.style.visibility = prevVisibility;
      variant.style.pointerEvents = prevPointerEvents;
      variant.style.opacity = prevOpacity;
      variant.style.transform = prevTransform;
      variant.style.transition = prevTransition;
      variant.style.overflowY = prevOverflowY;
      variant.style.display = prevDisplay;

      return Math.ceil(height);
    }

    function getTargetHeight(shell, target) {
      const variant = shell.querySelector('.content-variant[data-view="' + target + '"]');
      return measureVariantHeight(variant);
    }

    function syncShellHeights() {
      document.querySelectorAll('.content-shell').forEach(function(shell) {
        const active = shell.querySelector('.content-variant.is-active');
        const target = active ? active.dataset.view : 'rewrite';
        shell.style.height = getTargetHeight(shell, target) + 'px';
      });
    }

    let resizeTimer = null;
    window.addEventListener('resize', function() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(syncShellHeights, 120);
    });

    document.querySelectorAll('.card').forEach(function(card) {
      const buttons = card.querySelectorAll('.view-toggle');
      const shells = card.querySelectorAll('.content-shell');

      buttons.forEach(function(button) {
        button.addEventListener('click', function() {
          const target = button.dataset.viewTarget;
          if (button.classList.contains('is-active')) return;

          buttons.forEach(function(btn) {
            btn.classList.toggle('is-active', btn === button);
          });

          shells.forEach(function(shell) {
            const current = shell.querySelector('.content-variant.is-active');
            const next = shell.querySelector('.content-variant[data-view="' + target + '"]');
            if (!current || !next || current === next) return;

            shell.style.height = shell.offsetHeight + 'px';
            requestAnimationFrame(function() {
              current.classList.remove('is-active');
              next.classList.add('is-active');
              shell.style.height = getTargetHeight(shell, target) + 'px';
            });
          });
        });
      });
    });

    hydrateTemplateCopy();
    hydrateAuthorMeta();
    updateEditionStrip();
    syncShellHeights();
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

  const authorIdentities = loadEntries(AUTHOR_IDENTITIES_PATH);
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
