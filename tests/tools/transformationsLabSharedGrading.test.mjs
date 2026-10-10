import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import transformationsGrader from '../../functions/shared/serverGrading/tools/transformationsLab.mjs';
import declaration, {
  TRANSFORMATIONS_LAB_MODES,
} from '../../functions/shared/serverGrading/declarations/transformationsLab.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { matchesNumericAnswer, parseNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  TRANSFORMATION_FAMILIES,
  mapParentPoint,
  mappedPointIsCorrect,
  normalizeTransformationSpec,
  transformationDescriptor,
  transformationGraphScore,
  transformationParameterScore,
  transformedAnchor,
} from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * TRANSFORMATIONS LAB IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every mode — and
 * that verdict must be the one the lab's old inline Check reached, except for
 * the documented, pinned differences (blank parameter boxes, untouched
 * pre-filled work, non-numeric plotted points).
 */

const COMPONENT = 'src/tools/transformations/TransformationsLab.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'transformationsLab';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(transformationsGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, mode: server.mode, serverReason: server.reason };
};

const partIds = (result) => result.parts.map((part) => part.id);
const failedIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

/* ------------------------------------------------------------------ */
/* the old inline Check, as a parity oracle                            */
/* ------------------------------------------------------------------ */

// Verbatim from TransformationsLab.jsx before the shared grader, fed the same
// UI-shaped state (the boxes' text, the plotted points). Each mode's work
// keys are the component's own state names, so one work object drives both.
const legacyCheck = (question, work) => {
  const mode = question.mode || 'match';
  const requestedFamily = question.family || question.function?.type || question.type;
  const family = TRANSFORMATION_FAMILIES.includes(requestedFamily) ? requestedFamily : 'quadratic';
  const targetSpec = normalizeTransformationSpec({ type: family, ...question.target }, family);
  const investigationSpec = normalizeTransformationSpec({ type: family, ...(question.function || question.target) }, family);
  const graphBounds = question.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 9 };
  const showB = question.includeHorizontalScale === true || question.target?.b != null || question.function?.b != null || question.initial?.b != null;
  if (mode === 'match' || mode === 'identify') {
    // With no b box the lab's b state never left its starting value.
    const { a, h, k } = work;
    const b = showB ? work.b : String(question.initial?.b ?? 1);
    const studentSpec = normalizeTransformationSpec({ type: family, a, b, h, k, base: targetSpec.base }, family);
    const student = { a: Number(a), b: Number(b), h: Number(h), k: Number(k) };
    const result = mode === 'match'
      ? transformationGraphScore(studentSpec, targetSpec, { xMin: graphBounds.xMin, xMax: graphBounds.xMax, tolerance: 0.02 })
      : transformationParameterScore(student, investigationSpec, 0.01);
    return { isCorrect: result.isCorrect, score: result.score };
  }
  const anchor = transformedAnchor(investigationSpec);
  const parentPoint = question.parentPoint || anchor.parentPoint;
  if (mode === 'pointMap') {
    const { mappedX, mappedY } = work;
    const expectedMappedPoint = mapParentPoint(parentPoint, investigationSpec);
    const response = [parseNumericAnswer(mappedX), parseNumericAnswer(mappedY)];
    const bothEntered = response.every((value) => value != null);
    const checks = bothEntered && expectedMappedPoint
      ? [matchesNumericAnswer(mappedX, expectedMappedPoint[0], 0.01), matchesNumericAnswer(mappedY, expectedMappedPoint[1], 0.01)]
      : [false, false];
    return { isCorrect: bothEntered && mappedPointIsCorrect(response, parentPoint, investigationSpec, 0.01), score: checks.filter(Boolean).length / 2 };
  }
  if (mode === 'plotTransform') {
    const plottedPoints = work.plottedPoints;
    const sourcePoints = Array.isArray(question.sourcePoints) ? question.sourcePoints : [];
    const expectedTransformedPoints = sourcePoints.map((point) => mapParentPoint(point, investigationSpec)).filter(Boolean);
    const expectedCount = expectedTransformedPoints.length;
    const matched = plottedPoints.reduce((count, point, index) => {
      const expected = expectedTransformedPoints[index];
      const correct = expected
        && Math.abs(Number(point?.[0]) - Number(expected?.[0])) <= 0.01
        && Math.abs(Number(point?.[1]) - Number(expected?.[1])) <= 0.01;
      return count + (correct ? 1 : 0);
    }, 0);
    return { isCorrect: expectedCount > 0 && plottedPoints.length === expectedCount && matched === expectedCount, score: expectedCount ? matched / expectedCount : 0 };
  }
  if (mode === 'describe') {
    const descriptor = transformationDescriptor(investigationSpec);
    const checks = [
      work.reflection === (descriptor.reflection ? 'yes' : 'no'),
      work.scaleKind === descriptor.verticalScaleKind,
      matchesNumericAnswer(work.scaleFactor, descriptor.verticalScale, 0.01),
      work.horizontalReflection === (descriptor.horizontalReflection ? 'yes' : 'no'),
      work.horizontalScaleKind === descriptor.horizontalScaleKind,
      matchesNumericAnswer(work.horizontalScaleFactor, descriptor.horizontalScale, 0.01),
      work.horizontalDirection === descriptor.horizontalDirection,
      matchesNumericAnswer(work.horizontalDistance, descriptor.horizontalDistance, 0.01),
      work.verticalDirection === descriptor.verticalDirection,
      matchesNumericAnswer(work.verticalDistance, descriptor.verticalDistance, 0.01),
    ];
    return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length };
  }
  // anchor — and, through the Work View action, every unrecognised mode.
  const checks = [matchesNumericAnswer(work.anchorX, anchor.point[0], 0.01), matchesNumericAnswer(work.anchorY, anchor.point[1], 0.01)];
  return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 };
};

const assertLegacyParity = (question, work, label = JSON.stringify(work)) => {
  const result = grade(question, work);
  const legacy = legacyCheck(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, legacy.isCorrect, `${label}: isCorrect matches the old Check`);
  assert.equal(result.score, legacy.isCorrect ? 1 : legacy.score, `${label}: score matches the old Check`);
  return result;
};

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

