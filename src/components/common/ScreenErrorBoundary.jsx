import { Component } from 'react';
import RecoveryPanel from './RecoveryPanel.jsx';
import { isChunkLoadError, reloadForCurrentBuild } from '../../platform/runtime/chunkLoadRecovery.js';
import { CHUNK_RETRY } from '../../platform/runtime/retryableChunk.js';
import { recordClientDiagnostic } from '../../platform/runtime/clientDiagnostics.js';

/*
 * ONE SCREEN'S OWN BOUNDARY (RC09).
 *
 * A render error inside a screen reached AppErrorBoundary, the last boundary,
 * which replaces the whole app. A screen that has its own way out (the
 * Recovery runner's way back to the result page) is wrapped in this one: the
 * error stays on that screen, the way out stays, and the report is the same
 * privacy-scrubbed one. A chunk that could not load is not this screen's
 * problem: it goes on to AppErrorBoundary, which offers the new version.
 *
 * A SCREEN WHOSE CODE LOADS ON DEMAND (PF01). Given `retryChunk` (the
 * student's Grades, Assignments, Rewards and result screens,
 * app/lazyScreens.js), a chunk that could not load IS this screen's problem:
 * the Chromebook went offline before Home's prefetch finished, or a deploy
 * replaced the chunk. A short message and Try again take the screen's place,
 * with its way Home, instead of AppErrorBoundary's whole-app panel; and Try
 * again does what can really work (platform/runtime/retryableChunk.js): ask
 * again, load the page again, or, still offline, say so. Such a boundary has
 * no words for any other error (no `title`): that goes on to AppErrorBoundary,
 * as it did before the screen loaded on demand.
 */
const CHECK_CONNECTION = 'Check that this device is connected to the internet, then try again.';
const STILL_OFFLINE = 'This device is still offline. Connect it to the internet, then try again.';

export default class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stillOffline: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Whether this boundary shows `error` itself. One it does not is thrown on
  // in render, and AppErrorBoundary records and shows it.
  shows(error) {
    return isChunkLoadError(error) ? Boolean(this.props.retryChunk) : Boolean(this.props.title);
  }

  componentDidCatch(error, errorInfo) {
    if (!this.shows(error)) return;
    if (isChunkLoadError(error)) {
      recordClientDiagnostic({ kind: 'chunk-load', message: error?.message || String(error), source: this.props.source || 'screen' });
      return;
    }
    console.error(`MathMaster ${this.props.source || 'screen'} error:`, error, errorInfo);
    recordClientDiagnostic({
      kind: 'render-error',
      message: error?.message || String(error),
      source: this.props.source || 'screen',
    });
  }

  tryAgain() {
    const next = this.props.retryChunk(this.state.error);
    if (next === CHUNK_RETRY.RELOAD) {
      reloadForCurrentBuild();
      return;
    }
    if (next === CHUNK_RETRY.OFFLINE) {
      this.setState({ stillOffline: true });
      return;
    }
    this.setState({ error: null, stillOffline: false });
  }

  render() {
    const { error, stillOffline } = this.state;
    if (!error) return this.props.children;
    if (!this.shows(error)) throw error;
    const { title, message, exitLabel, onExit } = this.props;
    if (isChunkLoadError(error)) {
      return (
        <div data-screen-code-failed style={{ padding: '20px 14px 48px' }}>
          <RecoveryPanel
            compact
            tone="offline"
            title="This screen could not load"
            primaryLabel="Try again"
            onPrimary={() => this.tryAgain()}
            secondaryLabel={exitLabel}
            onSecondary={onExit || null}
            offerReport={false}
          >
            <p style={{ margin: 0 }}>{stillOffline ? STILL_OFFLINE : CHECK_CONNECTION}</p>
          </RecoveryPanel>
        </div>
      );
    }
    return (
      <RecoveryPanel
        tone="error"
        title={title}
        primaryLabel={exitLabel}
        onPrimary={() => {
          this.setState({ error: null });
          onExit?.();
        }}
        technicalMessage={error?.message || String(error)}
      >
        <p style={{ margin: 0 }}>{message}</p>
      </RecoveryPanel>
    );
  }
}
