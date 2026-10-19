#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'avatar-manifest.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'assets', 'avatars');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Avatar manifest not found: ${MANIFEST_PATH}`);
  }

  const manifest = readJson(MANIFEST_PATH);
  const entries = manifest.entries || {};
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let copied = 0;
  Object.values(entries).forEach((entry) => {
    const raw = entry.localPath || '';
    if (!raw) return;
    const source = path.isAbsolute(raw) ? raw : path.join(REPO_ROOT, raw);
    if (!fs.existsSync(source)) return;

    const fileName = path.basename(source);
    const dest = path.join(OUTPUT_DIR, fileName);
    if (path.resolve(source) === path.resolve(dest)) return;

    fs.copyFileSync(source, dest);
    copied += 1;
  });

  console.log(`Synced ${copied} avatars to ${OUTPUT_DIR}`);
}

main();
