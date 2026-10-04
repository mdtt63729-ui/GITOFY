import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { UploadState, DiffSummary } from '../types';
import { gitUploadEngine, EngineResult } from '../git/gitUploadEngine';

export interface UploadScreenProps {
  repoName: string;
  branch: string;
  commitMessage: string;
  diffSummary: DiffSummary;
  zipFile?: File | Blob | ArrayBuffer | null;
  onSuccess: (sha: string, result?: EngineResult) => void;
  onCancel: () => void;
}

const phaseLabels: Record<string, string> = {
  validating: 'Validating project…', extracting: 'Extracting project…', indexing: 'Indexing files…',
  hashing: 'Checking file changes…', diffing: 'Comparing changes…', git_prep: 'Preparing Git…',
  uploading: 'Uploading changes…', committing: 'Creating commit…', pushing: 'Pushing to GitHub…',
  verifying: 'Verifying repository…', completed: 'Upload complete', paused: 'Upload paused',
  error: 'Upload interrupted', cancelled: 'Upload cancelled',
};

export const UploadScreen: React.FC<UploadScreenProps> = ({
  repoName, branch, commitMessage, diffSummary, zipFile, onSuccess, onCancel,
}) => {
  const { settings, triggerHaptic } = useTheme();
  const [state, setState] = useState<UploadState>({
    phase: 'validating', progress: 0, currentFile: 'Preparing project…', completedFiles: 0,
    totalFiles: diffSummary.items.filter((i) => i.status !== 'unchanged').length || diffSummary.totalFiles || 1,
    uploadedBytes: 0, totalBytes: diffSummary.totalSize || 0, speed: 'Calculating…', eta: 'Estimating…',
    commitSha: null, errorMessage: null,
  });
  const [engineLabel, setEngineLabel] = useState('Smart Diff');
  const [previousFile, setPreviousFile] = useState('Preparing project…');
  const [fileRevision, setFileRevision] = useState(0);
  const previousFileRef = useRef(state.currentFile);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    gitUploadEngine.checkNativeEngineAvailable().then(({ available }) => {
      setEngineLabel(available ? 'Git Smart HTTP' : 'Smart Diff');
    });
    void startUpload();
  }, []);

  const startUpload = async () => {
    try {
      const parts = repoName.split('/');
      const owner = parts.length > 1 ? parts[0] : settings.githubUsername || 'user';
      const name = parts.length > 1 ? parts[1] : repoName;
      const source = zipFile ?? new Uint8Array(0).buffer;
      const result = await gitUploadEngine.executeUpload(source, {
        repoOwner: owner,
        repoName: name,
        branch,
        commitMessage,
        token: settings.personalAccessToken || '',
        stripRootFolder: settings.stripRootFolder,
        onProgress: (next) => {
          if (next.currentFile && next.currentFile !== previousFileRef.current) {
            setPreviousFile(previousFileRef.current);
            previousFileRef.current = next.currentFile;
            setFileRevision((v) => v + 1);
          }
          setState(next);
        },
      });
      if (result.success) {
        triggerHaptic('success');
        onSuccess(result.sha, result);
      }
    } catch (err: unknown) {
      triggerHaptic('error');
      setState((prev) => ({
        ...prev, phase: 'error', errorMessage: err instanceof Error ? err.message : 'Upload failed.',
      }));
    }
  };

  const handleCancel = async () => {
    triggerHaptic('click');
    await gitUploadEngine.cancel();
    onCancel();
  };

  const progress = Math.max(0, Math.min(100, Math.round(state.progress || 0)));
  const failed = state.phase === 'error';
  const done = state.phase === 'completed';
  const bytes = state.totalBytes || 0;
  const uploaded = state.uploadedBytes || 0;
  const fileName = state.currentFile || 'Updating repository…';

  return (
    <div className={`upload-reference-screen ${done ? 'success-bg' : ''}`}>
      <header className="upload-ref-topbar">
        <button className="upload-ref-iconbtn" aria-label="Go back" onClick={handleCancel}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="upload-ref-title">{done ? 'Complete' : 'Uploading'}</div>
      </header>

      <main className="upload-ref-content">
        <div className={`upload-ref-main ${done ? 'fade-out' : ''}`}>
          <div className="upload-ref-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04ZM19 18H6C3.79 18 2 16.21 2 14C2 11.95 3.53 10.24 5.56 10.03L6.63 9.92L7.13 8.97C8.08 7.14 9.94 6 12 6C14.62 6 16.88 7.86 17.39 10.43L17.69 11.93L19.22 12.04C20.78 12.14 22 13.45 22 15C22 16.65 20.65 18 19 18ZM13.45 11H10.55V14H8L12 18L16 14H13.45V11Z" />
            </svg>
          </div>

          <div className="upload-ref-status">
            <div className="upload-ref-caption">{failed ? 'Upload interrupted' : phaseLabels[state.phase] || 'Uploading changes…'}</div>
            <div className="upload-ref-track" aria-label={`Upload progress ${progress}%`}>
              <div className="upload-ref-fill" style={{ width: `${progress}%` }}>
                <span className="upload-ref-percent">{progress}%</span>
              </div>
            </div>

            <div className="upload-ref-file" key={fileRevision}>
              <div className="upload-ref-file-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="upload-ref-file-copy">
                <div className="upload-ref-file-label">Changing file · {engineLabel}</div>
                <div className="upload-ref-file-name upload-ref-file-change" title={fileName}>{fileName}</div>
                {previousFile !== fileName && <div className="upload-ref-file-label" style={{ marginTop: 3 }}>previous: {previousFile}</div>}
              </div>
            </div>

            <div className="upload-ref-metrics">
              <span>{state.completedFiles} / {state.totalFiles || 1} files</span>
              <span>•</span>
              <span>{(uploaded / (1024 * 1024)).toFixed(1)} / {(bytes / (1024 * 1024)).toFixed(1)} MB</span>
            </div>

            {failed && (
              <div className="upload-ref-file" style={{ borderColor: 'rgba(249,222,220,.32)', background: 'rgba(140,29,24,.28)' }}>
                <div className="upload-ref-file-copy">
                  <div className="upload-ref-file-label" style={{ color: '#f9dedc' }}>Error</div>
                  <div className="upload-ref-file-name" style={{ whiteSpace: 'normal', color: '#f9dedc' }}>{state.errorMessage || 'The upload could not be completed.'}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`upload-ref-success ${done ? 'show' : ''}`}>
          <div className="upload-ref-success-circle">
            <svg viewBox="0 0 24 24"><path d="M5 13 L10 18 L19 7" /></svg>
          </div>
          <div className="upload-ref-success-title">Uploaded Successfully</div>
          <div className="upload-ref-success-subtitle">Your project changes have been committed and pushed to GitHub.</div>
        </div>
      </main>

      <footer className="upload-ref-bottom">
        <button className="upload-ref-button" onClick={handleCancel}>
          {failed ? 'Back' : 'Cancel upload'}
        </button>
      </footer>
    </div>
  );
};
