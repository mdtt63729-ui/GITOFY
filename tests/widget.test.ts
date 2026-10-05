/**
 * Home-screen widget summary tests.
 * Run via: npm test
 */
import assert from 'node:assert';
import { summariseRepos, describeRun } from '../src/utils/widget';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${(err as Error)?.message ?? err}`); }
}

test('counts repositories and private ones', () => {
  const s = summariseRepos([{ private: true }, { private: false }, { private: true }, {}]);
  assert.strictEqual(s.repos, 4);
  assert.strictEqual(s.private, 2);
});

test('an empty list is all zeros', () => {
  assert.deepStrictEqual(summariseRepos([]), { repos: 0, private: 0 });
});

test('describes a successful run', () => {
  assert.strictEqual(describeRun('CI', 'success', 42), 'CI #42 succeeded');
});

test('describes a failed run without a number', () => {
  assert.strictEqual(describeRun('Deploy', 'failure'), 'Deploy failed');
});

test('an unknown conclusion still reads sensibly', () => {
  assert.strictEqual(describeRun('CI', null), 'CI finished');
  assert.strictEqual(describeRun('CI', 'weird'), 'CI finished');
});

test('cancelled and timed out are named', () => {
  assert.strictEqual(describeRun('CI', 'cancelled'), 'CI cancelled');
  assert.strictEqual(describeRun('CI', 'timed_out'), 'CI timed out');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
