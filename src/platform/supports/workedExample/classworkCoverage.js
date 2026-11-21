/*
 * WORKED-EXAMPLE COVERAGE OF A LESSON'S CLASSWORK (WE-B; WORKED_EXAMPLES.md
 * section 6).
 *
 *   classworkExampleCoverage(compiledAssignment, { prepareQuestion }) → { questions, summary }
 *
 * Every Classwork question should be taught by a worked example before a
 * student is asked to do it. For each question of a Classwork section, in the
 * order a student meets them, this says how it is covered:
 *
 *   own               the question names its own `example` (an id in
 *                     `lessonSupports.examples`, or an example written inline);
 *   builtIn           the platform works a sibling for it today: its support
 *                     family's (buildSimilarWorkedExample) or the item's own
 *                     numbers changed (buildNumericVariant);
 *   earlierSameSkill  an earlier Classwork question of the lesson, on the same
 *                     skill, is covered, so the example a student met there
 *                     teaches this one too;
 *   exempt            the question says it needs none, and why
 *                     (`"example": { "none": "setup" | "explain" }`);
 *   uncovered         none of these. `fillWith` says what would cover it:
 *                     `generator` when the platform could write one (the
 *                     question works on a rich tool, or a support family
 *                     claims it but has no sibling for it yet), otherwise
 *                     `authoredExample`, an example the lesson writes.
 *
 * A question checked for more than one is given the first that holds, in this
 * order: own, exempt, builtIn, earlierSameSkill. So a question with its own
 * built-in sibling is counted as builtIn even after an earlier one on its skill,
 * and the builtIn count is what the platform covers by itself today
 * (WORKED_EXAMPLES.md section 8: 137 of 496 Classwork questions).
 *
 * THE SKILL is the question's `familyId` when it has one, or else its first
 * `studentActions` entry with its primary standard ("multipleResponses A2.7G").
 *
 * READ-ONLY, AND TEACHER-SIDE ONLY. It reads the compiled assignment and
 * changes nothing; it is information for Pre-Flight and the coverage report
 * (scripts/report-classwork-example-coverage.mjs). For an existing assignment
 * it is never more than information, and nothing a student loads imports it
 * (tests/platform/classworkExampleCoverage.test.mjs).
 *
 * The fields it reads (`example`, `lessonSupports`) are new in the V5 contract
 * and may be absent; every read is defensive.
 *
 * CHEAP. The built-in check works a sibling, about a millisecond a question, so
 * its answer is kept per question (by object, then by content), and Pre-Flight
 * can ask again on every edit for the price of the questions that changed.
 * `prepareQuestion` lets a caller check the question as the student's screen
 * receives it (the coverage report and its test generate it the way
 * QuestionEngine does); Pre-Flight's runtime view gives the same answer for
 * every real Classwork question, and the test holds that too.
 */
import { familyFor } from '../families/index.js';
import { buildNumericVariant } from './numericVariant.js';
import { buildSimilarWorkedExample } from './similarProblem.js';

export const EXAMPLE_COVERAGE_STATUS = Object.freeze({
  OWN: 'own',
  EARLIER_SAME_SKILL: 'earlierSameSkill',
  BUILT_IN: 'builtIn',
  EXEMPT: 'exempt',
  UNCOVERED: 'uncovered',
});

export const EXAMPLE_FILL_WITH = Object.freeze({
  GENERATOR: 'generator',
  AUTHORED_EXAMPLE: 'authoredExample',
});

const COVERING = new Set([EXAMPLE_COVERAGE_STATUS.OWN, EXAMPLE_COVERAGE_STATUS.BUILT_IN, EXAMPLE_COVERAGE_STATUS.EARLIER_SAME_SKILL]);
export const isCoveredStatus = (status) => COVERING.has(status);

