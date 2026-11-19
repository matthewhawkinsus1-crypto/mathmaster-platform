// LIVE CHALLENGE: rooms, rounds, standings, dry runs, and the Graph Feature, Inequality, Systems and Line Graph games.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const crypto = require("crypto");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const challengeSampling = require("./lib/challengeSampling");
const authLib = require("./lib/auth");
const mathPath = require("./lib/mathPath");
const {
  LIVE_CHALLENGE_INVITES,
  LIVE_CHALLENGE_MATCH_RESULTS,
  LIVE_CHALLENGE_PRIVATE,
  LIVE_CHALLENGE_REPORTS,
  LIVE_CHALLENGE_ROOMS,
  LIVE_CHALLENGE_TEACHER_ACTIVE,
  assignmentAudience,
  callerEmail,
  liveChallengeClassPoints,
  liveChallengeEngine,
  liveChallengeReportRules,
  liveChallengeRules,
  requireStudent,
  requireTeacher,
  safeBuildTemplateIssuePlan,
  studentDeletionMark,
  studentIdentity,
  toDate,
} = require("./functionsCommon");

let solverRaceModule = null;
async function solverRaceRules() {
  if (!solverRaceModule) solverRaceModule = await import("./shared/solverRace.mjs");
  return solverRaceModule;
}

let warmupChallengeModule = null;
async function warmupChallengeRules() {
  if (!warmupChallengeModule) warmupChallengeModule = await import("./shared/warmupChallenge.mjs");
  return warmupChallengeModule;
}

let liveChallengeEvidenceModule = null;
async function liveChallengeEvidenceRules() {
  if (!liveChallengeEvidenceModule) liveChallengeEvidenceModule = await import("./shared/liveChallengeEvidence.mjs");
  return liveChallengeEvidenceModule;
}

// GRAPH FEATURE RUSH: the mode's own pure rules (attempts, generation, config).
let graphFeatureRushModules = null;
async function graphFeatureRushRules() {
  if (!graphFeatureRushModules) {
    const [rush, generator, config, reading] = await Promise.all([
      import("./shared/graphFeatureRush.mjs"),
      import("./shared/graphFeatureGenerator.mjs"),
      import("./shared/graphFeatureRushConfig.mjs"),
      // The reading guide a round publishes once it has ended (LC07).
      import("./shared/graphFeatureReading.mjs"),
    ]);
    graphFeatureRushModules = { rush, generator, config, reading };
  }
  return graphFeatureRushModules;
}

// CLASS MEMORY: what a class did the last time it played a rush game, and
// the rule for what to try next.
let liveChallengeClassMemoryModule = null;
async function liveChallengeClassMemoryRules() {
  if (!liveChallengeClassMemoryModule) liveChallengeClassMemoryModule = await import("./shared/liveChallengeClassMemory.mjs");
  return liveChallengeClassMemoryModule;
}

// INEQUALITY GRAPHING RUSH: the mode's own pure rules (generation, settings,
// hints) and its reading guide. Its attempts are Graph Feature Rush's.
let inequalityRushModules = null;
async function inequalityRushRules() {
  if (!inequalityRushModules) {
    const [generator, reading] = await Promise.all([
      import("./shared/inequalityRush.mjs"),
      import("./shared/inequalityReading.mjs"),
    ]);
    inequalityRushModules = { generator, reading };
  }
  return inequalityRushModules;
}

// SYSTEMS OF EQUATIONS RUSH: the mode's settings and words, its generator
// (server only), and its reading guide. Its attempts are Graph Feature Rush's.
let systemsRushModules = null;
async function systemsRushRules() {
  if (!systemsRushModules) {
    const [rules, generator, reading] = await Promise.all([
      import("./shared/systemsRush.mjs"),
      import("./shared/systemsGenerator.mjs"),
      import("./shared/systemsReading.mjs"),
    ]);
    systemsRushModules = { rules, generator, reading };
  }
  return systemsRushModules;
}

// GRAPH THE LINE: the mode's own pure rules (attempts, generation, config).
let lineGraphModuleSet = null;
async function lineGraphModules() {
  if (!lineGraphModuleSet) {
    const [attempts, generator, config, rules] = await Promise.all([
      import("./shared/lineGraphAttempts.mjs"),
      import("./shared/lineGraphGenerator.mjs"),
      import("./shared/lineGraphConfig.mjs"),
      import("./shared/lineGraphRules.mjs"),
    ]);
    lineGraphModuleSet = { attempts, generator, config, rules };
  }
  return lineGraphModuleSet;
}

// The end-of-game recap and the personal-best history read (lib/liveChallengeRecap.js).
let liveChallengeRecapModule = null;
function liveChallengeRecap() {
  if (!liveChallengeRecapModule) liveChallengeRecapModule = require("./lib/liveChallengeRecap");
  return liveChallengeRecapModule;
}

// How many questions are pulled before the issuability gate runs. Every one of
// these is instantiated and planned, so the page size is a cost, not a free
// upper bound — the fix for narrow variety was where the window starts, not
// making it bigger.
const MIXED_CANDIDATE_PAGE = 300;
const STANDARD_CANDIDATE_PAGE = 100;

const LIVE_CHALLENGE_DRY_RUNS = "liveChallengeDryRuns";
// A closed round's whole anonymous table, for the room's teacher only
// (liveChallengeRooms/{room}/hostRounds/{n}); the class reads rounds/{n}.
const LIVE_CHALLENGE_HOST_ROUNDS = "hostRounds";
const LIVE_CHALLENGE_EXPERIENCE = "liveChallengeExperience";
// What a class did the last time it played a rush game, with which settings
// (liveChallengeClassMemory.mjs): one document per class and game, class
// totals only, read by the teacher's setup card.
const LIVE_CHALLENGE_CLASS_MEMORY = "liveChallengeClassMemory";

function challengeCourseId(value) {
  const token = String(value || "").trim().toLowerCase();
  if (token === "algebra2") return "algebra2";
  return "algebra1";
}

function shuffleChallengeItems(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

async function loadChallengeRoster(db, teacherEmail, { classId = null, classPeriod = null } = {}) {
  const snapshot = await db.collection("grades").where("assignedTeacherEmail", "==", teacherEmail).get();
  return snapshot.docs
    .filter((studentDoc) => {
      const data = studentDoc.data() || {};
      if (classId) return String(data.classId || "") === String(classId);
      return Boolean(classPeriod) && !data.classId && String(data.classPeriod || "") === String(classPeriod);
    })
    .map((studentDoc) => ({ studentId: studentDoc.id, ...studentDoc.data() }));
}

const questionStyleLabel = (style) => (
  style === "tools" ? " that use an interactive tool"
    : style === "noTools" ? " without an interactive tool"
      : ""
);

async function loadChallengeCandidates(db, { courseId, standardCode, questionStyle = "any", roundSeconds = null, timingMode = "timed" }) {
  const challenge = await liveChallengeRules();
  const { difficulty } = await liveChallengeEngine();
  const normalized = challenge.canonicalChallengeStandard(standardCode);
  const style = challenge.canonicalQuestionStyle(questionStyle);
  // A RANDOM WINDOW, NOT THE FIRST PAGE. Without ordering, Firestore returns
  // document-ID order, so a mixed Algebra I game saw the same first 300 of 837
  // questions every time and the rest of the bank was unreachable. See
  // lib/challengeSampling.js.
  const bank = db.collection("pathQuestionBank");
  const baseQuery = normalized === "mixed"
    ? bank.where("courseId", "==", courseId)
    : bank.where("alignmentKeys", "array-contains", mathPath.canonicalAlignmentKey(normalized));
  const pageSize = normalized === "mixed" ? MIXED_CANDIDATE_PAGE : STANDARD_CANDIDATE_PAGE;
  const sampledDocs = await challengeSampling.sampleBankWindow({ baseQuery, pageSize });

  const candidates = sampledDocs
    .map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() }))
    .filter((question) => question.active !== false)
    .filter((question) => normalized !== "mixed" || String(question.courseId || courseId) === courseId)
    // TWO SEPARATE GATES, ON PURPOSE.
    //
    // Eligibility is "a live round can draw and grade this response at all" —
    // a choose-one prompt with no options is gradeable by the Path server and
    // unanswerable under a countdown, so Live Challenge fails closed on it.
    // Style is "the teacher asked for tool questions". Folding the two into one
    // predicate made matchesQuestionStyle(q, "any") able to return false, and
    // told a teacher who picked Any that their style had emptied the game.
    .filter((question) => challenge.liveChallengeEligible(question))
    .filter((question) => challenge.matchesQuestionStyle(question, style));
  // DIFFICULTY TARGETING (liveChallengeDifficulty.mjs): a multi-step DOK 3
  // question never lands under a short countdown, a DOK 4 never under any.
  // A third gate, after style, so a pool it empties says so in its own words.
  // A caller that names no round length (an older dry run) is not filtered.
  // Judged against the length each question's round would actually run
  // (complexityAdjustedRoundSeconds, as prepareLiveChallengeRoundOpening
  // computes it), not the teacher's baseline.
  const fitting = roundSeconds == null
    ? candidates
    : candidates.filter((question) => difficulty.fitsTimedRound(question, {
      roundSeconds: challenge.complexityAdjustedRoundSeconds({ baselineSeconds: roundSeconds, question }),
      timingMode,
    }));

  const planned = await Promise.all(fitting.map(async (question) => ({
    question,
    plan: await safeBuildTemplateIssuePlan(question, { operation: "path-runtime-framework-check" }),
  })));
  const issuable = planned.filter((entry) => entry.plan.issuable);
  // How many the timing rule set aside, for the create-time message.
  issuable.excludedForTiming = candidates.length - fitting.length;
  return issuable;
}

async function securelyPlanSolverRace(questions) {
  const planned = await Promise.all(questions.map(async (question, roundIndex) => ({
    question,
    roundIndex,
    plan: await mathPath.buildIssuePlan(question),
  })));
  const failed = planned.find((entry) => !entry.plan.issuable);
  if (failed) {
    const family = String(failed.question.challengeFamily || 'unknown family');
    const stage = String(failed.question.difficultyBand || failed.question.solverRaceStage || 'unknown stage');
    throw new HttpsError(
      "failed-precondition",
      `Solver Race round ${failed.roundIndex + 1} cannot be securely issued: ${family} · ${stage} (${failed.plan.reason || "secure grader unavailable"}).`,
    );
  }
  return planned;
}

function selectChallengeQuestions(entries, requestedCount) {
  // Prefer one question from each family before a second question from the same
  // family. This keeps a ten-round mixed game from feeling like ten cosmetic
  // copies of one problem even when the bank is uneven.
  const shuffled = shuffleChallengeItems(entries);
  const firstByFamily = [];
  const repeats = [];
  const seen = new Set();
  shuffled.forEach((entry) => {
    const family = String(entry.question.familyId || entry.question.id);
    if (seen.has(family)) repeats.push(entry);
    else {
      seen.add(family);
      firstByFamily.push(entry);
    }
  });
  return [...firstByFamily, ...repeats].slice(0, requestedCount);
}

/*
 * QUESTION PLANNERS, KEYED BY A MODE'S questionSource.
 *
 * A game mode declares where its questions come from; this is the only place
 * that knows how to build them. `plan` returns the selected entries plus any
 * server-only authored questions and seed, and may contribute fields of its
 * own to the room (`roomFields`, public) and the private state
 * (`privateFields`). `swap` replaces one dry-run round. `openRound`, when a
 * planner has one, builds a round's opening itself instead of drawing a bank
 * question. A new mode with a new source adds a planner here — it does not
 * add a branch to createLiveChallenge.
 */
const LIVE_CHALLENGE_QUESTION_PLANNERS = Object.freeze({
  secureBank: Object.freeze({
    async plan({ db, courseId, standardCode, modeConfig, roundCount, roundSeconds = null, timingMode = "timed" }) {
      const candidates = await loadChallengeCandidates(db, {
        courseId, standardCode, questionStyle: modeConfig.questionStyle, roundSeconds, timingMode,
      });
      return {
        candidateCount: candidates.length,
        excludedForTiming: candidates.excludedForTiming || 0,
        selected: selectChallengeQuestions(candidates, roundCount),
        roundQuestions: null,
        seed: null,
      };
    },
    async swap({ db, dryRun, questionIds }) {
      // A fresh draw, then the first candidate this dry run is not already using.
      // Swapping a question for one already in the set would look like the button
      // did nothing.
      const candidates = await loadChallengeCandidates(db, {
        courseId: dryRun.courseId,
        standardCode: dryRun.standardCode,
        // A swap that ignored the style would quietly hand back the kind of
        // question the teacher chose not to have.
        questionStyle: dryRun.questionStyle,
        // Nor one too long for the round it would fill.
        roundSeconds: dryRun.roundSeconds ?? null,
        timingMode: dryRun.timingMode || "timed",
      });
      const inUse = new Set(questionIds);
      const replacement = selectChallengeQuestions(candidates, candidates.length)
        .map((entry) => entry.question.id)
        .find((id) => !inUse.has(id));
      if (!replacement) throw new HttpsError("failed-precondition", "There are no other questions available for this selection.");
      return { questionId: replacement, authoredQuestion: null };
    },
  }),
  solverRaceGenerator: Object.freeze({
    async plan({ modeConfig, roundCount }) {
      const solverRace = await solverRaceRules();
      // Never derive answer-bearing draws in the browser. This nonce is retained
      // only in the private room record alongside the instantiated questions.
      const seed = crypto.randomUUID();
      const questions = solverRace.planSolverRace({
        roundCount, focus: modeConfig.solverRaceFocus, difficulty: modeConfig.solverRaceDifficulty, seed,
      });
      const planned = await securelyPlanSolverRace(questions);
      return {
        candidateCount: planned.length,
        selected: planned,
        roundQuestions: planned.map((entry) => entry.question),
        seed,
      };
    },
    async swap({ dryRun, roundIndex }) {
      const solverRace = await solverRaceRules();
      const roundQuestions = Array.isArray(dryRun.roundQuestions) ? [...dryRun.roundQuestions] : [];
      const current = roundQuestions[roundIndex];
      const stageStructures = solverRace.SOLVER_RACE_CATALOG.filter((entry) => (
        entry.challengeFamily === current?.challengeFamily
        && entry.difficultyBand === current?.difficultyBand
      ));
      const alternatives = stageStructures.filter((entry) => entry.id !== current?.familyId);
      const pool = alternatives.length ? alternatives : stageStructures;
      const alternate = pool[solverRace.seededSolverRaceIndex(
        `${dryRun.solverRaceSeed}|swap-structure|${roundIndex}|${current?.solverRaceSwap || 0}`,
        pool.length,
      )];
      if (!alternate) throw new HttpsError("failed-precondition", "There is no other Solver Race structure for this stage.");
      const swapNumber = Math.max(1, Number(current?.solverRaceSwap) + 1 || 1);
      // Never an equation, or a same-family answer, another round of this
      // match already has: its solution is published when that round closes
      // (review of #464, B1).
      const usedKeys = new Set(roundQuestions
        .filter((_, index) => index !== roundIndex)
        .flatMap((question) => solverRace.solverRaceQuestionKeys(question))
        .filter(Boolean));
      const generated = solverRace.generateDistinctSolverRaceQuestion({
        structure: alternate,
        seedKey: `${dryRun.solverRaceSeed}|swap|${roundIndex}|${swapNumber}`,
        usedKeys,
      });
      const replacementQuestion = {
        ...generated,
        id: `${generated.familyId}_r${roundIndex + 1}_swap${swapNumber}`,
        solverRaceRound: roundIndex,
        solverRaceStage: current?.solverRaceStage,
        solverRaceSwap: swapNumber,
      };
      return { questionId: replacementQuestion.id, authoredQuestion: replacementQuestion };
    },
  }),
});

/*
 * GRAPH FEATURE RUSH draws nothing up front: each student's graphs are
 * generated from the room's private seed as they reach them
 * (getGraphFeatureRushRound) and regenerated to grade a tap. A round is a
 * placeholder id, which recovery and the report read; the round's public
 * question is a card naming what to look for, never a graph.
 *
 * There is no shared question to solve, so a round has no worked solution; its
 * results carry a reading guide to the features the game asks for instead
 * (graphFeatureReading.mjs): the same text for every student, naming no graph,
 * captured here like a bank question's solution and published at the round's
 * close (liveChallengeRevealableRounds).
 */
const GRAPH_FEATURE_RUSH_PLANNER = Object.freeze({
  async plan({ modeConfig, roundCount }) {
    const { generator } = await graphFeatureRushRules();
    const config = modeConfig.graphFeatureRush;
    const generatorVersion = generator.GRAPH_FEATURE_GENERATOR_VERSION;
    return {
      candidateCount: roundCount,
      selected: Array.from({ length: roundCount }, (_, index) => ({
        question: { id: `graphFeatureRush:round:${index + 1}`, alignmentKeys: [] },
      })),
      roundQuestions: null,
      seed: null,
      // The seed never leaves the server: it is what makes a student's graphs
      // theirs and reproducible.
      privateFields: { graphFeatureRush: { seed: crypto.randomUUID(), config, generatorVersion } },
      roomFields: { graphFeatureRush: { config, generatorVersion } },
    };
  },
  async swap() {
    throw new HttpsError("failed-precondition", "Graph Feature Rush graphs are generated for each student; there is no shared round to swap.");
  },
  async openRound({ room, privateState, roundIndex, mode, engine }) {
    const questionId = privateState.questionIds?.[roundIndex];
    if (!questionId) throw new HttpsError("failed-precondition", "That Live Challenge round has no question.");
    const config = privateState.graphFeatureRush?.config || room.graphFeatureRush?.config || {};
    const { reading } = await graphFeatureRushRules();
    return {
      roundIndex,
      questionId,
      currentQuestion: {
        kind: "graphFeatureRush",
        challengeRound: roundIndex,
        prompt: "Find the features on your own graphs",
        features: Array.isArray(config.features) ? config.features : [],
        families: Array.isArray(config.families) ? config.families : [],
        difficulty: config.difficulty || null,
        teksCode: null,
      },
      roundSeconds: engine.modes.normalizeModeRoundSeconds(mode, room.roundSeconds),
      // The round's reading guide, kept privately until the round has closed:
      // the game's features, and its difficulty and off-screen setting (what
      // it says about dots and "Off screen").
      solution: reading.rushRoundSolutionRecord({ features: config.features, difficulty: config.difficulty, offScreen: config.offScreen === true }),
    };
  },
});

/*
 * INEQUALITY GRAPHING RUSH draws nothing up front either: Graph Feature
 * Rush's planner with inequalities for graphs. Each student's items are
 * generated from the room's private seed as they reach them (the rush's
 * getGraphFeatureRushRound) and regenerated to grade an attempt; a round is a
 * placeholder id; its results carry a guide to graphing the kinds of
 * inequality in the game (inequalityReading.mjs), the same for everyone.
 */
const INEQUALITY_RUSH_PLANNER = Object.freeze({
  async plan({ modeConfig, roundCount }) {
    const { generator } = await inequalityRushRules();
    const config = modeConfig.inequalityRush;
    const generatorVersion = generator.INEQUALITY_GENERATOR_VERSION;
    return {
      candidateCount: roundCount,
      selected: Array.from({ length: roundCount }, (_, index) => ({
        question: { id: `inequalityRush:round:${index + 1}`, alignmentKeys: [] },
      })),
      roundQuestions: null,
      seed: null,
      // The seed never leaves the server: it makes a student's items theirs.
      privateFields: { inequalityRush: { seed: crypto.randomUUID(), config, generatorVersion } },
      roomFields: { inequalityRush: { config, generatorVersion } },
    };
  },
  async swap() {
    throw new HttpsError("failed-precondition", "Inequality Graphing Rush items are generated for each student; there is no shared round to swap.");
  },
  async openRound({ room, privateState, roundIndex, mode, engine }) {
    const questionId = privateState.questionIds?.[roundIndex];
    if (!questionId) throw new HttpsError("failed-precondition", "That Live Challenge round has no question.");
    const config = privateState.inequalityRush?.config || room.inequalityRush?.config || {};
    const { reading } = await inequalityRushRules();
    return {
      roundIndex,
      questionId,
      currentQuestion: {
        kind: "inequalityRush",
        challengeRound: roundIndex,
        prompt: "Graph your own inequalities on the number line",
        itemTypes: Array.isArray(config.itemTypes) ? config.itemTypes : [],
        difficulty: config.difficulty || null,
        teksCode: null,
      },
      roundSeconds: engine.modes.normalizeModeRoundSeconds(mode, room.roundSeconds),
      // The round's guide, kept privately until the round has closed.
      solution: reading.inequalityRoundSolutionRecord({ itemTypes: config.itemTypes, difficulty: config.difficulty }),
    };
  },
});

/*
 * SYSTEMS OF EQUATIONS RUSH draws nothing up front either: Graph Feature
 * Rush's planner with a system of two lines on every graph. Each student's
 * systems are generated from the room's private seed as they reach them (the
 * rush's getGraphFeatureRushRound) and regenerated to grade an attempt; a
 * round is a placeholder id; its results carry a guide to reading a system
 * (systemsReading.mjs), the same for everyone.
 */
const SYSTEMS_RUSH_PLANNER = Object.freeze({
  async plan({ modeConfig, roundCount }) {
    const { generator } = await systemsRushRules();
    const config = modeConfig.systemsRush;
    const generatorVersion = generator.SYSTEMS_GENERATOR_VERSION;
    return {
      candidateCount: roundCount,
      selected: Array.from({ length: roundCount }, (_, index) => ({
        question: { id: `systemsRush:round:${index + 1}`, alignmentKeys: [] },
      })),
      roundQuestions: null,
      seed: null,
      // The seed never leaves the server: it makes a student's systems theirs.
      privateFields: { systemsRush: { seed: crypto.randomUUID(), config, generatorVersion } },
      roomFields: { systemsRush: { config, generatorVersion } },
    };
  },
  async swap() {
    throw new HttpsError("failed-precondition", "Systems of Equations Rush systems are generated for each student; there is no shared round to swap.");
  },
  async openRound({ room, privateState, roundIndex, mode, engine }) {
    const questionId = privateState.questionIds?.[roundIndex];
    if (!questionId) throw new HttpsError("failed-precondition", "That Live Challenge round has no question.");
    const config = privateState.systemsRush?.config || room.systemsRush?.config || {};
    const { reading } = await systemsRushRules();
    return {
      roundIndex,
      questionId,
      currentQuestion: {
        kind: "systemsRush",
        challengeRound: roundIndex,
        prompt: "Find the intercepts and solutions on your own systems",
        questions: Array.isArray(config.questions) ? config.questions : [],
        kinds: Array.isArray(config.kinds) ? config.kinds : [],
        difficulty: config.difficulty || null,
        teksCode: null,
      },
      roundSeconds: engine.modes.normalizeModeRoundSeconds(mode, room.roundSeconds),
      // The round's guide, kept privately until the round has closed.
      solution: reading.systemsRoundSolutionRecord({ questions: config.questions, kinds: config.kinds, difficulty: config.difficulty }),
    };
  },
});

/*
 * GRAPH THE LINE draws nothing up front either: each student's items are
 * generated from the room's private seed as they reach them
 * (getLineGraphRound) and regenerated to grade an attempt. A round is a
 * placeholder id with no standard — a question-set round feeds no mastery
 * evidence until its outcomes can (docs/architecture/graph-the-line.md §11)
 * — and its public question is a card, never an equation.
 */
const lineGraphRoundPrompt = (format, itemCount) => {
  if (format === "classic") return "Graph the line on your own screen";
  if (format === "sprint") return `Work through your ${itemCount} lines`;
  return "Graph as many lines as you can";
};

/*
 * A CLASSIC GAME THE CLASS PLAYS TOGETHER (`sameEquations`, Classic's
 * default): every student's item in a round is the same line, so the round
 * has a solution to show at its close (lineGraphReveal.mjs). The shared item
 * is the generator's for any student; '*' names none.
 */
const lineGraphSharesRounds = (config = {}) => config.format === "classic" && config.sameEquations === true;
const sharedLineItem = (generator, { seed, config, roundIndex }) => generator.generateLineQuestion({
  seed, studentKey: "*", roundIndex, questionIndex: 0, config,
});

const LINE_GRAPH_PLANNER = Object.freeze({
  async plan({ modeConfig, roundCount }) {
    const { generator } = await lineGraphModules();
    const { lineReveal } = await liveChallengeEngine();
    const config = modeConfig.lineGraph;
    const generatorVersion = generator.LINE_GRAPH_GENERATOR_VERSION;
    // The seed never leaves the server: it is what makes a student's items
    // theirs and reproducible.
    const seed = crypto.randomUUID();
    // A shared round's line is held back while a later round asks the same
    // line (the reveal's rule for every shared question), so the schedule's
    // lines are known from the start — privately.
    const sharedLineKeys = lineGraphSharesRounds(config)
      ? Array.from({ length: roundCount }, (_, roundIndex) => lineReveal.lineRevealKey(sharedLineItem(generator, { seed, config, roundIndex })))
      : null;
    return {
      candidateCount: roundCount,
      selected: Array.from({ length: roundCount }, (_, index) => ({
        question: { id: `lineGraph:round:${index + 1}`, alignmentKeys: [] },
      })),
      roundQuestions: null,
      seed: null,
      privateFields: { lineGraph: { seed, config, generatorVersion, ...(sharedLineKeys ? { sharedLineKeys } : {}) } },
      roomFields: { lineGraph: { config, generatorVersion } },
    };
  },
  async swap() {
    throw new HttpsError("failed-precondition", "Graph the Line items are generated for each student; there is no shared round to swap.");
  },
  async openRound({ room, privateState, roundIndex, mode, engine }) {
    const questionId = privateState.questionIds?.[roundIndex];
    if (!questionId) throw new HttpsError("failed-precondition", "That Live Challenge round has no question.");
    const { config: configRules, generator } = await lineGraphModules();
    const config = privateState.lineGraph?.config || room.lineGraph?.config || {};
    const itemCount = Math.min(configRules.lineRoundQuestionCount(config.format, config), mode.questionSpecs.length);
    // The round's shared line, captured privately like a bank question's
    // solution (published only once nobody can answer it).
    const lineState = privateState.lineGraph || {};
    const shared = lineGraphSharesRounds(config) && lineState.seed
      && Number(lineState.generatorVersion) === generator.LINE_GRAPH_GENERATOR_VERSION;
    const solution = shared
      ? engine.lineReveal.lineRoundSolutionRecord(sharedLineItem(generator, { seed: lineState.seed, config, roundIndex }))
      : null;
    return {
      roundIndex,
      questionId,
      currentQuestion: {
        kind: "lineGraph",
        format: config.format || null,
        challengeRound: roundIndex,
        prompt: lineGraphRoundPrompt(config.format, itemCount),
        itemTypes: Array.isArray(config.itemTypes) ? config.itemTypes : [],
        forms: Array.isArray(config.forms) ? config.forms : [],
        difficulty: config.difficulty || null,
        roundQuestionCount: itemCount,
        teksCode: null,
      },
      roundSeconds: engine.modes.normalizeModeRoundSeconds(mode, room.roundSeconds),
      solution,
    };
  },
});

// The per-player generated sources, beside the shared-question planners.
const GENERATED_QUESTION_PLANNERS = Object.freeze({
  graphFeatureGenerator: GRAPH_FEATURE_RUSH_PLANNER,
  inequalityGenerator: INEQUALITY_RUSH_PLANNER,
  systemsGenerator: SYSTEMS_RUSH_PLANNER,
  lineGraphGenerator: LINE_GRAPH_PLANNER,
});

function liveChallengeQuestionPlanner(mode) {
  const source = String(mode?.questionSource || "");
  const planner = Object.hasOwn(GENERATED_QUESTION_PLANNERS, source)
    ? GENERATED_QUESTION_PLANNERS[source]
    : (Object.hasOwn(LIVE_CHALLENGE_QUESTION_PLANNERS, source) ? LIVE_CHALLENGE_QUESTION_PLANNERS[source] : null);
  if (!planner) throw new HttpsError("failed-precondition", `The ${mode?.label || "selected"} game has no question source on this server.`);
  return planner;
}

