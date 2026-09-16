import React, { useLayoutEffect, useRef } from 'react';
import { formatStudentName } from '../../platform/studentName.js';

export const STUDENT_IDENTITY_STACK_OFFSET = '--mm-student-identity-stack-offset';
export const STUDENT_IDENTITY_Z_INDEX = 21000;

const periodLabel = (value) => {
  const period = String(value || '').trim();
  if (!period) return '';
  return /^period\b/i.test(period) ? period : `Period ${period}`;
};

/**
 * Persistent account-integrity marker for every authenticated student surface.
 * This bar deliberately owns no grade, assignment, or evidence behavior.
 */
export default function StudentIdentityBar({ student = null, preview = false, classPointsBalance = null, onLogout = null }) {
  const barRef = useRef(null);
  const name = preview
    ? 'Teacher Preview'
    : formatStudentName(student, { lastFirst: false });
  const context = preview ? 'Student View' : periodLabel(student?.classPeriod);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof document === 'undefined') return undefined;
    const publishHeight = () => {
      document.documentElement.style.setProperty(STUDENT_IDENTITY_STACK_OFFSET, `${bar.offsetHeight}px`);
    };
    publishHeight();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publishHeight) : null;
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty(STUDENT_IDENTITY_STACK_OFFSET);
    };
  }, []);

  return (
    <aside
      ref={barRef}
      aria-label={preview ? 'Teacher preview identity' : 'Signed-in student identity'}
      data-student-identity={preview ? 'preview' : 'authenticated'}
      style={{
        position: 'sticky', top: 0, zIndex: STUDENT_IDENTITY_Z_INDEX, boxSizing: 'border-box', width: '100%',
        minHeight: 38, padding: '7px clamp(10px, 3vw, 22px)', background: preview ? '#fef7e0' : '#17365d',
        color: preview ? '#6b4c00' : '#fff', borderBottom: preview ? '1px solid #f9ab00' : '1px solid #0d2948',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        fontFamily: '"Segoe UI", sans-serif', fontSize: 13, lineHeight: 1.25,
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 15 }}>
          {name}{context ? ` • ${context}` : ''}
        </strong>
        {!preview && Number.isFinite(classPointsBalance) && <span aria-label={`${classPointsBalance} Class Points`} style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 999, background: '#fff3c4', color: '#5f4400', fontSize: 12, fontWeight: 800 }}>⭐ {classPointsBalance} Class Points</span>}
      </div>
      {!preview && onLogout && (
        <span style={{ flexShrink: 0 }}>
          <span className="mm-identity-not-you">Not you? </span>
          <button
            type="button"
            onClick={onLogout}
            style={{ padding: 0, border: 0, background: 'transparent', color: '#fff', font: 'inherit', fontWeight: 900, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Log Out
          </button>
        </span>
      )}
    </aside>
  );
}
