/**
 * A small, dependency-free syntax highlighter.
 *
 * It tokenises the whole file once (so block comments and multi-line strings
 * stay correct across lines) and hands the caller a list of tokens per line.
 * The caller decides the colours, so this file stays free of React and of the
 * theme. It is deliberately conservative: anything it does not recognise is
 * emitted as plain text, never dropped.
 */

export type TokenType = 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'builtin' | 'function' | 'tag' | 'attr' | 'operator' | 'heading' | 'link';

export interface Token {
  type: TokenType;
  text: string;
}

export type SyntaxLang =
  | 'plain' | 'javascript' | 'typescript' | 'json' | 'python' | 'kotlin' | 'java'
  | 'c' | 'css' | 'html' | 'markdown' | 'shell' | 'yaml' | 'go' | 'rust' | 'sql' | 'ruby' | 'php';

const LANG_BY_EXT: Record<string, SyntaxLang> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json',
  py: 'python', pyw: 'python',
  kt: 'kotlin', kts: 'kotlin', java: 'java',
  c: 'c', h: 'c', cpp: 'c', cc: 'c', hpp: 'c', cs: 'c', m: 'c', mm: 'c',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html', vue: 'html',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ps1: 'shell',
  yml: 'yaml', yaml: 'yaml',
  go: 'go', rs: 'rust', sql: 'sql', rb: 'ruby', php: 'php',
};

export function languageFromPath(path: string): SyntaxLang {
  const base = path.split('/').pop() ?? '';
  const lower = base.toLowerCase();
  if (lower === 'dockerfile' || lower === 'makefile') return 'shell';
  const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
  return LANG_BY_EXT[ext] ?? 'plain';
}

/** What the highlighter needs to know about one language. */
interface LangSpec {
  lineComment: string[];
  blockComment?: [string, string];
  strings: { open: string; close: string; escape?: boolean }[];
  keywords: string[];
  builtins: string[];
  /** Identifier followed by this char counts as a function call. */
  callAfter?: string;
}

const JS_KEYWORDS = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this', 'import', 'export', 'from', 'default', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'null', 'undefined', 'true', 'false', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'static', 'as', 'satisfies', 'namespace', 'declare'];
const JS_BUILTINS = ['console', 'window', 'document', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'Map', 'Set', 'Date', 'RegExp', 'Error', 'Symbol', 'BigInt', 'React', 'process', 'require', 'module', 'exports'];

