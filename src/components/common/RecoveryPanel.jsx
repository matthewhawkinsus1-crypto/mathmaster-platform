import { useState } from 'react';
import { formatClientDiagnostics } from '../../platform/runtime/clientDiagnostics.js';
import { getMathMasterBuildInfo } from '../../platform/runtime/buildInfo.js';

/*
 * WHAT A STUDENT SEES WHEN PART OF MATHMASTER FAILS.
 *
 * One panel for the root boundary and the question boundary, in three tones:
 *
 *   updated   a chunk of an older build could not load (chunkLoadRecovery.js):
 *             nothing is broken, the tab outlived a deploy — load the new one;
 *   offline   the same failure again right after a reload: the network, or the
 *             deploy itself — say so, and offer to try again;
 *   error     a real failure — say what to do next in plain words, keep the
 *             technical message folded away, and offer a copyable report.
 *
 * No stack traces on screen (they quote code, and they are not something a
 * student can act on); the console still has them.
 */

const TONES = {
  updated: { bg: 'var(--mm-info-bg, #e8f0fe)', border: 'var(--mm-info-border, #aecbfa)', text: 'var(--mm-info-text, #174ea6)' },
  offline: { bg: 'var(--mm-warning-bg, #fef7e0)', border: 'var(--mm-warning-border, #f9ab00)', text: 'var(--mm-warning-text, #7a4f00)' },
  error: { bg: 'var(--mm-warning-bg, #fef7e0)', border: 'var(--mm-warning-border, #f9ab00)', text: 'var(--mm-warning-text, #7a4f00)' },
};

const buttonStyle = {
  minHeight: 44,
  padding: '10px 18px',
  border: 0,
  borderRadius: 10,
  background: 'var(--mm-primary, #174ea6)',
  color: 'var(--mm-on-primary, #ffffff)',
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: 'var(--mm-surface, transparent)',
  color: 'var(--mm-primary, #174ea6)',
  border: '1px solid var(--mm-border, #c5d5ef)',
};

export default function RecoveryPanel({
  tone = 'error',
  title,
  children,
  primaryLabel = '',
  onPrimary = null,
  secondaryLabel = '',
  onSecondary = null,
  technicalMessage = '',
  offerReport = true,
  compact = false,
}) {
  const [copied, setCopied] = useState('');
  const colors = TONES[tone] || TONES.error;
  const build = getMathMasterBuildInfo();

  const copyReport = async () => {
    const text = formatClientDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied. Paste it into a message to your teacher.');
    } catch {
      // Clipboard blocked (http, older Chromebook policy): show it to select.
      setCopied(text);
    }
  };

  return (
    <section
      role="alert"
      data-recovery-panel={tone}
      style={{
        boxSizing: 'border-box',
        width: compact ? '100%' : 'min(640px, 100%)',
        maxWidth: 640,
        margin: '0 auto',
        padding: compact ? '18px 20px' : '24px 26px',
        borderRadius: 14,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: 'var(--mm-text-strong, #1f2937)',
        textAlign: 'left',
        lineHeight: 1.55,
      }}
    >
      <h2 style={{ margin: 0, fontSize: compact ? 18 : 22, color: colors.text }}>{title}</h2>
      <div style={{ marginTop: 10 }}>{children}</div>
      {(onPrimary || onSecondary || offerReport) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          {onPrimary ? <button type="button" onClick={onPrimary} style={buttonStyle}>{primaryLabel}</button> : null}
          {onSecondary ? <button type="button" onClick={onSecondary} style={secondaryButtonStyle}>{secondaryLabel}</button> : null}
          {offerReport ? (
            <button type="button" onClick={copyReport} style={secondaryButtonStyle}>Copy details for your teacher</button>
          ) : null}
        </div>
      )}
      {copied ? (
        <pre
          aria-live="polite"
          style={{ margin: '12px 0 0', padding: copied.includes('\n') ? 10 : 0, whiteSpace: 'pre-wrap', fontSize: 12, background: copied.includes('\n') ? 'var(--mm-surface, transparent)' : 'transparent', borderRadius: 8, userSelect: 'all' }}
        >
          {copied}
        </pre>
      ) : null}
      {technicalMessage ? (
        <details style={{ marginTop: 12, fontSize: 12, color: 'var(--mm-text-muted, #5f6368)' }}>
          <summary style={{ cursor: 'pointer' }}>Technical details</summary>
          <p style={{ margin: '6px 0 0', overflowWrap: 'anywhere' }}>{technicalMessage}</p>
          <p style={{ margin: '4px 0 0' }}>Build {build?.gitSha && build.gitSha !== 'unknown' ? String(build.gitSha).slice(0, 7) : 'dev'}</p>
        </details>
      ) : null}
    </section>
  );
}
