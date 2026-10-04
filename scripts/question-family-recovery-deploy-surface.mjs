/*
 * EVERY PRODUCTION SURFACE THE QUESTION-FAMILY + PRACTICE-BASED RECOVERY
 * RELEASE CHANGES, IN ONE PLACE.
 *
 * This release is not one new callable. Family-backed answers are re-graded
 * by submission ingestion from their delivery pins; a completed Recovery
 * reaches Google Classroom through BOTH passback triggers; the deadline
 * finalizer must refuse to mark a family template against its own fields; and
 * the grades document gains two server-only fields the rules pin. Deploying
 * half of that is how a browser calls `advanceSectionRecovery` before it
 * exists, or a Recovery is recorded that Classroom never hears about.
 *
 * `browserCallable` means a BROWSER invokes it through `httpsCallable`, so its
 * Gen 2 Cloud Run service must grant `allUsers` the transport-only
 * `roles/run.invoker` (see scripts/persistence-deploy-surface.mjs). Triggers
 * are never browser-callable.
 */
export const QUESTION_FAMILY_RECOVERY_FUNCTIONS = Object.freeze([
  Object.freeze({
    name: 'advanceSectionRecovery',
    browserCallable: true,
    why: 'New: server-graded Recovery Practice, unlock, start (pinned plan) and submit.',
  }),
  Object.freeze({
    name: 'resolveHeldSectionRecovery',
    browserCallable: true,
    why: 'New: the teacher of record resolves a Recovery held because MathMaster could not grade it (finalize, keep original, replacement question).',
  }),
  Object.freeze({
    name: 'ingestStudentSubmissions',
    browserCallable: true,
    why: 'Re-grades family-backed answers from their delivery pins and persists the pin.',
  }),
  Object.freeze({
    name: 'finalizeStudentResponseCheckpoints',
    browserCallable: false,
    why: 'Fails closed for family templates instead of marking against template fields.',
  }),
  Object.freeze({
    name: 'syncGradeToClassroom',
    browserCallable: false,
    why: 'Whole-assignment passback applies a completed Recovery, wakes when one completes, and withholds the grade while one is held.',
  }),
  Object.freeze({
    name: 'syncSectionGradeToClassroom',
    browserCallable: false,
    why: 'Section passback applies a completed Recovery to its Warm-Up/DOL section, and withholds that section while its Recovery is held.',
  }),
]);

export const questionFamilyRecoveryFunctionNames = () =>
  QUESTION_FAMILY_RECOVERY_FUNCTIONS.map((entry) => entry.name);

export const firebaseFunctionTargets = (names = questionFamilyRecoveryFunctionNames()) =>
  names.map((name) => `functions:${name}`).join(',');

export const browserCallableServiceIds = () =>
  QUESTION_FAMILY_RECOVERY_FUNCTIONS
    .filter((entry) => entry.browserCallable)
    .map((entry) => entry.name.toLowerCase());