/*
 * The student actions worked on a rich tool whose own engine works the
 * mathematics (Step Algebra, the radical solver, the plane, the inequality
 * and systems workspaces, the polynomial workshop, the transformations,
 * interval, inverse and matrix labs, ...): a sibling for one of these is
 * platform work, a generator, not something each lesson writes. Answer boxes,
 * choices, tables, sorts and matching are not here: their sibling is an
 * authored example unless a support family claims the question.
 */
export const RICH_TOOL_ACTIONS = Object.freeze([
  'solveEquation', 'solveStepByStep', 'solveInequality', 'solveLiteral', 'solveRadicalEquation',
  'constructGraph', 'constructLine', 'graphSystem', 'solveSystem', 'solveInequalitySystem', 'rowReduce', 'completeSingularSystem',
  'chooseNumberLine', 'constructInterval', 'writeInterval',
  'factorPolynomial', 'dividePolynomial', 'longDivision', 'syntheticDivision', 'multiplyPolynomials', 'addSubtractPolynomials',
  'analyzeTransformations', 'findInverse', 'composeFunctions', 'analyzeParabolaGeometry',
  'complexOperations', 'solveExponential', 'solveLogarithmic',
  'locateMatrixElements', 'operateOnMatrices', 'writeMatrixEquation', 'solveMatrixEquation',
]);
const RICH_TOOLS = new Set(RICH_TOOL_ACTIONS);

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

/* ------------------------------------------------------------ the question */

/** The question's first student action ("multipleResponses"), or ''. */
export const exampleKindOf = (question) => text(list(question?.studentActions)[0]);

/** The question's primary standard: its primary alignment, `primaryStandard`, or a curriculum-code `standard`. */
export const primaryStandardOf = (question) => {
  const primary = list(question?.alignments).find((alignment) => isObject(alignment) && alignment.role === 'primary' && text(alignment.code));
  return text(primary?.code) || text(question?.primaryStandard) || text(question?.standard);
};

/** The skill an example teaches: `familyId`, or the first student action with the primary standard. Null when neither is known. */
export const exampleSkillOf = (question) => {
  const familyId = text(question?.familyId);
  if (familyId) return familyId;
  const kind = exampleKindOf(question);
  if (!kind) return null;
  const standard = primaryStandardOf(question);
  return standard ? `${kind} ${standard}` : kind;
};

const lessonExampleIds = (lessonSupports) => new Set(list(lessonSupports?.examples)
  .map((example) => (isObject(example) ? text(example.id) : ''))
  .filter(Boolean));

/*
 * What the question says about its own example:
 *   { kind: 'own', exampleId }      it names one the lesson has, or writes one inline;
 *   { kind: 'exempt', reason }      `{ none: "setup" }`: it needs none ("setup", "explain");
 *   { kind: 'missing', exampleId }  it names an id the lesson does not have: not coverage;
 *   null                            it says nothing.
 */
export const questionExampleClaim = (question, lessonSupports = null) => {
  const example = question?.example;
  if (example == null || example === false) return null;
  if (typeof example === 'string') {
    const id = text(example);
    if (!id) return null;
    return lessonExampleIds(lessonSupports).has(id) ? { kind: 'own', exampleId: id } : { kind: 'missing', exampleId: id };
  }
  if (!isObject(example)) return null;
  if (example.none !== undefined && example.none !== null && example.none !== false) {
    return { kind: 'exempt', reason: text(example.none) || 'none' };
  }
  const id = text(example.id) || text(example.ref) || text(example.exampleId);
  // An inline example: one the question writes itself (its own steps, moves or sibling).
  const inline = list(example.steps).length > 0 || list(example.moves).length > 0 || isObject(example.sibling);
  if (inline) return { kind: 'own', exampleId: id || null };
  if (id) return lessonExampleIds(lessonSupports).has(id) ? { kind: 'own', exampleId: id } : { kind: 'missing', exampleId: id };
  return null;
};

/* ------------------------------------------------------ the built-in check */

