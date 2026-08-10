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
// student path uses. The only things that differ are where the questions come
// from (the teacher's own authored assignments instead of the published
// Firestore bank) and where grading happens.
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
import { getQuestionPrimaryTeksCodes } from '../../questionMetadata.js';
import { teksSkillId, teksCodeFromSkillId, describeSkill } from '../path/skillGraph.js';
import { buildMasteryBySkillForStudent } from '../path/masteryAdapter.js';
import { PATH_ACTION, decideNextStep, resolveDiagnostic } from '../path/pathSessionRouting.js';
import { recordQuestionAttempt } from '../../attemptPolicy.js';
import { toCanonicalKey, toDisplayCode } from '../../utils/teksUtils.js';

const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Index the teacher's own authored questions by the skill they assess.
 *
 * This is the honest local answer to "where do path questions come from" in a
 * simulator: the teacher's real content, with its real tools and real TEKS —
 * not a sandbox item that asks the student to type 4.
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
          teksCode: toDisplayCode(code),
        });
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

/**
 * Create the runtime.
 *
 * `onChange` is called with the updated synthetic learner and its session
 * assignment whenever evidence changes, so the Path, the mastery wheel and the
 * recommendation panel all re-render from one state.
 */
export const createTeacherPathRuntime = ({
  assignments = [],
  courseId = 'algebra1',
  learner: initialLearner = null,
  onChange = null,
  requiredQuestions = 5,
} = {}) => {
  const bank = buildSimulationQuestionBank(assignments);
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
    requiredQuestions: session.requiredQuestions,
    target: { alignmentKey: session.targetAlignmentKey },
    summary: { ...session.summary },
    currentSkillId: session.currentSkillId,
    excursion: session.excursion,
    diagnosing: session.diagnosing,
    lastDecision: session.lastDecision,
    teacherMessage: session.teacherMessage || null,
    // The whole route so far, in the order it happened. This is what makes
    // "why am I on A.5A?" answerable rather than assertable.
    route: session.route.map((entry) => ({ ...entry })),
    simulated: true,
  });

  /** Pick the next authored question for a skill, avoiding immediate repeats. */
  const chooseQuestion = (session, skillId) => {
    const candidates = bank.get(skillId) || [];
    if (!candidates.length) return null;
    const seen = session.issued.filter((entry) => entry.skillId === skillId).length;
    return candidates[seen % candidates.length];
  };

  const issue = (session, skillId, role) => {
    const chosen = chooseQuestion(session, skillId);
    if (!chosen) {
      session.status = 'blocked';
      session.blockedSkillId = skillId;
      return null;
    }
    const questionInstanceId = uid('qi');
    // The secure payload if this tool has a contract, and nothing at all if it
    // does not — the same allowlist the server applies.
    const toolPayload = buildPublicToolPayload(chosen.question);
    const instance = {
      questionInstanceId,
      ...(toolPayload ? {
        pathToolId: toolPayload.pathToolId,
        serverGradingVersion: toolPayload.serverGradingVersion,
        responseShape: toolPayload.responseShape,
        tool: toolPayload.tool,
      } : {
        // No contract for this tool: the complete question, rendered through the
        // ordinary QuestionEngine and marked locally.
        canonicalQuestion: chosen.question,
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
    };
    // The grading definition stays here, alongside the session, exactly as the
    // server keeps it in `session.currentQuestion`. It is never part of the
    // instance handed to the renderer.
    session.privateGrading = toolPayload ? buildPrivateToolGrading(chosen.question) : null;
    session.issued.push({ ...instance, question: chosen.question });
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

  const startOrResumePathSession = async ({ targetAlignmentKey, sessionKind = 'practice', requiredQuestions: required = requiredQuestions }) => {
    const code = toDisplayCode(targetAlignmentKey);
    const skillId = teksSkillId(code);
    const session = {
      sessionId: uid('sim_path'),
      status: 'active',
      sessionKind,
      requiredQuestions: Math.max(1, Math.min(10, Number(required) || 5)),
      targetAlignmentKey: toCanonicalKey(code),
      originSkillId: skillId,
      currentSkillId: skillId,
      excursion: null,
      diagnosing: null,
      lastDecision: null,
      summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
      evidenceBySkill: { [skillId]: emptyEvidence() },
      issued: [],
      route: [{ at: 'start', skillId, reason: 'session_target', explanation: `Session started on ${describeSkill(skillId).shortLabel || code}.` }],
      currentQuestion: null,
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
      throw new Error(`No authored question in your assignments is aligned to ${code}, so the simulation cannot issue one. Add a question for it and start again.`);
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
  const submitStudentResponse = async ({ sessionId, questionInstanceId, isCorrect, supportUsage = {}, responsePayload = null }) => {
    const session = sessions.get(sessionId);
    if (!session || session.currentQuestion?.questionInstanceId !== questionInstanceId) {
      throw new Error('That simulated question is no longer active.');
    }
    const instance = session.currentQuestion;

    let graded = null;
    if (instance.pathToolId) {
      graded = gradePathResponse({
        privateGrading: session.privateGrading,
        raw: responsePayload?.raw && typeof responsePayload.raw === 'object' ? responsePayload.raw : responsePayload,
      });
      if (graded.rejected) {
        // Not marked wrong — not marked at all. The attempt does not count.
        return {
          success: false,
          rejected: true,
          reason: graded.reason,
          grading: { isCorrect: false, attemptNumber: instance.attemptsUsed || 0, attemptsRemaining: instance.attemptsAllowed - (instance.attemptsUsed || 0), questionFinalized: false, rejected: true, reason: graded.reason },
          session: publicSession(session),
          needsNextQuestion: false,
        };
      }
      isCorrect = graded.isCorrect;
    }

    recordEvidence(session, instance, isCorrect === true, supportUsage);

    instance.attemptsUsed = (instance.attemptsUsed || 0) + 1;
    const finalized = isCorrect === true || instance.attemptsUsed >= instance.attemptsAllowed;

    if (!finalized) {
      // Attempts within a question are for assistance, not evidence of a gap.
      publish(session);
      return {
        success: true,
        grading: { isCorrect: false, score: graded?.score ?? 0, parts: graded?.parts || [], attemptNumber: instance.attemptsUsed, attemptsRemaining: instance.attemptsAllowed - instance.attemptsUsed, questionFinalized: false },
        session: publicSession(session),
        needsNextQuestion: false,
      };
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
      });

    session.diagnosing = decision.action === PATH_ACTION.DIAGNOSE ? decision.diagnosing : null;
    session.excursion = decision.excursion ?? null;
    session.lastDecision = { action: decision.action, reason: decision.reason, explanation: decision.explanation, skillId: decision.skillId };
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
    publish(session);

    return {
      success: true,
      grading: { isCorrect: isCorrect === true, score: graded?.score ?? (isCorrect ? 1 : 0), parts: graded?.parts || [], attemptNumber: instance.attemptsUsed, attemptsRemaining: 0, questionFinalized: true },
      session: publicSession(session),
      decision,
      needsNextQuestion: session.status === 'active',
    };
  };

  return {
    startOrResumePathSession,
    fetchNextSanitizedQuestion,
    submitStudentResponse,
    getLearner: () => learner,
    getSessionAssignments: () => [...sessions.values()].map((session) => sessionAssignment(session.sessionId, session.issued)),
    hasQuestionsFor: (skillId) => bankHasSkill(bank, skillId),
    alignedSkillIds: () => [...bank.keys()],
  };
};
