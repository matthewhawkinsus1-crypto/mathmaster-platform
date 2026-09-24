import React, { useState } from 'react';
import useBuildFreshness from '../../platform/runtime/useBuildFreshness.js';
import { BUILD_FRESHNESS_STATUS } from '../../platform/runtime/buildFreshness.js';

// A quiet strip at the bottom of the screen, never a modal: a student in the
// middle of a step finishes it first. Reload is always their choice.
export default function BuildFreshnessNotice() {
  const freshness = useBuildFreshness();
  const [dismissedStatus, setDismissedStatus] = useState(null);
  const visible = (
    freshness.status === BUILD_FRESHNESS_STATUS.NEWER_BUILD_AVAILABLE
    || freshness.status === BUILD_FRESHNESS_STATUS.RETIRED_HOST
  ) && dismissedStatus !== `${freshness.status}:${freshness.liveSha || ''}`;
  if (!visible) return null;

  const retired = freshness.status === BUILD_FRESHNESS_STATUS.RETIRED_HOST;
  return (
    <div
      role="status"
      data-build-freshness={freshness.status}
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 2147483000,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        maxWidth: 720, margin: '0 auto', padding: '10px 14px', borderRadius: 12,
        background: retired ? '#fce8e6' : '#e8f0fe', color: '#202124',
        border: `1px solid ${retired ? '#f28b82' : '#aecbfa'}`,
        boxShadow: '0 8px 24px rgba(32,33,36,0.18)', fontSize: 14, lineHeight: 1.4,
      }}
    >
      <span style={{ flex: '1 1 260px' }}>{freshness.message}</span>
      {retired ? (
        <a
          href={freshness.canonicalOrigin}
          style={{ padding: '8px 14px', borderRadius: 8, background: '#b3261e', color: '#fff', fontWeight: 800, textDecoration: 'none' }}
        >
          Open current MathMaster
        </a>
      ) : (
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ minHeight: 40, padding: '8px 14px', border: 0, borderRadius: 8, background: '#174ea6', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
        >
          Reload
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss update notice"
        onClick={() => setDismissedStatus(`${freshness.status}:${freshness.liveSha || ''}`)}
        style={{ minHeight: 40, padding: '8px 12px', border: '1px solid #c4c7c5', borderRadius: 8, background: '#fff', color: '#3c4043', cursor: 'pointer' }}
      >
        Later
      </button>
    </div>
  );
}