const SPECS: Record<SyntaxLang, LangSpec | null> = {
  plain: null,
  markdown: null, // handled by its own line-based pass
  html: null,     // handled by its own pass
  json: { lineComment: [], strings: [{ open: '"', close: '"', escape: true }], keywords: ['true', 'false', 'null'], builtins: [] },
  javascript: { lineComment: ['//'], blockComment: ['/*', '*/'], strings: [{ open: "'", close: "'", escape: true }, { open: '"', close: '"', escape: true }, { open: '`', close: '`', escape: true }], keywords: JS_KEYWORDS, builtins: JS_BUILTINS, callAfter: '(' },
  typescript: { lineComment: ['//'], blockComment: ['/*', '*/'], strings: [{ open: "'", close: "'", escape: true }, { open: '"', close: '"', escape: true }, { open: '`', close: '`', escape: true }], keywords: JS_KEYWORDS, builtins: JS_BUILTINS, callAfter: '(' },
  python: { lineComment: ['#'], strings: [{ open: "'''", close: "'''" }, { open: '"""', close: '"""' }, { open: "'", close: "'", escape: true }, { open: '"', close: '"', escape: true }], keywords: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'global', 'nonlocal', 'pass', 'yield', 'async', 'await', 'assert', 'del', 'in', 'is', 'not', 'and', 'or', 'None', 'True', 'False', 'self'], builtins: ['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'open', 'super', 'type', 'isinstance', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'abs', 'sorted'], callAfter: '(' },
  kotlin: { lineComment: ['//'], blockComment: ['/*', '*/'], strings: [{ open: '"""', close: '"""' }, { open: '"', close: '"', escape: true }, { open: "'", close: "'", escape: true }], keywords: ['fun', 'val', 'var', 'class', 'object', 'interface', 'return', 'if', 'else', 'when', 'for', 'while', 'do', 'break', 'continue', 'import', 'package', 'private', 'public', 'protected', 'internal', 'override', 'open', 'abstract', 'sealed', 'data', 'companion', 'init', 'constructor', 'this', 'super', 'null', 'true', 'false', 'try', 'catch', 'finally', 'throw', 'in', 'is', 'as', 'by', 'lateinit', 'suspend', 'enum', 'const', 'vararg', 'inline', 'reified', 'object'], builtins: ['String', 'Int', 'Boolean', 'Long', 'Double', 'Float', 'List', 'Map', 'Set', 'MutableList', 'Any', 'Unit', 'println', 'arrayOf', 'listOf', 'mapOf', 'setOf'], callAfter: '(' },
  java: { lineComment: ['//'], blockComment: ['/*', '*/'], strings: [{ open: '"', close: '"', escape: true }, { open: "'", close: "'", escape: true }], keywords: ['class', 'interface', 'enum', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'final', 'void', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'null', 'true', 'false', 'abstract', 'synchronized', 'volatile', 'transient', 'instanceof', 'boolean', 'int', 'long', 'double', 'float', 'char', 'byte', 'short'], builtins: ['String', 'Integer', 'Boolean', 'List', 'Map', 'Set', 'Object', 'System', 'Math', 'ArrayList', 'HashMap'], callAfter: '(' },
  c: { lineComment: ['//'], blockComment: ['/*', '*/'], strings: [{ open: '"', close: '"', escape: true }, { open: "'", close: "'", escape: true }], keywords: ['int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'struct', 'union', 'enum', 'typedef', 'const', 'static', 'extern', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'goto', 'sizeof', 'class', 'public', 'private', 'protected', 'namespace', 'using', 'template', 'typename', 'new', 'delete', 'try', 'catch', 'throw', 'nullptr', 'true', 'false', 'auto', 'virtual', 'override', 'include', 'define'], builtins: ['printf', 'malloc', 'free', 'memcpy', 'strlen', 'std', 'cout', 'cin', 'endl', 'vector', 'string', 'map'], callAfter: '(' },
  css: { lineComment: [], blockComment: ['/*', '*/'], strings: [{ open: '"', close: '"' }, { open: "'", close: "'" }], keywords: ['important', 'from', 'to', 'media', 'import', 'keyframes', 'supports', 'root'], builtins: [] },
  shell: { lineComment: ['#'], strings: [{ open: '"', close: '"', escape: true }, { open: "'", close: "'" }], keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'export', 'local', 'echo', 'cd', 'set', 'unset', 'source', 'alias', 'exit', 'in'], builtins: ['sudo', 'apt', 'npm', 'node', 'git', 'python3', 'pip', 'curl', 'wget', 'grep', 'sed', 'awk', 'cat', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'docker', 'kubectl'], callAfter: undefined },
  yaml: { lineComment: ['#'], strings: [{ open: '"', close: '"' }, { open: "'", close: "'" }], keywords: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'], builtins: [] },
  go: { lineComment: ['//'], blockComment: ['/*', '*/'], strings: [{ open: '`', close: '`' }, { open: '"', close: '"', escape: true }], keywords: ['func', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'go', 'defer', 'chan', 'select', 'map', 'make', 'new', 'nil', 'true', 'false', 'error', 'string', 'int', 'bool', 'byte', 'rune', 'float64', 'any'], builtins: ['fmt', 'len', 'cap', 'append', 'panic', 'recover', 'print', 'println'], callAfter: '(' },
  rust: { lineComment: ['//'], blockComment: ['/*', '*/'], strings: [{ open: '"', close: '"', escape: true }, { open: "'", close: "'", escape: true }], keywords: ['fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'crate', 'self', 'Self', 'super', 'return', 'if', 'else', 'match', 'for', 'while', 'loop', 'break', 'continue', 'in', 'as', 'where', 'unsafe', 'async', 'await', 'move', 'ref', 'dyn', 'true', 'false', 'None', 'Some', 'Ok', 'Err'], builtins: ['String', 'Vec', 'Option', 'Result', 'Box', 'println', 'format', 'vec'], callAfter: '(' },
  sql: { lineComment: ['--'], blockComment: ['/*', '*/'], strings: [{ open: "'", close: "'" }], keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'UNIQUE', 'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'join', 'on', 'group', 'by', 'order', 'as', 'and', 'or', 'not', 'null'], builtins: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'count', 'sum', 'avg', 'min', 'max'], callAfter: '(' },
  ruby: { lineComment: ['#'], strings: [{ open: '"', close: '"', escape: true }, { open: "'", close: "'", escape: true }], keywords: ['def', 'end', 'class', 'module', 'if', 'elsif', 'else', 'unless', 'while', 'until', 'for', 'do', 'return', 'yield', 'begin', 'rescue', 'ensure', 'raise', 'require', 'attr_accessor', 'attr_reader', 'nil', 'true', 'false', 'self', 'then', 'case', 'when'], builtins: ['puts', 'print', 'p', 'new', 'to_s', 'to_i', 'each', 'map', 'select'], callAfter: '(' },
  php: { lineComment: ['//', '#'], blockComment: ['/*', '*/'], strings: [{ open: '"', close: '"', escape: true }, { open: "'", close: "'", escape: true }], keywords: ['function', 'class', 'return', 'if', 'else', 'elseif', 'foreach', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'public', 'private', 'protected', 'static', 'echo', 'print', 'use', 'namespace', 'try', 'catch', 'finally', 'throw', 'null', 'true', 'false', 'as', 'require', 'include'], builtins: ['array', 'count', 'strlen', 'implode', 'explode', 'isset', 'empty'], callAfter: '(' },
};

const IDENT_START = /[A-Za-z_$]/;
const IDENT_REST = /[A-Za-z0-9_$]/;

function isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }

/** Tokenise code into a flat token stream (newlines are kept inside tokens). */
export function tokenize(code: string, lang: SyntaxLang): Token[] {
  if (lang === 'markdown') return tokenizeMarkdown(code);
  if (lang === 'html') return tokenizeHtml(code);
  const spec = SPECS[lang];
  if (!spec) return [{ type: 'plain', text: code }];

  const out: Token[] = [];
  let plain = '';
  const flush = () => { if (plain) { out.push({ type: 'plain', text: plain }); plain = ''; } };

  let i = 0;
  const n = code.length;
  while (i < n) {
    // block comment
    if (spec.blockComment && code.startsWith(spec.blockComment[0], i)) {
      const end = code.indexOf(spec.blockComment[1], i + spec.blockComment[0].length);
      const stop = end === -1 ? n : end + spec.blockComment[1].length;
      flush();
      out.push({ type: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }
    // line comment
    const lc = spec.lineComment.find((c) => code.startsWith(c, i));
    if (lc) {
      const nl = code.indexOf('\n', i);
      const stop = nl === -1 ? n : nl;
      flush();
      out.push({ type: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }
    // string
    const str = spec.strings.find((s) => code.startsWith(s.open, i));
    if (str) {
      let j = i + str.open.length;
      while (j < n) {
        if (str.escape && code[j] === '\\') { j += 2; continue; }
        if (code.startsWith(str.close, j)) { j += str.close.length; break; }
        j++;
      }
      flush();
      out.push({ type: 'string', text: code.slice(i, Math.min(j, n)) });
      i = Math.min(j, n);
      continue;
    }
    // number
    if (isDigit(code[i]) || (code[i] === '.' && isDigit(code[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxX._]/.test(code[j])) j++;
      flush();
      out.push({ type: 'number', text: code.slice(i, j) });
      i = j;
      continue;
    }
    // identifier / keyword / function
    if (IDENT_START.test(code[i])) {
      let j = i;
      while (j < n && IDENT_REST.test(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && (code[k] === ' ' || code[k] === '\t')) k++;
      let type: TokenType = 'plain';
      if (spec.keywords.includes(word)) type = 'keyword';
      else if (spec.builtins.includes(word)) type = 'builtin';
      else if (spec.callAfter && code[k] === spec.callAfter) type = 'function';
      flush();
      out.push({ type, text: word });
      i = j;
      continue;
    }
    // operators get their own colour only when clearly operators
    if ('+-*/%=<>!&|^~?:'.includes(code[i])) {
      let j = i;
      while (j < n && '+-*/%=<>!&|^~?:'.includes(code[j])) j++;
      flush();
      out.push({ type: 'operator', text: code.slice(i, j) });
      i = j;
      continue;
    }
    plain += code[i];
    i++;
  }
  flush();
  return out;
}

function tokenizeMarkdown(code: string): Token[] {
  const out: Token[] = [];
  code.split('\n').forEach((line, idx) => {
    if (idx > 0) out.push({ type: 'plain', text: '\n' });
    if (/^\s{0,3}#{1,6}\s/.test(line)) { out.push({ type: 'heading', text: line }); return; }
    if (/^\s{0,3}(```|~~~)/.test(line)) { out.push({ type: 'keyword', text: line }); return; }
    if (/^\s{0,3}>\s/.test(line)) { out.push({ type: 'comment', text: line }); return; }
    // inline: links, bold and code spans
    const re = /(\[[^\]]*\]\([^)]*\))|(`[^`]*`)|(\*\*[^*]+\*\*|__[^_]+__)|(^\s*[-*+]\s)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) out.push({ type: 'plain', text: line.slice(last, m.index) });
      if (m[1]) out.push({ type: 'link', text: m[1] });
      else if (m[2]) out.push({ type: 'string', text: m[2] });
      else if (m[3]) out.push({ type: 'keyword', text: m[3] });
      else out.push({ type: 'operator', text: m[4] });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ type: 'plain', text: line.slice(last) });
  });
  return out;
}

function tokenizeHtml(code: string): Token[] {
  const out: Token[] = [];
  const re = /(<!--[\s\S]*?-->)|(<!\[CDATA\[[\s\S]*?\]\]>)|(<!DOCTYPE[^>]*>)|(<\/?[A-Za-z][\w:-]*)|(\/?>)|([A-Za-z_:][\w:.-]*)(?==)|(=)|("[^"]*"|'[^']*')/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out.push({ type: 'plain', text: code.slice(last, m.index) });
    if (m[1] || m[2]) out.push({ type: 'comment', text: m[0] });
    else if (m[3]) out.push({ type: 'keyword', text: m[0] });
    else if (m[4]) out.push({ type: 'tag', text: m[0] });
    else if (m[5]) out.push({ type: 'tag', text: m[0] });
    else if (m[6]) out.push({ type: 'attr', text: m[0] });
    else if (m[7]) out.push({ type: 'operator', text: m[0] });
    else out.push({ type: 'string', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push({ type: 'plain', text: code.slice(last) });
  return out;
}

/** Split a token stream into lines, preserving every character. */
export function tokensToLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const tok of tokens) {
    const parts = tok.text.split('\n');
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ type: tok.type, text: part });
    });
  }
  return lines;
}

/** Convenience: code straight to per-line tokens. */
export function highlight(code: string, lang: SyntaxLang): Token[][] {
  return tokensToLines(tokenize(code, lang));
}
