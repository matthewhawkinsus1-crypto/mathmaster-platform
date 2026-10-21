/*
 * WHAT RECOVERY AN ASSIGNMENT CAN OFFER — AND WHAT IT WOULD TAKE.
 *
 * One planner for every place that asks "can this Warm-Up and DOL be
 * recovered?": Pre-Flight when an assignment is created (its bindings are
 * stored with it), the teacher's assignment details for an assignment that is
 * already live, the server's recovery upgrade (preview and commit), and the
 * operator's prepared migration. They cannot disagree because they run this.
 *
 * For every delivered Warm-Up and DOL question:
 *
 *   family       a Question Family slot: it recovers itself (PR #404)
 *   kept         a static question with a current, certified binding
 *   add          a static question MathMaster can pair with a certified
 *                family now (a prepared migration's binding first, then the
 *                families' own recognition), certified here
 *   replace      as `add`, for a question whose binding went stale because
 *                the question changed after it was certified
 *   unavailable  no certified Recovery: `issues` say exactly why, in the words
 *                a teacher acts on, and `fix` what would repair it
 *
 * and the legitimate exceptions, which are never "not ready":
 *
 *   secure       a secure assessment or Test Cycle: it has its own retest
 *                process, and nothing is prepared
 *   off          the assignment turned Recovery off (for one section or both)
 *   liveChallenge a Warm-Up delivered by Live Challenge: the result IS the
 *                Warm-Up grade. Its questions are still prepared, so a day the
 *                teacher runs the ordinary Warm-Up instead is covered.
 *
 * NOTHING HERE WRITES. The plan says which bindings to store; the caller
 * stores them (Pre-Flight's publish, the commit callable, the operator's
 * script) through recoveryContent.applyRecoveryBindings.
 *
 * Pure: no Firestore, no clock (`at` is a parameter).
 */

import { normalizeRecoveryPolicy } from './recoveryPolicy.mjs';
import { resolveWarmupDelivery, warmupIsNotAssignmentDelivered } from './warmupDelivery.mjs';
import { isTestCycleAssignment } from './testCyclePolicy.mjs';
import { isFamilyBackedQuestion } from './questionFamilyInstance.mjs';
import { allRegisteredQuestionFamilies, defaultFamilyVersion } from './questionFamilyRegistry.mjs';
import { assessRecoverySlot } from './sectionRecoveryReadiness.mjs';
import {
  RECOVERY_BINDING_ORIGIN,
  RECOVERY_SECTIONS_WITH_CONTENT,
  RECOVERY_SOURCE_KIND,
  assignmentRecoveryContent,
  recoveryBindingsHash,
  resolveRecoverySource,
} from './recoveryContent.mjs';
import { certifyRecoveryBinding, proposeRecoveryBinding } from './recoveryCertification.mjs';

export const RECOVERY_PLAN_ROW = Object.freeze({
  FAMILY: 'family',
  KEPT: 'kept',
  ADD: 'add',
  REPLACE: 'replace',
  UNAVAILABLE: 'unavailable',
});

export const RECOVERY_SECTION_STATUS = Object.freeze({
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
  LIVE_CHALLENGE: 'liveChallenge',
  OFF: 'off',
  SECURE: 'secure',
  NOT_PRESENT: 'notPresent',
});

const SECTION_LABEL = Object.freeze({ warmup: 'Warm-Up', dol: 'DOL' });
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/*
 * READY NOW, OR READY ONCE APPROVED.
 *
 * A planned `add` or `replace` row is a binding the planner can certify but
 * nobody has stored yet: Pre-Flight stores it at creation, the recovery
 * upgrade only when a teacher approves it. So a live assignment's sections, as
 * students have them NOW, count only `family` and `kept` rows; the same
 * sections after approval count `add` and `replace` too. A DOL Recovery needs
 * every question; a Warm-Up Recovery draws from the ready ones.
 */
export const RECOVERY_ROWS_READY_NOW = Object.freeze([RECOVERY_PLAN_ROW.FAMILY, RECOVERY_PLAN_ROW.KEPT]);
export const RECOVERY_ROWS_READY_AFTER_APPROVAL = Object.freeze([
  ...RECOVERY_ROWS_READY_NOW,
  RECOVERY_PLAN_ROW.ADD,
  RECOVERY_PLAN_ROW.REPLACE,
]);
const SECTION_EXCEPTIONS = new Set([
  RECOVERY_SECTION_STATUS.OFF,
  RECOVERY_SECTION_STATUS.LIVE_CHALLENGE,
  RECOVERY_SECTION_STATUS.SECURE,
  RECOVERY_SECTION_STATUS.NOT_PRESENT,
]);

