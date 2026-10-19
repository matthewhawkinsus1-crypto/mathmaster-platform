/*
 * SCREEN CHANGES ARE NOT SILENT (student pass 3, NAV-3).
 *
 * Each student screen draws its own navigation, so the button a student
 * pressed ("Grades") unmounts with the old screen: focus fell to <body> and
 * nothing was said. A screen-reader student had to Tab from the top to learn
 * where they were. After every student screen change — not the first screen
 * after sign-in — the App shell now:
 *
 *   1. moves focus to the new screen's top heading (its h1, inside the main
 *      landmark), so the next thing read is the screen's name, and the next
 *      Tab continues from there; and
 *   2. says the screen's name once in one polite live region.
 *
 * It never takes focus the student (or the screen itself) already put inside
 * the new screen, and inside an assignment it only speaks: the workspace
 * places its own focus on the work (QuestionEngine, the restored-draft focus).
 *
 * Plain JS, no React, so node tests can run it against a fake document.
 */

import { MAIN_CONTENT_ID } from '../../components/common/skipTarget.js';

const visible = (element) => Boolean(element && element.getClientRects?.().length > 0);

/**
 * One string per student screen: a change of this key is a screen change.
 * Null for anyone who is not a signed-in student (teachers keep their own
 * focus behaviour).
 */
export const studentScreenKey = ({
  role = null,
  view = null,
  mode = null,
  resultAssignmentId = null,
  testCycleAssignmentId = null,
  assignmentId = null,
} = {}) => {
  if (role !== 'student' || !view) return null;
  if (view === 'assignment') return `assignment:${assignmentId || ''}`;
  if (view === 'assignmentResult') return `result:${resultAssignmentId || ''}`;
  if (view === 'dashboard') {
    if (mode === 'testCycle') return `testCycle:${testCycleAssignmentId || ''}`;
    return `dashboard:${mode || 'assignments'}`;
  }
  return `${view}`;
};

/** What the live region says: the screen's name, from the document title. */
export const screenAnnouncement = (title = '') => String(title || '')
  .replace(/\s+[–-]\s+MathMaster\s*$/, '')
  .trim();

/** Whether this change should move focus, or only speak. */
export const screenChangeMovesFocus = (nextKey = '') => !String(nextKey || '').startsWith('assignment:');

/**
 * The new screen's top heading: the first visible h1 inside the main landmark,
 * else the first visible h1 anywhere, else the main landmark itself. Null
 * while the screen is still loading (a lazy screen draws its heading later).
 */
export const screenHeadingTarget = (doc) => {
  if (!doc) return null;
  const mains = [...doc.querySelectorAll('main, [role="main"]')].filter(visible);
  for (const main of mains) {
    const heading = [...main.querySelectorAll('h1')].find(visible);
    if (heading) return heading;
  }
  const heading = [...doc.querySelectorAll('h1')].find(visible);
  if (heading) return heading;
  return mains[0] || null;
};

/**
 * Focus is already where the new screen wants it: inside a main landmark or a
 * dialog the screen opened, on something other than the page itself.
 */
export const focusAlreadyPlaced = (doc) => {
  const active = doc?.activeElement;
  if (!active || active === doc.body || active === doc.documentElement) return false;
  if (active.isConnected === false) return false;
  if (active.id === MAIN_CONTENT_ID) return false;
  return Boolean(active.closest?.('main, [role="main"], [role="dialog"]'));
};

/**
 * Put focus on the screen's heading. Returns the element focused, or null.
 * A heading is given tabindex="-1" so it can take focus without entering the
 * Tab order.
 */
export const focusScreenHeading = (doc) => {
  if (!doc || focusAlreadyPlaced(doc)) return null;
  const target = screenHeadingTarget(doc);
  if (!target) return null;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return target;
};
