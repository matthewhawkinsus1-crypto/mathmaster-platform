/*
 * THE SHARED GRADER FOR STEP ALGEBRA AND A LITERAL QUESTION ON THE BALANCE.
 *
 * Run by the workspaces themselves for the verdict they report to
 * QuestionEngine (StepByStepAlgebraCore, MultiRelationAlgebraCore,
 * LinearInterceptsOrchestrator), and by the server as the authority
 * (../questionGraders/stepAlgebra.mjs, ../questionGraders/literalWorkspace.mjs).
 * One function decides; "the browser and the server agree" is a property of
 * the code.
 *
 * WHAT THE BROWSER USED TO DECIDE, AND WHAT IS DECIDED NOW.
 *
 * The workspaces only commit balanced moves, so the browser's verdict was
 * process-based and self-keyed: "the objective's variable is isolated (in the
 * requested form)" plus the typed prompt answers. A server cannot trust a
 * process it did not watch, so the verdict is now computed from the FINAL work
 * against the AUTHORITATIVE question:
 *
 *   equation          (a) structurally solved for the question's objective —
 *                     the engine's own isSolvedEquation, with the objective
 *                     read from the question, never from the work;
 *                     (b) the same solutions as the question's original
 *                     equation (stepAlgebraEquivalence.mjs) — or, for a
 *                     Question Family instance, the isolated value equal to
 *                     the instance's generated answer;
 *                     (c) every algebra prompt: the engine's own
 *                     expressionsEquivalent against the prompt's key.
 *   relation          relationSolutionSummary(final) solved, the same solution
 *                     set as the original relation, candidate classification
 *                     recomputed (verifyRelationCandidates on the ORIGINAL), and
 *                     the solution representations re-graded from the number
 *                     line work exactly as IntervalNumberLine's shared grader
 *                     grades it, against intervals derived on the server (a
 *                     checked number line with every asked stage answered is
 *                     complete, right or wrong).
 *   linearIntercepts  each typed ordered pair against expectedInterceptPoint
 *                     of the question's own line, at the orchestrator's 1e-6.
 *
 * For legitimate work (b) always held, so no student who solved on the
 * workspace sees a different verdict; what changes is that a forged final
 * equation is no longer "correct" because it is isolated.
 *
 * Student text is data. Every expression is read only if it is plain algebra
 * inside a complexity budget sized from the authoritative question
 * (stepAlgebraEquivalence.mjs studentExpressionBudget), and a relation may
 * carry no more branches or chain links than the workspace ever writes — so a
 * forged response can neither run code in the grader nor stall it.
 *
 * Parts, part ids, labels, responses and score are the ones the workspaces
 * reported (QuestionEngine, My Math Path's raw builder and the Systems
 * Workspace embed all read `algebra-objective`, `relation-work` and
 * `candidate-verification`).
 *
 * Pure: the hardened mathjs instance (../algebra/safeMath.mjs), the shared
 * algebra engine and the moved workspace models.
 */
import { parse } from '../algebra/safeMath.mjs';
import {
  equationToLatex,
  expressionsEquivalent,
  isSolvedEquation,
  latexToExpression,
  parseEquationInput,
} from '../algebra/algebraAstEngine.mjs';
import { compareOrderedPair, parseOrderedPair } from '../answerUtils.mjs';
import {
  parseRelationSource,
  relationSolutionSummary,
  relationSourceFromQuestion,
  relationStateContainsAbsoluteValue,
  relationStateToText,
  restorableRelationState,
  verifyRelationCandidates,
} from '../toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { inequalitySolutionRepresentationStages } from '../toolMath/algebra-relations/inequalityRepresentationPolicy.mjs';
import {
  LITERAL_WORKSPACE_SURFACE,
  buildLiteralWorkspaceQuestion,
  expandImplicitProducts,
} from '../toolMath/algebra-literal/literalWorkspace.mjs';
import {
  inequalityTextMatches,
  normalizeIntervals,
  notationMatchesFlexible,
  resolveIntervalAsk,
  sameIntervals,
} from '../toolMath/intervalNumberLine/intervalMath.mjs';
import { expectedInterceptPoint, resolveStandardCoefficients } from '../toolMath/stepAlgebra2/linearInterceptsMath.mjs';
import { withPromptRelationSource } from '../runtime/stepAlgebraRelationRouting.mjs';
import { gradedResult, ungradedResult } from './gradingResult.mjs';
import {
  equationMatchesOriginal,
  freeSymbols,
  isSafeStudentExpression,
  isolatedNumericValue,
  relationMatchesOriginal,
  studentExpressionBudget,
} from './stepAlgebraEquivalence.mjs';
import { STEP_ALGEBRA_MODES, hasGeneratedAnswer, resolveStepAlgebraMode } from './stepAlgebraRouting.mjs';

