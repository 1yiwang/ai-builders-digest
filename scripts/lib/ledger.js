const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function makeRunId(prefix = 'digest') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${stamp}-${suffix}`;
}

function appendJsonl(filePath, rows) {
  const values = Array.isArray(rows) ? rows : [rows];
  const clean = values.filter(Boolean);
  if (clean.length === 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(
    filePath,
    clean.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8'
  );
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

module.exports = {
  makeRunId,
  appendJsonl,
  sha256,
};