async function buildLiveChallengePublicQuestion(db, { roomId, roundIndex, questionId, authoredQuestion = null, solutionSink = null }) {
  const snapshot = authoredQuestion ? null : await db.collection("pathQuestionBank").doc(questionId).get();
  if (!authoredQuestion && !snapshot.exists) throw new HttpsError("failed-precondition", "A Live Challenge question is no longer in the secure bank.");
  const authored = authoredQuestion || snapshot.data() || {};
  // A bank record may be a generator template. Live Challenge must instantiate
  // it on the server exactly as My Math Path does; grading reconstructs the
  // same draw from this deterministic seed, so the browser never chooses the
  // numbers or receives the answer-bearing generator parameters.
  const seedKey = `challenge|${roomId}|${roundIndex}|${questionId}`;
  const instantiated = await mathPath.instantiateQuestion(authored, seedKey);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "A Live Challenge question could not be generated.");
  const issued = { ...instantiated.question, activityRole: "practice" };
  const plan = await mathPath.buildIssuePlan(issued);
  if (!plan.issuable) throw new HttpsError("failed-precondition", "A Live Challenge question can no longer be securely graded.");
  const displayStandard = (Array.isArray(issued.alignmentKeys) ? issued.alignmentKeys[0] : "")
    ? mathPath.displayAlignmentKey(issued.alignmentKeys[0])
    : null;
  // THE ROUND'S WORKED SOLUTION, captured from this same draw for the private
  // state only (liveChallengeSolutionReveal.mjs). It never joins the public
  // question below; it is published after the round closes.
  if (solutionSink) {
    // The draw itself (private), so the opening can read its DOK.
    solutionSink.issued = issued;
    const support = await mathPath.buildPrivateSupport(issued);
    const { solutionReveal } = await liveChallengeEngine();
    solutionSink.record = solutionReveal.roundSolutionRecord({
      question: issued, solutionReview: support?.solutionReview || null, displayStandard,
    });
  }
  return {
    ...mathPath.buildSanitizedQuestion(
      issued,
      {
        questionInstanceId: `challenge_${roomId}_r${roundIndex + 1}`,
        attemptsAllowed: 1,
        attemptsUsed: 0,
        toolPayload: plan.toolPayload,
      },
    ),
    teksCode: displayStandard,
    challengeRound: roundIndex,
  };
}

