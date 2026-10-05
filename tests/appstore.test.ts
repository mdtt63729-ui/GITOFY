/**
 * App Store tests: the wave maths, the repository→app mapping, and the
 * library/search-history round trip.
 * Run via: npm test
 */
import assert from 'node:assert';
import { amplitudeFor, wavyArcPath, firstPointRadius, RING_RADIUS } from '../src/utils/wave';
import { myReposAsApps, formatAppSize, getLibrary, addToLibrary, removeFromLibrary, getHistory, pushHistory, clearHistory } from '../src/utils/appStore';

/* A tiny localStorage so the persistence paths are actually exercised. */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${(err as Error)?.message ?? err}`); }
}

/* ------------------------------- the wave ------------------------------- */

test('the ring is perfectly plain below 10% and above 90%', () => {
  assert.strictEqual(amplitudeFor(0), 0);
  assert.strictEqual(amplitudeFor(0.05), 0);
  assert.strictEqual(amplitudeFor(0.10), 0);
  assert.strictEqual(amplitudeFor(0.90), 0);
  assert.strictEqual(amplitudeFor(0.95), 0);
  assert.strictEqual(amplitudeFor(1), 0);
});

test('the wave peaks in the middle of the download', () => {
  assert.ok(amplitudeFor(0.5) > 2, `expected a full wave at 50%, got ${amplitudeFor(0.5)}`);
  assert.ok(amplitudeFor(0.5) >= amplitudeFor(0.25));
  assert.ok(amplitudeFor(0.5) >= amplitudeFor(0.75));
});

test('the amplitude ramps smoothly, never jumping', () => {
  let previous = 0;
  for (let p = 0; p <= 1.0001; p += 0.005) {
    const a = amplitudeFor(p);
    assert.ok(Math.abs(a - previous) < 0.2, `jump at ${p.toFixed(3)}: ${previous} -> ${a}`);
    previous = a;
  }
});

test('a plain arc is a true circle', () => {
  const r = firstPointRadius(0.5, 0, 0);
  assert.ok(r !== null && Math.abs(r - RING_RADIUS) < 0.02, `expected radius ${RING_RADIUS}, got ${r}`);
});

test('a wavy arc is displaced from the circle', () => {
  const r = firstPointRadius(0.5, 0, 2.6);
  assert.ok(r !== null && Math.abs(r - RING_RADIUS) > 0.05, `expected displacement, got ${r}`);
});

test('the arc grows with progress and is empty at zero', () => {
  assert.strictEqual(wavyArcPath(0, 0, 0), '');
  const quarter = wavyArcPath(0.25, 0, 0).length;
  const half = wavyArcPath(0.5, 0, 0).length;
  assert.ok(half > quarter);
});

test('the phase actually moves the wave', () => {
  assert.notStrictEqual(wavyArcPath(0.5, 0, 2.6), wavyArcPath(0.5, 1.2, 2.6));
});

/* --------------------------- repository → app --------------------------- */

const REPOS = [
  { full_name: 'me/muso', name: 'muso', description: 'Music player', owner: { login: 'me', avatar_url: 'a' } },
  { full_name: 'me/dhun', name: 'dhun', description: 'Radio', owner: { login: 'me', avatar_url: 'b' } },
  { full_name: 'me/notes', name: 'notes', description: 'Take notes', owner: { login: 'me', avatar_url: 'c' } },
];

test('my repos filter by name and description', () => {
  assert.strictEqual(myReposAsApps(REPOS, 'mus').length, 1);
  assert.strictEqual(myReposAsApps(REPOS, 'radio').length, 1);
  assert.strictEqual(myReposAsApps(REPOS, 'zzz').length, 0);
});

test('an empty query returns every repository', () => {
  assert.strictEqual(myReposAsApps(REPOS, '').length, 3);
});

test('the mapping keeps the id, owner and description', () => {
  const app = myReposAsApps(REPOS, 'muso')[0];
  assert.strictEqual(app.id, 'me/muso');
  assert.strictEqual(app.owner, 'me');
  assert.strictEqual(app.description, 'Music player');
});

/* ------------------------------- library ------------------------------- */

test('the library round-trips and removes', () => {
  assert.strictEqual(getLibrary().length, 0);
  addToLibrary({ id: 'me/muso', name: 'muso', owner: 'me', description: '', version: 'v1', apkName: 'a.apk', downloadedAt: 100, htmlUrl: '', ownerAvatar: '' });
  assert.strictEqual(getLibrary().length, 1);
  addToLibrary({ id: 'me/muso', name: 'muso', owner: 'me', description: '', version: 'v2', apkName: 'a.apk', downloadedAt: 200, htmlUrl: '', ownerAvatar: '' });
  assert.strictEqual(getLibrary().length, 1, 'a re-download must replace, not duplicate');
  assert.strictEqual(getLibrary()[0].version, 'v2');
  removeFromLibrary('me/muso');
  assert.strictEqual(getLibrary().length, 0);
});

test('the library sorts newest first', () => {
  addToLibrary({ id: 'a/b', name: 'b', owner: 'a', description: '', version: '', apkName: '', downloadedAt: 10, htmlUrl: '', ownerAvatar: '' });
  addToLibrary({ id: 'c/d', name: 'd', owner: 'c', description: '', version: '', apkName: '', downloadedAt: 99, htmlUrl: '', ownerAvatar: '' });
  assert.strictEqual(getLibrary()[0].id, 'c/d');
  removeFromLibrary('a/b'); removeFromLibrary('c/d');
});

/* ---------------------------- search history ---------------------------- */

test('history keeps the newest first and de-duplicates', () => {
  clearHistory();
  pushHistory('muso');
  pushHistory('dhun');
  pushHistory('muso');
  assert.deepStrictEqual(getHistory(), ['muso', 'dhun']);
});

test('history ignores a one-character query and can be cleared', () => {
  clearHistory();
  pushHistory('m');
  assert.strictEqual(getHistory().length, 0);
  pushHistory('muso');
  clearHistory();
  assert.strictEqual(getHistory().length, 0);
});

/* ------------------------------ formatting ------------------------------ */

test('sizes read the way a person would write them', () => {
  assert.strictEqual(formatAppSize(0), '');
  assert.strictEqual(formatAppSize(512), '512 B');
  assert.strictEqual(formatAppSize(2048), '2 KB');
  assert.strictEqual(formatAppSize(4 * 1024 * 1024), '4.0 MB');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