// The component's own routing, read from its source: `questionData.mode ||
// '<default>'`, the six `{mode === '<view>' ? <>` panels, and the primary
// action chain whose final `else` is the Check every other mode gets.
const componentRouting = (() => {
  const fallback = code.match(/const mode = questionData\.mode \|\| '(\w+)';/)?.[1];
  assert.ok(fallback, 'the lab reads questionData.mode with a default');
  const panels = [...code.matchAll(/\{mode === '(\w+)' \? <>/g)].map((match) => match[1]);
  assert.equal(panels.length, 6, 'the lab renders six mode panels');
  const chain = region(code, 'const primaryAction = ', '\n  const clearPlottedPoints', 'primary action chain');
  const chained = [...chain.matchAll(/mode === '(\w+)'\s*\n?\s*\? \{ id: '[\w-]+'/g)].map((match) => match[1]);
  const finalElse = chain.match(/: \{ id: '([\w-]+)', label: '([^']+)', onAction: check \};\s*$/);
  assert.ok(finalElse, 'the action chain ends in one fallback Check');
  const unchained = panels.filter((mode) => !chained.includes(mode));
  assert.equal(unchained.length, 1, 'exactly one panel is reached only through the fallback');
  // The fallback Check is that panel's own Check (same label on its button).
  const panelBody = region(code, `{mode === '${unchained[0]}' ? <>`, '</> : null}', `${unchained[0]} panel`);
  assert.ok(panelBody.includes(`>${finalElse[2]}</button>`), 'the fallback action is the remaining panel\'s Check');
  return { fallback, panels, unrecognised: unchained[0] };
})();
const componentMode = (question) => {
  const mode = question.mode || componentRouting.fallback;
  return componentRouting.panels.includes(mode) ? mode : componentRouting.unrecognised;
};

test('every mode the lab renders is declared shared-server, contract v1, default match', () => {
  assert.equal(GRADING_MANIFEST.transformationsLab, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, componentRouting.fallback);
  assert.deepEqual([...TRANSFORMATIONS_LAB_MODES].sort(), [...componentRouting.panels].sort());
  assert.deepEqual(Object.keys(declaration.modes).sort(), [...componentRouting.panels].sort());
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is shared-server`);
    assert.equal(entry.blocker, null);
  }
  assert.deepEqual(Object.keys(transformationsGrader.modeGraders).sort(), Object.keys(declaration.modes).sort());
  assert.deepEqual([...transformationsGrader.problems], []);
});

test('declared mode resolution reproduces the lab\'s routing, including unknown, padded, mis-cased and non-string modes', () => {
  assert.equal(componentRouting.unrecognised, 'anchor', 'an unrecognised mode gets the defining-feature Check');
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 0 }, { mode: false },
    ...TRANSFORMATIONS_LAB_MODES.map((mode) => ({ mode })),
    { mode: 'unknownView' }, { mode: ' match ' }, { mode: 'Match' }, { mode: 'pointmap' }, { mode: 'Anchor' },
    { mode: 5 }, { mode: ['identify'] }, { mode: { toString: () => 'identify' } }, { mode: 'constructor' }, { mode: 'toString' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(question.mode)}`);
  }
  // The manifest's generic fallback would grade a padded ' match ' as the
  // match view. The lab shows no panel for it and its only Check is the
  // anchor Check, so that is what is graded.
  const padded = assertLegacyParity(q({ mode: ' match ', family: 'quadratic', function: { a: 1, h: 2, k: 3 } }), { anchorX: '2', anchorY: '3' });
  assert.equal(padded.mode, 'anchor');
  assert.equal(padded.isCorrect, true);
  assert.equal(grade(q({}), { a: '1', h: '0', k: '0' }).mode, 'match');
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

// Work keys per mode — the component's state names, which the grader reads.
const WORK_KEYS = {
  parameters: ['a', 'h', 'k'],
  parametersWithB: ['a', 'b', 'h', 'k'],
  pointMap: ['mappedX', 'mappedY'],
  plotTransform: ['plottedPoints'],
  describe: ['reflection', 'scaleKind', 'scaleFactor', 'horizontalReflection', 'horizontalScaleKind', 'horizontalScaleFactor', 'horizontalDirection', 'horizontalDistance', 'verticalDirection', 'verticalDistance'],
  anchor: ['anchorX', 'anchorY'],
};
const shorthandKeys = (literal) => literal.replace(/[{}\s]/g, '').split(',').filter(Boolean);

test('the lab grades every Check through the shared grader and reports the same work it submits', () => {
  assert.match(code, /import transformationsGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/transformationsLab\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);

  // The work object, per mode, is exactly the grader's work shape.
  const parameterWork = code.match(/const parameterWork = showB \? (\{[^}]+\}) : (\{[^}]+\});/);
  assert.ok(parameterWork, 'parameter work: b only when the lab shows a b box');
  assert.deepEqual(shorthandKeys(parameterWork[1]), WORK_KEYS.parametersWithB);
  assert.deepEqual(shorthandKeys(parameterWork[2]), WORK_KEYS.parameters);
  const workChain = region(code, 'const work = ', 'useReportToolWork(work);', 'work chain');
  assert.match(workChain, /^const work = mode === 'match' \|\| mode === 'identify'\s*\? parameterWork/);
  const branch = (mode) => workChain.match(new RegExp(`mode === '${mode}'\\s*\\? (\\{[^}]+\\})`))?.[1];
  assert.deepEqual(shorthandKeys(branch('pointMap')), WORK_KEYS.pointMap);
  assert.deepEqual(shorthandKeys(branch('plotTransform')), WORK_KEYS.plotTransform);
  assert.deepEqual(shorthandKeys(branch('describe')), WORK_KEYS.describe);
  assert.deepEqual(shorthandKeys(workChain.match(/: (\{[^}]+\});\s*$/)[1]), WORK_KEYS.anchor, 'every other mode reports the anchor boxes');
  assert.match(code, /: \{ anchorX, anchorY \};\n\s*useReportToolWork\(work\);/, 'the live work is reported right where it is built');

  const check = region(code, 'const check = () => {', '\n  };', 'check handler');
  assert.match(check, /const result = gradeToolCheck\(transformationsGrader, questionData, work\);/);
  assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode, family, parts: result\.parts \}\);/,
    'submits the shared verdict, the same work, and only mode + family + parts');
  assert.doesNotMatch(check, /checks|matches|expected|===|Spec|descriptor|anchor\./, 'the handler computes no verdict of its own');

  // Every Check in the lab — the six inline buttons and the six Work View
  // actions — is that handler.
  assert.equal((code.match(/onClick=\{check\}/g) || []).length, 6);
  const chain = region(code, 'const primaryAction = ', '\n  const clearPlottedPoints', 'primary action chain');
  assert.equal((chain.match(/onAction: check\b/g) || []).length, 6);
  assert.doesNotMatch(chain, /onAction: (?!check\b)/);
});

test('the inline verdict code and answer-key metadata are gone from the component', () => {
  assert.doesNotMatch(code, /matchesNumericAnswer|parseNumericAnswer|transformationGraphScore|transformationParameterScore|mappedPointIsCorrect|transformationDescriptor|expectedMappedPoint/);
  assert.doesNotMatch(code, /checkParameters|checkPointMap|checkPlotTransform|checkDescription|checkAnchor/);
  assert.doesNotMatch(code, /metadata\?\.(checks|matched|expectedCount)/, 'feedback reads the shared parts, not a browser verdict');
  // The question is read through the same helper the grader uses.
  assert.match(code, /\} = resolveTransformationsQuestion\(questionData\);/);
  assert.match(code, /const studentSpec = useMemo\(\(\) => studentTransformationSpec\(\{ family, base: targetSpec\.base \}, \{ a, b, h, k \}\)/);
});

/* ------------------------------------------------------------------ */
/* match                                                               */
/* ------------------------------------------------------------------ */

const MATCH = q({ mode: 'match', family: 'absolute', target: { a: -2, h: 1, k: 3 } });
const MATCH_KEY = { a: '-2', h: '1', k: '3' };

