import React, { useMemo } from 'react';
import { useTheme } from './ThemeContext';
import { highlight, languageFromPath, type Token, type TokenType } from '../utils/syntax';

interface Props {
  code: string;
  /** File path — used to pick the language. Pass `language` to override. */
  path?: string;
  language?: Parameters<typeof highlight>[1];
  showLineNumbers?: boolean;
  /** Above this many lines we skip highlighting to stay smooth. */
  maxHighlightLines?: number;
}

/**
 * Read-only, syntax-highlighted code. Highlighting is skipped for very large
 * files so opening a big log never janks the page.
 */
export const CodeBlock: React.FC<Props> = ({ code, path = '', language, showLineNumbers = true, maxHighlightLines = 4000 }) => {
  const { colors } = useTheme();

  const lang = language ?? languageFromPath(path);
  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const tooBig = lineCount > maxHighlightLines;

  const lines = useMemo<Token[][]>(() => {
    if (tooBig) return code.split('\n').map((l) => [{ type: 'plain', text: l } as Token]);
    try {
      return highlight(code, lang);
    } catch {
      // A malformed file must never break the viewer.
      return code.split('\n').map((l) => [{ type: 'plain', text: l } as Token]);
    }
  }, [code, lang, tooBig]);

  const colorFor = (type: TokenType): React.CSSProperties => {
    switch (type) {
      case 'comment': return { color: colors.onSurfaceVariant, opacity: 0.75, fontStyle: 'italic' };
      case 'string': return { color: colors.tertiary };
      case 'number': return { color: colors.secondary };
      case 'keyword': return { color: colors.primary, fontWeight: 700 };
      case 'builtin': return { color: colors.tertiary, fontWeight: 600 };
      case 'function': return { color: colors.secondary, fontWeight: 600 };
      case 'tag': return { color: colors.primary, fontWeight: 700 };
      case 'attr': return { color: colors.secondary };
      case 'operator': return { color: colors.onSurfaceVariant };
      case 'heading': return { color: colors.primary, fontWeight: 800 };
      case 'link': return { color: colors.primary, textDecoration: 'underline' };
      default: return {};
    }
  };

  return (
    <pre
      className="rounded-2xl border p-3 overflow-auto text-[11px] leading-5 font-mono whitespace-pre"
      style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }}
    >
      {lines.map((tokens, i) => (
        <div key={i} className="flex">
          {showLineNumbers && (
            <span className="select-none flex-shrink-0 text-right pr-3 opacity-35" style={{ width: 34 }}>
              {i + 1}
            </span>
          )}
          <span className="whitespace-pre-wrap break-words flex-1">
            {tokens.length === 0 ? '\u200b' : tokens.map((t, j) => (
              <span key={j} style={colorFor(t.type)}>{t.text}</span>
            ))}
          </span>
        </div>
      ))}
      {tooBig && (
        <div className="pt-2 opacity-60" style={{ paddingLeft: showLineNumbers ? 34 : 0 }}>
          Large file — shown without highlighting for smooth scrolling.
        </div>
      )}
    </pre>
  );
};
