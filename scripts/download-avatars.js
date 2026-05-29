#!/usr/bin/env node
// ============================================================================
// AI Builders Digest — Avatar Downloader
// ============================================================================
// Downloads author avatars from free sources (no API key required):
//   - X/Twitter: unavatar.io (resolves profile images)
//   - Podcasts: RSS feed <image> / <itunes:image>
//   - Blogs: favicon / site logo
//
// Usage:
//   node scripts/download-avatars.js
//   node scripts/download-avatars.js --dry-run
// ============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

// -- Constants ---------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');
const FOLLOW_BUILDERS_ASSETS = path.join(os.homedir(), '.follow-builders', 'assets');
const AVATARS_DIR = path.join(FOLLOW_BUILDERS_ASSETS, 'avatars');
const MANIFEST_PATH = path.join(FOLLOW_BUILDERS_ASSETS, 'avatar-manifest.json');
const IDENTITIES_PATH = path.join(FOLLOW_BUILDERS_ASSETS, 'author-identities.json');
const SOURCES_PATH = path.join(REPO_ROOT, 'config', 'sources.json');

// Avatar size to request (unavatar supports size param)
const AVATAR_SIZE = 96;

// -- Helpers -----------------------------------------------------------------

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function downloadFile(url, destPath) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    // Verify it's an image (check magic bytes)
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isJPG = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49;
    const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isICO = buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00;
    if (!isPNG && !isJPG && !isGIF && !isWebP && !isICO) {
      // Might be SVG
      const header = buffer.toString('utf8', 0, 10).toLowerCase();
      if (!header.includes('<svg') && !header.includes('<?xml')) {
        fs.unlinkSync(destPath); // Remove non-image file
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// -- X/Twitter avatars via unavatar.io ---------------------------------------

async function downloadXAvatars(identities, dryRun) {
  const results = {};
  const entries = identities.entries || {};

  for (const [key, identity] of Object.entries(entries)) {
    if (!key.startsWith('x:')) continue;

    const handle = (identity.handle || '').replace('@', '');
    if (!handle) {
      console.error(`  ${key}: no handle, skipping`);
      continue;
    }

    const fileName = `x-${handle}.jpg`;
    const destPath = path.join(AVATARS_DIR, fileName);

    // unavatar.io resolves Twitter profile images for free
    const url = `https://unavatar.io/twitter/${handle}?size=${AVATAR_SIZE}`;

    if (dryRun) {
      console.error(`  [DRY RUN] ${key} (@${handle}): ${url} → ${fileName}`);
      results[key] = { localPath: destPath, fileUrl: url, source: 'unavatar.io' };
      continue;
    }

    console.error(`  ${key} (@${handle}): downloading...`);
    const ok = await downloadFile(url, destPath);
    if (ok) {
      console.error(`    ✓ saved: ${fileName}`);
      results[key] = { localPath: destPath, fileUrl: url, source: 'unavatar.io' };
    } else {
      console.error(`    ✗ failed, will use fallback initials`);
    }
  }

  return results;
}

// -- Podcast channel art from RSS --------------------------------------------

async function downloadPodcastAvatars(sources, dryRun) {
  const results = {};
  const podcasts = sources.podcasts || [];

  for (const podcast of podcasts) {
    const key = `podcast:${podcast.name}`;
    const slug = slugify(podcast.name);
    const fileName = `podcast-${slug}.jpg`;
    const destPath = path.join(AVATARS_DIR, fileName);

    if (dryRun) {
      console.error(`  [DRY RUN] ${key}: RSS feed → ${fileName}`);
      results[key] = { localPath: destPath, source: 'rss-feed' };
      continue;
    }

    console.error(`  ${key}: fetching RSS feed for channel image...`);

    let imageUrl = null;

    // Try to get <itunes:image> or <image> from RSS
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(podcast.rssUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const xml = await res.text();

        // Try itunes:image href attribute
        let match = xml.match(/<itunes:image[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
        if (match) imageUrl = match[1];

        // Fallback to <image><url>
        if (!imageUrl) {
          match = xml.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/i);
          if (match) imageUrl = match[1].trim();
        }

        // Fallback to channel <link> for YouTube (will get avatar from page scrape)
        if (!imageUrl) {
          match = xml.match(/<link>([^<]+)<\/link>/i);
          if (match) {
            const link = match[1].trim();
            // YouTube channel — try favicon from channel page
            if (link.includes('youtube.com') || link.includes('youtu.be')) {
              imageUrl = null; // Can't easily get channel avatar from RSS
            }
          }
        }
      }
    } catch (err) {
      console.error(`    RSS fetch warning: ${err.message}`);
    }

    if (imageUrl) {
      const ok = await downloadFile(imageUrl, destPath);
      if (ok) {
        console.error(`    ✓ saved: ${fileName}`);
        results[key] = { localPath: destPath, fileUrl: imageUrl, source: 'rss-feed' };
        continue;
      }
    }

    console.error(`    ✗ no image found in RSS, will use fallback initials`);
  }

  return results;
}

// -- Blog favicons -----------------------------------------------------------

async function downloadBlogAvatars(sources, dryRun) {
  const results = {};
  const blogs = sources.blogs || [];

  for (const blog of blogs) {
    const key = `blog:${blog.name}`;
    const slug = slugify(blog.name);
    const fileName = `blog-${slug}.jpg`;
    const destPath = path.join(AVATARS_DIR, fileName);

    if (dryRun) {
      console.error(`  [DRY RUN] ${key}: favicon → ${fileName}`);
      results[key] = { localPath: destPath, source: 'favicon' };
      continue;
    }

    console.error(`  ${key}: fetching favicon...`);

    // Try common favicon patterns
    const baseUrl = blog.indexUrl || `https://${blog.articleBaseUrl}`;
    let origin;
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      console.error(`    ✗ invalid base URL`);
      continue;
    }

    const faviconCandidates = [
      `${origin}/favicon.ico`,
      `${origin}/favicon.png`,
      `${origin}/favicon-32x32.png`,
      `${origin}/apple-touch-icon.png`,
    ];

    let downloaded = false;
    for (const favUrl of faviconCandidates) {
      if (downloaded) break;
      try {
        const ok = await downloadFile(favUrl, destPath);
        if (ok) {
          console.error(`    ✓ saved: ${fileName} (from ${path.basename(new URL(favUrl).pathname)})`);
          results[key] = { localPath: destPath, fileUrl: favUrl, source: 'favicon' };
          downloaded = true;
        }
      } catch {
        // try next candidate
      }
    }

    if (!downloaded) {
      // Try to scrape favicon from HTML
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(blog.indexUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const html = await res.text();
          const match = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i)
                     || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i);
          if (match) {
            let iconUrl = match[1];
            if (iconUrl.startsWith('/')) iconUrl = origin + iconUrl;
            else if (!iconUrl.startsWith('http')) iconUrl = blog.indexUrl.replace(/\/$/, '') + '/' + iconUrl;
            const ok = await downloadFile(iconUrl, destPath);
            if (ok) {
              console.error(`    ✓ saved: ${fileName} (from HTML scrape)`);
              results[key] = { localPath: destPath, fileUrl: iconUrl, source: 'favicon-scrape' };
              downloaded = true;
            }
          }
        }
      } catch {
        // give up
      }
    }

    if (!downloaded) {
      console.error(`    ✗ no favicon found, will use fallback initials`);
    }
  }

  return results;
}

