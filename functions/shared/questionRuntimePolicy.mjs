/*
 * ONE QUESTION EXPERIENCE, FIVE CAPABILITY POLICIES.
 *
 * A MathMaster question renders through ONE runtime — QuestionEngine and the
 * Rich Tools it lazy-loads, or the Path generic field renderer for a question
 * that needs no tool — whether it is met in Practice, in a Test Cycle's
 * Review, on a secure Test, in Corrections or on a secure Retest. What changes
 * between those places is not the renderer. It is WHAT THE RUNTIME IS ALLOWED
 * TO DO FOR THE STUDENT, and that is decided here, once, as data.
 *
 * TWO KINDS OF CAPABILITY, AND THE DIFFERENCE IS THE WHOLE POINT.
 *
 *   RESPONSE capabilities (Category A) are how a student EXPRESSES mathematics:
 *   the coordinate plane they plot on, the algebra workspace they rewrite in,
 *   the table they fill, the cards they place. They are the answer interface.
 *   No mode switches them off — a graphing question with no graph is not a
 *   harder graphing question, it is a different (and worse) question.
 *
 *   ASSISTANCE capabilities (Category B) are things the PLATFORM does for the
 *   student: hints, worked solutions, the AI tutor, checking an answer before
 *   it is final, revealing the answer, auto-solving, replacing the question,
 *   leaving for practice. Secure modes switch every one of them off.
 *
 * Plotting a line is Category A. MathMaster drawing the correct line is
 * Category B. A tool is never banned from a Test for having the first; it runs
 * in secure mode with the second disabled.
 *
 * INTERFACE VALIDATION IS NOT CORRECTNESS. "Select two points" or "complete
 * both fields" is the tool explaining its own controls and stays on in every
 * mode. "Correct", "Incorrect", a correctness colour, or which choice is wrong
 * is a verdict, and in a secure mode it is withheld until the teacher releases
 * results (`verdictRelease: 'teacherRelease'`).
 *
 * The browser enforces nothing here that matters for security — a student who
 * edits the page can switch a hint button back on, and would find that the
 * secure payload carries no hint to show. The SERVER is what strips Category B
 * material out of a secure payload (`stripAssistanceForMode`) and withholds the
 * verdict. This module is shared so the two sides agree on what "secure" means.
 *
 * Pure by construction: no Firestore, no DOM, no clock.
 */

import { getEffectiveActivityPolicy } from './activityPolicies.mjs';

const clean = (value) => String(value ?? '').trim();

export const QUESTION_RUNTIME_MODES = Object.freeze({
  PRACTICE: 'practice',
  REVIEW: 'review',
  SECURE_TEST: 'secureTest',
  CORRECTIONS: 'corrections',
  SECURE_RETEST: 'secureRetest',
});

/** Category A. Never switched off by a mode. */
export const RESPONSE_CAPABILITIES = Object.freeze([
  'richTools',
  'mathEntry',
  'interfaceValidation',
  'responsePersistence',
]);

/** Category B. Every one is off in a secure mode. */
export const ASSISTANCE_CAPABILITIES = Object.freeze([
  'hints',
  'workedSolution',
  'solutionReveal',
  'aiTutor',
  'answerCheckBeforeSubmit',
  'immediateFeedback',
  'autoSolve',
  'questionReplacement',
  'practiceEscape',
  'externalResources',
]);

const policy = (definition) => Object.freeze({
  ...definition,
  capabilities: Object.freeze({ ...definition.capabilities }),
});

// Category A is the same everywhere, so it is written once.
const RESPONSE_ON = Object.freeze({
  richTools: true,
  mathEntry: true,
  interfaceValidation: true,
  responsePersistence: true,
});

