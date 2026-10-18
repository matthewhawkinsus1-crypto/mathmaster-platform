/*
 * TRANSFORMATIONS LAB: WHAT A WRONG PLOT GOT RIGHT (student pass 3, R-4 / PR-12).
 *
 * Algebra I · M2 T2 · L2 Classwork 1: translate f(x) = x LEFT 3, plotting the
 * image of S1–S5 in order. Two misses from the M2 T2 walkthrough:
 *
 *   - the five right images plotted S5 → S1 scored 20% and read "1 of 5 …
 *     Use x/b + h for x and ay + k for y." Nothing mentioned order (P1-5).
 *   - every point moved UP 3 draws t(x)'s line through the wrong points and
 *     got the same sentence (P1-6).
 *
 * Both now say what they got right and what is left. The grade does not move
 * (the shared grader is unchanged): order is the correspondence being taught.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { plottedPointCorrespondence, resolveTransformationsQuestion, transformedSourcePoints } from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';
import { correspondenceList, plotTransformMissMessage } from '../../src/tools/transformations/plotTransformFeedback.js';

const lesson = compileTeacherImport(fs.readFileSync(new URL('../../teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json', import.meta.url), 'utf8'));
const question = lesson.questions.find((candidate) => candidate.questionId === 'l2-cw-1');
const resolved = resolveTransformationsQuestion(question);
const images = transformedSourcePoints(resolved.sourcePoints, resolved.investigationSpec);
const message = (plotted) => plotTransformMissMessage({ plotted, images, spec: resolved.investigationSpec, family: resolved.family });
const grade = (plottedPoints) => gradeToolWork({ toolId: 'transformationsLab', question, work: { plottedPoints } });

test('the real item: S1–S5 moved left 3, and the five images it expects', () => {
  assert.ok(question, 'L2 compiles l2-cw-1');
  assert.deepEqual(images, [[-5, -2], [-4, -1], [-3, 0], [-2, 1], [-1, 2]]);
});

test('every image found, plotted in reverse: the score is unchanged, the feedback names the order', () => {
  const reversed = [...images].reverse();
  const graded = grade(reversed);
  assert.equal(graded.isCorrect, false);
  assert.equal(graded.score, 0.2, 'the grade is the grader\'s, unchanged');
  assert.equal(plottedPointCorrespondence({ plotted: reversed, images, spec: resolved.investigationSpec }), 'reordered');
  assert.equal(message(reversed), 'You found every point. Match each image to its original: S1 to P1, S2 to P2, S3 to P3, and so on. Plot them in that order, or drag each point to its place.');
  // Two swapped is the same finding.
  const swapped = [images[1], images[0], ...images.slice(2)];
  assert.equal(plottedPointCorrespondence({ plotted: swapped, images, spec: resolved.investigationSpec }), 'reordered');
});

test('the right line through the wrong points (moved up 3, not left 3): says the line is right and each point must be its own image', () => {
  const upThree = resolved.sourcePoints.map(({ x, y }) => [x, y + 3]);
  assert.equal(grade(upThree).score, 0);
  assert.equal(plottedPointCorrespondence({ plotted: upThree, images, spec: resolved.investigationSpec }), 'sameGraph');
  assert.equal(message(upThree), 'Your points are on the right line, but they are not the images of their own points. Find where each original point goes: S1 to P1, S2 to P2, S3 to P3, and so on.');
  // Neither message hands over a coordinate or the move.
  assert.doesNotMatch(message(upThree), /\bleft\b|\(\s*-?\d|\b\d+\s+units?\b/i);
});

test('anything else keeps the lab\'s own sentence: a correct plot, a point off the line, a doubled image', () => {
  assert.equal(message(images), null, 'correct');
  assert.equal(message([...images.slice(0, 4), [0, 0]]), null, 'a point off the line');
  assert.equal(plottedPointCorrespondence({ plotted: [images[0], images[0], ...images.slice(2)], images, spec: resolved.investigationSpec }), 'sameGraph', 'a doubled image is not "every point found"');
  assert.equal(message(images.slice(0, 4)), null, 'not every point plotted');
  assert.equal(correspondenceList(2), 'S1 to P1, S2 to P2');
});

test('the lab uses it on a plot miss, and its order hint says P1 is S1\'s image', () => {
  const source = fs.readFileSync(new URL('../../src/tools/transformations/TransformationsLab.jsx', import.meta.url), 'utf8');
  const plotBranch = source.slice(source.indexOf("if (mode === 'plotTransform') {", source.indexOf('const feedbackMessage')), source.indexOf("if (mode === 'anchor')", source.indexOf('const feedbackMessage')));
  assert.match(plotBranch, /const correspondence = plotTransformMissMessage\(\{ plotted: feedback\.response\?\.plottedPoints, images: expectedTransformedPoints/);
  assert.match(plotBranch, /if \(correspondence\) return correspondence;/);
  assert.match(source, /'plotTransform': \[[^\]]*Order matters: P1 is the image of S1/);
});
