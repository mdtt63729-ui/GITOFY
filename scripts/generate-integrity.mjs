#!/usr/bin/env node
/**
 * Generates a build-integrity manifest for the web bundle.
 *
 * Walks the built output (default: dist/), computes a SHA-256 for every file
 * except the manifest itself, and writes integrity.json:
 *
 *   { "generatedAt": <epoch ms>, "root": "<sha256>", "files": { "<path>": "<sha256>", ... } }
 *
 * `root` is sha256 of the newline-joined "path:sha256" lines of the files sorted
 * by path — the exact algorithm the runtime verifier uses. The CI then copies
 * `root` into android/app/src/main/res/raw/integrity_root.txt so the native
 * layer carries an anchor the web layer cannot rewrite on its own.
 *
 * Usage: node scripts/generate-integrity.mjs [dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.argv[2] || 'dist';
const MANIFEST = 'integrity.json';

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, acc);
    else acc.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return acc;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function computeRoot(files) {
  const lines = Object.keys(files)
    .sort()
    .map((p) => `${p}:${files[p]}`);
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

if (!fs.existsSync(ROOT)) {
  console.error(`generate-integrity: "${ROOT}" does not exist. Run the build first.`);
  process.exit(1);
}

const files = {};
for (const rel of walk(ROOT)) {
  if (rel === MANIFEST) continue;
  files[rel] = sha256File(path.join(ROOT, rel));
}

const root = computeRoot(files);
const manifest = { generatedAt: Date.now(), root, files };
fs.writeFileSync(path.join(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');

console.log(`generate-integrity: ${Object.keys(files).length} file(s), root=${root}`);