export { STEP_ALGEBRA_MODES, resolveStepAlgebraMode };

/** The work shape version every Step Algebra surface emits (see the declarations). */
export const STEP_ALGEBRA_CONTRACT_VERSION = 1;
export const STEP_ALGEBRA_TOOL_ID = 'stepAlgebra';
export { LITERAL_WORKSPACE_SURFACE };

const MAX_PROMPTS = 40;
const MAX_CANDIDATES = 12;

const text = (value) => String(value ?? '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const typed = (value) => (typeof value === 'string' ? value : '');
const filled = (value) => typed(value).trim() !== '';

// --- Work builders: what each workspace reports (student work only) ---------

/**
 * Equation workspace: the committed equation and the typed prompt answers.
 * Prompt answers travel as a list of { id, value } — never as an object keyed
 * by an authored prompt id, which could collide with a key the response
 * contract strips.
 */
export const equationWorkspaceWork = ({ equation = null, promptAnswers = {} } = {}) => ({
  equation: isObject(equation) ? { left: text(equation.left), right: text(equation.right) } : null,
  promptAnswers: Object.entries(isObject(promptAnswers) ? promptAnswers : {})
    .filter(([, value]) => typeof value === 'string')
    .slice(0, MAX_PROMPTS)
    .map(([id, value]) => ({ id: text(id), value })),
});

/** Relation workspace: the relation, the open symbol decision, candidate choices, the checked number line. */
export const relationWorkspaceWork = ({
  relationState = null,
  awaitingSymbolDecision = false,
  candidateChecks = {},
  representation = null,
} = {}) => ({
  relation: isObject(relationState)
    ? {
      special: relationState.special === 'noSolution' || relationState.special === 'allReals' ? relationState.special : null,
      connective: relationState.connective ?? null,
      branches: (Array.isArray(relationState.branches) ? relationState.branches : []).map((branch) => ({
        expressions: Array.isArray(branch?.expressions) ? branch.expressions.map(text) : [],
        relations: Array.isArray(branch?.relations) ? branch.relations.map(text) : [],
      })),
    }
    : null,
  awaitingSymbolDecision: awaitingSymbolDecision === true,
  candidateChecks: Object.entries(isObject(candidateChecks) ? candidateChecks : {})
    .filter(([, choice]) => typeof choice === 'string')
    .slice(0, MAX_CANDIDATES)
    .map(([candidate, choice]) => ({ candidate: text(candidate), choice })),
  representation: isObject(representation)
    ? {
      intervals: Array.isArray(representation.intervals) ? representation.intervals : [],
      notation: typed(representation.notation),
      inequality: typed(representation.inequality),
    }
    : null,
});

/** Intercept orchestrator: the two ordered pairs the student typed. */
export const linearInterceptsWork = ({ xIntercept = '', yIntercept = '' } = {}) => ({
  xIntercept: typed(xIntercept),
  yIntercept: typed(yIntercept),
});

// --- Equation workspace ----------------------------------------------------------

/** The equation the workspace opened, exactly as StepByStepAlgebraCore read it. */
const pristineEquation = (question) => {
  try {
    const equation = parseEquationInput(question);
    return equation?.left && equation?.right ? equation : null;
  } catch {
    return null;
  }
};

const objectiveLabel = (question, pristine) => question.objective?.label || (
  pristine.objective?.kind === 'slopeIntercept' ? 'Write in slope-intercept form'
    : pristine.objective?.kind === 'factoredLinear' ? 'Write in factored linear form'
      : pristine.objective?.kind === 'linearStandardForm' ? 'Write in standard form'
        : `Isolate ${pristine.objective?.variable || pristine.variable}`
);

// The workspace's own precedence: acceptedExpressions, else acceptedAnswers,
// else the single acceptedExpression. (A bare string where a list belongs used
// to crash the workspace; it is read as a one-item list.)
const promptKey = (prompt) => {
  const listed = prompt?.acceptedExpressions || prompt?.acceptedAnswers;
  if (listed) return (Array.isArray(listed) ? listed : [listed]).map(text);
  return prompt?.acceptedExpression ? [text(prompt.acceptedExpression)] : [];
};

const authoredExpression = (value) => {
  try {
    return latexToExpression(value);
  } catch {
    return '';
  }
};

/** The prompts' typed answers, graded exactly as the workspace graded them. */
const promptParts = (question, pristine, work) => {
  const prompts = Array.isArray(question.algebraPrompts) ? question.algebraPrompts : [];
  const answers = new Map((Array.isArray(work?.promptAnswers) ? work.promptAnswers : [])
    .filter((entry) => isObject(entry))
    .map((entry) => [text(entry.id), typed(entry.value)]));
  return prompts.map((prompt, index) => {
    const id = String(prompt?.id || `algebra-prompt-${index + 1}`);
    const response = answers.get(id) || '';
    const isComplete = response.trim() !== '';
    const key = promptKey(prompt);
    // Read as the engine reads it, and only plain algebra no larger than the
    // prompt's own key allows (or the floor) reaches the engine.
    const budget = studentExpressionBudget(...key.map(authoredExpression));
    const readable = isComplete && isSafeStudentExpression(latexToExpression(response), budget);
    const isCorrect = readable && key.some((candidate) => expressionsEquivalent(response, candidate, pristine.variable));
    return { id, label: prompt?.label || prompt?.prompt || `Algebraic prompt ${index + 1}`, isComplete, isCorrect, response };
  });
};

const familyAnswer = (question) => (hasGeneratedAnswer(question) ? Number(question.generatedAnswer) : null);

const equationLatex = (equation) => {
  try {
    return equationToLatex(equation);
  } catch {
    return `${equation.left} = ${equation.right}`;
  }
};

/**
 * Grade the equation workspace's final state against the question.
 * `question` is the question the workspace was opened with.
 */
export const gradeEquationWorkspace = (question = {}, work = {}) => {
  const pristine = pristineEquation(question);
  if (!pristine) return ungradedResult('no-readable-equation');
  // Only plain algebra, no larger than the question's own equation allows, is
  // read; anything else (a forged function call, an assignment, a chain long
  // enough to stall the simplifier, a number where text belongs) is not a
  // finished equation.
  const budget = studentExpressionBudget(pristine.left, pristine.right);
  const readableSide = (value) => typeof value === 'string' && isSafeStudentExpression(value, budget);
  const submitted = isObject(work?.equation) && readableSide(work.equation.left) && readableSide(work.equation.right)
    ? { left: work.equation.left, right: work.equation.right }
    : null;
  // The objective and variable are the QUESTION's — a forged objective in the
  // work could otherwise declare any equation finished.
  const final = submitted ? { ...submitted, variable: pristine.variable, objective: pristine.objective } : null;
  let solved = false;
  try {
    solved = Boolean(final) && isSolvedEquation(final);
  } catch {
    solved = false;
  }
  const key = familyAnswer(question);
  const keyApplies = key !== null && (!pristine.objective?.kind || pristine.objective.kind === 'isolate');
  const value = solved && keyApplies ? isolatedNumericValue(final, pristine.objective?.variable || pristine.variable) : null;
  const sameSolutions = solved && (keyApplies
    ? value !== null && Math.abs(value - key) <= 1e-9
    : equationMatchesOriginal({ original: pristine, final, objective: pristine.objective, variable: pristine.variable }));
  return gradedResult({
    parts: [
      {
        id: 'algebra-objective',
        label: objectiveLabel(question, pristine),
        isComplete: solved,
        isCorrect: solved && sameSolutions,
        response: final ? equationLatex(final) : '',
      },
      ...promptParts(question, pristine, work),
    ],
  });
};

// --- Relation workspace ----------------------------------------------------------

/** The relation the workspace opened, exactly as MultiRelationAlgebraCore read it. */
const pristineRelation = (question) => {
  const source = relationSourceFromQuestion(question);
  if (!source) return null;
  try {
    return parseRelationSource(source, question.solveFor || question.variable || question.objective?.variable || 'x');
  } catch {
    return null;
  }
};

// The relation workspace splits an absolute value into two branches (four for
// two absolute values) and writes a compound inequality as one three-part
// chain. Anything far beyond that was not produced by the workspace.
const MAX_RELATION_BRANCHES = 8;
const MAX_BRANCH_EXPRESSIONS = 5;

const finalRelation = (pristine, relation) => {
  if (!isObject(relation)) return null;
  const branches = Array.isArray(relation.branches) ? relation.branches : [];
  if (branches.length > MAX_RELATION_BRANCHES) return null;
  if (branches.some((branch) => Array.isArray(branch?.expressions) && branch.expressions.length > MAX_BRANCH_EXPRESSIONS)) return null;
  const special = relation.special === 'noSolution' || relation.special === 'allReals' ? relation.special : null;
  const state = special
    ? { kind: 'relation', variable: pristine.variable, branches: [], connective: null, special, original: pristine.original }
    : {
      kind: 'relation',
      variable: pristine.variable,
      branches: branches.filter(isObject).map((branch) => ({
        expressions: Array.isArray(branch.expressions) ? branch.expressions.map((value) => (typeof value === 'string' ? value : '')) : [],
        relations: Array.isArray(branch.relations) ? branch.relations.map(text) : [],
      })),
      connective: relation.connective ?? null,
      special: null,
      original: pristine.original,
    };
  const budget = studentExpressionBudget(...(pristine.branches || []).flatMap((branch) => branch.expressions || []));
  if (!state.branches.every((branch) => branch.expressions.every((expression) => isSafeStudentExpression(expression, budget)))) return null;
  try {
    return restorableRelationState(state);
  } catch {
    return null;
  }
};

/*
 * The nested number line, graded check-for-check as IntervalNumberLine's own
 * shared grader (../tools/intervalNumberLine.mjs `numberLine`) grades it — the
 * same pure interval functions, composed the same way: every asked stage
 * complete and correct, against this solved relation's intervals. It is not
 * imported from there because this module sits on the student app's startup
 * path (StepByStepAlgebraCore is a QuestionEngine surface) and a registry
 * tool's grader must never be reached through shared code
 * (tests/platform/sharedGradersStayOutOfStartupBundle). The two verdicts are
 * pinned together, work for work, by tests/tools/stepAlgebraSharedGrading.
 */
const representationIsCorrect = ({ intervals, ask, variable, work }) => {
  const expected = normalizeIntervals(intervals);
  if (!expected.length || !isObject(work)) return false;
  const stages = resolveIntervalAsk(ask);
  const built = Array.isArray(work.intervals) ? work.intervals : [];
  const checks = [];
  if (stages.includes('graph')) checks.push(built.length > 0 && built.every(isObject) && sameIntervals(built, expected));
  if (stages.includes('interval')) checks.push(filled(work.notation) && notationMatchesFlexible(typed(work.notation), expected));
  if (stages.includes('inequality')) checks.push(filled(work.inequality) && inequalityTextMatches(typed(work.inequality), expected, variable));
  return checks.length > 0 && checks.every(Boolean);
};

/*
 * Has the checked number line answered every asked stage? The same rule
 * IntervalNumberLine's shared grader completes its parts by: a graph with at
 * least one piece, a notation or inequality box that is not blank. The number
 * line's Check submits whatever is on it, empty or not, and an empty stage is
 * never an answer.
 */
const representationIsComplete = ({ ask, work }) => {
  if (!isObject(work)) return false;
  const stages = resolveIntervalAsk(ask);
  const built = Array.isArray(work.intervals) ? work.intervals : [];
  const answered = [];
  if (stages.includes('graph')) answered.push(built.length > 0);
  if (stages.includes('interval')) answered.push(filled(work.notation));
  if (stages.includes('inequality')) answered.push(filled(work.inequality));
  return answered.length > 0 && answered.every(Boolean);
};

export const gradeRelationWorkspace = (question = {}, work = {}) => {
  const relationQuestion = withPromptRelationSource(question);
  const pristine = pristineRelation(relationQuestion);
  if (!pristine) return ungradedResult('no-readable-relation');
  const final = finalRelation(pristine, work?.relation);
  const awaitingSymbolDecision = work?.awaitingSymbolDecision === true;
  const summary = final ? relationSolutionSummary(final) : { solved: false };
  const sameSolutions = summary.solved && relationMatchesOriginal({ original: pristine, final, summary });

  // Candidate verification: the workspace's own rule, recomputed on the
  // ORIGINAL relation the server holds.
  const candidates = summary.kind === 'values' && relationStateContainsAbsoluteValue(pristine)
    ? verifyRelationCandidates(pristine, summary.values, pristine.variable)
    : [];
  const choices = new Map((Array.isArray(work?.candidateChecks) ? work.candidateChecks : [])
    .filter(isObject)
    .map((entry) => [text(entry.candidate), typed(entry.choice)]));
  const choiceFor = (value) => choices.get(String(value)) || null;
  const requireCandidates = candidates.length > 0;
  const candidatesComplete = !requireCandidates || candidates.every(({ value }) => choiceFor(value) != null);
  const candidatesCorrect = !requireCandidates || candidates.every(({ value, valid }) => choiceFor(value) === (valid ? 'valid' : 'extraneous'));

  // Solution representations: graded against intervals derived HERE from the
  // student's own solved relation — which (b) has just shown is the original's
  // solution set.
  const stages = summary.kind === 'intervals' ? inequalitySolutionRepresentationStages(relationQuestion) : [];
  const requireRepresentations = summary.kind === 'intervals' && stages.length > 0;
  const representation = isObject(work?.representation) ? work.representation : null;
  const representationCorrect = representation === null ? null : representationIsCorrect({
    intervals: summary.intervals,
    ask: stages,
    variable: pristine.variable,
    work: representation,
  });
  // The number line is FINISHED once the student has checked it with every
  // asked stage answered — right or wrong; whether it is right is its
  // correctness, graded in its part and in the question's verdict. Requiring
  // a right graph before the question could be complete made Submit itself
  // the verdict on a DOL, quiz or test (it appeared only once the graph was
  // right) and closed a checked, wrong graph at a deadline as unfinished. In
  // practice the workspace still holds the question open until the graph is
  // right — the number line says "Not yet" there — which is feedback, not
  // grading (MultiRelationAlgebraCore, inequalityRepresentationPolicy.mjs
  // solutionRepresentationStageStatus).
  const representationComplete = representationCorrect !== null && representationIsComplete({ ask: stages, work: representation });

  const isComplete = !awaitingSymbolDecision
    && summary.solved === true
    && candidatesComplete
    && (!requireRepresentations || representationComplete);
  const relationText = final ? relationStateToText(final) : '';
  return gradedResult({
    isComplete,
    isCorrect: isComplete && candidatesCorrect && sameSolutions && (!requireRepresentations || representationCorrect === true),
    parts: [
      {
        id: 'relation-work',
        label: 'Solve the equation or inequality',
        isComplete: summary.solved === true,
        isCorrect: summary.solved === true && sameSolutions,
        response: relationText,
      },
      ...(requireCandidates ? [{
        id: 'candidate-verification',
        label: 'Check candidates in the original equation',
        isComplete: candidatesComplete,
        isCorrect: candidatesComplete && candidatesCorrect,
        response: candidates.map(({ value }) => `${value}:${choiceFor(value) || 'unchecked'}`).join(', '),
      }] : []),
      ...(requireRepresentations ? [{
        id: 'solution-representations',
        label: stages.includes('interval') ? 'Graph and interval notation' : 'Graph the solution',
        isComplete: representationComplete,
        isCorrect: representationCorrect === true,
        response: representationCorrect === true ? 'correct' : '',
      }] : []),
    ],
  });
};

// --- Linear intercepts ---------------------------------------------------------------

/**
 * One intercept, exactly as the orchestrator's Check marks it: a readable
 * ordered pair within 1e-6 of the line's own intercept.
 */
export const checkLinearIntercept = (standard, kind, point) => {
  const expected = standard ? expectedInterceptPoint(standard, kind) : null;
  return Boolean(parseOrderedPair(point) && expected && compareOrderedPair(point, expected, 1e-6));
};

const usableStandard = (question) => {
  const standard = resolveStandardCoefficients(question);
  return standard && Math.abs(Number(standard.A)) > 1e-12 && Math.abs(Number(standard.B)) > 1e-12 ? standard : null;
};

export const gradeLinearIntercepts = (question = {}, work = {}) => {
  const standard = usableStandard(question);
  if (!standard) return ungradedResult('no-intercept-line');
  const intercept = (kind, label, value) => ({
    id: `${kind}-intercept`,
    label,
    isComplete: filled(value),
    isCorrect: checkLinearIntercept(standard, kind, typed(value)),
    response: typed(value),
  });
  return gradedResult({
    parts: [
      intercept('x', 'x-intercept', work?.xIntercept),
      intercept('y', 'y-intercept', work?.yIntercept),
    ],
  });
};

// --- The surfaces ----------------------------------------------------------------------

const MODE_GRADERS = Object.freeze({
  [STEP_ALGEBRA_MODES.EQUATION]: gradeEquationWorkspace,
  [STEP_ALGEBRA_MODES.RELATION]: gradeRelationWorkspace,
  [STEP_ALGEBRA_MODES.LINEAR_INTERCEPTS]: gradeLinearIntercepts,
});

/*
 * The engine that produced the work. A literal question on the balance always
 * opens StepByStepAlgebra (QuestionEngine's `literal` case), which hands off to
 * the relation workspace or keeps the equation engine — never the intercept
 * orchestrator, whatever `mode` the literal question happens to carry.
 */
const workspaceMode = (question, { literal = false } = {}) => {
  const mode = resolveStepAlgebraMode(question);
  return literal && mode === STEP_ALGEBRA_MODES.LINEAR_INTERCEPTS ? STEP_ALGEBRA_MODES.EQUATION : mode;
};

/*
 * The readers above, for the server's per-step credit
 * (stepAlgebraStepVerification.mjs): the step verifier opens exactly the
 * equation and relation this grader opens, through the same functions, so a
 * step and the final answer are judged against one question. (An intercept
 * step reads the line as the orchestrator does — resolveStandardCoefficients —
 * because the orchestrator, unlike this grader, also opens a vertical or
 * horizontal line.)
 */
export {
  finalRelation as relationStateFromWork,
  pristineEquation as workspacePristineEquation,
  workspaceMode as stepAlgebraWorkspaceMode,
};
export const workspacePristineRelation = (question = {}) => pristineRelation(withPromptRelationSource(question));

const gradeInMode = (question, work, { literal = false } = {}) => {
  const mode = workspaceMode(question, { literal });
  if (!isObject(work)) return ungradedResult('empty-response', { mode });
  let result;
  try {
    result = MODE_GRADERS[mode](question, work);
  } catch (error) {
    // Tampered work must never crash ingestion; it is simply not gradable.
    return ungradedResult('malformed-response', { mode, detail: text(error?.message).slice(0, 200) });
  }
  return { ...result, mode };
};

/** The question a literal workspace was built from, or the built question itself. */
export const literalWorkspaceQuestion = (question = {}) => {
  if (question?.gradingSurface === LITERAL_WORKSPACE_SURFACE && question?.type !== 'literal') return { question, reason: null };
  return buildLiteralWorkspaceQuestion(question);
};

/**
 * Work-level graders, in the shape gradeToolCheck / gradeWorkWithGrader take
 * ({ toolId, contractVersion, grade(question, work) }). The browser calls
 * these through gradeToolCheck; the question graders call them after reading
 * the work out of the tool response.
 */
export const stepAlgebraWorkGrader = Object.freeze({
  toolId: STEP_ALGEBRA_TOOL_ID,
  contractVersion: STEP_ALGEBRA_CONTRACT_VERSION,
  grade: (question = {}, work = null) => gradeInMode(isObject(question) ? question : {}, work),
});

export const literalWorkspaceWorkGrader = Object.freeze({
  toolId: LITERAL_WORKSPACE_SURFACE,
  contractVersion: STEP_ALGEBRA_CONTRACT_VERSION,
  grade: (question = {}, work = null) => {
    const built = literalWorkspaceQuestion(isObject(question) ? question : {});
    if (!built.question) return ungradedResult('literal-workspace-unavailable');
    return gradeInMode(built.question, work, { literal: true });
  },
});

/** The work grader a workspace reports through, from the question it was opened with. */
export const workGraderForQuestion = (question = {}) => (
  question?.gradingSurface === LITERAL_WORKSPACE_SURFACE ? literalWorkspaceWorkGrader : stepAlgebraWorkGrader
);

// --- Responses captured before the structured contract --------------------------------

/**
 * Split `<final>|<JSON object>` — the workspaces' old response key — at the
 * first `|` whose remainder is a JSON object. A `|` inside the final equation
 * (absolute value in LaTeX) is therefore never mistaken for the delimiter.
 */
const splitLegacyValue = (value) => {
  const raw = text(value);
  for (let index = raw.indexOf('|'); index >= 0; index = raw.indexOf('|', index + 1)) {
    try {
      const tail = JSON.parse(raw.slice(index + 1));
      if (isObject(tail)) return { head: raw.slice(0, index), tail };
    } catch {
      // not the delimiter
    }
  }
  return { head: raw, tail: {} };
};

/*
 * CAN AN OLD KEY BE READ BACK AS THE WORK IT STOOD FOR?
 *
 * The equation half of an old key is DISPLAY LaTeX (equationToLatex), and the
 * display drops what separates two factors: r * t is written `rt`, a symbol b1
 * is written `b_{1}`, Area * 2 is written `Area2`. Read back, each is one
 * letter-run the question never had — so a correct solve would be marked
 * WRONG. An old inequality key never carried the number line the workspace
 * asked for. Neither is read: such a response is declined (accepts() is
 * false) and ingestion keeps the sanitized legacy path those responses always
 * took, rather than re-marking work the server cannot see.
 *
 * Read: the intercept pairs (JSON), the relation text (the engine's own
 * expressions), and an equation whose only names are one-letter variables and
 * the engine's functions and constants (for a literal formula, after the same
 * implicit-product expansion the workspace applies).
 */
const LEGACY_KEY_NAMES = new Set(['OR', 'sqrt', 'cbrt', 'nthroot', 'abs', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'pi', 'e']);

export const legacyKeyReadsFaithfully = (value, { literal = false } = {}) => {
  const raw = text(value).trim();
  if (!raw) return false;
  try {
    if (isObject(JSON.parse(raw))) return true;
  } catch {
    // not the intercept pairs
  }
  const head = splitLegacyValue(raw).head.trim();
  if (!head || /[<>≤≥]|\\[lg]eq?(?![A-Za-z])/.test(head)) return false;
  if (head === 'No solution' || head === 'All real numbers') return true;
  let expression;
  try {
    expression = latexToExpression(head);
  } catch {
    return false;
  }
  if (literal) expression = expandImplicitProducts(expression);
  return (expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).every((name) => name.length === 1 || LEGACY_KEY_NAMES.has(name));
};

/** The letters an equation holds (never a function's name, e or pi). */
const equationLetters = (equation) => {
  try {
    return new Set([...freeSymbols(parse(equation.left)), ...freeSymbols(parse(equation.right))]);
  } catch {
    return null;
  }
};

/** The equation half of an old `latex|prompts` key, as the engine reads equations. */
const legacyEquation = (latex, { literal = false } = {}) => {
  const expression = literal ? expandImplicitProducts(latexToExpression(latex)) : latexToExpression(latex);
  const sides = expression.split('=');
  if (sides.length !== 2 || !sides[0].trim() || !sides[1].trim()) return null;
  try {
    parse(sides[0]);
    parse(sides[1]);
  } catch {
    return null;
  }
  return { left: sides[0].trim(), right: sides[1].trim() };
};

/**
 * The work an old opaque response carried, rebuilt for the shared grader.
 * Returns null when the old key cannot be read (it is then not graded).
 */
export const legacyStepAlgebraWork = (question, value, { literal = false } = {}) => {
  const mode = workspaceMode(question, { literal });
  if (mode === STEP_ALGEBRA_MODES.LINEAR_INTERCEPTS) {
    let pairs;
    try {
      pairs = JSON.parse(text(value));
    } catch {
      return null;
    }
    const pair = (entry) => (Array.isArray(entry) && entry.length === 2 ? `(${entry[0]}, ${entry[1]})` : '');
    return isObject(pairs) ? linearInterceptsWork({ xIntercept: pair(pairs.x), yIntercept: pair(pairs.y) }) : null;
  }
  const { head, tail } = splitLegacyValue(value);
  if (mode === STEP_ALGEBRA_MODES.RELATION) {
    const special = { 'No solution': 'noSolution', 'All real numbers': 'allReals' }[head.trim()];
    let relationState = special ? { special, branches: [] } : null;
    if (!relationState) {
      try {
        relationState = parseRelationSource(head, 'x');
      } catch {
        return null;
      }
    }
    return relationWorkspaceWork({ relationState, candidateChecks: tail });
  }
  const equation = legacyEquation(head, { literal });
  if (!equation) return null;
  // Every letter of a final equation the workspace wrote is a letter of the
  // question's own equation. One that is not was misread (or forged).
  const allowed = pristineEquation(question) ? equationLetters(pristineEquation(question)) : null;
  const used = equationLetters(equation);
  if (!allowed || !used || [...used].some((name) => !allowed.has(name))) return null;
  return equationWorkspaceWork({ equation, promptAnswers: tail });
};