async function updateLiveChallengeInvitesByRoom(db, { roomId, teacherEmail, fields }) {
  const snapshot = await db.collection(LIVE_CHALLENGE_INVITES).where("roomId", "==", roomId).get();
  const ownedInvites = snapshot.docs.filter((invite) => invite.data()?.teacherEmail === teacherEmail);
  for (let start = 0; start < ownedInvites.length; start += 450) {
    const batch = db.batch();
    ownedInvites.slice(start, start + 450).forEach((invite) => batch.set(invite.ref, fields, { merge: true }));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

const liveChallengePrivateStateIsRecoverable = (privateSnapshot, { roomId, teacherEmail }) => {
  if (!privateSnapshot.exists) return false;
  const privateState = privateSnapshot.data() || {};
  return privateState.roomId === roomId
    && privateState.teacherEmail === teacherEmail
    && Array.isArray(privateState.questionIds)
    && privateState.questionIds.length > 0;
};

async function recoverTeacherActiveChallenge(db, { teacherEmail, challenge }) {
  const activePointerRef = db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherEmail);
  const recovery = await db.runTransaction(async (transaction) => {
    const activePointer = await transaction.get(activePointerRef);
    const roomId = String(activePointer.data()?.roomId || "").trim();
    if (!activePointer.exists || !roomId) {
      if (activePointer.exists) transaction.delete(activePointerRef);
      return { action: "clear" };
    }

    const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
    const activeRoom = await transaction.get(roomRef);
    if (!activeRoom.exists) {
      transaction.delete(activePointerRef);
      return { action: "clear", roomId };
    }

    const room = activeRoom.data() || {};
    const isActive = [challenge.LIVE_CHALLENGE_STATUS.LOBBY, challenge.LIVE_CHALLENGE_STATUS.RUNNING].includes(room.status);
    if (!isActive || room.teacherEmail !== teacherEmail) {
      // A bad pointer must not grant authority over another teacher's room.
      transaction.delete(activePointerRef);
      return { action: "clear", roomId };
    }

    const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
    const privateSnapshot = await transaction.get(privateRef);
    if (liveChallengePrivateStateIsRecoverable(privateSnapshot, { roomId, teacherEmail })) {
      return { action: "resume", roomId };
    }

    // The transaction observes the room, pointer and private document together.
    // If any is repaired or replaced concurrently Firestore retries instead of
    // allowing stale cleanup to cancel the repaired/current session.
    transaction.set(roomRef, {
      status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED,
      phase: "finished",
      staleSession: true,
      currentQuestion: null,
      startsAt: null,
      endsAt: null,
      roundStartedAt: null,
      roundEndsAt: null,
      roundToken: null,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.delete(activePointerRef);
    return { action: "retire", roomId };
  });

  if (recovery.action === "retire") {
    await updateLiveChallengeInvitesByRoom(db, {
      roomId: recovery.roomId,
      teacherEmail,
      fields: { status: challenge.LIVE_CHALLENGE_STATUS.CANCELLED, staleSession: true, updatedAt: FieldValue.serverTimestamp() },
    }).catch((error) => logger.error("liveChallenge.staleInvites.failed", { roomId: recovery.roomId, message: error?.message }));
  }
  return recovery;
}

/*
 * A room that was created but must never be played: it lost the race for the
 * teacher's active-room pointer, or its roster could not be written. It is
 * marked cancelled the way stale sessions are (so nothing can join or reopen
 * it) and its private state, which no match result will ever need, is removed.
 */
async function retireUnusedChallengeRoom(db, { roomRef, privateRef, teacherEmail = null, invitesMayExist = false }) {
  await roomRef.set({
    status: "cancelled",
    phase: "finished",
    staleSession: true,
    currentQuestion: null,
    startsAt: null,
    endsAt: null,
    roundStartedAt: null,
    roundEndsAt: null,
    roundToken: null,
    finishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (invitesMayExist && teacherEmail) {
    await updateLiveChallengeInvitesByRoom(db, {
      roomId: roomRef.id,
      teacherEmail,
      fields: { status: "cancelled", staleSession: true, updatedAt: FieldValue.serverTimestamp() },
    });
  }
  await db.recursiveDelete(privateRef);
}

async function requireOwnedChallenge(db, request, roomId) {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required for Live Challenge.");
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge no longer exists.");
  const room = roomSnapshot.data() || {};
  if (room.teacherEmail !== teacherEmail && !authLib.isRootAdminEmail(teacherEmail)) {
    throw new HttpsError("permission-denied", "Only the teacher who launched this challenge can control it.");
  }
  return { teacherEmail, roomRef, room };
}

// A mode's own settings errors: each carries a sentence a teacher can act on.
const LIVE_CHALLENGE_CONFIG_ERRORS = new Set(["GraphFeatureRushConfigError", "InequalityRushConfigError", "SystemsRushConfigError", "LineGraphConfigError"]);

// Live lobby creation has exceeded 512 MiB for both Graph Feature Rush and
// Systems of Equations Rush. Keep the headroom across Firebase deployments.
exports.createLiveChallenge = onCall({ memory: "1GiB" }, async (request) => {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required for Live Challenge.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();

  const requestedClassId = String(request.data?.classId || "").trim().slice(0, 160);
  let classId = requestedClassId || null;
  let classPeriod = String(request.data?.classPeriod || "").trim().slice(0, 80) || null;
  let className = classPeriod;
  let courseId = challengeCourseId(request.data?.courseId);
  if (classId) {
    const classSnapshot = await db.collection("classes").doc(classId).get();
    if (!classSnapshot.exists) throw new HttpsError("not-found", "That MathMaster class no longer exists.");
    const classRecord = classSnapshot.data() || {};
    const ownsClass = authLib.isRootAdminEmail(teacherEmail)
      || String(classRecord.teacherOfRecord || "").trim().toLowerCase() === teacherEmail;
    if (!ownsClass) throw new HttpsError("permission-denied", "You can only launch a Live Challenge for a class you teach.");
    if (classRecord.status === "archived") throw new HttpsError("failed-precondition", "Choose an active class before launching a challenge.");
    if (!["algebra1", "algebra2"].includes(String(classRecord.course || ""))) {
      throw new HttpsError("failed-precondition", "Live Challenge currently supports Algebra I and Algebra II classes.");
    }
    classPeriod = String(classRecord.period || "").trim().slice(0, 80) || null;
    className = String(classRecord.name || classPeriod || classId).trim().slice(0, 120);
    courseId = challengeCourseId(classRecord.course);
  } else if (!classPeriod) {
    throw new HttpsError("invalid-argument", "Choose a class before launching a challenge.");
  }
  // OPTIONAL ASSIGNMENT LINK. When present this room is the Warm-Up of that
  // assignment, and every student who opens it is handed straight into the
  // game. That is a takeover of the lesson, so it is only allowed when the
  // teacher explicitly switched the challenge on for that assignment — a link
  // to an assignment that never enabled it is refused rather than ignored, so
  // a mistake surfaces at launch instead of surprising a class.
  let assignmentId = String(request.data?.assignmentId || "").trim().slice(0, 200) || null;
  let warmupChallengeConfig = null;
  if (assignmentId) {
    const assignmentSnapshot = await db.collection("assignments").doc(assignmentId).get();
    if (!assignmentSnapshot.exists) throw new HttpsError("not-found", "That assignment no longer exists.");
    const warmup = await warmupChallengeRules();
    warmupChallengeConfig = warmup.normalizeWarmupChallengeConfig({
      ...(assignmentSnapshot.data() || {}),
      id: assignmentId,
    });
    if (!warmupChallengeConfig.enabled) {
      throw new HttpsError(
        "failed-precondition",
        "Turn on the Warm-Up Live Challenge for this assignment before launching it from the Warm-Up.",
      );
    }
    // The game writes its Warm-Up credit onto this class's students under this
    // assignment, so an assignment that names its classes must name this one.
    // (One assigned to no class in particular is accepted, as before.)
    const audience = assignmentAudience(assignmentSnapshot.data() || {});
    if (audience.classIds.length && !(classId && audience.classIds.includes(String(classId)))) {
      throw new HttpsError("failed-precondition", "That assignment is not assigned to this class. Choose one of this class's assignments for the Warm-Up.");
    }
  }

  // THE MODE, ITS SCORING AND ITS REWARDS are resolved through the engine
  // registries, before any roster or bank work, so a bad request fails fast.
  // An unknown mode is the standard game, which is what it always was.
  const engine = await liveChallengeEngine();
  const mode = engine.modes.getChallengeMode(request.data?.challengeMode);
  // A mode not yet offered to teachers (its screens are still being built)
  // launches for the platform administrator only, to preview it. The create
  // panel never offers one; this holds for a request that names it anyway.
  if (!mode.teacherSelectable && !authLib.isRootAdminEmail(teacherEmail)) {
    throw new HttpsError("failed-precondition", `${mode.label} is still in preview and cannot be launched for a class yet.`);
  }
  if (assignmentId && !mode.capabilities.warmupLink) {
    throw new HttpsError("failed-precondition", `${mode.label} cannot run as an assignment's Warm-Up yet. Launch it from Live Challenge instead.`);
  }

  const standardCode = challenge.canonicalChallengeStandard(
    request.data?.standardCode || warmupChallengeConfig?.standardCode || "mixed",
  );
  // The mode's own limits (a rush may be one round; the classic games keep
  // theirs), and only the settings the mode actually has.
  const requestedRoundCount = engine.modes.normalizeModeRoundCount(
    mode,
    request.data?.roundCount || warmupChallengeConfig?.roundCount,
  );
  const roundSeconds = engine.modes.normalizeModeRoundSeconds(
    mode,
    request.data?.roundSeconds || warmupChallengeConfig?.roundSeconds,
  );
  const timingMode = mode.capabilities.paceTiming ? challenge.normalizeChallengeTimingMode(request.data?.timingMode) : "timed";
  const roundClosingThreshold = mode.capabilities.closingThreshold
    ? challenge.normalizeRoundClosingThreshold(request.data?.roundClosingThreshold)
    : null;
  const secondChanceMode = mode.capabilities.secondChance && request.data?.secondChanceMode === "automatic" ? "automatic" : "off";
  const defaultTitle = `${className || classPeriod || "Class"} Live Challenge`;
  const title = String(request.data?.title || defaultTitle).trim().slice(0, 120) || defaultTitle;

  let modeConfig;
  try {
    modeConfig = engine.modes.normalizeModeConfig(mode, request.data || {});
  } catch (error) {
    if (LIVE_CHALLENGE_CONFIG_ERRORS.has(error?.name)) throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
  const { questionStyle, solverRaceFocus, solverRaceDifficulty } = modeConfig;
  const scoringStrategyId = engine.modes.resolveModeScoringStrategy(mode, request.data?.scoringStrategyId);
  // The mode's scoring defaults first (a rush's Grand Prix scales to the
  // class), then anything the request set explicitly.
  const scoringConfig = engine.modes.modeScoringConfig(mode, scoringStrategyId, request.data?.scoringConfig || {});
  let rewardPolicy;
  try {
    rewardPolicy = engine.rewardRules.normalizeRewardPolicy(request.data?.rewardPolicy);
  } catch (error) {
    if (error?.name === "RewardPolicyError") throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
  // Speed influence is part of scoring, so it is stored on the room the scorer
  // reads. configureLiveChallengeExperience may still change it in the lobby.
  const speedInfluencePercent = engine.experience.normalizeSpeedInfluencePercent(request.data?.speedInfluencePercent);
  // The names the class's seats carry (code names unless the teacher chose
  // names), applied as each seat is written below — never afterwards. A
  // student whose screen follows the invite joins at once, before any later
  // call from the teacher's device could rename the seat (seatAliasUnder).
  const playerDisplayMode = engine.experience.normalizePlayerDisplayMode(request.data?.playerDisplayMode);

  // One active room per teacher. A tiny pointer keeps refresh recovery O(1) and
  // avoids reading completed challenge history every time the teacher opens
  // the dashboard.
  const activePointerRef = db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherEmail);
  const activeRecovery = await recoverTeacherActiveChallenge(db, { teacherEmail, challenge });
  if (activeRecovery.action === "resume") {
    throw new HttpsError(
      "failed-precondition",
      "Finish or cancel your current Live Challenge before creating another one.",
      { roomId: activeRecovery.roomId },
    );
  }

  const roster = await loadChallengeRoster(db, teacherEmail, { classId, classPeriod });
  if (!roster.length) throw new HttpsError("failed-precondition", `No students assigned to you were found in ${className || classPeriod}.`);

  const planned = await liveChallengeQuestionPlanner(mode).plan({
    db, courseId, standardCode, modeConfig, roundCount: requestedRoundCount, roundSeconds, timingMode,
  });
  const timingShortfall = engine.difficulty.timedRoundShortfallMessage({
    before: planned.candidateCount + (planned.excludedForTiming || 0),
    after: planned.candidateCount,
    needed: mode.roundLimits.minRounds,
    roundSeconds,
  });
  if (timingShortfall) throw new HttpsError("failed-precondition", timingShortfall);
  if (planned.candidateCount < mode.roundLimits.minRounds) {
    throw new HttpsError(
      "failed-precondition",
      standardCode === "mixed"
        ? `The secure ${courseId === "algebra2" ? "Algebra II" : "Algebra I"} bank needs at least ${challenge.MIN_ROUND_COUNT} usable questions before a Live Challenge can start.`
        : `${standardCode} has only ${planned.candidateCount} securely gradeable challenge question${planned.candidateCount === 1 ? "" : "s"}${questionStyleLabel(questionStyle)}. At least ${challenge.MIN_ROUND_COUNT} are required.`,
    );
  }
  const selected = planned.selected;
  const actualRoundCount = selected.length;

  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc();
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomRef.id);
  const aliasSeed = parseInt(crypto.createHash("sha256").update(roomRef.id).digest("hex").slice(0, 6), 16);
  // Code names are handed out over a RANDOM order. Sorted by student id, the
  // numbers ran consecutively in roster order — so a classmate could recover
  // the order, and the same position carried the same name pattern from game
  // to game. Nothing else depends on this order.
  const aliasOrder = shuffleChallengeItems(roster);
  const playerRecords = aliasOrder.map((student, index) => ({
    studentId: student.studentId,
    playerKey: crypto.randomUUID(),
    // The player's seat in the room's public standings snapshot
    // (liveChallengeStandingsProjection.mjs): where their rank is in its
    // compact lists. Their position in this shuffled order, so it says nothing
    // about the roster either.
    slot: index,
    // The seat's code name, and the alias the room's name setting gives it.
    ...engine.experience.seatAliasUnder({
      room: { playerDisplayMode },
      student,
      studentId: student.studentId,
      player: { codeAlias: challenge.challengeAlias(index, aliasSeed) },
    }),
    joined: false,
    score: 0,
    correctCount: 0,
    roundsAnswered: 0,
    streak: 0,
    answeredRound: -1,
  }));

  const rootBatch = db.batch();
  rootBatch.set(roomRef, {
    schemaVersion: 2,
    title,
    teacherEmail,
    // Null, never absent: a reader can tell "standalone challenge" from "field
    // added after this room was created" without guessing.
    assignmentId,
    classId,
    classPeriod,
    className: className || null,
    courseId,
    standardCode,
    questionStyle,
    challengeMode: mode.id,
    solverRaceFocus,
    solverRaceDifficulty,
    status: challenge.LIVE_CHALLENGE_STATUS.LOBBY,
    roundCount: actualRoundCount,
    requestedRoundCount,
    roundSeconds,
    timingMode,
    roundClosingThreshold,
    secondChanceMode,
    currentRound: -1,
    roundVersion: 0,
    roundToken: null,
    // The round lifecycle (liveChallengeLifecycle.mjs): null until a round
    // opens, then open -> closed per round.
    roundState: null,
    phase: "lobby",
    currentQuestion: null,
    startsAt: null,
    endsAt: null,
    roundStartedAt: null,
    roundEndsAt: null,
    eligibleCount: aliasOrder.length,
    engineVersion: 1,
    modeVersion: mode.version,
    scoringStrategyId,
    // Kept for readers that predate scoringStrategyId.
    scoringMode: scoringStrategyId,
    speedInfluencePercent,
    // What every seat's alias is (code names or the students' names). A join
    // reads it, so a seat written before a later change still comes out right.
    playerDisplayMode,
    // Public settings a mode's planner contributes (a rush's families and
    // features, which the projector shows; never its seed).
    ...planned.roomFields,
    // What placements earn ("Top 3: Practice Pass"), for the lobby and final
    // screens. Names rewards, never students; the policy itself stays private
    // and rewards are still delivered only from the match result.
    rewardSummary: engine.rewardRules.publicRewardSummary(rewardPolicy),
    // Nobody is publicly last (liveChallengePrivacy.mjs): the projector shows
    // the top few unless the teacher opted into full standings.
    standingsDisplay: engine.privacy.normalizeStandingsDisplay(request.data?.standingsDisplay),
    // Rounds whose worked solutions are public (liveChallengeSolutionReveal.mjs).
    revealedSolutionRounds: [],
    // Whether anyone joined has extended time, set when a round opens — never
    // who (liveChallengeAccommodations.mjs).
    extendedTimeInPlay: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  rootBatch.set(privateRef, {
    schemaVersion: 2,
    roomId: roomRef.id,
    teacherEmail,
    solverRaceSeed: planned.seed,
    questionIds: selected.map((entry) => entry.question.id),
    // Generated solver definitions stay in the server-only challenge document.
    // Public room payloads are produced by the normal Path sanitizer below.
    roundQuestions: planned.roundQuestions,
    ...planned.privateFields,
    scoringStrategyId,
    scoringConfig,
    // Validated when the room was created; read by the reward pipeline from
    // the match result when the match finishes.
    rewardPolicy,
    // The standard each round is about, captured now. The report is assembled
    // after the room closes, and re-reading the bank then would give whatever
    // the question says today rather than what the class actually answered.
    roundStandards: Object.fromEntries(selected.map((entry, index) => [
      String(index),
      String(
        (Array.isArray(entry.question.alignmentKeys) && entry.question.alignmentKeys[0])
        || entry.question.alignmentKey
        || entry.question.teksCode
        || "",
      ),
    ])),
    // Frozen here so that appending second-chance rounds later cannot make the
    // game think its own replays were part of the original set.
    scheduledRoundCount: selected.length,
    // No roundMisses/roundAnswers here. Nothing writes them any more — the
    // per-round tallies are derived from the player documents when they are
    // read — and initialising a field no writer maintains is how a stale
    // counter later gets mistaken for the truth.
    secondChanceOf: {},
    secondChancePlanned: false,
    status: challenge.LIVE_CHALLENGE_STATUS.LOBBY,
    // A lobby nobody starts, with no host screen heard for the host-away
    // window, is cancelled by the server (liveChallengeServerSweep.mjs, N73).
    serverSweepDueAt: liveChallengeSweepDate(engine.serverSweep.sweepDueForLobbyMs({ nowMs: Date.now() })),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await rootBatch.commit();

  // CLAIM THE TEACHER'S ONE ACTIVE ROOM BEFORE ANYONE IS INVITED. Two creates
  // racing — two tabs, or Play Again pressed on two screens — both pass the
  // recovery check above. Both used to build a lobby: the invites went to
  // whichever batch wrote last, the pointer to whichever wrote last, and one
  // tab sat on a lobby no student could ever join, left in "lobby" forever.
  // The pointer is claimed in a transaction instead; the create that loses
  // retires its own room before it has invited anybody and answers like any
  // second create, naming the room that won (the console reopens it).
  const claim = await db.runTransaction(async (transaction) => {
    const pointer = await transaction.get(activePointerRef);
    const otherRoomId = pointer.exists ? String(pointer.data()?.roomId || "").trim() : "";
    if (otherRoomId && otherRoomId !== roomRef.id) {
      const other = await transaction.get(db.collection(LIVE_CHALLENGE_ROOMS).doc(otherRoomId));
      const otherRoom = other.exists ? (other.data() || {}) : {};
      if (other.exists && otherRoom.teacherEmail === teacherEmail
        && [challenge.LIVE_CHALLENGE_STATUS.LOBBY, challenge.LIVE_CHALLENGE_STATUS.RUNNING].includes(otherRoom.status)) {
        return { claimed: false, roomId: otherRoomId };
      }
    }
    transaction.set(activePointerRef, { roomId: roomRef.id, teacherEmail, classId, classPeriod, updatedAt: FieldValue.serverTimestamp() });
    return { claimed: true };
  });
  if (!claim.claimed) {
    await retireUnusedChallengeRoom(db, { roomRef, privateRef });
    throw new HttpsError(
      "failed-precondition",
      "Finish or cancel your current Live Challenge before creating another one.",
      { roomId: claim.roomId },
    );
  }

  // Keep identity-bearing player state in one private document per student.
  // Public player documents are created only after students join and contain
  // anonymous aliases/statistics only. This avoids every student contending on
  // one giant room/leaderboard document when a whole class answers together.
  try {
    for (let start = 0; start < playerRecords.length; start += 200) {
      const batch = db.batch();
      playerRecords.slice(start, start + 200).forEach((player) => {
        batch.set(privateRef.collection("players").doc(player.studentId), {
          playerKey: player.playerKey,
          slot: player.slot,
          alias: player.alias,
          codeAlias: player.codeAlias,
          joined: false,
          score: 0,
          correctCount: 0,
          roundsAnswered: 0,
          streak: 0,
          answeredRound: -1,
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(db.collection(LIVE_CHALLENGE_INVITES).doc(player.studentId), {
          roomId: roomRef.id,
          title,
          teacherEmail,
          // The Warm-Up link travels to the student on the invite, because the
          // invite is the only challenge document a student is allowed to read
          // before joining. Null for a standalone challenge, which is what stops
          // one taking over an unrelated assignment's Warm-Up.
          assignmentId,
          classId,
          classPeriod,
          className: className || null,
          courseId,
          alias: player.alias,
          playerKey: player.playerKey,
          // Which seat of the standings snapshot is this student's, known
          // before they join (their own public row repeats it).
          slot: player.slot,
          status: "invited",
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
  } catch (error) {
    // A setup that failed part-way must not trap the teacher behind a pointer
    // to an unusable lobby: release it (only if it is still this room's),
    // retire the room and any invites already written, then report the error.
    await db.runTransaction(async (transaction) => {
      const pointer = await transaction.get(activePointerRef);
      if (pointer.exists && pointer.data()?.roomId === roomRef.id) transaction.delete(activePointerRef);
    }).catch((releaseError) => logger.error("liveChallenge.create.releasePointer.failed", { roomId: roomRef.id, message: releaseError?.message }));
    await retireUnusedChallengeRoom(db, { roomRef, privateRef, teacherEmail, invitesMayExist: true })
      .catch((retireError) => logger.error("liveChallenge.create.retire.failed", { roomId: roomRef.id, message: retireError?.message }));
    throw error;
  }

  return {
    roomId: roomRef.id,
    roundCount: actualRoundCount,
    requestedRoundCount,
    eligibleCount: aliasOrder.length,
    trimmed: actualRoundCount < requestedRoundCount,
  };
});

async function loadPrivateChallengePlayers(privateRef) {
  const snapshot = await privateRef.collection("players").get();
  return snapshot.docs.map((playerDoc) => ({ studentId: playerDoc.id, ...playerDoc.data() }));
}

async function deletePrivateChallengeState(db, privateRef, players = []) {
  try {
    for (let start = 0; start < players.length; start += 450) {
      const batch = db.batch();
      players.slice(start, start + 450).forEach((player) => batch.delete(privateRef.collection("players").doc(player.studentId)));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    await privateRef.delete();
  } catch (error) {
    // Finishing the live room and student invites is more important than
    // retention cleanup. Leave recoverable private state behind rather than
    // turning a completed challenge back into an error screen.
    logger.warn(`Live Challenge private cleanup failed for ${privateRef.id}.`, error);
  }
}

/*
 * A TEACHER PLAYING THEIR OWN CHALLENGE BEFORE A CLASS DOES.
 *
 * Launching a Live Challenge used to be blind: the first time anyone saw the
 * questions was when twenty-four students did, under a timer, with no way back.
 * The point of a dry run is not seeing the interface — it is QUESTION REVIEW.
 * Drawing from the whole bank makes what comes up genuinely less predictable,
 * and nothing yet stops a mixed game serving a DOK-3 modelling question as
 * round 1 under a 45-second clock. This is the cheapest place to catch that.
 *
 * It is deliberately not a room. No roster is loaded, no invite is written, no
 * player documents exist, no report is produced and no mastery evidence is
 * recorded. A dry run cannot be joined, cannot be seen by a student, and leaves
 * nothing attached to anybody's record. The only state is one teacher-scoped
 * document holding the question ids, which exists so that grading resolves on
 * the server rather than trusting whatever the browser sends back.
 *
 * The questions, the instantiation seed, the issuability gate and the grader are
 * all the same code the real game uses. A dry run that used a parallel path
 * would reassure a teacher about something students never see.
 */
async function requireOwnedDryRun(db, request, dryRunId) {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  const ref = db.collection(LIVE_CHALLENGE_DRY_RUNS).doc(String(dryRunId || "").trim());
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That dry run no longer exists.");
  const dryRun = snapshot.data() || {};
  if (dryRun.teacherEmail !== teacherEmail && !authLib.isRootAdminEmail(teacherEmail)) {
    throw new HttpsError("permission-denied", "You can only open your own dry run.");
  }
  return { teacherEmail, ref, dryRun };
}

exports.createChallengeDryRun = onCall(async (request) => {
  await requireTeacher(request);
  const teacherEmail = callerEmail(request);
  if (!teacherEmail) throw new HttpsError("permission-denied", "A verified teacher email is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();

  const courseId = challengeCourseId(request.data?.courseId);
  const standardCode = challenge.canonicalChallengeStandard(request.data?.standardCode || "mixed");
  const requestedRoundCount = challenge.normalizeRoundCount(request.data?.roundCount);
  const roundSeconds = challenge.normalizeRoundSeconds(request.data?.roundSeconds);
  const timingMode = challenge.normalizeChallengeTimingMode(request.data?.timingMode);

  // The same mode registry and question planners as a real room, so a dry run
  // rehearses exactly what students would receive.
  const engine = await liveChallengeEngine();
  const mode = engine.modes.getChallengeMode(request.data?.challengeMode);
  if (!mode.capabilities.dryRun) {
    throw new HttpsError("failed-precondition", `${mode.label} is rehearsed with its own preview, not a dry run.`);
  }
  const modeConfig = engine.modes.normalizeModeConfig(mode, request.data || {});
  const { questionStyle, solverRaceFocus, solverRaceDifficulty } = modeConfig;
  const planned = await liveChallengeQuestionPlanner(mode).plan({
    db, courseId, standardCode, modeConfig, roundCount: requestedRoundCount, roundSeconds, timingMode,
  });
  const timingShortfall = engine.difficulty.timedRoundShortfallMessage({
    before: planned.candidateCount + (planned.excludedForTiming || 0),
    after: planned.candidateCount,
    needed: challenge.MIN_ROUND_COUNT,
    roundSeconds,
  });
  if (timingShortfall) throw new HttpsError("failed-precondition", timingShortfall);
  if (planned.candidateCount < challenge.MIN_ROUND_COUNT) {
    throw new HttpsError(
      "failed-precondition",
      // "Only 2 questions" is baffling on a bank of 800. "Only 2 that use an
      // interactive tool" is the actual situation the teacher has to act on.
      `That selection has only ${planned.candidateCount} securely gradeable questions${questionStyleLabel(questionStyle)}. At least ${challenge.MIN_ROUND_COUNT} are required.`,
    );
  }
  const selected = planned.selected;
  const questionIds = selected.map((entry) => entry.question.id);

  const ref = db.collection(LIVE_CHALLENGE_DRY_RUNS).doc();
  await ref.set({
    schemaVersion: 1,
    teacherEmail,
    courseId,
    standardCode,
    questionStyle,
    challengeMode: mode.id,
    solverRaceFocus,
    solverRaceDifficulty,
    solverRaceSeed: planned.seed,
    roundQuestions: planned.roundQuestions,
    roundSeconds,
    timingMode,
    questionIds,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const rounds = await Promise.all(questionIds.map(async (questionId, roundIndex) => ({
    roundIndex,
    question: await buildLiveChallengePublicQuestion(db, {
      roomId: ref.id, roundIndex, questionId, authoredQuestion: planned.roundQuestions?.[roundIndex] || null,
    }),
  })));

  return { dryRunId: ref.id, courseId, standardCode, questionStyle, challengeMode: mode.id, solverRaceFocus, solverRaceDifficulty, roundSeconds, timingMode, roundCount: rounds.length, rounds };
});

exports.swapChallengeDryRunRound = onCall(async (request) => {
  const db = getFirestore();
  const roundIndex = Number(request.data?.roundIndex);
  if (!Number.isInteger(roundIndex) || roundIndex < 0) throw new HttpsError("invalid-argument", "roundIndex is required.");
  const { ref, dryRun } = await requireOwnedDryRun(db, request, request.data?.dryRunId);

  const questionIds = Array.isArray(dryRun.questionIds) ? [...dryRun.questionIds] : [];
  if (roundIndex >= questionIds.length) throw new HttpsError("invalid-argument", "That round is not part of this dry run.");

  const engine = await liveChallengeEngine();
  const mode = engine.modes.getChallengeMode(dryRun.challengeMode);
  const swapped = await liveChallengeQuestionPlanner(mode).swap({ db, dryRun, roundIndex, questionIds });
  questionIds[roundIndex] = swapped.questionId;
  const patch = { questionIds, updatedAt: FieldValue.serverTimestamp() };
  if (swapped.authoredQuestion) {
    const roundQuestions = Array.isArray(dryRun.roundQuestions) ? [...dryRun.roundQuestions] : [];
    roundQuestions[roundIndex] = swapped.authoredQuestion;
    patch.roundQuestions = roundQuestions;
  }
  await ref.set(patch, { merge: true });

  return {
    roundIndex,
    question: await buildLiveChallengePublicQuestion(db, {
      roomId: ref.id, roundIndex, questionId: swapped.questionId, authoredQuestion: swapped.authoredQuestion || null,
    }),
  };
});

exports.gradeChallengeDryRunResponse = onCall(async (request) => {
  const db = getFirestore();
  const roundIndex = Number(request.data?.roundIndex);
  if (!Number.isInteger(roundIndex) || roundIndex < 0) throw new HttpsError("invalid-argument", "roundIndex is required.");
  const { dryRun, ref } = await requireOwnedDryRun(db, request, request.data?.dryRunId);

  const questionId = (dryRun.questionIds || [])[roundIndex];
  if (!questionId) throw new HttpsError("invalid-argument", "That round is not part of this dry run.");

  // The same seed the public question was built from, so the teacher is graded
  // against the draw they were actually shown.
  const authoredQuestion = dryRun.roundQuestions?.[roundIndex] || null;
  const snapshot = authoredQuestion ? null : await db.collection("pathQuestionBank").doc(questionId).get();
  if (!authoredQuestion && !snapshot.exists) throw new HttpsError("failed-precondition", "That question is no longer in the secure bank.");
  const instantiated = await mathPath.instantiateQuestion(authoredQuestion || snapshot.data() || {}, `challenge|${ref.id}|${roundIndex}|${questionId}`);
  if (!instantiated.question) throw new HttpsError("failed-precondition", "That question could not be regenerated.");
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  if (!plan.issuable) throw new HttpsError("failed-precondition", "That question can no longer be securely graded.");
  const grading = await mathPath.gradePathToolResponse(plan.privateGrading, request.data?.responsePayload || {});
  if (grading?.rejected) throw new HttpsError("failed-precondition", grading.reason || "The response could not be graded.");

  // Shaped like submitLiveChallengeResponse so the round renders identically,
  // and scored by the same function the real game scores with, so a
  // partial-credit tool shows a teacher the credit it will actually pay.
  // Speed and streak are deliberately zero: there is no server-timed round here
  // and no run of answers to build on, and inventing either would be a number a
  // teacher could not get in the real game. Nothing here is written anywhere.
  const challenge = await liveChallengeRules();
  const scored = challenge.scoreChallengeRound({
    gradeScore: Number(grading?.score) || 0,
    isCorrect: grading?.isCorrect === true,
    remainingMs: 0,
    previousStreak: 0,
  });
  return {
    isCorrect: grading?.isCorrect === true,
    scorePercent: Math.round(Math.max(0, Math.min(1, Number(grading?.score) || 0)) * 100),
    pointsAwarded: scored.basePoints,
    basePoints: scored.basePoints,
    speedBonus: 0,
    streakBonus: 0,
    comebackBonus: 0,
    recoveryPoints: 0,
    secondChance: false,
    totalScore: scored.basePoints,
    streak: 0,
    rank: null,
    dryRun: true,
  };
});

exports.discardChallengeDryRun = onCall(async (request) => {
  const db = getFirestore();
  const { ref } = await requireOwnedDryRun(db, request, request.data?.dryRunId);
  await ref.delete();
  return { discarded: true };
});

// ---------------------------------------------------------------------------
// THE LIVE CHALLENGE LIFECYCLE ON THE SERVER.
//
// Every command that changes a match — start, close a round, advance, finish,
// cancel — has one shape:
//
//   1. read the room outside any transaction and answer the cheap cases
//      ("already done", "not allowed") before building anything;
//   2. do slow preparation that reads other documents — the next round's
//      question — OUTSIDE the transaction, so no player document is locked
//      while the bank is read;
//   3. in ONE transaction, re-read the room, the private state and the
//      players, ask liveChallengeLifecycle.planLifecycleCommand what the
//      command does to THAT state, and apply it — or report it already done.
//
// Two teacher tabs pressing Next Round at once, a double click, a projector
// and a laptop both reacting to the buzzer: one transaction applies, the others
// find their work already done. Nothing here relies on a disabled button.
//
// Finishing writes the durable match result in the same transaction that
// makes the room terminal. Everything downstream — report, invites, Warm-Up
// credit, evidence, rewards, private cleanup — is a replayable effect of that
// result (runLiveChallengeFinalizationEffects), so a crash between steps is
// finished by the next caller or the scheduled sweep, never lost and never
// doubled.
// ---------------------------------------------------------------------------

function lifecycleHttpsError(plan) {
  return new HttpsError(
    "failed-precondition",
    plan?.message || "That Live Challenge action is not available right now.",
    // Why a round is not ready (e.g. 'extended_time'), for the console's words.
    { lifecycle: plan?.code || null, ...(plan?.readiness ? { readiness: plan.readiness } : {}) },
  );
}

/**
 * A refused round command. When the refusal is a round held past the class's
 * deadline for extended time, the room learns `extendedTimeInPlay` here if
 * the round's opening did not set it (a student with extended time joined
 * mid-round): the console and projector then say "still finishing" and offer
 * End Round Now, not a frozen "Time!". The write belongs to the host's close,
 * not to any student's row, and says nothing the held round does not already
 * show. Returns the refusal for the caller to throw after the commit.
 */
function refuseLiveChallengeRoundCommand(transaction, { roomRef, room, plan }) {
  if (plan?.readiness === "extended_time" && room?.extendedTimeInPlay !== true) {
    transaction.set(roomRef, { extendedTimeInPlay: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { refused: plan };
  }
  throw lifecycleHttpsError(plan);
}

function playersFromSnapshot(snapshot) {
  return snapshot.docs.map((playerDoc) => ({ studentId: playerDoc.id, ...playerDoc.data() }));
}

/**
 * The round a host command acted on. A client that sends none is acting on the
 * round this request just read, so a concurrent advance that lands first is
 * recognised as the same command already applied.
 */
function expectedRoundFromRequest(data = {}, room = {}) {
  const supplied = (value) => value !== undefined && value !== null && value !== "";
  if (!supplied(data?.expectedRoundIndex)) {
    return {
      roundIndex: Number.isInteger(Number(room.currentRound)) ? Number(room.currentRound) : -1,
      roundVersion: Math.max(0, Number(room.roundVersion) || 0),
    };
  }
  const roundIndex = Number(data.expectedRoundIndex);
  if (!Number.isInteger(roundIndex)) throw new HttpsError("invalid-argument", "expectedRoundIndex must be a round number.");
  if (!supplied(data?.expectedRoundVersion)) return { roundIndex, roundVersion: null };
  const roundVersion = Number(data.expectedRoundVersion);
  if (!Number.isInteger(roundVersion)) throw new HttpsError("invalid-argument", "expectedRoundVersion must be a whole number.");
  return { roundIndex, roundVersion };
}

function liveChallengeRoundResponse(roomId, room = {}, extra = {}) {
  const startsAt = toDate(room.startsAt || room.roundStartedAt);
  const endsAt = toDate(room.endsAt || room.roundEndsAt);
  return {
    roomId,
    status: room.status || null,
    roundIndex: Number.isInteger(Number(room.currentRound)) ? Number(room.currentRound) : -1,
    roundVersion: Math.max(0, Number(room.roundVersion) || 0),
    roundToken: room.roundToken || null,
    roundState: room.roundState || null,
    phase: room.phase || null,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    ...extra,
  };
}

/**
 * Joined players, and how many of them have finished the current round — the
 * inputs to the close guard. "Finished" is the mode's completion rule applied
 * to the receipt log, with the legacy answeredRound marker as a fallback.
 */
function liveChallengeRoundCompletion(engine, room, players, nowMs = Date.now()) {
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  const roundIndex = Number(room.currentRound);
  let joinedCount = 0;
  let completedCount = 0;
  const progress = [];
  players.forEach((player) => {
    if (player.joined !== true) return;
    joinedCount += 1;
    // Per-player modes read each player's own question specs from their log;
    // a rush player "finishes" only by working through the whole pool. All
    // of their work: a student who finishes their set in extra time, after
    // the class's buzzer, is finished, and the round need not wait longer.
    const receipts = engine.responses.playerWorkReceipts(player);
    const questionSpecs = engine.modes.roundQuestionSpecsFor(mode, { receipts, roundIndex });
    const finished = Number(player.answeredRound) === roundIndex
      || engine.responses.summarizeRoundProgress({ receipts, roundIndex, questionSpecs }).finished;
    if (finished) completedCount += 1;
    progress.push({ joined: true, finished, timeMultiplier: player.timeMultiplier });
  });
  // Unfinished players still inside their own extended deadline (plus the
  // arrival grace an answer sent at their 0:00 still gets).
  const extendedPendingCount = engine.accommodations.extendedTimePendingCount({
    timer: engine.timer.timerFromRoom(room),
    players: progress,
    nowMs,
    fullDurationMs: engine.accommodations.roomFullRoundMs(room),
  });
  return { joinedCount, completedCount, extendedPendingCount };
}

/** The next round's public question and duration. Deterministic for a given room/round/question. */
async function prepareLiveChallengeRoundOpening(db, { roomId, room, privateState, roundIndex }) {
  const engine = await liveChallengeEngine();
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  const planner = liveChallengeQuestionPlanner(mode);
  if (typeof planner.openRound === "function") {
    return planner.openRound({ db, roomId, room, privateState, roundIndex, mode, engine });
  }
  const challenge = await liveChallengeRules();
  const questionId = privateState.questionIds?.[roundIndex];
  if (!questionId) throw new HttpsError("failed-precondition", "That Live Challenge round has no question.");
  const authoredQuestion = privateState.roundQuestions?.[roundIndex] || null;
  const solutionSink = {};
  const currentQuestion = await buildLiveChallengePublicQuestion(db, { roomId, roundIndex, questionId, authoredQuestion, solutionSink });
  // A multi-step (DOK 3+) question never runs under DOK3_MIN_ROUND_SECONDS in
  // a timed round, whatever the adjustment gave (liveChallengeDifficulty.mjs).
  const { difficulty } = await liveChallengeEngine();
  const roundSeconds = difficulty.timedRoundSecondsFor({
    question: solutionSink.issued || authoredQuestion || currentQuestion,
    adjustedSeconds: challenge.complexityAdjustedRoundSeconds({
      baselineSeconds: room.roundSeconds,
      question: authoredQuestion || currentQuestion,
    }),
    timingMode: room.timingMode,
  });
  return { roundIndex, questionId, currentQuestion, roundSeconds, solution: solutionSink.record || null };
}

/** Whether any joined player has extended time in a mode that allows it. */
function liveChallengeExtendedTimeInPlay(engine, room, players = []) {
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  if (engine.accommodations.extendedTimeRuleFor(mode) === engine.accommodations.EXTENDED_TIME_RULE.NONE) return false;
  return (Array.isArray(players) ? players : [])
    .some((player) => player?.joined === true && engine.accommodations.storedTimeMultiplier(player.timeMultiplier) > 1);
}

/** A sweep due time as Firestore stores it: a Date, or null for "never". */
const liveChallengeSweepDate = (ms) => (Number.isFinite(ms) ? new Date(ms) : null);

/** Open a round inside a transaction. Room and private state move together. */
function applyLiveChallengeRoundOpening(transaction, {
  engine, challenge, roomRef, privateRef, room, privateState, privatePatch = null, opening, nowMs, players = [],
}) {
  const { lifecycle } = engine;
  const timingMode = challenge.normalizeChallengeTimingMode(room.timingMode);
  // Every round starts in the future by the countdown lead: each screen shows
  // the same 3-2-1 off this startsAt, and nobody can answer before it.
  const timer = engine.timer.buildRoundTimer({
    nowMs,
    syncLeadMs: engine.timer.ROUND_COUNTDOWN_LEAD_MS,
    durationMs: timingMode === "pace" ? null : opening.roundSeconds * 1000,
  });
  const roundIndex = opening.roundIndex;
  const roundVersion = Math.max(Number(room.roundVersion) || 0, roundIndex) + 1;
  const roundToken = crypto.randomUUID();
  const startsAt = new Date(timer.startsAtMs);
  const endsAt = timer.endsAtMs ? new Date(timer.endsAtMs) : null;
  const secondChanceOf = privateState.secondChanceOf || {};
  const scheduledRoundCount = Number(privateState.scheduledRoundCount) || Number(room.roundCount) || 0;
  const isReplay = Object.prototype.hasOwnProperty.call(secondChanceOf, String(roundIndex));

  transaction.set(privateRef, {
    ...privatePatch,
    // Private until the round closes (and any replay of it has).
    ...(opening.solution ? { roundSolutions: { [String(roundIndex)]: opening.solution } } : {}),
    status: lifecycle.SESSION_STATUS.RUNNING,
    roundState: lifecycle.ROUND_STATE.OPEN,
    currentRound: roundIndex,
    roundVersion,
    roundToken,
    // When the server closes this round if no host screen does
    // (liveChallengeServerSweep.mjs) — or, for a Pace Race round, which has
    // no deadline, when it first asks whether the host is still there (N73).
    serverSweepDueAt: liveChallengeSweepDate(engine.serverSweep.sweepDueAfterOpeningMs({ endsAtMs: timer.endsAtMs, startsAtMs: timer.startsAtMs })),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  transaction.set(roomRef, {
    status: lifecycle.SESSION_STATUS.RUNNING,
    roundState: lifecycle.ROUND_STATE.OPEN,
    currentRound: roundIndex,
    roundVersion,
    roundToken,
    phase: "countdown",
    currentQuestion: opening.currentQuestion,
    scheduledRoundCount,
    secondChanceOf: isReplay ? Number(secondChanceOf[String(roundIndex)]) : null,
    finalRoundNumber: isReplay ? roundIndex - scheduledRoundCount + 1 : null,
    hasAdditionalReplay: Object.prototype.hasOwnProperty.call(secondChanceOf, String(roundIndex + 1)),
    startsAt,
    endsAt,
    roundStartedAt: startsAt,
    roundEndsAt: endsAt,
    activeRoundSeconds: opening.roundSeconds,
    // Set at the opening, from everyone joined so far — no join or answer
    // commits with it, so it says that someone has more time, never who.
    extendedTimeInPlay: liveChallengeExtendedTimeInPlay(engine, room, players),
    closingStartedAt: null,
    roundClosedAt: null,
    pausedAt: null,
    pausedRemainingMs: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    currentQuestion: opening.currentQuestion,
    roundIndex,
    roundVersion,
    roundToken,
    phase: "countdown",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
  };
}

/**
 * Close a round inside a transaction: rank it, persist the private and the
 * anonymous public round result, and — for a placement strategy — add each
 * player's placement points to their match total. Returns the players as they
 * stand after the round, for a finalization in the same transaction.
 */
function applyLiveChallengeRoundClose(transaction, {
  engine, roomRef, privateRef, room, privateState, players, roundIndex, nowMs,
}) {
  // Answers given in extended time after the class's deadline reach the
  // public rows now, with everyone else's — never while the class waits.
  players.forEach((player) => {
    if (player.joined !== true || !player.playerKey || Number(player.publicRowPendingRound) !== Number(roundIndex)) return;
    transaction.set(roomRef.collection("players").doc(String(player.playerKey)), liveChallengePublicAnswerRow(player, player, roundIndex), { merge: true });
    transaction.set(privateRef.collection("players").doc(player.studentId), { publicRowPendingRound: null }, { merge: true });
  });
  const scoringStrategyId = engine.scoring.roomScoringStrategyId(room);
  const strategy = engine.scoring.getScoringStrategy(scoringStrategyId);
  const roundResult = engine.results.buildRoundResult({
    roomId: roomRef.id,
    roundIndex,
    roundVersion: room.roundVersion,
    modeId: room.challengeMode,
    scoringStrategyId,
    scoringConfig: privateState.scoringConfig || null,
    players,
    secondChanceOf: privateState.secondChanceOf || {},
    closedAtMs: nowMs,
  });
  transaction.set(privateRef.collection("rounds").doc(String(roundIndex)), {
    ...roundResult,
    closedAt: FieldValue.serverTimestamp(),
  });

  const perRound = strategy.accumulation === engine.scoring.SCORE_ACCUMULATION.PER_ROUND;
  // A question-set round leaves each player their own round facts on their
  // public record — what their round-results screen shows, also after a
  // refresh. Anonymous: alias-keyed, counts and percentages only.
  const questionSet = engine.modes.roundStructureFor(engine.modes.getChallengeMode(room.challengeMode)).id
    === engine.modes.ROUND_STRUCTURE.QUESTION_SET;
  const updatedPlayers = perRound || questionSet
    ? applyLiveChallengeRoundPlayerTotals(transaction, {
      engine, roomRef, privateRef, room, players, roundIndex, roundResult, scoringStrategyId, perRound, questionSet,
    })
    : players;
  // The anonymous copy carries the match standings this round left behind,
  // ranked from the totals just written, so a results screen shows the round
  // and the standings it produced from one document — and movement since the
  // last round compares two ranks the engine wrote.
  const standingsAfterRound = engine.results.matchStandingsAfterRound({
    players: updatedPlayers, modeId: room.challengeMode, scoringStrategyId,
  });
  // NOBODY IS PUBLICLY LAST, ALSO IN FIRESTORE. Three copies, by who reads
  // them: the class's (rounds/{n}) holds only the rows the public rule shows
  // everyone; the teacher's (hostRounds/{n}) the whole anonymous table, for
  // the console and the projector it drives; and each student's own summary
  // their own place in the round and the match (liveChallengePlayerSummary).
  const hostSummary = engine.results.publicRoundSummary(roundResult, { standingsAfterRound });
  transaction.set(roomRef.collection(LIVE_CHALLENGE_HOST_ROUNDS).doc(String(roundIndex)), {
    ...hostSummary,
    closedAt: FieldValue.serverTimestamp(),
  });
  transaction.set(roomRef.collection("rounds").doc(String(roundIndex)), {
    ...engine.results.classRoundSummary(roundResult, { standingsAfterRound }),
    closedAt: FieldValue.serverTimestamp(),
  });
  writeLiveChallengeRoundSummaries(transaction, { engine, roomRef, roundResult, summary: hostSummary, standingsAfterRound });
  // The caller writes the class's standings snapshot from these same
  // standings (writeExactStandingsProjection), or the final one when the
  // match ends in the same transaction.
  return { roundResult, players: updatedPlayers, standingsAfterRound };
}

/*
 * EACH STUDENT'S OWN SUMMARY (functions/shared/liveChallengePlayerSummary.mjs):
 * liveChallengeRooms/{room}/playerSummaries/{studentId}, readable by that
 * student and the room's teacher only. Written in the commit that closes a
 * round (their place in it, and in the match after it) and in the commit that
 * finishes the match (their final place), beside the class's documents for the
 * same moment — so a student's own place and the class's top rows are always
 * one moment.
 */
const liveChallengePlayerSummaryRef = (roomRef, engine, studentId) => roomRef
  .collection(engine.playerSummary.PLAYER_SUMMARY_COLLECTION)
  .doc(String(studentId));

function writeLiveChallengeRoundSummaries(transaction, { engine, roomRef, roundResult, summary, standingsAfterRound }) {
  const entries = engine.playerSummary.roundSummaryEntries({
    roundResult, summary, standingsAfterRound, byPoints: engine.results.roundTableByPoints(summary),
  });
  entries.forEach((item) => {
    transaction.set(liveChallengePlayerSummaryRef(roomRef, engine, item.studentId), {
      schemaVersion: engine.playerSummary.PLAYER_SUMMARY_SCHEMA_VERSION,
      roomId: roomRef.id,
      playerKey: item.playerKey,
      alias: item.alias,
      // Merged: one entry per closed round, kept for the whole match.
      rounds: { [String(item.roundIndex)]: item.entry },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/** Each placed player's final place, from the match result's standings (a finished match only). */
function writeLiveChallengeFinalSummaries(transaction, { engine, roomRef, standings, status }) {
  engine.playerSummary.finalSummaryEntries({ standings }).forEach((item) => {
    transaction.set(liveChallengePlayerSummaryRef(roomRef, engine, item.studentId), {
      schemaVersion: engine.playerSummary.PLAYER_SUMMARY_SCHEMA_VERSION,
      roomId: roomRef.id,
      playerKey: item.playerKey,
      alias: item.alias,
      status,
      final: item.entry,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/** The public row an answer updates: anonymous counters only (alias, never a student id). */
function liveChallengePublicAnswerRow(player, finalPlayer, roundIndex) {
  return {
    playerKey: player.playerKey,
    alias: player.alias,
    joined: true,
    score: finalPlayer.score,
    rawScore: finalPlayer.rawScore,
    correctCount: finalPlayer.correctCount,
    roundsAnswered: finalPlayer.roundsAnswered,
    streak: finalPlayer.streak,
    answeredRound: roundIndex,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/*
 * THE CLASS'S STANDINGS SNAPSHOT AT A ROUND CLOSE OR THE FINISH.
 *
 * liveChallengeRooms/{room}/standings/current is what every student's screen
 * listens to (functions/shared/liveChallengeStandingsProjection.mjs). It is
 * written exactly here — in the transaction that closes a round or finishes
 * the match, from the standings that transaction computed from the private
 * records — and between those moments only as a paced live snapshot
 * (publishLiveChallengeStandings). No answer reads or writes it.
 *
 * A snapshot is display. Building one can never fail the transaction that
 * closes a round or ends a match: a builder error is logged and the snapshot
 * left as it was, and the next milestone (or ensureLiveChallengeFinalStandings)
 * writes it again from the authoritative records.
 */
const standingsProjectionRef = (roomRef, standings) => roomRef.collection(standings.STANDINGS_COLLECTION).doc(standings.STANDINGS_DOC_ID);

function writeExactStandingsProjection(transaction, {
  engine, roomRef, room, kind, standings, status = null, nowMs, source,
}) {
  try {
    const projection = engine.standings.exactProjectionFromStandings({
      roomId: roomRef.id, room, kind, standings, status,
    });
    transaction.set(standingsProjectionRef(roomRef, engine.standings), {
      ...projection,
      digest: engine.standings.projectionDigest(projection),
      source,
      sourceReadMs: nowMs,
      publishedAt: FieldValue.serverTimestamp(),
      publishedAtMs: nowMs,
    });
    return true;
  } catch (error) {
    logger.error("liveChallenge.standings.exact.failed", { roomId: roomRef.id, kind, message: error?.message || String(error) });
    return false;
  }
}

/**
 * A closed round's effect on each player's record: placement points (a
 * per-round strategy) and the player's own public round facts (a question-set
 * round). Returns the players as they stand after the round.
 */
function applyLiveChallengeRoundPlayerTotals(transaction, {
  engine, roomRef, privateRef, room, players, roundIndex, roundResult, scoringStrategyId, perRound, questionSet,
}) {
  const publicStandings = new Map(engine.results.publicRoundSummary(roundResult).standings.map((row) => [row.playerKey, row]));
  const standingByStudent = new Map(roundResult.standings.map((standing) => [standing.studentId, standing]));
  return players.map((player) => {
    const standing = standingByStudent.get(player.studentId);
    let patch = null;
    if (perRound) {
      const totals = engine.results.playerTotalsAfterRound({ player, standing, roundIndex, scoringStrategyId });
      if (totals && !totals.alreadyApplied) {
        const { alreadyApplied: _alreadyApplied, ...rest } = totals;
        patch = rest;
        transaction.set(privateRef.collection("players").doc(player.studentId), {
          ...patch,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    if (player.joined === true && player.playerKey && standing) {
      const publicRow = publicStandings.get(String(player.playerKey)) || {};
      const publicPatch = {
        ...(patch ? {
          score: patch.score,
          matchPoints: patch.matchPoints,
          roundWins: patch.roundWins,
          // Null when the round earned them nothing: no credit, no placement.
          lastRoundRank: engine.results.roundPlacementRank(standing),
          lastRoundMatchPoints: standing.matchPointsAwarded,
        } : {}),
        ...(questionSet ? {
          lastRound: {
            roundIndex,
            roundVersion: Math.max(0, Number(room.roundVersion) || 0),
            rank: standing.participated ? standing.rank : null,
            fieldSize: roundResult.fieldSize,
            completed: Number(publicRow.completed) || 0,
            // The round's points (a rush item worth the taps its answer takes).
            points: Number(publicRow.roundPoints) || 0,
            accuracyPercent: publicRow.accuracyPercent ?? null,
            workScore: Number(standing.metrics?.workScore) || 0,
            matchPointsAwarded: standing.matchPointsAwarded,
            participated: standing.participated === true,
          },
        } : {}),
      };
      if (Object.keys(publicPatch).length) {
        transaction.set(roomRef.collection("players").doc(String(player.playerKey)), {
          ...publicPatch,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    return patch ? { ...player, ...patch } : player;
  });
}

/** Whether a room may still append Second Chance replays (the one predicate both callers use). */
function liveChallengeSecondChancePossible(room = {}, mode = {}) {
  return Boolean(mode?.capabilities?.secondChance) && room.secondChanceMode !== "off";
}

/*
 * SOLUTION REVEAL (liveChallengeSolutionReveal.mjs). Which rounds' worked
 * solutions may be public once `closedThrough` has closed: every closed round,
 * except that while Second Chance may still replay a question its solution is
 * held — until the replay plan is known, and for a replayed question until
 * its replay has closed. The plan is pure (planNextLiveChallengeRound), so at
 * the close of the last scheduled round it is computed here, from the same
 * records the Continue press will plan from, before it is persisted.
 */
function liveChallengeRevealableRounds({ challenge, engine, room, privateState, players, closedThrough, finished = false }) {
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  // A per-player round (Graph Feature Rush) has no shared question to solve —
  // unless the class played it together: a Graph the Line Classic round with
  // the same line for everyone, published at its close (no Second Chance in
  // these modes), held while a later round asks the same line.
  if (mode.questionIssue === engine.modes.QUESTION_ISSUE.PER_PLAYER) {
    const reached = Number.isInteger(Number(room.currentRound)) ? Number(room.currentRound) : -1;
    // A Graph Feature Rush round publishes its reading guide at its close
    // (LC07): the same for every student and about no graph, so nothing holds
    // it back, and no Second Chance replays a Rush round. Only a round whose
    // guide was captured when it opened (a game already running before this
    // existed has none, and publishes none). An Inequality Graphing Rush or a
    // Systems of Equations Rush round's guide is published the same way.
    if (mode.questionSource === engine.modes.QUESTION_SOURCE.GRAPH_FEATURE_GENERATOR
      || mode.questionSource === engine.modes.QUESTION_SOURCE.INEQUALITY_GENERATOR
      || mode.questionSource === engine.modes.QUESTION_SOURCE.SYSTEMS_GENERATOR) {
      const scheduled = Number(privateState.scheduledRoundCount) || (Array.isArray(privateState.questionIds) ? privateState.questionIds.length : 0);
      return engine.solutionReveal.revealableRounds({
        closedThrough, scheduledRoundCount: scheduled, secondChancePossible: false, replayOf: {}, finished,
      }).filter((round) => round <= reached && privateState.roundSolutions?.[String(round)]);
    }
    const sharedLineKeys = privateState.lineGraph?.sharedLineKeys;
    if (!Array.isArray(sharedLineKeys)) return [];
    return engine.solutionReveal.revealableRounds({
      closedThrough,
      scheduledRoundCount: sharedLineKeys.length,
      secondChancePossible: false,
      replayOf: {},
      finished,
      questionKeys: sharedLineKeys.map((key) => (key ? [key] : null)),
    }).filter((round) => round <= reached);
  }
  const questionIds = Array.isArray(privateState.questionIds) ? privateState.questionIds : [];
  const scheduledRoundCount = Number(privateState.scheduledRoundCount) || questionIds.length;
  // The same condition planNextLiveChallengeRound replays under, so a room
  // that may replay never reveals early.
  const secondChancePossible = liveChallengeSecondChancePossible(room, mode);
  let replayOf = null;
  if (finished || privateState.secondChancePlanned) replayOf = privateState.secondChanceOf || {};
  else if (!secondChancePossible) replayOf = {};
  else if (Number(closedThrough) >= scheduledRoundCount - 1) {
    const next = planNextLiveChallengeRound({ challenge, engine, room, privateState, players, roundIndex: closedThrough });
    replayOf = next.finish ? {} : (next.privateState?.secondChanceOf || {});
  }
  const rounds = engine.solutionReveal.revealableRounds({
    closedThrough, scheduledRoundCount, secondChancePossible, replayOf, finished,
    // Solver Race: never publish a solution while a later round asks the same equation.
    questionKeys: engine.solutionReveal.roundQuestionKeys(privateState.roundQuestions, questionIds),
  });
  // Never a round the match did not reach.
  const reached = Number.isInteger(Number(room.currentRound)) ? Number(room.currentRound) : -1;
  return rounds.filter((round) => round <= reached);
}

/**
 * Publish the newly revealable rounds' solutions inside the caller's
 * transaction. `players` are the private player records: a Graph the Line
 * round the class played together publishes what the class drew most often
 * (counts only), now that nobody can answer it.
 */
function applyLiveChallengeSolutionReveals(transaction, { engine, roomRef, room, privateState, rounds, nowMs, players = [] }) {
  const already = Array.isArray(room.revealedSolutionRounds) ? room.revealedSolutionRounds : [];
  const fresh = engine.solutionReveal.newlyRevealedRounds(rounds, already);
  if (!fresh.length) return already;
  const secondChanceOf = privateState.secondChanceOf || {};
  fresh.forEach((round) => {
    const original = secondChanceOf[String(round)];
    const stored = privateState.roundSolutions?.[String(round)] || null;
    const record = stored?.lineGraph ? engine.lineReveal.withClassLineFacts({ record: stored, players, roundIndex: round }) : stored;
    transaction.set(roomRef.collection(engine.solutionReveal.SOLUTIONS_COLLECTION).doc(String(round)), {
      ...engine.solutionReveal.publicSolutionDocument({
        roundIndex: round,
        record,
        originalRoundIndex: original === undefined ? null : original,
        revealedAtMs: nowMs,
      }),
      revealedAt: FieldValue.serverTimestamp(),
    });
  });
  const revealed = [...new Set([...already.map(Number), ...fresh])].sort((a, b) => a - b);
  transaction.set(roomRef, { revealedSolutionRounds: revealed }, { merge: true });
  return revealed;
}

/**
 * What follows the round that just ended: the next scheduled round, the
 * second-chance replays (planned exactly once), or the end of the match.
 */
function planNextLiveChallengeRound({ challenge, engine, room, privateState, players, roundIndex }) {
  const nextRound = Number(roundIndex) + 1;
  const questionIds = Array.isArray(privateState.questionIds) ? privateState.questionIds : [];
  if (nextRound < questionIds.length) {
    return { finish: false, roundIndex: nextRound, questionId: questionIds[nextRound], privateState, privatePatch: null };
  }

  // SECOND CHANCE. Before the game ends, the questions the room got wrong
  // most come back once. Getting one right now earns most of its points
  // back, which turns a miss from a loss into a target and makes the last
  // rounds the ones the class most needs to see again.
  //
  // Appended only once — `secondChancePlanned` stops a replay of a replay,
  // which would otherwise let a game run on as long as students kept missing.
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  if (privateState.secondChancePlanned || !liveChallengeSecondChancePossible(room, mode)) {
    return { finish: true };
  }
  const scheduled = Number(privateState.scheduledRoundCount) || questionIds.length;
  // Same derivation as the report, from the same player records. This runs
  // after the last scheduled round, when every record is final for it.
  const replays = challenge.planSecondChanceRounds({
    roundMisses: challenge.deriveRoundTallies({
      players,
      secondChanceOf: privateState.secondChanceOf || {},
      storedRoundMisses: privateState.roundMisses || null,
    }).roundMisses,
    scheduledRoundCount: scheduled,
  });
  if (!replays.length) return { finish: true };

  const nextQuestionIds = [...questionIds];
  const roundQuestions = Array.isArray(privateState.roundQuestions) ? [...privateState.roundQuestions] : null;
  const secondChanceOf = { ...privateState.secondChanceOf };
  replays.forEach((originalRound) => {
    secondChanceOf[String(nextQuestionIds.length)] = originalRound;
    nextQuestionIds.push(questionIds[originalRound]);
    if (roundQuestions) roundQuestions.push(privateState.roundQuestions[originalRound]);
  });
  const privatePatch = {
    questionIds: nextQuestionIds,
    ...(roundQuestions ? { roundQuestions } : {}),
    secondChanceOf,
    scheduledRoundCount: scheduled,
    secondChancePlanned: true,
  };
  return {
    finish: false,
    roundIndex: nextRound,
    questionId: nextQuestionIds[nextRound],
    privateState: { ...privateState, ...privatePatch },
    privatePatch,
  };
}

// Which finalization effects a match needs. Cancelled matches earn no rewards,
// and leave their class no memory (only a finished game of a kind that has
// one does; the effect itself passes over every other game).
function liveChallengeFinalizationEffects(room = {}, status) {
  const challengeFinished = status === "finished";
  return {
    report: "pending",
    classMemory: challengeFinished ? "pending" : "notApplicable",
    invites: "pending",
    warmupCredit: room.assignmentId ? "pending" : "notApplicable",
    evidence: "pending",
    rewards: challengeFinished ? "pending" : "notApplicable",
    privateCleanup: "pending",
  };
}

/**
 * Make a match terminal inside a transaction and persist its final result in
 * the same commit. The room can never be terminal without a result, and a
 * result can never exist for a room that is still running.
 */
function applyLiveChallengeMatchFinalization(transaction, {
  engine, db, roomRef, privateRef, pointerRef, pointsHere, room, privateState, players, status, nowMs,
}) {
  const { lifecycle } = engine;
  const finalizationId = crypto.randomUUID();
  const matchResult = engine.results.buildMatchResult({
    roomId: roomRef.id, room, privateState, players, status, finalizedAtMs: nowMs, finalizationId,
  });
  // GRAPH THE LINE'S FIRST TRIES (lineGraphEvidence.mjs), counted from each
  // student's receipts in this commit and kept on their own standing: the
  // evidence effect reads the result, never private state, and permanent
  // deletion, which removes the standing, removes them with it.
  const resultMode = engine.modes.getChallengeMode(room.challengeMode);
  const lineRoom = resultMode.questionSource === engine.modes.QUESTION_SOURCE.LINE_GRAPH_GENERATOR;
  const roomSlopeHelper = (privateState.lineGraph?.config || room.lineGraph?.config || {}).slopeHelper === true;
  const playerById = new Map((Array.isArray(players) ? players : []).map((player) => [String(player?.studentId || ""), player]));
  const resultStandings = lineRoom
    ? matchResult.standings.map((standing) => ({
      ...standing,
      lineGraphEvidence: engine.lineEvidence.lineEvidenceFacts({ player: playerById.get(standing.studentId) || {}, roomSlopeHelper }),
    }))
    : matchResult.standings;
  // RECOGNITION BEYOND THE PODIUM (liveChallengeRecognitions.mjs), decided
  // from this result in this commit, so the podium screen and the rewards
  // effect read the same list. Aliases and player keys only. A finished match
  // always carries the field (empty when the policy turned recognitions off):
  // it also tells the rewards effect this match may earn recognition and
  // personal-best rewards, which a match finished before them never does.
  const finished = status === lifecycle.SESSION_STATUS.FINISHED;
  const recognitions = finished && engine.rewardRules.recognitionsEnabled(engine.rewardRules.storedRewardPolicy(privateState.rewardPolicy || null))
    ? engine.recognitions.publicRecognitions(engine.recognitions.matchRecognitions(matchResult))
    : [];
  transaction.set(db.collection(LIVE_CHALLENGE_MATCH_RESULTS).doc(roomRef.id), {
    ...matchResult,
    standings: resultStandings,
    ...(finished ? { recognitions } : {}),
    // Lets permanent student deletion find this document.
    studentIds: matchResult.standings.map((standing) => standing.studentId),
    rewardPolicy: privateState.rewardPolicy || null,
    scoringConfig: privateState.scoringConfig || null,
    effects: liveChallengeFinalizationEffects(room, status),
    effectsPending: true,
    effectsAttempts: 0,
    finalizedAt: FieldValue.serverTimestamp(),
  });
  const hadRound = Number.isInteger(Number(room.currentRound)) && Number(room.currentRound) >= 0;
  const terminal = {
    status,
    roundState: hadRound ? lifecycle.ROUND_STATE.CLOSED : null,
    finalizationId,
    updatedAt: FieldValue.serverTimestamp(),
  };
  transaction.set(roomRef, {
    ...terminal,
    phase: "finished",
    currentQuestion: null,
    endsAt: null,
    roundEndsAt: null,
    pausedAt: null,
    finishedAt: FieldValue.serverTimestamp(),
    // The room shows only the recognitions that name no struggle (the full
    // list stays on the server-only result, for rewards and each recap).
    ...(finished ? { recognitions: engine.recognitions.classVisibleRecognitions(recognitions, { warmup: Boolean(room.assignmentId) }) } : {}),
  }, { merge: true });
  // A terminal match is never swept again.
  transaction.set(privateRef, { ...terminal, serverSweepDueAt: null }, { merge: true });
  if (pointsHere) transaction.delete(pointerRef);
  // THE RECAP: a finished match publishes every solution it held. Nothing can
  // be answered any more. A cancelled match publishes nothing.
  if (status === lifecycle.SESSION_STATUS.FINISHED) {
    applyLiveChallengeSolutionReveals(transaction, {
      engine,
      roomRef,
      room,
      privateState,
      rounds: liveChallengeRevealableRounds({
        challenge: null, engine, room, privateState, players, closedThrough: Number(room.currentRound), finished: true,
      }),
      nowMs,
      players,
    });
  }
  // The final standings and podium every screen shows ARE the match result's:
  // written in this commit, from its standings, and never replaced after.
  writeExactStandingsProjection(transaction, {
    engine,
    roomRef,
    room: { ...room, status },
    kind: engine.standings.PROJECTION_KIND.FINAL,
    standings: matchResult.standings,
    status,
    nowMs,
    source: "finish",
  });
  // And each student's own final place, from the same standings. A cancelled
  // match records nothing, so it places nobody.
  if (finished) writeLiveChallengeFinalSummaries(transaction, { engine, roomRef, standings: matchResult.standings, status });
  return matchResult;
}

/**
 * Update invites for one room — but only invites that STILL point at it. A
 * newer game may already have re-invited the student; overwriting that
 * invite's status would hide the new game from them.
 */
async function updateLiveChallengeInvitesForRoom(db, { roomId, studentIds = [], fields }) {
  const ids = [...new Set(studentIds.map((id) => String(id || "").trim()).filter(Boolean))];
  for (let start = 0; start < ids.length; start += 100) {
    const refs = ids.slice(start, start + 100).map((id) => db.collection(LIVE_CHALLENGE_INVITES).doc(id));
    // eslint-disable-next-line no-await-in-loop
    await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(...refs);
      snapshots.forEach((snapshot) => {
        if (snapshot.exists && snapshot.data()?.roomId === roomId) transaction.set(snapshot.ref, fields, { merge: true });
      });
    });
  }
}

/*
 * THE REPORT, THE WARM-UP CREDIT AND THE MASTERY EVIDENCE are written from the
 * durable match result — never from private state — so each can be re-run.
 * CHALLENGE POINTS NEVER REACH THE ASSIGNMENT: the Warm-Up records what the
 * student did (how much they answered, how much was right), because those are
 * facts about the mathematics and the score is partly a fact about reaction
 * time.
 */
/*
 * A question-set mode's own report, and the key the report document stores it
 * under. Chosen by the mode's question source, as its planner is.
 */
async function questionSetModeReport(mode, result) {
  if (mode.questionSource === "lineGraphGenerator") {
    return { key: "lineGraph", report: (await lineGraphModules()).attempts.buildLineGraphReport(result) };
  }
  if (mode.questionSource === "inequalityGenerator") {
    // The rush's report, its rows named for inequalities.
    const { generator } = await inequalityRushRules();
    return { key: "inequalityRush", report: (await graphFeatureRushRules()).rush.buildRushReport(result, generator.INEQUALITY_REPORT_LABELS) };
  }
  if (mode.questionSource === "systemsGenerator") {
    // The rush's report, its rows named for systems.
    const { rules } = await systemsRushRules();
    return { key: "systemsRush", report: (await graphFeatureRushRules()).rush.buildRushReport(result, rules.SYSTEMS_REPORT_LABELS) };
  }
  return { key: "graphFeatureRush", report: (await graphFeatureRushRules()).rush.buildRushReport(result) };
}

/*
 * WHO A FINISHED MATCH MAY STILL WRITE ABOUT (SI07).
 *
 * The effects below run from the match result, which may have been read just
 * before a permanent deletion scrubbed it. Each reads the roster rows of the
 * students it is about to write about, in the transaction that writes: a row
 * that is gone, or that permanentlyDeleteStudent has marked (its first write;
 * functions/shared/studentDeletionMark.mjs), gets no report row, Warm-Up
 * credit or evidence. A deletion that marks a row meanwhile makes the
 * transaction run again, and the rerun sees the mark. Rewards make the same
 * check in their own delivery transaction (liveChallengeClassPoints.mjs).
 */
async function liveChallengeEffectRecipients(transaction, db, studentIds = []) {
  const { rosterRowAcceptsEffects } = await studentDeletionMark();
  const ids = [...new Set(studentIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await transaction.getAll(...ids.map((id) => db.collection("grades").doc(id)));
  return new Set(rows.filter((row) => rosterRowAcceptsEffects(row)).map((row) => row.id));
}

/*
 * The report a game's class memory is read from (its `report`), built from
 * the durable match result as the teacher's own report is: a rush's, Graph
 * the Line's, or the classic one (Solver Race).
 */
async function classMemoryReportFromResult(game, result) {
  if (game.report === "lineGraph") return (await lineGraphModules()).attempts.buildLineGraphReport(result);
  if (game.report === "classic") return classicChallengeReportFromResult(result);
  let labels;
  if (game.report === "inequalityRush") labels = (await inequalityRushRules()).generator.INEQUALITY_REPORT_LABELS;
  if (game.report === "systemsRush") labels = (await systemsRushRules()).rules.SYSTEMS_REPORT_LABELS;
  return (await graphFeatureRushRules()).rush.buildRushReport(result, labels);
}

/*
 * CLASS MEMORY, written from the durable match result like the report: a
 * finished game that has one (the rushes, Graph the Line, Solver Race —
 * liveChallengeClassMemory.mjs says why Standard Challenge has none) leaves
 * its class one small record — when, with which settings (read from the
 * room, which keeps them), and how the class did — for the next setup's
 * card. Class totals only. A late or repeated run for an older game never
 * replaces a newer one.
 */
async function writeClassMemoryFromResult(db, result) {
  const memoryRules = await liveChallengeClassMemoryRules();
  const game = memoryRules.classMemoryGameOfMode(result.modeId);
  if (!game || result.status !== "finished" || !result.classId) return;
  const roomSnapshot = await db.collection(LIVE_CHALLENGE_ROOMS).doc(String(result.roomId || "")).get();
  if (!roomSnapshot.exists) return;
  const report = await classMemoryReportFromResult(game, result);
  const memory = memoryRules.buildClassMemory({ result, room: roomSnapshot.data() || {}, report });
  if (!memory) return;
  const memoryRef = db.collection(LIVE_CHALLENGE_CLASS_MEMORY).doc(memoryRules.classMemoryId(memory.classId, memory.game));
  await db.runTransaction(async (transaction) => {
    const stored = await transaction.get(memoryRef);
    if (stored.exists && memoryRules.memoryIsNewer(stored.data(), memory)) return;
    transaction.set(memoryRef, { ...memory, updatedAt: FieldValue.serverTimestamp() });
  });
}

async function writeLiveChallengeReportFromResult(db, result) {
  const reportRules = await liveChallengeReportRules();
  const players = Array.isArray(result.standings) ? result.standings : [];
  const report = await classicChallengeReportFromResult(result);
  const finishedAt = Number(result.finalizedAtMs) ? new Date(Number(result.finalizedAtMs)) : FieldValue.serverTimestamp();
  // A question-set game has no one question per round and no standard per
  // round: its report is its mode's own breakdown (by feature and family for
  // the rush; by form, item type and mistake for Graph the Line), stored
  // under the mode's key, and its class accuracy is every attempt.
  const { modes } = await liveChallengeEngine();
  const resultMode = modes.getChallengeMode(result.modeId);
  const questionSet = modes.roundStructureFor(resultMode).id === modes.ROUND_STRUCTURE.QUESTION_SET;
  const modeReport = questionSet ? await questionSetModeReport(resultMode, result) : null;
  const document = {
    ...report,
    ...(modeReport ? {
      [modeReport.key]: modeReport.report,
      classAccuracyPercent: modeReport.report.accuracyPercent,
      rounds: [],
      standards: [],
      weakestStandard: null,
    } : {}),
    roomId: result.roomId,
    teacherEmail: result.teacherEmail,
    classId: result.classId || null,
    status: result.status,
    modeId: result.modeId || null,
    scoringStrategyId: result.scoringStrategyId || null,
    // Lets permanent student deletion find this document.
    studentIds: players.map((player) => player.studentId).filter(Boolean),
    finishedAt,
    createdAt: finishedAt,
  };
  // A student deleted while the match finished is not reported (SI07): their
  // rows leave the report as permanent deletion's scrub would take them out.
  const reportRef = db.collection(LIVE_CHALLENGE_REPORTS).doc(result.roomId);
  await db.runTransaction(async (transaction) => {
    const recipients = await liveChallengeEffectRecipients(transaction, db, reportRules.reportStudentIds(document));
    transaction.set(reportRef, {
      ...document,
      ...reportRules.reportRowsWithout(document, (studentId) => !recipients.has(studentId)),
    });
  });
}

/*
 * THE CLASSIC REPORT — rounds, standards, the class by name — from the
 * durable match result alone: what the teacher's report stores, and what a
 * Solver Race's class memory reads (liveChallengeClassMemory.mjs).
 */
async function classicChallengeReportFromResult(result) {
  const reportRules = await liveChallengeReportRules();
  const challengeRules = await liveChallengeRules();
  const players = Array.isArray(result.standings) ? result.standings : [];
  const secondChanceOf = result.secondChanceOf || {};
  // Counted from the player records rather than read off a shared counter.
  const derivedTallies = challengeRules.deriveRoundTallies({
    players,
    secondChanceOf,
    storedRoundAnswers: result.legacyRoundAnswers || null,
    storedRoundMisses: result.legacyRoundMisses || null,
  });
  return reportRules.buildChallengeReport({
    room: result,
    scheduledRoundCount: Number(result.scheduledRoundCount) || 0,
    playedRoundCount: typeof result.playedRoundCount === "number" ? result.playedRoundCount : null,
    roundMisses: derivedTallies.roundMisses,
    roundStandards: result.roundStandards || {},
    answeredCounts: derivedTallies.roundAnswers,
    secondChanceOf,
    questionIds: Array.isArray(result.questionIds) ? result.questionIds : [],
    players,
  });
}

async function writeWarmupCreditFromResult(db, result) {
  if (!result.assignmentId) return;
  const warmup = await warmupChallengeRules();
  const scheduledRounds = Math.max(0, Number(result.roomRoundCount) || Number(result.scheduledRoundCount) || 0);
  // The rounds the match actually reached. A game ended after three of ten
  // rounds — or a lobby cancelled before round one — must not measure
  // students against rounds that never ran.
  const totalRounds = Math.min(scheduledRounds, Math.max(0, Number(result.playedRoundCount) || 0));
  // Only students who actually joined. A student who never appeared is an
  // attendance question, which the teacher reconciles; writing them a 0% here
  // would make an absence indistinguishable from a student who sat through
  // the game and answered nothing.
  const joinedPlayers = (result.standings || []).filter((player) => player.joined === true && player.studentId);
  for (let start = 0; start < joinedPlayers.length; start += 200) {
    const chunk = joinedPlayers.slice(start, start + 200);
    // eslint-disable-next-line no-await-in-loop
    await db.runTransaction(async (transaction) => {
      // A student deleted while the match finished is credited nothing, and
      // their grade row is never written again (SI07). The merge below would
      // otherwise re-create a deleted row — and wake Classroom passback.
      const recipients = await liveChallengeEffectRecipients(transaction, db, chunk.map((player) => player.studentId));
      chunk.filter((player) => recipients.has(String(player.studentId).trim())).forEach((player) => {
        const credit = warmup.warmupChallengeCredit({
          roundsAnswered: player.roundsAnswered,
          correctCount: player.correctCount,
          roundsAvailable: warmup.roundsAvailableToStudent({
            totalRounds,
            joinedAtRound: player.joinedAtRound,
          }),
        });
        transaction.set(db.collection("grades").doc(player.studentId), {
          warmupChallengeByAssignment: {
            [result.assignmentId]: {
              ...credit,
              roomId: result.roomId,
              status: result.status,
              roundCount: scheduledRounds,
              roundsPlayed: totalRounds,
              recordedAt: FieldValue.serverTimestamp(),
            },
          },
        }, { merge: true });
      });
    });
  }
}

/*
 * GRAPH THE LINE'S OWN MASTERY EVIDENCE (lineGraphEvidence.mjs): first tries,
 * per kind of item, from each student's facts on the match result — and only
 * while the owner's switch is on (platformFlags/liveChallengeEvidence,
 * `lineGraph: true`). A game whose effect ran while it was off is not written
 * later. Any other game: none from here.
 */
async function lineGraphEvidenceEventsFor(db, result) {
  const { modes, lineEvidence } = await liveChallengeEngine();
  if (modes.getChallengeMode(result.modeId).questionSource !== modes.QUESTION_SOURCE.LINE_GRAPH_GENERATOR) return [];
  const switchSnapshot = await db.collection(lineEvidence.LINE_EVIDENCE_SWITCH_COLLECTION).doc(lineEvidence.LINE_EVIDENCE_SWITCH).get();
  if (!lineEvidence.lineEvidenceSwitchedOn(switchSnapshot.exists ? switchSnapshot.data() : null)) return [];
  return lineEvidence.buildLineGraphEvidenceEvents({
    roomId: result.roomId,
    modeId: result.modeId,
    standings: result.standings || [],
    occurredAt: Number(result.finalizedAtMs) || Date.now(),
  });
}

async function writeChallengeEvidenceFromResult(db, result) {
  // Aggregated per standard rather than per round, because a single timed
  // question is close to a coin flip and a proportion is what the estimate can
  // use. Replays are excluded so one question cannot enter a record twice.
  const evidenceRules = await liveChallengeEvidenceRules();
  const events = [
    ...evidenceRules.buildChallengeEvidenceEvents({
      roomId: result.roomId,
      players: result.standings || [],
      roundStandards: result.roundStandards || {},
      secondChanceOf: result.secondChanceOf || {},
      occurredAt: Number(result.finalizedAtMs) || Date.now(),
    }),
    // A line game has no standard per round, so the builder above writes
    // nothing for it; its own rules do (behind the owner's switch).
    ...await lineGraphEvidenceEventsFor(db, result),
  ];
  // One student's events stay in one transaction, at most about 450 writes
  // each, and each transaction reads its students' roster rows first: a
  // student deleted while the match finished gets no evidence (SI07), which
  // would otherwise land under a grade row the deletion has erased.
  const byStudent = new Map();
  events.forEach((evidenceEvent) => {
    const studentId = String(evidenceEvent.studentId || "").trim();
    if (!studentId) return;
    if (!byStudent.has(studentId)) byStudent.set(studentId, []);
    byStudent.get(studentId).push(evidenceEvent);
  });
  const chunks = [];
  byStudent.forEach((studentEvents, studentId) => {
    const last = chunks.at(-1);
    if (!last || last.count + studentEvents.length > 450) chunks.push({ studentIds: [studentId], count: studentEvents.length });
    else {
      last.studentIds.push(studentId);
      last.count += studentEvents.length;
    }
  });
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    await db.runTransaction(async (transaction) => {
      const recipients = await liveChallengeEffectRecipients(transaction, db, chunk.studentIds);
      chunk.studentIds.filter((studentId) => recipients.has(studentId)).forEach((studentId) => {
        byStudent.get(studentId).forEach((evidenceEvent) => {
          const ref = db.collection("grades").doc(evidenceEvent.studentId)
            .collection("evidenceEvents").doc(mathPath.opaqueId("challengeEvidence", evidenceEvent.eventKey));
          transaction.set(ref, evidenceEvent);
        });
      });
    });
  }
}

async function deliverLiveChallengeRewardsFromResult(db, result) {
  if (result.status !== "finished") return;
  const rewards = await liveChallengeClassPoints();
  // Who set a personal best, from results finalized BEFORE this one — the
  // same answer on every retry. Empty for a result from before personal bests.
  const personalBestStudentIds = await liveChallengeRecap().personalBestStudentIds(db, result);
  const delivery = await rewards.processLiveChallengeMatchRewards(db, {
    matchResult: result, policy: result.rewardPolicy || null, personalBestStudentIds,
  });
  // A match whose rewards were skipped as a whole (an archived class, a class
  // with no teacher of record) writes no award job, so without this the
  // teacher's reward diagnostics could not say why nobody was rewarded.
  // update(), never set(): a result removed meanwhile stays removed.
  if (delivery?.status === "skipped" && result.roomId) {
    await db.collection(LIVE_CHALLENGE_MATCH_RESULTS).doc(String(result.roomId))
      .update({ rewardsSkipReason: String(delivery.reason || "skipped") })
      .catch((error) => logger.warn("liveChallenge.rewards.skipReason.unrecorded", { roomId: result.roomId, message: error?.message || String(error) }));
  }
}

// After this many runs an effect that still fails stops being retried by the
// sweep (and is logged), so one broken match cannot occupy the sweep forever.
const LIVE_CHALLENGE_EFFECT_MAX_ATTEMPTS = 10;
const LIVE_CHALLENGE_EFFECT_ORDER = Object.freeze(["report", "classMemory", "invites", "warmupCredit", "evidence", "rewards"]);

/**
 * Run every outstanding finalization effect of a match, idempotently. Safe to
 * call repeatedly and concurrently — from the finishing callable, from a
 * retried finish, and from the scheduled sweep. An effect once "done" is never
 * run again; private state is deleted last, once everything that could want it
 * has run.
 */
async function runLiveChallengeFinalizationEffects(db, roomId) {
  const { results } = await liveChallengeEngine();
  const resultRef = db.collection(LIVE_CHALLENGE_MATCH_RESULTS).doc(roomId);
  const snapshot = await resultRef.get();
  if (!snapshot.exists) return { effectsPending: false, missing: true };
  const result = snapshot.data() || {};
  const recorded = result.effects || {};
  const settled = results.finalizationEffectSettled;
  const tasks = {
    report: () => writeLiveChallengeReportFromResult(db, result),
    classMemory: () => writeClassMemoryFromResult(db, result),
    invites: () => updateLiveChallengeInvitesForRoom(db, {
      roomId,
      studentIds: (result.standings || []).map((standing) => standing.studentId),
      fields: { status: result.status, updatedAt: FieldValue.serverTimestamp() },
    }),
    warmupCredit: () => writeWarmupCreditFromResult(db, result),
    evidence: () => writeChallengeEvidenceFromResult(db, result),
    rewards: () => deliverLiveChallengeRewardsFromResult(db, result),
  };

  const outcomes = {};
  for (const name of LIVE_CHALLENGE_EFFECT_ORDER) {
    if (settled(recorded[name])) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await tasks[name]();
      outcomes[name] = "done";
    } catch (error) {
      outcomes[name] = "failed";
      logger.error("liveChallenge.finalization.effect.failed", { roomId, effect: name, message: error?.message || String(error) });
    }
  }

  const attempts = Math.max(0, Number(result.effectsAttempts) || 0) + 1;
  const lastAttempt = attempts >= LIVE_CHALLENGE_EFFECT_MAX_ATTEMPTS;
  const othersSettled = LIVE_CHALLENGE_EFFECT_ORDER.every((name) => settled(outcomes[name] ?? recorded[name]));
  // Private state goes once nothing could still want it — or on the last
  // attempt, when the effects still failing are about to be given up.
  if ((othersSettled || lastAttempt) && !settled(recorded.privateCleanup)) {
    try {
      await db.recursiveDelete(db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId));
      outcomes.privateCleanup = "done";
    } catch (error) {
      outcomes.privateCleanup = "failed";
      logger.warn("liveChallenge.finalization.privateCleanup.failed", { roomId, message: error?.message || String(error) });
    }
  }

  return db.runTransaction(async (transaction) => {
    const latest = await transaction.get(resultRef);
    // Removed while the effects ran: never write back a partial result.
    if (!latest.exists) return { effectsPending: false, missing: true };
    const merged = { ...latest.data()?.effects };
    // "done" always wins: a slower runner can never mark a finished effect as failed.
    Object.entries(outcomes).forEach(([name, outcome]) => {
      if (merged[name] !== "done") merged[name] = outcome;
    });
    const state = results.finalizationEffectsState({ effects: merged, attempts, maxAttempts: LIVE_CHALLENGE_EFFECT_MAX_ATTEMPTS });
    if (state.abandoned) {
      logger.error("liveChallenge.finalization.abandoned", { roomId, effects: merged, attempts });
    }
    transaction.set(resultRef, {
      effects: merged,
      effectsPending: state.pending,
      effectsAbandoned: state.abandoned,
      effectsAttempts: attempts,
      effectsUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { effects: merged, effectsPending: state.pending };
  });
}

/**
 * Finish or cancel a match. Idempotent: the first call makes the room terminal
 * and writes its result; any later or concurrent call finds it terminal and
 * only resumes outstanding effects.
 *
 * `stillWanted`, when given, is asked inside the transaction (it may read
 * more through the transaction it is handed), with the room and private
 * state as it read them, whether this finish should still happen
 * (the server's finish of an abandoned game: not if the teacher opened a
 * round or was heard since). No: nothing is written, `{ skipped: true }`.
 * `endedBy` is recorded on the room ("hostAway": the server ended it).
 */
async function finalizeLiveChallengeMatch(db, { roomRef, room, command, status, stillWanted = null, endedBy = null }) {
  const engine = await liveChallengeEngine();
  const { lifecycle } = engine;
  const roomId = roomRef.id;
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const teacherKey = String(room.teacherEmail || "").trim().toLowerCase();
  const pointerRef = teacherKey ? db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherKey) : null;

  const outcome = await db.runTransaction(async (transaction) => {
    const [roomSnapshot, privateSnapshot, playersSnapshot, pointerSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(privateRef),
      transaction.get(privateRef.collection("players")),
      pointerRef ? transaction.get(pointerRef) : Promise.resolve(null),
    ]);
    if (!roomSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge no longer exists.");
    const currentRoom = roomSnapshot.data() || {};
    if (currentRoom.teacherEmail !== room.teacherEmail) {
      throw new HttpsError("permission-denied", "Only the teacher who launched this challenge can control it.");
    }
    const plan = lifecycle.planLifecycleCommand({ command, room: currentRoom });
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.ALREADY_APPLIED) return { alreadyApplied: true, room: currentRoom };
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.REJECT) throw lifecycleHttpsError(plan);
    if (stillWanted && !(await stillWanted({ transaction, room: currentRoom, privateState: privateSnapshot.exists ? privateSnapshot.data() || {} : {} }))) {
      return { skipped: true };
    }
    const pointsHere = Boolean(pointerSnapshot?.exists && pointerSnapshot.data()?.roomId === roomId);
    const hadRound = Number.isInteger(Number(currentRoom.currentRound)) && Number(currentRoom.currentRound) >= 0;

    if (!privateSnapshot.exists) {
      if (command !== lifecycle.LIFECYCLE_COMMAND.CANCEL) {
        throw new HttpsError("not-found", "The private challenge state is missing.");
      }
      // A room whose private state is gone cannot produce a result. Retire it
      // the way stale-session recovery does, releasing only its own pointer.
      transaction.set(roomRef, {
        status: lifecycle.SESSION_STATUS.CANCELLED,
        phase: "finished",
        roundState: hadRound ? lifecycle.ROUND_STATE.CLOSED : null,
        staleSession: true,
        currentQuestion: null,
        startsAt: null,
        endsAt: null,
        roundStartedAt: null,
        roundEndsAt: null,
        roundToken: null,
        finishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (pointsHere) transaction.delete(pointerRef);
      return { staleCancelled: true };
    }

    const nowMs = Date.now();
    const privateState = privateSnapshot.data() || {};
    let players = playersFromSnapshot(playersSnapshot);
    // Ending mid-round still counts the round for everyone who answered it —
    // but a round still in its 3-2-1 countdown (Next Round, then End Game) was
    // never answerable: it is not ranked, and the match result does not count
    // it as played (results.playedRoundCountAt).
    if (plan.closeCurrentRound && status === lifecycle.SESSION_STATUS.FINISHED
      && engine.results.openRoundStartedAt(currentRoom, nowMs)) {
      players = applyLiveChallengeRoundClose(transaction, {
        engine, roomRef, privateRef, room: currentRoom, privateState, players, roundIndex: plan.roundIndex, nowMs,
      }).players;
    }
    applyLiveChallengeMatchFinalization(transaction, {
      engine, db, roomRef, privateRef, pointerRef, pointsHere, room: currentRoom, privateState, players, status, nowMs,
    });
    if (endedBy) transaction.set(roomRef, { endedBy }, { merge: true });
    return { finalized: true };
  });

  if (outcome.skipped) return { roomId, skipped: true };
  if (outcome.staleCancelled) {
    await updateLiveChallengeInvitesByRoom(db, {
      roomId,
      teacherEmail: room.teacherEmail,
      fields: { status: lifecycle.SESSION_STATUS.CANCELLED, staleSession: true, updatedAt: FieldValue.serverTimestamp() },
    }).catch((error) => logger.error("liveChallenge.cancelInvites.failed", { roomId, message: error?.message }));
    return { roomId, status: lifecycle.SESSION_STATUS.CANCELLED };
  }

  // A retried or concurrent finish also resumes whatever a crashed first
  // attempt left undone. Effects never throw into the caller: the match is
  // already durably finished and the sweep retries anything that failed.
  await runLiveChallengeFinalizationEffects(db, roomId).catch((error) => logger.error(
    "liveChallenge.finalization.effects.failed",
    { roomId, message: error?.message || String(error) },
  ));
  if (outcome.alreadyApplied) {
    return { roomId, status: outcome.room.status, roundCount: Number(outcome.room.roundCount) || 0, alreadyApplied: true };
  }
  return { roomId, status, roundCount: Number(room.roundCount) || 0 };
}

exports.joinLiveChallenge = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const { lifecycle, modes, accommodations, experience } = await liveChallengeEngine();
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");

  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);
  const gradeRef = db.collection("grades").doc(studentId);

  const joined = await db.runTransaction(async (transaction) => {
    const [inviteSnapshot, roomSnapshot, playerSnapshot, gradeSnapshot] = await Promise.all([
      transaction.get(inviteRef), transaction.get(roomRef), transaction.get(privatePlayerRef), transaction.get(gradeRef),
    ]);
    if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
    if (!roomSnapshot.exists || !playerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge is no longer available.");
    const room = roomSnapshot.data() || {};
    if (lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.JOIN, room }).outcome !== lifecycle.LIFECYCLE_OUTCOME.APPLY) {
      throw new HttpsError("failed-precondition", "That Live Challenge is no longer accepting players.");
    }
    const player = playerSnapshot.data() || {};
    if (!player.playerKey) throw new HttpsError("failed-precondition", "Your Live Challenge player record is incomplete.");
    // WHICH ROUND THEY WALKED IN ON. A student who arrives at round six is a
    // full participant in the four rounds they were present for, not a
    // 40% participant in ten. Without this the denominator is always the whole
    // game and every late arrival looks like a student who gave up.
    //
    // Preserved once set. Rejoining is not arriving — a Chromebook waking from
    // sleep re-enters this transaction, and recomputing would move the student's
    // join to the current round, shrinking the denominator and inflating the
    // participation of the one person whose device failed them. A round that
    // already closed is not one they could play, so it is not counted either.
    const joinedAtRound = lifecycle.joinRoundFor({ room, recordedJoinRound: player.joinedAtRound });
    // EXTENDED TIME, from the student's own support profile, where the mode
    // allows it: a synchronized question round (their own deadline), or a
    // race with a set to finish — Graph the Line's Classic and Sprint — where
    // it comes after the class's buzzer and never counts in the race. Read at
    // every join, so a plan changed since the last game applies to this one.
    // Private: the student's record and their own invite. The room learns
    // only that someone has more time, never who
    // (liveChallengeAccommodations.mjs).
    const roomMode = modes.getChallengeMode(room.challengeMode);
    const supportProfile = gradeSnapshot.exists ? (gradeSnapshot.data()?.profile || null) : null;
    const extendedTimeAllowed = accommodations.extendedTimeRuleFor(roomMode) !== accommodations.EXTENDED_TIME_RULE.NONE;
    const timeMultiplier = extendedTimeAllowed ? accommodations.gameTimeMultiplierFor(supportProfile) : 1;
    // GRAPH THE LINE'S SLOPE HELPER, from the plan (a graphing aid turns it on
    // for this student alone). Private too: their record, handed only to
    // their own device with their items (getLineGraphRound).
    const lineRoom = roomMode.questionSource === modes.QUESTION_SOURCE.LINE_GRAPH_GENERATOR;
    // THE NAME ON THE BOARD, under the room's name setting as it stands in
    // this transaction. The teacher's device may still be applying the
    // setting (configureLiveChallengeExperience writes the room first, then
    // renames the seats that exist). A join that read the room before that
    // write commits before it, so the renaming finds this row. A join that
    // read it after gives the name here. A room that has not said keeps the
    // seat's alias (seatAliasUnder).
    const seat = experience.seatAliasUnder({
      room,
      student: gradeSnapshot.exists ? gradeSnapshot.data() || {} : {},
      studentId,
      player,
    });
    const joinedPlayer = {
      ...player,
      alias: seat.alias,
      codeAlias: seat.codeAlias,
      joined: true,
      joinedAtRound,
      timeMultiplier,
      ...(lineRoom ? { lineSlopeHelper: accommodations.planTurnsOnSlopeHelper(supportProfile) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };
    // Nothing about it reaches the room here: a room field that changed in
    // the same commit as this student's public row would name them. The room
    // learns only, when a round opens, whether anyone in it has extended time
    // (extendedTimeInPlay).
    const publicPlayerRef = roomRef.collection("players").doc(player.playerKey);
    // The same identity every time: the player key was fixed when the room
    // was created, so a reconnect can never mint a second player. The alias
    // follows the room's name setting (above).
    transaction.set(privatePlayerRef, joinedPlayer, { merge: true });
    transaction.set(publicPlayerRef, {
      playerKey: player.playerKey,
      // The seat of this player's rank in the standings snapshot. A room
      // created before seats has none; its snapshot seats players by key.
      ...(Number.isInteger(player.slot) ? { slot: player.slot } : {}),
      alias: seat.alias,
      joined: true,
      score: Math.max(0, Math.round(Number(player.score) || 0)),
      correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)),
      roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)),
      streak: Math.max(0, Math.round(Number(player.streak) || 0)),
      answeredRound: Number.isInteger(Number(player.answeredRound)) ? Number(player.answeredRound) : -1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(inviteRef, {
      status: room.status === lifecycle.SESSION_STATUS.RUNNING ? "running" : "joined",
      // The student's own round clock (1 = the class's). Only they read it.
      timeMultiplier,
      // The name their screen shows them as: the one on the board.
      alias: seat.alias,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { playerKey: player.playerKey, rejoined: player.joined === true, timeMultiplier };
  });

  return { roomId, joined: true, playerKey: joined.playerKey, rejoined: joined.rejoined, timeMultiplier: joined.timeMultiplier };
});

/*
 * THE HOST'S HEARTBEAT. A console calibrates its clock every 30 s while its
 * game is live; that call is how the server knows a host screen is still on
 * the game, so the sweep never ends results a teacher is talking through
 * (liveChallengeServerSweep.mjs). Written to the server-only private state —
 * nothing a student listens to — at most once a minute per room, and from
 * this instance's memory first, so four of a calibration's five samples skip
 * the read and the clock estimate (a median) is untouched. Never fails the
 * calibration.
 */
const liveChallengeHostHeardInInstance = new Map();
async function recordLiveChallengeHostHeard(request, roomId, nowMs) {
  try {
    const { serverSweep } = await liveChallengeEngine();
    const teacherEmail = callerEmail(request);
    const instanceKey = `${roomId}|${teacherEmail}`;
    if (!serverSweep.hostHeartbeatDue({ hostHeardAt: liveChallengeHostHeardInInstance.get(instanceKey) ?? null, nowMs })) return;
    if (liveChallengeHostHeardInInstance.size > 500) liveChallengeHostHeardInInstance.clear();
    liveChallengeHostHeardInInstance.set(instanceKey, nowMs);
    const privateRef = getFirestore().collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
    const privateSnapshot = await privateRef.get();
    if (!privateSnapshot.exists) return;
    const privateState = privateSnapshot.data() || {};
    if (privateState.teacherEmail !== teacherEmail && !authLib.isRootAdminEmail(teacherEmail)) return;
    if (!serverSweep.hostHeartbeatDue({ hostHeardAt: privateState.hostHeardAt ?? null, nowMs })) return;
    // update, not set: a finished game's private state, deleted meanwhile,
    // is never brought back.
    await privateRef.update({ hostHeardAt: new Date(nowMs) });
  } catch (error) {
    // NOT_FOUND: the game ended and its private state is gone.
    if (error?.code !== 5) {
      logger.warn("liveChallenge.hostHeard.failed", { roomId, message: error?.message || String(error) });
    }
  }
}

// A deliberately tiny calibration endpoint. Calling it several times lets the
// browser estimate offset/RTT without granting it any scoring authority.
exports.calibrateLiveChallengeClock = onCall(async (request) => {
  const isTeacher = request.auth?.token?.role === "teacher";
  const studentId = isTeacher ? null : requireStudent(request).studentId;
  if (isTeacher) await requireTeacher(request);
  const serverAt = Date.now();
  const roomId = String(request.data?.roomId || "").trim();
  if (isTeacher && roomId) await recordLiveChallengeHostHeard(request, roomId, serverAt);
  if (studentId && roomId && (request.data?.quality || request.data?.launchReport)) {
    const db = getFirestore();
    const privatePlayer = await db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).collection("players").doc(studentId).get();
    if (privatePlayer.exists && privatePlayer.data()?.playerKey) {
      // The game screen's heartbeat (shared/liveChallengePresence.mjs): its
      // quality, which tabs/devices it is on, and whether it is back after a
      // silence — read and written together so two tabs' reports never drop
      // each other. The device map is replaced, not merged, so a session
      // aged out of it really leaves.
      const presence = await import("./shared/liveChallengePresence.mjs");
      const launchDiagnostics = await import("./shared/liveChallengeLaunchDiagnostics.mjs");
      const diagnosticsRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId).collection("diagnostics").doc(privatePlayer.data().playerKey);
      await db.runTransaction(async (transaction) => {
        const previous = await transaction.get(diagnosticsRef);
        const previousData = previous.exists ? previous.data() || {} : {};
        const report = request.data?.quality ? presence.nextConnectionReport({
          previousHeardMs: toDate(previousData.connectionUpdatedAt)?.getTime() || null,
          previousSessions: previousData.sessions || null,
          quality: request.data.quality,
          sessionId: request.data.sessionId,
          nowMs: serverAt,
        }) : {};
        const launch = launchDiagnostics.nextLaunchDiagnostic(previousData, {
          report: request.data.launchReport,
          nowMs: serverAt,
        });
        // connectionUpdatedAt means "presence heartbeat heard" throughout the
        // teacher roster. A launch-only diagnostic must not make an offline
        // student look connected.
        const fields = {
          ...report,
          ...launch,
          ...(request.data?.quality ? { connectionUpdatedAt: FieldValue.serverTimestamp() } : {}),
        };
        transaction.set(diagnosticsRef, fields, { mergeFields: Object.keys(fields) });
      });
    }
  }
  return { serverAt };
});

/*
 * THE TEACHER'S ROSTER FOR A ROOM: player key -> student name.
 *
 * The public player rows are anonymous by design (code names by default), so
 * a teacher running a game could not tell who had not joined, whose device had
 * gone quiet, or who was signed in twice. This read-only callable gives the
 * room's own teacher the names for their CONSOLE — never the projector — and
 * nothing else: no student ids, no scores (the public rows carry those).
 *
 * After the game. A finished room's private state is deleted by its effects,
 * which used to leave the roster empty — so the final standings, the moment a
 * teacher most wants to know who "Algebra Hawk 91" is, showed game names only,
 * and a refresh lost the names for good. The durable match result (server-only,
 * written in the finishing transaction) still knows who played under which
 * key, so the roster is read from it then.
 */
exports.getLiveChallengeHostRoster = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  await requireOwnedChallenge(db, request, roomId);
  let players = await loadPrivateChallengePlayers(db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId));
  if (!players.length) {
    const result = await db.collection(LIVE_CHALLENGE_MATCH_RESULTS).doc(roomId).get();
    players = result.exists
      ? (Array.isArray(result.data()?.standings) ? result.data().standings : [])
        .filter((standing) => standing?.studentId && standing?.playerKey)
        .map((standing) => ({ studentId: String(standing.studentId), playerKey: standing.playerKey, alias: standing.alias, joined: standing.joined === true }))
      : [];
  }
  // Only players with a key can be shown, and the names are read for exactly
  // those, in the same order: filtering AFTER the read once paired every name
  // after a keyless record with the next student's.
  players = players.filter((player) => player.playerKey && player.studentId);
  if (!players.length) return { roomId, players: [] };
  const { experience } = await liveChallengeEngine();
  const identity = await studentIdentity();
  // Names only: the field mask keeps every player's attempt history out of
  // this read, exactly like the teacher roster projection.
  const grades = await db.getAll(
    ...players.map((player) => db.collection("grades").doc(player.studentId)),
    { fieldMask: [...identity.STUDENT_IDENTITY_FIELDS, "profile", "sisStudentId"] },
  );
  return {
    roomId,
    players: players
      .map((player, index) => ({
        playerKey: String(player.playerKey),
        name: experience.displayAliasForStudent({
          // With its id, so a name field holding the student's own id is never
          // shown as the student's name.
          student: { ...(grades[index]?.exists ? grades[index].data() || {} : {}), studentId: String(player.studentId || "") },
          mode: "fullName",
          codeAlias: identity.STUDENT_NAME_UNAVAILABLE,
        }),
        alias: String(player.alias || ""),
        joined: player.joined === true,
      })),
  };
});

exports.startLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const engine = await liveChallengeEngine();
  const { lifecycle } = engine;
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);

  const precheck = lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.START, room });
  if (precheck.outcome === lifecycle.LIFECYCLE_OUTCOME.ALREADY_APPLIED) return liveChallengeRoundResponse(roomId, room, { alreadyApplied: true });
  if (precheck.outcome === lifecycle.LIFECYCLE_OUTCOME.REJECT) throw lifecycleHttpsError(precheck);
  const joinedSnapshot = await roomRef.collection("players").limit(1).get();
  if (joinedSnapshot.empty) throw new HttpsError("failed-precondition", "At least one student must join before the challenge starts.");
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privateSnapshot = await privateRef.get();
  if (!privateSnapshot.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
  const opening = await prepareLiveChallengeRoundOpening(db, {
    roomId, room, privateState: privateSnapshot.data() || {}, roundIndex: 0,
  });

  const outcome = await db.runTransaction(async (transaction) => {
    const [roomSnapshot, latestPrivate, latestJoined, privatePlayers] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(privateRef),
      transaction.get(roomRef.collection("players").limit(1)),
      transaction.get(privateRef.collection("players")),
    ]);
    if (!roomSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge no longer exists.");
    if (!latestPrivate.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
    const currentRoom = roomSnapshot.data() || {};
    const plan = lifecycle.planLifecycleCommand({
      command: lifecycle.LIFECYCLE_COMMAND.START, room: currentRoom, joinedCount: latestJoined.size,
    });
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.ALREADY_APPLIED) return { alreadyApplied: true, room: currentRoom };
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.REJECT) throw lifecycleHttpsError(plan);
    return {
      opened: applyLiveChallengeRoundOpening(transaction, {
        engine, challenge, roomRef, privateRef, room: currentRoom, privateState: latestPrivate.data() || {}, opening, nowMs: Date.now(),
        players: playersFromSnapshot(privatePlayers),
      }),
    };
  });
  if (outcome.alreadyApplied) return liveChallengeRoundResponse(roomId, outcome.room, { alreadyApplied: true });

  const players = await loadPrivateChallengePlayers(privateRef);
  await updateLiveChallengeInvitesForRoom(db, {
    roomId,
    studentIds: players.map((player) => player.studentId),
    fields: { status: "running", updatedAt: FieldValue.serverTimestamp() },
  });
  return outcome.opened;
});

/*
 * CLOSE THE CURRENT ROUND WITHOUT OPENING THE NEXT ONE.
 *
 * The explicit roundActive -> roundResults transition: rank the round, persist
 * its private and anonymous public result and, under a placement strategy,
 * award its placement points. Safe to call from several host devices when the
 * buzzer sounds: the first closes it, the rest find it closed. The standard
 * Next Round button does close-and-open in one step through advance; this is
 * the seam a host that shows round results between rounds uses.
 */
exports.closeLiveChallengeRound = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  return closeLiveChallengeRoundForRoom(db, {
    roomRef, expected: expectedRoundFromRequest(request.data, room), force: request.data?.force === true,
  });
});

/**
 * The close itself, for the host's command and for the server's own close of
 * an overdue round (closeOverdueLiveChallengeRounds): one transaction, so a
 * console and the sweep arriving together close the round once and the other
 * is told it is already closed.
 */
async function closeLiveChallengeRoundForRoom(db, { roomRef, expected, force = false }) {
  const roomId = roomRef.id;
  const challenge = await liveChallengeRules();
  const engine = await liveChallengeEngine();
  const { lifecycle } = engine;
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);

  const outcome = await db.runTransaction(async (transaction) => {
    const [roomSnapshot, latestPrivate, latestPlayers] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(privateRef),
      transaction.get(privateRef.collection("players")),
    ]);
    if (!roomSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge no longer exists.");
    const currentRoom = roomSnapshot.data() || {};
    const players = playersFromSnapshot(latestPlayers);
    const nowMs = Date.now();
    const counts = liveChallengeRoundCompletion(engine, currentRoom, players, nowMs);
    const plan = lifecycle.planLifecycleCommand({
      command: lifecycle.LIFECYCLE_COMMAND.CLOSE_ROUND,
      room: currentRoom,
      expected,
      joinedCount: counts.joinedCount,
      completedCount: counts.completedCount,
      extendedPendingCount: counts.extendedPendingCount,
      nowMs,
      force,
    });
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.ALREADY_APPLIED) return { alreadyApplied: true, room: currentRoom };
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.REJECT) return refuseLiveChallengeRoundCommand(transaction, { roomRef, room: currentRoom, plan });
    // As in advance: a close that raced a Finish is answered from the room.
    if (!latestPrivate.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
    const privateState = latestPrivate.data() || {};
    const { roundResult, players: roundPlayers, standingsAfterRound } = applyLiveChallengeRoundClose(transaction, {
      engine, roomRef, privateRef, room: currentRoom, privateState, players, roundIndex: plan.roundIndex, nowMs,
    });
    // The worked solution, now that nobody can answer this round (held while
    // a Second Chance replay of it may still come).
    applyLiveChallengeSolutionReveals(transaction, {
      engine,
      roomRef,
      room: currentRoom,
      privateState,
      rounds: liveChallengeRevealableRounds({
        challenge, engine, room: currentRoom, privateState, players: roundPlayers, closedThrough: plan.roundIndex,
      }),
      nowMs,
      players: roundPlayers,
    });
    // Every screen's standings, exact as of the close.
    writeExactStandingsProjection(transaction, {
      engine,
      roomRef,
      room: { ...currentRoom, roundState: lifecycle.ROUND_STATE.CLOSED },
      kind: engine.standings.PROJECTION_KIND.ROUND_CLOSED,
      standings: standingsAfterRound,
      nowMs,
      source: "roundClose",
    });
    transaction.set(roomRef, {
      roundState: lifecycle.ROUND_STATE.CLOSED,
      phase: "results",
      roundClosedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(privateRef, {
      roundState: lifecycle.ROUND_STATE.CLOSED,
      // Results nobody moves on from, with no host screen heard, end the
      // game (liveChallengeServerSweep.mjs).
      serverSweepDueAt: liveChallengeSweepDate(engine.serverSweep.sweepDueAfterCloseMs({ nowMs })),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { roundResult: engine.results.publicRoundSummary(roundResult) };
  });
  if (outcome.refused) throw lifecycleHttpsError(outcome.refused);
  if (outcome.alreadyApplied) return liveChallengeRoundResponse(roomId, outcome.room, { alreadyApplied: true });
  return { roomId, roundIndex: outcome.roundResult.roundIndex, roundState: lifecycle.ROUND_STATE.CLOSED, roundResult: outcome.roundResult };
}

/*
 * THE SERVER CLOSES WHAT NO HOST SCREEN CLOSES (liveChallengeServerSweep.mjs).
 *
 * Every minute: the rooms whose private state says they are due. An open
 * round past its deadline (plus a grace no open console ever reaches) is
 * closed by the console's own close; results, or a Pace Race round, with no
 * host screen heard for the host-away window are ended by the console's own
 * Finish, which writes the match result, standings and rewards once; a lobby
 * nobody started, with no host heard for as long, is cancelled by the
 * console's own Cancel Session (N73). Each decision is re-checked inside the
 * command's own transaction, so a console, a retry or a second run arriving
 * at the same moment changes nothing twice.
 */
async function sweepLiveChallengeRoom(db, privateDoc, nowMs, settings) {
  const engine = await liveChallengeEngine();
  const { serverSweep, lifecycle } = engine;
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(privateDoc.id);
  const roomSnapshot = await roomRef.get();
  const room = roomSnapshot.exists ? roomSnapshot.data() || {} : null;
  const privateState = privateDoc.data() || {};
  const plan = serverSweep.planServerSweep({ room, privateState, nowMs, settings });
  const seenDueMs = toDate(privateState.serverSweepDueAt)?.getTime() ?? null;
  // Moves this room's due time only if nothing (a close, an opening, another
  // run) has moved it since this run read it. A move that fails pushes the
  // room back instead — still only if the document is exactly as this run's
  // query read it — so a room that cannot be written never holds the batch
  // every minute, and a fresh due time an opening just set is never lost.
  // Resolves to the outcome this run reports.
  const reschedule = (nextDueMs, outcome) => db.runTransaction(async (transaction) => {
    const latest = await transaction.get(privateDoc.ref);
    if (!latest.exists) return;
    if ((toDate(latest.data()?.serverSweepDueAt)?.getTime() ?? null) !== seenDueMs) return;
    transaction.update(privateDoc.ref, { serverSweepDueAt: liveChallengeSweepDate(nextDueMs) });
  }).then(() => outcome, async (error) => {
    logger.error("liveChallenge.serverSweep.rescheduleFailed", { roomId: privateDoc.id, message: error?.message || String(error) });
    await privateDoc.ref.update({
      serverSweepDueAt: liveChallengeSweepDate(nowMs + serverSweep.SERVER_RESCHEDULE_FAILURE_BACKOFF_MS),
    }, { lastUpdateTime: privateDoc.updateTime }).catch(() => {});
    return "backedOff";
  });

  if (plan.action === serverSweep.SWEEP_ACTION.CLEAR) return reschedule(null, "cleared");
  if (plan.action === serverSweep.SWEEP_ACTION.RESCHEDULE) return reschedule(plan.nextDueMs, "rescheduled");
  try {
    if (plan.action === serverSweep.SWEEP_ACTION.CLOSE) {
      const closed = await closeLiveChallengeRoundForRoom(db, { roomRef, expected: plan.expected });
      if (!closed.alreadyApplied) {
        logger.info("liveChallenge.serverClose", { roomId: roomRef.id, roundIndex: plan.expected.roundIndex });
      }
      return closed.alreadyApplied ? "alreadyClosed" : "closed";
    }
    // A lobby nobody started is cancelled — no round was played, so nothing
    // is finished or recorded (N73); anything else waiting on its host is
    // finished as End Game would finish it.
    const cancelling = plan.action === serverSweep.SWEEP_ACTION.CANCEL;
    const ending = cancelling
      ? { command: lifecycle.LIFECYCLE_COMMAND.CANCEL, status: lifecycle.SESSION_STATUS.CANCELLED }
      : { command: lifecycle.LIFECYCLE_COMMAND.FINISH, status: lifecycle.SESSION_STATUS.FINISHED };
    const finished = await finalizeLiveChallengeMatch(db, {
      roomRef,
      room,
      ...ending,
      // The switch is read again here, in the finish's own transaction: a
      // flip during a long run is honoured by the very next finish.
      stillWanted: async ({ transaction, room: latestRoom, privateState: latestPrivate }) => {
        const latestSwitch = await transaction.get(liveChallengeSweepSwitchRef(db, serverSweep));
        return serverSweep.stillAbandoned({
          room: latestRoom,
          privateState: latestPrivate,
          expected: plan.expected,
          nowMs: Date.now(),
          settings: serverSweep.sweepSettingsFrom(latestSwitch.exists ? latestSwitch.data() : null),
        });
      },
      endedBy: serverSweep.HOST_AWAY_ENDED_BY,
    });
    if (finished.skipped) {
      // The teacher came back (or moved on): look again after the window.
      await reschedule(nowMs + serverSweep.HOST_AWAY_FINISH_MS, "kept");
      return "kept";
    }
    if (cancelling) {
      if (!finished.alreadyApplied) logger.info("liveChallenge.serverCancel", { roomId: roomRef.id });
      return finished.alreadyApplied ? "alreadyCancelled" : "cancelled";
    }
    if (!finished.alreadyApplied) logger.info("liveChallenge.serverFinish", { roomId: roomRef.id, roundIndex: plan.expected.roundIndex });
    return finished.alreadyApplied ? "alreadyFinished" : "finished";
  } catch (error) {
    // The round is still running (a student with extended time is inside
    // their own deadline): look again soon. Anything else: back off.
    const stillRunning = error?.details?.lifecycle === lifecycle.LIFECYCLE_REJECTION.ROUND_IN_PROGRESS;
    if (!stillRunning) {
      logger.error("liveChallenge.serverSweep.failed", { roomId: roomRef.id, action: plan.action, message: error?.message || String(error) });
    }
    await reschedule(nowMs + (stillRunning ? serverSweep.SERVER_RECHECK_MS : serverSweep.SERVER_FAILURE_BACKOFF_MS), null);
    return stillRunning ? "stillRunning" : "failed";
  }
}

const liveChallengeSweepSwitchRef = (db, serverSweep) => db
  .collection(serverSweep.SWEEP_SETTINGS_COLLECTION)
  .doc(serverSweep.SWEEP_SETTINGS_FLAG);

async function sweepOverdueLiveChallengeRooms(db, { dueByMs, nowMs = Date.now() }) {
  const { serverSweep } = await liveChallengeEngine();
  // The switch, read on every run: off, the run does nothing (and says so).
  const switchSnapshot = await liveChallengeSweepSwitchRef(db, serverSweep).get();
  const settings = serverSweep.sweepSettingsFrom(switchSnapshot.exists ? switchSnapshot.data() : null);
  if (!settings.enabled) {
    logger.info("liveChallenge.serverSweep.disabled", { flag: `${serverSweep.SWEEP_SETTINGS_COLLECTION}/${serverSweep.SWEEP_SETTINGS_FLAG}` });
    return { scanned: 0, disabled: true, outcomes: {} };
  }
  // One single-field range: no composite index, and an idle minute is one read.
  // Only the two fields the sweep reads: never a room's questions or solutions.
  const due = await db.collection(LIVE_CHALLENGE_PRIVATE)
    .where("serverSweepDueAt", "<=", new Date(Math.min(dueByMs, nowMs)))
    .orderBy("serverSweepDueAt")
    .select("serverSweepDueAt", "hostHeardAt")
    .limit(serverSweep.SERVER_SWEEP_LIMIT)
    .get();
  const outcomes = {};
  for (const privateDoc of due.docs) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await sweepLiveChallengeRoom(db, privateDoc, nowMs, settings).catch((error) => {
      logger.error("liveChallenge.serverSweep.roomFailed", { roomId: privateDoc.id, message: error?.message || String(error) });
      return "failed";
    });
    outcomes[privateDoc.id] = outcome;
  }
  return { scanned: due.size, outcomes };
}

exports.closeOverdueLiveChallengeRounds = onSchedule({
  schedule: "every 1 minutes",
  invoker: "private",
  // One run at a time, with room for up to SERVER_SWEEP_LIMIT finishes and
  // their effects. A run that still overlapped the next would be safe —
  // every decision is re-checked in its command's transaction — only slower.
  maxInstances: 1,
  timeoutSeconds: 300,
}, async (event) => {
  // A run takes the rooms that were due by the time it was scheduled for
  // (a late run is no different); each room's decision uses the real now.
  const scheduledMs = Date.parse(event?.scheduleTime || "");
  const nowMs = Date.now();
  const result = await sweepOverdueLiveChallengeRooms(getFirestore(), {
    dueByMs: Number.isFinite(scheduledMs) ? scheduledMs : nowMs,
    nowMs,
  });
  if (result.scanned) logger.info("liveChallenge.serverSweep", result);
  return result;
});

exports.advanceLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const engine = await liveChallengeEngine();
  const { lifecycle } = engine;
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  const expected = expectedRoundFromRequest(request.data, room);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);

  // Cheap answers first: a stale double click, or a match that already ended.
  // The round's readiness is decided in the transaction with exact counts.
  const precheck = lifecycle.planLifecycleCommand({
    command: lifecycle.LIFECYCLE_COMMAND.ADVANCE, room, expected, force: true,
  });
  if (precheck.outcome === lifecycle.LIFECYCLE_OUTCOME.ALREADY_APPLIED) return liveChallengeRoundResponse(roomId, room, { alreadyApplied: true });
  if (precheck.outcome === lifecycle.LIFECYCLE_OUTCOME.REJECT) throw lifecycleHttpsError(precheck);

  // Plan the next round from an ordinary read and build its question here, so
  // the transaction below holds its locks only for the decision and the write.
  const [privateSnapshot, playersSnapshot] = await Promise.all([
    privateRef.get(),
    privateRef.collection("players").get(),
  ]);
  // No private state: the match may have finished since the read above, and
  // its effects deleted it. The transaction tells the two apart.
  const draft = privateSnapshot.exists ? planNextLiveChallengeRound({
    challenge, engine, room, privateState: privateSnapshot.data() || {}, players: playersFromSnapshot(playersSnapshot), roundIndex: expected.roundIndex,
  }) : null;
  const draftOpening = !draft || draft.finish ? null : await prepareLiveChallengeRoundOpening(db, {
    roomId, room, privateState: draft.privateState, roundIndex: draft.roundIndex,
  });

  const teacherKey = String(room.teacherEmail || "").trim().toLowerCase();
  const pointerRef = teacherKey ? db.collection(LIVE_CHALLENGE_TEACHER_ACTIVE).doc(teacherKey) : null;
  const outcome = await db.runTransaction(async (transaction) => {
    const [roomSnapshot, latestPrivate, latestPlayers, pointerSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(privateRef),
      transaction.get(privateRef.collection("players")),
      pointerRef ? transaction.get(pointerRef) : Promise.resolve(null),
    ]);
    if (!roomSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge no longer exists.");
    const currentRoom = roomSnapshot.data() || {};
    const players = playersFromSnapshot(latestPlayers);
    const nowMs = Date.now();
    const counts = liveChallengeRoundCompletion(engine, currentRoom, players, nowMs);
    // Everyone who joined has answered, or the authoritative deadline passed.
    const plan = lifecycle.planLifecycleCommand({
      command: lifecycle.LIFECYCLE_COMMAND.ADVANCE,
      room: currentRoom,
      expected,
      joinedCount: counts.joinedCount,
      completedCount: counts.completedCount,
      extendedPendingCount: counts.extendedPendingCount,
      nowMs,
    });
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.ALREADY_APPLIED) return { alreadyApplied: true, room: currentRoom };
    if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.REJECT) return refuseLiveChallengeRoundCommand(transaction, { roomRef, room: currentRoom, plan });
    // Required only by a command that changes the match: a press that raced a
    // Finish was answered above, from the room, even after the finished
    // match's effects deleted its private state.
    if (!latestPrivate.exists) throw new HttpsError("not-found", "The private challenge state is missing.");
    const privateState = latestPrivate.data() || {};

    let roundPlayers = players;
    let closedStandings = null;
    if (plan.closeCurrentRound) {
      const closed = applyLiveChallengeRoundClose(transaction, {
        engine, roomRef, privateRef, room: currentRoom, privateState, players, roundIndex: plan.roundIndex, nowMs,
      });
      roundPlayers = closed.players;
      closedStandings = closed.standingsAfterRound;
    }
    const next = planNextLiveChallengeRound({
      challenge, engine, room: currentRoom, privateState, players: roundPlayers, roundIndex: plan.roundIndex,
    });
    // Next Round closes this round and opens the next in one commit: every
    // screen's standings are the closed round's, exact, until the next round's
    // live snapshot (a round closed earlier already wrote its own). When the
    // match ends here instead, the finalization writes the final standings.
    if (closedStandings && !next.finish) {
      writeExactStandingsProjection(transaction, {
        engine,
        roomRef,
        room: { ...currentRoom, roundState: lifecycle.ROUND_STATE.CLOSED },
        kind: engine.standings.PROJECTION_KIND.ROUND_CLOSED,
        standings: closedStandings,
        nowMs,
        source: "roundClose",
      });
    }
    if (next.finish) {
      applyLiveChallengeMatchFinalization(transaction, {
        engine,
        db,
        roomRef,
        privateRef,
        pointerRef,
        pointsHere: Boolean(pointerSnapshot?.exists && pointerSnapshot.data()?.roomId === roomId),
        room: currentRoom,
        privateState,
        players: roundPlayers,
        status: lifecycle.SESSION_STATUS.FINISHED,
        nowMs,
      });
      return { finished: true };
    }
    // Solutions this close (or the replay plan it just made) released.
    applyLiveChallengeSolutionReveals(transaction, {
      engine,
      roomRef,
      room: currentRoom,
      privateState: next.privateState,
      rounds: liveChallengeRevealableRounds({
        challenge, engine, room: currentRoom, privateState: next.privateState, players: roundPlayers, closedThrough: plan.roundIndex,
      }),
      nowMs,
      players: roundPlayers,
    });
    // The drafted question is reused unless the transaction saw a different
    // next round (a late answer changed which question the class missed most).
    const opening = draftOpening && draftOpening.roundIndex === next.roundIndex && draftOpening.questionId === next.questionId
      ? draftOpening
      : await prepareLiveChallengeRoundOpening(db, { roomId, room: currentRoom, privateState: next.privateState, roundIndex: next.roundIndex });
    return {
      opened: applyLiveChallengeRoundOpening(transaction, {
        engine,
        challenge,
        roomRef,
        privateRef,
        room: currentRoom,
        privateState: next.privateState,
        privatePatch: next.privatePatch,
        opening,
        nowMs,
        players: roundPlayers,
      }),
    };
  });

  if (outcome.refused) throw lifecycleHttpsError(outcome.refused);
  if (outcome.alreadyApplied) return liveChallengeRoundResponse(roomId, outcome.room, { alreadyApplied: true });
  if (outcome.finished) {
    await runLiveChallengeFinalizationEffects(db, roomId).catch((error) => logger.error(
      "liveChallenge.finalization.effects.failed",
      { roomId, message: error?.message || String(error) },
    ));
    return { roomId, status: lifecycle.SESSION_STATUS.FINISHED, roundCount: Number(room.roundCount) || 0 };
  }
  return outcome.opened;
});

exports.finishLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const { lifecycle } = await liveChallengeEngine();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  return finalizeLiveChallengeMatch(db, {
    roomRef, room, command: lifecycle.LIFECYCLE_COMMAND.FINISH, status: lifecycle.SESSION_STATUS.FINISHED,
  });
});

exports.cancelLiveChallenge = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const { lifecycle } = await liveChallengeEngine();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  return finalizeLiveChallengeMatch(db, {
    roomRef, room, command: lifecycle.LIFECYCLE_COMMAND.CANCEL, status: lifecycle.SESSION_STATUS.CANCELLED,
  });
});

/*
 * LIVE STANDINGS FOR THE CLASS: ONE SNAPSHOT, AT MOST ONCE A SECOND.
 *
 * Students no longer listen to each other's player rows — every answer used
 * to be delivered to every screen, N × N per round. They listen to one
 * snapshot (liveChallengeStandingsProjection.mjs). Between a round's open and
 * its close, the host console — which listens to every row anyway — asks for
 * a fresh one when its board changes (standingsPublishPacer.js). This is that
 * request, and the server decides everything about it:
 *
 *   - only the room's teacher (or a root admin) may ask, and only while the
 *     room has live standings to show (a lobby, a running round — never an
 *     open Graph Feature Rush round, whose screens are on their own graphs);
 *   - the host asks at most once a second, and the server writes at most one
 *     snapshot every 750 ms (STANDINGS_MIN_PUBLISH_INTERVAL_MS: room for the
 *     publish's own duration; `retryAfterMs` says when to ask again), and
 *     none when nothing a screen shows changed — so no screen is woken for it;
 *   - the room and every public row are read in ONE read-only transaction:
 *     one consistent moment, and no lock that could make an answer wait;
 *   - ranked by the same engine ranking the host's board uses;
 *   - never over a later moment of the match (a round's exact close, the
 *     final standings): checked again in the transaction that writes it.
 *
 * An answer never waits on this, and a snapshot never changes a score.
 */
const liveStandingsWanted = (engine, room = {}) => {
  if (!["lobby", "running"].includes(room?.status)) return false;
  const questionSet = engine.modes.roundStructureFor(engine.modes.getChallengeMode(room.challengeMode)).id === engine.modes.ROUND_STRUCTURE.QUESTION_SET;
  return !(questionSet && room.status === "running" && room.roundState !== "closed");
};
const standingsPublishWaitMs = (standings, stored, nowMs) => (stored
  ? Math.max(0, standings.STANDINGS_MIN_PUBLISH_INTERVAL_MS - (nowMs - (Number(stored.publishedAtMs) || 0)))
  : 0);

async function publishLiveStandingsSnapshot(db, { roomRef, room }) {
  const engine = await liveChallengeEngine();
  const { standings } = engine;
  if (!liveStandingsWanted(engine, room)) return { published: false, reason: "not-live" };
  const ref = standingsProjectionRef(roomRef, standings);
  const storedSnapshot = await ref.get();
  const stored = storedSnapshot.exists ? (storedSnapshot.data() || {}) : null;
  if (stored?.kind === standings.PROJECTION_KIND.FINAL) return { published: false, reason: "final" };
  const wait = standingsPublishWaitMs(standings, stored, Date.now());
  if (wait > 0) return { published: false, reason: "too-soon", retryAfterMs: wait };

  const read = await db.runTransaction(async (transaction) => {
    const [roomSnapshot, playersSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(roomRef.collection("players")),
    ]);
    return {
      room: roomSnapshot.exists ? (roomSnapshot.data() || {}) : null,
      rows: playersSnapshot.docs.map((playerDoc) => ({ playerKey: playerDoc.id, ...playerDoc.data() })),
      readTime: playersSnapshot.readTime,
    };
  }, { readOnly: true });
  if (!read.room || !liveStandingsWanted(engine, read.room)) return { published: false, reason: "not-live" };
  const sourceReadMs = read.readTime.toMillis();
  const projection = standings.liveProjectionFromPublicRows({ roomId: roomRef.id, room: read.room, rows: read.rows, nowMs: sourceReadMs });
  const digest = standings.projectionDigest(projection);
  if (stored?.digest === digest) return { published: false, reason: "unchanged" };

  return db.runTransaction(async (transaction) => {
    const latestSnapshot = await transaction.get(ref);
    const latest = latestSnapshot.exists ? (latestSnapshot.data() || {}) : null;
    if (latest?.digest === digest) return { published: false, reason: "unchanged" };
    if (!standings.projectionMayReplace(latest, { ...projection, sourceReadMs })) return { published: false, reason: "superseded" };
    const nowMs = Date.now();
    const latestWait = standingsPublishWaitMs(standings, latest, nowMs);
    if (latestWait > 0) return { published: false, reason: "too-soon", retryAfterMs: latestWait };
    transaction.set(ref, {
      ...projection,
      digest,
      source: "host",
      sourceReadMs,
      publishedAt: FieldValue.serverTimestamp(),
      publishedAtMs: nowMs,
    });
    return { published: true, sourceReadMs, count: projection.count };
  });
}

exports.publishLiveChallengeStandings = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  return publishLiveStandingsSnapshot(db, { roomRef, room });
});

/*
 * THE END-OF-GAME RECAP (lib/liveChallengeRecap.js): a student's own rounds
 * with their worked solutions, their private personal bests and the
 * recognitions they earned — for a FINISHED match they were in, and nothing
 * about anyone else.
 */
exports.getLiveChallengeMatchRecap = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId || roomId.length > 200 || roomId.includes("/")) throw new HttpsError("invalid-argument", "roomId is required.");
  return liveChallengeRecap().buildLiveChallengeMatchRecap(getFirestore(), {
    roomId,
    studentId,
    fail: (code, message) => new HttpsError(code, message),
  });
});

/*
 * A FINISHED ROOM'S FINAL STANDINGS, REBUILT FROM ITS MATCH RESULT IF MISSING.
 *
 * The finishing transaction writes the final snapshot and each student's own
 * final place. A room that finished before either existed — or one whose
 * final snapshot could not be built, or is of a version the screens no longer
 * read (one that listed every seat's rank) — would leave a screen waiting for
 * its final place forever. Its own students and teacher may ask for it: the
 * server rebuilds what is missing from the durable match result (the same
 * standings the podium and rewards use) and writes it once. Asking again
 * changes nothing.
 */
exports.ensureLiveChallengeFinalStandings = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  let studentId = null;
  if (request.auth?.token?.role === "teacher") {
    await requireOwnedChallenge(db, request, roomId);
  } else {
    ({ studentId } = requireStudent(request));
    const invite = await db.collection(LIVE_CHALLENGE_INVITES).doc(studentId).get();
    if (!invite.exists || invite.data()?.roomId !== roomId) throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
  }
  const engine = await liveChallengeEngine();
  const { standings, playerSummary } = engine;
  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge no longer exists.");
  const room = roomSnapshot.data() || {};
  if (!["finished", "cancelled"].includes(room.status)) return { ensured: false, reason: "not-finished" };
  const ref = standingsProjectionRef(roomRef, standings);
  const finalIsCurrent = (snapshot) => snapshot.exists
    && snapshot.data()?.kind === standings.PROJECTION_KIND.FINAL
    && Number(snapshot.data()?.schemaVersion) === standings.STANDINGS_PROJECTION_SCHEMA_VERSION;
  // A student of a finished match also needs their own final place.
  const summaryRef = studentId && room.status === "finished" ? liveChallengePlayerSummaryRef(roomRef, engine, studentId) : null;
  const summaryIsCurrent = (snapshot) => !snapshot || Boolean(playerSummary.summaryFinal(snapshot.exists ? snapshot.data() : null, { roomId }));
  const [existing, existingSummary] = await Promise.all([ref.get(), summaryRef ? summaryRef.get() : Promise.resolve(null)]);
  if (finalIsCurrent(existing) && summaryIsCurrent(existingSummary)) return { ensured: true, existing: true };
  const resultSnapshot = await db.collection(LIVE_CHALLENGE_MATCH_RESULTS).doc(roomId).get();
  if (!resultSnapshot.exists) return { ensured: false, reason: "no-result" };
  const result = resultSnapshot.data() || {};
  const resultStandings = Array.isArray(result.standings) ? result.standings : [];
  return db.runTransaction(async (transaction) => {
    const [latest, latestSummary] = await Promise.all([transaction.get(ref), summaryRef ? transaction.get(summaryRef) : Promise.resolve(null)]);
    const projectionDone = finalIsCurrent(latest);
    const summariesDone = summaryIsCurrent(latestSummary);
    if (projectionDone && summariesDone) return { ensured: true, existing: true };
    const written = projectionDone || writeExactStandingsProjection(transaction, {
      engine,
      roomRef,
      room,
      kind: standings.PROJECTION_KIND.FINAL,
      standings: resultStandings,
      status: room.status,
      nowMs: Date.now(),
      source: "repair",
    });
    // Every player's own final place, from the same standings, in one commit.
    if (!summariesDone) writeLiveChallengeFinalSummaries(transaction, { engine, roomRef, standings: resultStandings, status: room.status });
    return written ? { ensured: true, repaired: true } : { ensured: false, reason: "unbuildable" };
  });
});

/**
 * The room's speed setting, which the scoring strategy applies natively.
 *
 * Rooms created before the setting lived on the room read the experience
 * document instead, and fall back to the platform default when the teacher
 * never changed it — exactly what the former post-hoc submit wrapper applied,
 * so no room scores differently across this change.
 */
async function liveChallengeSpeedInfluence(db, engine, roomId, room = {}) {
  if (room.speedInfluencePercent !== undefined && room.speedInfluencePercent !== null) {
    return engine.experience.normalizeSpeedInfluencePercent(room.speedInfluencePercent);
  }
  const snapshot = await db.collection(LIVE_CHALLENGE_EXPERIENCE).doc(roomId).get();
  return engine.experience.normalizeSpeedInfluencePercent(snapshot.exists ? snapshot.data()?.speedInfluencePercent : undefined);
}

/*
 * A PLAYER SAYING HOW FAR THEY HAVE GOT, MID-ROUND.
 *
 * This exists so the board moves while people are still working. It writes ONE
 * field group on the player's OWN public document — not the room document. That
 * distinction is the whole reason this is safe to call every second: the hot
 * document removed two releases ago was a single shared doc taking a write per
 * student per round, and Firestore's sustained write limit is per document.
 * Twenty-four students each writing their own doc is twenty-four documents.
 *
 * The client-visible provisional number remains display-only. Solver Race may
 * additionally attach raw algebra work. That work is re-instantiated and
 * graded here from the server-held question before a productive milestone can
 * become an authoritative receipt; the browser never supplies depth or points.
 */
exports.reportLiveChallengeProgress = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const engine = await liveChallengeEngine();
  const roomId = String(request.data?.roomId || "").trim();
  const roundIndex = Number(request.data?.roundIndex);
  if (!roomId || !Number.isInteger(roundIndex) || roundIndex < 0) {
    throw new HttpsError("invalid-argument", "roomId and roundIndex are required.");
  }

  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const [roomSnapshot, privateSnapshot, playerSnapshot, inviteSnapshot] = await Promise.all([
    roomRef.get(), privateRef.get(), privatePlayerRef.get(), inviteRef.get(),
  ]);
  if (!roomSnapshot.exists || !privateSnapshot.exists || !playerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge is no longer available.");
  if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) {
    throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
  }
  const room = roomSnapshot.data() || {};
  // A per-player mode reports its progress through its own attempts.
  if (engine.modes.getChallengeMode(room.challengeMode).questionIssue === engine.modes.QUESTION_ISSUE.PER_PLAYER) {
    return { recorded: false };
  }
  const privateState = privateSnapshot.data() || {};
  const player = playerSnapshot.data() || {};
  const requestedVersion = Number(request.data?.roundVersion);
  const requestedToken = String(request.data?.roundToken || "").trim();
  if (
    room.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING
    || engine.lifecycle.roomRoundState(room) !== engine.lifecycle.ROUND_STATE.OPEN
    || Number(room.currentRound) !== roundIndex
    || !Number.isInteger(requestedVersion)
    || Number(room.roundVersion || 0) !== requestedVersion
    || String(room.roundToken || "") !== requestedToken
  ) {
    // Not an error worth surfacing: the student simply moved on, or the teacher
    // advanced while a debounced report was in flight. Report nothing, quietly.
    return { recorded: false };
  }
  if (!player.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before playing.");
  // Nothing to publish once the round is really answered — the banked score is
  // authoritative from then on.
  if (Number(player.answeredRound) === roundIndex) return { recorded: false };

  const rawProgress = request.data?.responsePayload?.raw;
  let secureMilestone = null;
  const secondChance = Object.prototype.hasOwnProperty.call(privateState.secondChanceOf || {}, String(roundIndex));
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  const scoringStrategyId = engine.scoring.roomScoringStrategyId(room);
  const perRoundScoring = engine.scoring.getScoringStrategy(scoringStrategyId).accumulation
    === engine.scoring.SCORE_ACCUMULATION.PER_ROUND;
  // WHAT THE WORK IS WORTH, NOT WHAT THE BROWSER SAYS (LC01). The number is a
  // share of full credit the student's own device reports; the board gets what
  // this room's scoring would pay for that work if the answer were graded now,
  // so a replay round (which pays only a fully correct answer) or a Correct
  // Count game never shows work in progress as points the round cannot award.
  const claimedCredit = Math.max(
    0,
    Math.min(challenge.LIVE_PROVISIONAL_MAX_POINTS, Math.round(Number(request.data?.provisionalPoints) || 0)),
  ) / challenge.LIVE_PROVISIONAL_MAX_POINTS;
  const provisionalPoints = engine.scoring.provisionalWorth({ strategyId: scoringStrategyId, credit: claimedCredit, secondChance });
  let speedInfluencePercent = null;
  // Only a mode that declares productive milestones banks speed mid-round.
  if (rawProgress && mode.capabilities.progressMilestones && !secondChance) {
    speedInfluencePercent = await liveChallengeSpeedInfluence(db, engine, roomId, room);
    const questionId = privateState.questionIds?.[roundIndex];
    const privateAuthored = privateState.roundQuestions?.[roundIndex] || null;
    const questionSnapshot = !privateAuthored && questionId ? await db.collection("pathQuestionBank").doc(questionId).get() : null;
    if (privateAuthored || questionSnapshot?.exists) {
      const authored = privateAuthored || questionSnapshot.data() || {};
      const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
      const plan = instantiated.question ? await mathPath.buildIssuePlan(instantiated.question) : null;
      if (plan?.issuable && plan.privateGrading?.pathToolId === "stepAlgebra") {
        const grading = await mathPath.gradePathToolResponse(plan.privateGrading, { raw: rawProgress });
        if (!grading?.rejected) {
          const expectedDepth = Math.max(1, Number(authored.solutionDepth) || 1);
          const productiveDepth = Math.max(0, Math.min(expectedDepth,
            Number(grading?.productiveDepth) || challenge.productiveDepthFromSecureGrade({
              gradeScore: grading?.score,
              expectedDepth,
              isCorrect: grading?.isCorrect === true,
            })));
          const normalizedState = String(rawProgress.finalRelation || rawProgress.finalEquation || "")
            .trim().replace(/\s+/g, " ");
          const stateHash = normalizedState
            ? crypto.createHash("sha256").update(normalizedState).digest("hex")
            : "";
          const startsAtMs = toDate(room.startsAt || room.roundStartedAt)?.getTime() || Date.now();
          const totalMs = challenge.normalizeRoundSeconds(room.activeRoundSeconds || room.roundSeconds) * 1000;
          secureMilestone = {
            productiveDepth, expectedDepth, stateHash,
            elapsedMs: Math.min(totalMs, Math.max(0, Date.now() - startsAtMs)), totalMs,
            validated: productiveDepth > 0,
          };
        }
      }
    }
  }

  const publicPlayerRef = roomRef.collection("players").doc(String(player.playerKey));
  const outcome = await db.runTransaction(async (transaction) => {
    const [latestRoomSnapshot, latestPlayerSnapshot] = await Promise.all([
      transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!latestRoomSnapshot.exists || !latestPlayerSnapshot.exists) return { recorded: false, milestoneSpeedPoints: 0 };
    const latestRoom = latestRoomSnapshot.data() || {};
    const latestPlayer = latestPlayerSnapshot.data() || {};
    if (
      latestRoom.status !== challenge.LIVE_CHALLENGE_STATUS.RUNNING
      || engine.lifecycle.roomRoundState(latestRoom) !== engine.lifecycle.ROUND_STATE.OPEN
      || Number(latestRoom.currentRound) !== roundIndex
      || Number(latestRoom.roundVersion || 0) !== requestedVersion
      || String(latestRoom.roundToken || "") !== requestedToken
      || Number(latestPlayer.answeredRound) === roundIndex
      // Only inside the round's own window, like an answer: progress "made"
      // during the 3-2-1 (the question is in the room before startsAt) was
      // paid a milestone's full speed.
      || !engine.timer.timerAcceptsArrival(engine.timer.timerFromRoom(latestRoom), Date.now()).accepted
    ) return { recorded: false, milestoneSpeedPoints: 0 };

    const milestone = challenge.applyProductiveMilestoneAward({
      player: latestPlayer,
      roundIndex,
      roundVersion: requestedVersion,
      secureMilestone,
      secondChance,
      // Milestone speed is speed: it honours the room's setting like the final answer does.
      speedInfluencePercent,
    });
    // Banked milestone points are raw round performance. Under a placement
    // strategy they rank the round; only the round's placement changes the
    // championship score.
    const scoreFields = milestone.accepted
      ? (perRoundScoring ? { rawScore: milestone.totalScore } : { score: milestone.totalScore, rawScore: milestone.totalScore })
      : {};

    transaction.set(privatePlayerRef, {
      ...(milestone.accepted ? {
        challengeMilestoneProgress: milestone.challengeMilestoneProgress,
        submissionReceipts: milestone.submissionReceipts,
        ...scoreFields,
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(publicPlayerRef, {
      provisionalPoints,
      provisionalRound: roundIndex,
      ...scoreFields,
      provisionalAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
      recorded: true,
      provisionalPoints,
      milestoneAccepted: milestone.accepted,
      milestoneSpeedPoints: milestone.speedPoints,
      productiveDepth: milestone.productiveDepth || 0,
      totalScore: milestone.accepted && !perRoundScoring ? milestone.totalScore : Math.max(0, Number(latestPlayer.score) || 0),
      duplicate: milestone.duplicate,
    };
  });

  return outcome;
});

async function maybeCompressLiveChallengeRoundAfterThreshold(db, { roomRef, roundIndex, roundVersion }) {
  const challenge = await liveChallengeRules();
  // Aggregation queries avoid re-reading every player document and avoid the
  // shared per-answer counter hotspot that Live Challenge intentionally removed.
  const [joinedAggregate, answeredAggregate] = await Promise.all([
    roomRef.collection("players").where("joined", "==", true).count().get(),
    roomRef.collection("players").where("answeredRound", "==", Number(roundIndex)).count().get(),
  ]);
  const joinedCount = Number(joinedAggregate.data()?.count) || 0;
  const answeredCount = Number(answeredAggregate.data()?.count) || 0;
  if (!joinedCount) return { compressed: false };

  const roomSnapshot = await roomRef.get();
  const roomAtCount = roomSnapshot.exists ? (roomSnapshot.data() || {}) : {};
  const decision = challenge.roundClosingDecision({ joinedCount, answeredCount, threshold: roomAtCount.roundClosingThreshold });
  const { thresholdCount } = decision;
  if (!decision.shouldClose) return { compressed: false, ...decision };
  // Already closing (another answer got there first), or nothing left to
  // shorten: answer from this read, without a transaction on the room.
  if (!challenge.roundCompressionMayApply(roomAtCount, Date.now())) return { compressed: false, ...decision };

  // ONE WRITER, NO TRANSACTION. Every answer that crossed the threshold at the
  // same instant reaches this point, and each used to open a read-then-write
  // transaction on the room: they aborted one another and retried with
  // backoff, and the class waited 2-4 s for its feedback. The write is instead
  // conditional on the room being exactly as read above — the same atomicity,
  // checked by Firestore — so the first answer shortens the clock and every
  // other one is refused at once (the room has changed) and moves on.
  if (
    !roomSnapshot.exists
    || roomAtCount.status !== "running"
    // A closed round's clock is over; nothing is left to compress.
    || roomAtCount.roundState === "closed"
    || Number(roomAtCount.currentRound) !== Number(roundIndex)
    || Number(roomAtCount.roundVersion || 0) !== Number(roundVersion || 0)
  ) return { compressed: false, answeredCount, joinedCount, thresholdCount };
  const targetEndsAtMs = Date.now() + 5000;
  const currentEndsAtMs = toDate(roomAtCount.endsAt || roomAtCount.roundEndsAt)?.getTime() || 0;
  const paceMode = challenge.normalizeChallengeTimingMode(roomAtCount.timingMode) === "pace";
  if (!paceMode && (!currentEndsAtMs || currentEndsAtMs <= targetEndsAtMs)) return { compressed: false, answeredCount, joinedCount, thresholdCount };

  const shortenedEndsAt = new Date(targetEndsAtMs);
  let compressed = false;
  try {
    await roomRef.update({
      endsAt: shortenedEndsAt,
      roundEndsAt: shortenedEndsAt,
      roundCompressionReason: `${decision.threshold}-percent-answered`,
      closingThreshold: decision.threshold,
      closingStartedAt: FieldValue.serverTimestamp(),
      roundCompressedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { lastUpdateTime: roomSnapshot.updateTime });
    compressed = true;
  } catch (error) {
    // FAILED_PRECONDITION: the room changed since it was read — another answer
    // already started the closing countdown, or the round moved on.
    if (error?.code !== 9 && !/FAILED_PRECONDITION|precondition/i.test(String(error?.message || ""))) throw error;
  }
  if (compressed) {
    // The new deadline is when the server closes it if no host screen does —
    // the first deadline a Pace Race round has.
    const { serverSweep } = await liveChallengeEngine();
    await getFirestore().collection(LIVE_CHALLENGE_PRIVATE).doc(roomRef.id).update({
      serverSweepDueAt: liveChallengeSweepDate(serverSweep.sweepDueAfterOpeningMs({ endsAtMs: targetEndsAtMs })),
    }).catch((error) => logger.warn("liveChallenge.compress.sweepDue.failed", { roomId: roomRef.id, message: error?.message || String(error) }));
  }

  return { compressed, answeredCount, joinedCount, thresholdCount };
}

exports.updateLiveChallengePacing = onCall(async (request) => {
  const roomId = String(request.data?.roomId || "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId is required.");
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const { roomRef, room } = await requireOwnedChallenge(db, request, roomId);
  // A mode without a closing threshold (a timed rush) has no early close.
  const { modes } = await liveChallengeEngine();
  if (!modes.getChallengeMode(room.challengeMode).capabilities.closingThreshold) {
    return { roomId, roundClosingThreshold: null };
  }
  const roundClosingThreshold = challenge.normalizeRoundClosingThreshold(request.data?.roundClosingThreshold);
  await roomRef.set({ roundClosingThreshold, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (room.status === challenge.LIVE_CHALLENGE_STATUS.RUNNING) {
    await maybeCompressLiveChallengeRoundAfterThreshold(db, {
      roomRef,
      roundIndex: Number(room.currentRound),
      roundVersion: Number(room.roundVersion),
    });
  }
  return { roomId, roundClosingThreshold };
});

// A device's answer id: the alphabet of a UUID, never a server receipt key.
const LIVE_CHALLENGE_SUBMISSION_ID = /^[A-Za-z0-9_-]{1,100}$/;

// What a student reads when an answer arrives outside its round's window: an
// answer sent before GO is told to wait for GO, one sent while the teacher had
// the round paused that it is kept until the round resumes (LC06: it read
// "Time was up"), a late one that time was up. The reason rides in the
// details, so the device can tell these from its own request timing out.
const LIVE_CHALLENGE_ARRIVAL_WORDS = Object.freeze({
  round_not_started: "This round has not started yet. Wait for GO, then answer.",
  round_paused: "Your teacher paused the round. Your locked answer is kept and goes when the round resumes.",
});
const liveChallengeArrivalRefusal = (arrival) => new HttpsError(
  "deadline-exceeded",
  LIVE_CHALLENGE_ARRIVAL_WORDS[arrival?.reason] || "Time was up before your answer arrived, so it was not counted.",
  { reason: arrival?.reason || null },
);

// A round whose question can no longer be rebuilt cannot check answers. Rare
// (the question was deleted mid-game); the student is told what happens next.
const LIVE_CHALLENGE_QUESTION_UNAVAILABLE = "This round's question could not be checked, so answers to it are not counted. Your teacher can move on to the next round.";

exports.submitLiveChallengeResponse = onCall(async (request) => {
  const requestArrivedAt = Date.now();
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const challenge = await liveChallengeRules();
  const parity = await import("./shared/liveChallengeParity.mjs");
  const engine = await liveChallengeEngine();
  const { lifecycle, responses, timer: roundTimer } = engine;
  const roomId = String(request.data?.roomId || "").trim();
  const submittedRound = Number(request.data?.roundIndex);
  // Omission remains accepted during the rolling Hosting/Functions deploy;
  // current clients always send all three protocol fields.
  const submissionId = String(request.data?.submissionId || `legacy-${crypto.randomUUID()}`).trim();
  const requestedVersion = request.data?.roundVersion == null ? null : Number(request.data.roundVersion);
  const requestedToken = request.data?.roundToken == null ? null : String(request.data.roundToken).trim();
  // The id keys this answer's receipt in the student's own receipt log, beside
  // keys the SERVER writes (`milestone:<version>:<depth>`). An id shaped like
  // one of those overwrote a server receipt — "answering" round 0 with id
  // `milestone:2:1` let a later progress report erase a wrong answer from the
  // record the Strong Accuracy reward reads. Honest devices send UUIDs.
  if (!roomId || !Number.isInteger(submittedRound) || submittedRound < 0 || (requestedVersion != null && !Number.isInteger(requestedVersion)) || !LIVE_CHALLENGE_SUBMISSION_ID.test(submissionId)) {
    throw new HttpsError("invalid-argument", "roomId, roundIndex, roundVersion, and submissionId are required.");
  }

  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const [roomSnapshot, privateSnapshot, playerSnapshot, inviteSnapshot] = await Promise.all([
    roomRef.get(), privateRef.get(), privatePlayerRef.get(), inviteRef.get(),
  ]);
  if (!roomSnapshot.exists || !privateSnapshot.exists || !playerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge is no longer available.");
  if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
  const room = roomSnapshot.data() || {};
  const roomMode = engine.modes.getChallengeMode(room.challengeMode);
  if (roomMode.questionIssue === engine.modes.QUESTION_ISSUE.PER_PLAYER) {
    throw new HttpsError("failed-precondition", `${roomMode.label} is played on its own game screen, not by submitting an answer.`);
  }
  const submittedVersion = requestedVersion ?? Number(room.roundVersion || 0);
  const submittedToken = requestedToken ?? String(room.roundToken || "");
  const expectedRound = { roundIndex: submittedRound, roundVersion: submittedVersion, roundToken: submittedToken };
  const privateState = privateSnapshot.data() || {};
  const currentPlayer = playerSnapshot.data() || {};
  const priorReceipt = currentPlayer.submissionReceipts?.[submissionId];
  if (priorReceipt) return { ...priorReceipt, duplicate: true };
  // The session is running, this is its current round and version, and the
  // round is still open.
  const submitPlan = lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.SUBMIT, room, expected: expectedRound });
  if (submitPlan.outcome !== lifecycle.LIFECYCLE_OUTCOME.APPLY) throw new HttpsError("failed-precondition", submitPlan.message);
  // A student with extended time answers against their own deadline
  // (liveChallengeAccommodations.mjs); everyone else against the room's.
  const initialArrival = roundTimer.timerAcceptsArrival(
    engine.accommodations.personalRoundTimer(roundTimer.timerFromRoom(room), currentPlayer.timeMultiplier, {
      fullDurationMs: engine.accommodations.roomFullRoundMs(room),
    }),
    requestArrivedAt,
  );
  if (!initialArrival.accepted) throw liveChallengeArrivalRefusal(initialArrival);
  if (!currentPlayer.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before answering.");
  // The response model decides whether this question can take another
  // attempt. A classic round is one question completed by one response:
  // "you already answered this round".
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  const questionSpec = engine.modes.roundQuestionSpecsFor(mode)[0];
  const attemptPlanFor = (player) => responses.planAttempt({
    receipts: player.submissionReceipts || {}, roundIndex: submittedRound, questionIndex: 0, spec: questionSpec, attemptId: submissionId,
  });
  if (Number(currentPlayer.answeredRound) === submittedRound || attemptPlanFor(currentPlayer).decision === responses.ATTEMPT_DECISION.REJECT) {
    throw new HttpsError("already-exists", "You already answered this round.");
  }
  const speedInfluencePercent = await liveChallengeSpeedInfluence(db, engine, roomId, room);

  const questionId = privateState.questionIds?.[submittedRound];
  const privateAuthored = privateState.roundQuestions?.[submittedRound] || null;
  const questionSnapshot = !privateAuthored && questionId ? await db.collection("pathQuestionBank").doc(questionId).get() : null;
  if (!privateAuthored && !questionSnapshot?.exists) throw new HttpsError("failed-precondition", LIVE_CHALLENGE_QUESTION_UNAVAILABLE);
  const authored = privateAuthored || questionSnapshot.data() || {};
  const seedKey = `challenge|${roomId}|${submittedRound}|${questionId}`;
  const instantiated = await mathPath.instantiateQuestion(authored, seedKey);
  if (!instantiated.question) throw new HttpsError("failed-precondition", LIVE_CHALLENGE_QUESTION_UNAVAILABLE);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  if (!plan.issuable) throw new HttpsError("failed-precondition", LIVE_CHALLENGE_QUESTION_UNAVAILABLE);
  const grading = await mathPath.gradePathToolResponse(plan.privateGrading, request.data?.responsePayload || {});
  if (grading?.rejected) throw new HttpsError("failed-precondition", grading.reason || "The response could not be graded.");

  let finalPlayer = null;
  let finalScore = null;
  let duplicateReceipt = null;
  let scoringStrategyId = null;
  // The room as the committing attempt read it: what the pacing check below needs.
  let roomAtSubmit = null;
  await db.runTransaction(async (transaction) => {
    const [latestRoomSnapshot, latestPlayerSnapshot] = await Promise.all([
      transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!latestRoomSnapshot.exists || !latestPlayerSnapshot.exists) throw new HttpsError("not-found", "That Live Challenge ended before the response could be saved.");
    const latestRoom = latestRoomSnapshot.data() || {};
    roomAtSubmit = latestRoom;
    const player = latestPlayerSnapshot.data() || {};
    if (player.submissionReceipts?.[submissionId]) {
      duplicateReceipt = player.submissionReceipts[submissionId];
      return;
    }
    const latestPlan = lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.SUBMIT, room: latestRoom, expected: expectedRound });
    if (latestPlan.outcome !== lifecycle.LIFECYCLE_OUTCOME.APPLY) throw new HttpsError("failed-precondition", latestPlan.message);
    const latestTimer = roundTimer.timerFromRoom(latestRoom);
    const latestEndsAtMs = latestTimer.endsAtMs || 0;
    const latestStartsAtMs = latestTimer.startsAtMs || 0;
    const nowMs = Date.now();
    const arrival = roundTimer.timerAcceptsArrival(
      engine.accommodations.personalRoundTimer(latestTimer, player.timeMultiplier, {
        fullDurationMs: engine.accommodations.roomFullRoundMs(latestRoom),
      }),
      requestArrivedAt,
    );
    if (!arrival.accepted) throw liveChallengeArrivalRefusal(arrival);
    if (!player.joined) throw new HttpsError("failed-precondition", "Join the Live Challenge before answering.");
    if (Number(player.answeredRound) === submittedRound || attemptPlanFor(player).decision === responses.ATTEMPT_DECISION.REJECT) {
      throw new HttpsError("already-exists", "You already answered this round.");
    }
    if (!player.playerKey) throw new HttpsError("failed-precondition", "Your Live Challenge player record is incomplete.");

    // Which original round this one replays, if any. Held privately so the
    // round list a student can read never reveals which questions the class
    // struggled with before they have answered them.
    const secondChanceOf = privateState?.secondChanceOf?.[String(submittedRound)];
    const isSecondChance = Number.isInteger(Number(secondChanceOf));
    const missedRounds = Array.isArray(player.missedRounds) ? player.missedRounds.map(Number) : [];
    const missedOriginally = isSecondChance && missedRounds.includes(Number(secondChanceOf));

    // AN ACCOMMODATION MUST NOT COST POINTS. A student with extended time is
    // scored for speed against their own round — its length times their
    // multiplier, to their own deadline — so a correct answer at 17 s of
    // their 22.5 s earns what a classmate's at 11 s of 15 s does, never the
    // "time expired" tier of the class's clock.
    const timeMultiplier = engine.accommodations.storedTimeMultiplier(player.timeMultiplier);
    const activeRoundMs = Math.round(challenge.normalizeRoundSeconds(
      latestRoom.activeRoundSeconds || latestRoom.roundSeconds,
    ) * 1000 * timeMultiplier);
    const personalEndsAtMs = engine.accommodations.personalRoundTimer(latestTimer, timeMultiplier, {
      fullDurationMs: engine.accommodations.roomFullRoundMs(latestRoom),
    }).endsAtMs || 0;
    const officialElapsedMs = request.data?.autoFinalizedAtRoundEnd === true
      ? activeRoundMs
      : parity.authoritativeElapsed({
      humanElapsedMs: request.data?.timingDegraded ? null : request.data?.humanElapsedMs,
      arrivedAtMs: requestArrivedAt,
      startsAtMs: latestStartsAtMs,
      totalMs: activeRoundMs,
      });
    // THE ROOM'S SCORING STRATEGY scores the response. Speed influence is
    // applied here, natively, and milestone speed a Solver Race student already
    // banked this round (on the mature 100-point scale) is subtracted so the
    // same speed is never paid twice.
    scoringStrategyId = engine.scoring.roomScoringStrategyId(latestRoom);
    const strategy = engine.scoring.getScoringStrategy(scoringStrategyId);
    finalScore = strategy.scoreResponse({
      gradeScore: grading?.score ?? (grading?.isCorrect ? 1 : 0),
      isCorrect: grading?.isCorrect === true,
      remainingMs: personalEndsAtMs ? Math.max(0, personalEndsAtMs - nowMs) : 0,
      totalMs: activeRoundMs,
      elapsedMs: officialElapsedMs,
      previousStreak: player.streak || 0,
      // Tracked explicitly rather than inferred from a zero streak, which is
      // also a player's very first round.
      previousRoundMissed: player.lastAnswerCorrect === false,
      secondChance: isSecondChance,
      missedOriginally,
      speedInfluencePercent,
      bankedLegacyMilestoneSpeed: isSecondChance ? 0 : challenge.legacyMilestoneSpeedTotalForRound(
        player.submissionReceipts || {}, submittedRound, submittedVersion,
      ),
    });
    const perRoundScoring = strategy.accumulation === engine.scoring.SCORE_ACCUMULATION.PER_ROUND;
    const answeredCorrectly = grading?.isCorrect === true;
    const attemptSequence = Math.max(0, Math.round(Number(player.attemptSequence) || 0)) + 1;
    const receipt = {
      // The attempt: what was answered, when it arrived, how it graded.
      receiptKind: responses.RECEIPT_KIND.RESPONSE,
      questionIndex: 0,
      sequence: attemptSequence,
      arrivedAtMs: requestArrivedAt,
      elapsedMs: officialElapsedMs,
      isCorrect: answeredCorrectly,
      scorePercent: Math.round(Math.max(0, Math.min(1, Number(grading?.score) || 0)) * 100),
      // The score the strategy gave it.
      scoringStrategyId,
      speedInfluencePercent,
      pointsAwarded: finalScore.pointsAwarded,
      basePoints: finalScore.basePoints,
      speedBonus: finalScore.speedBonus,
      legacySpeedBonus: finalScore.legacySpeedBonus,
      speedTier: finalScore.speedTier,
      streakBonus: finalScore.streakBonus,
      comebackBonus: finalScore.comebackBonus,
      recoveryPoints: finalScore.recoveryPoints,
      secondChance: finalScore.secondChance,
      totalScore: 0,
      streak: finalScore.newStreak,
      submissionId,
      roundIndex: submittedRound,
      roundVersion: submittedVersion,
      serverConfirmed: true,
    };
    const submissionReceipts = { ...(player.submissionReceipts || {}), [submissionId]: receipt };
    // Every confirmed receipt, summed: the raw performance total.
    const rawScore = challenge.authoritativeReceiptTotal(submissionReceipts);
    // The match total is that sum for a per-response strategy. A placement
    // strategy's match total changes only when a round closes.
    const reconciledScore = perRoundScoring ? Math.max(0, Math.round(Number(player.score) || 0)) : rawScore;
    submissionReceipts[submissionId] = { ...receipt, totalScore: reconciledScore };
    finalPlayer = {
      ...player,
      joined: true,
      score: reconciledScore,
      rawScore,
      attemptSequence,
      correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)) + (answeredCorrectly ? 1 : 0),
      roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)) + 1,
      streak: finalScore.newStreak,
      answeredRound: submittedRound,
      lastAnswerCorrect: answeredCorrectly,
      comebackCount: Math.max(0, Math.round(Number(player.comebackCount) || 0)) + (finalScore.comebackBonus > 0 ? 1 : 0),
      recoveryCount: Math.max(0, Math.round(Number(player.recoveryCount) || 0)) + (finalScore.recoveryPoints > 0 ? 1 : 0),
      bestStreak: Math.max(
        Math.max(0, Math.round(Number(player.bestStreak) || 0)),
        finalScore.newStreak,
      ),
      // A scheduled round that was missed becomes a candidate for replay. A
      // replay itself is never added, so one question cannot be queued twice.
      missedRounds: !answeredCorrectly && !isSecondChance
        ? [...new Set([...missedRounds, submittedRound])].slice(0, 40)
        : missedRounds,
      // Which rounds this student actually answered. Mastery evidence needs
      // "did they answer it, and were they right", and correctCount alone
      // cannot say WHICH standard was right. Recorded in the write that was
      // happening anyway rather than as a second one, because every student in
      // the room writes here at the same moment.
      answeredRounds: [...new Set([
        ...(Array.isArray(player.answeredRounds) ? player.answeredRounds.map(Number) : []),
        submittedRound,
      ])].slice(0, 60),
      submissionReceipts,
      // Speed influence was applied natively above, so the legacy experience
      // trigger (functions/entry.js) must find nothing left to adjust for this
      // round — and never reverse-engineer this strategy's arithmetic.
      experienceSpeedAdjustedRound: submittedRound,
      experienceSpeedAdjustment: 0,
      lastSubmissionAudit: {
        roomId, roundIndex: submittedRound, roundVersion: submittedVersion, submissionId,
        capturedElapsedMs: Math.max(0, Number(request.data?.humanElapsedMs) || 0),
        officialElapsedMs,
        timingDegraded: request.data?.timingDegraded === true,
        serverArrivalInGrace: arrival.inGrace,
        connectionQuality: String(request.data?.connectionQuality || "unknown").slice(0, 24),
        speedTier: finalScore.speedTier, pointsAwarded: finalScore.pointsAwarded,
        serverConfirmed: true, duplicate: false,
      },
      updatedAt: FieldValue.serverTimestamp(),
    };
    // NO ROOM-LEVEL TALLY IS WRITTEN HERE ANY MORE. This used to increment
    // roundAnswers and roundMisses on the private state document, which made one
    // document take a write per student per round — a hot spot with a whole
    // class answering at once, and a failure mode of telling a student their
    // correct answer did not count. Both numbers are derivable from the
    // answeredRounds and missedRounds written just above, so they are computed
    // where they are read instead. See deriveRoundTallies.

    const publicPlayerRef = roomRef.collection("players").doc(player.playerKey);
    // AN ANSWER AFTER THE CLASS'S DEADLINE comes only from a student with
    // extended time. Writing it to their public row now would show the class
    // who that is (the row whose answer lands after "Time!", and its score
    // moving on the projector). It stays private until the round closes, when
    // the close copies it (liveChallengePublicRowAfterClose).
    const answeredAfterClassDeadline = Boolean(latestEndsAtMs)
      && requestArrivedAt > latestEndsAtMs + parity.SUBMISSION_ARRIVAL_GRACE_MS;
    transaction.set(privatePlayerRef, {
      ...finalPlayer,
      publicRowPendingRound: answeredAfterClassDeadline ? submittedRound : null,
    }, { merge: true });
    if (!answeredAfterClassDeadline) {
      transaction.set(publicPlayerRef, liveChallengePublicAnswerRow(player, finalPlayer, submittedRound), { merge: true });
    }
  });

  if (duplicateReceipt) return { ...duplicateReceipt, duplicate: true };

  // Classroom pacing: once the room's threshold of the students who actually
  // joined this round have answered, any longer remaining timer is compressed
  // to five seconds. This happens after the authoritative score write, and
  // failures here never invalidate a student's accepted answer. Only an answer
  // that could cross the threshold counts the class (roundCompressionMayApply):
  // the student's feedback waits on this, and the room is the class's hot
  // document.
  if (challenge.roundCompressionMayApply(roomAtSubmit, Date.now())) {
    await maybeCompressLiveChallengeRoundAfterThreshold(db, {
      roomRef,
      roundIndex: submittedRound,
      roundVersion: submittedVersion,
    }).catch((error) => logger.error("liveChallenge.roundCompression.failed", {
      roomId,
      roundIndex: submittedRound,
      message: error?.message || String(error),
    }));
  }

  return {
    isCorrect: grading?.isCorrect === true,
    scorePercent: Math.round(Math.max(0, Math.min(1, Number(grading?.score) || 0)) * 100),
    pointsAwarded: finalScore?.pointsAwarded || 0,
    basePoints: finalScore?.basePoints || 0,
    speedBonus: finalScore?.speedBonus || 0,
    speedTier: finalScore?.speedTier || 'expired',
    streakBonus: finalScore?.streakBonus || 0,
    // A bonus a student cannot see is a bonus that changes nothing about
    // whether they try the next one.
    comebackBonus: finalScore?.comebackBonus || 0,
    recoveryPoints: finalScore?.recoveryPoints || 0,
    secondChance: finalScore?.secondChance === true,
    totalScore: finalPlayer?.score || 0,
    rawScore: finalPlayer?.rawScore || 0,
    scoringStrategyId,
    streak: finalPlayer?.streak || 0,
    rank: null,
    submissionId,
    serverConfirmed: true,
    duplicate: false,
  };
});


// ---------------------------------------------------------------------------
// GRAPH FEATURE RUSH: A STUDENT'S OWN GRAPHS, AND THEIR TAPS.
//
// The rush's rounds open, close and finish through the same lifecycle
// commands as every mode, on the room's authoritative clock. What it adds is
// how a student gets questions and answers them:
//
//   getGraphFeatureRushRound        where the student stands in the round,
//                                   read from their receipts, and their next
//                                   graphs, generated from the room's private
//                                   seed. Writes nothing.
//   submitGraphFeatureRushAttempts  a batch of taps, "Does Not Exist" presses
//                                   and skips, graded in ONE transaction
//                                   against the server's own regenerated
//                                   questions (graphFeatureRush.
//                                   applyRushAttempts) and recorded as
//                                   targetAttempt receipts. A retried batch
//                                   replays by attempt id; a graph completes
//                                   once.
//   previewGraphFeatureRush         sample graphs for a teacher's settings.
//   previewInequalityRush           sample inequalities, likewise.
//   previewSystemsRush              sample systems of two lines, likewise.
//
// The device grades each tap instantly with the same hit test; the server's
// verdict is the one that counts, and the device resynchronizes to it.
//
// INEQUALITY GRAPHING RUSH plays on the same two callables: its items are
// rush questions (one target, a solution set, checked like a domain), so a
// room of either game is played, graded and recorded by the same code, with
// its questions from its own generator (RUSH_QUESTION_SOURCES). So does
// SYSTEMS OF EQUATIONS RUSH: its items are two lines, their targets points
// tapped with the rush's hit test, or a press ("No Solution", "Infinitely
// Many", "Can't Be Determined").
// ---------------------------------------------------------------------------

/*
 * THE GAMES PLAYED ON THE RUSH'S ATTEMPTS, by question source: where a room's
 * private seed and settings live, what the game is called in a refusal, and
 * its generator — the version a room must have been created under, how
 * question k is generated, and what a student's device receives of it.
 */
const RUSH_QUESTION_SOURCES = Object.freeze({
  graphFeatureGenerator: Object.freeze({
    label: "Graph Feature Rush",
    stateKey: "graphFeatureRush",
    async generator() {
      const { generator } = await graphFeatureRushRules();
      return { version: generator.GRAPH_FEATURE_GENERATOR_VERSION, generate: generator.generateRushQuestion, publicQuestion: generator.publicRushQuestion };
    },
  }),
  inequalityGenerator: Object.freeze({
    label: "Inequality Graphing Rush",
    stateKey: "inequalityRush",
    async generator() {
      const { generator } = await inequalityRushRules();
      return { version: generator.INEQUALITY_GENERATOR_VERSION, generate: generator.generateInequalityQuestion, publicQuestion: generator.publicInequalityQuestion };
    },
  }),
  systemsGenerator: Object.freeze({
    label: "Systems of Equations Rush",
    stateKey: "systemsRush",
    async generator() {
      const { generator } = await systemsRushRules();
      return { version: generator.SYSTEMS_GENERATOR_VERSION, generate: generator.generateSystemsQuestion, publicQuestion: generator.publicSystemsQuestion };
    },
  }),
});

const optionalRushInteger = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : Number.NaN;
};
const optionalRushString = (value) => (value === undefined || value === null ? null : String(value).trim());

async function loadGraphFeatureRushContext(db, { studentId, roomId }) {
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const [roomSnapshot, privateSnapshot, playerSnapshot, inviteSnapshot] = await Promise.all([
    roomRef.get(), privateRef.get(), privatePlayerRef.get(), inviteRef.get(),
  ]);
  if (!roomSnapshot.exists || !privateSnapshot.exists || !playerSnapshot.exists) {
    throw new HttpsError("not-found", "That Live Challenge is no longer available.");
  }
  if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) {
    throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
  }
  const room = roomSnapshot.data() || {};
  const engine = await liveChallengeEngine();
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  const source = Object.hasOwn(RUSH_QUESTION_SOURCES, mode.questionSource) ? RUSH_QUESTION_SOURCES[mode.questionSource] : null;
  if (!source) {
    throw new HttpsError("failed-precondition", "This Live Challenge is not a Graph Feature Rush.");
  }
  const [rules, questions] = await Promise.all([graphFeatureRushRules(), source.generator()]);
  const rushState = (privateSnapshot.data() || {})[source.stateKey] || {};
  // A room is graded with the generator it was created under, or not at all:
  // regenerating under different rules would grade a tap on a graph the
  // student never saw.
  if (!rushState.seed || Number(rushState.generatorVersion) !== questions.version) {
    throw new HttpsError("failed-precondition", `This ${source.label} was created before an update. Ask your teacher to start a new game.`);
  }
  return { engine, rules, questions, mode, room, roomRef, privatePlayerRef, player: playerSnapshot.data() || {}, rushState };
}

/** Question k of one student's round: deterministic, generated once per call. */
function graphFeatureRushIssuer({ questions, rushState, studentId, roundIndex }) {
  const issued = new Map();
  return (questionIndex) => {
    if (!issued.has(questionIndex)) {
      issued.set(questionIndex, questions.generate({
        seed: rushState.seed, studentKey: studentId, roundIndex, questionIndex, config: rushState.config,
      }));
    }
    return issued.get(questionIndex);
  };
}

exports.getGraphFeatureRushRound = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const roomId = String(request.data?.roomId || "").trim();
  const roundIndex = Number(request.data?.roundIndex);
  const roundVersion = optionalRushInteger(request.data?.roundVersion);
  const roundToken = optionalRushString(request.data?.roundToken);
  if (!roomId || !Number.isInteger(roundIndex) || roundIndex < 0 || Number.isNaN(roundVersion)) {
    throw new HttpsError("invalid-argument", "roomId and roundIndex are required.");
  }
  const { engine, rules, questions: generator, mode, room, player, rushState } = await loadGraphFeatureRushContext(db, { studentId, roomId });
  const { lifecycle } = engine;
  const poolSize = mode.questionSpecs.length;
  const state = rules.rush.rushRoundState({ receipts: player.submissionReceipts || {}, roundIndex, poolSize });
  const roundOpen = lifecycle.planLifecycleCommand({
    command: lifecycle.LIFECYCLE_COMMAND.SUBMIT,
    room,
    expected: { roundIndex, roundVersion, roundToken },
  }).outcome === lifecycle.LIFECYCLE_OUTCOME.APPLY;
  // Graphs only for an open round the student has joined, starting no
  // earlier than where they are and no further ahead than two batches.
  const requested = Number(request.data?.fromIndex);
  const fromIndex = Number.isInteger(requested)
    ? Math.min(Math.max(requested, state.cursor), state.cursor + 2 * rules.rush.RUSH_LIMITS.issueBatch)
    : state.cursor;
  const count = Math.max(0, Math.min(rules.rush.RUSH_LIMITS.issueBatch, Math.floor(Number(request.data?.count ?? 6)) || 0));
  const issue = graphFeatureRushIssuer({ questions: generator, rushState, studentId, roundIndex });
  const joined = player.joined === true;
  const questions = roundOpen && joined
    ? Array.from({ length: Math.max(0, Math.min(count, poolSize - fromIndex)) }, (_, offset) => generator.publicQuestion(issue(fromIndex + offset)))
    : [];
  // `poolSize` is where the round's graphs end; `joined` tells a device whose
  // join is still on its way to ask again rather than to give up.
  return { roomId, roundIndex, roundOpen, joined, poolSize, state, questions };
});

exports.submitGraphFeatureRushAttempts = onCall(async (request) => {
  const requestArrivedAt = Date.now();
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const roomId = String(request.data?.roomId || "").trim();
  const roundIndex = Number(request.data?.roundIndex);
  const roundVersion = optionalRushInteger(request.data?.roundVersion);
  const roundToken = optionalRushString(request.data?.roundToken);
  const attempts = Array.isArray(request.data?.attempts) ? request.data.attempts : [];
  if (!roomId || !Number.isInteger(roundIndex) || roundIndex < 0 || !Number.isInteger(roundVersion) || !attempts.length) {
    throw new HttpsError("invalid-argument", "roomId, roundIndex, roundVersion and attempts are required.");
  }
  const { engine, rules, questions, mode, room, roomRef, privatePlayerRef, rushState } = await loadGraphFeatureRushContext(db, { studentId, roomId });
  const { lifecycle, timer: roundTimer } = engine;
  const expected = { roundIndex, roundVersion, roundToken };
  // Cheap refusals before the transaction: a stale round, a closed one, or a
  // request that arrived after the deadline's bounded grace.
  const precheck = lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.SUBMIT, room, expected });
  if (precheck.outcome !== lifecycle.LIFECYCLE_OUTCOME.APPLY) {
    throw new HttpsError("failed-precondition", precheck.message, { lifecycle: precheck.code });
  }
  // A tap before GO, or during a pause, is told so, not "time is up" (LC06).
  const arrivalCheck = roundTimer.timerAcceptsArrival(roundTimer.timerFromRoom(room), requestArrivedAt);
  if (!arrivalCheck.accepted) throw liveChallengeArrivalRefusal(arrivalCheck);
  const poolSize = mode.questionSpecs.length;
  const issue = graphFeatureRushIssuer({ questions, rushState, studentId, roundIndex });

  const outcome = await db.runTransaction(async (transaction) => {
    const [latestRoomSnapshot, latestPlayerSnapshot] = await Promise.all([
      transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!latestRoomSnapshot.exists || !latestPlayerSnapshot.exists) {
      throw new HttpsError("not-found", "That Live Challenge ended before your taps could be saved.");
    }
    const latestRoom = latestRoomSnapshot.data() || {};
    const player = latestPlayerSnapshot.data() || {};
    const plan = lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.SUBMIT, room: latestRoom, expected });
    if (plan.outcome !== lifecycle.LIFECYCLE_OUTCOME.APPLY) {
      throw new HttpsError("failed-precondition", plan.message, { lifecycle: plan.code });
    }
    const latestTimer = roundTimer.timerFromRoom(latestRoom);
    const arrival = roundTimer.timerAcceptsArrival(latestTimer, requestArrivedAt);
    if (!arrival.accepted) throw liveChallengeArrivalRefusal(arrival);
    if (player.joined !== true || !player.playerKey) throw new HttpsError("failed-precondition", "Join the Live Challenge before playing.");
    const strategy = engine.scoring.getScoringStrategy(engine.scoring.roomScoringStrategyId(latestRoom));
    const applied = rules.rush.applyRushAttempts({
      player,
      roundIndex,
      roundVersion,
      attempts,
      questionFor: issue,
      arrivedAtMs: requestArrivedAt,
      arrivalElapsedMs: arrival.elapsedMs,
      roundDurationMs: latestTimer.durationMs || mode.roundLimits.maxSeconds * 1000,
      strategy,
      poolSize,
    });
    // Replays, found-again targets and resolved graphs record nothing, so a
    // batch of only those writes nothing either.
    if (applied.recorded > 0) {
      const { totals } = applied;
      transaction.set(privatePlayerRef, {
        submissionReceipts: applied.receipts,
        attemptSequence: applied.attemptSequence,
        score: totals.score,
        rawScore: totals.rawScore,
        correctCount: totals.correctCount,
        roundsAnswered: totals.roundsAnswered,
        answeredRounds: totals.answeredRounds,
        targetAttempts: totals.targetAttempts,
        targetHits: totals.targetHits,
        matchAccuracy: totals.matchAccuracy,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      // The player's own public row: the board's numbers and the host's
      // "racing now" signal. No student id, no answers.
      transaction.set(roomRef.collection("players").doc(String(player.playerKey)), {
        score: totals.score,
        rawScore: totals.rawScore,
        correctCount: totals.correctCount,
        roundsAnswered: totals.roundsAnswered,
        matchAccuracy: totals.matchAccuracy,
        rushRound: roundIndex,
        rushRoundCompleted: applied.state.questionsCorrect,
        // The round's points: each item worth the taps its answer takes.
        rushRoundPoints: Math.round((Number(applied.state.scoreTotal) || 0) * 1000) / 1000,
        rushActiveAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return {
      verdicts: applied.verdicts,
      state: applied.state,
      recorded: applied.recorded,
      score: applied.totals.score,
      correctCount: applied.totals.correctCount,
      paceRefused: applied.paceRefused,
    };
  });
  // Attempts sooner than the student's own device could make them (SI08;
  // graphFeatureRushRules.mjs RUSH_PACING): counted for support, no student id.
  const { paceRefused, ...reply } = outcome;
  if (paceRefused > 0) logger.warn("liveChallenge.rush.paceRefused", { roomId, roundIndex, refused: paceRefused });
  return { roomId, roundIndex, ...reply };
});

exports.previewGraphFeatureRush = onCall(async (request) => {
  await requireTeacher(request);
  const { generator, config } = await graphFeatureRushRules();
  let normalized;
  try {
    normalized = config.normalizeGraphFeatureRushConfig(request.data?.graphFeatureRush || {});
  } catch (error) {
    if (error?.name === "GraphFeatureRushConfigError") throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
  // A fresh seed every time: the teacher sees what a student might get, and
  // nothing is written anywhere.
  const seed = crypto.randomUUID();
  const count = Math.max(1, Math.min(18, Math.floor(Number(request.data?.count) || 12)));
  const questions = Array.from({ length: count }, (_, questionIndex) => generator.publicRushQuestion(generator.generateRushQuestion({
    seed, studentKey: "preview", roundIndex: 0, questionIndex, config: normalized,
  })));
  return { config: normalized, questions };
});

exports.previewInequalityRush = onCall(async (request) => {
  await requireTeacher(request);
  const { generator } = await inequalityRushRules();
  let normalized;
  try {
    normalized = generator.normalizeInequalityRushConfig(request.data?.inequalityRush || {});
  } catch (error) {
    if (error?.name === "InequalityRushConfigError") throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
  // A fresh seed every time, as for graphs: nothing is written anywhere.
  const seed = crypto.randomUUID();
  const count = Math.max(1, Math.min(18, Math.floor(Number(request.data?.count) || 12)));
  const questions = Array.from({ length: count }, (_, questionIndex) => generator.publicInequalityQuestion(generator.generateInequalityQuestion({
    seed, studentKey: "preview", roundIndex: 0, questionIndex, config: normalized,
  })));
  return { config: normalized, questions };
});

exports.previewSystemsRush = onCall(async (request) => {
  await requireTeacher(request);
  const { rules, generator } = await systemsRushRules();
  let normalized;
  try {
    normalized = rules.normalizeSystemsRushConfig(request.data?.systemsRush || {});
  } catch (error) {
    if (error?.name === "SystemsRushConfigError") throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
  // A fresh seed every time, as for graphs: nothing is written anywhere.
  const seed = crypto.randomUUID();
  const count = Math.max(1, Math.min(18, Math.floor(Number(request.data?.count) || 12)));
  const questions = Array.from({ length: count }, (_, questionIndex) => generator.publicSystemsQuestion(generator.generateSystemsQuestion({
    seed, studentKey: "preview", roundIndex: 0, questionIndex, config: normalized,
  })));
  return { config: normalized, questions };
});

// ---------------------------------------------------------------------------
// GRAPH THE LINE (docs/architecture/graph-the-line.md)
//
// Classic, Sprint and Rush open, close and finish through the same lifecycle
// commands as every mode, on the room's authoritative clock. What the game
// adds is how a student gets items and answers them — the rush's shape:
//
//   getLineGraphRound        where the student stands in the round, read
//                            from their receipts, and their next items,
//                            generated from the room's private seed. Writes
//                            nothing.
//   submitLineGraphAttempts  a batch of drawn lines, chosen options, typed
//                            equations and skips, graded in ONE transaction
//                            against the server's own regenerated items
//                            (lineGraphAttempts.applyLineGraphAttempts) and
//                            recorded as targetAttempt receipts. A retried
//                            batch replays by attempt id; an item completes
//                            once.
//   previewLineGraph         sample items for a teacher's settings.
//
// The device checks each answer the moment it is complete with the same
// functions; the server's verdict is the one that counts, and the device
// resynchronizes to it.
// ---------------------------------------------------------------------------

async function loadLineGraphContext(db, { studentId, roomId }) {
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId);
  const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId);
  const privatePlayerRef = privateRef.collection("players").doc(studentId);
  const inviteRef = db.collection(LIVE_CHALLENGE_INVITES).doc(studentId);
  const [roomSnapshot, privateSnapshot, playerSnapshot, inviteSnapshot] = await Promise.all([
    roomRef.get(), privateRef.get(), privatePlayerRef.get(), inviteRef.get(),
  ]);
  if (!roomSnapshot.exists || !privateSnapshot.exists || !playerSnapshot.exists) {
    throw new HttpsError("not-found", "That Live Challenge is no longer available.");
  }
  if (!inviteSnapshot.exists || inviteSnapshot.data()?.roomId !== roomId) {
    throw new HttpsError("permission-denied", "This Live Challenge was not assigned to you.");
  }
  const room = roomSnapshot.data() || {};
  const engine = await liveChallengeEngine();
  const mode = engine.modes.getChallengeMode(room.challengeMode);
  if (mode.questionSource !== engine.modes.QUESTION_SOURCE.LINE_GRAPH_GENERATOR) {
    throw new HttpsError("failed-precondition", "This Live Challenge is not a Graph the Line game.");
  }
  const modules = await lineGraphModules();
  const lineState = (privateSnapshot.data() || {}).lineGraph || {};
  // A room is graded with the generator it was created under, or not at all:
  // regenerating under different rules would grade a line against an
  // equation the student never saw.
  if (!lineState.seed || Number(lineState.generatorVersion) !== modules.generator.LINE_GRAPH_GENERATOR_VERSION) {
    throw new HttpsError("failed-precondition", "This Graph the Line game was created before an update. Ask your teacher to start a new game.");
  }
  // The format is the mode's; a Sprint's length is the room's own (never
  // more than the mode declares).
  const config = { ...lineState.config, format: modules.rules.lineGraphFormatOfMode(mode.id) };
  const poolSize = Math.min(modules.config.lineRoundQuestionCount(config.format, config), mode.questionSpecs.length);
  return {
    engine, modules, mode, room, roomRef, privatePlayerRef, player: playerSnapshot.data() || {}, lineState, config, poolSize,
  };
}

/*
 * WHETHER AN ATTEMPT BELONGS TO THE ROUND, AND TO WHICH PART OF IT
 * (liveChallengeAccommodations.mjs). Everyone races on the class's clock: an
 * attempt that arrives by the class's deadline (and its arrival grace) is the
 * race's. A student with extended time in a Classic or Sprint room keeps
 * working after the buzzer, to their own deadline: what arrives then is their
 * extra time — recorded, but never the race's. `extraTimeFromMs` is the
 * class's round length, for such a student only: an attempt their device
 * made after the buzzer is extra time even inside the grace.
 */
function lineGraphArrival(engine, { mode, room, player, arrivedAtMs }) {
  const { timer: roundTimer, accommodations } = engine;
  const classTimer = roundTimer.timerFromRoom(room);
  const classArrival = roundTimer.timerAcceptsArrival(classTimer, arrivedAtMs);
  const afterBuzzer = accommodations.extendedTimeRuleFor(mode) === accommodations.EXTENDED_TIME_RULE.AFTER_BUZZER
    && accommodations.storedTimeMultiplier(player?.timeMultiplier) > 1;
  const classLengthMs = classTimer.startsAtMs && classTimer.endsAtMs ? classTimer.endsAtMs - classTimer.startsAtMs : null;
  const extraTimeFromMs = afterBuzzer ? classLengthMs : null;
  if (classArrival.accepted || !afterBuzzer) {
    return { ...classArrival, extraTime: false, roundDurationMs: classTimer.durationMs, extraTimeFromMs };
  }
  const personal = accommodations.personalRoundTimer(classTimer, player.timeMultiplier, {
    fullDurationMs: accommodations.roomFullRoundMs(room),
  });
  const personalArrival = roundTimer.timerAcceptsArrival(personal, arrivedAtMs);
  return {
    ...personalArrival,
    extraTime: personalArrival.accepted,
    roundDurationMs: personal.endsAtMs && personal.startsAtMs ? personal.endsAtMs - personal.startsAtMs : classTimer.durationMs,
    extraTimeFromMs,
  };
}

/** Item k of one student's round: deterministic, generated once per call. */
function lineGraphIssuer({ modules, lineState, config, studentId, roundIndex }) {
  const issued = new Map();
  return (questionIndex) => {
    if (!issued.has(questionIndex)) {
      issued.set(questionIndex, modules.generator.generateLineQuestion({
        seed: lineState.seed, studentKey: studentId, roundIndex, questionIndex, config,
      }));
    }
    return issued.get(questionIndex);
  };
}

exports.getLineGraphRound = onCall(async (request) => {
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const roomId = String(request.data?.roomId || "").trim();
  const roundIndex = Number(request.data?.roundIndex);
  const roundVersion = optionalRushInteger(request.data?.roundVersion);
  const roundToken = optionalRushString(request.data?.roundToken);
  if (!roomId || !Number.isInteger(roundIndex) || roundIndex < 0 || Number.isNaN(roundVersion)) {
    throw new HttpsError("invalid-argument", "roomId and roundIndex are required.");
  }
  const { engine, modules, room, player, lineState, config, poolSize } = await loadLineGraphContext(db, { studentId, roomId });
  const { lifecycle } = engine;
  // Where the student is, from all their work (extra time after the buzzer
  // included): what their device resumes from.
  const state = modules.attempts.lineRoundState({ receipts: engine.responses.playerWorkReceipts(player), roundIndex, poolSize });
  const roundOpen = lifecycle.planLifecycleCommand({
    command: lifecycle.LIFECYCLE_COMMAND.SUBMIT,
    room,
    expected: { roundIndex, roundVersion, roundToken },
  }).outcome === lifecycle.LIFECYCLE_OUTCOME.APPLY;
  // Items only for an open round the student has joined, starting no earlier
  // than where they are and no further ahead than two batches.
  const requested = Number(request.data?.fromIndex);
  const fromIndex = Number.isInteger(requested)
    ? Math.min(Math.max(requested, state.cursor), state.cursor + 2 * modules.rules.LINE_LIMITS.issueBatch)
    : state.cursor;
  const count = Math.max(0, Math.min(modules.rules.LINE_LIMITS.issueBatch, Math.floor(Number(request.data?.count ?? 6)) || 0));
  const issue = lineGraphIssuer({ modules, lineState, config, studentId, roundIndex });
  const joined = player.joined === true;
  const questions = roundOpen && joined
    ? Array.from({ length: Math.max(0, Math.min(count, poolSize - fromIndex)) }, (_, offset) => modules.generator.publicLineQuestion(issue(fromIndex + offset)))
    : [];
  // `poolSize` is where the round's items end (a Sprint's length); `joined`
  // tells a device whose join is still on its way to ask again. `slopeHelper`:
  // the room's setting, or this student's own from their plan — said only to
  // them, here (liveChallengeAccommodations.planTurnsOnSlopeHelper).
  const slopeHelper = config.slopeHelper === true || player.lineSlopeHelper === true;
  return { roomId, roundIndex, roundOpen, joined, poolSize, state, questions, slopeHelper };
});

exports.submitLineGraphAttempts = onCall(async (request) => {
  const requestArrivedAt = Date.now();
  const { studentId } = requireStudent(request);
  const db = getFirestore();
  const roomId = String(request.data?.roomId || "").trim();
  const roundIndex = Number(request.data?.roundIndex);
  const roundVersion = optionalRushInteger(request.data?.roundVersion);
  const roundToken = optionalRushString(request.data?.roundToken);
  const attempts = Array.isArray(request.data?.attempts) ? request.data.attempts : [];
  if (!roomId || !Number.isInteger(roundIndex) || roundIndex < 0 || !Number.isInteger(roundVersion) || !attempts.length) {
    throw new HttpsError("invalid-argument", "roomId, roundIndex, roundVersion and attempts are required.");
  }
  const {
    engine, modules, mode, room, roomRef, privatePlayerRef, player: playerAtStart, lineState, config, poolSize,
  } = await loadLineGraphContext(db, { studentId, roomId });
  const { lifecycle } = engine;
  const expected = { roundIndex, roundVersion, roundToken };
  // Cheap refusals before the transaction: a stale round, a closed one, or a
  // request that arrived after the deadline's bounded grace (the student's
  // own deadline, for extra time after the buzzer).
  const precheck = lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.SUBMIT, room, expected });
  if (precheck.outcome !== lifecycle.LIFECYCLE_OUTCOME.APPLY) {
    throw new HttpsError("failed-precondition", precheck.message, { lifecycle: precheck.code });
  }
  // A tap before GO, or during a pause, is told so, not "time is up" (LC06);
  // a student on extra time is checked against their own deadline (LC09).
  const arrivalCheck = lineGraphArrival(engine, { mode, room, player: playerAtStart, arrivedAtMs: requestArrivedAt });
  if (!arrivalCheck.accepted) throw liveChallengeArrivalRefusal(arrivalCheck);
  const issue = lineGraphIssuer({ modules, lineState, config, studentId, roundIndex });

  const outcome = await db.runTransaction(async (transaction) => {
    const [latestRoomSnapshot, latestPlayerSnapshot] = await Promise.all([
      transaction.get(roomRef), transaction.get(privatePlayerRef),
    ]);
    if (!latestRoomSnapshot.exists || !latestPlayerSnapshot.exists) {
      throw new HttpsError("not-found", "That Live Challenge ended before your answers could be saved.");
    }
    const latestRoom = latestRoomSnapshot.data() || {};
    const player = latestPlayerSnapshot.data() || {};
    const plan = lifecycle.planLifecycleCommand({ command: lifecycle.LIFECYCLE_COMMAND.SUBMIT, room: latestRoom, expected });
    if (plan.outcome !== lifecycle.LIFECYCLE_OUTCOME.APPLY) {
      throw new HttpsError("failed-precondition", plan.message, { lifecycle: plan.code });
    }
    const arrival = lineGraphArrival(engine, { mode, room: latestRoom, player, arrivedAtMs: requestArrivedAt });
    if (!arrival.accepted) throw liveChallengeArrivalRefusal(arrival);
    if (player.joined !== true || !player.playerKey) throw new HttpsError("failed-precondition", "Join the Live Challenge before playing.");
    const strategy = engine.scoring.getScoringStrategy(engine.scoring.roomScoringStrategyId(latestRoom));
    const applied = modules.attempts.applyLineGraphAttempts({
      player,
      roundIndex,
      roundVersion,
      attempts,
      questionFor: issue,
      config,
      arrivedAtMs: requestArrivedAt,
      arrivalElapsedMs: arrival.elapsedMs,
      roundDurationMs: arrival.roundDurationMs || mode.roundLimits.maxSeconds * 1000,
      strategy,
      poolSize,
      extraTime: arrival.extraTime === true,
      extraTimeFromMs: arrival.extraTimeFromMs,
    });
    // Replays, repeated answers and resolved items record nothing, so a batch
    // of only those writes nothing either. Never `answeredRound`: it would
    // mark the player finished with the round (liveChallengeRoundCompletion).
    const raceRecorded = applied.recorded - applied.extraTimeRecorded;
    if (applied.recorded > 0) {
      const { totals } = applied;
      transaction.set(privatePlayerRef, {
        attemptSequence: applied.attemptSequence,
        ...(raceRecorded > 0 ? {
          submissionReceipts: applied.receipts,
          score: totals.score,
          rawScore: totals.rawScore,
          correctCount: totals.correctCount,
          roundsAnswered: totals.roundsAnswered,
          answeredRounds: totals.answeredRounds,
          targetAttempts: totals.targetAttempts,
          targetHits: totals.targetHits,
          matchAccuracy: totals.matchAccuracy,
        } : {}),
        // Extra time after the buzzer: the student's own work, apart from
        // the race's receipts, which alone are ranked.
        ...(applied.extraTimeRecorded > 0 ? { [engine.responses.EXTRA_TIME_RECEIPTS_FIELD]: applied.extraTimeReceipts } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      // The player's own public row: the board's numbers and the host's
      // "racing now" signal, in the race fields the rush's board already
      // reads — and whether they have worked through the whole round, which
      // the host's early close of a Classic or Sprint round counts (the
      // server's close guard reads the same receipts). No student id, no
      // answers. The race only: work in extra time after the buzzer never
      // moves it — a row that changed then would name the student.
      if (raceRecorded > 0) {
        transaction.set(roomRef.collection("players").doc(String(player.playerKey)), {
          score: totals.score,
          rawScore: totals.rawScore,
          correctCount: totals.correctCount,
          roundsAnswered: totals.roundsAnswered,
          matchAccuracy: totals.matchAccuracy,
          rushRound: roundIndex,
          rushRoundCompleted: applied.raceState.questionsCorrect,
          rushRoundFinished: applied.raceState.finished === true,
          rushActiveAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    return {
      verdicts: applied.verdicts,
      state: applied.state,
      recorded: applied.recorded,
      score: applied.totals.score,
      correctCount: applied.totals.correctCount,
    };
  });
  return { roomId, roundIndex, ...outcome };
});

exports.previewLineGraph = onCall(async (request) => {
  await requireTeacher(request);
  const { generator, config: configRules, rules } = await lineGraphModules();
  const format = String(request.data?.format || "");
  if (!rules.LINE_GRAPH_FORMAT_IDS.includes(format)) throw new HttpsError("invalid-argument", "Choose Classic, Sprint or Rush.");
  let normalized;
  try {
    normalized = configRules.normalizeLineGraphConfig(request.data?.lineGraph || {}, { format });
  } catch (error) {
    if (error?.name === "LineGraphConfigError") throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
  // A fresh seed every time: the teacher sees what a student might get, and
  // nothing is written anywhere. A Classic game's items run across rounds.
  // Up to a whole Sprint (its longest set), so practice plays the real length.
  const seed = crypto.randomUUID();
  const classic = format === rules.LINE_GRAPH_FORMAT.CLASSIC;
  const count = Math.max(1, Math.min(configRules.LINE_SPRINT_MAX_POOL, Math.floor(Number(request.data?.count) || 12)));
  const questions = Array.from({ length: count }, (_, index) => generator.publicLineQuestion(generator.generateLineQuestion({
    seed,
    studentKey: "preview",
    roundIndex: classic ? index : 0,
    questionIndex: classic ? 0 : index,
    config: normalized,
  })));
  return { config: normalized, questions };
});


exports.retryLiveChallengeAchievementJobs = onSchedule({
  schedule: "every 15 minutes",
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const rewards = await liveChallengeClassPoints();

  // Finished matches whose finalization effects did not all complete — the
  // finishing request crashed, timed out, or one effect failed. Each effect is
  // idempotent, so resuming them here can never double a report, a credit, an
  // evidence event or a reward. Very recent results are left to the request
  // that is still finishing them.
  try {
    const pendingResults = await db.collection(LIVE_CHALLENGE_MATCH_RESULTS)
      .where("effectsPending", "==", true)
      .limit(20)
      .get();
    for (const resultDoc of pendingResults.docs) {
      const finalizedAtMs = Number(resultDoc.data()?.finalizedAtMs) || 0;
      if (finalizedAtMs && Date.now() - finalizedAtMs < 2 * 60 * 1000) continue;
      // eslint-disable-next-line no-await-in-loop
      await runLiveChallengeFinalizationEffects(db, resultDoc.id).catch((error) => logger.error(
        "liveChallenge.finalization.sweep.failed",
        { roomId: resultDoc.id, message: error?.message || String(error) },
      ));
    }
  } catch (error) {
    logger.error("liveChallenge.finalization.sweep.queryFailed", { message: error?.message || String(error) });
  }

  try {
    await rewards.retryPendingLiveChallengeAchievementJobs(db);
  } catch (error) {
    logger.error("liveChallenge.classPoints.retryJobs.failed", {
      message: error?.message || String(error),
    });
  }

  // ROOMS FINISHED BEFORE MATCH RESULTS EXISTED. The earlier finish flagged a
  // room when its achievement plan could not be staged and kept its private
  // state; this recovers those from that private state.
  const challengeRules = await liveChallengeRules();
  const recoveryRooms = await db.collection(LIVE_CHALLENGE_ROOMS)
    .where("classPointsRecoveryPending", "==", true)
    .limit(20)
    .get();

  for (const roomDoc of recoveryRooms.docs) {
    const room = roomDoc.data() || {};
    if (room.status !== challengeRules.LIVE_CHALLENGE_STATUS.FINISHED) {
      // eslint-disable-next-line no-await-in-loop
      await roomDoc.ref.set({
        classPointsRecoveryPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    const privateRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomDoc.id);
    // eslint-disable-next-line no-await-in-loop
    const privateSnapshot = await privateRef.get();
    if (!privateSnapshot.exists) {
      logger.error("liveChallenge.classPoints.recoveryMissingPrivateState", { roomId: roomDoc.id });
      // eslint-disable-next-line no-await-in-loop
      await roomDoc.ref.set({
        classPointsRecoveryPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const players = await loadPrivateChallengePlayers(privateRef);
      // eslint-disable-next-line no-await-in-loop
      await rewards.processLiveChallengeClassPoints(
        db,
        roomDoc.id,
        room,
        players,
        privateSnapshot.data() || {},
        room.status,
      );
      // eslint-disable-next-line no-await-in-loop
      await deletePrivateChallengeState(db, privateRef, players);
      // eslint-disable-next-line no-await-in-loop
      await roomDoc.ref.set({
        classPointsRecoveryPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      logger.error("liveChallenge.classPoints.recoveryRoom.failed", {
        roomId: roomDoc.id,
        message: error?.message || String(error),
      });
    }
  }
});
