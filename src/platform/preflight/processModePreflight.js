/*
 * PRE-FLIGHT: CAN EVERY STUDENT DO THIS BOARD'S PROCESS — AND CAN THE SERVER MARK IT?
 *
 * A Multiple Representations board in Process Mode (`interactionMode:
 * "process"`) locks its key facts until a student establishes them with a
 * process, and opens each representation only when the student has the
 * mathematics it needs. That is only fair if, for every version a student
 * can be given:
 *
 *   - every method the board offers can actually be completed, and the
 *     server — which never believes the device — verifies it correct when it
 *     is done right (a key process is built from the version's own line and
 *     marked by the server's own function, lmrProcessVerify.mjs);
 *   - some pathway opens every card the board asks for;
 *   - on a GIVEN graph, every crossing and point a student must pick lies
 *     exactly on the plane's grid;
 *   - a Question Family version keeps the slot's interactionMode and process
 *     settings (a version that silently fell back to Worksheet Mode would
 *     grade a different activity).
 *
 * The configuration itself (an unknown mode or method, a method the GIVEN
 * cannot use, a circular restriction) is refused by the tool schema on every
 * import path (lmrProcessModel.mjs lmrProcessConfigProblems), and so on every
 * sampled version too. This audit adds what needs the mathematics of each
 * version, plus one value check: an automatic grade value measured before the
 * board became a Process Mode board.
 *
 * Read-only, synchronous and light — it is on the app's static import path,
 * so it reaches no registry grader (sharedGradersStayOutOfStartupBundle).
 */
import {
  isProcessModeQuestion,
  resolveInteractionMode,
} from '../../../functions/shared/toolMath/representationBridge/lmrProcessModel.mjs';
import { requirementMet } from '../../../functions/shared/processFacts/processFactsEngine.mjs';
import {
  cachedEvaluation,
  keyProcessEntry,
  keyProcessLog,
  lmrProcessEnvironment,
  lmrProcessGraphTargets,
  lmrProcessSnapStep,
  resolveLmrProcess,
} from '../../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import {
  deriveLinearMultipleRepresentations,
  resolveRequiredCards,
} from '../../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { isFamilyBackedQuestion, resolveFamilyPreviewInstance } from '../../../functions/shared/questionFamilyInstance.mjs';
import { estimateQuestionValue, questionValueBasis, QUESTION_VALUE_SOURCE } from '../../../functions/shared/questionValue.mjs';

const clean = (value) => String(value ?? '').trim();
const SECTION_LABEL = Object.freeze({ warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL', quiz: 'Quiz', test: 'Test' });
const sectionLabel = (role) => SECTION_LABEL[role] || 'Section';

// Generated versions sampled per family slot — the same depth as the
// question-generation audit's answer-key sample.
export const PROCESS_SAMPLE_VERSIONS = 6;

const STRATEGY_NAMES = Object.freeze({
  readSlopeIntercept: 'reading m and b',
  readPointSlope: 'reading point-slope form',
  readScenario: 'reading the situation',
  solveForY: 'solving for y',
  substituteZero: 'substituting 0 and solving',
  graphCrossing: 'finding a crossing on the graph',
  graphPoint: 'picking a point on the graph',
  riseRun: 'rise over run',
  twoPointFormula: 'the slope formula',
  tableDelta: 'Δy/Δx from the table',
  tableRead: 'reading an intercept from the table',
  tableRow: 'using a table row as a point',
  extendTable: 'extending the table',
  solveForB: 'using the slope and a point',
  evaluateAtX: 'choosing an x-value',
});

const CARD_NAMES = Object.freeze({
  standardForm: 'Standard form',
  slopeIntercept: 'Slope-intercept form',
  pointSlope: 'Point-slope form',
  slope: 'Slope',
  xIntercept: 'x-intercept',
  yIntercept: 'y-intercept',
  twoPoints: 'Two points on the line',
  table: 'Table of values',
  graphIntercepts: 'Graph 1 (intercepts)',
  graphSlopeIntercept: 'Graph 2 (slope-intercept)',
  graphPointSlope: 'Graph 3 (point-slope)',
});

const onGrid = (value, step) => {
  const ratio = Number(value) / Number(step);
  return Number.isFinite(ratio) && Math.abs(ratio - Math.round(ratio)) < 1e-9;
};

const formatCoordinate = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 1000) / 1000);
};