// Kept per question: by the object itself, and by its content, so a rebuilt
// Pre-Flight model (new objects, same questions) costs nothing again.
const byObject = new WeakMap();
const byContent = new Map();
const CONTENT_CACHE_LIMIT = 1000;

// A 53-bit string hash (cyrb53), so the cache holds a number per question and not its text.
const hash = (value) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

const contentKey = (question) => {
  try {
    return hash(JSON.stringify(question));
  } catch {
    return null;
  }
};

const workBuiltIn = (question) => {
  try {
    if (buildSimilarWorkedExample(question)) return 'family';
  } catch { /* a family that cannot read the question has no sibling for it */ }
  try {
    if (buildNumericVariant(question)) return 'numericVariant';
  } catch { /* nor does a variant that cannot */ }
  return null;
};

/** Where the platform's own sibling for this question comes from: 'family', 'numericVariant', or null. */
export const builtInExampleSource = (question) => {
  if (!isObject(question)) return null;
  if (byObject.has(question)) return byObject.get(question);
  const key = contentKey(question);
  if (key !== null && byContent.has(key)) {
    const known = byContent.get(key);
    byObject.set(question, known);
    return known;
  }
  const source = workBuiltIn(question);
  byObject.set(question, source);
  if (key !== null) {
    if (byContent.size >= CONTENT_CACHE_LIMIT) byContent.clear();
    byContent.set(key, source);
  }
  return source;
};

const familyClaims = (question) => {
  try {
    return Boolean(familyFor(question));
  } catch {
    return false;
  }
};

/** What would cover an uncovered question: a platform generator, or an example the lesson writes. */
export const exampleFillWith = (question) => (
  RICH_TOOLS.has(exampleKindOf(question)) || familyClaims(question)
    ? EXAMPLE_FILL_WITH.GENERATOR
    : EXAMPLE_FILL_WITH.AUTHORED_EXAMPLE
);

/* ----------------------------------------------------------- the lesson */

// The compile result ({ package }), a V5 package ({ sections }), or a
// Pre-Flight model ({ assignmentV5 }, or its runtime `sections`).
const packageOf = (input) => {
  if (!isObject(input)) return {};
  if (Array.isArray(input.sections)) return input;
  if (isObject(input.package)) return input.package;
  if (isObject(input.assignmentV5)) return input.assignmentV5;
  return {};
};

const lessonSupportsOf = (input, assignment) => [
  input?.lessonSupports, assignment?.lessonSupports, input?.assignmentV5?.lessonSupports, input?.package?.lessonSupports, assignment?.assignment?.lessonSupports,
].find(isObject) || null;

const roleOf = (section) => text(section?.role) || text(section?.activityRole);

const emptyByStatus = () => Object.fromEntries(Object.values(EXAMPLE_COVERAGE_STATUS).map((status) => [status, 0]));

/**
 * Each Classwork question's coverage, in the order a student meets them, and the totals.
 *
 *   questions: [{ questionId, questionNumber, sectionId, kind, standard, skill, status, ... }]
 *     own: exampleId · builtIn: builtIn ('family' | 'numericVariant') ·
 *     earlierSameSkill: coveredBy (that question's id) · exempt: reason ·
 *     uncovered: fillWith, and missingExample when it names an example the lesson lacks
 *   summary: { total, covered, exempt, uncovered, byStatus, byKind, byFill }
 *     byKind: the uncovered questions by their first student action.
 *
 * `questionNumber` is the question's place in the whole assignment, as
 * Pre-Flight numbers its other findings ("Question 7"). A question the teacher
 * excluded is never delivered, so it is not judged (and keeps its number).
 */