/** A planned section's status when only `readyRowStatuses` count. */
export const recoverySectionStatusWith = (section, entry, readyRowStatuses = RECOVERY_ROWS_READY_AFTER_APPROVAL) => {
  if (!entry || SECTION_EXCEPTIONS.has(entry.status)) return entry?.status || RECOVERY_SECTION_STATUS.NOT_PRESENT;
  const ready = new Set(readyRowStatuses);
  const rows = list(entry.rows);
  const readyCount = rows.filter((row) => ready.has(row.status)).length;
  const isReady = section === 'dol' ? rows.length > 0 && readyCount === rows.length : readyCount > 0;
  return isReady ? RECOVERY_SECTION_STATUS.READY : RECOVERY_SECTION_STATUS.UNAVAILABLE;
};

/**
 * A live assignment's sections as students have them now, each with
 * `canPrepare` (rows a teacher's approval would make ready). The panel's
 * input on the assignment details.
 */
export const liveRecoverySections = (plan = null) => Object.fromEntries(Object.entries(plan?.sections || {}).map(([section, entry]) => [section, {
  ...entry,
  status: recoverySectionStatusWith(section, entry, RECOVERY_ROWS_READY_NOW),
  statusAfterApproval: recoverySectionStatusWith(section, entry, RECOVERY_ROWS_READY_AFTER_APPROVAL),
  canPrepare: list(entry?.rows).some((row) => row.status === RECOVERY_PLAN_ROW.ADD || row.status === RECOVERY_PLAN_ROW.REPLACE),
}]));

/** The stored questions in storage order, each with its section's role. */
export const flattenAssignmentQuestions = (assignment = {}) => list(assignment?.sections).flatMap((section) => (
  list(section?.questions).map((question) => ({
    ...question,
    activityRole: question?.activityRole || section?.role || 'classwork',
    sectionId: section?.id ?? null,
    sectionTitle: section?.title ?? null,
  }))
));

/*
 * The candidate families, in a fixed order: every registered family that can
 * recognize a static question, at the version an unpinned reference means.
 * A newer version is never chosen on its own — only a prepared migration or
 * an author may pin one.
 */
export const recoveryCandidateFamilies = () => allRegisteredQuestionFamilies()
  .filter((family) => typeof family.recognize === 'function' && family.recovery?.eligible)
  .filter((family) => family.version === defaultFamilyVersion(family.id));

/*
 * COULD PREPARE RECOVERY ADD ANYTHING HERE? — cheap enough for every card.
 *
 * True when a delivered static Warm-Up or DOL question (in a section whose
 * Recovery is on) has no current binding and a candidate family recognizes
 * it. Recognition only, no certification: it says "worth a look", and the
 * planner — on the assignment details, and again on the server — decides.
 * Remembered per assignment object, so a list re-rendering with the same
 * documents asks once.
 */
const preparationCache = new WeakMap();
export const recoveryPreparationAvailable = (assignment = null, { families = null } = {}) => {
  if (!isObject(assignment)) return false;
  if (!families && preparationCache.has(assignment)) return preparationCache.get(assignment);
  const decide = () => {
    if (assignmentHasOwnRetest(assignment)) return false;
    const policy = normalizeRecoveryPolicy(assignment);
    if (!policy.enabled || policy.automaticOpportunities < 1) return false;
    const content = assignmentRecoveryContent(assignment);
    const candidates = Array.isArray(families) ? families : recoveryCandidateFamilies();
    return flattenAssignmentQuestions(assignment).some((question) => {
      const role = clean(question?.activityRole).toLowerCase();
      if (!RECOVERY_SECTIONS_WITH_CONTENT.includes(role) || question?.teacherExcluded === true) return false;
      if (!policy[role]?.enabled || isFamilyBackedQuestion(question)) return false;
      if (!clean(question?.questionId || question?.id)) return false;
      if (resolveRecoverySource({ assignment, question, content }).kind === RECOVERY_SOURCE_KIND.BINDING) return false;
      return candidates.some((family) => {
        try {
          return Boolean(family.recognize(question));
        } catch {
          return false;
        }
      });
    });
  };
  const available = decide();
  if (!families) preparationCache.set(assignment, available);
  return available;
};

