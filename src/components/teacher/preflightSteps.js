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

  if (!String(draft.title || '').trim()) {
    blockers.push(blocker('details', 'Give the assignment a title.'));
  }
  if (!draft.dueAt) {
    blockers.push(blocker('details', 'Set a regular due date.'));
  }
  if (!draft.lateDueAt) {
    blockers.push(blocker('details', 'Set a final late due date.'));
  }
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

  const assigned = Array.isArray(draft.assignedClassPeriods) ? draft.assignedClassPeriods : [];
  if (classPeriods.length && assigned.length === 0) {
    blockers.push(blocker('classes', 'Choose at least one class period.'));
  }
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
