import React, { useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { Repository } from '../types';
import { M3BottomSheet } from '../ui/m3/M3BottomSheet';

export interface RepoPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  repos: Repository[];
  onSelectRepo: (repo: Repository) => void;
}

export const RepoPickerSheet: React.FC<RepoPickerSheetProps> = ({
  isOpen,
  onClose,
  repos,
  onSelectRepo,
}) => {
  const { colors, triggerHaptic } = useTheme();
  const [query, setQuery] = useState('');

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(query.toLowerCase()))
  );

  const handlePick = (repo: Repository) => {
    triggerHaptic('tick');
    onSelectRepo(repo);
    onClose();
  };

  return (
    <M3BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Select repository to update"
      subtitle="Choose which repository should receive your ZIP changes"
    >
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div
          className="flex items-center h-11 px-3.5 rounded-full border mb-1"
          style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outline }}
        >
          <svg className="w-4 h-4 mr-2 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search repositories..."
            className="flex-1 bg-transparent border-none outline-none text-xs font-medium"
          />
        </div>

        {/* List */}
        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs opacity-60">
              No matching repositories
            </div>
          ) : (
            filtered.map((repo) => (
              <div
                key={repo.id}
                onClick={() => handlePick(repo)}
                className="p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer hover:opacity-90 active:scale-98 transition-all"
                style={{
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                }}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-bold text-xs truncate">{repo.name}</span>
                  <span className="text-[10px] opacity-60 truncate">
                    {repo.description || 'No description'}
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold" style={{ color: colors.primary }}>
                  →
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </M3BottomSheet>
  );
};
