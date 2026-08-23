// Teacher Path Simulator — the data model.
//
// The architectural requirement is that the simulator must not be a second
// imitation of the student product. That is achievable here because the whole
// mastery and routing stack is already pure:
//
//   buildStudentMasteryProfile({ student, assignments })  →  profile
//   resolvePrerequisiteSupportPath(question, profile)     →  routing
//   applyAdaptiveDifferentiation(question, profile)       →  the next question
//
// None of those touch Firestore or React. So a simulated learner is not a
// parallel model of a student — it *is* a student document, with the same
// gradesByAssignment and supportUsageByAssignment shapes, living under a
// separate namespace. Every engine in this file runs the real functions on it.
//
// The same is true of outcomes: "Force Incorrect" does not paint a screen red,
// it calls the real recordQuestionAttempt with the real attempt policy, writes
// the resulting record into the synthetic document, and lets the profile and
// the routing fall out of that. If the engine changes, the simulator changes
// with it, because there is nothing here to keep in step.

import { recordQuestionAttempt, normalizeQuestionRecord, getQuestionCredit } from '../../attemptPolicy.js';
import { buildStudentMasteryProfile, collectStudentEvidence } from '../../masteryEngine.js';
import { applyAdaptiveDifferentiation, resolvePrerequisiteSupportPath } from '../../differentiationEngine.js';
import { getQuestionPrimaryTeksCodes } from '../../questionMetadata.js';
import { getTexasStandard } from '../../texasStandards.js';
import { adaptLegacyMasteryToPhase5 } from '../profile/legacyMasteryAdapter.js';
import { evidenceRowsToEvents } from '../profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from '../profile/studentLearningProfile.js';

// Everything the simulator writes lives under this key, never alongside student
// records. Nothing here reaches grades, analytics, Classroom, or class reports.
export const SIMULATION_NAMESPACE = 'teacherSimulation';

// A seeded assignment id is prefixed so it can never collide with a real one
// and is trivially filterable out of anything that scans assignments.
export const SIM_SEED_PREFIX = 'sim-seed:';

export const isSimulatedAssignmentId = (id) => String(id || '').startsWith(SIM_SEED_PREFIX);

export const STARTING_PROFILES = Object.freeze([
  {
    id: 'fresh',
    label: 'Fresh student',
    description: 'No history at all. Every routing decision starts from insufficient evidence.',
    // targetKey null means "seed nothing".
    targetKey: null,
  },
  {
    id: 'struggling',
    label: 'Struggling student',
    description: 'Prerequisite gaps on the target skill, so remediation routing is reachable immediately.',
    targetKey: 'didNotMeet',
  },
  {
    id: 'approaching',
    label: 'Approaching student',
    description: 'Partial command of the target skill — the band where support is recommended but not forced.',
    targetKey: 'approaches',
  },
  {
    id: 'onLevel',
    label: 'On-level student',
    description: 'Expected prerequisite skills in place and the target skill met.',
    targetKey: 'meets',
  },
  {
    id: 'advanced',
    label: 'Advanced student',
    description: 'Target and prerequisite skills mastered, so acceleration routing is reachable.',
    targetKey: 'masters',
  },
]);

export const getStartingProfile = (id) => STARTING_PROFILES.find((profile) => profile.id === id) || STARTING_PROFILES[0];

// The outcome controls a teacher gets and a student never does. Each one is
// expressed as a list of synthetic attempts, so they all travel the same path
// through recordQuestionAttempt rather than each inventing its own state edit.
export const OUTCOME_CONTROLS = Object.freeze([
  { id: 'forceCorrect', label: 'Force Correct', hint: 'Process this question as answered correctly on the first try.' },
  { id: 'forceIncorrect', label: 'Force Incorrect', hint: 'Process one incorrect attempt.' },
  { id: 'forceHinted', label: 'Force Hint Usage', hint: 'Correct, but with a hint — mathematical assistance discounts the evidence.' },
  { id: 'repeatedError', label: 'Trigger Repeated Error', hint: 'Three consecutive misses, exhausting the attempt policy.' },
  { id: 'repeatedSuccess', label: 'Trigger Repeated Success', hint: 'A clean streak across the remaining questions of this skill.' },
  { id: 'skip', label: 'Skip / Abandon', hint: 'Leave the question unanswered and move on.' },
  { id: 'forceSkillMastery', label: 'Force Skill Mastery', hint: 'Seed enough successful evidence to push this skill to Masters, then re-route.' },
  { id: 'forceSkillFailure', label: 'Force Skill Failure', hint: 'Seed enough failed evidence to cross the remediation threshold, then re-route.' },
  { id: 'forceRetentionDue', label: 'Make Retention Due', hint: 'Backdate this skill so a retention check comes due, then watch the Path offer one.' },
]);