// -- Main --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.error('=== AI Builders Digest — Avatar Downloader ===');
  console.error(`Mode: ${dryRun ? 'DRY RUN' : 'DOWNLOAD'}`);
  console.error('');

  ensureDir(AVATARS_DIR);

  // Load current data
  const identities = readJson(IDENTITIES_PATH);
  const sources = readJson(SOURCES_PATH);
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? readJson(MANIFEST_PATH)
    : { entries: {} };

  // 1. Download X/Twitter avatars
  console.error('[1/3] X/Twitter authors...');
  const xResults = await downloadXAvatars(identities, dryRun);

  // 2. Download podcast channel art
  console.error('[2/3] Podcast channel art...');
  const podcastResults = await downloadPodcastAvatars(sources, dryRun);

  // 3. Download blog favicons
  console.error('[3/3] Blog favicons...');
  const blogResults = await downloadBlogAvatars(sources, dryRun);

  // Merge all results into manifest
  const allResults = { ...xResults, ...podcastResults, ...blogResults };
  manifest.entries = { ...manifest.entries, ...allResults };
  manifest.updatedAt = new Date().toISOString();
  manifest.avatarCount = Object.keys(manifest.entries).length;

  if (dryRun) {
    console.error('');
    console.error('=== DRY RUN SUMMARY ===');
    console.error(`Would create/update ${Object.keys(allResults).length} avatar entries`);
    console.error(JSON.stringify(allResults, null, 2));
  } else {
    // Save manifest
    writeJson(MANIFEST_PATH, manifest);
    console.error('');
    console.error(`✓ Manifest saved: ${MANIFEST_PATH}`);
    console.error(`  Total entries: ${manifest.avatarCount}`);

    // List files in avatars dir
    const files = fs.readdirSync(AVATARS_DIR).filter(f => /\.(jpg|png|gif|webp|svg)$/i.test(f));
    console.error(`  Avatar files: ${files.length}`);
    files.forEach(f => console.error(`    - ${f}`));
  }

  console.error('');
  console.error('Done! Run `node sync-site-avatars.js` to copy avatars to the project.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
