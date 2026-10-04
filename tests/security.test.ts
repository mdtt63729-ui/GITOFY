/**
 * Security module tests (anti-tamper root + update versioning).
 * Run via: npm test
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import { computeRoot } from '../src/security/integrity';
import { compareVersions, isUpdateAvailable, parseVersion } from '../src/security/updater';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok  ${name}`);
    })
    .catch((err) => {
      failed++;
      console.error(`FAIL  ${name}\n      ${err?.message ?? err}`);
    });
}

async function main() {
  console.log('integrity root');
  await test('computeRoot matches the build generator algorithm (node:crypto)', async () => {
    const files: Record<string, string> = { 'index.html': 'aaa', 'assets/app.js': 'bbb', 'assets/app.css': 'ccc' };
    const lines = Object.keys(files)
      .sort()
      .map((p) => `${p}:${files[p]}`);
    const expected = crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
    const actual = await computeRoot(files);
    assert.strictEqual(actual, expected);
    assert.strictEqual(actual.length, 64);
  });

  await test('computeRoot is order-independent and changes on edit', async () => {
    const a = await computeRoot({ b: '2', a: '1' });
    const b = await computeRoot({ a: '1', b: '2' });
    const c = await computeRoot({ a: '1', b: 'X' });
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, c);
  });

  console.log('update versioning');
  await test('parseVersion handles v-prefix and suffixes', () => {
    assert.deepStrictEqual(parseVersion('v2.4.0'), [2, 4, 0]);
    assert.deepStrictEqual(parseVersion('2.4'), [2, 4]);
    assert.deepStrictEqual(parseVersion('1.2.3-beta'), [1, 2, 3, 0]);
  });

  await test('compareVersions orders numerically, not lexically', () => {
    assert.ok(compareVersions('2.10.0', '2.9.0') > 0);
    assert.ok(compareVersions('2.0.0', '2.0.1') < 0);
    assert.strictEqual(compareVersions('2.4.0', '2.4.0'), 0);
  });

  await test('isUpdateAvailable gates on a strictly newer version', () => {
    assert.strictEqual(isUpdateAvailable('2.4.0', '2.3.0'), true);
    assert.strictEqual(isUpdateAvailable('2.3.0', '2.3.0'), false);
    assert.strictEqual(isUpdateAvailable('1.0.0', '2.0.0'), false);
    assert.strictEqual(isUpdateAvailable('', '2.0.0'), false);
    assert.strictEqual(isUpdateAvailable('2.0.0', ''), false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