const OUTCOME_IDS = new Set(OUTCOME_CONTROLS.map((control) => control.id));
export const isOutcomeControl = (id) => OUTCOME_IDS.has(id);

const HINTED_SUPPORT = Object.freeze({ hintUsed: true, isMathematicallyIndependent: false });

/**
 * The attempts an outcome represents. Everything downstream is driven from
 * this, so a new control means one entry here rather than a new code path.
 */
export const attemptsForOutcome = (outcomeId) => {
  switch (outcomeId) {
    case 'forceCorrect': return [{ isCorrect: true }];
    case 'forceIncorrect': return [{ isCorrect: false }];
    case 'forceHinted': return [{ isCorrect: true, supportUsage: HINTED_SUPPORT }];
    case 'repeatedError': return [{ isCorrect: false }, { isCorrect: false }, { isCorrect: false }];
    case 'repeatedSuccess': return [{ isCorrect: true }];
    case 'skip': return [];
    default: return [];
  }
};

const emptyLearnerDocument = (id, label) => ({
  id,
  name: label,
  isSimulated: true,
  classPeriod: 'Simulation',
  gradesByAssignment: {},
  supportUsageByAssignment: {},
  assignmentActivity: {},
});

// A synthetic question carrying a single TEKS code, used only to seed a
// starting state. It goes through the same evidence collection as any authored
// question, which is the point: nothing writes a performance level directly.
const seedQuestion = (code, index, { activityRole = 'classwork', dok = null, difficultyBand = 3 } = {}) => ({
  questionId: `${SIM_SEED_PREFIX}q${index}`,
  type: 'algebra',
  prompt: `Simulated prior evidence for ${code}.`,
  // DOK 3 on at least one item is required before the engine will estimate
  // Masters, so the seed has to span complexity rather than repeat easy items.
  dok: dok ?? (index % 3 === 0 ? 3 : 2),
  difficultyBand,
  activityRole,
  alignments: [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }],
});

/**
 * CONTEXT EVIDENCE — why a simulated learner needs more than one standard.
 *
 * The target-skill seed puts a synthetic student into a chosen performance band
 * on ONE standard, which is exactly right for testing a routing decision about
 * that standard. It is not enough to build a Student Learning Profile: that
 * requires 12 usable events across 3 standards and 2 kinds of work before it
 * will classify anyone, deliberately, because a label formed from six questions
 * on one skill is not a judgement about a child.
 *
 * The visible consequence was that every simulated profile — Fresh, Struggling,
 * On-level, Advanced — read as "Establishing Baseline" and produced the same
 * week. A teacher opening the simulator to see whether the engine adapts would
 * have concluded that it does not.
 *
 * So the Weekly Path view seeds SURROUNDING evidence too: neighbouring
 * standards, at a level consistent with the chosen profile, across a second
 * kind of work. A real student always has this. It is opt-in so that every
 * existing routing test and Question Bench scenario keeps the exact learner it
 * was calibrated against.
 */
const CONTEXT_PLAN = {
  masters: { total: 4, correct: 4, band: 4 },
  meets: { total: 4, correct: 3, band: 3 },
  approaches: { total: 4, correct: 2, band: 3 },
  didNotMeet: { total: 4, correct: 1, band: 2 },
};

// Correct-answer ratio chosen to land inside each performance band. The bands
// are score >= 85 masters, >= 70 meets, >= 55 approaches, else didNotMeet, and
// the score is credit-weighted rather than a raw count, so these are deliberate
// over-shoots that the engine then scores for itself.
const SEED_PLAN = {
  masters: { total: 6, correct: 6 },
  meets: { total: 6, correct: 5 },
  approaches: { total: 6, correct: 4 },
  didNotMeet: { total: 6, correct: 1 },
};

/**
 * Build the synthetic assignment plus records that put a simulated learner into
 * a chosen starting state for a set of TEKS codes.
 */
