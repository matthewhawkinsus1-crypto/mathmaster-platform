import React, { useId, useState } from 'react';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import {
  STUDENT_DESTINATION,
  STUDENT_DESTINATION_DASHBOARD_MODE,
  STUDENT_DESTINATION_LABEL,
  STUDENT_DESTINATION_ORDER,
  phoneNavGroups,
} from '../../platform/student/navigationModel.js';
import { studentPathFor } from '../../app/routes/appUrl.js';

/*
 * ONE STUDENT NAVIGATION, IN ONE FILE.
 *
 * The destinations were being written out by hand in each screen's header, so
 * they drifted: Home had Grades, My Math Path and Secure Exams; the Grade
 * Center had a single "← Home"; My Math Path had a button labelled
 * "Assignments" that went to Home. A student could not learn one pattern,
 * because there was not one.
 *
 * FIVE DESTINATIONS, EACH ANSWERING A DIFFERENT QUESTION.
 *
 *   Home          What should I do now?
 *   Assignments   Where is all of my teacher-assigned work?
 *   Grades        What did I earn, and what has been graded?
 *   My Math Path  What should I practise next, on my own?
 *   Secure Exams  (separate, and deliberately so)
 *
 * They are different questions, which is why they are different screens rather
 * than one dashboard with five panels. The nav's job is to make that visible:
 * the current destination is marked, so a student can always answer "where am
 * I?" without pressing anything.
 *
 * MOBILE IS THE DEFAULT CASE, NOT THE EXCEPTION.
 *
 * Six controls do not fit across 390px. They used to wrap to three rows
 * (about 150px above every screen). On a phone (index.css, max-width 640px)
 * the row now holds Home, Assignments and Grades — plus the screen the
 * student is on, if it is another — and one "More" button that unfolds the
 * rest in place (student pass 3, NAV-13; phoneNavGroups). Nothing scrolls
 * sideways: a horizontally scrolling nav hides destinations behind a gesture
 * nobody is told about. Every control is at least 44px tall.
 *
 * DESTINATIONS ARE LINKS (AX41). Every screen has an address, so each
 * destination is a link to it: it is in a screen reader's links list, and
 * Ctrl/⌘/Shift/middle click opens it in a new tab, where it arrives as a
 * reload does (useUrlArrival). A plain click stays in this tab and goes
 * through `onNavigate`, the same call it made as a button.
 */

// A click the browser should handle: a new tab or window.
const opensElsewhere = (event) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
const destinationHref = (destination) => studentPathFor({ dashboardMode: STUDENT_DESTINATION_DASHBOARD_MODE[destination] });

// Re-exported so a screen importing the nav gets its destinations from the
// same place, rather than reaching past it into the navigation model.
export { STUDENT_DESTINATION, STUDENT_DESTINATION_LABEL, STUDENT_DESTINATION_ORDER };

const TONE = Object.freeze({
  [STUDENT_DESTINATION.HOME]: '#174ea6',
  [STUDENT_DESTINATION.ASSIGNMENTS]: '#1a73e8',
  [STUDENT_DESTINATION.GRADES]: '#12633a',
  [STUDENT_DESTINATION.REWARDS]: '#6a1b9a',
  [STUDENT_DESTINATION.MATH_PATH]: '#5b21b6',
  [STUDENT_DESTINATION.SECURE_EXAMS]: '#3c4043',
});

// The CURRENT destination is drawn as text on the surface, so it needs the
// themed text color of the same hue — the saturated TONE above (a fill behind
// white text) is too dark to read on a dark surface.
const ACTIVE_TEXT = Object.freeze({
  [STUDENT_DESTINATION.HOME]: 'var(--mm-primary-text)',
  [STUDENT_DESTINATION.ASSIGNMENTS]: 'var(--mm-primary)',
  [STUDENT_DESTINATION.GRADES]: 'var(--mm-success-text)',
  [STUDENT_DESTINATION.REWARDS]: 'var(--mm-accent-text)',
  [STUDENT_DESTINATION.MATH_PATH]: 'var(--mm-accent-text)',
  [STUDENT_DESTINATION.SECURE_EXAMS]: 'var(--mm-text)',
});

