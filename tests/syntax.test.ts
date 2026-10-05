/**
 * Syntax highlighter tests.
 * Run via: npm test
 *
 * The hard requirement is that highlighting never changes the text: joining
 * every token back together must reproduce the input byte for byte, for every
 * language. Anything else would silently corrupt what the user is reading.
 */
import assert from 'node:assert';
import { tokenize, tokensToLines, languageFromPath, type SyntaxLang } from '../src/utils/syntax';

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

const SAMPLES: Record<string, string> = {
  javascript: `// greet\nconst x = "hi\\" there";\nfunction f(a) { return a + 1; } /* block */\n`,
  typescript: `interface P { a?: number }\nexport const y: P = { a: 1 };\n`,
  json: `{ "a": 1, "b": [true, false, null], "c": "s" }\n`,
  python: `def f(x):\n    # comment\n    return "a" + str(x)\n'''doc'''\n`,
  kotlin: `fun main() {\n    val s = "x"\n    // note\n    println(s)\n}\n`,
  java: `public class A { /* c */ int x = 1; }\n`,
  c: `#include <stdio.h>\nint main(void) { printf("hi"); return 0; }\n`,
  css: `/* c */ .a { color: red; content: "x"; }\n`,
  html: `<!DOCTYPE html>\n<!-- c --><div class="a" id='b'>text &amp; more</div>\n`,
  markdown: `# Title\n\nSome **bold** and \`code\` and [link](http://x).\n\n- item\n`,
  shell: `#!/bin/bash\n# c\nif [ -f "$f" ]; then echo 'yes'; fi\n`,
  yaml: `# c\nkey: "value"\nlist:\n  - a\n  - b\n`,
  go: `package main\n// c\nfunc main() { println("x") }\n`,
  rust: `// c\nfn main() { let s = "x"; println!("{}", s); }\n`,
  sql: `-- c\nSELECT * FROM t WHERE a = 'x' AND b = 1;\n`,
  ruby: `# c\ndef f(x)\n  "a"\nend\n`,
  php: `<?php\n// c\nfunction f() { return "x"; }\n`,
};

test('languageFromPath maps extensions', () => {
  assert.strictEqual(languageFromPath('a/b/main.kt'), 'kotlin');
  assert.strictEqual(languageFromPath('x.tsx'), 'typescript');
  assert.strictEqual(languageFromPath('README.md'), 'markdown');
  assert.strictEqual(languageFromPath('workflow.yml'), 'yaml');
  assert.strictEqual(languageFromPath('Dockerfile'), 'shell');
  assert.strictEqual(languageFromPath('weird.qqq'), 'plain');
  assert.strictEqual(languageFromPath('noext'), 'plain');
});

for (const [lang, code] of Object.entries(SAMPLES)) {
  test(`round-trips exactly: ${lang}`, () => {
    const joined = tokenize(code, lang as SyntaxLang).map((t) => t.text).join('');
    assert.strictEqual(joined, code);
  });

  test(`lines rebuild the file exactly: ${lang}`, () => {
    const lines = tokensToLines(tokenize(code, lang as SyntaxLang));
    const rebuilt = lines.map((l) => l.map((t) => t.text).join('')).join('\n');
    assert.strictEqual(rebuilt, code);
    assert.strictEqual(lines.length, code.split('\n').length);
  });
}

test('recognises keywords, strings and comments in JS', () => {
  const toks = tokenize('const a = "s"; // hi', 'javascript');
  assert.ok(toks.some((t) => t.type === 'keyword' && t.text === 'const'));
  assert.ok(toks.some((t) => t.type === 'string' && t.text === '"s"'));
  assert.ok(toks.some((t) => t.type === 'comment' && t.text === '// hi'));
});

test('a block comment spanning lines is one token', () => {
  const toks = tokenize('a /* one\ntwo */ b', 'javascript');
  const c = toks.find((t) => t.type === 'comment');
  assert.strictEqual(c?.text, '/* one\ntwo */');
});

test('an unterminated string still round-trips', () => {
  const code = 'const a = "never closed\nmore';
  assert.strictEqual(tokenize(code, 'javascript').map((t) => t.text).join(''), code);
});

test('plain text is left completely alone', () => {
  const code = 'just some words\nand more';
  const toks = tokenize(code, 'plain');
  assert.strictEqual(toks.length, 1);
  assert.strictEqual(toks[0].text, code);
});

test('an empty file produces one empty line', () => {
  const lines = tokensToLines(tokenize('', 'javascript'));
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(lines[0], []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
