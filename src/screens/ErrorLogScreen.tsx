import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { getErrors, clearErrors, errorsAsText, subscribeToErrorLog, type ErrorEntry } from '../utils/errorLog';
import { copyText } from '../utils/external';

interface Props {
  onBack: () => void;
}

function when(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

/**
 * The on-device error log. Read-only apart from Copy and Clear — nothing here
 * is ever sent anywhere.
 */
export const ErrorLogScreen: React.FC<Props> = ({ onBack }) => {
  const { colors, triggerHaptic } = useTheme();
  const [entries, setEntries] = useState<ErrorEntry[]>(() => getErrors());
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => setEntries(getErrors()), []);
  useEffect(() => subscribeToErrorLog(refresh), [refresh]);

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">Error log</div>
          <div className="text-[10px] opacity-60 truncate">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · stored only on this phone</div>
        </div>
      </div>

      <div className="p-5 pb-28 flex flex-col gap-4">
        <div className="p-4 rounded-2xl border" style={card}>
          <p className="text-[11px] leading-relaxed opacity-80">
            These are failures this app ran into, saved on your device so you can show them to
            whoever is helping you. Nothing is uploaded anywhere, and clearing them clears them
            for good. Turn this off in Settings if you would rather nothing be recorded.
          </p>
        </div>

        <div className="flex gap-2">
          <M3Button
            variant="tonal" shape="capsule" size="compact" className="flex-1"
            disabled={entries.length === 0}
            onClick={() => {
              void copyText(errorsAsText(), false);
              triggerHaptic('success');
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copied ✓' : 'Copy all'}
          </M3Button>
          <M3Button
            variant="text" shape="capsule" size="compact" className="flex-1"
            disabled={entries.length === 0}
            onClick={() => { clearErrors(); triggerHaptic('tick'); }}
          >
            Clear
          </M3Button>
        </div>

        {entries.length === 0 ? (
          <div className="p-6 rounded-3xl border text-center" style={card}>
            <p className="text-sm font-bold">Nothing logged</p>
            <p className="text-xs opacity-70 mt-1">That is the good outcome.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setOpen(open === e.id ? null : e.id)}
                className="p-3.5 rounded-2xl border flex flex-col gap-1.5 text-left cursor-pointer active:scale-[0.99] transition-transform"
                style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold flex-1 break-words">{e.message}</span>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}>{e.context}</span>
                </div>
                <span className="text-[10px] opacity-60">{when(e.at)}{e.appVersion ? ` · v${e.appVersion}` : ''}</span>
                {open === e.id && e.stack && (
                  <pre className="mt-1 p-2.5 rounded-xl text-[9px] leading-4 font-mono overflow-x-auto whitespace-pre" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                    {e.stack}
                  </pre>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
