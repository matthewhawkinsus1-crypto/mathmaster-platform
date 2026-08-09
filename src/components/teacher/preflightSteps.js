// The Pre-Flight review as a sequence of decisions rather than one long form.
//
// On a desktop the single scrolling page worked because the whole thing is
// visible at once: a teacher scans it, sees the red block at the bottom, and
// fixes it. On a phone the same page is roughly eight screens tall, the reason
// the Create button is disabled is three screens below the button, and the
// student preview is a 210px sidebar next to a 180px question. The fix is not
// media queries on that layout — it is to break the page into steps, and to
// make every blocker say which step it belongs to so the phone can show a badge
// instead of asking the teacher to go hunting.
//
// Kept free of React so the grouping and the readiness maths are testable.
//
// TWO ACTIONS, NOT ONE. Since the assignment library exists, this screen serves
// both "save this for later" and "give this to a class today". They need
// different things — the second needs a due date, the first needs nothing but a
// title — so the blockers are conditional on which action the teacher is
// actually taking, which is decided by whether any class is selected.

import { CREATION_MODE_LABELS, resolveCreationMode } from '../../assignmentDestinations.js';

export const PREFLIGHT_STEPS = Object.freeze([
  { id: 'details', label: 'Details', hint: 'Title, folder and dates' },
  { id: 'classes', label: 'Classes', hint: 'Who receives it' },
  { id: 'delivery', label: 'Delivery', hint: 'Type, DOL and posting' },
  { id: 'check', label: 'Check', hint: 'Preview, then create' },
]);

export const PREFLIGHT_STEP_IDS = Object.freeze(PREFLIGHT_STEPS.map((step) => step.id));

const blocker = (stepId, message) => ({ stepId, message });

const parseDate = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

/**
 * Every reason the assignment cannot be created yet, each tagged with the step
 * that can fix it. Order is the order a teacher would work through them.
 */
export const collectReviewBlockers = ({
  draft: rawDraft = {},
  classPeriods = [],
  honorsSelected = false,
  honorsReport = null,
} = {}) => {
  // A `= {}` default only fires for undefined, so an explicit null draft — the
  // shape a half-initialised modal actually passes — would throw on `.title`.
  const draft = rawDraft && typeof rawDraft === 'object' && !Array.isArray(rawDraft) ? rawDraft : {};
  const blockers = [];

  const assignedPeriods = Array.isArray(draft.assignedClassPeriods) ? draft.assignedClassPeriods : [];
  // Saving to the library and assigning to students are different actions with
  // different requirements. A title is the only thing both need.
  const mode = resolveCreationMode({ assignedClassPeriods: assignedPeriods });

  if (!String(draft.title || '').trim()) {
    blockers.push(blocker('details', 'Give the assignment a title.'));
  }
  // A due date matters only once somebody is going to receive it. Requiring one
  // to save to the library forced teachers to invent a date and then remember
  // to fix it, which is worse than having none.
  if (mode === 'assign' && !draft.dueAt) {
    blockers.push(blocker('details', 'Set a due date before assigning this to students.'));
  }
  // The late window is optional now. Without one, work after the due date is
  // practice rather than a second graded chance.
  if (draft.dueAt && draft.lateDueAt) {
    const due = parseDate(draft.dueAt);
    const late = parseDate(draft.lateDueAt);
    if (due === null || late === null || late <= due) {
      blockers.push(blocker('details', 'The final late due date must be after the regular due date.'));
    }
  }
  if (draft.releaseAt && draft.dueAt) {
    const release = parseDate(draft.releaseAt);
    const due = parseDate(draft.dueAt);
    // A release after the due date hides the assignment until it is already
    // late, which reads as "nothing appeared" to every student in the class.
    if (release !== null && due !== null && release >= due) {
      blockers.push(blocker('details', 'The release time must be before the due date, or students will never see it open.'));
    }
  }

  // Selecting no class is no longer a blocker — it is the library path, and the
  // Check step says so rather than the Classes step complaining about it.
  if (honorsSelected && honorsReport && !honorsReport.isHonorsReady) {
    blockers.push(blocker('classes', 'An Honors class is selected, so the missing rigor and CCMR elements have to be resolved first.'));
  }

  if (draft.dolEnabled === true) {
    const minutes = Number(draft.dolMinutesBeforeEnd);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 30) {
      blockers.push(blocker('delivery', 'The DOL window must open between 1 and 30 minutes before the period ends.'));
    }
  }

  return blockers;
};

/**
 * Fold the tagged blockers and the bundle validation errors into what each
 * screen needs: a count per step, a flat list, and whether Create can run.
 */
export const summarizePreflightReadiness = ({
  blockers = [],
  validationErrors = [],
  bundleIsValid = true,
} = {}) => {
  const safeBlockers = Array.isArray(blockers) ? blockers.filter(Boolean) : [];
  const safeValidation = (Array.isArray(validationErrors) ? validationErrors : []).filter(Boolean);

  // Bundle validation is about the file itself, not about a decision the
  // teacher makes on one of the first three steps, so it belongs to Check.
  const all = [
    ...safeBlockers,
    ...safeValidation.map((message) => blocker('check', String(message))),
  ];

  const countByStep = Object.fromEntries(PREFLIGHT_STEP_IDS.map((id) => [id, 0]));
  all.forEach((entry) => {
    if (countByStep[entry.stepId] === undefined) countByStep[entry.stepId] = 0;
    countByStep[entry.stepId] += 1;
  });

  return {
    all,
    countByStep,
    total: all.length,
    // The first step still carrying a problem, so "Fix it" has somewhere to go.
    firstBlockedStep: PREFLIGHT_STEP_IDS.find((id) => countByStep[id] > 0) || null,
    canCreate: all.length === 0 && bundleIsValid !== false,
  };
};

export const blockersForStep = (readiness, stepId) => (
  (readiness?.all || []).filter((entry) => entry.stepId === stepId)
);

export const stepIndex = (stepId) => {
  const index = PREFLIGHT_STEP_IDS.indexOf(stepId);
  return index === -1 ? 0 : index;
};

/**
 * What the primary button says and what it will do, from the same predicate the
 * blockers use. The label is the honest description of the action, so a teacher
 * cannot press "Create & Assign" and get an unassigned library item.
 */
export const describePreflightAction = (draft) => {
  const safeDraft = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  const mode = resolveCreationMode({ assignedClassPeriods: safeDraft.assignedClassPeriods });
  return { mode, ...CREATION_MODE_LABELS[mode] };
};
