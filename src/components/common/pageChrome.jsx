import React, { useEffect } from 'react';

/*
 * PAGE TITLE AND SKIP LINK (WCAG 2.4.2 Page Titled, 2.4.1 Bypass Blocks).
 *
 * Every tab said "Vite + React" — the scaffold's title — whatever screen was
 * open, so a screen-reader student switching tabs, or reading the window list,
 * could not tell MathMaster from anything else, or Grades from an assignment.
 * The title now names the screen.
 *
 * The skip link is the first thing Tab reaches on a student screen: it jumps
 * past the identity bar and the navigation to the screen's content, so a
 * keyboard student does not walk the whole nav on every screen.
 */

export const MAIN_CONTENT_ID = 'mm-main-content';

const STUDENT_MODE_TITLES = Object.freeze({
  home: 'Home',
  assignments: 'Home',
  assignmentsCenter: 'Assignments',
  grades: 'Grades',
  rewards: 'My Rewards',
  mathPath: 'My Math Path',
  testCycle: 'Tests & Exams',
  secureExams: 'Tests & Exams',
  liveChallenge: 'Live Challenge',
});

const humanize = (value) => String(value || '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[-_]+/g, ' ')
  .trim()
  .replace(/^\w/, (letter) => letter.toUpperCase());

/** The document title for what is on screen. Pure. */
export const pageTitleFor = ({ signedIn = true, role = null, view = null, studentMode = null, teacherTab = null, assignmentTitle = '' } = {}) => {
  const suffix = 'MathMaster';
  if (!signedIn) return `Sign in – ${suffix}`;
  if (role === 'student') {
    if (view === 'assignment') return `${String(assignmentTitle || '').trim() || 'Assignment'} – ${suffix}`;
    if (view === 'assignmentResult') return `Assignment result – ${suffix}`;
    const screen = STUDENT_MODE_TITLES[studentMode] || humanize(studentMode) || 'Home';
    return `${screen} – ${suffix}`;
  }
  if (view === 'assignment' || view === 'teacherPreview') return `${String(assignmentTitle || '').trim() || 'Assignment preview'} – ${suffix}`;
  const tab = humanize(teacherTab);
  return tab ? `${tab} – ${suffix}` : suffix;
};

export const useDocumentTitle = (title) => {
  useEffect(() => {
    if (typeof document !== 'undefined' && title) document.title = title;
  }, [title]);
};

// Each student screen renders its own navigation INSIDE its content, so the
// shell's anchor sits before the nav. Land on the first main landmark or
// heading AFTER the navigation; the anchor is the fallback.
const NAVIGATION_SELECTOR = 'nav[aria-label="Student navigation"]';
export const skipTarget = (doc, targetId = MAIN_CONTENT_ID) => {
  if (!doc) return null;
  const anchor = doc.getElementById(targetId);
  const nav = [...doc.querySelectorAll(NAVIGATION_SELECTOR)].find((element) => element.getClientRects().length > 0);
  if (nav) {
    const after = [...doc.querySelectorAll('main, [role="main"], h1, h2')].find((element) => (
      !nav.contains(element)
      && (nav.compareDocumentPosition(element) & 4) // DOCUMENT_POSITION_FOLLOWING
      && element.getClientRects().length > 0
    ));
    if (after) return after;
  }
  return anchor;
};

/** Visually hidden until focused; moves focus to the main content. */
export function SkipToContent({ targetId = MAIN_CONTENT_ID, label = 'Skip to main content' }) {
  return (
    <a
      className="mm-skip-link"
      href={`#${targetId}`}
      onClick={(event) => {
        const target = skipTarget(typeof document !== 'undefined' ? document : null, targetId);
        if (!target) return;
        event.preventDefault();
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.scrollIntoView?.({ block: 'start' });
      }}
    >
      {label}
    </a>
  );
}