export const buildSeedEvidence = ({
  targetKey,
  teksCodes = [],
  assignmentId = `${SIM_SEED_PREFIX}baseline`,
  // Neighbouring standards to seed alongside the target, so the learner has a
  // profile rather than a single data point. Empty by default.
  contextCodes = [],
}) => {
  const codes = (Array.isArray(teksCodes) ? teksCodes : []).filter(Boolean);
  const plan = SEED_PLAN[targetKey];
  if (!plan || !codes.length) return { assignment: null, records: {} };

  const questions = [];
  const records = {};

  const answer = (index, isCorrect, code) => {
    records[index] = recordQuestionAttempt({
      record: null,
      isCorrect,
      questionDetails: `Simulated ${isCorrect ? 'correct' : 'incorrect'} response for ${code}.`,
    }).record;
    // An incorrect first attempt that is never retried has to be pushed to its
    // terminal state, or it reads as "still in progress" rather than as
    // evidence of a gap.
    if (!isCorrect) {
      records[index] = recordQuestionAttempt({ record: records[index], isCorrect: false }).record;
      records[index] = recordQuestionAttempt({ record: records[index], isCorrect: false }).record;
    }
  };

  codes.forEach((code) => {
    for (let i = 0; i < plan.total; i += 1) {
      const index = questions.length;
      questions.push(seedQuestion(code, index));
      answer(index, i < plan.correct, code);
    }
  });

  // Surrounding evidence, from a second kind of work and across a second and
  // third standard, so the profile has something to be built from.
  const contextPlan = CONTEXT_PLAN[targetKey];
  const context = (Array.isArray(contextCodes) ? contextCodes : [])
    .filter((code) => code && !codes.includes(code));
  if (contextPlan) {
    context.forEach((code) => {
      for (let i = 0; i < contextPlan.total; i += 1) {
        const index = questions.length;
        questions.push(seedQuestion(code, index, {
          activityRole: 'independentPractice',
          dok: i === 0 ? 1 : 2,
          difficultyBand: contextPlan.band,
        }));
        answer(index, i < contextPlan.correct, code);
      }
    });
  }

  return {
    assignment: {
      id: assignmentId,
      title: 'Simulated prior evidence',
      isSimulated: true,
      assignmentType: 'practice',
      questions,
    },
    records,
  };
};

/**
 * Create a simulated learner in a chosen starting state. Returns the synthetic
 * student document and the synthetic assignments it references — both are fed
 * to the real engines together.
 */
export const createSimulatedLearner = ({
  profileId = 'fresh',
  teacherId = 'teacher',
  slotId = 'default',
  teksCodes = [],
  // Opt-in. See CONTEXT_PLAN: without it a simulated learner cannot cross the
  // Student Learning Profile's baseline requirement, so every starting profile
  // renders identically in any view that shows a profile.
  contextCodes = [],
} = {}) => {
  const profile = getStartingProfile(profileId);
  const learner = emptyLearnerDocument(
    `${SIMULATION_NAMESPACE}:${teacherId}:${slotId}`,
    `${profile.label} (simulated)`,
  );
  const seed = buildSeedEvidence({ targetKey: profile.targetKey, teksCodes, contextCodes });
  const seedAssignments = [];

  if (seed.assignment) {
    seedAssignments.push(seed.assignment);
    learner.gradesByAssignment[seed.assignment.id] = seed.records;
  }

  return {
    learner,
    seedAssignments,
    profileId: profile.id,
    // Retention state the teacher has forced. Starts empty — a fresh synthetic
    // student has nothing due — and is written by `forceRetentionDue`.
    retentionSchedulesByTEKS: {},
    createdAt: Date.now(),
    timeline: seed.assignment
      ? [{
        id: 'seed',
        at: Date.now(),
        kind: 'seed',
        label: `Started as ${profile.label}`,
        detail: `Seeded ${seed.assignment.questions.length} prior responses across ${teksCodes.join(', ') || 'no TEKS'}.`,
      }]
      : [{ id: 'seed', at: Date.now(), kind: 'seed', label: 'Started as Fresh student', detail: 'No prior evidence.' }],
  };
};

/**
 * Apply one outcome control. Runs the real attempt policy, writes into the
 * synthetic document, and returns the updated learner plus a timeline entry.
 * Never mutates its input.
 */
