import React, { useEffect, useRef } from 'react';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';

/*
 * "WHAT CHANGED" — A READ-ONLY LIST.
 *
 * Items come from buildWhatChanged (src/platform/student/whatChangedModel.js),
 * which builds every sentence from a fixed template. This component adds no
 * text of its own beyond the heading, the "New" marker and "Nothing new", and
 * offers no reply, no dismiss and no message: each row only opens the
 * assignment's result page.
 *
 * `onMarkSeen` is called once, after the list has actually been on screen, so
 * the caller can remember the time on this device. The caller keeps the
 * markers it is showing now (it reads its seen time once per visit), so the
 * "New" labels do not vanish under the student's eyes.
 */
export default function WhatChangedList({ items = [], onOpenAssignment = null, onMarkSeen = null, compact = false }) {
  const list = Array.isArray(items) ? items : [];
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || !list.length || typeof onMarkSeen !== 'function') return;
    marked.current = true;
    onMarkSeen();
  }, [list.length, onMarkSeen]);

  if (!list.length) {
    if (compact) return null;
    return (
      <section aria-labelledby="mm-what-changed-heading" data-what-changed="empty" style={panelStyle}>
        <h2 id="mm-what-changed-heading" style={headingStyle}>What changed</h2>
        <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 14 }}>Nothing new</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="mm-what-changed-heading" data-what-changed="list" style={panelStyle}>
      <h2 id="mm-what-changed-heading" style={headingStyle}>What changed</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {list.map((item) => (
          <li key={item.key} data-what-changed-kind={item.kind}>
            <button
              type="button"
              onClick={() => onOpenAssignment?.(item.assignmentId)}
              style={{
                appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
                width: '100%', boxSizing: 'border-box', minHeight: MIN_TOUCH_TARGET_PX,
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '9px 12px', borderRadius: 10,
                border: '1px solid var(--mm-border)',
                background: item.unseen ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
                color: 'var(--mm-text)', cursor: 'pointer', fontSize: 14, lineHeight: 1.35,
              }}
            >
              {item.unseen && (
                <span
                  data-what-changed-new="true"
                  style={{
                    flexShrink: 0, padding: '2px 8px', borderRadius: 999,
                    background: 'var(--mm-info-text)', color: 'var(--mm-surface)', fontSize: 11, fontWeight: 900, letterSpacing: 0.3,
                  }}
                >
                  New
                </span>
              )}
              <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
                <span style={{ display: 'block', fontWeight: item.unseen ? 800 : 600 }}>{item.text}</span>
                {item.reasonText && (
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--mm-text-muted)', fontSize: 13 }}>
                    Reason: {item.reasonText}
                  </span>
                )}
              </span>
              <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--mm-text-muted)', fontWeight: 900 }}>›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const panelStyle = {
  boxSizing: 'border-box', width: '100%', minWidth: 0, textAlign: 'left',
  padding: '12px clamp(10px, 3vw, 16px)', borderRadius: 12,
  border: '1px solid var(--mm-border)', background: 'var(--mm-surface)',
};

const headingStyle = { margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: 'var(--mm-text)' };
