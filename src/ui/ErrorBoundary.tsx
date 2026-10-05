import React from 'react';
import { logError } from '../utils/errorLog';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Stops one broken screen from taking the whole app down.
 *
 * A render error is logged (locally only) and replaced with a small recovery
 * card, so the user can carry on instead of staring at a blank WebView.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logError(error, `render (${info.componentStack?.split('\n')[1]?.trim() || 'unknown'})`);
  }

  private reload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          background: 'var(--gitofy-background, #fdf7f8)',
          color: 'var(--gitofy-on-surface, #201a1a)',
          fontFamily: 'var(--gitofy-font, system-ui)',
        }}
      >
        <div style={{ fontSize: 40 }}>⚠️</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: 13, opacity: 0.75, maxWidth: 320, lineHeight: 1.5, margin: 0 }}>
          This screen hit an error. Your data on GitHub is untouched. The details were saved to the
          error log in Settings.
        </p>
        <p style={{ fontSize: 11, opacity: 0.6, fontFamily: 'monospace', maxWidth: 320, wordBreak: 'break-word', margin: 0 }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={this.reload}
          style={{
            marginTop: 8,
            padding: '12px 28px',
            borderRadius: 999,
            border: 'none',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            background: 'var(--gitofy-primary, #a10f2b)',
            color: 'var(--gitofy-on-primary, #ffffff)',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
