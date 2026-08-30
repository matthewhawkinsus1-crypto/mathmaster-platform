// A Path Session runtime for the Teacher Path Simulator.
//
// The teacher's simulated student cannot use the production My Math Path
// callables, and should not be able to: those require an authenticated account
// whose claim says `role === "student"`, and weakening that check to let a
// teacher impersonate a student would be a real security regression. So the
// simulation gets its own runtime rather than the student's credentials.
//
// It is a *runtime*, not a second engine. Question selection, the attempt
// policy, mastery, and every routing decision come from the same modules the
// student path uses. Student Experience now receives the published secure Path
// bank itself; classroom assignments are evidence and Question-Bench content,
// not a prerequisite for Path practice. Grading still happens locally because
// a teacher session cannot impersonate a student's secure callable identity.
//
// GRADING, SAID PLAINLY. This runtime uses the same Path Tool Contract the
// server uses. A question whose tool has a contract is issued as a public tool
// payload with the answer stripped, and graded here by `gradePathResponse` —
// the same function, the same rules, the same verdict a student would get. What
// the renderer thinks is not consulted.
//
// A question whose tool has no contract yet is still shown, because a teacher
// simulating their own content should see all of it, but it is issued
// canonically and marked by the renderer. Those two cases are distinguishable
// in the instance itself (`pathToolId` present or not) so nobody has to guess
// which kind of verdict they are looking at.

import {
  buildPrivateToolGrading, buildPublicToolPayload, gradePathResponse,
} from '../../../functions/shared/pathToolContracts.mjs';
import { buildFieldGradingDefinition, hasFieldGradableDefinition } from '../../../functions/shared/legacyFieldGrading.mjs';
import { buildAttemptSupportPayload, buildPrivateSupport } from '../../../functions/shared/pathSolutionSupport.mjs';
import * as answerEquivalence from '../../../functions/shared/answerEquivalence.mjs';
import { selectNextFamily, recordFamilyUse } from '../../../functions/shared/pathQuestionSelection.mjs';
import { generatePathInstanceWithRetries, hasPathGenerator } from '../../../functions/shared/pathQuestionGeneration.mjs';
import { getQuestionPrimaryTeksCodes } from '../../questionMetadata.js';
import { teksSkillId, teksCodeFromSkillId, describeSkill } from '../path/skillGraph.js';
import { buildMasteryBySkillForStudent } from '../path/masteryAdapter.js';
import {
  PATH_ACTION, decideNextStep, explainStepForStudent, resolveDiagnostic,
} from '../path/pathSessionRouting.js';
import { recordQuestionAttempt } from '../../attemptPolicy.js';
import { toCanonicalKey, toDisplayCode } from '../../utils/teksUtils.js';

const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Index assignment questions by skill for legacy tests and Question-Bench
 * callers. Student Experience does NOT use this as its Path content source; it
 * uses buildSimulationQuestionBankFromPathBank below.
 */
export const buildSimulationQuestionBank = (assignments = []) => {
  const bySkill = new Map();
  list(assignments).forEach((assignment) => {
    list(assignment?.questions).forEach((question, index) => {
      getQuestionPrimaryTeksCodes(question).forEach((code) => {
        const skillId = teksSkillId(code);
        if (!bySkill.has(skillId)) bySkill.set(skillId, []);
        bySkill.get(skillId).push({
          question,
          sourceAssignmentId: assignment.id,
          sourceQuestionIndex: index,
          sourceBankQuestionId: null,
          teksCode: toDisplayCode(code),
        });
      });
    });
  });
  return bySkill;
};

/**
 * Index the ACTUAL secure Path-bank records for simulation.
 *
 * This is the source used by Student Experience. Assignment questions belong
 * to Question Bench QA; they are not the content source for My Math Path. A
 * fresh student with zero classroom assignments must still have Path work as
 * long as the secure bank has published content for the course.
 */
export const buildSimulationQuestionBankFromPathBank = (records = []) => {
  const bySkill = new Map();
  list(records).filter((record) => record?.active !== false).forEach((question) => {
    getQuestionPrimaryTeksCodes(question).forEach((code) => {
      const skillId = teksSkillId(code);
      if (!bySkill.has(skillId)) bySkill.set(skillId, []);
      bySkill.get(skillId).push({
        question,
        sourceAssignmentId: null,
        sourceQuestionIndex: null,
        sourceBankQuestionId: question.id || null,
        teksCode: toDisplayCode(code),
      });
    });
  });
  return bySkill;
};

export const bankHasSkill = (bank, skillId) => Boolean(bank?.get?.(skillId)?.length);

/**
 * The synthetic assignment a simulated session records its evidence into.
 *
 * One per session, holding the questions actually issued, so the mastery
 * engine reads simulated work exactly as it reads assignment work — same
 * shape, same adapter, same profile.
 */
