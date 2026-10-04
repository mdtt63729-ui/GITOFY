import React, { useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { DiffSummary, DiffItem } from '../types';
import { M3Button } from '../ui/m3/M3Button';
import { M3Chip } from '../ui/m3/M3Chip';
import { M3Switch } from '../ui/m3/M3Switch';
import { M3IconButton } from '../ui/m3/M3IconButton';

export interface ZipAnalysisScreenProps {
  repoName: string;
  diffSummary: DiffSummary;
  onBack: () => void;
  onProceedToUpload: (commitMessage: string) => void;
}

export const ZipAnalysisScreen: React.FC<ZipAnalysisScreenProps> = ({
  repoName,
  diffSummary,
  onBack,
  onProceedToUpload,
}) => {
  const { colors, settings } = useTheme();
  const [filter, setFilter] = useState<'all' | 'added' | 'modified' | 'deleted'>('all');
  const [selectedFile, setSelectedFile] = useState<DiffItem | null>(null);
  const [stripRoot, setStripRoot] = useState(settings.stripRootFolder);
  const [deleteRemoteOnly, setDeleteRemoteOnly] = useState(settings.deleteRemoteOnly);
  const [commitMessage, setCommitMessage] = useState(
    `Update ${repoName} (+${diffSummary.added} Added, ~${diffSummary.modified} Modified)`
  );

  const filteredItems = diffSummary.items.filter((item) => {
    if (filter === 'all') return item.status !== 'unchanged';
    return item.status === filter;
  });

  return (
    <div className="flex-1 flex flex-col overflow-y-auto overscroll-contain select-none">
      {/* Top Bar */}
      <div
        className="sticky top-0 z-30 px-4 py-3 backdrop-blur-md border-b flex items-center justify-between"
        style={{
          backgroundColor: `${colors.surface}f0`,
          borderColor: colors.outlineVariant,
        }}
      >
        <div className="flex items-center gap-2">
          <M3IconButton aria-label="Back" onClick={onBack}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </M3IconButton>
          <div>
            <h2 className="text-base font-bold">ZIP Smart Diff</h2>
            <p className="text-[10px] font-mono opacity-70 truncate max-w-[200px]">{repoName}</p>
          </div>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4 pb-28">
        {/* Metric Counter Cards */}
        <div className="grid grid-cols-4 gap-2">
          <div
            className="p-3 rounded-2xl flex flex-col items-center justify-center text-center border"
            style={{
              backgroundColor: colors.diffAddedContainer,
              borderColor: colors.diffAdded,
              color: colors.diffAdded,
            }}
          >
            <span className="text-xl font-black">+{diffSummary.added}</span>
            <span className="text-[10px] font-bold uppercase">Added</span>
          </div>

          <div
            className="p-3 rounded-2xl flex flex-col items-center justify-center text-center border"
            style={{
              backgroundColor: colors.diffModifiedContainer,
              borderColor: colors.diffModified,
              color: colors.diffModified,
            }}
          >
            <span className="text-xl font-black">~{diffSummary.modified}</span>
            <span className="text-[10px] font-bold uppercase">Modified</span>
          </div>

          <div
            className="p-3 rounded-2xl flex flex-col items-center justify-center text-center border"
            style={{
              backgroundColor: colors.diffDeletedContainer,
              borderColor: colors.diffDeleted,
              color: colors.diffDeleted,
            }}
          >
            <span className="text-xl font-black">-{diffSummary.deleted}</span>
            <span className="text-[10px] font-bold uppercase">Deleted</span>
          </div>

          <div
            className="p-3 rounded-2xl flex flex-col items-center justify-center text-center border"
            style={{
              backgroundColor: colors.surfaceContainerHighest,
              borderColor: colors.outlineVariant,
              color: colors.onSurfaceVariant,
            }}
          >
            <span className="text-xl font-black">{diffSummary.unchanged}</span>
            <span className="text-[10px] font-bold uppercase">Same</span>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          <M3Chip
            label="All Changes"
            selected={filter === 'all'}
            onClick={() => setFilter('all')}
            count={diffSummary.added + diffSummary.modified + diffSummary.deleted}
          />
          <M3Chip
            label="Added (+)"
            selected={filter === 'added'}
            onClick={() => setFilter('added')}
            count={diffSummary.added}
          />
          <M3Chip
            label="Modified (~)"
            selected={filter === 'modified'}
            onClick={() => setFilter('modified')}
            count={diffSummary.modified}
          />
          {diffSummary.deleted > 0 && (
            <M3Chip
              label="Deleted (-)"
              selected={filter === 'deleted'}
              onClick={() => setFilter('deleted')}
              count={diffSummary.deleted}
            />
          )}
        </div>

        {/* File List */}
        <div
          className="rounded-2xl border divide-y overflow-hidden"
          style={{
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.outlineVariant,
          }}
        >
          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-xs opacity-60">
              No changed files in this category
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.path}
                onClick={() => setSelectedFile(selectedFile?.path === item.path ? null : item)}
                className="p-3 flex items-center justify-between text-xs cursor-pointer hover:opacity-90 active:bg-black/5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0"
                    style={{
                      backgroundColor:
                        item.status === 'added'
                          ? colors.diffAddedContainer
                          : item.status === 'modified'
                          ? colors.diffModifiedContainer
                          : colors.diffDeletedContainer,
                      color:
                        item.status === 'added'
                          ? colors.diffAdded
                          : item.status === 'modified'
                          ? colors.diffModified
                          : colors.diffDeleted,
                    }}
                  >
                    {item.status === 'added' ? '+' : item.status === 'modified' ? '~' : '-'}
                  </span>
                  <span className="font-mono text-[11px] truncate">{item.path}</span>
                </div>
                <span className="text-[10px] opacity-60 whitespace-nowrap ml-2">
                  {(item.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))
          )}
        </div>

        {/* Inline Diff Preview if a file is clicked */}
        {selectedFile && selectedFile.content && (
          <div
            className="p-4 rounded-2xl border font-mono text-[11px] overflow-x-auto"
            style={{
              backgroundColor: colors.surfaceContainerHighest,
              borderColor: colors.outline,
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b mb-2">
              <span className="font-bold truncate">{selectedFile.path}</span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-xs cursor-pointer px-2"
              >
                ✕
              </button>
            </div>
            <pre className="text-[10px] leading-relaxed whitespace-pre-wrap">
              {selectedFile.content.slice(0, 1000)}
              {selectedFile.content.length > 1000 && '\n... (truncated preview)'}
            </pre>
          </div>
        )}

        {/* Switches */}
        <div
          className="p-4 rounded-2xl border flex flex-col gap-3"
          style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">Strip Root Directory</p>
              <p className="text-[10px] opacity-70">
                Flattens single top-level archive directory
              </p>
            </div>
            <M3Switch checked={stripRoot} onChange={setStripRoot} />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Delete Remote Only Files</p>
              <p className="text-[10px] opacity-70">
                Removes files from GitHub that do not exist in ZIP
              </p>
            </div>
            <M3Switch checked={deleteRemoteOnly} onChange={setDeleteRemoteOnly} />
          </div>
        </div>

        {/* Commit Message Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold" style={{ color: colors.onSurfaceVariant }}>
            Commit Message
          </label>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            rows={2}
            className="w-full p-3 rounded-2xl border text-xs font-medium outline-none resize-none"
            style={{
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.outline,
              color: colors.onSurface,
            }}
          />
        </div>
      </div>

      {/* Sticky Bottom Continue Button */}
      <div
        className="fixed left-0 right-0 bottom-0 z-40 p-4 border-t backdrop-blur-md flex justify-center"
        style={{
          backgroundColor: `${colors.surface}f5`,
          borderColor: colors.outlineVariant,
        }}
      >
        <M3Button
          variant="filled"
          shape="capsule"
          size="large"
          className="w-full max-w-sm font-bold shadow-xl"
          onClick={() => onProceedToUpload(commitMessage)}
        >
          Push Changes to GitHub →
        </M3Button>
      </div>
    </div>
  );
};