export const QUESTION_RUNTIME_POLICIES = Object.freeze({
  [QUESTION_RUNTIME_MODES.PRACTICE]: policy({
    mode: QUESTION_RUNTIME_MODES.PRACTICE,
    label: 'Practice',
    secure: false,
    // QuestionEngine's existing gates read the activity role; the mode maps
    // onto one so the engine's hint/feedback behaviour and this policy agree.
    activityRole: 'practice',
    attempts: 'policy',
    verdictRelease: 'immediate',
    gradeImpact: 'assignment',
    capabilities: {
      ...RESPONSE_ON,
      hints: true,
      workedSolution: true,
      solutionReveal: true,
      aiTutor: true,
      answerCheckBeforeSubmit: true,
      immediateFeedback: true,
      autoSolve: false,
      questionReplacement: true,
      practiceEscape: true,
      externalResources: true,
    },
  }),
  [QUESTION_RUNTIME_MODES.REVIEW]: policy({
    mode: QUESTION_RUNTIME_MODES.REVIEW,
    label: 'Review',
    secure: false,
    activityRole: 'review',
    attempts: 'policy',
    verdictRelease: 'immediate',
    gradeImpact: 'none',
    capabilities: {
      ...RESPONSE_ON,
      hints: true,
      workedSolution: true,
      solutionReveal: true,
      aiTutor: true,
      answerCheckBeforeSubmit: true,
      immediateFeedback: true,
      autoSolve: false,
      questionReplacement: true,
      practiceEscape: true,
      externalResources: true,
    },
  }),
  [QUESTION_RUNTIME_MODES.SECURE_TEST]: policy({
    mode: QUESTION_RUNTIME_MODES.SECURE_TEST,
    label: 'Secure Test',
    secure: true,
    activityRole: 'test',
    attempts: 1,
    verdictRelease: 'teacherRelease',
    gradeImpact: 'recorded',
    capabilities: {
      ...RESPONSE_ON,
      hints: false,
      workedSolution: false,
      solutionReveal: false,
      aiTutor: false,
      answerCheckBeforeSubmit: false,
      immediateFeedback: false,
      autoSolve: false,
      questionReplacement: false,
      practiceEscape: false,
      externalResources: false,
    },
  }),
  [QUESTION_RUNTIME_MODES.CORRECTIONS]: policy({
    mode: QUESTION_RUNTIME_MODES.CORRECTIONS,
    label: 'Corrections',
    secure: false,
    activityRole: 'corrections',
    // The server enforces the number (CORRECTION_ATTEMPTS_PER_QUESTION).
    attempts: 3,
    verdictRelease: 'immediate',
    // Corrections unlock a retest. They never move a recorded grade.
    gradeImpact: 'none',
    capabilities: {
      ...RESPONSE_ON,
      hints: true,
      // The worked review of a PARALLEL practice item, released only once that
      // item is closed and a fresh one replaces it (Path's attemptSupport).
      workedSolution: true,
      // Never revealed before the student has worked it: completing a
      // correction still takes correct answers on fresh items.
      solutionReveal: false,
      aiTutor: false,
      answerCheckBeforeSubmit: true,
      immediateFeedback: true,
      autoSolve: false,
      questionReplacement: false,
      practiceEscape: false,
      externalResources: true,
    },
  }),
  [QUESTION_RUNTIME_MODES.SECURE_RETEST]: policy({
    mode: QUESTION_RUNTIME_MODES.SECURE_RETEST,
    label: 'Secure Retest',
    secure: true,
    activityRole: 'test',
    attempts: 1,
    verdictRelease: 'teacherRelease',
    gradeImpact: 'recorded',
    capabilities: {
      ...RESPONSE_ON,
      hints: false,
      workedSolution: false,
      solutionReveal: false,
      aiTutor: false,
      answerCheckBeforeSubmit: false,
      immediateFeedback: false,
      autoSolve: false,
      questionReplacement: false,
      practiceEscape: false,
      externalResources: false,
    },
  }),
});

export const isQuestionRuntimeMode = (value) => Object.values(QUESTION_RUNTIME_MODES).includes(clean(value));

/**
 * The policy for a mode. An unknown or missing mode resolves to SECURE TEST,
 * not to practice: a payload that forgot to say what it is must not gain hints.
 */
export const resolveQuestionRuntimePolicy = (mode) => (
  QUESTION_RUNTIME_POLICIES[clean(mode)] || QUESTION_RUNTIME_POLICIES[QUESTION_RUNTIME_MODES.SECURE_TEST]
);

export const isSecureRuntimeMode = (mode) => resolveQuestionRuntimePolicy(mode).secure === true;

export const runtimeAllows = (mode, capability) => resolveQuestionRuntimePolicy(mode).capabilities[capability] === true;

/**
 * The mode the secure exam shell renders an issued item in: the secure mode
 * the server put on the payload (Secure Test or Secure Retest), and Secure Test
 * for anything else — a practice mode, an unknown one, or no item yet (the
 * container renders before the first item arrives).
 */
export const secureShellRuntimeMode = (question) => {
  const policy = resolveQuestionRuntimePolicy(question?.runtimeMode);
  return policy.secure ? policy.mode : QUESTION_RUNTIME_MODES.SECURE_TEST;
};