const sessionAssignment = (sessionId, issued) => ({
  id: sessionId,
  title: 'My Math Path (simulated)',
  assignmentType: 'practice',
  assignedClassPeriods: [],
  simulated: true,
  questions: issued.map((entry) => entry.question),
});

const emptyEvidence = () => ({ finalized: 0, missed: 0, consecutiveMisses: 0 });

const publicChoices = (choices) => (Array.isArray(choices) ? choices : []).slice(0, 12).map((choice, index) => (
  choice && typeof choice === 'object'
    ? { id: String(choice.id || choice.value || `choice-${index + 1}`), label: String(choice.label ?? choice.text ?? choice.value ?? '') }
    : { id: String(choice), label: String(choice) }
)).filter((choice) => choice.label !== '');

// Deliberately the same allowlist production's `buildSanitizedQuestion` uses.
// A teacher previewing an item must see exactly the payload a student would —
// including which options exist, and excluding which one is right.
const publicFieldPayload = (question = {}) => ({
  familyId: String(question.familyId || question.questionType || 'path-question'),
  familyVersion: Number(question.familyVersion) || 1,
  questionType: String(question.questionType || 'response'),
  activityRole: String(question.activityRole || 'practice'),
  difficultyBand: Number(question.difficultyBand) || 3,
  dok: Number(question.dok) || 1,
  calculatorPolicy: String(question.calculatorPolicy || 'inherit'),
  assessedConstruct: question.assessedConstruct || null,
  prompt: String(question.prompt || ''),
  choices: publicChoices(question.choices),
  representation: question.representation ? String(question.representation) : null,
  stimulus: question.stimulus && typeof question.stimulus === 'object' ? JSON.parse(JSON.stringify(question.stimulus)) : null,
  responseFields: list(question.responseFields).map((field, index) => ({
    id: String(field?.id || `response-${index + 1}`),
    label: String(field?.label || `Response ${index + 1}`),
    inputProfile: field?.inputProfile || 'text',
    unit: field?.unit || null,
    responseHint: field?.responseHint ? String(field.responseHint) : null,
    placeholder: field?.placeholder ? String(field.placeholder) : null,
    ...(Array.isArray(field?.choices) ? { choices: publicChoices(field.choices) } : {}),
  })),
});

const fieldValuesEquivalent = (actual, field) => {
  const candidates = [field.expected, ...(Array.isArray(field.accepted) ? field.accepted : [])]
    .filter((value) => value !== undefined && value !== null);
  return candidates.some((expected) => {
    const actualText = String(actual ?? '').trim();
    const expectedText = String(expected ?? '').trim();
    if (field.caseSensitive && !Number.isFinite(Number(actual)) && !Number.isFinite(Number(expected))) {
      return actualText === expectedText;
    }
    const tolerance = Math.max(0, Number(field.numericTolerance) || 0);
    if (field.equivalence === 'polynomialRelation') {
      return answerEquivalence.samePolynomialEquationRelation(actual, expected, tolerance);
    }
    if (field.equivalence === 'absoluteLinearRelation') {
      return answerEquivalence.sameAbsoluteValueLinearEquation(actual, expected, tolerance);
    }
    if (field.equivalence === 'modelEquation') {
      return answerEquivalence.sameCommutativeModelEquation(actual, expected);
    }
    if (field.equivalence === 'setBuilder') {
      return answerEquivalence.sameSetBuilderNotation(actual, expected, tolerance);
    }
    if (field.equivalence === 'rationalExpression') {
      return answerEquivalence.sameRationalExpression(actual, expected, tolerance);
    }
    if (field.equivalence === 'nonnegativeRadicalExpression') {
      return answerEquivalence.sameNonnegativeRadicalExpression(actual, expected, tolerance);
    }
    return answerEquivalence.sameValue(actual, expected, tolerance);
  });
};

// Byte-for-byte equivalent in behaviour to the production field grader in
// functions/lib/mathPath.js. Kept here only because that CommonJS module pulls
// in Node crypto and cannot be bundled into the browser. The grading definition
// itself is shared from legacyFieldGrading.mjs, so the private answer contract
// cannot drift.
const gradeFieldResponse = (privateGrading, responsePayload = {}) => {
  const responses = responsePayload?.responses && typeof responsePayload.responses === 'object'
    ? responsePayload.responses
    : {};
  const fields = list(privateGrading?.fields);
  if (!fields.length) return { isCorrect: false, score: 0, parts: [] };
  const parts = fields.map((field) => ({ id: field.id, isCorrect: fieldValuesEquivalent(responses[field.id], field) }));
  const correctCount = parts.filter((part) => part.isCorrect).length;
  return { isCorrect: correctCount === fields.length, score: correctCount / fields.length, parts };
};

