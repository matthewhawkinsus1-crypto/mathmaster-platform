import React from 'react';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import {
  STUDENT_DESTINATION,
  STUDENT_DESTINATION_LABEL,
  STUDENT_DESTINATION_ORDER,
} from '../../platform/student/navigationModel.js';

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
 * Six controls do not fit across 390px, so the row wraps rather than scrolling
 * sideways — a horizontally scrolling nav hides destinations behind a gesture
 * nobody is told about. Every control is at least 44px tall.
 */

// Re-exported so a screen importing the nav gets its destinations from the
// same place, rather than reaching past it into the navigation model.
export { STUDENT_DESTINATION, STUDENT_DESTINATION_LABEL, STUDENT_DESTINATION_ORDER };

const TONE = Object.freeze({
  [STUDENT_DESTINATION.HOME]: '#174ea6',
  [STUDENT_DESTINATION.ASSIGNMENTS]: '#1a73e8',
  [STUDENT_DESTINATION.GRADES]: '#12633a',
  [STUDENT_DESTINATION.MATH_PATH]: '#5b21b6',
  [STUDENT_DESTINATION.SECURE_EXAMS]: '#3c4043',
});

export default function StudentGlobalNav({
  current = null,
  onNavigate = null,
  onLogout = null,
  // Screens embedded inside another shell (a teacher previewing a student's
  // Path, for instance) have their own way out and must not offer Log Out.
  showLogout = true,
  // A compact row for headers that already carry a title and a Back control.
  dense = false,
  label = 'Student navigation',
  style = null,
}) {
  return (
    <nav
      aria-label={label}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        minWidth: 0, ...style,
      }}
    >
      {STUDENT_DESTINATION_ORDER.map((destination) => {
        const active = current === destination;
        const tone = TONE[destination];
        return (
          <button
            key={destination}
            type="button"
            // The current screen is still a button so the row does not reflow
            // when a student moves between destinations, but it is marked and
            // does not navigate.
            aria-current={active ? 'page' : undefined}
            onClick={() => { if (!active) onNavigate?.(destination); }}
            style={{
              appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
              minHeight: MIN_TOUCH_TARGET_PX,
              padding: dense ? '9px 12px' : '10px 15px',
              borderRadius: 9,
              border: active ? `2px solid ${tone}` : '2px solid transparent',
              background: active ? '#fff' : tone,
              color: active ? tone : '#fff',
              fontWeight: 900, fontSize: dense ? 13 : 14,
              cursor: active ? 'default' : 'pointer',
              overflowWrap: 'anywhere',
            }}
          >
            {STUDENT_DESTINATION_LABEL[destination]}
          </button>
        );
      })}
      {showLogout && onLogout && (
        <button
          type="button"
          onClick={onLogout}
          style={{
            appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
            minHeight: MIN_TOUCH_TARGET_PX, padding: dense ? '9px 12px' : '10px 15px',
            borderRadius: 9, border: '2px solid #dadce0', background: '#f1f3f4',
            color: '#5f6368', fontWeight: 800, fontSize: dense ? 13 : 14, cursor: 'pointer',
          }}
        >
          Log Out
        </button>
      )}
    </nav>
  );
}