export const applySimulationOutcome = ({
  learner,
  assignmentId,
  questionIndex,
  outcomeId,
  questionDetails = '',
}) => {
  const safeLearner = learner && typeof learner === 'object' ? learner : emptyLearnerDocument('sim', 'Simulated');
  const attempts = attemptsForOutcome(outcomeId);
  const assignmentGrades = { ...(safeLearner.gradesByAssignment?.[assignmentId] || {}) };

  let record = assignmentGrades[questionIndex] ?? null;
  let lastResult = null;
  attempts.forEach((attempt) => {
    const outcome = recordQuestionAttempt({
      record,
      isCorrect: attempt.isCorrect === true,
      questionDetails,
      supportUsage: attempt.supportUsage || null,
    });
    record = outcome.record;
    lastResult = outcome.result;
  });

  if (attempts.length) {
    assignmentGrades[questionIndex] = record;
  } else {
    // Skip/abandon is a real state, not an absence: the engine should see a
    // question that was reached and left rather than one never presented.
    assignmentGrades[questionIndex] = normalizeQuestionRecord(assignmentGrades[questionIndex]);
  }

  const normalized = normalizeQuestionRecord(assignmentGrades[questionIndex]);
  return {
    learner: {
      ...safeLearner,
      gradesByAssignment: {
        ...safeLearner.gradesByAssignment,
        [assignmentId]: assignmentGrades,
      },
    },
    result: lastResult,
    event: {
      id: `${assignmentId}:${questionIndex}:${Date.now()}`,
      at: Date.now(),
      kind: 'outcome',
      outcomeId,
      questionIndex,
      label: OUTCOME_CONTROLS.find((control) => control.id === outcomeId)?.label || outcomeId,
      detail: attempts.length
        ? `Question ${questionIndex + 1} → ${normalized.status} after ${normalized.totalAttempts} attempt${normalized.totalAttempts === 1 ? '' : 's'} (${Math.round(getQuestionCredit(normalized) * 100)}% credit).`
        : `Question ${questionIndex + 1} left unanswered.`,
    },
  };
};

/**
 * Force a whole skill to a target state by seeding evidence, rather than by
 * writing a performance level. The engine still decides what that evidence
 * means, which is the difference between a simulator and a mock.
 */
export const forceSkillState = ({ learner, targetKey, teksCodes, slotId = 'default' }) => {
  // One forced-state document per slot, deliberately *not* keyed by target.
  // Evidence accumulates, so if each target got its own document then forcing
  // mastery after forcing failure would leave both in the pool and the skill
  // would stay stuck at the average of the two. A teacher exploring branches
  // needs the second force to replace the first, not argue with it.
  const assignmentId = `${SIM_SEED_PREFIX}forced:${slotId}`;
  const seed = buildSeedEvidence({ targetKey, teksCodes, assignmentId });
  if (!seed.assignment) return { learner, seedAssignment: null, event: null };

  return {
    learner: {
      ...learner,
      gradesByAssignment: {
        ...learner.gradesByAssignment,
        [assignmentId]: seed.records,
      },
    },
    seedAssignment: seed.assignment,
    event: {
      id: `${assignmentId}:${Date.now()}`,
      at: Date.now(),
      kind: 'force',
      label: targetKey === 'didNotMeet' ? 'Forced skill failure' : 'Forced skill mastery',
      detail: `Seeded ${seed.assignment.questions.length} responses on ${teksCodes.join(', ')} targeting ${targetKey}.`,
    },
  };
};

/**
 * Backdate a skill so retention comes due on it.
 *
 * Retention was the one §12 capability with no way to reach it: the simulator
 * hardcoded an empty schedule map, so `retentionSignal` was pinned to 'stable'
 * and VERIFY_RETENTION could never fire. This writes the schedule shape the
 * real scheduler reads, with the due date already in the past.
 */
