/*
 * THE ANSWER-KEY COVERAGE GATE (D10 Phase 1, P1-1; ANSWER_KEY_SERVER_SIDE_DESIGN.md
 * §3 "Proof" and risk R7; SI02).
 *
 * Every field a grader, the composed-workflow check, the printed answer key
 * (assignmentWorksheetPdfModel.js) or a tool's solution review READS from a
 * question must be either moved by the split (functions/shared/
 * assignmentKeySplit.mjs) or declared public below, with the reason. So a new
 * key field a grader starts reading cannot silently stay on students' devices:
 * this test fails until someone decides which it is. (The pattern of
 * serverGradingCoverageGate.test.mjs: derive the list from the code, require a
 * decision for each entry.)
 *
 * HOW "READS" IS FOUND. Not from source text: each fixture question is handed
 * to the real functions behind a recording proxy, which notes every field path
 * they read (array positions as [], the keys of a data-keyed map as *). A copy
 * made by spreading the question ({ ...question }) is not a read. Fields a
 * reader looks for and does not find count too: that is the reader saying the
 * field matters. The questions are every lesson that compiles (and each
 * Question Family slot's built instance), every raw question in
 * teacher-import-jsons/, docs/assignments/ and SAMPLE_*.json, the question type
 * catalog's examples, and one example for each tool no fixture uses.
 *
 * WHAT IT CANNOT SEE. A tool grader is handed empty work ({}), and some stop
 * before comparing the work with their key; the tool's solution review reads
 * that key instead, which is why reviews are traced. A field no reader touches
 * on any traced question is not listed here at all.
 *
 * "MOVED" IS THE SPLIT'S BEHAVIOUR, NOT ITS LIST: a question holding only that
 * path is split, and the value must leave the public question.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { answerLinesFromResolvedQuestion, solutionLinesFromResolvedQuestion } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { QUESTION_GRADERS } from '../../functions/shared/serverGrading/questionResponseGrading.mjs';
import { gradeComposedWorkflowCheck } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import * as ordinary from '../../functions/shared/ordinaryResponseGrading.mjs';
import { buildFieldGradingDefinition } from '../../functions/shared/legacyFieldGrading.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { QUESTION_TYPE_CATALOG } from '../../functions/shared/questionTypeCatalog.mjs';
import { splitQuestion } from '../../functions/shared/assignmentKeySplit.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/*
 * Objects keyed by data rather than by field name: their keys are collapsed
 * to `*` so that `matrices.A.rows` and `matrices.B.rows` are one decision.
 */
