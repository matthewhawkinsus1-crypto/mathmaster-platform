import React, { useLayoutEffect, useRef } from 'react';
import { STUDENT_SELF_NEUTRAL_LABEL, formatStudentName } from '../../platform/studentName.js';
import StarIcon from '../common/StarIcon.jsx';
import './StudentIdentityBar.css';

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
 *
 * On a phone it is one line (StudentIdentityBar.css, below 480px): it stays
 * pinned and keeps the name, the period, the points and Log Out, and gives the
 * rest of the screen back to the work (PQ-021).
 */
export default function StudentIdentityBar({ student = null, preview = false, classPointsBalance = null, onLogout = null }) {
  const barRef = useRef(null);
  // The student's own name, or the neutral "Student" — never their id and
  // never the teacher-facing "Name unavailable".
  const name = preview
    ? 'Teacher Preview'
    : formatStudentName(student, { lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL });
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

  // Layout that changes on a phone (wrapping, gaps, truncation) lives in the
  // stylesheet, where a media query can reach it; inline style would win.
  return (
    <aside
      ref={barRef}
      className="mm-identity-bar"
      aria-label={preview ? 'Teacher preview identity' : 'Signed-in student identity'}
      data-student-identity={preview ? 'preview' : 'authenticated'}
      style={{
        position: 'sticky', top: 0, zIndex: STUDENT_IDENTITY_Z_INDEX, boxSizing: 'border-box', width: '100%',
        minHeight: 38, padding: '7px clamp(10px, 3vw, 22px)', background: preview ? '#fef7e0' : '#17365d',
        color: preview ? '#6b4c00' : '#fff', borderBottom: preview ? '1px solid #f9ab00' : '1px solid #0d2948',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: '"Segoe UI", sans-serif', fontSize: 13, lineHeight: 1.25,
      }}
    >
      <div className="mm-identity-main" style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <strong className="mm-identity-name" title={`${name}${context ? ` • ${context}` : ''}`} style={{ minWidth: 0, fontSize: 15 }}>
          {name}{context ? ` • ${context}` : ''}
        </strong>
        {/* The star is drawn: ⭐ was a box on devices without an emoji font
            (PQ-030). On a phone the words "Class Points" are visually hidden,
            not removed, so the chip still reads "120 Class Points". */}
        {!preview && Number.isFinite(classPointsBalance) && <span aria-label={`${classPointsBalance} Class Points`} className="mm-identity-points" style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 999, background: '#fff3c4', color: '#5f4400', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}><StarIcon /> {classPointsBalance}<span className="mm-identity-points-word"> Class Points</span></span>}
      </div>
      {!preview && onLogout && (
        <span className="mm-identity-logout" style={{ flexShrink: 0 }}>
          <span className="mm-identity-not-you">Not you? </span>
          <button
            type="button"
            onClick={onLogout}
            style={{ padding: 0, border: 0, background: 'transparent', color: '#fff', font: 'inherit', fontWeight: 900, textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Log Out
          </button>
        </span>
      )}
    </aside>
  );
}
