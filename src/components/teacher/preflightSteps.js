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
  { id: 'delivery', label: 'Delivery', hint: 'Roles, DOL and posting' },
  { id: 'check', label: 'Check', hint: 'Preview, then create' },
]);

export const PREFLIGHT_STEP_IDS = Object.freeze(PREFLIGHT_STEPS.map((step) => step.id));

const blocker = (stepId, message) => ({ stepId, message });

const HONORS_BLOCKER_LABELS = Object.freeze({
  coreTeks: 'Core TEKS alignment',
  higherOrderReasoning: 'higher-order reasoning',
  multipleRepresentations: 'multiple representations',
  justification: 'explanation / justification',
  modelingApplication: 'modeling / application',
  unknownHonorsRequirement: 'an unclassified Honors requirement',
});

const honorsBlockerLabel = (key) => HONORS_BLOCKER_LABELS[key] || String(key || 'Honors requirement');

/*
 * THE HONORS VERSION IS DECIDED HERE, NOT AT CREATE.
 *
 * An Honors destination's audited CCMR Practice used to be sourced after the
 * teacher pressed Create — the one place a failing item could no longer be
 * shown, replaced or repaired. Pre-Flight now prepares that version and
 * proves it (canonicalCcmrHydration.js), so Create waits until it has: the
 * status names what is still open, in the step where it can be resolved.
 * `honorsCcmr` is { status, error?, errors? }; a caller that passes none keeps
 * the old behaviour, where a CCMR gap alone does not block.
 */
const honorsCcmrBlocker = (state = {}) => {
  switch (state?.status) {
    case 'ready':
    case 'notRequired':
    case 'keptAuthored':
      return null;
    case 'error':
      return `MathMaster could not prepare the Honors version: ${String(state.error || 'the audited CCMR bank did not answer').replace(/\.$/, '')}. Use “Try again” under Course rigor destinations.`;
    case 'needsDecision':
      return 'Honors version: no audited CCMR Practice item passed MathMaster’s checks for this lesson. Choose how to continue under Course rigor destinations.';
    case 'invalid': {
      const first = (Array.isArray(state.errors) ? state.errors : []).find(Boolean);
      return `The Honors version does not pass MathMaster’s checks${first ? `: ${first}` : '.'}`;
    }
    default:
      return 'MathMaster is preparing and checking the Honors version (audited CCMR Practice). This takes a few seconds.';
  }
};

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
  honorsCcmr = null,
} = {}) => {
  // A `= {}` default only fires for undefined, so an explicit null draft — the
  // shape a half-initialised modal actually passes — would throw on `.title`.
  const draft = rawDraft && typeof rawDraft === 'object' && !Array.isArray(rawDraft) ? rawDraft : {};
  const blockers = [];

  const assignedIds = Array.isArray(draft.assignedClassIds) ? draft.assignedClassIds : [];
  const assignedPeriods = Array.isArray(draft.assignedClassPeriods) ? draft.assignedClassPeriods : [];
  // Saving to the library and assigning to students are different actions with
  // different requirements. A title is the only thing both need.
  const mode = resolveCreationMode({ assignedClassIds: assignedIds, assignedClassPeriods: assignedPeriods });

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
    const reportedMissing = Array.isArray(honorsReport.missing)
      ? honorsReport.missing
      : ['unknownHonorsRequirement'];
    const unresolved = reportedMissing.filter((key) => key !== 'ccmrEnrichment');
    if (unresolved.length) {
      blockers.push(blocker('classes', `An Honors class is selected. Fix: ${unresolved.map(honorsBlockerLabel).join(', ')}.`));
    }
    // The source's own CCMR gap is not the question: the Honors version
    // replaces Practice with audited items, and that version is judged below.
  }
  if (honorsSelected && honorsCcmr) {
    const message = honorsCcmrBlocker(honorsCcmr);
    if (message) blockers.push(blocker('classes', message));
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
  const mode = resolveCreationMode({ assignedClassIds: safeDraft.assignedClassIds, assignedClassPeriods: safeDraft.assignedClassPeriods });
  return { mode, ...CREATION_MODE_LABELS[mode] };
};
