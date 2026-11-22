/*
 * WE-E: THE PLANE AND INEQUALITY REPLAY
 * (docs/platform/WORKED_EXAMPLES.md sections 4 and 9;
 * src/platform/supports/workedExample/planeReplay.js).
 *
 * What is proved here:
 *   1. the example draws what the student's tool records: the record each
 *      replay builds is marked correct by that tool's own grader, a record
 *      with one thing wrong is not, and what a slide draws (the line through
 *      two points, the crossing point, a test point's verdict, the shaded
 *      region) is the engine's own;
 *   2. the moves, in order: the intercept, rise and run, the line; for an
 *      inequality the line solid or dashed, a test point, the shading; for a
 *      system the overlap; then the check;
 *   3. solid or dashed and above or below follow the sign, and an inequality
 *      in standard form is solved for y first, the sign turning around where
 *      the y-term is negative;
 *   4. what is refused;
 *   5. every plane item of the published lessons that gets a replay gets a
 *      sibling: other numbers, the same kind, never a give-away;
 *   6. the section rules are WE-A's, and what the player is handed to draw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { asQuestionEngineReceivesIt } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import graphing2Grader from '../../functions/shared/serverGrading/tools/graphing2.mjs';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { lineFromPoints } from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import { solveTwoLines } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  boundaryFromSlopeIntercept,
  feasibleRegionPolygon,
  satisfiesBoundary,
} from '../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { exampleSlides, planeSummary } from '../../src/platform/supports/workedExample/exampleSlides.js';
import {
  exampleOpensByItself,
  exampleSectionRule,
  fadedExample,
  lessonExampleContext,
  workedExampleFor,
} from '../../src/platform/supports/workedExample/examplePlayer.js';
import {
  PLANE_BOUNDS,
  PLANE_REPLAY_TOOL,
  planeReplayToolOf,
  planeSiblingFor,
  replayPlaneExample,
  riseAndRun,
} from '../../src/platform/supports/workedExample/planeReplay.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const ops = (replay) => replay.steps.map((step) => step.board.operation);
const named = (step) => step.board.lines.map((line) => line.name);
const lineQuestion = (m, b) => ({ type: 'graphing2', mode: 'slopeIntercept', line: { m, b }, graphBounds: { ...PLANE_BOUNDS } });
const systemQuestion = (m1, b1, m2, b2) => ({ type: 'systemsWorkspace', mode: 'linear', interaction: 'construct', system: { m1, b1, m2, b2 }, graph: { ...PLANE_BOUNDS } });
const inequalityQuestion = (expectedConstraints, extra = {}) => ({
  type: 'systemsWorkspace',
  mode: 'inequalities',
  expectedConstraints,
  sourceConstraints: expectedConstraints.map((constraint) => `y ${constraint.relation} ${constraint.m}x + ${constraint.b}`),
  studentBuild: { rewrite: false, boundary: true, lineStyle: true, shading: true },
  graph: { ...PLANE_BOUNDS },
  ...extra,
});

// Every published lesson's plane items, as QuestionEngine receives them.
const lessonItems = (() => {
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file);
    else if (name.endsWith('.json')) files.push(file);
  });
  walk(path.join(ROOT, 'teacher-import-jsons'));
  const items = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = parseAssignmentBlueprintText(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const questions = (parsed.questions || []).map(asQuestionEngineReceivesIt);
    questions.forEach((question, index) => {
      if (['constructLine', 'graphSystem', 'solveInequalitySystem'].includes((question.studentActions || [])[0])) items.push({ file: path.basename(file), question, questions, index });
    });
  }
  return items;
})();

// ------------------------------------------- 1. what the student's tool records

test('the example draws what the tool records: each replay\'s record is marked correct by that tool\'s own grader', () => {
  // A line: the two plotted points, in order.
  const line = replayPlaneExample(lineQuestion(2, -3));
  assert.equal(line.ok, true, line.error);
  assert.deepEqual(line.record, { points: [[0, -3], [1, -1]] });
  assert.equal(graphing2Grader.grade(lineQuestion(2, -3), line.record).isCorrect, true);
  assert.equal(graphing2Grader.grade(lineQuestion(2, -3), { points: [[0, -3], [1, 0]] }).isCorrect, false, 'a second point off the line is not the line');
  const through = lineFromPoints(...line.record.points);
  assert.deepEqual([through.m, through.b], [2, -3], 'the line drawn is the line through the plotted points');
  assert.deepEqual(line.steps[2].board.plane.lines.map((drawn) => [drawn.m, drawn.b, drawn.style]), [[2, -3, 'solid']]);

  // A system: both lines' points, the classification and the crossing point.
  const systemItem = systemQuestion(-0.5, -1, 2, -6);
  const system = replayPlaneExample(systemItem);
  assert.equal(system.ok, true, system.error);
  assert.deepEqual(system.record, {
    construction: [{ points: [{ x: 0, y: -1 }, { x: 2, y: -2 }] }, { points: [{ x: 0, y: -6 }, { x: 1, y: -4 }] }],
    classification: 'one',
    x: '2',
    y: '-2',
  });
  assert.equal(systemsWorkspaceGrader.grade(systemItem, system.record).isCorrect, true);
  assert.equal(systemsWorkspaceGrader.grade(systemItem, { ...system.record, x: '3' }).isCorrect, false);
  const crossing = solveTwoLines(systemItem.system);
  assert.deepEqual([crossing.type, crossing.x, crossing.y], ['one', 2, -2]);
  const cross = system.steps.find((step) => step.board.operation === 'intersection');
  assert.deepEqual(cross.board.plane.points.map((point) => [point.x, point.y]), [[2, -2]], 'the crossing point drawn is the engine\'s');

  // An inequality: the boundary's two points with the slope and intercept, the style, the shading point, the marked point's answers.
  const inequalityItem = inequalityQuestion([{ m: 4, b: -6, relation: '>' }], { reasoning: { testPoint: true }, testPoint: { x: -2, y: 1 } });
  const inequality = replayPlaneExample(inequalityItem);
  assert.equal(inequality.ok, true, inequality.error);
  const [row] = inequality.record.build;
  assert.deepEqual(
    [row.method, row.x1, row.y1, row.x2, row.y2, row.point1Plotted, row.point2Plotted, row.style, row.shadePoint],
    ['slopeIntercept', '0', '-6', '1', '-2', true, true, 'dashed', [0, -3]],
  );
  assert.deepEqual(inequality.record.teacherPointResponse, { perInequality: ['yes'], overall: 'yes' });
  assert.equal(systemsWorkspaceGrader.grade(inequalityItem, inequality.record).isCorrect, true);
  // One thing wrong in the record, and the builder's grader no longer marks it correct.
  const wrong = (change) => systemsWorkspaceGrader.grade(inequalityItem, { ...inequality.record, build: [{ ...row, ...change }] }).isCorrect;
  assert.equal(wrong({ style: 'solid' }), false, 'the wrong line style');
  assert.equal(wrong({ shadePoint: [0, -9] }), false, 'the wrong side shaded');
  assert.equal(wrong({ y2: '0' }), false, 'a second point off the boundary');
  assert.equal(systemsWorkspaceGrader.grade(inequalityItem, { ...inequality.record, teacherPointResponse: { perInequality: ['no'], overall: 'no' } }).isCorrect, false, 'the marked point answered wrongly');
  // The shaded region drawn is the engine's own polygon, and the test point's verdict is the engine's.
  const boundary = boundaryFromSlopeIntercept(4, -6, '>');
  const shade = inequality.steps.find((step) => step.board.operation === 'shade');
  const polygon = feasibleRegionPolygon([boundary], PLANE_BOUNDS).map((point) => (Array.isArray(point) ? point : [point.x, point.y]));
  assert.deepEqual(shade.board.plane.regions[0].points, polygon.map(([x, y]) => [x, y]));
  assert.ok(shade.board.plane.regions[0].points.every(([x, y]) => satisfiesBoundary(boundary, x, y) || Math.abs(y - (4 * x - 6)) < 1e-6));
  const tested = inequality.steps.find((step) => step.board.operation === 'testPoint');
  assert.equal(satisfiesBoundary(boundary, 0, 0), true);
  assert.equal(tested.board.lines.at(-1).name, 'True');
});

// ------------------------------------------------------ 2. the moves, in order

test('the moves in order: the intercept, rise and run, the line; solid or dashed, a test point, the shading; the overlap; the check', () => {
  const line = replayPlaneExample(lineQuestion(-0.5, 2));
  assert.deepEqual(ops(line), ['plotIntercept', 'riseAndRun', 'drawLine', 'check']);
  assert.deepEqual(line.steps.map(named), [
    ['The equation', 'Plotted'],
    ['Start at', 'Rise and run', 'Plotted'],
    ['Through', 'The line'],
    ['The equation', 'With the value put in', 'The point is on the line'],
  ]);
  assert.equal(line.steps[1].show, 'The slope is $-\\frac{1}{2}$: from $(0, 2)$ go down $1$ and right $2$. Plot $(2, 1)$.');
  // The picture grows with the moves: a point, a second point with the rise and the run, then the line.
  assert.deepEqual(line.steps.map((step) => [step.board.plane.points.length, step.board.plane.arrows.length, step.board.plane.lines.length]), [[1, 0, 0], [2, 2, 0], [2, 0, 1], [2, 0, 1]]);
  assert.deepEqual(line.steps[1].board.plane.arrows, [{ from: [0, 2], to: [0, 1] }, { from: [0, 1], to: [2, 1] }], 'the rise, then the run');
  assert.ok(line.steps.every((step) => step.why && step.show), 'every move says why');

  const system = replayPlaneExample(systemQuestion(-0.5, -1, 2, -6));
  assert.deepEqual(ops(system), ['plotIntercept', 'riseAndRun', 'drawLine', 'plotIntercept', 'riseAndRun', 'drawLine', 'intersection', 'check']);
  assert.deepEqual(named(system.steps.at(-1)), ['Equation 1', 'Equation 2', 'Both equations are true at']);
  assert.equal(system.steps[3].board.plane.lines.length, 1, 'the first line stays while the second is drawn');
  assert.equal(system.answer, '$(2, -2)$');

  const one = replayPlaneExample(inequalityQuestion([{ m: -0.5, b: 2, relation: '<=' }]));
  assert.deepEqual(ops(one), ['plotIntercept', 'riseAndRun', 'drawLine', 'testPoint', 'shade']);
  assert.deepEqual(named(one.steps[2]), ['Through', 'The line, solid']);
  assert.deepEqual(named(one.steps[3]), ['The inequality', 'With the point put in', 'True']);
  assert.deepEqual(named(one.steps[4]), ['The test point', 'Shaded']);
  assert.equal(one.steps[4].board.plane.regions.length, 1);

  const two = replayPlaneExample(inequalityQuestion([{ m: 2, b: 2, relation: '>' }, { m: -3, b: 3, relation: '<=' }], { reasoning: { testPoint: true }, testPoint: { x: -2, y: 1 } }));
  assert.deepEqual(ops(two), ['plotIntercept', 'riseAndRun', 'drawDashed', 'testPoint', 'shade', 'plotIntercept', 'riseAndRun', 'drawLine', 'testPoint', 'shade', 'overlap', 'check']);
  const overlap = two.steps.at(-2);
  assert.equal(overlap.board.plane.regions.length, 1, 'the overlap is one region');
  const both = [boundaryFromSlopeIntercept(2, 2, '>'), boundaryFromSlopeIntercept(-3, 3, '<=')];
  const expected = feasibleRegionPolygon(both, PLANE_BOUNDS).map((point) => (Array.isArray(point) ? point : [point.x, point.y]));
  assert.deepEqual(overlap.board.plane.regions[0].points, expected.map(([x, y]) => [x, y]), 'and it is the engine\'s own region for both');
  assert.deepEqual(named(two.steps.at(-1)), ['Inequality 1', 'Inequality 2', 'A solution']);
  // A marked point outside the solution is said to be outside.
  const outside = replayPlaneExample(inequalityQuestion([{ m: 2, b: 2, relation: '>' }], { reasoning: { testPoint: true }, testPoint: { x: 3, y: -1 } }));
  assert.equal(outside.steps.at(-1).board.lines.at(-1).name, 'Not a solution');
  assert.deepEqual(outside.record.teacherPointResponse, { perInequality: ['no'], overall: 'no' });
});

// ------------------------------------ 3. solid or dashed, above or below, y first

test('solid or dashed and above or below follow the sign; standard form is solved for y first, and the sign turns around', () => {
  for (const [relation, style, side] of [['>', 'dashed', 'above'], ['>=', 'solid', 'above'], ['<', 'dashed', 'below'], ['<=', 'solid', 'below']]) {
    const replay = replayPlaneExample(inequalityQuestion([{ m: 2, b: 3, relation }]));
    assert.equal(replay.ok, true, `${relation}: ${replay.error}`);
    const draw = replay.steps[2];
    assert.equal(draw.board.plane.lines[0].style, style, relation);
    assert.match(draw.why, style === 'solid' ? /includes "or equal to".*the line is solid/ : /does not include "equal to".*the line is dashed/);
    assert.equal(replay.record.build[0].style, style);
    const shade = replay.steps.at(-1);
    assert.match(shade.show, new RegExp(`${side} the line\\.$`), relation);
    // The origin is below y = 2x + 3: true for < and <=, false for > and >=, and the shading follows it.
    const holds = side === 'below';
    assert.equal(replay.steps[3].board.lines.at(-1).name, holds ? 'True' : 'False');
    assert.match(shade.show, holds ? /makes it true, so shade the side with/ : /makes it false, so shade the side without/);
    assert.equal(satisfiesBoundary(boundaryFromSlopeIntercept(2, 3, relation), ...replay.record.build[0].shadePoint), true);
  }
  // 2x − y < −3 is y > 2x + 3: dividing by −1 turns the sign around.
  const negative = replayPlaneExample(inequalityQuestion([{ m: 2, b: 3, relation: '>', source: { A: 2, B: -1, C: -3, relation: '<' } }]));
  assert.equal(negative.ok, true, negative.error);
  assert.equal(ops(negative)[0], 'rewrite');
  assert.deepEqual(negative.steps[0].board.lines.map((line) => [line.name, line.latex]), [['Start with', '2x - y < -3'], ['Solved for y (the sign turns around)', 'y > 2x + 3']]);
  assert.match(negative.steps[0].why, /negative number turns the inequality sign around/);
  assert.match(negative.prompt, /\$2x - y < -3\$/, 'the problem is given in standard form');
  // −2x + y ≥ 3 is y ≥ 2x + 3: no negative division, the sign stays.
  const positive = replayPlaneExample(inequalityQuestion([{ m: 2, b: 3, relation: '>=', source: { A: -2, B: 1, C: 3, relation: '>=' } }]));
  assert.deepEqual(positive.steps[0].board.lines.map((line) => line.name), ['Start with', 'Solved for y']);
  // A standard form that is not the same half-plane is not played.
  const wrong = replayPlaneExample(inequalityQuestion([{ m: 2, b: 3, relation: '>', source: { A: 2, B: -1, C: -3, relation: '>' } }]));
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /not the same half-plane/);
  // Rise and run are read off the slope in lowest terms.
  assert.deepEqual([riseAndRun(3), riseAndRun(-0.5), riseAndRun(2 / 3), riseAndRun(-1.5), riseAndRun(0), riseAndRun(Math.PI)], [{ rise: 3, run: 1 }, { rise: -1, run: 2 }, { rise: 2, run: 3 }, { rise: -3, run: 2 }, null, null]);
});

// ---------------------------------------------------------- 4. what is refused

test('a question the tool would not record as drawn is not played', () => {
  const refusal = (question) => {
    const replay = replayPlaneExample(question);
    assert.equal(replay.ok, false, JSON.stringify(question).slice(0, 120));
    assert.equal(replay.steps, undefined, 'nothing is played');
    return replay.error;
  };
  assert.match(refusal(lineQuestion(Math.PI, 1)), /slope that is a small fraction/);
  assert.match(refusal(lineQuestion(2, 0.5)), /whole-number y-intercept/);
  assert.match(refusal(lineQuestion(3, 9)), /off the plane/);
  assert.match(refusal(systemQuestion(2, 1, 2, 1)), /the same line/);
  assert.match(refusal(systemQuestion(2, 1, -1, 3)), /do not cross at a grid point/);
  assert.match(refusal(inequalityQuestion([{ m: 2, b: 0, relation: '>' }])), /non-zero y-intercept/);
  assert.match(refusal(inequalityQuestion([{ m: 1, b: 1, relation: '>' }, { m: 2, b: 2, relation: '>' }, { m: 3, b: 3, relation: '>' }])), /more than two/);
  assert.match(refusal(inequalityQuestion([{ m: 1, b: 1, relation: '>' }], { modeling: { variables: [] } })), /not a build-the-graph inequality question/);
  assert.match(refusal({ type: 'multiAnswer' }), /not a question answered on the plane/);
  // Which questions the replay covers at all.
  assert.equal(planeReplayToolOf(lineQuestion(2, 1)), PLANE_REPLAY_TOOL.LINE);
  assert.equal(planeReplayToolOf({ type: 'graphing2', mode: 'standardForm' }), null);
  assert.equal(planeReplayToolOf(systemQuestion(1, 1, 2, 2)), PLANE_REPLAY_TOOL.SYSTEM);
  assert.equal(planeReplayToolOf({ ...systemQuestion(1, 1, 2, 2), interaction: 'analyze' }), null, 'a system the student does not draw');
  assert.equal(planeReplayToolOf(inequalityQuestion([{ m: 1, b: 1, relation: '>' }])), PLANE_REPLAY_TOOL.INEQUALITY);
});

// ------------------------------------------------------- 5. always a sibling

test('every plane item that gets a replay gets a sibling: other numbers, the same kind, never a give-away', () => {
  const counts = { constructLine: 0, graphSystem: 0, solveInequalitySystem: 0 };
  const relationOf = (constraint) => String(constraint.relation).replace('≤', '<=').replace('≥', '>=');
  for (const { file, question } of lessonItems) {
    const where = `${file} ${question.questionId}`;
    const example = workedExampleFor(question, { sectionRole: 'classwork' });
    if (!example || example.format !== 'replay') continue;
    const tool = example.tool;
    counts[tool] += 1;
    assert.equal(tool, (question.studentActions || [])[0], where);
    assert.equal(similarExampleIsSafe(question, { prompt: example.prompt, steps: example.steps.map((step) => `${step.show} ${step.why}`), answer: example.answer }), true, where);
    assert.ok(example.steps.every((step) => step.board?.plane && step.board.lines.length >= 2 && step.why), `${where}: every move has its picture, its lines and its why`);
    for (const seed of [0, 1, 2]) {
      const sibling = planeSiblingFor(question, { seed });
      assert.ok(sibling, `${where}: a sibling for seed ${seed}`);
      assert.deepEqual(planeSiblingFor(question, { seed }), sibling, 'the same seed gives the same sibling');
      if (tool === 'constructLine') {
        assert.notEqual(sibling.line.m, question.line.m, where);
        assert.notEqual(sibling.line.b, question.line.b, where);
        assert.equal(Math.sign(sibling.line.m), Math.sign(question.line.m), `${where}: the slope keeps its sign`);
        assert.equal(Number.isInteger(sibling.line.m), Number.isInteger(question.line.m), `${where}: whole stays whole, a fraction stays a fraction`);
      }
      if (tool === 'graphSystem') {
        const item = solveTwoLines(question.system);
        const drawn = solveTwoLines(sibling.system);
        assert.equal(drawn.type, 'one', `${where}: the example's lines cross once, whatever the item's do`);
        assert.ok(!(item.type === 'one' && drawn.x === item.x && drawn.y === item.y), `${where}: not the item's crossing point`);
        assert.notDeepEqual(sibling.system, question.system);
      }
      if (tool === 'solveInequalitySystem') {
        const itemConstraints = question.expectedConstraints;
        assert.equal(sibling.expectedConstraints.length, itemConstraints.length, where);
        sibling.expectedConstraints.forEach((constraint, index) => {
          const item = itemConstraints[index];
          // The item's own sign, read as y compared with mx + b.
          const itemRelation = item.B !== undefined && Number(item.B) < 0 ? { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }[relationOf(item)] : relationOf(item);
          assert.equal(constraint.relation, itemRelation, `${where}: constraint ${index + 1} keeps its sign, so solid or dashed and its side`);
          const itemM = item.m !== undefined && item.A === undefined ? Number(item.m) : -Number(item.A) / Number(item.B);
          const itemB = item.m !== undefined && item.A === undefined ? Number(item.b) : -Number(item.C) / Number(item.B);
          assert.ok(Math.abs(constraint.m - itemM) > 1e-6 && Math.abs(constraint.b - itemB) > 1e-6, `${where}: other numbers`);
          assert.equal(Math.sign(constraint.m), Math.sign(itemM), where);
        });
      }
    }
    // The example never says how many solutions the student's own system has.
    if (tool === 'graphSystem') assert.doesNotMatch(JSON.stringify(example), /one solution|no solution|infinitely many/i, where);
  }
  // The built-in replays reach the items they are for (the rest keep what they had: see the limits in WORKED_EXAMPLES.md).
  assert.ok(counts.constructLine >= 5, `constructLine: ${counts.constructLine}`);
  assert.ok(counts.graphSystem >= 12, `graphSystem: ${counts.graphSystem}`);
  assert.ok(counts.solveInequalitySystem >= 40, `solveInequalitySystem: ${counts.solveInequalitySystem}`);
  // An inequality item given in standard form with a negative y-term gets a sibling whose sign turns around too.
  const standard = lessonItems.find(({ question }) => /^\d*x-\d*y</.test(String((question.sourceConstraints || [])[0]).replace(/\s+/g, '')) && question.expectedConstraints?.length === 1);
  assert.ok(standard, 'the lessons have such an item');
  const replay = replayPlaneExample(planeSiblingFor(standard.question, { seed: 0 }));
  assert.equal(ops(replay)[0], 'rewrite');
  assert.equal(replay.steps[0].board.lines[1].name, 'Solved for y (the sign turns around)');
  // An item the replay does not cover keeps what it had.
  const modeling = lessonItems.find(({ question }) => question.modeling);
  if (modeling) assert.equal(planeSiblingFor(modeling.question), null);
  assert.equal(planeSiblingFor({ type: 'graphing2', mode: 'standardForm' }), null);
  // Asked only whether it has an example, nothing is drawn.
  const first = lessonItems.find(({ question }) => (question.studentActions || [])[0] === 'solveInequalitySystem' && workedExampleFor(question, { sectionRole: 'classwork' }));
  const asked = workedExampleFor(first.question, { sectionRole: 'classwork', asReplay: false });
  assert.ok(asked && asked.steps.every((step) => !step.board));
});

// ------------------------------------ 6. the section rules, and what is drawn

test('the section rules are WE-A\'s: it opens by itself on a new Classwork skill, fades on the next, and is never offered on a DOL', () => {
  const lesson = lessonItems.filter(({ file }) => file === 'T2_L4_Graphing_Inequalities_in_Two_Variables.json');
  const { questions } = lesson[0];
  const covered = lesson.filter(({ question }) => question.activityRole === 'classwork' && workedExampleFor(question, { sectionRole: 'classwork' })?.format === 'replay');
  assert.ok(covered.length >= 2, 'the lesson has Classwork inequality items with a replay');
  const contextOf = ({ index }) => lessonExampleContext({ questions, index, sectionRole: 'classwork' });
  const rule = exampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed: true });
  const first = contextOf(covered[0]);
  const second = contextOf(covered[1]);
  assert.deepEqual([first.newSkill, first.fadeTurn], [true, false]);
  assert.deepEqual([second.newSkill, second.fadeTurn], [false, true]);
  const example = workedExampleFor(covered[0].question, first);
  assert.equal(exampleOpensByItself({ rule, newSkill: true, example }), true);
  // Faded: the first move only. No line, no shading and no answer.
  const faded = exampleSlides(fadedExample(workedExampleFor(covered[1].question, second)));
  assert.equal(faded.length, 2);
  assert.equal(faded[1].board.plane.lines.length, 0);
  assert.equal(faded[1].board.plane.regions.length, 0);
  // Asked for every step, a faded example still stops before the line is drawn.
  const most = exampleSlides(fadedExample({ ...example, handOverAfter: example.steps.length }));
  assert.ok(most.every((slide) => !slide.board || (slide.board.plane.lines.length === 0 && slide.board.plane.regions.length === 0)));
  // Practice: on request. DOL, quiz and test: never offered.
  assert.deepEqual([exampleSectionRule({ sectionRole: 'practice', activityRole: 'practice', hintsAllowed: true }).opensByItself, exampleSectionRule({ sectionRole: 'dol', activityRole: 'dol', hintsAllowed: false }).offered], [false, false]);
  assert.equal(exampleSectionRule({ sectionRole: 'test', activityRole: 'test', hintsAllowed: true }).offered, false);
});

test('what the player is handed: a picture with a name in words, and the same move as lines', () => {
  const replay = replayPlaneExample(inequalityQuestion([{ m: 2, b: 2, relation: '>' }, { m: -3, b: 3, relation: '<=' }]));
  const slides = exampleSlides({ source: 'family', format: 'replay', prompt: replay.prompt, steps: replay.steps, answer: replay.answer });
  assert.deepEqual(slides.map((slide) => slide.kind), ['problem', ...replay.steps.map(() => 'step'), 'answer']);
  assert.ok(slides.filter((slide) => slide.kind === 'step').every((slide) => slide.board.plane.bounds.xMin === -10 && slide.board.plane.bounds.yMax === 10));
  // The picture's name says what is on the plane so far.
  assert.equal(planeSummary(replay.steps[0].board.plane), 'Coordinate plane. Point (0, 2).');
  assert.equal(planeSummary(replay.steps[2].board.plane), 'Coordinate plane. Points (0, 2), (1, 4). One line: dashed.');
  assert.equal(planeSummary(replay.steps[9].board.plane), 'Coordinate plane. Point (0, 0). 2 lines: dashed, solid. 2 shaded regions.');
  assert.equal(planeSummary(null), '');
  // The player draws the picture from the board, and still imports only React and its slides.
  const source = read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx');
  assert.match(source, /\{board\.plane \? <PlaneFigure plane=\{board\.plane\} \/> : null\}/);
  assert.match(source, /role="img"\s+aria-label=\{planeSummary\(plane\)\}/);
  assert.match(source, /strokeDasharray=\{drawn\.style === 'dashed' \? '7 5' : undefined\}/);
  const imports = [...source.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((match) => match[1]);
  assert.deepEqual(imports, ['react', './exampleSlides.js']);
  assert.deepEqual([...read('src/platform/supports/workedExample/exampleSlides.js').matchAll(/^import /gm)], []);
});
