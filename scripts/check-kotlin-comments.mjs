#!/usr/bin/env node
/**
 * Guards against the Kotlin "nested block comment" footgun.
 *
 * Kotlin block comments nest, so a comment that itself contains an opening
 * block-comment token (for example a URL ending in "login" immediately followed
 * by the opening token) opens another level and silently swallows the code that
 * follows. This script fails the build when a .kt file ends with an unbalanced
 * block comment, and warns on nested block comments.
 *
 * Usage: node scripts/check-kotlin-comments.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'android';
const SKIP = new Set(['build', '.gradle', 'node_modules']);

function walk(dir, acc = []) {
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
    if (dir.endsWith('.kt')) acc.push(dir);
    return acc;
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.kt')) acc.push(p);
  }
  return acc;
}

let problems = 0;
const files = walk(ROOT);
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let i = 0;
  let line = 1;
  let blockDepth = 0;
  const nested = [];
  let inStr = false;
  let inChr = false;
  let inLine = false;
  let inRaw = false;
  let esc = false;

  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '\n') {
      line++;
      inLine = false;
      i++;
      continue;
    }
    if (inLine) {
      i++;
      continue;
    }
    if (blockDepth > 0) {
      if (c === '/' && n === '*') {
        blockDepth++;
        nested.push(line);
        i += 2;
        continue;
      }
      if (c === '*' && n === '/') {
        blockDepth--;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inRaw) {
      if (c === '"' && n === '"' && s[i + 2] === '"') {
        inRaw = false;
        i += 3;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (inChr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === "'") inChr = false;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i += 2;
      continue;
    }
    if (c === '/' && n === '*') {
      blockDepth = 1;
      i += 2;
      continue;
    }
    if (c === '"' && n === '"' && s[i + 2] === '"') {
      inRaw = true;
      i += 3;
      continue;
    }
    if (c === '"') {
      inStr = true;
      i++;
      continue;
    }
    if (c === "'") {
      inChr = true;
      i++;
      continue;
    }
    i++;
  }

  if (blockDepth !== 0) {
    console.error(`ERROR ${f}: unbalanced block comment (depth ${blockDepth} at EOF).`);
    problems++;
  }
  if (nested.length) {
    // Kotlin nests block comments, so an opening token inside a comment silently
    // swallows the code that follows. Treat this as an error (see header).
    console.error(
      `ERROR ${f}: nested block comment at line(s) ${nested.join(', ')} — remove the inner block-comment token.`
    );
    problems++;
  }
}

if (problems > 0) {
  console.error(`\n${problems} Kotlin comment problem(s) found.`);
  process.exit(1);
}
console.log(`Kotlin comment check passed (${files.length} file(s)).`);