/** Which mode a Test Cycle exam session runs in. */
export const runtimeModeForCycleStage = (cycleStage) => (
  clean(cycleStage) === 'retest' ? QUESTION_RUNTIME_MODES.SECURE_RETEST : QUESTION_RUNTIME_MODES.SECURE_TEST
);

/*
 * ASSISTANCE MATERIAL A PUBLIC TOOL PAYLOAD MAY CARRY, BY KEY.
 *
 * A Path Tool Contract's public allowlist was written for practice, where a
 * hint is help the student is entitled to. In a secure mode the same key is a
 * Category B capability riding along in the payload, so it is removed on the
 * server before the payload is sent. Keyed by name and applied at every depth,
 * because the hint that leaks is always nested inside something else.
 */
export const ASSISTANCE_PAYLOAD_KEYS = Object.freeze([
  'hint', 'hints', 'hintText', 'hintSteps', 'conceptHint',
  'workedExample', 'workedExamples', 'workedSolution', 'solutionSteps', 'solutionReview',
  'explanation', 'explanations', 'teacherNotes', 'coachPrompts', 'scaffoldHints',
  'feedback', 'feedbackByChoice', 'misconceptionFeedback',
]);

const stripKeysDeep = (value, keys, depth = 0) => {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((child) => stripKeysDeep(child, keys, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.entries(value).forEach(([key, child]) => {
    if (!keys.has(key)) result[key] = stripKeysDeep(child, keys, depth + 1);
  });
  return result;
};

/*
 * SOLUTION-PATH METADATA. Not assistance a tool renders — nothing in the
 * browser reads these — but each one describes how the item is SOLVED: the
 * ordered operations (`operationTags`), how many steps (`solutionDepth`), the
 * method (`solutionMethod`). A practice payload carries them for Live
 * Challenge and analytics; a secure payload has no reason to, so it does not.
 */
export const SOLUTION_PATH_PAYLOAD_KEYS = Object.freeze([
  'operationTags', 'complexityTags', 'solutionDepth', 'solutionMethod', 'challengeFamily',
]);

const ASSISTANCE_KEY_SET = new Set([...ASSISTANCE_PAYLOAD_KEYS, ...SOLUTION_PATH_PAYLOAD_KEYS]);

/**
 * A public tool payload as the given mode may see it.
 *
 * Non-secure modes receive the contract's allowlist unchanged. Secure modes
 * additionally lose every assistance key, at every depth. Never adds anything.
 */
export const stripAssistanceForMode = (toolPayload, mode) => {
  if (!toolPayload || typeof toolPayload !== 'object') return toolPayload ?? null;
  if (!isSecureRuntimeMode(mode)) return toolPayload;
  return stripKeysDeep(toolPayload, ASSISTANCE_KEY_SET);
};

/** Keys that were present and would be removed — for audits and tests. */
export const assistanceKeysIn = (value, path = '', found = [], depth = 0) => {
  if (depth > 12) return found;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assistanceKeysIn(child, `${path}[${index}]`, found, depth + 1));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  Object.entries(value).forEach(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    if (ASSISTANCE_KEY_SET.has(key)) found.push(here);
    assistanceKeysIn(child, here, found, depth + 1);
  });
  return found;
};

/*
 * THE MODE, IN THE TERMS QUESTIONENGINE ALREADY ENFORCES.
 *
 * QuestionEngine and every registry tool already gate their assistance on an
 * activity policy: `hintsAllowed` reaches every hint panel, self-check and the
 * Guided Notes coach through ToolRuntimeContext; `feedback` decides whether any
 * verdict, correctness colour or solution review is shown; `allowReplacement`
 * decides "Request New Question". A runtime mode is expressed as exactly that
 * policy, so the engine needs no second set of switches — and a mode cannot
 * drift from what the engine actually does.
 */
export const engineActivityPolicyForMode = (mode) => {
  const runtime = resolveQuestionRuntimePolicy(mode);
  const base = getEffectiveActivityPolicy(runtime.activityRole);
  const { capabilities } = runtime;
  return Object.freeze({
    ...base,
    attempts: Number.isFinite(Number(runtime.attempts)) ? Number(runtime.attempts) : base.attempts,
    feedback: capabilities.immediateFeedback ? 'immediate' : 'teacherRelease',
    hintsAllowed: capabilities.hints === true,
    remediationAllowed: capabilities.hints === true,
    allowReplacement: capabilities.questionReplacement === true,
    runtimeMode: runtime.mode,
  });
};