/**
 * What would stop a student, or the server, on ONE version of a Process Mode
 * board: [] when nothing would.
 *
 * `algebra: false` skips re-proving the Step Algebra methods (solve for y,
 * substitute 0) beyond the ones the complete key process already used: their
 * verdict is the equation workspace's own, so a family slot proves them on
 * its first versions and checks every other method on every sampled version.
 */
const ALGEBRA_STRATEGIES = new Set(['solveForY', 'substituteZero']);

/*
 * The Repair Center revalidates the whole assignment after every repair
 * (assignmentPreflightRevalidationCost.test.mjs). This check is a pure
 * function of ONE version's own fields — the ones in the key below — and its
 * Step Algebra marks cost milliseconds each, so it is remembered by exactly
 * those fields: an edit to anything it reads is a different key, never a stale
 * answer. Bounded.
 */
const VERSION_CHECK_LIMIT = 96;
const versionChecks = new Map();
const versionKey = (question, algebra) => JSON.stringify([
  algebra,
  question?.mode ?? null,
  question?.interactionMode ?? null,
  question?.process ?? null,
  question?.source ?? null,
  question?.requiredCards ?? null,
  question?.snapStep ?? null,
  question?.graphBounds ?? null,
]);

export const processVersionProblems = (question = {}, { algebra = true } = {}) => {
  if (!isProcessModeQuestion(question)) return [];
  const key = versionKey(question, algebra);
  if (versionChecks.has(key)) return [...versionChecks.get(key)];
  const problems = checkProcessVersion(question, { algebra });
  if (versionChecks.size >= VERSION_CHECK_LIMIT) versionChecks.delete(versionChecks.keys().next().value);
  versionChecks.set(key, problems);
  return [...problems];
};

const checkProcessVersion = (question, { algebra }) => {
  const canonical = deriveLinearMultipleRepresentations(question);
  if (!canonical.isValid) return [];
  const env = lmrProcessEnvironment(question, canonical);
  const problems = [];

  // 1. A complete, correct process — everything this version can reach —
  //    opens every card the board asks for, and every fact it establishes is
  //    verified correct by the server's own marking.
  const log = keyProcessLog(question, { complete: true, env });
  const state = resolveLmrProcess(question, { processLog: log }, canonical, env);
  const required = resolveRequiredCards(question);
  const closed = required.filter((cardId) => state.unlocks[cardId] && !state.unlocks[cardId].unlocked);
  if (closed.length) {
    problems.push(`no complete process can open ${closed.map((cardId) => CARD_NAMES[cardId] || cardId).join(', ')} on this version, so no student could earn ${closed.length === 1 ? 'it' : 'them'}`);
  }
  const failing = new Set(state.entries
    .filter((entry) => !entry.usable || entry.claims.some((claim) => claim.correct !== true))
    .map((entry) => STRATEGY_NAMES[entry.strategy] || entry.strategy));

  // 2. Every method the board offers verifies correct when done right.
  env.offered.forEach((option) => {
    if (!algebra && ALGEBRA_STRATEGIES.has(option.strategy)) return;
    // Only what this version can reach: a method whose prerequisites no
    // pathway establishes is the configuration check's business.
    if (option.needs && !requirementMet(option.needs, state.tokens)) return;
    option.targets.forEach((target) => {
      const entry = keyProcessEntry(question, option, target, state, env);
      // A method that cannot be worked at all here is not offered on this
      // version (a table row on an axis to read, a row not yet used).
      if (!entry) return;
      const evaluated = cachedEvaluation(entry, { facts: state.facts }, env);
      const verified = evaluated.usable && evaluated.claims.length > 0 && evaluated.claims.every((claim) => claim.correct === true);
      if (!verified) failing.add(STRATEGY_NAMES[option.strategy] || option.strategy);
    });
  });
  if (failing.size) {
    problems.push(`MathMaster cannot verify ${[...failing].join(', ')} on this version, so a student who did that work correctly would not be credited`);
  }

  // 3. A GIVEN graph: every point a student must pick is on the plane's grid.
  if (question?.source?.kind === 'graph') {
    const step = lmrProcessSnapStep(question, canonical);
    const off = lmrProcessGraphTargets(question, canonical).filter((point) => !point.every((value) => onGrid(value, step)));
    if (off.length) {
      problems.push(`on its graph a student could not pick ${off.map((point) => `(${point.map(formatCoordinate).join(', ')})`).join(' or ')} exactly, because ${off.length === 1 ? 'it falls' : 'they fall'} between the gridlines; use points and intercepts with simpler coordinates`);
    }
  }
  return problems;
};

