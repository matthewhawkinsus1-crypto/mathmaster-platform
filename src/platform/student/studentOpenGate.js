import { assignmentIsArchived, assignmentIsUnpublished } from '../../../functions/shared/assessmentAvailability.mjs';

/*
 * WHY AN ASSIGNMENT DID NOT OPEN, SAID WHERE THE STUDENT CAN READ IT
 * (student pass 3, NAV-4 and NAV-10).
 *
 * A paused or archived lesson left Home without a word, while Grades
 * ("MISSING · Start"), Ways to raise and a Classroom link still opened it
 * straight into the workspace. And a start that could not happen — finish the
 * earlier lesson first, not open yet, excused — was explained only by a
 * five-second toast, gone before a slow reader finished it.
 *
 * Now every path into an assignment (App's startAssignment: Home, Assignments,
 * Grades, Ways to raise, a Classroom link, an address) asks the same question
 * first, and a start that cannot happen lands on the assignment's result page,
 * whose "what opens when" panel carries the notice built here. The result page
 * already says, section by section, what opens when.
 *
 * Pure: no React, no clock (the caller formats any time it passes in).
 */

export const TEACHER_CLOSED = Object.freeze({
  PAUSED: 'paused',
  ARCHIVED: 'archived',
});

/** 'paused' | 'archived' | null — the teacher has closed this to students. */
export const teacherClosedState = (assignment) => {
  if (assignmentIsArchived(assignment)) return TEACHER_CLOSED.ARCHIVED;
  if (assignmentIsUnpublished(assignment)) return TEACHER_CLOSED.PAUSED;
  return null;
};

export const OPEN_NOTICE = Object.freeze({
  PAUSED: 'paused',
  ARCHIVED: 'archived',
  PREREQUISITE: 'prerequisite',
  NOT_OPEN_YET: 'notOpenYet',
  EXCUSED: 'excused',
});

const clean = (value) => String(value ?? '').trim();

/**
 * The notice the result page shows, { kind, title, text }, or null for a kind
 * it does not know. `opensAtText` is the release time already formatted for
 * the student ("Oct 21, 2026, 2:15 PM"); `prerequisiteTitle` names the lesson
 * to finish first.
 */
export const describeOpenNotice = ({ kind = null, prerequisiteTitle = '', opensAtText = '' } = {}) => {
  const opensAt = clean(opensAtText);
  switch (kind) {
    case OPEN_NOTICE.PAUSED:
      return {
        kind,
        title: 'Your teacher paused this',
        text: 'Your teacher paused this — your work is saved. It opens again when your teacher turns it back on.',
      };
    case OPEN_NOTICE.ARCHIVED:
      return {
        kind,
        title: 'Your teacher put this away',
        text: 'Your teacher put this away — your work and your grade are saved.',
      };
    case OPEN_NOTICE.PREREQUISITE: {
      const before = clean(prerequisiteTitle);
      return {
        kind,
        title: 'Finish the earlier lesson first',
        text: `${before ? `Finish ${before} first` : 'Finish the lesson before this one first'}, and then this opens.${opensAt ? ` It also opens by itself on ${opensAt}.` : ''}`,
      };
    }
    case OPEN_NOTICE.NOT_OPEN_YET:
      return {
        kind,
        title: 'Not open yet',
        text: opensAt ? `This opens on ${opensAt}.` : 'This opens later. Your teacher has set when.',
      };
    case OPEN_NOTICE.EXCUSED:
      return {
        kind,
        title: 'You are excused from this',
        text: 'Your teacher excused you, so there is nothing to turn in. Your results are below.',
      };
    default:
      return null;
  }
};

/** The notice for a lesson the teacher closed, or null when it is open. */
export const teacherClosedNotice = (assignment) => {
  const state = teacherClosedState(assignment);
  return state ? describeOpenNotice({ kind: state }) : null;
};