export const forceRetentionDue = ({ schedules = {}, teksCodes = [], nowValue = Date.now() }) => {
  const codes = (Array.isArray(teksCodes) ? teksCodes : [teksCodes]).filter(Boolean);
  if (!codes.length) return { schedules, event: null };
  const DAY = 24 * 60 * 60 * 1000;
  const next = { ...schedules };
  codes.forEach((code) => {
    next[code] = {
      ...(schedules[code] || {}),
      status: 'due',
      // Verified a while ago, and the next check was due yesterday.
      lastVerifiedAt: nowValue - 30 * DAY,
      nextCheckDueAt: nowValue - DAY,
      successfulCheckCount: Number(schedules[code]?.successfulCheckCount || 0),
    };
  });
  return {
    schedules: next,
    event: {
      id: `retention:${codes.join(',')}:${nowValue}`,
      at: nowValue,
      kind: 'force',
      label: 'Retention check made due',
      detail: `Backdated ${codes.join(', ')} so a retention check is now due. The Path should offer a short verification.`,
    },
  };
};

/**
 * Run the real engines over the simulated learner. This is the single place the
 * simulator reads state from, so what the teacher sees is what a student in the
 * same position would get.
 */
export const evaluateSimulation = ({
  learner, assignments = [], question = null, courseId = 'algebra1', retentionSchedulesByTEKS = {},
}) => {
  // Keep the legacy mastery object because the existing routing engine consumes
  // it, but derive the teacher-facing status from the same centralized Student
  // Learning Profile contract used by roster, Gradebook and Weekly Path.
  const profile = buildStudentMasteryProfile({ student: learner, assignments });
  const evidenceRows = collectStudentEvidence({ student: learner, assignments });
  const masteryProfilesByTeks = adaptLegacyMasteryToPhase5({
    legacyProfile: profile,
    evidenceRows,
    retentionSchedulesByTEKS,
  });
  const { events: evidenceEvents, coverage: evidenceCoverage } = evidenceRowsToEvents(evidenceRows);
  const learningProfile = buildStudentLearningProfile({
    courseId,
    masteryProfilesByTeks,
    evidenceEvents,
    retentionSchedules: retentionSchedulesByTEKS,
  });
  const routing = question ? resolvePrerequisiteSupportPath(question, profile) : null;
  const differentiation = question ? applyAdaptiveDifferentiation(question, profile) : null;
  return { profile, learningProfile, evidenceCoverage, routing, differentiation };
};

const PERFORMANCE_ORDER = ['insufficient', 'didNotMeet', 'approaches', 'meets', 'masters'];

export const performanceForCode = (profile, code) => profile?.teks?.[code]?.performance || null;

/**
 * "Why did MathMaster do that?" in a teacher's language, with the raw values
 * kept separately so the explanation is readable but the debugging detail is
 * never lost.
 */
export const explainRouting = ({ question, profile, routing }) => {
  const codes = getQuestionPrimaryTeksCodes(question);
  const primaryCode = codes[0] || null;
  const standard = primaryCode ? getTexasStandard(primaryCode) : null;
  const summary = primaryCode ? profile?.teks?.[primaryCode] : null;
  const performance = summary?.performance || null;
  const needsSupport = Array.isArray(routing?.needsSupport) ? routing.needsSupport : [];
  const supportStandards = Array.isArray(routing?.supportStandards) ? routing.supportStandards : [];

  // A learner with no entry for this TEKS at all has no performance object, so
  // the absent case has to collapse into "insufficient" rather than falling
  // through to the grade-level branch and claiming a decision was made.
  const performanceKey = performance?.key || 'insufficient';

  const decision = !primaryCode
    ? 'No decision'
    : needsSupport.length && supportStandards.length
      ? 'Remediation'
      : performanceKey === 'masters'
        ? 'Acceleration available'
        : performanceKey === 'insufficient'
          ? 'Gather more evidence'
          : 'Continue at grade level';

  const nextActivity = decision === 'Remediation'
    ? `${supportStandards[0].code} — ${supportStandards[0].description || 'prerequisite support'}`
    : decision === 'Acceleration available'
      ? 'Extension at a higher difficulty band on the same TEKS'
      : decision === 'Gather more evidence'
        ? 'More items on the same TEKS before any routing change'
        : 'Continued practice on the current TEKS';

  return {
    decision,
    currentSkill: standard ? `${primaryCode} — ${standard.description}` : primaryCode || 'Untagged question',
    performanceLabel: performance?.label || 'Insufficient Evidence',
    performanceScore: performance?.score ?? null,
    evidenceCount: summary?.itemCount ?? 0,
    // The teacher-facing sentence: what was seen, and what follows from it.
    detectedDifficulty: needsSupport.length
      ? `Performance on ${needsSupport.join(', ')} is at or below Approaches.`
      : 'No prerequisite weakness detected from current evidence.',
    prerequisiteAffected: supportStandards.length ? supportStandards.map((item) => item.code).join(', ') : 'None',
    nextActivity,
    exitCondition: decision === 'Remediation'
      ? 'Demonstrate proficiency on the prerequisite, then return to the original TEKS.'
      : decision === 'Acceleration available'
        ? 'Maintain accuracy at the raised difficulty band.'
        : 'Continue until there is enough evidence to estimate a performance level.',
    // Everything a developer needs, kept out of the teacher's way.
    developerDetails: {
      primaryTeks: codes,
      performanceKey,
      performanceOrder: PERFORMANCE_ORDER.indexOf(performanceKey),
      confidence: summary?.confidence ?? null,
      effectiveEvidence: summary?.effectiveEvidence ?? null,
      itemCount: summary?.itemCount ?? 0,
      ceilingReason: performance?.ceilingReason || null,
      routingReason: routing?.reason || null,
      needsSupport,
      supportTeks: routing?.supportTeks || [],
      verticalPaths: routing?.verticalPaths || [],
      adaptiveTargetBand: profile?.adaptiveInstruction?.byTeks?.[primaryCode]?.generatorBand
        ?? profile?.adaptiveInstruction?.generatorBand ?? null,
    },
  };
};