/** Is this a secure assessment, with its own retest process? */
export const assignmentHasOwnRetest = (assignment = {}) => (
  assignment?.secure === true
  || clean(assignment?.secureMode || assignment?.assessmentMode).toLowerCase() === 'secure'
  || isTestCycleAssignment(assignment)
);

/**
 * The plan for one assignment.
 *
 *   manifest        a prepared migration's bindings ({ bindings: { [questionId]:
 *                   { questionFamily } } }); certified exactly like any other
 *   gradeSample     certifyRecoveryBinding's key check (the full grader on the
 *                   server; the light one in Pre-Flight)
 *   validateVersion certifyRecoveryBinding's question validator, if any
 */
export const planAssignmentRecoveryContent = ({
  assignment = null,
  questions = null,
  manifest = null,
  gradeSample = null,
  validateVersion = null,
  families = null,
  origin = RECOVERY_BINDING_ORIGIN.UPGRADE,
  migrationId = null,
  at = null,
} = {}) => {
  const assignmentId = clean(assignment?.id) || 'assignment';
  const stored = Array.isArray(questions) ? questions : flattenAssignmentQuestions(assignment);
  const content = assignmentRecoveryContent(assignment);
  const currentBindings = content?.bindings || {};
  const policy = normalizeRecoveryPolicy(assignment || {});
  const candidates = Array.isArray(families) ? families : recoveryCandidateFamilies();
  const manifestBindings = isObject(manifest?.bindings) ? manifest.bindings : {};

  const rows = [];
  const bindingsToApply = {};
  const sections = {};
  const ownRetest = assignmentHasOwnRetest(assignment);

  RECOVERY_SECTIONS_WITH_CONTENT.forEach((section) => {
    const entries = stored
      .map((question, storageIndex) => ({ question, storageIndex }))
      .filter((entry) => entry.question?.teacherExcluded !== true)
      .filter((entry) => clean(entry.question?.activityRole).toLowerCase() === section);
    const label = SECTION_LABEL[section];
    if (!entries.length) {
      sections[section] = { section, status: RECOVERY_SECTION_STATUS.NOT_PRESENT, total: 0, ready: 0, rows: [], message: null };
      return;
    }
    if (ownRetest) {
      sections[section] = {
        section,
        status: RECOVERY_SECTION_STATUS.SECURE,
        total: entries.length,
        ready: 0,
        rows: [],
        message: 'Secure assessments use their own retest process, so Practice-based Recovery does not apply.',
      };
      return;
    }
    const sectionRows = entries.map((entry, position) => {
      const { question, storageIndex } = entry;
      const questionId = clean(question?.questionId || question?.id) || null;
      const where = `${label} Q${position + 1}`;
      const row = {
        questionId,
        storageIndex,
        section,
        label: where,
        type: clean(question?.type) || null,
        mode: clean(question?.mode) || null,
        status: RECOVERY_PLAN_ROW.UNAVAILABLE,
        familyId: null,
        familyVersion: null,
        constraints: null,
        certification: null,
        binding: null,
        issues: [],
      };
      if (isFamilyBackedQuestion(question)) {
        const slot = assessRecoverySlot({ assignmentId, question, storageIndex, label: where });
        row.familyId = slot.familyId;
        row.familyVersion = slot.familyVersion;
        row.status = slot.ready ? RECOVERY_PLAN_ROW.FAMILY : RECOVERY_PLAN_ROW.UNAVAILABLE;
        row.issues = slot.issues.map((entry) => ({ code: entry.code, message: entry.message, fix: null }));
        return row;
      }
      const source = resolveRecoverySource({ assignment, question, content });
      if (source.kind === RECOVERY_SOURCE_KIND.BINDING) {
        row.status = RECOVERY_PLAN_ROW.KEPT;
        row.familyId = source.binding.questionFamily.id;
        row.familyVersion = source.binding.questionFamily.version;
        row.constraints = source.binding.questionFamily.constraints;
        row.certification = source.binding.certification || null;
        row.binding = source.binding;
        return row;
      }
      if (!questionId) {
        row.issues.push({ code: 'no-question-id', message: `${where} has no stable question id, so a Recovery cannot be tied to it.`, fix: null });
        return row;
      }
      const common = {
        assignmentId,
        question,
        storageIndex,
        section,
        questions: stored,
        label: where,
        gradeSample,
        validateVersion,
        origin,
        migrationId,
        at,
      };
      const prepared = manifestBindings[questionId]?.questionFamily
        ? certifyRecoveryBinding({ ...common, questionFamily: manifestBindings[questionId].questionFamily })
        : proposeRecoveryBinding({ ...common, families: candidates });
      if (prepared.ok) {
        row.status = source.kind === RECOVERY_SOURCE_KIND.STALE ? RECOVERY_PLAN_ROW.REPLACE : RECOVERY_PLAN_ROW.ADD;
        row.familyId = prepared.binding.questionFamily.id;
        row.familyVersion = prepared.binding.questionFamily.version;
        row.constraints = prepared.binding.questionFamily.constraints;
        row.certification = prepared.certification;
        row.binding = prepared.binding;
        bindingsToApply[questionId] = prepared.binding;
        return row;
      }
      row.familyId = prepared.certification?.familyId || null;
      row.familyVersion = prepared.certification?.familyVersion || null;
      row.certification = prepared.certification || null;
      row.issues = prepared.issues.length
        ? prepared.issues
        : [{
          code: 'no-certified-family',
          message: `${where} is not a kind of question any certified Recovery family can recognize yet, so MathMaster cannot make fresh versions of it.`,
          fix: 'Give it a Question Family: "Fix for Recovery" in Pre-Flight, or Edit Questions before students start it.',
        }];
      if (source.kind === RECOVERY_SOURCE_KIND.STALE) {
        row.issues.unshift({
          code: 'recovery-binding-stale',
          message: `${where} was changed after its Recovery was prepared, so that Recovery no longer matches it.`,
          fix: null,
        });
      }
      return row;
    });
    rows.push(...sectionRows);
    const readyRows = sectionRows.filter((row) => row.status !== RECOVERY_PLAN_ROW.UNAVAILABLE);
    const allReady = readyRows.length === sectionRows.length;
    const anyReady = readyRows.length > 0;
    let status = section === 'dol'
      ? (allReady ? RECOVERY_SECTION_STATUS.READY : RECOVERY_SECTION_STATUS.UNAVAILABLE)
      : (anyReady ? RECOVERY_SECTION_STATUS.READY : RECOVERY_SECTION_STATUS.UNAVAILABLE);
    let message = null;
    if (!policy.enabled || !policy[section]?.enabled || policy.automaticOpportunities < 1) {
      status = RECOVERY_SECTION_STATUS.OFF;
      message = `${label} Recovery is turned off for this assignment.`;
    } else if (section === 'warmup' && warmupIsNotAssignmentDelivered(resolveWarmupDelivery({ assignment, hasAuthoredWarmup: true }))) {
      status = RECOVERY_SECTION_STATUS.LIVE_CHALLENGE;
      message = 'The Warm-Up is delivered by Live Challenge: each student\'s result is their Warm-Up grade, so there is no Warm-Up Recovery.';
    }
    sections[section] = {
      section,
      status,
      total: sectionRows.length,
      ready: readyRows.length,
      rows: sectionRows,
      message,
    };
  });

  const desiredBindings = { ...currentBindings, ...bindingsToApply };
  return {
    assignmentId,
    title: clean(assignment?.title) || null,
    contentVersion: content?.version || 0,
    ownRetest,
    sections,
    rows,
    bindingsToApply,
    desiredBindings,
    currentBindingsHash: recoveryBindingsHash(currentBindings),
    desiredBindingsHash: recoveryBindingsHash(desiredBindings),
    changed: Object.keys(bindingsToApply).length > 0,
    // Recovery readiness for the assignment as a whole: every Warm-Up and DOL
    // section present is ready, or a legitimate exception. "Not present" is
    // not a failure (a lesson without a DOL has no DOL Recovery to offer).
    fullyReady: Object.values(sections).every((entry) => [
      RECOVERY_SECTION_STATUS.READY,
      RECOVERY_SECTION_STATUS.NOT_PRESENT,
      RECOVERY_SECTION_STATUS.LIVE_CHALLENGE,
      RECOVERY_SECTION_STATUS.OFF,
      RECOVERY_SECTION_STATUS.SECURE,
    ].includes(entry.status)),
  };
};