export default function StudentGlobalNav({
  current = null,
  onNavigate = null,
  // `onLogout` and `showLogout` are still accepted from callers but no longer
  // drawn: Log Out lives in ONE place, the identity bar that is pinned to the
  // top of every student screen (StudentIdentityBar.jsx). Two Log Out buttons
  // a few pixels apart was one too many, and only the bar's asks before
  // throwing away work that has not been sent.
  // A compact row for headers that already carry a title and a Back control.
  dense = false,
  label = 'Student navigation',
  style = null,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const idBase = useId();
  const groups = phoneNavGroups(current);
  const foldedId = (destination) => `${idBase}-more-${destination}`;
  return (
    <nav
      aria-label={label}
      className="mm-student-nav"
      data-more-open={moreOpen ? 'true' : 'false'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !moreOpen) return;
        setMoreOpen(false);
        event.currentTarget.querySelector('.mm-student-nav__more')?.focus();
      }}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        minWidth: 0, ...style,
      }}
    >
      {STUDENT_DESTINATION_ORDER.map((destination) => {
        const active = current === destination;
        const tone = TONE[destination];
        const folded = groups.folded.includes(destination);
        return (
          <a
            key={destination}
            href={destinationHref(destination)}
            id={folded ? foldedId(destination) : undefined}
            className={folded ? 'mm-student-nav__folded' : undefined}
            // The current screen is still a link so the row does not reflow
            // when a student moves between destinations, but it is marked and
            // does not navigate.
            aria-current={active ? 'page' : undefined}
            onClick={(event) => {
              if (opensElsewhere(event)) return;
              event.preventDefault();
              if (!active) onNavigate?.(destination);
            }}
            style={{
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', textDecoration: 'none', boxSizing: 'border-box',
              minHeight: MIN_TOUCH_TARGET_PX,
              padding: dense ? '9px 12px' : '10px 15px',
              borderRadius: 9,
              border: active ? `2px solid ${tone}` : '2px solid transparent',
              background: active ? 'var(--mm-surface)' : tone,
              color: active ? ACTIVE_TEXT[destination] : '#fff',
              fontWeight: 900, fontSize: dense ? 'calc(13 * var(--mm-px))' : 'calc(14 * var(--mm-px))',
              cursor: active ? 'default' : 'pointer',
              overflowWrap: 'anywhere',
            }}
          >
            {STUDENT_DESTINATION_LABEL[destination]}
          </a>
        );
      })}
      {/* Drawn only on a phone (index.css): unfolds the places above. */}
      <button
        type="button"
        className="mm-student-nav__more"
        aria-expanded={moreOpen}
        aria-controls={groups.folded.map(foldedId).join(' ')}
        onClick={(event) => {
          const opening = !moreOpen;
          setMoreOpen(opening);
          // The unfolded places come before More in the row, so Tab from More
          // would leave the nav: opening moves focus to the first of them.
          if (opening) {
            const nav = event.currentTarget.closest('nav');
            window.requestAnimationFrame(() => nav?.querySelector('.mm-student-nav__folded')?.focus());
          }
        }}
        style={{
          appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
          minHeight: MIN_TOUCH_TARGET_PX,
          padding: dense ? '9px 12px' : '10px 15px',
          borderRadius: 9,
          border: '2px solid var(--mm-border)',
          background: 'var(--mm-surface)',
          color: 'var(--mm-text)',
          fontWeight: 900, fontSize: dense ? 'calc(13 * var(--mm-px))' : 'calc(14 * var(--mm-px))',
          cursor: 'pointer', gap: 6,
        }}
      >
        {moreOpen ? 'Less' : 'More'}
        <span aria-hidden="true" style={{ display: 'inline-block', transform: moreOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
    </nav>
  );
}
