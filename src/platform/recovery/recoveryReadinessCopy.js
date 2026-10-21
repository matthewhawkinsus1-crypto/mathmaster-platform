/*
 * THE WORDS A TEACHER READS ABOUT RECOVERY READINESS.
 *
 * Pure, so Pre-Flight, the assignment details and the tests read one
 * vocabulary. A legitimate exception is never worded as a failure.
 */

const STATUS = Object.freeze({
  ready: { text: 'Ready', tone: 'success' },
  unavailable: { text: 'Not ready', tone: 'warning' },
  notConfigured: { text: 'Not ready', tone: 'warning' },
  off: { text: 'Turned off', tone: null },
  liveChallenge: { text: 'Live Challenge — the result is the Warm-Up grade', tone: 'info' },
  secure: { text: 'Uses its own retest process', tone: null },
  notPresent: { text: 'No questions in this section', tone: null },
});

export const recoveryReadinessLabel = (status) => STATUS[status] || STATUS.unavailable;

/*
 * What one question's Recovery comes from, in a few words.
 *
 * `context` says who stores a planned binding: 'authoring' (Pre-Flight —
 * creation stores it, so it is ready the moment the lesson exists) or 'live'
 * (an assignment students already have — nothing is stored until the teacher
 * approves Prepare Recovery, so it is not ready yet).
 */
export const recoveryRowLabel = (row = {}, context = 'authoring') => {
  const live = context === 'live';
  switch (row.status) {
    case 'family':
      return 'ready — its own Question Family';
    case 'kept':
      return 'ready — prepared Recovery versions';
    case 'add':
      return live
        ? 'not ready yet — MathMaster can add Recovery versions without changing the question (Prepare Recovery)'
        : 'ready — Recovery versions will be prepared (the question is unchanged)';
    case 'replace':
      return live
        ? 'not ready — the question changed after its Recovery was prepared; Prepare Recovery refreshes it'
        : 'ready — its prepared Recovery will be refreshed (the question is unchanged)';
    default:
      return 'not ready';
  }
};

/** One sentence for a card: "Warm-Up Recovery ready · DOL Recovery not ready". */
export const recoveryReadinessSummary = (sections = {}) => ['warmup', 'dol']
  .filter((section) => sections?.[section] && sections[section].status !== 'notPresent')
  .map((section) => `${section === 'dol' ? 'DOL' : 'Warm-Up'} Recovery ${recoveryReadinessLabel(sections[section].status).text.toLowerCase()}`)
  .join(' · ');

const EXCEPTION_STATUSES = new Set(['off', 'liveChallenge', 'secure', 'notPresent']);

/**
 * The panel's one-line verdict for an assignment. Never "ready" unless every
 * Warm-Up and DOL section present is ready or a legitimate exception.
 */
export const recoveryVerdict = (sections = {}, fullyReady = false) => {
  const present = ['warmup', 'dol'].filter((section) => sections?.[section] && sections[section].status !== 'notPresent');
  if (!fullyReady) return 'Not fully Recovery-ready yet: the questions marked "not ready" below are why.';
  if (present.length && present.every((section) => sections[section].status === 'ready')) {
    return 'Ready: a student who needs it can recover the Warm-Up and the DOL with fresh questions.';
  }
  if (present.every((section) => EXCEPTION_STATUSES.has(sections[section].status))) {
    return 'Nothing to prepare: each section uses one of the exceptions listed below.';
  }
  return 'Ready: each section is either ready for Recovery or uses one of the exceptions listed below.';
};

/** The repair instruction a "Fix for Recovery" request carries to the AI. */
export const RECOVERY_REPAIR_INSTRUCTION = 'Make this question recoverable: keep the same skill, TEKS, DOK, difficulty and tool, and give it a platform Question Family (a "questionFamily" reference with constraints) so MathMaster can generate fresh, equivalent, server-graded versions of it for Recovery.';