const DATA_KEYED_MAPS = Object.freeze([
  'matrices', 'startFrom', 'context', 'quantities', 'table.answers', 'tableAnswers', 'correctMatches', 'grading.table.values',
]);
const normalizePath = (dotted) => DATA_KEYED_MAPS.reduce((current, map) => {
  const prefix = `${map}.`;
  if (!current.startsWith(prefix)) return current;
  const rest = current.slice(prefix.length);
  const cut = rest.search(/[.[]/);
  return `${map}.*${cut === -1 ? '' : rest.slice(cut)}`;
}, dotted);

/** A proxy over `question` that adds every field path read to `reads`. */
const recording = (question, reads) => {
  const proxies = new WeakMap();
  const wrap = (target, at) => {
    if (!Array.isArray(target) && !isPlainObject(target)) return target;
    if (proxies.has(target)) return proxies.get(target);
    let described = null;
    const proxy = new Proxy(target, {
      // Spreading, Object.entries and JSON.stringify describe a field and then
      // get it: that is a copy, not a read.
      getOwnPropertyDescriptor(object, key) { described = key; return Reflect.getOwnPropertyDescriptor(object, key); },
      get(object, key, receiver) {
        const value = Reflect.get(object, key, receiver);
        if (typeof key !== 'string') return value;
        const copying = described === key;
        described = null;
        if (Array.isArray(object)) return /^\d+$/.test(key) ? wrap(value, `${at}[]`) : value;
        if (key === 'toJSON' || key in Object.prototype) return value;
        const child = normalizePath(at ? `${at}.${key}` : key);
        if (!copying) reads.add(child);
        return wrap(value, child);
      },
    });
    proxies.set(target, proxy);
    return proxy;
  };
  return wrap(question, '');
};

// --- the questions ------------------------------------------------------------------

const jsonFilesUnder = (relative) => {
  const files = [];
  const visit = (target) => {
    if (statSync(target).isDirectory()) readdirSync(target).sort().forEach((name) => visit(path.join(target, name)));
    else if (target.endsWith('.json')) files.push(target);
  };
  visit(path.join(repo, relative));
  return files;
};

// One realistic question for each tool grader no fixture exercises, as its
// own parity suite writes it (tests/tools/<tool>SharedGrading.test.mjs,
// kAudit_regressionCalculator.test.mjs).
const EXAMPLES = Object.freeze([
  { type: 'functionOperationsLab', prompt: 'Combine f and g.', f: { type: 'linear', a: 2, h: 0, k: 1 }, g: { type: 'linear', a: 1, h: 2, k: 0 }, operations: ['sum', 'quotient'], composeOrder: 'fOfG' },
  { type: 'constraintFunctionBuilder', prompt: 'Build the function.', constraints: [{ kind: 'family', value: 'exponential' }, { kind: 'continuity', value: 'continuous' }, { kind: 'behavior', value: 'decreasing' }] },
  { type: 'regressionCalculator', prompt: 'Run the regression.', sourceData: [[1, 2], [2, 4.1], [3, 5.9], [4, 8.2]], sourceMode: 'scatterplot' },
]);

const isRawQuestion = (value) => isPlainObject(value) && (
  (typeof value.type === 'string' && (typeof value.prompt === 'string' || Array.isArray(value.answerFields)))
  || typeof value.toolId === 'string'
);
const rawQuestionsIn = (node, out) => {
  if (Array.isArray(node)) { node.forEach((child) => rawQuestionsIn(child, out)); return out; }
  if (!isPlainObject(node)) return out;
  if (isRawQuestion(node)) { out.push(node); return out; }
  Object.values(node).forEach((child) => rawQuestionsIn(child, out));
  return out;
};

const tracedQuestions = () => {
  const questions = [];
  const files = [
    ...jsonFilesUnder('teacher-import-jsons'), ...jsonFilesUnder('docs/assignments'),
    ...readdirSync(repo).filter((name) => /^SAMPLE_.*\.json$/.test(name)).map((name) => path.join(repo, name)),
  ];
  files.forEach((file) => {
    const text = readFileSync(file, 'utf8');
    rawQuestionsIn(JSON.parse(text), []).forEach((question) => questions.push(question));
    try {
      const { assignmentV5 } = parseAssignmentBlueprintText(text);
      (assignmentV5?.sections || []).forEach((section) => (section.questions || []).forEach((question, index) => {
        questions.push(question);
        // A Question Family slot is graded as the instance built from it.
        if (question.questionFamily) {
          const built = resolveFamilyQuestionInstance({ question, assignmentId: path.basename(file), storageIndex: index });
          if (built?.question) questions.push(built.question);
        }
      }));
    } catch {
      // Not a lesson the intake compiles: its raw questions are traced above.
    }
  });
  Object.values(QUESTION_TYPE_CATALOG).forEach((entry) => { if (entry.example) questions.push(entry.example); });
  EXAMPLES.forEach((question) => questions.push(question));
  return questions;
};

const fieldsResponse = (question) => ({
  kind: 'fields', type: String(question.type || ''), value: '',
  fields: [
    ...(Array.isArray(question.answerFields) ? question.answerFields : []).map((field) => field?.id).filter(Boolean),
    ...Object.keys(question?.table?.answers || {}),
  ].map((id) => ({ id, value: '7', isComplete: true })),
});
const scalarResponse = (question) => ({ kind: 'scalar', type: String(question.type || ''), value: '7', fields: [] });

/** Each reader: what it does with one question (behind the recording proxy). */
const READERS = Object.freeze({
  server: (q, question) => [scalarResponse(question), fieldsResponse(question)].forEach((response) => gradeServerResponse({ question: q, response })),
  ordinary: (q) => [
    () => ordinary.gradeLiteralResponse(q, '7'), () => ordinary.gradeFractionResponse(q, '1/2'),
    () => ordinary.gradeOrderedPairResponse(q, '(1,2)'), () => ordinary.gradeSystemResponse(q, '(1,2)'),
    () => ordinary.gradeNumberLineResponse(q, 3), () => ordinary.gradeMultiAnswerResponse(q, { a: '7' }),
    () => ordinary.gradeTableResponse(q, { '0:1': '7' }), () => ordinary.serverGradingSupport(q),
  ].forEach((read) => { try { read(); } catch { /* the reads so far count */ } }),
  legacyField: (q) => buildFieldGradingDefinition(q),
  composedWorkflow: (q) => gradeComposedWorkflowCheck(q, {}),
  answerKeyPdf: (q) => { answerLinesFromResolvedQuestion(q); solutionLinesFromResolvedQuestion(q); },
  toolReview: (q) => buildToolSolutionReviewModel(q),
});

let traceRun = null;
const trace = () => {
  if (traceRun) return traceRun;
  const readers = new Map(); // path -> Set(reader)
  const graders = new Set();
  const note = (reader, reads) => reads.forEach((read) => {
    if (!readers.has(read)) readers.set(read, new Set());
    readers.get(read).add(reader);
  });
  const run = (reader, question, read) => {
    const reads = new Set();
    try { read(recording(question, reads)); } catch { /* the reads so far count */ }
    note(reader, reads);
    return reads;
  };
  const questions = tracedQuestions();
  questions.forEach((question) => {
    Object.entries(READERS).forEach(([reader, read]) => run(reader, question, (q) => read(q, question)));
    const toolId = String(question.toolId || question.type || '');
    if (TOOL_GRADERS[toolId]) {
      graders.add(`tool:${toolId}`);
      run(`tool:${toolId}`, question, (q) => TOOL_GRADERS[toolId].grade(q, {}));
    }
    Object.entries(QUESTION_GRADERS).forEach(([id, grader]) => {
      const reads = run(`question:${id}`, question, (q) => {
        [scalarResponse(question), fieldsResponse(question)].forEach((response) => {
          try { grader.grade(q, response); } catch { /* the reads so far count */ }
        });
      });
      if (reads.size) graders.add(`question:${id}`);
    });
  });
  traceRun = { questions: questions.length, readers, graders };
  return traceRun;
};

// --- moved by the split? --------------------------------------------------------------

const SENTINEL = '__split-coverage-sentinel__';
/** A question holding only `pattern` (`[]` one element, `*` one key), with a sentinel at the end. */
const questionWith = (pattern) => {
  const segments = pattern.split('.').flatMap((segment) => (segment.endsWith('[]') ? [segment.slice(0, -2), '[]'] : [segment]));
  const build = (index) => {
    if (index === segments.length) return SENTINEL;
    if (segments[index] === '[]') return [build(index + 1)];
    return { [segments[index] === '*' ? 'someKey' : segments[index]]: build(index + 1) };
  };
  return build(0);
};
const movedBySplit = (pattern) => !JSON.stringify(splitQuestion(questionWith(pattern)).publicQuestion).includes(SENTINEL);

// --- the decisions -----------------------------------------------------------------------

/*
 * FIELDS GRADERS READ THAT STAY ON THE PUBLIC QUESTION, BY REASON. An entry
 * ending in `.**` covers the field and everything under it.
 */
const PUBLIC_GRADER_READS = Object.freeze({
  'which grader runs and how it routes (no answer in it)': [
    'type', 'toolId', 'mode', 'secure', 'teacherExcluded', 'variants', 'differentiation', 'generator', 'questionFamily',
    'workflow', 'workflowProvenance.**', 'recipe', 'recipe.ask', 'recipe.name', 'gradingSurface', 'workspace', 'workspaceMode',
    'workspaceDifficulty', 'presentation', 'solveOnBalance', 'interaction', 'interactionMode', 'process', 'method',
    'responseMode', 'plotMode', 'graphMode', 'pointOnly', 'functionFamily', 'family', 'kind', 'task', 'modeling', 'notation',
    'sourceMode',
  ],
  // The device builds each student's version from these (design R10); the
  // derived values and the answer templates move.
  'how a generated or family item is drawn (design R10)': [
    'generator.kind', 'generator.functionTypes', 'generator.coefficientChoices', 'generator.hRange', 'generator.kRange',
    'generator.domainChoices.**',
  ],
  'question metadata a teacher sees (alignment, rigor, weight)': [
    'activityRole', 'alignments.**', 'dok', 'difficulty', 'difficultyBand', 'questionId', 'questionWeight',
    'questionWeightBasis.**', 'sectionId', 'role', 'isDOL', 'metadata', 'studentActions',
  ],
  'what the student reads: the prompt and its parts': [
    'prompt', 'stem', 'heading', 'directions', 'instructions', 'content', 'stimulus', 'supportingMath', 'mathDisplay', 'visual',
    'asymptotePrompt', 'axisOfSymmetryPrompt', 'behaviorPrompt', 'continuityPrompt', 'domainPrompt', 'equationPrompt',
    'extremeKindPrompt', 'extremePointPrompt', 'extremeValuePrompt', 'graphPrompt', 'modelPrompt', 'plotPrompt',
    'quantitiesPrompt', 'rangePrompt', 'tablePrompt', 'xInterceptExistsPrompt', 'xInterceptPrompt', 'xInterceptValuePrompt',
    'yInterceptExistsPrompt', 'yInterceptPrompt', 'yInterceptValuePrompt', 'zerosPrompt', 'groupNoun', 'leftLabel', 'rightLabel',
    'authoredPrompt',
  ],
  /*
   * Design P1-1: the options stay, the correct one goes. An answer box keeps
   * its label, its options and how it is compared (`equivalence`, `lineForm`,
   * `numberRules`: the form the answer must be written in); its answer moves.
   */
  'answer boxes and the options a student chooses from': [
    'answerFields', 'answerFields[].id', 'answerFields[].label', 'answerFields[].type', 'answerFields[].options',
    'answerFields[].choices', 'answerFields[].placeholder', 'answerFields[].prompt', 'answerFields[].instructions',
    'answerFields[].responseHint', 'answerFields[].unit', 'answerFields[].notation', 'answerFields[].inputMode',
    'answerFields[].inputProfile', 'answerFields[].toolProfile', 'answerFields[].inputContract',
    'answerFields[].inputContract.format', 'answerFields[].answerForm', 'answerFields[].answerFormat',
    'answerFields[].equivalence', 'answerFields[].lineForm', 'answerFields[].numberRules', 'answerFields[].allowArithmetic',
    'answerFields[].gradingMode', 'answerFields[].partialCredit', 'answerFields[].scoreWeight',
    'responseFields', 'responses', 'analysisRequests', 'analysisRequests[].id', 'analysisRequests[].kind',
    'analysisRequests[].label', 'analysisRequests[].feature', 'analysisRequests[].notation', 'analysisRequests[].allowNone',
    'analysisRequests[].answerMode', 'analysisRequests[].responseMode', 'fields', 'fields[].id', 'fields[].label', 'fields[].type',
    'behaviorChoices', 'domainChoices', 'extremeChoices', 'familyChoices', 'rangeChoices', 'quantityChoices', 'choiceBanks.**',
    'context', 'context.*', 'context.*.choices', 'categories', 'categories[].id', 'categories[].label', 'items', 'items[].id',
    'items[].label', 'scenarios', 'scenarios[].id', 'scenarios[].title', 'workflow[].choices', 'workflow[].items[].id',
    'expressions', 'expressions[].id', 'table', 'table.blanks', 'quantities',
  ],
  'how an answer is checked: what is asked, required, and how strict (no answer in it)': [
    'ask', 'askDefined', 'askDimensions', 'askEfficiency', 'askInverse', 'buildEquation', 'fillResult', 'judgeInverse',
    'justifySingular', 'decisionWeight', 'requiredCards', 'requiredComparisons', 'requireEndpointMarkers', 'requireGroupNames',
    'requireQuantities', 'requireQuantityRoles', 'requireRationale', 'requireRelationshipType', 'requireSketch', 'requireUnits',
    'requireValues', 'requireVerification', 'minimumExplanationCharacters', 'minimumScenarioCharacters', 'rationaleMinLength',
    'minGroups', 'maxGroups', 'constructionPolicy.**', 'axisSetup', 'axisSetup.required', 'axisSetup.requireScale', 'origin',
    'origin.required', 'origin.responseMode', 'exactSolution', 'includeUndefinedChecks', 'endpointRequirements', 'chooseXValues',
    'studentChoosesX', 'pointTasks', 'undefinedCount', 'displayCount', 'revealTargetTerm', 'allowInputChange', 'inverseBranch',
    'inverseReflection', 'fitChallengeClicks', 'slopeStep', 'interceptStep', 'snapStep', 'plotSnapStep', 'showEquations',
    'showExpansion', 'showEquation', 'showCoordinates', 'guidedSteps', 'reasoning', 'studentBuild', 'modelMetric',
    'includeHorizontalScale', 'requireInterpretation', 'operations', 'composeOrder', 'workflow[].id', 'workflow[].kind', 'workflow[].prompt', 'workflow[].notation',
    'workflow[].columns', 'workflow[].columns[].key', 'workflow[].columns[].label', 'workflow[].inputColumn',
    'workflow[].responseColumn', 'workflow[].graphMode', 'workflow[].showWhen', 'workflow[].showWhen.is',
    'workflow[].showWhen.stage', 'workflow[].source', 'workflow[].source.fromStage', 'workflow[].continuityStageId',
    'workflow[].xValues', 'workflow[].graph',
  ],
  /*
   * Design §1.1 "stimulus-derived keys" and R9: the student must see these to
   * answer, so no split can hide them. A grader reads them to compute the
   * answer from what is shown (a function's spec, a system, the matrices, the
   * polynomial, the data, a card on the board, the line Graphing2's own
   * instruction states).
   */
  'the item itself: what the screen draws or states (design §1.1, R9)': [
    'functionSpec.**', 'graph.**', 'graphBounds.**', 'equation.**', 'equations', 'equationLatex', 'equationAscii', 'formula',
    'formulaLatex', 'inequality', 'inequalityText', 'initialEquation', 'leftExpression', 'rightExpression', 'relations',
    'relationWorkspace', 'objective', 'solveFor', 'variable', 'variables', 'variableMeanings', 'relation',
    'matrices.**', 'matrix.**', 'startFrom.**', 'technology.**', 'operation', 'left.**', 'right.**', 'resultName',
    'targets', 'targets[].id', 'targets[].kind', 'targets[].label', 'targets[].description', 'targets[].row', 'targets[].col',
    'radicalEquation.**', 'candidates', 'candidateRoot', 'coefficients', 'dividend', 'divisor', 'firstPolynomial',
    'secondPolynomial', 'leftBinomial', 'rightBinomial', 'leftFactor', 'rightFactor', 'leadingCoefficient', 'roots.**',
    'factors.**', 'numeratorFactors.**', 'denominatorFactors.**', 'numeratorRoots', 'denominatorRoots',
    'f.**', 'g.**', 'x', 'inverseSeedX', 'sequence.**', 'compareN', 'sumN', 'missingIndex',
    'system.**', 'spatialModel.**', 'linearQuadratic.**', 'quadratic.**', 'inequalities.**', 'testPoint.**',
    'source.**', 'sourcePoints.**', 'givenPoints', 'points.**', 'rows.**', 'pairs.**', 'tableXValues',
    'sets.**', 'cardKinds', 'mixedSet.**', 'targetId', 'function.**', 'initial.**', 'parentPoint', 'target.**', 'targetLabel',
    'coordinates', 'applyResponseToGraph', 'line.**', 'slope', 'point', 'standard.**', 'value', 'orientation', 'referenceLine',
    'm', 'b', 'expressions[].expression', 'd1', 'd2', 'n1', 'n2', 'quantities[].id', 'quantities[].label', 'quantities[].unit',
    'focus', 'directrix.**', 'z.**', 'w.**', 'quarterTurns', 'base', 'exponent', 'h', 'k', 'p', 'y', 'offset',
    'startingModel', 'predictionX', 'sourceData.**', 'constraints.**',
  ],
});

const PUBLIC_ENTRIES = Object.entries(PUBLIC_GRADER_READS).flatMap(([reason, entries]) => entries.map((entry) => ({ entry, reason })));
const coversPath = (entry, dotted) => (entry.endsWith('.**')
  ? dotted === entry.slice(0, -3) || dotted.startsWith(`${entry.slice(0, -3)}.`) || dotted.startsWith(`${entry.slice(0, -3)}[`)
  : dotted === entry);
const declaredPublic = (dotted) => PUBLIC_ENTRIES.some(({ entry }) => coversPath(entry, dotted));

// --- the gate --------------------------------------------------------------------------

test('the trace is real: it reads the keys every grader is known to compare with', () => {
  const { questions, readers } = trace();
  assert.ok(questions > 1_000, `${questions} questions traced`);
  for (const [field, reader] of [
    ['answerFields[].answer', 'server'], ['acceptedAnswers', 'ordinary'], ['table.answers', 'server'], ['target', 'ordinary'],
    ['correctMatches', 'tool:graphScenarioMatch'], ['validSchemes', 'tool:openSortBoard'], ['grading', 'answerKeyPdf'],
    ['expressions[].contextMeaning', 'toolReview'], ['restrictions', 'tool:functionOperationsLab'],
  ]) {
    assert.ok(readers.get(field)?.has(reader), `${reader} reads ${field}`);
  }
  assert.ok(readers.get('context.*.value')?.size > 0, 'the Representation Bridge context answers are read');
});

test('every field a grader, the printed answer key or a solution review reads is moved by the split or declared public', () => {
  const unclassified = [...trace().readers.entries()]
    .filter(([dotted]) => !movedBySplit(dotted) && !declaredPublic(dotted))
    .map(([dotted, who]) => `${dotted}  (read by ${[...who].sort().join(', ')})`)
    .sort();
  assert.deepEqual(unclassified, [], [
    'These fields are read by a grader and stay on the public question with no decision.',
    'A key (an answer, an accepted answer, a correct choice, a solution, a tolerance): add it to KEY_FIELDS in',
    'functions/shared/assignmentKeySplit.mjs. Anything a student must see to answer: add it to PUBLIC_GRADER_READS here, under its reason.',
  ].join('\n'));
});

test('the public list stays true: the split moves nothing on it, and every entry is still read', () => {
  const { readers } = trace();
  const traced = [...readers.keys()];
  const contradictions = PUBLIC_ENTRIES.filter(({ entry }) => !entry.endsWith('.**') && movedBySplit(entry)).map(({ entry }) => entry);
  assert.deepEqual(contradictions, [], 'declared public, but the split moves it');
  const stale = PUBLIC_ENTRIES.filter(({ entry }) => !traced.some((dotted) => coversPath(entry, dotted))).map(({ entry }) => entry);
  assert.deepEqual(stale, [], 'declared public, but no reader reads it any more: delete the entry');
  const duplicates = PUBLIC_ENTRIES.map(({ entry }) => entry).filter((entry, index, all) => all.indexOf(entry) !== index);
  assert.deepEqual(duplicates, []);
});

/*
 * Question graders that no traced question reaches, and why their keys are
 * still covered: each accepts no response of its own (the slot is marked
 * through the composed workflow, or only on the device), and the ordinary
 * contract's own functions (traced above as `ordinary`) read the keys a
 * fraction drill and a number line compare with.
 */
const QUESTION_GRADERS_GRADED_ELSEWHERE = Object.freeze({
  fraction: 'device-only drill; gradeFractionResponse reads its key (traced as ordinary)',
  numberLine: 'device-only; gradeNumberLineResponse reads its target (traced as ordinary)',
  composedWorkflow: 'reached through gradeComposedWorkflowCheck (traced as composedWorkflow)',
  functionCharacteristics: 'a composed-workflow stage: marked through the composed workflow',
  figureMatch: 'a composed-workflow stage: marked through the composed workflow',
  graphChoicePreview: 'a composed-workflow stage: marked through the composed workflow',
});

test('every grader is exercised by a traced question, or says where its keys are read instead', () => {
  const { graders } = trace();
  const toolsMissing = Object.keys(TOOL_GRADERS).filter((id) => !graders.has(`tool:${id}`));
  assert.deepEqual(toolsMissing, [], 'a tool grader no fixture or example reaches: add an example question for it to EXAMPLES');
  const questionsMissing = Object.keys(QUESTION_GRADERS).filter((id) => !graders.has(`question:${id}`)).sort();
  assert.deepEqual(questionsMissing, Object.keys(QUESTION_GRADERS_GRADED_ELSEWHERE).sort());
});
