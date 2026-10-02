/*
 * PRE-FLIGHT FOR PROCESS MODE: A BOARD NO STUDENT COULD FINISH, OR THE SERVER
 * COULD NOT MARK, NEVER REACHES A CLASS.
 *
 * Two layers, both on the teacher's import path:
 *
 *   the tool schema (lmrProcessModel.mjs lmrProcessConfigProblems, through
 *   validateToolQuestion) refuses a configuration that is wrong on its face —
 *   an unknown mode or method, a method the GIVEN cannot use, a restriction
 *   that leaves a fact with no way to be established;
 *
 *   the Pre-Flight audit (src/platform/preflight/processModePreflight.js) works
 *   each version's mathematics — every method a version offers must verify
 *   when done right, every card it asks for must open, every crossing on a
 *   GIVEN graph must be pickable — and checks a generated version keeps the
 *   slot's mode and a stored value was measured for Process Mode.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import {
  auditAssignmentProcessMode,
  lostProcessSettings,
  processVersionProblems,
} from '../../src/platform/preflight/processModePreflight.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';

const board = (source, extra = {}) => ({
  questionId: 'pm-1',
  standard: 'A.3B',
  alignments: [{ framework: 'teks', code: 'A.3B', role: 'primary' }],
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  interactionMode: 'process',
  studentActions: ['connectLinearRepresentations'],
  difficultyBand: 2,
  dok: 2,
  prompt: 'Establish the key facts about this line, then build its other representations.',
  source,
  feedbackTiming: 'guided',
  ...extra,
});
const STANDARD = { kind: 'standardForm', equation: '2x - 4y = 12' };
const schemaErrors = (question) => validateToolQuestion({ ...question, toolId: 'representationBridge' }).errors;

const assignmentWith = (questions) => JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Process Mode Pre-Flight', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', feedbackMode: 'immediate', hintsAllowed: true, attemptsAllowed: 3, questions }],
});
const preflight = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  return { model, questions: model.isValid ? validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {}) : [] };
};

test('the schema refuses a Process Mode configuration that is wrong on its face, and every message says what to change', () => {
  const cases = [
    [{ interactionMode: 'guided' }, /interactionMode must be "worksheet" \(students fill in the board directly\) or "process"/],
    [{ interactionMode: undefined, process: { strategies: { slope: ['solveForY'] } } }, /Set interactionMode to "process", or remove the process settings/],
    [{ process: 'solveForY' }, /"process" must be an object/],
    [{ process: { strategies: {}, lockAll: true } }, /unknown setting\(s\) "lockAll"\. The only setting is "strategies"/],
    [{ process: { strategies: ['solveForY'] } }, /process\.strategies must map a fact/],
    [{ process: { strategies: { area: ['solveForY'] } } }, /names "area", which is not a fact a student finds\. Use slope, yIntercept, xIntercept or point/],
    [{ process: { strategies: { slope: [] } } }, /process\.strategies\.slope must be a non-empty list of methods/],
    [{ process: { strategies: { slope: ['guessAndCheck'] } } }, /names "guessAndCheck", which is not a Process Mode method/],
    [{ process: { strategies: { slope: ['graphCrossing'] } } }, /names "graphCrossing" \(find it on the graph\), which cannot establish the slope/],
    [{ process: { strategies: { slope: ['riseRun'] } } }, /names "riseRun" \(rise over run\), which works from a graph — this board's GIVEN is a standard form equation/],
  ];
  for (const [patch, pattern] of cases) {
    const errors = schemaErrors(board(STANDARD, patch));
    assert.ok(errors.some((error) => pattern.test(error)), `${JSON.stringify(patch)}:\n${errors.join('\n')}`);
  }
  // A restriction that leaves a fact nothing can establish names the root of it, once.
  const circular = schemaErrors(board({ kind: 'table', rows: [{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 5 }] }, { process: { strategies: { slope: ['twoPointFormula'], yIntercept: ['solveForB'], point: ['evaluateAtX'] } } }));
  assert.equal(circular.length, 1, circular.join('\n'));
  assert.match(circular[0], /the slope can never be established on this board: every method allowed for it \(use two of your points\) first needs two points on the line, which cannot be established without it\. Allow another method in process\.strategies\./);
  // Valid configurations pass — the mode alone, and a restriction the GIVEN can use.
  assert.deepEqual(schemaErrors(board(STANDARD)), []);
  assert.deepEqual(schemaErrors(board(STANDARD, { process: { strategies: { slope: ['twoPointFormula'], xIntercept: ['substituteZero'] } } })), []);
  assert.deepEqual(schemaErrors(board(STANDARD, { interactionMode: 'worksheet' })), []);
});

test('each version\'s mathematics: every card must open, every offered method must verify, every crossing on a GIVEN graph must be pickable', () => {
  assert.deepEqual(processVersionProblems(board(STANDARD)), []);
  assert.deepEqual(processVersionProblems(board({ kind: 'graph', points: [[0, 1], [3, -1]] })), []);
  // A graph whose x-intercept falls between the gridlines no student can pick.
  const offGrid = processVersionProblems(board({ kind: 'graph', points: [[0, 0.3], [1, 1.7]] }));
  assert.equal(offGrid.length, 1);
  assert.match(offGrid[0], /could not pick \(-0\.214, 0\) exactly, because it falls between the gridlines/);
  // A card no pathway can open on this line.
  const flat = processVersionProblems(board({ kind: 'slopeIntercept', equation: 'y = 5' }));
  assert.ok(flat.some((problem) => /no complete process can open x-intercept, Graph 1 \(intercepts\)/.test(problem)), flat.join('\n'));
  // Worksheet boards are not this audit's business.
  assert.deepEqual(processVersionProblems({ ...board(STANDARD), interactionMode: 'worksheet' }), []);
});

test('a generated version that dropped the slot\'s mode would grade a different activity: the comparison catches it', () => {
  assert.deepEqual(lostProcessSettings({ interactionMode: 'process' }, { interactionMode: 'process' }), []);
  assert.deepEqual(lostProcessSettings({ interactionMode: 'process' }, {}), ['interactionMode']);
  assert.deepEqual(lostProcessSettings({ interactionMode: 'process', process: { strategies: { slope: ['solveForY'] } } }, { interactionMode: 'process' }), ['process']);
  assert.deepEqual(lostProcessSettings({}, {}), [], 'a Worksheet slot has nothing to lose');
  // And the family-backed boards keep theirs on every version Pre-Flight samples.
  const family = preflight(readFileSync(new URL('../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json', import.meta.url), 'utf8'));
  assert.deepEqual(family.model.processMode.errors, []);
  assert.deepEqual(family.model.processMode.rows.map((row) => [row.questionId, row.interactionMode, row.familyBacked]), [
    ['lmr-cw-1', 'process', true],
    ['lmr-cw-2', 'process', true],
    ['lmr-cw-3', 'process', true],
    ['lmr-pr-1', 'process', true],
    ['lmr-pr-2', 'worksheet', true],
    ['lmr-dol-1', 'process', true],
  ]);
  assert.match(family.model.processMode.notes[0], /^Process Mode: Classwork Q1, Classwork Q2, Classwork Q3, Practice Q1, DOL Q1 — students establish key facts .* Worksheet Mode: Practice Q2\.$/);
});

test('through the whole import chain: a bad Process Mode board blocks publishing with its reason; a good one publishes', () => {
  const good = preflight(assignmentWith([board(STANDARD), board({ kind: 'table', rows: [{ x: 1, y: -1 }, { x: 2, y: 1 }, { x: 3, y: 3 }] }, { questionId: 'pm-2' })]));
  assert.equal(good.model.isValid, true, good.model.errors.join('\n'));
  assert.deepEqual(good.model.processMode.errors, []);
  assert.equal(good.questions.every((question) => question.interactionMode === 'process'), true, 'the mode survives the compiler');
  const bad = preflight(assignmentWith([board(STANDARD, { process: { strategies: { slope: ['riseRun'] } } })]));
  assert.equal(bad.model.isValid, false);
  assert.ok(bad.model.errors.some((error) => /riseRun.*works from a graph/.test(error)), bad.model.errors.join('\n'));
  const offGrid = preflight(assignmentWith([board({ kind: 'graph', points: [[0, 0.3], [1, 1.7]] })]));
  assert.equal(offGrid.model.isValid, false);
  assert.ok(offGrid.model.errors.some((error) => /Question 1 \(Classwork Q1\): in Process Mode, on its graph a student could not pick/.test(error)), offGrid.model.errors.join('\n'));
});

test('a value measured for a Worksheet board is flagged when the board becomes a Process Mode board — never changed', () => {
  const compiled = preflight(assignmentWith([{ ...board(STANDARD), interactionMode: 'worksheet' }])).questions[0];
  assert.equal(compiled.questionWeightBasis?.source, 'auto');
  const flipped = { ...compiled, interactionMode: 'process', activityRole: 'classwork' };
  const audit = auditAssignmentProcessMode({}, [flipped]);
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.warnings.length, 1);
  assert.match(audit.warnings[0], /automatic grade value ×4\.25 was measured before it became a Process Mode board\. As a Process Mode board it assesses .* \(about ×4\.5\)\. Set its value in the question editor if it should change; MathMaster never changes a stored value on its own\./);
  assert.equal(flipped.questionWeight, compiled.questionWeight, 'the audit changed nothing');
  // Imported as a Process Mode board, its value is measured as one: no warning.
  const imported = preflight(assignmentWith([board(STANDARD)]));
  assert.deepEqual(imported.model.processMode.warnings, []);
  assert.equal(imported.questions[0].questionWeight, 4.5);
});
