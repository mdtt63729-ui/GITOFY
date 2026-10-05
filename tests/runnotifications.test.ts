/**
 * Run-notification tests.
 * Run via: npm test
 *
 * The one behaviour that matters: a single run is announced at most once, no
 * matter how many times a poll re-reports the same completion.
 */
import assert from 'node:assert';
import { notifyRunFinished } from '../src/utils/runNotifications';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${(err as Error)?.message ?? err}`); }
}

test('a run is only announced once', () => {
  const info = { runId: 900001, workflowName: 'CI', repoName: 'me/app', conclusion: 'success' };
  notifyRunFinished(info);
  // The second call must be a no-op — this is what stops a poll loop spamming.
  assert.strictEqual(notifyRunFinished(info), false);
});

test('a different run is announced separately', () => {
  notifyRunFinished({ runId: 900002, workflowName: 'CI', repoName: 'me/app', conclusion: 'failure' });
  assert.strictEqual(notifyRunFinished({ runId: 900002, workflowName: 'CI', repoName: 'me/app', conclusion: 'failure' }), false);
});

test('an unknown conclusion still resolves to a sentence', () => {
  notifyRunFinished({ runId: 900003, workflowName: 'Deploy', repoName: 'me/app', conclusion: null });
  assert.strictEqual(notifyRunFinished({ runId: 900003, workflowName: 'Deploy', repoName: 'me/app', conclusion: null }), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
