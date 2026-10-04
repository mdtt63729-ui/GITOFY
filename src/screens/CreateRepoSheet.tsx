import React, { useState, useEffect } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3BottomSheet } from '../ui/m3/M3BottomSheet';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3Switch } from '../ui/m3/M3Switch';
import { M3Button } from '../ui/m3/M3Button';
import { checkRepoAvailability } from '../git/githubApi';

export interface CreateRepoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (repoData: {
    name: string;
    description: string;
    isPrivate: boolean;
    autoInit: boolean;
    uploadZipImmediately: boolean;
    language?: string;
  }) => void;
}

export const CreateRepoSheet: React.FC<CreateRepoSheetProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(settings.defaultVisibility === 'private');
  const [autoInit, setAutoInit] = useState(settings.autoInitReadme);
  const [uploadZipImmediately, setUploadZipImmediately] = useState(false);
  const [language, setLanguage] = useState('');

  const [isValidating, setIsValidating] = useState(false);
  const [isValidName, setIsValidName] = useState<boolean | null>(null);
  const [validationMsg, setValidationMsg] = useState('');

  // Live availability check (fast 200ms debounce)
  useEffect(() => {
    if (!name.trim()) {
      setIsValidName(null);
      setValidationMsg('');
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    const timer = setTimeout(async () => {
      const res = await checkRepoAvailability(
        name.trim(),
        settings.githubUsername,
        settings.personalAccessToken
      );
      setIsValidating(false);
      setIsValidName(res.available);
      setValidationMsg(res.message);
    }, 200);

    return () => clearTimeout(timer);
  }, [name, settings.githubUsername, settings.personalAccessToken]);

  const handleCreate = () => {
    if (!isValidName || !name.trim()) return;
    triggerHaptic('success');
    onCreate({
      name: name.trim(),
      description: description.trim(),
      isPrivate,
      autoInit,
      uploadZipImmediately,
      language: language || undefined,
    });
    // Reset
    setName('');
    setDescription('');
    setLanguage('');
    onClose();
  };

  return (
    <M3BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Create new repository"
      subtitle="Host and push your code with GitHub API"
    >
      <div className="flex flex-col gap-4">
        {/* Name input */}
        <M3TextField
          label="Repository name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-awesome-project"
          required
          validating={isValidating}
          isValid={isValidName === true}
          error={isValidName === false ? validationMsg : undefined}
        />

        {/* Description input */}
        <M3TextField
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this repository do?"
        />

        {/* Primary Language */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold" style={{ color: colors.onSurfaceVariant }}>
            Primary Language
          </label>
          <div
            className="flex items-center h-12 px-3.5 rounded-2xl border"
            style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
          >
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-xs font-bold cursor-pointer"
              style={{ color: colors.onSurface }}
            >
              <option value="">Auto-detect from project</option>
              <option value="Kotlin">Kotlin (Android)</option>
              <option value="Java">Java (Android)</option>
              <option value="Dart">Dart (Flutter)</option>
              <option value="TypeScript">TypeScript</option>
              <option value="JavaScript">JavaScript</option>
              <option value="Python">Python</option>
              <option value="C++">C++</option>
              <option value="C#">C#</option>
              <option value="Swift">Swift (iOS)</option>
              <option value="Go">Go</option>
              <option value="Rust">Rust</option>
              <option value="PHP">PHP</option>
              <option value="HTML">HTML / Web</option>
            </select>
          </div>
        </div>

        {/* Visibility segmented picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold" style={{ color: colors.onSurfaceVariant }}>
            Visibility
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsPrivate(true)}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                isPrivate ? 'ring-2' : ''
              }`}
              style={{
                backgroundColor: isPrivate ? colors.primary : colors.surfaceContainerLowest,
                color: isPrivate ? colors.onPrimary : colors.onSurface,
                borderColor: colors.outlineVariant,
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Private</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPrivate(false)}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                !isPrivate ? 'ring-2' : ''
              }`}
              style={{
                backgroundColor: !isPrivate ? colors.primary : colors.surfaceContainerLowest,
                color: !isPrivate ? colors.onPrimary : colors.onSurface,
                borderColor: colors.outlineVariant,
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>Public</span>
            </button>
          </div>
        </div>

        {/* Switches */}
        <div
          className="p-4 rounded-2xl border flex flex-col gap-3 mt-1"
          style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">Initialize with README</p>
              <p className="text-[10px] opacity-70">
                Creates initial commit with README.md for Git Data API compatibility
              </p>
            </div>
            <M3Switch checked={autoInit} onChange={setAutoInit} />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Upload ZIP immediately</p>
              <p className="text-[10px] opacity-70">
                Launch ZIP file picker directly after repository creation
              </p>
            </div>
            <M3Switch checked={uploadZipImmediately} onChange={setUploadZipImmediately} />
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <M3Button
            variant="filled"
            shape="capsule"
            size="large"
            className="w-full font-bold shadow-lg"
            disabled={!isValidName || !name.trim()}
            onClick={handleCreate}
          >
            Create Repository
          </M3Button>
        </div>
      </div>
    </M3BottomSheet>
  );
};
