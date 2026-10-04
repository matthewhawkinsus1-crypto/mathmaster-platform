import { Component } from 'react';
import RecoveryPanel from './RecoveryPanel.jsx';
import { isChunkLoadError, recentlyReloadedForChunk, reloadForCurrentBuild } from '../../platform/runtime/chunkLoadRecovery.js';
import { recordClientDiagnostic } from '../../platform/runtime/clientDiagnostics.js';

/*
 * THE LAST BOUNDARY, AROUND THE WHOLE APP.
 *
 * It used to say "MathMaster could not start" — for any error, at any time,
 * hours after it started — above a raw stack trace. The commonest cause in a
 * classroom is not a crash at all: a tab that outlived a deploy tried to load a
 * chunk the new release no longer has (chunkLoadRecovery.js). That gets a calm
 * "MathMaster was just updated" and one button. Everything else gets plain
 * words, a reload, and a copyable, privacy-scrubbed report for the teacher.
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloadedRecently: false };
  }

  static getDerivedStateFromError(error) {
    return { error, reloadedRecently: recentlyReloadedForChunk() };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MathMaster application error:', error, errorInfo);
    recordClientDiagnostic({
      kind: isChunkLoadError(error) ? 'chunk-load' : 'render-error',
      message: error?.message || String(error),
      source: 'app',
    });
  }

  render() {
    const { error, reloadedRecently } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);

    let panel;
    if (chunk && !reloadedRecently) {
      panel = (
        <RecoveryPanel
          tone="updated"
          title="MathMaster was just updated"
          primaryLabel="Load the new version"
          onPrimary={() => reloadForCurrentBuild()}
          offerReport={false}
        >
          <p style={{ margin: 0 }}>
            This tab was opened before the update, so part of the new version could not load into it.
            MathMaster saves your work as you go — loading the new version brings you back to it.
          </p>
        </RecoveryPanel>
      );
    } else if (chunk) {
      panel = (
        <RecoveryPanel
          tone="offline"
          title="MathMaster could not load this screen"
          primaryLabel="Try again"
          onPrimary={() => reloadForCurrentBuild()}
          technicalMessage={error?.message || String(error)}
        >
          <p style={{ margin: 0 }}>
            Check that this device is connected to the internet, then try again. Your work is saved on this device
            and comes back when MathMaster loads.
          </p>
        </RecoveryPanel>
      );
    } else {
      panel = (
        <RecoveryPanel
          tone="error"
          title="Something went wrong on this screen"
          primaryLabel="Reload MathMaster"
          onPrimary={() => window.location.reload()}
          technicalMessage={error?.message || String(error)}
        >
          <p style={{ margin: 0 }}>
            Reloading usually fixes this, and your saved work comes back with it. If it happens again, use
            &ldquo;Copy details for your teacher&rdquo; and send what it copies.
          </p>
        </RecoveryPanel>
      );
    }

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 16,
          boxSizing: 'border-box',
          background: 'var(--mm-page-bg, var(--mm-surface-sunken))',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {panel}
      </main>
    );
  }
}