test('match: the graph on the target is correct; equivalent parameter sets and number forms are accepted', () => {
  const correct = assertLegacyParity(MATCH, MATCH_KEY);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.equal(correct.score, 1);
  assert.equal(correct.mode, 'match');
  assert.deepEqual(partIds(correct), ['graph']);

  for (const work of [
    { a: '-2.0', h: ' 1 ', k: '3e0' },
    { a: '-2', h: '1', k: '3.015' }, // every sample within the lab's 0.02
  ]) assert.equal(assertLegacyParity(MATCH, work).isCorrect, true, JSON.stringify(work));
  assert.equal(assertLegacyParity(MATCH, { a: '-2', h: '1', k: '3.03' }).isCorrect, false, 'outside 0.02');

  // Match grades the GRAPH, so any parameters that draw it are right.
  const absoluteWithB = q({ mode: 'match', family: 'absolute', includeHorizontalScale: true, target: { a: 2, h: 1, k: 3 } });
  for (const work of [{ a: '1', b: '2', h: '1', k: '3' }, { a: '1', b: '-2', h: '1', k: '3' }, { a: '2', b: '1', h: '1', k: '3' }]) {
    assert.equal(assertLegacyParity(absoluteWithB, work).isCorrect, true, JSON.stringify(work));
  }
  const line = q({ mode: 'match', family: 'linear', target: { a: 2, h: 1, k: 0 } });
  assert.equal(assertLegacyParity(line, { a: '2', h: '0', k: '-2' }).isCorrect, true, '2(x − 1) is 2x − 2');

  // The base of an exponential comes from the target, as the lab draws it.
  const exponential = q({ mode: 'match', family: 'exponential', target: { a: 1, h: -1, k: 2, base: 3 } });
  assert.equal(assertLegacyParity(exponential, { a: '1', h: '-1', k: '2' }).isCorrect, true);
  assert.equal(assertLegacyParity(exponential, { a: '1', h: '0', k: '2' }).isCorrect, false);
});

test('match: partial credit is the share of sampled points that agree, over the graphBounds window the student sees', () => {
  const target = q({ mode: 'match', family: 'absolute', target: { a: 1, h: 0, k: 0 } });
  // |x + 2| − 2 coincides with |x| exactly for x ≥ 0 — 41 of the 82 samples.
  const halfway = { a: '1', h: '-2', k: '-2' };
  const partial = assertLegacyParity(target, halfway);
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.isComplete, true);
  assert.equal(partial.score, 41 / 82);
  assert.equal(partial.parts[0].credit, 41 / 82);

  // Over a window that only shows x ≥ 0 the two graphs are indistinguishable,
  // so the lab marks it correct — and the grader samples the same window.
  const rightHalf = { ...target, graphBounds: { xMin: 0, xMax: 7, yMin: -2, yMax: 9 } };
  assert.equal(assertLegacyParity(rightHalf, halfway).isCorrect, true);
  // A window that authors only the y-range keeps the default x-range.
  const yOnly = { ...target, graphBounds: { yMin: -2, yMax: 9 } };
  assert.equal(assertLegacyParity(yOnly, halfway).score, 41 / 82);

  const wrong = assertLegacyParity(MATCH, { a: '2', h: '1', k: '3' });
  assert.equal(wrong.isCorrect, false);
  assert.ok(wrong.score < 0.1, 'a reflected V meets the target only at its vertex');
});

test('match: a hidden b cannot be supplied, a shown one is graded', () => {
  // No b box: whatever a client sends as b is not the student's work.
  const hidden = assertLegacyParity(MATCH, { ...MATCH_KEY, b: '5' });
  assert.equal(hidden.isCorrect, true);
  assert.equal(hidden.parts[0].response, 'a=-2, h=1, k=3');
  const shown = q({ ...MATCH, includeHorizontalScale: true });
  assert.equal(assertLegacyParity(shown, { ...MATCH_KEY, b: '5' }).isCorrect, false);
  assert.equal(assertLegacyParity(shown, { ...MATCH_KEY, b: '1' }).isCorrect, true);
});

test('match: a blank box is incomplete and never correct (was read as 0)', () => {
  const zeroH = q({ mode: 'match', family: 'absolute', target: { a: 2, h: 0, k: -3 } });
  const work = { a: '2', h: '', k: '-3' };
  // Before: Number('') is 0, so the blank h drew (and graded) as h = 0.
  assert.equal(legacyCheck(zeroH, work).isCorrect, true);
  const result = grade(zeroH, work);
  assert.equal(result.isComplete, false);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 1, 'the drawn graph still overlaps; the score is unchanged');
  assert.equal(grade(zeroH, { a: '2', h: '0', k: '-3' }).isCorrect, true, 'typing 0 is graded as before');
  assert.equal(grade(zeroH, { a: '2', h: '0', k: '-3' }).isComplete, true, 'and is complete');
});

test('match / identify: untouched starting values are not complete, but an explicit Check is graded as before', () => {
  // The boxes start at 1, 0, 0 (no `initial`). That work is what the student
  // was handed, so a deadline must not submit it on their behalf.
  const untouched = assertLegacyParity(MATCH, { a: '1', h: '0', k: '0' });
  assert.equal(untouched.isComplete, false);
  assert.equal(untouched.isCorrect, false);
  const identifyQuestion = q({ mode: 'identify', family: 'quadratic', function: { a: 3, h: 0, k: 0 } });
  const identifyUntouched = assertLegacyParity(identifyQuestion, { a: '1', h: '0', k: '0' });
  assert.equal(identifyUntouched.isComplete, false);
  assert.equal(identifyUntouched.score, 0.75, 'the old partial credit for an explicit Check is kept');
  assert.equal(grade(identifyQuestion, { a: '3', h: '0', k: '0' }).isComplete, true);

  // Authored starting values are the untouched state instead.
  const authored = q({ mode: 'identify', family: 'quadratic', function: { a: 3, h: -1, k: 2 }, initial: { a: 3, h: 0, k: 0 } });
  assert.equal(grade(authored, { a: '3', h: '0', k: '0' }).isComplete, false);
  assert.equal(grade(authored, { a: '1', h: '0', k: '0' }).isComplete, true, 'changed from the authored start');
  // A b box that starts at its authored value is part of the untouched state.
  const withB = q({ mode: 'identify', family: 'absolute', function: { a: 1, b: 2, h: 0, k: 0 }, initial: { b: 1 } });
  assert.equal(grade(withB, { a: '1', b: '1', h: '0', k: '0' }).isComplete, false);
  assert.equal(grade(withB, { a: '1', b: '2', h: '0', k: '0' }).isCorrect, true);
  assert.equal(grade(withB, { a: '1', b: '2', h: '0', k: '0' }).isComplete, true);
});