const PROCESS_FIELDS = Object.freeze(['interactionMode', 'process']);
const sameSetting = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/** The Process Mode settings a generated version does not carry over from its slot. */
export const lostProcessSettings = (slot = {}, version = {}) => PROCESS_FIELDS.filter((field) => !sameSetting(slot?.[field], version?.[field]));

/**
 * The audit. `questions` are the flattened runtime questions in order, each
 * carrying `activityRole` (the list every Pre-Flight audit reads, so
 * "Question N" means the same question everywhere).
 */
export const auditAssignmentProcessMode = (assignment = {}, questions = []) => {
  const list = Array.isArray(questions) ? questions : [];
  const errors = [];
  const warnings = [];
  const notes = [];
  const rows = [];
  const positionInSection = {};

  list.forEach((question, flatIndex) => {
    const role = clean(question?.activityRole).toLowerCase() || 'classwork';
    positionInSection[role] = (positionInSection[role] || 0) + 1;
    const where = `Question ${flatIndex + 1} (${sectionLabel(role)} Q${positionInSection[role]})`;
    if (question?.mode !== 'linearMultipleRepresentations' || question?.teacherExcluded === true) return;
    const familyBacked = isFamilyBackedQuestion(question);
    const mode = resolveInteractionMode(question);
    rows.push({ questionIndex: flatIndex, questionId: clean(question?.questionId) || null, role, label: where, interactionMode: mode, familyBacked });

    if (familyBacked) {
      for (let index = 0; index < PROCESS_SAMPLE_VERSIONS; index += 1) {
        const preview = resolveFamilyPreviewInstance(question, { index });
        if (preview.error) break;
        const built = preview.question;
        const lost = lostProcessSettings(question, built);
        if (lost.length) {
          errors.push(`${where}: its generated versions do not keep the question's ${lost.join(' and ')} setting, so students would be given ${resolveInteractionMode(built) === 'process' ? 'Process' : 'Worksheet'} Mode instead of the ${mode === 'process' ? 'Process' : 'Worksheet'} Mode you chose. Report this to MathMaster support.`);
          break;
        }
        if (mode !== 'process') break;
        // The Step Algebra methods are proved on the first two versions; every
        // other method on every sampled version.
        const problems = processVersionProblems(built, { algebra: index < 2 });
        if (problems.length) {
          const parameters = Object.entries(preview.instance?.params || {}).map(([name, value]) => `${name} = ${value}`).join(', ');
          errors.push(`${where}: in Process Mode, ${problems[0]} (generated version ${parameters || index + 1}). Adjust the family's constraints or choose different methods in process.strategies.`);
          break;
        }
      }
    } else if (mode === 'process') {
      const problems = processVersionProblems(question);
      problems.forEach((problem) => errors.push(`${where}: in Process Mode, ${problem}.`));
    }

    // An automatic value measured before the board became a Process Mode
    // board counts the facts as typed answers, not derived work.
    if (mode === 'process') {
      const basis = questionValueBasis(question);
      if (basis.source === QUESTION_VALUE_SOURCE.AUTO && Number.isFinite(basis.units)) {
        const estimate = estimateQuestionValue(question);
        if (estimate.measured && Math.abs(estimate.units - basis.units) > 1e-9) {
          warnings.push(`${where}: its automatic grade value ×${question.questionWeight} was measured before it became a Process Mode board. As a Process Mode board it assesses ${estimate.summary} (about ×${estimate.value}). Set its value in the question editor if it should change; MathMaster never changes a stored value on its own.`);
        }
      }
    }
  });

  const process = rows.filter((row) => row.interactionMode === 'process');
  const worksheet = rows.filter((row) => row.interactionMode !== 'process');
  if (process.length) {
    notes.push(`Process Mode: ${process.map((row) => row.label.replace(/^Question \d+ \(|\)$/g, '')).join(', ')} — students establish key facts (slope, intercepts, points) with a process of their choice before they reuse them, and representations open as they have the mathematics for them.${worksheet.length ? ` Worksheet Mode: ${worksheet.map((row) => row.label.replace(/^Question \d+ \(|\)$/g, '')).join(', ')}.` : ''}`);
  }

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    notes,
    rows,
  };
};