export const classworkExampleCoverage = (compiledAssignment, { prepareQuestion = null } = {}) => {
  const assignment = packageOf(compiledAssignment);
  const lessonSupports = lessonSupportsOf(compiledAssignment, assignment);
  const questions = [];
  const coveredSkills = new Map();
  let questionNumber = 0;

  list(assignment.sections).forEach((section, sectionIndex) => {
    const classwork = roleOf(section) === 'classwork';
    list(section?.questions).forEach((question) => {
      questionNumber += 1;
      if (!classwork || !isObject(question) || question.teacherExcluded === true) return;
      const skill = exampleSkillOf(question);
      const entry = {
        questionId: text(question.questionId) || null,
        questionNumber,
        sectionId: text(section?.id) || `section-${sectionIndex + 1}`,
        kind: exampleKindOf(question) || null,
        standard: primaryStandardOf(question) || null,
        skill,
      };
      const claim = questionExampleClaim(question, lessonSupports);
      if (claim?.kind === 'own') {
        Object.assign(entry, { status: EXAMPLE_COVERAGE_STATUS.OWN, exampleId: claim.exampleId });
      } else if (claim?.kind === 'exempt') {
        Object.assign(entry, { status: EXAMPLE_COVERAGE_STATUS.EXEMPT, reason: claim.reason });
      } else {
        let checked = question;
        if (typeof prepareQuestion === 'function') {
          try { checked = prepareQuestion(question) || question; } catch { checked = question; }
        }
        const builtIn = builtInExampleSource(checked);
        if (builtIn) {
          Object.assign(entry, { status: EXAMPLE_COVERAGE_STATUS.BUILT_IN, builtIn });
        } else if (skill && coveredSkills.has(skill)) {
          Object.assign(entry, { status: EXAMPLE_COVERAGE_STATUS.EARLIER_SAME_SKILL, coveredBy: coveredSkills.get(skill) });
        } else {
          Object.assign(entry, { status: EXAMPLE_COVERAGE_STATUS.UNCOVERED, fillWith: exampleFillWith(checked) });
          if (claim?.kind === 'missing') entry.missingExample = claim.exampleId;
        }
      }
      if (skill && isCoveredStatus(entry.status) && !coveredSkills.has(skill)) {
        coveredSkills.set(skill, entry.questionId || `Question ${questionNumber}`);
      }
      questions.push(entry);
    });
  });

  return { questions, summary: summarizeClassworkExampleCoverage(questions) };
};

/** The totals of a list of coverage entries (several lessons' may be joined). */
export const summarizeClassworkExampleCoverage = (entries = []) => {
  const byStatus = emptyByStatus();
  const byKind = {};
  const byFill = { [EXAMPLE_FILL_WITH.GENERATOR]: 0, [EXAMPLE_FILL_WITH.AUTHORED_EXAMPLE]: 0 };
  list(entries).forEach((entry) => {
    if (!(entry?.status in byStatus)) return;
    byStatus[entry.status] += 1;
    if (entry.status !== EXAMPLE_COVERAGE_STATUS.UNCOVERED) return;
    const kind = entry.kind || 'unknown';
    byKind[kind] = (byKind[kind] || 0) + 1;
    if (entry.fillWith in byFill) byFill[entry.fillWith] += 1;
  });
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  const covered = byStatus.own + byStatus.builtIn + byStatus.earlierSameSkill;
  return { total, covered, exempt: byStatus.exempt, uncovered: byStatus.uncovered, byStatus, byKind, byFill };
};

/* ------------------------------------------------------------ the words */

/** "Worked examples: 5 of 8 classwork questions covered" (exempt questions need none, so they are not counted). */
export const coverageHeadline = (summary = {}) => {
  const needing = Math.max(0, (Number(summary.total) || 0) - (Number(summary.exempt) || 0));
  const covered = Number(summary.covered) || 0;
  return `Worked examples: ${covered} of ${needing} classwork question${needing === 1 ? '' : 's'} covered`;
};

/** The fill hint for an uncovered question, as a teacher reads it. */
export const fillWithText = (fillWith) => (fillWith === EXAMPLE_FILL_WITH.GENERATOR
  ? 'a built-in generator could cover it (platform work)'
  : 'needs a worked example written in the lesson');