test('match / identify: unauthored defaults (quadratic, target 1, 1, 0, 0) are the lab\'s', () => {
  const bare = q({});
  const untouched = assertLegacyParity(bare, { a: '1', h: '0', k: '0' });
  assert.equal(untouched.mode, 'match');
  assert.equal(untouched.isCorrect, true, 'the default target is the starting graph — still correct on Check');
  assert.equal(untouched.isComplete, false, 'but never auto-submitted untouched');
  const retyped = assertLegacyParity(bare, { a: '1.0', h: '0', k: '0' });
  assert.equal(retyped.isComplete, true);
  assert.equal(retyped.isCorrect, true);
  assert.equal(assertLegacyParity(bare, { a: '1', h: '0', k: '1' }).isCorrect, false);
  // An unrecognised family falls back to quadratic, as the screen does.
  const unknownFamily = q({ mode: 'match', family: 'sinusoid', target: { a: 2, h: 1, k: 0 } });
  assert.equal(assertLegacyParity(unknownFamily, { a: '2', h: '1', k: '0' }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* identify                                                            */
/* ------------------------------------------------------------------ */

const IDENTIFY = q({ mode: 'identify', family: 'quadratic', function: { a: -0.5, h: 2, k: -1 } });
const IDENTIFY_KEY = { a: '-0.5', h: '2', k: '-1' };

test('identify: a, b, h, k are each a part; partial credit is the share right', () => {
  const correct = assertLegacyParity(IDENTIFY, IDENTIFY_KEY);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.equal(correct.score, 1);
  assert.deepEqual(partIds(correct), ['a', 'b', 'h', 'k']);
  // With no b box, b is the lab's fixed 1 and always counts — four checks.
  assert.equal(correct.parts[1].response, '1');

  for (const work of [{ a: '-.5', h: '2.0', k: '-1' }, { a: '-5e-1', h: ' 2', k: '-1.009' }]) {
    assert.equal(assertLegacyParity(IDENTIFY, work).isCorrect, true, JSON.stringify(work));
  }
  // Number() never read a fraction in a type="number" box; it still does not.
  assert.equal(assertLegacyParity(IDENTIFY, { ...IDENTIFY_KEY, a: '-1/2' }).isCorrect, false);

  const partial = assertLegacyParity(IDENTIFY, { ...IDENTIFY_KEY, h: '-2' });
  assert.equal(partial.score, 0.75);
  assert.deepEqual(failedIds(partial), ['h']);
  assert.equal(assertLegacyParity(IDENTIFY, { ...IDENTIFY_KEY, a: '-0.52' }).isCorrect, false, 'outside 0.01');
});

// This used to pin the opposite: a graph-identical parameter set (|2(x − 1)|
// is 2|x − 1|) was marked wrong. The student only sees the graph, which does
// not single out the question's own a and b, so Job K (defect 2e) accepts
// every set that draws the same function — and still marks a different graph
// wrong, parameter by parameter as before.
test('identify: a graph-identical but different parameter set is correct; a different graph is not', () => {
  const absolute = q({ mode: 'identify', family: 'absolute', function: { a: 2, b: 1, h: 1, k: 3 } });
  const result = assertLegacyParity(absolute, { a: '1', b: '2', h: '1', k: '3' });
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  assert.deepEqual(failedIds(result), []);
  assert.equal(assertLegacyParity(absolute, { a: '2', b: '1', h: '1', k: '3' }).isCorrect, true);
  const different = assertLegacyParity(absolute, { a: '1', b: '1.5', h: '1', k: '3' });
  assert.equal(different.isCorrect, false);
  assert.equal(different.score, 0.5);
  assert.deepEqual(failedIds(different), ['a', 'b']);
});

test('identify: a blank box is incomplete and never correct (was read as 0)', () => {
  const zeroH = q({ mode: 'identify', family: 'quadratic', function: { a: 2, h: 0, k: 3 } });
  const work = { a: '2', h: '', k: '3' };
  assert.equal(legacyCheck(zeroH, work).isCorrect, true, 'before: the blank h matched h = 0');
  const result = grade(zeroH, work);
  assert.equal(result.isComplete, false);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0.75);
  assert.deepEqual(failedIds(result), ['h']);
  assert.equal(grade(zeroH, { a: '2', h: '0', k: '3' }).isCorrect, true, 'typing 0 is graded as before');
});

/* ------------------------------------------------------------------ */
/* pointMap                                                            */
/* ------------------------------------------------------------------ */

// (x, y) = (2, 4) maps to (x/b + h, ay + k) = (2/0.5 − 1, 2·4 + 3) = (3, 11).
const POINT_MAP = q({ mode: 'pointMap', family: 'quadratic', function: { a: 2, b: 0.5, h: -1, k: 3 }, parentPoint: [2, 4] });
const POINT_MAP_KEY = { mappedX: '3', mappedY: '11' };

test('pointMap: both coordinates, fractions and U+2212 accepted, credit only once both are entered', () => {
  const correct = assertLegacyParity(POINT_MAP, POINT_MAP_KEY);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.deepEqual(partIds(correct), ['mapped-x', 'mapped-y']);
  for (const work of [{ mappedX: '6/2', mappedY: '33/3' }, { mappedX: ' 3.005 ', mappedY: '11.0' }]) {
    assert.equal(assertLegacyParity(POINT_MAP, work).isCorrect, true, JSON.stringify(work));
  }
  const negative = q({ ...POINT_MAP, function: { a: 2, b: 0.5, h: -10, k: -20 } });
  assert.equal(assertLegacyParity(negative, { mappedX: '−6', mappedY: '−12' }).isCorrect, true);

  const xOnly = assertLegacyParity(POINT_MAP, { mappedX: '3', mappedY: '12' });
  assert.equal(xOnly.score, 0.5);
  assert.deepEqual(failedIds(xOnly), ['mapped-y']);
  const swapped = assertLegacyParity(POINT_MAP, { mappedX: '11', mappedY: '3' });
  assert.equal(swapped.score, 0);

  // The lab awards nothing until both are entered, even a right x.
  const half = assertLegacyParity(POINT_MAP, { mappedX: '3', mappedY: '' });
  assert.equal(half.isComplete, false);
  assert.equal(half.isCorrect, false);
  assert.equal(half.score, 0);
});

test('pointMap: unauthored defaults (parent point = the family\'s anchor, identity function)', () => {
  const bare = q({ mode: 'pointMap' });
  assert.equal(assertLegacyParity(bare, { mappedX: '0', mappedY: '0' }).isCorrect, true);
  const blank = assertLegacyParity(bare, { mappedX: '', mappedY: '' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false, 'a blank box is never the origin');
  const exponential = q({ mode: 'pointMap', family: 'exponential', function: { a: 3, h: 1, k: -2 } });
  assert.equal(assertLegacyParity(exponential, { mappedX: '1', mappedY: '1' }).isCorrect, true, '(0, 1) → (1, 3·1 − 2)');
});

/* ------------------------------------------------------------------ */
/* plotTransform                                                       */
/* ------------------------------------------------------------------ */

// y = (x − 2) − 1: S(−2,−2) → (0,−3), S(0,0) → (2,−1), S(2,2) → (4,1).
const PLOT = q({ mode: 'plotTransform', family: 'linear', function: { type: 'linear', a: 1, h: 2, k: -1 }, sourcePoints: [[-2, -2], [0, 0], [2, 2]] });
const PLOT_KEY = { plottedPoints: [[0, -3], [2, -1], [4, 1]] };

test('plotTransform: every image in plotting order; partial credit per point', () => {
  const correct = assertLegacyParity(PLOT, PLOT_KEY);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.deepEqual(partIds(correct), ['P1', 'P2', 'P3']);
  assert.equal(assertLegacyParity(PLOT, { plottedPoints: [[0.004, -3], [2, -1.005], [4, 1]] }).isCorrect, true, 'within 0.01');
  assert.deepEqual(failedIds(assertLegacyParity(PLOT, { plottedPoints: [[0.02, -3], [2, -1], [4, 1]] })), ['P1'], 'x outside 0.01');
  assert.deepEqual(failedIds(assertLegacyParity(PLOT, { plottedPoints: [[0, -3], [2, -1.02], [4, 1]] })), ['P2'], 'y outside 0.01');

  const twoRight = assertLegacyParity(PLOT, { plottedPoints: [[0, -3], [2, -1], [4, 2]] });
  assert.equal(twoRight.score, 2 / 3);
  assert.deepEqual(failedIds(twoRight), ['P3']);
  // Order is the answer's order: the same three points reversed match one.
  const reversed = assertLegacyParity(PLOT, { plottedPoints: [[4, 1], [2, -1], [0, -3]] });
  assert.equal(reversed.isCorrect, false);
  assert.equal(reversed.score, 1 / 3);

  // Reflections and an inside scale: (2, 1) → (2/−2, −1·1) = (−1, −1).
  const reflected = q({ mode: 'plotTransform', family: 'quadratic', function: { a: -1, b: -2, h: 0, k: 0 }, sourcePoints: [[2, 1], [0, 0]] });
  assert.equal(assertLegacyParity(reflected, { plottedPoints: [[-1, -1], [0, 0]] }).isCorrect, true);
});

test('plotTransform: completeness is exactly one placed point per image', () => {
  const short = assertLegacyParity(PLOT, { plottedPoints: [[0, -3], [2, -1]] });
  assert.equal(short.isComplete, false);
  assert.equal(short.isCorrect, false);
  assert.equal(short.score, 2 / 3);
  const extra = assertLegacyParity(PLOT, { plottedPoints: [...PLOT_KEY.plottedPoints, [5, 5]] });
  assert.equal(extra.isComplete, false);
  assert.equal(extra.isCorrect, false, 'one point too many is not the graph');
  const empty = assertLegacyParity(PLOT, { plottedPoints: [] });
  assert.equal(empty.isComplete, false);
  assert.equal(empty.score, 0);

  // A source point the transformation cannot carry is dropped, so the images
  // (and the points to plot) close up — exactly as the lab counts them.
  const gap = q({ ...PLOT, sourcePoints: [[-2, -2], [1, 'not a number'], [2, 2]] });
  const closed = assertLegacyParity(gap, { plottedPoints: [[0, -3], [4, 1]] });
  assert.equal(closed.isCorrect, true);
  assert.deepEqual(partIds(closed), ['P1', 'P2']);

  // No source points: nothing to plot, nothing to grade as correct.
  const bare = assertLegacyParity(q({ mode: 'plotTransform' }), { plottedPoints: [] });
  assert.equal(bare.isComplete, false);
  assert.equal(bare.isCorrect, false);
  assert.equal(bare.score, 0);
  assert.deepEqual(bare.parts, []);
});

test('plotTransform: a point must be a pair of finite numbers', () => {
  // The plane only ever plots [x, y] numbers. A string or null coordinate is
  // an unplaced point (the old Number() read '0' and null as 0).
  const strings = grade(PLOT, { plottedPoints: [['0', '-3'], [2, -1], [4, 1]] });
  assert.equal(strings.isCorrect, false);
  assert.equal(strings.isComplete, false);
  assert.deepEqual(failedIds(strings), ['P1']);
  const origin = q({ ...PLOT, function: { type: 'linear', a: 1, h: 0, k: 0 }, sourcePoints: [[0, 0], [1, 1]] });
  assert.equal(legacyCheck(origin, { plottedPoints: [[null, null], [1, 1]] }).isCorrect, true, 'before: [null, null] read as (0, 0)');
  assert.equal(grade(origin, { plottedPoints: [[null, null], [1, 1]] }).isCorrect, false);
  // Objects and junk are unplaced too, as they always failed to match.
  assert.equal(assertLegacyParity(PLOT, { plottedPoints: [{ x: 0, y: -3 }, [2, -1], [4, 1]] }).isCorrect, false);
  assert.equal(grade(PLOT, { plottedPoints: 'all of them' }).score, 0);
});

/* ------------------------------------------------------------------ */
/* describe                                                            */
/* ------------------------------------------------------------------ */

// y = −3·|0.5(x + 2)| + 4: x-axis reflection, vertical stretch 3, no y-axis
// reflection, horizontal stretch 1/0.5 = 2, left 2, up 4.
const DESCRIBE = q({ mode: 'describe', family: 'absolute', function: { a: -3, b: 0.5, h: -2, k: 4 } });
const DESCRIBE_KEY = {
  reflection: 'yes', scaleKind: 'stretch', scaleFactor: '3',
  horizontalReflection: 'no', horizontalScaleKind: 'stretch', horizontalScaleFactor: '2',
  horizontalDirection: 'left', horizontalDistance: '2',
  verticalDirection: 'up', verticalDistance: '4',
};
const DESCRIBE_PARTS = [
  'reflection', 'vertical-scale-kind', 'vertical-scale-factor',
  'horizontal-reflection', 'horizontal-scale-kind', 'horizontal-scale-factor',
  'horizontal-direction', 'horizontal-distance', 'vertical-direction', 'vertical-distance',
];

test('describe: ten descriptions, each a tenth of the score', () => {
  const correct = assertLegacyParity(DESCRIBE, DESCRIBE_KEY);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.deepEqual(partIds(correct), DESCRIBE_PARTS);
  assert.equal(assertLegacyParity(DESCRIBE, { ...DESCRIBE_KEY, scaleFactor: '6/2', horizontalScaleFactor: '2.0', verticalDistance: ' 4 ' }).isCorrect, true);

  const swapped = assertLegacyParity(DESCRIBE, { ...DESCRIBE_KEY, scaleFactor: '2', horizontalScaleFactor: '3' });
  assert.equal(swapped.score, 0.8);
  assert.deepEqual(failedIds(swapped), ['vertical-scale-factor', 'horizontal-scale-factor']);
  const directions = assertLegacyParity(DESCRIBE, { ...DESCRIBE_KEY, horizontalDirection: 'right', verticalDirection: 'down', reflection: 'no' });
  assert.equal(directions.score, 0.7);

  const unanswered = assertLegacyParity(DESCRIBE, { ...DESCRIBE_KEY, horizontalScaleKind: '' });
  assert.equal(unanswered.isComplete, false);
  assert.equal(unanswered.isCorrect, false);
  assert.equal(unanswered.score, 0.9);
  const blankNumber = assertLegacyParity(DESCRIBE, { ...DESCRIBE_KEY, horizontalDistance: '' });
  assert.equal(blankNumber.isComplete, false);
  assert.deepEqual(failedIds(blankNumber), ['horizontal-distance']);
});

test('describe: "unchanged" and "none" with typed zeros; unauthored defaults', () => {
  const identity = {
    reflection: 'no', scaleKind: 'unchanged', scaleFactor: '1',
    horizontalReflection: 'no', horizontalScaleKind: 'unchanged', horizontalScaleFactor: '1',
    horizontalDirection: 'none', horizontalDistance: '0',
    verticalDirection: 'none', verticalDistance: '0',
  };
  const bare = assertLegacyParity(q({ mode: 'describe' }), identity);
  assert.equal(bare.isCorrect, true);
  assert.equal(bare.isComplete, true, 'a typed 0 is an answer');
  // A y-axis reflection with a compression: b = −2 → horizontal scale 1/2.
  const compressed = q({ mode: 'describe', family: 'cubic', function: { a: 0.25, b: -2, h: 3, k: 0 } });
  assert.equal(assertLegacyParity(compressed, {
    reflection: 'no', scaleKind: 'compression', scaleFactor: '1/4',
    horizontalReflection: 'yes', horizontalScaleKind: 'compression', horizontalScaleFactor: '0.5',
    horizontalDirection: 'right', horizontalDistance: '3',
    verticalDirection: 'none', verticalDistance: '0',
  }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* anchor                                                              */
/* ------------------------------------------------------------------ */

test('anchor: the transformed defining feature of each family', () => {
  const cases = [
    // square root endpoint (0, 0) → (−3, 1)
    [q({ mode: 'anchor', family: 'squareRoot', function: { a: 2, h: -3, k: 1 } }), { anchorX: '-3', anchorY: '1' }],
    // rational asymptote intersection → (h, k)
    [q({ mode: 'anchor', family: 'rational', function: { a: 1, h: 2, k: -1 } }), { anchorX: '2', anchorY: '−1' }],
    // exponential reference point (0, 1) → (0/b + h, a + k)
    [q({ mode: 'anchor', family: 'exponential', function: { a: 3, b: 2, h: 1, k: -2 } }), { anchorX: '1', anchorY: '1' }],
    // logarithmic reference point (1, 0) → (1/b + h, k)
    [q({ mode: 'anchor', family: 'logarithmic', function: { a: 5, b: 4, h: 1, k: -2 } }), { anchorX: '5/4', anchorY: '-2' }],
  ];
  for (const [question, work] of cases) {
    const result = assertLegacyParity(question, work, question.family);
    assert.equal(result.isCorrect, true, question.family);
    assert.equal(result.isComplete, true);
    assert.deepEqual(partIds(result), ['anchor-x', 'anchor-y']);
  }
  const [squareRoot] = cases[0];
  const half = assertLegacyParity(squareRoot, { anchorX: '-3', anchorY: '-1' });
  assert.equal(half.score, 0.5);
  assert.deepEqual(failedIds(half), ['anchor-y']);
  const blank = assertLegacyParity(squareRoot, { anchorX: '', anchorY: '1' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.score, 0.5);

  // Unauthored: the quadratic vertex at the origin. Blank is never the origin.
  const bare = q({ mode: 'anchor' });
  assert.equal(assertLegacyParity(bare, { anchorX: '0', anchorY: '0' }).isCorrect, true);
  assert.equal(assertLegacyParity(bare, { anchorX: '', anchorY: '' }).isCorrect, false);
});

/* ------------------------------------------------------------------ */
/* the question is read exactly as the old lab read it                 */
/* ------------------------------------------------------------------ */

// The component and the grader share resolveTransformationsQuestion, so a
// wrong reading there would move the screen and the server together and no
// browser-vs-server check could see it. These pin each reading against the
// old lab's own (legacyCheck transcribes it independently).
test('question reading: match grades the target (not the function), drawn in the target\'s base', () => {
  // Both specs authored: match draws and grades the dashed TARGET.
  const both = q({ mode: 'match', family: 'quadratic', function: { a: 1, h: 0, k: 0 }, target: { a: 2, h: 1, k: -3 } });
  assert.equal(assertLegacyParity(both, { a: '2', h: '1', k: '-3' }).isCorrect, true, 'the target\'s parameters');
  assert.equal(assertLegacyParity(both, { a: '1', h: '0', k: '0' }).isCorrect, false, 'not the function\'s');
  // Every other mode reads the FUNCTION when both are authored.
  const identifyBoth = q({ mode: 'identify', family: 'quadratic', function: { a: 2, h: 1, k: 0 }, target: { a: -1, h: 3, k: 2 } });
  assert.equal(assertLegacyParity(identifyBoth, { a: '2', h: '1', k: '0' }).isCorrect, true);
  assert.equal(assertLegacyParity(identifyBoth, { a: '-1', h: '3', k: '2' }).isCorrect, false);
  // The student's exponential is drawn in the TARGET's base (3), not the function's (2).
  const bases = q({ mode: 'match', family: 'exponential', function: { a: 2, h: 1, k: -1, base: 2 }, target: { a: 2, h: 1, k: -1, base: 3 } });
  assert.equal(assertLegacyParity(bases, { a: '2', h: '1', k: '-1' }).isCorrect, true);
});

test('question reading: family precedence, an authored target type, and every trigger of the b box', () => {
  // `family` wins over function.type: |2x| is 2|x| (absolute), but (2x)² is
  // not 2x² (quadratic), so the family decides the verdict here.
  const familyFirst = q({ mode: 'match', family: 'absolute', includeHorizontalScale: true, function: { type: 'quadratic' }, target: { a: 1, b: 2, h: 0, k: 0 } });
  assert.equal(assertLegacyParity(familyFirst, { a: '2', b: '1', h: '0', k: '0' }).isCorrect, true);
  // Without `family`, function.type names it.
  const typeOnly = q({ mode: 'match', includeHorizontalScale: true, function: { type: 'quadratic' }, target: { a: 1, b: 2, h: 0, k: 0 } });
  assert.equal(assertLegacyParity(typeOnly, { a: '2', b: '1', h: '0', k: '0' }).isCorrect, false);
  // An authored target.type changes the dashed graph only; the student's
  // graph stays in the lab's family, so x² − 1 never lies on |x| − 1.
  const typedTarget = q({ mode: 'match', family: 'quadratic', target: { type: 'absolute', a: 1, h: 0, k: -1 } });
  assert.equal(assertLegacyParity(typedTarget, { a: '1', h: '0', k: '-1' }).isCorrect, false);

  // The b box appears for each authoring trigger, and its value is graded.
  // The answer's b is 1 in every case below.
  for (const [trigger, question] of [
    ['includeHorizontalScale', q({ mode: 'identify', family: 'quadratic', includeHorizontalScale: true, function: { a: 1, h: 2, k: 0 } })],
    ['function.b', q({ mode: 'identify', family: 'quadratic', function: { a: 1, b: 1, h: 2, k: 0 } })],
    ['target.b', q({ mode: 'identify', family: 'quadratic', function: { a: 1, h: 2, k: 0 }, target: { b: 3 } })],
    ['initial.b', q({ mode: 'identify', family: 'quadratic', function: { a: 1, h: 2, k: 0 }, initial: { b: 2 } })],
  ]) {
    const right = assertLegacyParity(question, { a: '1', b: '1', h: '2', k: '0' });
    assert.equal(right.isCorrect, true, `${trigger}: shown b graded`);
    assert.equal(right.parts[1].response, '1', `${trigger}: the typed b is the response`);
    assert.deepEqual(failedIds(assertLegacyParity(question, { a: '1', b: '4', h: '2', k: '0' })), ['b'], `${trigger}: a wrong b fails`);
  }
});

// A seeded sweep over the question fields the lab reads and the states its
// inputs can hold (box text is '' or number text, as a type="number" box
// gives; selects hold an option value; plotted points are numeric pairs).
const mulberry32 = (seed) => () => {
  let t = (seed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('a seeded sweep of questions and on-screen states matches the old Check, except the pinned blank-box fix', () => {
  const random = mulberry32(20261001);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const chance = (p) => random() < p;
  const value = () => pick([0, 1, -1, 2, -2, 0.5, -0.5, 3, -3, 1.5, 0.25, 4, 1 / 3]);
  const spec = () => {
    const out = {};
    if (chance(0.8)) out.a = value();
    if (chance(0.4)) out.b = pick([1, 2, -2, 0.5, -1, 0, 3]);
    if (chance(0.05)) out.inputScale = pick([2, 0.5]);
    if (chance(0.8)) out.h = value();
    if (chance(0.8)) out.k = value();
    if (chance(0.2)) out.base = pick([2, 3, 10, 0.5]);
    if (chance(0.1)) out.type = pick([...TRANSFORMATION_FAMILIES, 'sinusoid']);
    return out;
  };
  // About a quarter of the screens are answered exactly (every box, select
  // and point right), so the sweep reaches the correct verdicts too.
  let exact = false;
  const near = (x) => (exact ? x : x + pick([0, 0, 0, 0.005, -0.009, 0.011, 0.02, -0.03, 1]));
  const text = (x) => (Number.isFinite(x) ? pick([String(x), String(Math.round(x * 1000) / 1000), x.toFixed(2)]) : '');
  const typed = (expected) => {
    if (exact && Number.isFinite(expected)) return text(expected);
    const roll = random();
    if (roll < 0.5 && Number.isFinite(expected)) return text(near(expected));
    if (roll < 0.6) return '';
    if (roll < 0.63) return pick(['1/2', '−3', ' 4 ', '3/0']);
    return text(value());
  };
  const finitePair = (point) => Array.isArray(point) && point.slice(0, 2).every((c) => typeof c === 'number' && Number.isFinite(c));
  const parsed = (entry) => parseNumericAnswer(entry) != null;

  const tally = { total: 0, same: 0, blankBox: 0, correct: 0 };
  for (let i = 0; i < 1500; i += 1) {
    const question = q();
    exact = chance(0.25);
    const roll = random();
    if (roll < 0.85) question.mode = pick(TRANSFORMATIONS_LAB_MODES);
    else if (roll < 0.92) question.mode = pick(['Match', ' anchor', 'unknownView', '']);
    if (chance(0.8)) question.family = pick([...TRANSFORMATION_FAMILIES, 'sinusoid']);
    if (chance(0.6)) question.target = spec();
    if (chance(0.7)) question.function = spec();
    if (chance(0.2)) question.includeHorizontalScale = pick([true, false, 'true']);
    if (chance(0.3)) question.initial = Object.fromEntries(['a', 'b', 'h', 'k'].filter(() => chance(0.5)).map((key) => [key, value()]));
    if (chance(0.3)) question.graphBounds = pick([{ xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, { xMin: 0, xMax: 7 }, { yMin: -2, yMax: 9 }]);
    if (chance(0.5)) question.parentPoint = pick([[2, 4], [1, 1], [-1, 1], { x: 3, y: 9 }, ['2', '4'], [1, 'x']]);
    if (chance(0.6)) question.sourcePoints = Array.from({ length: pick([0, 1, 2, 3, 4]) }, () => (chance(0.05) ? ['a', 1] : [value(), value()]));

    // The old lab's own reading of the question (transcribed, not shared).
    const mode = question.mode || 'match';
    const known = TRANSFORMATIONS_LAB_MODES.includes(mode) ? mode : 'anchor';
    const requestedFamily = question.family || question.function?.type || question.type;
    const family = TRANSFORMATION_FAMILIES.includes(requestedFamily) ? requestedFamily : 'quadratic';
    const targetSpec = normalizeTransformationSpec({ type: family, ...question.target }, family);
    const investigationSpec = normalizeTransformationSpec({ type: family, ...(question.function || question.target) }, family);
    const showB = question.includeHorizontalScale === true || question.target?.b != null || question.function?.b != null || question.initial?.b != null;
    const start = { a: String(question.initial?.a ?? 1), b: String(question.initial?.b ?? 1), h: String(question.initial?.h ?? 0), k: String(question.initial?.k ?? 0) };
    const anchor = transformedAnchor(investigationSpec);
    const images = (Array.isArray(question.sourcePoints) ? question.sourcePoints : []).map((point) => mapParentPoint(point, investigationSpec)).filter(Boolean);

    // What the component would submit for this screen.
    let work;
    if (known === 'match' || known === 'identify') {
      const key = known === 'match' ? targetSpec : investigationSpec;
      const boxes = showB ? ['a', 'b', 'h', 'k'] : ['a', 'h', 'k'];
      work = Object.fromEntries(boxes.map((box) => {
        const r = random();
        return [box, exact || r < 0.4 ? text(near(key[box])) : r < 0.5 ? '' : r < 0.65 ? start[box] : text(value())];
      }));
    } else if (known === 'pointMap') {
      const expected = mapParentPoint(question.parentPoint || anchor.parentPoint, investigationSpec);
      work = { mappedX: typed(expected?.[0]), mappedY: typed(expected?.[1]) };
    } else if (known === 'plotTransform') {
      const count = exact || chance(0.75) ? images.length : Math.max(0, images.length + pick([-1, 1]));
      work = { plottedPoints: Array.from({ length: count }, (_, index) => (images[index] && (exact || chance(0.7)) ? [near(images[index][0]), near(images[index][1])] : [value(), value()])) };
    } else if (known === 'describe') {
      const d = transformationDescriptor(investigationSpec);
      const select = (right, options) => (exact || chance(0.6) ? right : pick(['', ...options]));
      work = {
        reflection: select(d.reflection ? 'yes' : 'no', ['yes', 'no']),
        scaleKind: select(d.verticalScaleKind, ['stretch', 'compression', 'unchanged']),
        scaleFactor: typed(d.verticalScale),
        horizontalReflection: select(d.horizontalReflection ? 'yes' : 'no', ['yes', 'no']),
        horizontalScaleKind: select(d.horizontalScaleKind, ['stretch', 'compression', 'unchanged']),
        horizontalScaleFactor: typed(d.horizontalScale),
        horizontalDirection: select(d.horizontalDirection, ['left', 'right', 'none']),
        horizontalDistance: typed(d.horizontalDistance),
        verticalDirection: select(d.verticalDirection, ['up', 'down', 'none']),
        verticalDistance: typed(d.verticalDistance),
      };
    } else {
      work = { anchorX: typed(anchor.point[0]), anchorY: typed(anchor.point[1]) };
    }

    const label = `#${i} ${JSON.stringify(question)} ${JSON.stringify(work)}`;
    const result = grade(question, work); // asserts browser and server agree exactly
    assert.equal(result.graded, true, label);
    assert.equal(result.mode, known, `${label}: mode`);
    const legacy = legacyCheck(question, work);
    const legacyScore = legacy.isCorrect ? 1 : legacy.score;
    tally.total += 1;
    if (result.isCorrect) tally.correct += 1;

    // Completeness, specified independently of the grader.
    let complete;
    let blankBox = false;
    if (known === 'match' || known === 'identify') {
      const boxes = Object.keys(work);
      blankBox = boxes.some((box) => work[box].trim() === '' || !Number.isFinite(Number(work[box])));
      complete = !blankBox && !boxes.every((box) => work[box] === start[box]);
    } else if (known === 'pointMap') complete = parsed(work.mappedX) && parsed(work.mappedY);
    else if (known === 'plotTransform') complete = images.length > 0 && work.plottedPoints.length === images.length && work.plottedPoints.every(finitePair);
    else if (known === 'describe') {
      complete = ['reflection', 'scaleKind', 'horizontalReflection', 'horizontalScaleKind', 'horizontalDirection', 'verticalDirection'].every((field) => work[field] !== '')
        && ['scaleFactor', 'horizontalScaleFactor', 'horizontalDistance', 'verticalDistance'].every((field) => parsed(work[field]));
    } else complete = parsed(work.anchorX) && parsed(work.anchorY);
    assert.equal(result.isComplete, complete, `${label}: isComplete`);

    if (blankBox) {
      // The pinned fix: a blank parameter box is never correct. Match keeps
      // the drawn graph's score; identify loses only the blank boxes' credit.
      tally.blankBox += 1;
      assert.equal(result.isCorrect, false, `${label}: a blank box is not correct`);
      if (known === 'match') assert.equal(result.score, legacy.score, `${label}: match score unchanged`);
      else assert.ok(result.score <= legacyScore, `${label}: identify credit only ever drops`);
      continue;
    }
    assert.equal(result.isCorrect, legacy.isCorrect, `${label}: isCorrect`);
    assert.equal(result.score, legacyScore, `${label}: score`);
    tally.same += 1;
  }
  // The sweep reaches real verdicts, not only failures and blanks.
  assert.ok(tally.correct > 300, `correct verdicts reached: ${JSON.stringify(tally)}`);
  assert.ok(tally.blankBox > 60 && tally.same > 1250, JSON.stringify(tally));
});

/* ------------------------------------------------------------------ */
/* malformed, tampered, oversize                                       */
/* ------------------------------------------------------------------ */

const REALISTIC = [
  [MATCH, MATCH_KEY],
  [q({ ...MATCH, includeHorizontalScale: true }), { ...MATCH_KEY, b: '1' }],
  [IDENTIFY, IDENTIFY_KEY],
  [POINT_MAP, POINT_MAP_KEY],
  [PLOT, PLOT_KEY],
  [DESCRIBE, DESCRIBE_KEY],
  [q({ mode: 'anchor', family: 'squareRoot', function: { a: 2, h: -3, k: 1 } }), { anchorX: '-3', anchorY: '1' }],
];

test('realistic work is exactly student work: nothing dropped, nothing truncated, well under the limits', () => {
  for (const [question, work] of REALISTIC) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, [], `${question.mode}: no student field is a NON_WORK key`);
    assert.equal(bounded.truncated, false);
    assert.equal(grade(question, work).isCorrect, true, question.mode);
  }
  // The largest work this lab can produce: one plotted point per source
  // point, at the contract's array cap, with awkward decimals.
  const sourcePoints = Array.from({ length: TOOL_RESPONSE_LIMITS.maxArrayLength }, (_, index) => [-12.345 + index / 7, 67.891 - index / 3]);
  const many = q({ mode: 'plotTransform', family: 'linear', function: { type: 'linear', a: 1.5, b: -0.75, h: 2.25, k: -1.125 }, sourcePoints });
  const plottedPoints = sourcePoints.map((point) => mapParentPoint(point, { type: 'linear', a: 1.5, b: -0.75, h: 2.25, k: -1.125 }));
  const bounded = boundToolWork({ plottedPoints });
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson({ plottedPoints }).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  const result = grade(many, { plottedPoints });
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts.length, TOOL_RESPONSE_LIMITS.maxArrayLength);
});

test('a claimed verdict or an echoed key in the work is ignored', () => {
  const wrong = { a: '2', h: '1', k: '3' };
  const claimed = grade(MATCH, { ...wrong, isCorrect: true, score: 1, checks: [true], expected: { a: -2, h: 1, k: 3 }, feedback: 'Correct' });
  assert.equal(claimed.isCorrect, false);
  assert.equal(claimed.score, grade(MATCH, wrong).score);
  assert.deepEqual(boundToolWork({ ...wrong, isCorrect: true, score: 1, checks: [true], expected: {} }).dropped.sort(), ['checks', 'expected', 'isCorrect', 'score']);
  // The old response echoed the question's parentPoint / sourcePoints; a
  // client that still sends them cannot move the key.
  const echoed = grade(POINT_MAP, { ...POINT_MAP_KEY, parentPoint: [0, 0], mappedPoint: [0, 0] });
  assert.equal(echoed.isCorrect, true);
  const fakeSource = grade(PLOT, { plottedPoints: [[1, 1], [2, 2]], sourcePoints: [[1, 1], [2, 2]] });
  assert.equal(fakeSource.isCorrect, false);
});

test('wrong types, missing fields and non-object work fail closed', () => {
  const junk = grade(MATCH, { a: { value: -2 }, h: ['1'], k: true });
  assert.equal(junk.graded, true);
  assert.equal(junk.isComplete, false);
  assert.equal(junk.isCorrect, false);
  assert.equal(grade(IDENTIFY, {}).isCorrect, false);
  assert.equal(grade(IDENTIFY, {}).isComplete, false);
  const arrays = grade(POINT_MAP, { mappedX: ['3'], mappedY: ['11'] });
  assert.equal(arrays.isComplete, false, 'an array is not a typed coordinate');
  assert.equal(arrays.isCorrect, false);
  const booleans = grade(DESCRIBE, { ...DESCRIBE_KEY, reflection: true, scaleFactor: { n: 3 } });
  assert.deepEqual(failedIds(booleans), ['reflection', 'vertical-scale-factor']);
  assert.equal(booleans.isComplete, false);
  // A number where text is expected reads the same as its text.
  assert.equal(grade(IDENTIFY, { a: -0.5, h: 2, k: -1 }).isCorrect, true);

  for (const work of [null, undefined, [], 'anchor', 7, true]) {
    const result = grade(MATCH, work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
});

test('oversize work is refused by both paths, never truncated into a verdict', () => {
  const padding = Array.from({ length: 200 }, () => 'x'.repeat(200));
  const result = grade(q({ mode: 'anchor', family: 'quadratic', function: { a: 1, h: 2, k: 3 } }), { anchorX: '2', anchorY: '3', padding });
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'oversize-response');
  assert.equal(result.serverReason, 'oversize-response');
  assert.equal(result.isCorrect, false);
});

/* ------------------------------------------------------------------ */
/* discrimination: the key decides, not the shape of the work          */
/* ------------------------------------------------------------------ */

test('correct work graded against an altered key fails, in every mode', () => {
  const altered = [
    [MATCH, MATCH_KEY, { ...MATCH, target: { a: -2, h: 1, k: 4 } }],
    [MATCH, MATCH_KEY, { ...MATCH, target: { a: 2, h: 1, k: 3 } }],
    [IDENTIFY, IDENTIFY_KEY, { ...IDENTIFY, function: { a: -0.5, h: 2, k: 1 } }],
    [POINT_MAP, POINT_MAP_KEY, { ...POINT_MAP, parentPoint: [4, 2] }],
    [POINT_MAP, POINT_MAP_KEY, { ...POINT_MAP, function: { a: 2, b: 2, h: -1, k: 3 } }],
    [PLOT, PLOT_KEY, { ...PLOT, function: { type: 'linear', a: 1, h: 2, k: 1 } }],
    [PLOT, PLOT_KEY, { ...PLOT, sourcePoints: [[-2, -2], [0, 0], [2, 3]] }],
    [DESCRIBE, DESCRIBE_KEY, { ...DESCRIBE, function: { a: -3, b: 0.5, h: 2, k: 4 } }],
    [DESCRIBE, DESCRIBE_KEY, { ...DESCRIBE, function: { a: -3, b: 2, h: -2, k: 4 } }],
    [REALISTIC[6][0], REALISTIC[6][1], { ...REALISTIC[6][0], family: 'cubic', function: { a: 2, h: -3, k: -1 } }],
  ];
  for (const [question, work, alteredQuestion] of altered) {
    assert.equal(grade(question, work).isCorrect, true, `${question.mode}: correct against its own key`);
    assert.equal(grade(alteredQuestion, work).isCorrect, false, `${question.mode}: the same work against an altered key`);
  }
});