/**
 * The one-click package for AI-assisted debugging: the actual state responsible
 * for the behaviour, not a description of it.
 */
export const buildDebugPackage = ({
  question,
  explanation,
  profile,
  routing,
  differentiation,
  timeline = [],
  teacherFeedback = '',
  feedbackCategory = '',
  expectedRoute = '',
} = {}) => {
  const codes = getQuestionPrimaryTeksCodes(question);
  const actualRoute = explanation?.nextActivity || 'unknown';
  const mismatch = expectedRoute && actualRoute
    && !actualRoute.toLowerCase().includes(String(expectedRoute).toLowerCase());

  const lines = [
    '# MathMaster Teacher Simulator Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Question type: ${question?.toolId || question?.type || 'unknown'}`,
    `Primary TEKS: ${codes.join(', ') || 'none'}`,
    `Current performance: ${explanation?.performanceLabel || 'unknown'}${explanation?.performanceScore != null ? ` (${explanation.performanceScore})` : ''}`,
    `Evidence items: ${explanation?.evidenceCount ?? 0}`,
    `Routing decision: ${explanation?.decision || 'unknown'}`,
    `Next activity: ${actualRoute}`,
  ];

  if (expectedRoute) {
    lines.push(
      '',
      '## Expected vs actual routing',
      `Expected: ${expectedRoute}`,
      `Actual:   ${actualRoute}`,
      `Result:   ${mismatch ? 'ROUTING MISMATCH' : 'MATCH'}`,
    );
  }

  if (teacherFeedback) {
    lines.push('', '## Teacher feedback', feedbackCategory ? `Category: ${feedbackCategory}` : '', teacherFeedback);
  }

  lines.push(
    '',
    '## Engine state',
    '```json',
    JSON.stringify({
      explanation: explanation?.developerDetails || null,
      adaptiveInstruction: profile?.adaptiveInstruction || null,
      teksSummary: codes.reduce((acc, code) => ({ ...acc, [code]: profile?.teks?.[code] || null }), {}),
      routing,
      differentiation: differentiation?.adaptiveMeta || differentiation?.question?.adaptiveMeta || null,
    }, null, 2),
    '```',
    '',
    '## Question JSON',
    '```json',
    JSON.stringify(question ?? null, null, 2),
    '```',
    '',
    '## Path timeline',
    ...(timeline.length
      ? timeline.map((entry, index) => `${index + 1}. [${entry.kind}] ${entry.label} — ${entry.detail}`)
      : ['(empty)']),
    '',
    '_Produced by the Teacher Path Simulator. No student data is involved._',
  );

  return lines.filter((line) => line !== '').join('\n') + '\n';
};

export const isRoutingMismatch = (expectedRoute, explanation) => {
  if (!expectedRoute) return false;
  const actual = explanation?.nextActivity || '';
  return !actual.toLowerCase().includes(String(expectedRoute).toLowerCase());
};
