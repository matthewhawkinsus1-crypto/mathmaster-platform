import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import { LOGOUT_RISK_MESSAGE } from '../../platform/student/logoutGuard.js';
import { STUDENT_SELF_NEUTRAL_LABEL, formatStudentName } from '../../platform/studentName.js';
import StarIcon from '../common/StarIcon.jsx';
import Dialog from '../../ui/Dialog.jsx';
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
 *
 * This is the ONE Log Out on a student screen (StudentGlobalNav no longer
 * draws a second one). When `logoutRisk` is set — describeLogoutRisk() in
 * src/platform/student/logoutGuard.js says this device still holds work that
 * has not been sent — Log Out asks first. It never blocks: "Log out anyway"
 * is always one press away.
 */
export default function StudentIdentityBar({ student = null, preview = false, classPointsBalance = null, onLogout = null, logoutRisk = null }) {
  const barRef = useRef(null);
  const stayRef = useRef(null);
  const logoutRef = useRef(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const handleLogoutPress = () => {
    if (logoutRisk) setConfirmingLogout(true);
    else onLogout?.();
  };
  const confirmLogout = () => {
    setConfirmingLogout(false);
    onLogout?.();
  };
  // Stay (or Escape) closes the question and puts focus back on Log Out, so a
  // keyboard user is not dropped at the top of the page.
  const stayLoggedIn = () => {
    setConfirmingLogout(false);
    logoutRef.current?.focus();
  };
  // The queue drained while the question was open: nothing is at risk now,
  // so the question no longer applies.
  useEffect(() => {
    if (!logoutRisk) setConfirmingLogout(false);
  }, [logoutRisk]);
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
    <>
      <aside
        ref={barRef}
        className="mm-identity-bar"
        aria-label={preview ? 'Teacher preview identity' : 'Signed-in student identity'}
        data-student-identity={preview ? 'preview' : 'authenticated'}
        style={{
          position: 'sticky', top: 0, zIndex: STUDENT_IDENTITY_Z_INDEX, boxSizing: 'border-box', width: '100%',
          minHeight: 38, padding: '7px clamp(10px, 3vw, 22px)', background: preview ? 'var(--mm-warning-bg)' : '#17365d',
          color: preview ? 'var(--mm-warning-text)' : '#fff', borderBottom: preview ? '1px solid #f9ab00' : '1px solid #0d2948',
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
          {!preview && Number.isFinite(classPointsBalance) && <span className="mm-identity-points" style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 999, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}><StarIcon /> {classPointsBalance}<span className="mm-identity-points-word"> Class Points</span></span>}
        </div>
        {!preview && onLogout && (
          <span className="mm-identity-logout" style={{ flexShrink: 0 }}>
            <span className="mm-identity-not-you">Not you? </span>
            <button
              ref={logoutRef}
              type="button"
              onClick={handleLogoutPress}
              aria-haspopup={logoutRisk ? 'dialog' : undefined}
              style={{ padding: 0, border: 0, background: 'transparent', color: '#fff', font: 'inherit', fontWeight: 900, textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Log Out
            </button>
          </span>
        )}
      </aside>
        {!preview && onLogout && confirmingLogout && logoutRisk && (
          // The shared Dialog (job F): focus starts on the safe action, Tab
          // stays inside, Escape means "Stay", and focus returns to Log Out.
          <Dialog
            role="alertdialog"
            onClose={stayLoggedIn}
            initialFocusRef={stayRef}
            aria-labelledby="mm-logout-risk-message"
            data-logout-confirm="open"
            // A popover under the pinned bar, outside it: the bar's own layout
            // (one line on a phone) is the stylesheet's, and this must not
            // change its measured height.
            style={{
              position: 'fixed', top: `calc(var(${STUDENT_IDENTITY_STACK_OFFSET}, 38px) + 6px)`, right: 'clamp(8px, 3vw, 22px)',
              zIndex: STUDENT_IDENTITY_Z_INDEX + 1,
              width: 'min(420px, calc(100vw - 16px))', boxSizing: 'border-box',
              padding: 14, borderRadius: 12, border: '1px solid var(--mm-warning-border, #f9ab00)',
              background: 'var(--mm-surface)', color: 'var(--mm-text)', boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
              fontSize: 14, lineHeight: 1.4, textAlign: 'left',
            }}
          >
            <p id="mm-logout-risk-message" style={{ margin: '0 0 10px', fontWeight: 700 }}>
              {logoutRisk.message || LOGOUT_RISK_MESSAGE}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                ref={stayRef}
                type="button"
                onClick={stayLoggedIn}
                style={{ minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 14px', borderRadius: 9, border: 0, background: 'var(--mm-info-text)', color: 'var(--mm-surface)', font: 'inherit', fontWeight: 900, cursor: 'pointer', flex: '1 1 auto' }}
              >
                Stay and let it send
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                style={{ minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 14px', borderRadius: 9, border: '2px solid var(--mm-border)', background: 'var(--mm-surface-control)', color: 'var(--mm-text)', font: 'inherit', fontWeight: 800, cursor: 'pointer', flex: '1 1 auto' }}
              >
                Log out anyway
              </button>
            </div>
          </Dialog>
        )}
    </>
  );
}