/**
 * Create the runtime.
 *
 * `onChange` is called with the updated synthetic learner and its session
 * assignment whenever evidence changes, so the Path, the mastery wheel and the
 * recommendation panel all re-render from one state.
 */
export const createTeacherPathRuntime = ({
  assignments = [],
  pathBankQuestions = null,
  courseId = 'algebra1',
  learner: initialLearner = null,
  onChange = null,
  requiredQuestions = 5,
  // The synthetic student's support entitlements, already resolved. Supplied
  // so a teacher can check that an accommodation actually reaches the screen —
  // which is the only way to discover a tool that cannot honour one.
  supportEntitlements = null,
} = {}) => {
  const usingSecureBank = Array.isArray(pathBankQuestions);
  const bank = usingSecureBank
    ? buildSimulationQuestionBankFromPathBank(pathBankQuestions)
    : buildSimulationQuestionBank(assignments);
  let learner = initialLearner || { id: 'simulated', gradesByAssignment: {} };
  const sessions = new Map();

  const masteryNow = (session) => buildMasteryBySkillForStudent({
    student: learner,
    assignments: [...assignments, sessionAssignment(session.sessionId, session.issued)],
  });

  const publish = (session) => {
    onChange?.({
      learner,
      sessionAssignment: sessionAssignment(session.sessionId, session.issued),
      session: publicSession(session),
    });
  };

  const publicSession = (session) => ({
    sessionId: session.sessionId,
    status: session.status,
    sessionKind: session.sessionKind,
    assessmentFramework: session.assessmentFramework || null,
    coursePracticeIntent: session.coursePracticeIntent || null,
    weekKey: session.weekKey || null,
    weeklySlotKey: session.weeklySlotKey || null,
    weeklySlot: session.weeklySlot || null,
    weeklyPurpose: session.weeklyPurpose || null,
    intendedDok: session.preferredDok || null,
    intendedDifficultyBand: session.preferredBand || null,
    requiredQuestions: session.requiredQuestions,
    target: { alignmentKey: session.targetAlignmentKey },
    summary: { ...session.summary },
    currentSkillId: session.currentSkillId,
    excursion: session.excursion,
    diagnosing: session.diagnosing,
    lastDecision: session.lastDecision,
    currentSkillCode: teksCodeFromSkillId(session.currentSkillId) || null,
    teacherMessage: session.teacherMessage || null,
    // The whole route so far, in the order it happened. This is what makes
    // "why am I on A.5A?" answerable rather than assertable.
    route: session.route.map((entry) => ({ ...entry })),
    simulated: true,
  });

  /**
   * Pick the next authored question for a skill.
   *
   * This is the PRODUCTION selector — the same `selectNextFamily` the Cloud
   * Function calls, over the same session-usage state. A teacher simulating a
   * student must be shown the item that student would actually be issued; a
   * simulator with its own cheaper rule (the round-robin that used to live
   * here) quietly becomes a second recommendation engine, which is the one
   * thing this architecture is not allowed to grow.
   */
  const chooseQuestion = (session, skillId) => {
    const candidates = (bank.get(skillId) || []).filter((entry) => {
      const authoredFramework = String(entry.question?.assessmentContext?.framework || 'course');
      return session.assessmentFramework
        ? authoredFramework === session.assessmentFramework && entry.question?.assessmentContext?.examStyle !== false
        : authoredFramework === 'course';
    });
    if (!candidates.length) return null;
    const byQuestion = new Map(candidates.map((entry) => [entry.question, entry]));
    const choice = selectNextFamily(candidates.map((entry) => entry.question), {
      preferredBand: session.preferredBand || 3,
      preferredDok: session.preferredDok || 2,
      usage: session.familyUsage || {},
      usedRepresentations: session.usedRepresentations || [],
      usedTaskTypes: session.usedTaskTypes || [],
    });
    if (!choice) return null;
    return { ...byQuestion.get(choice.question), selection: choice };
  };

  const issue = (session, skillId, role) => {
    const chosen = chooseQuestion(session, skillId);
    if (!chosen) {
      session.status = 'blocked';
      session.blockedSkillId = skillId;
      return null;
    }
    const selection = chosen.selection || null;
    const questionInstanceId = uid('qi');
    // The production bank now stores generator templates. The simulator must
    // instantiate the selected family before building either its public payload
    // or private grading definition, otherwise a teacher sees literal {{n}}
    // placeholders while a student receives a concrete server-generated item.
    const generated = hasPathGenerator(chosen.question)
      ? generatePathInstanceWithRetries(chosen.question, `${session.sessionId}|${questionInstanceId}`, 4, {
        preferredDok: session.preferredDok || 2,
        preferredDifficultyBand: session.preferredBand || 3,
      })
      : { question: chosen.question, parameters: null, reason: null };
    if (!generated.question) {
      session.status = 'blocked';
      session.blockedSkillId = skillId;
      session.generatorFailure = generated.reason || 'generator_failed';
      return null;
    }
    const issuedQuestion = generated.question;
    // The secure payload if this tool has a contract, and nothing at all if it
    // does not — the same allowlist the server applies.
    const toolPayload = buildPublicToolPayload(issuedQuestion);
    const fieldGraded = !toolPayload && hasFieldGradableDefinition(issuedQuestion);
    const instance = {
      questionInstanceId,
      ...(toolPayload ? {
        pathToolId: toolPayload.pathToolId,
        serverGradingVersion: toolPayload.serverGradingVersion,
        responseShape: toolPayload.responseShape,
        tool: toolPayload.tool,
      } : fieldGraded ? {
        // The starter secure bank is intentionally field-graded. This is the
        // same public shape production issues: labels and prompt, never the
        // expected answers. PathSessionPlayer already has a dedicated fields
        // renderer for exactly this payload.
        ...publicFieldPayload(issuedQuestion),
      } : {
        // Assignment fallback used only by tests/legacy callers. Student
        // Experience passes `pathBankQuestions`, so production simulation never
        // silently substitutes classroom content for an empty secure bank.
        canonicalQuestion: issuedQuestion,
      }),
      skillId,
      teksCode: chosen.teksCode,
      alignmentKey: toCanonicalKey(chosen.teksCode),
      activityRole: role === PATH_ACTION.DIAGNOSE ? 'checkpoint' : 'practice',
      pathRole: role,
      attemptsAllowed: role === PATH_ACTION.DIAGNOSE ? 1 : 3,
      attemptsUsed: 0,
      sourceAssignmentId: chosen.sourceAssignmentId,
      sourceQuestionIndex: chosen.sourceQuestionIndex,
      sourceBankQuestionId: chosen.sourceBankQuestionId,
      // Why THIS item, in the same fields production returns. Teacher-facing
      // only — none of it identifies the answer.
      // Which authorized supports apply here, decided the same way the server
      // decides them, so the simulator exercises the real contract.
      applicableSupports: list(supportEntitlements?.authorized),
      authorizedSupports: list(supportEntitlements?.authorized),
      selectionReason: selection?.reason || null,
      contentQuality: selection?.quality || null,
      selectedRepresentation: selection?.representation || null,
      selectedTaskType: selection?.taskType || null,
      selectedBand: selection?.band ?? null,
      selectedDok: Number(issuedQuestion.dok) || null,
      preferredBand: selection?.preferredBand ?? session.preferredBand ?? null,
      preferredDok: session.preferredDok ?? null,
      weeklyPurpose: session.weeklyPurpose || null,
      unusedFamiliesRemaining: selection?.unusedRemaining ?? null,
      isRepeatFamily: selection?.isRepeat ?? null,
    };
    // Session-level usage, so the next pick can prefer an unused family and a
    // representation this session has not shown yet.
    session.familyUsage = recordFamilyUse(session.familyUsage || {}, chosen.question?.id, session.issued.length + 1);
    if (selection?.representation) {
      session.usedRepresentations = [...new Set([...(session.usedRepresentations || []), selection.representation])];
    }
    if (selection?.taskType) {
      session.usedTaskTypes = [...new Set([...(session.usedTaskTypes || []), selection.taskType])];
    }
    // The grading definition stays here, alongside the session, exactly as the
    // server keeps it in `session.currentQuestion`. It is never part of the
    // instance handed to the renderer.
    session.privateGrading = toolPayload
      ? buildPrivateToolGrading(issuedQuestion)
      : (fieldGraded ? buildFieldGradingDefinition(issuedQuestion) : null);
    session.privateGradingMode = toolPayload ? 'tool' : (fieldGraded ? 'fields' : 'canonical');
    // Same rule as production: feedback, hints and the review are held beside
    // the grading definition and released by attempt, never issued with the
    // question.
    session.privateSupport = buildPrivateSupport(issuedQuestion);
    session.issued.push({ ...instance, question: issuedQuestion, generatorParameters: generated.parameters });
    session.currentQuestion = instance;
    session.currentSkillId = skillId;
    return instance;
  };

  const recordEvidence = (session, instance, isCorrect, supportUsage) => {
    const assignmentGrades = { ...(learner.gradesByAssignment?.[session.sessionId] || {}) };
    const index = session.issued.length - 1;
    const outcome = recordQuestionAttempt({
      record: assignmentGrades[index] ?? null,
      isCorrect,
      questionDetails: String(instance.canonicalQuestion?.prompt || instance.tool?.prompt || '').slice(0, 160),
      supportUsage,
    });
    assignmentGrades[index] = outcome.record;
    learner = {
      ...learner,
      gradesByAssignment: { ...learner.gradesByAssignment, [session.sessionId]: assignmentGrades },
    };
    return outcome;
  };

  // --- The three calls the container makes -----------------------------------

  const startOrResumePathSession = async ({
    targetAlignmentKey,
    sessionKind = 'practice',
    requiredQuestions: required = requiredQuestions,
    assessmentFramework = null,
    coursePracticeIntent = null,
    weekKey = null,
    weeklySlotKey = null,
    weeklySlot = null,
    intendedDok = null,
    intendedDifficultyBand = null,
    weeklyPurpose = null,
  }) => {
    const code = toDisplayCode(targetAlignmentKey);
    const skillId = teksSkillId(code);

    // RESUME, as production does. The server keeps an `activePathLocks` entry
    // per student and target and hands back the open session rather than
    // starting a second one — that is what makes a refresh mid-question return
    // the student to the question they were on. This runtime always minted a
    // new session, so a teacher testing "what happens if a student refreshes"
    // watched behaviour no student would get, and the current question silently
    // became unreachable.
    const existing = [...sessions.values()].find((candidate) => (
      candidate.status === 'active'
      && candidate.targetAlignmentKey === toCanonicalKey(code)
      && candidate.sessionKind === sessionKind
      && (candidate.assessmentFramework || null) === (assessmentFramework || null)
      && (candidate.coursePracticeIntent || null) === (coursePracticeIntent === 'challenge' ? 'challenge' : null)
      && (candidate.weeklySlotKey || null) === (weeklySlotKey || null)
    ));
    if (existing) {
      publish(existing);
      return { success: true, session: publicSession(existing), resumed: true };
    }

    const session = {
      sessionId: uid('sim_path'),
      status: 'active',
      sessionKind,
      assessmentFramework: assessmentFramework || null,
      coursePracticeIntent: coursePracticeIntent === 'challenge' ? 'challenge' : null,
      weekKey: weekKey || null,
      weeklySlotKey: weeklySlotKey || null,
      weeklySlot: weeklySlot || null,
      weeklyPurpose: weeklyPurpose || null,
      requiredQuestions: Math.max(1, Math.min(10, Number(required) || 5)),
      targetAlignmentKey: toCanonicalKey(code),
      originSkillId: skillId,
      currentSkillId: skillId,
      excursion: null,
      diagnosing: null,
      lastDecision: null,
      summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
      evidenceBySkill: { [skillId]: emptyEvidence() },
      // Selection state, identical in shape to the live session document.
      // A weekly simulated launch receives the same frozen target the live
      // server resolved from its weekly snapshot. Open-practice simulation
      // keeps the current baseline until its separate pass/readiness parity
      // audit supplies a stronger target.
      preferredBand: coursePracticeIntent === 'challenge' && !weeklySlotKey
        ? 4
        : (intendedDifficultyBand != null && Number.isFinite(Number(intendedDifficultyBand))
          ? Number(intendedDifficultyBand)
          : 3),
      preferredDok: coursePracticeIntent === 'challenge' && !weeklySlotKey
        ? 3
        : (intendedDok != null && Number.isFinite(Number(intendedDok))
          ? Number(intendedDok)
          : 2),
      familyUsage: {},
      usedRepresentations: [],
      usedTaskTypes: [],
      issued: [],
      route: [{ at: 'start', skillId, reason: 'session_target', explanation: `Session started on ${describeSkill(skillId).shortLabel || code}.` }],
      currentQuestion: null,
      // submissionId -> the result that submission produced. Bounded by the
      // handful of questions in a session, so it needs no eviction.
      submissions: new Map(),
    };
    sessions.set(session.sessionId, session);
    publish(session);
    return { success: true, session: publicSession(session) };
  };

  const fetchNextSanitizedQuestion = async ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('That simulated session no longer exists.');
    if (session.currentQuestion) return { questionInstance: session.currentQuestion };
    const instance = issue(session, session.currentSkillId, session.lastDecision?.action || PATH_ACTION.CONTINUE);
    if (!instance) {
      const code = teksCodeFromSkillId(session.blockedSkillId) || session.blockedSkillId;
      throw new Error(usingSecureBank
        ? `The secure Path bank has no issuable question aligned to ${code}. Initialize or add Path-bank content for this standard, then refresh the simulation.`
        : `No authored question in your assignments is aligned to ${code}, so the simulation cannot issue one. Add a question for it and start again.`);
    }
    publish(session);
    return { questionInstance: instance };
  };

  /**
   * One attempt.
   *
   * For a contract-graded question the verdict is computed here from the
   * student's raw work and the private definition. `isCorrect` in the arguments
   * is only read for a canonical question, which has no contract to grade it.
   */
  const submitStudentResponse = async ({
    sessionId, questionInstanceId, submissionId = null, isCorrect,
    supportUsage = {}, responsePayload = null, forcedVerdict = null,
    // Accepted so the simulator takes the same call shape the live service
    // does — a teacher checking accommodation delivery must not be exercising
    // a different contract from the one a student runs on.
    supportsPresented = [], supportsUsed = [],
  }) => {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('That simulated session no longer exists.');

    // Idempotency, exactly as production does it. A dropped response on a
    // Chromebook makes the container retry with the SAME submission id; that
    // retry must return the first result rather than burn a second attempt.
    // The simulator has to honour this too, or a teacher testing a flaky
    // network watches behaviour no student would get.
    if (submissionId && session.submissions?.has(submissionId)) {
      return session.submissions.get(submissionId);
    }

    if (session.currentQuestion?.questionInstanceId !== questionInstanceId) {
      throw new Error('That simulated question is no longer active.');
    }
    const instance = session.currentQuestion;
    // Every return path below goes through this, so a replay of any of them —
    // rejected, mid-question, or finalized — replays identically.
    const remember = (result) => {
      if (submissionId) {
        if (!session.submissions) session.submissions = new Map();
        session.submissions.set(submissionId, result);
      }
      return result;
    };

    let graded = null;
    if (typeof forcedVerdict === 'boolean') {
      // Teacher Simulator only: the teacher is explicitly forcing the outcome
      // of the CURRENT secure Path question. The real session/attempt/routing
      // machinery still processes the evidence; only answer evaluation is
      // bypassed for this synthetic action.
      isCorrect = forcedVerdict;
      graded = { isCorrect, score: isCorrect ? 1 : 0, parts: [], forced: true };
    } else if (instance.pathToolId) {
      graded = gradePathResponse({
        privateGrading: session.privateGrading,
        raw: responsePayload?.raw && typeof responsePayload.raw === 'object' ? responsePayload.raw : responsePayload,
      });
      if (graded.rejected) {
        // Not marked wrong — not marked at all. The attempt does not count.
        return remember({
          success: false,
          rejected: true,
          reason: graded.reason,
          grading: { isCorrect: false, attemptNumber: instance.attemptsUsed || 0, attemptsRemaining: instance.attemptsAllowed - (instance.attemptsUsed || 0), questionFinalized: false, rejected: true, reason: graded.reason },
          session: publicSession(session),
          needsNextQuestion: false,
        });
      }
      isCorrect = graded.isCorrect;
    } else if (session.privateGradingMode === 'fields') {
      graded = gradeFieldResponse(session.privateGrading, responsePayload);
      isCorrect = graded.isCorrect;
    }

    // Same reconciliation the server performs, so what a teacher sees recorded
    // is what a student would have recorded.
    const applicable = list(instance.applicableSupports);
    const presentedHere = list(supportsPresented).filter((id) => applicable.includes(String(id)));
    const usedHere = list(supportsUsed).filter((id) => presentedHere.includes(String(id)));
    const reconciledUsage = {
      ...supportUsage,
      accommodations: usedHere,
      accommodationsPresented: presentedHere,
      accommodationsApplicable: applicable,
      accommodationsNotDelivered: applicable.filter((id) => !presentedHere.includes(id)),
    };
    recordEvidence(session, instance, isCorrect === true, reconciledUsage);

    instance.attemptsUsed = (instance.attemptsUsed || 0) + 1;
    const finalized = isCorrect === true || instance.attemptsUsed >= instance.attemptsAllowed;

    const attemptSupport = buildAttemptSupportPayload({
      support: session.privateSupport,
      attemptNumber: instance.attemptsUsed,
      attemptsAllowed: instance.attemptsAllowed,
      isCorrect: isCorrect === true,
      questionFinalized: finalized,
      responsePayload,
    });

    if (!finalized) {
      // Attempts within a question are for assistance, not evidence of a gap.
      publish(session);
      return remember({
        success: true,
        grading: { isCorrect: false, score: graded?.score ?? 0, parts: graded?.parts || [], attemptNumber: instance.attemptsUsed, attemptsRemaining: instance.attemptsAllowed - instance.attemptsUsed, questionFinalized: false },
        feedback: attemptSupport.feedback,
        support: attemptSupport.support,
        solutionReview: null,
        session: publicSession(session),
        needsNextQuestion: false,
      });
    }

    // Finalized: this is now evidence.
    const skillEvidence = session.evidenceBySkill[instance.skillId] || emptyEvidence();
    skillEvidence.finalized += 1;
    if (!isCorrect) { skillEvidence.missed += 1; skillEvidence.consecutiveMisses += 1; } else { skillEvidence.consecutiveMisses = 0; }
    session.evidenceBySkill[instance.skillId] = skillEvidence;
    session.summary.completedQuestions += 1;
    session.summary.correctQuestions += isCorrect ? 1 : 0;
    if (isCorrect && supportUsage.isMathematicallyIndependent !== false && !supportUsage.hintUsed && !supportUsage.scaffoldUsed) {
      session.summary.independentSuccesses += 1;
    }

    const masteryBySkill = masteryNow(session);

    // A diagnostic resolves differently: passing sends the student back up with
    // support rather than deeper down.
    const decision = session.diagnosing
      ? resolveDiagnostic({ diagnosing: session.diagnosing, isCorrect, excursion: session.excursion })
      : decideNextStep({
        courseId,
        currentSkillId: instance.skillId,
        masteryBySkill,
        outcome: { isCorrect },
        sessionEvidence: skillEvidence,
        excursion: session.excursion,
        requiredQuestions: session.requiredQuestions,
        completedQuestions: session.summary.completedQuestions,
        // The same coverage gate the server applies, answered from the bank
        // this simulation was actually loaded with. Without it a teacher would
        // watch a routing decision that production would refuse to make.
        isCovered: (skillId) => bankHasSkill(bank, skillId),
      });

    session.diagnosing = decision.action === PATH_ACTION.DIAGNOSE ? decision.diagnosing : null;
    session.excursion = decision.excursion ?? null;
    const studentNotice = explainStepForStudent(decision);
    session.lastDecision = {
      action: decision.action,
      reason: decision.reason,
      explanation: decision.explanation,
      skillId: decision.skillId,
      returnTo: decision.returnTo || null,
      excursion: decision.excursion || null,
      // Composed here as well as on the server, from the same function, so the
      // simulator shows a teacher the sentence a student would actually read.
      studentHeadline: studentNotice?.headline || null,
      studentMessage: studentNotice?.message || null,
      studentTone: studentNotice?.tone || null,
    };
    session.route.push({
      at: `question ${session.summary.completedQuestions}`,
      action: decision.action,
      skillId: decision.skillId,
      reason: decision.reason,
      explanation: decision.explanation,
      wasCorrect: isCorrect === true,
    });

    if (decision.action === PATH_ACTION.TEACHER_SUPPORT) {
      session.status = 'teacherSupportNeeded';
      session.teacherMessage = decision.explanation;
    } else if (decision.action === PATH_ACTION.COMPLETE) {
      session.status = 'completed';
    } else {
      // BRIDGE and RETURN_TO_ORIGIN both end the excursion: the bridging
      // question is asked on the origin skill, which is where the student is
      // going back to.
      const nextSkill = decision.action === PATH_ACTION.BRIDGE ? decision.returnTo : decision.skillId;
      session.currentSkillId = nextSkill || instance.skillId;
      if (decision.action === PATH_ACTION.BRIDGE || decision.action === PATH_ACTION.RETURN_TO_ORIGIN) session.excursion = null;
      if (!session.evidenceBySkill[session.currentSkillId]) session.evidenceBySkill[session.currentSkillId] = emptyEvidence();
    }

    session.currentQuestion = null;
    session.privateGrading = null;
    session.privateGradingMode = null;
    session.privateSupport = null;
    publish(session);

    return remember({
      success: true,
      grading: { isCorrect: isCorrect === true, score: graded?.score ?? (isCorrect ? 1 : 0), parts: graded?.parts || [], attemptNumber: instance.attemptsUsed, attemptsRemaining: 0, questionFinalized: true },
      feedback: attemptSupport.feedback,
      support: attemptSupport.support,
      solutionReview: attemptSupport.solutionReview,
      session: publicSession(session),
      decision,
      needsNextQuestion: session.status === 'active',
    });
  };

  const forceCurrentQuestionOutcome = async ({ sessionId, questionInstanceId = null, outcomeId }) => {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('That simulated Path session no longer exists.');

    const ensureQuestion = () => {
      if (session.currentQuestion) return session.currentQuestion;
      if (session.status !== 'active') return null;
      return issue(session, session.currentSkillId, session.lastDecision?.action || PATH_ACTION.CONTINUE);
    };

    // The instance the teacher was looking at when they pressed the button.
    // A multi-attempt control (repeatedError, repeatedSuccess) legitimately
    // moves on to the next question mid-run, so the check is against what the
    // FIRST attempt of this action saw, not against the button's argument
    // forever.
    let expectedInstanceId = questionInstanceId || null;

    const runAttempt = async (isCorrect, supportUsage = {}) => {
      const instance = ensureQuestion();
      if (!instance) throw new Error('There is no active Path question to force.');
      // The guard used to carry `&& session.summary.completedQuestions === 0`,
      // which meant it only ever fired on the very first question of a session.
      // From question two onward a force action aimed at a stale instance was
      // silently applied to whatever was current instead, and the teacher got a
      // success notice for an action taken against a different question than
      // the one on their screen.
      if (expectedInstanceId && instance.questionInstanceId !== expectedInstanceId) {
        throw new Error('The displayed Path question changed before the force action was applied. Nothing was recorded — try again on the question now on screen.');
      }
      // Subsequent attempts in the same multi-attempt action follow the
      // session wherever routing takes it.
      expectedInstanceId = null;
      return submitStudentResponse({
        sessionId,
        questionInstanceId: instance.questionInstanceId,
        forcedVerdict: isCorrect,
        supportUsage,
        responsePayload: null,
      });
    };

    if (outcomeId === 'skip') {
      const skipped = ensureQuestion();
      if (!skipped) throw new Error('There is no active Path question to skip.');
      session.route.push({
        at: `question ${session.summary.completedQuestions + 1}`,
        action: PATH_ACTION.CONTINUE,
        skillId: skipped.skillId,
        reason: 'teacher_simulator_skip',
        explanation: 'Teacher Simulator skipped this item without adding mastery evidence.',
        wasCorrect: null,
      });
      session.currentQuestion = null;
      session.privateGrading = null;
      session.privateGradingMode = null;
      const next = session.status === 'active'
        ? issue(session, session.currentSkillId, PATH_ACTION.CONTINUE)
        : null;
      publish(session);
      return {
        success: true,
        grading: { isCorrect: false, skipped: true, questionFinalized: true, attemptNumber: 0, attemptsRemaining: 0 },
        session: publicSession(session),
        decision: { action: PATH_ACTION.CONTINUE, reason: 'teacher_simulator_skip', explanation: 'Skipped without evidence.' },
        needsNextQuestion: Boolean(next),
        questionInstance: next,
        forcedOutcomeId: outcomeId,
      };
    }

    let result = null;
    if (outcomeId === 'forceCorrect') {
      result = await runAttempt(true);
    } else if (outcomeId === 'forceIncorrect') {
      result = await runAttempt(false);
    } else if (outcomeId === 'forceHinted') {
      result = await runAttempt(true, { hintUsed: true, isMathematicallyIndependent: false });
    } else if (outcomeId === 'repeatedError') {
      let guard = 0;
      do {
        result = await runAttempt(false);
        guard += 1;
      } while (result?.grading && !result.grading.questionFinalized && guard < 6);
    } else if (outcomeId === 'repeatedSuccess') {
      let guard = 0;
      while (session.status === 'active' && session.summary.completedQuestions < session.requiredQuestions && guard < 12) {
        result = await runAttempt(true);
        guard += 1;
        if (session.status === 'active' && !session.currentQuestion) {
          issue(session, session.currentSkillId, session.lastDecision?.action || PATH_ACTION.CONTINUE);
        }
      }
    } else {
      throw new Error(`Unsupported Path force outcome: ${outcomeId}`);
    }

    if (session.status === 'active' && !session.currentQuestion) {
      issue(session, session.currentSkillId, session.lastDecision?.action || PATH_ACTION.CONTINUE);
    }
    publish(session);
    return {
      ...result,
      session: publicSession(session),
      questionInstance: session.currentQuestion,
      forcedOutcomeId: outcomeId,
    };
  };

  return {
    startOrResumePathSession,
    fetchNextSanitizedQuestion,
    submitStudentResponse,
    forceCurrentQuestionOutcome,
    getLearner: () => learner,
    /**
     * Take an updated synthetic learner WITHOUT tearing the runtime down.
     *
     * The container used to re-create the runtime whenever the learner prop
     * changed — but this runtime mutates `learner` on every recorded attempt
     * and publishes it back up, so the learner prop changed after every single
     * answer. A new runtime means a new empty `sessions` map, while the
     * student container is still holding the old session id: the next call
     * threw "That simulated session no longer exists." Multi-question routing
     * — descent, bridge-back, extension — was unreachable through the UI even
     * though it passed when tests drove the runtime directly.
     *
     * An echo of the runtime's own object is ignored, so publishing does not
     * loop.
     */
    syncLearner: (nextLearner) => {
      if (!nextLearner || nextLearner === learner) return false;
      learner = nextLearner;
      return true;
    },
    getSessionAssignments: () => [...sessions.values()].map((session) => sessionAssignment(session.sessionId, session.issued)),
    hasQuestionsFor: (skillId) => bankHasSkill(bank, skillId),
    alignedSkillIds: () => [...bank.keys()],
  };
};
