/**
 * Deep-link parsing tests.
 * Run via: npm test
 *
 * The important behaviours: real repository links resolve, GitHub's own pages
 * (which look like /<owner>/<name> but are not) are rejected, and anything we
 * do not understand returns null so the caller can fall back to the browser.
 */
import assert from 'node:assert';
import { parseDeepLink, deepLinkKey } from '../src/utils/deepLinks';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(err as Error)?.message ?? err}`);
  }
}

test('parses the custom scheme', () => {
  const t = parseDeepLink('gitofy://repo/mdtt63729-ui/GITOFY');
  assert.strictEqual(t?.owner, 'mdtt63729-ui');
  assert.strictEqual(t?.name, 'GITOFY');
  assert.strictEqual(deepLinkKey(t!), 'mdtt63729-ui/gitofy');
});

test('parses a github.com repository url', () => {
  const t = parseDeepLink('https://github.com/octocat/Hello-World');
  assert.strictEqual(t?.owner, 'octocat');
  assert.strictEqual(t?.name, 'Hello-World');
});

test('parses a tree path with branch and file', () => {
  const t = parseDeepLink('gitofy://repo/octocat/Hello-World/tree/main/src/app.ts');
  assert.strictEqual(t?.branch, 'main');
  assert.strictEqual(t?.path, 'src/app.ts');
});

test('a trailing slash still works', () => {
  const t = parseDeepLink('https://github.com/octocat/Hello-World/');
  assert.strictEqual(t?.name, 'Hello-World');
});

test('the oauth callback is not a deep link', () => {
  assert.strictEqual(parseDeepLink('gitofy://callback?code=abc&state=xyz'), null);
});

test('github pages that are not repositories are rejected', () => {
  assert.strictEqual(parseDeepLink('https://github.com/settings/profile'), null);
  assert.strictEqual(parseDeepLink('https://github.com/notifications'), null);
  assert.strictEqual(parseDeepLink('https://github.com/orgs/foo'), null);
});

test('a bare github url is rejected', () => {
  assert.strictEqual(parseDeepLink('https://github.com/'), null);
  assert.strictEqual(parseDeepLink('https://github.com/octocat'), null);
});

test('other hosts and schemes are rejected', () => {
  assert.strictEqual(parseDeepLink('https://gitlab.com/a/b'), null);
  assert.strictEqual(parseDeepLink('http://example.com'), null);
  assert.strictEqual(parseDeepLink('javascript:alert(1)'), null);
});

test('junk input never throws', () => {
  assert.strictEqual(parseDeepLink(''), null);
  assert.strictEqual(parseDeepLink('not a url'), null);
  assert.strictEqual(parseDeepLink(null), null);
  assert.strictEqual(parseDeepLink(undefined), null);
  assert.strictEqual(parseDeepLink('gitofy://repo/'), null);
});

test('a name with unsafe characters is rejected', () => {
  assert.strictEqual(parseDeepLink('gitofy://repo/a/<script>'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
