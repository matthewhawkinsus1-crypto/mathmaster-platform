import { Component } from 'react';
import RecoveryPanel from './RecoveryPanel.jsx';
import { isChunkLoadError } from '../../platform/runtime/chunkLoadRecovery.js';
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
 */
export default class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    if (isChunkLoadError(error)) return;
    console.error(`MathMaster ${this.props.source || 'screen'} error:`, error, errorInfo);
    recordClientDiagnostic({
      kind: 'render-error',
      message: error?.message || String(error),
      source: this.props.source || 'screen',
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (isChunkLoadError(error)) throw error;
    const { title, message, exitLabel, onExit } = this.props;
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
