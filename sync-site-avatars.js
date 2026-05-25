#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const MANIFEST_PATH = path.join(os.homedir(), '.follow-builders/assets/avatar-manifest.json');
const OUTPUT_DIR = path.join(__dirname, 'assets', 'avatars');

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
    const source = entry.localPath || '';
    if (!source || !fs.existsSync(source)) return;

    const fileName = path.basename(source);
    fs.copyFileSync(source, path.join(OUTPUT_DIR, fileName));
    copied += 1;
  });

  console.log(`Synced ${copied} avatars to ${OUTPUT_DIR}`);
}

main();
