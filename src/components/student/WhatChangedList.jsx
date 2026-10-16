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
 * `onMarkSeen` is called once, after the list has actually been on screen —
 * half of it in view, not merely mounted below the fold (student pass 3,
 * NAV-6) — so the caller can remember the time on this device. The caller
 * keeps the markers it is showing now (it reads its seen time once per
 * visit), so the "New" labels do not vanish under the student's eyes.
 *
 * `compact` (Home) never prints a grade change's reason: Home is the screen
 * most often read over a shoulder (NAV-7). Grades and the result page do.
 */
export default function WhatChangedList({ items = [], onOpenAssignment = null, onMarkSeen = null, compact = false }) {
  const list = Array.isArray(items) ? items : [];
  const marked = useRef(false);
  const sectionRef = useRef(null);
  // The caller's handler, read when the list is seen: the observer is not
  // rebuilt every time the caller re-renders with a new function.
  const onMarkSeenRef = useRef(onMarkSeen);
  onMarkSeenRef.current = onMarkSeen;
  const hasItems = list.length > 0;
  const canMark = typeof onMarkSeen === 'function';

  useEffect(() => {
    if (marked.current || !hasItems || !canMark) return undefined;
    const mark = () => {
      if (marked.current) return;
      marked.current = true;
      onMarkSeenRef.current?.();
    };
    const node = sectionRef.current;
    // No observer to ask (an old browser): the list counts as seen once shown.
    if (!node || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      mark();
      return undefined;
    }
    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        observer.disconnect();
        mark();
      }
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasItems, canMark]);

  if (!list.length) {
    if (compact) return null;
    return (
      <section aria-labelledby="mm-what-changed-heading" data-what-changed="empty" style={panelStyle}>
        <h2 id="mm-what-changed-heading" style={headingStyle}>What changed</h2>
        <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' }}>Nothing new</p>
      </section>
    );
  }

  return (
    <section ref={sectionRef} aria-labelledby="mm-what-changed-heading" data-what-changed="list" style={panelStyle}>
      {/* Focusable for Home's "N updates →" (NAV-6), never in the Tab order. */}
      <h2 id="mm-what-changed-heading" tabIndex={-1} style={headingStyle}>What changed</h2>
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
                color: 'var(--mm-text)', cursor: 'pointer', fontSize: 'calc(14 * var(--mm-px))', lineHeight: 1.35,
              }}
            >
              {item.unseen && (
                <span
                  data-what-changed-new="true"
                  style={{
                    flexShrink: 0, padding: '2px 8px', borderRadius: 999,
                    background: 'var(--mm-info-text)', color: 'var(--mm-surface)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, letterSpacing: 0.3,
                  }}
                >
                  New
                </span>
              )}
              <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
                <span style={{ display: 'block', fontWeight: item.unseen ? 800 : 600 }}>{item.text}</span>
                {item.reasonText && !compact && (
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>
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

const headingStyle = { margin: '0 0 8px', fontSize: 'calc(16 * var(--mm-px))', fontWeight: 900, color: 'var(--mm-text)' };
