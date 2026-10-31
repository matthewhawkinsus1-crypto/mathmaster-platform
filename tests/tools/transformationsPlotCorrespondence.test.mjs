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
 * Both now say what they got right and what is left. Order is the
 * correspondence being taught, so it still costs; since GR32 an order-only
 * miss earns half a share for each image under another label (0.2 → 0.6
 * here), and the up-3 plot, which found no image by order, still scores 0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { plottedPointCorrespondence, resolveTransformationsQuestion, transformedSourcePoints } from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';
import { labGuidanceFor } from '../../src/tools/transformations/transformationsGuidance.js';
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

test('every image found, plotted in reverse: the order still costs, the feedback names the order', () => {
  const reversed = [...images].reverse();
  const graded = grade(reversed);
  assert.equal(graded.isCorrect, false);
  // One image in its own place (S3's), four under another label. It scored
  // 0.2; since GR32 (the owner) an order-only miss earns half a share for
  // each misplaced image: (1 + 4 × 0.5) / 5.
  assert.equal(graded.score, 0.6);
  assert.equal(plottedPointCorrespondence({ plotted: reversed, images, spec: resolved.investigationSpec }), 'reordered');
  assert.equal(message(reversed), 'You found every image, but not in order. P1 must be the image of S1, P2 the image of S2, and so on. Check which original each of your points came from.');
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
  // A doubled image is not "every point found" (and with points in place it
  // keeps the lab's count sentence).
  assert.equal(plottedPointCorrespondence({ plotted: [images[0], images[0], ...images.slice(2)], images, spec: resolved.investigationSpec }), null, 'a doubled image is not "every point found"');
  // Out of place with one image doubled (and one missing): on the line, none
  // its own image — "same line", never "every point found".
  assert.equal(plottedPointCorrespondence({ plotted: [images[1], images[0], images[1], images[4], images[3]], images, spec: resolved.investigationSpec }), 'sameGraph');
  assert.equal(message(images.slice(0, 4)), null, 'not every point plotted');
  assert.equal(correspondenceList(2), 'S1 to P1, S2 to P2');
});

test('the lab uses it on a plot miss, and its order hint says P1 is S1\'s image', () => {
  const source = fs.readFileSync(new URL('../../src/tools/transformations/TransformationsLab.jsx', import.meta.url), 'utf8');
  const plotBranch = source.slice(source.indexOf("if (mode === 'plotTransform') {", source.indexOf('const feedbackMessage')), source.indexOf("if (mode === 'anchor')", source.indexOf('const feedbackMessage')));
  assert.match(plotBranch, /const correspondence = plotTransformMissMessage\(\{ plotted: feedback\.response\?\.plottedPoints, images: expectedTransformedPoints/);
  assert.match(plotBranch, /if \(correspondence\) return correspondence;/);
  // The hints the lab shows for this lesson's line (transformationsGuidance.js,
  // which the lab reads for the family it draws).
  assert.match(labGuidanceFor('linear').hints.plotTransform.join(' '), /Order matters: P1 is the image of S1/);
  assert.match(source, /const \{ steps: MODE_STEPS, hints: HINTS \} = labGuidanceFor\(family\);/);
});

test('some images already in place: the lab keeps its count sentence, never "not the images of their own points" (review S2)', () => {
  // Four in place, the fifth slid along the line (score 0.8); three in place, two slid.
  const slid = ([x, y]) => [x + 1, y + 1];
  const fourOfFive = [...images.slice(0, 4), slid(images[4])];
  const threeOfFive = [...images.slice(0, 3), slid(images[3]), slid(images[4])];
  assert.equal(grade(fourOfFive).score, 0.8);
  assert.equal(grade(threeOfFive).score, 0.6);
  [fourOfFive, threeOfFive].forEach((plotted) => {
    assert.equal(plottedPointCorrespondence({ plotted, images, spec: resolved.investigationSpec }), null);
    assert.equal(message(plotted), null, 'the lab says "N of 5 defining points are in the correct transformed locations…"');
  });
});

test('"the right line" is only said of the graph the student was shown: images off it are never "same graph" (review S5d)', () => {
  // Source points that are not on the parent f(x) = x: their images are not on
  // t(x) either, so a plot along t(x) is not "the right line".
  const offSource = [[0, 5], [1, 7]];
  const offImages = transformedSourcePoints(offSource, resolved.investigationSpec);
  const alongT = [[0, 3], [1, 4]];
  assert.equal(plottedPointCorrespondence({ plotted: alongT, images: offImages, spec: resolved.investigationSpec }), null);
});

// FB22: the fallback names no letter the plotTransform screen never defines.
test('any other wrong plot counts the right images and says the rule in the lab\'s words', async () => {
  const { plotTransformFallbackMessage } = await import('../../src/tools/transformations/plotTransformFeedback.js');
  const text = plotTransformFallbackMessage(1, 5);
  assert.match(text, /^1 of 5 defining points are in the right place\./);
  assert.doesNotMatch(text, /x\/b|ay \+ k|\b[abhk]\b/, text);
  assert.match(text, /inside the parentheses/);
  assert.match(text, /outside exactly as written/);
  const lab = fs.readFileSync(new URL('../../src/tools/transformations/TransformationsLab.jsx', import.meta.url), 'utf8');
  assert.match(lab, /return plotTransformFallbackMessage\(feedbackPartsCorrect, expectedCount\);/);
  assert.doesNotMatch(lab, /Use x\/b \+ h for x and ay \+ k for y/);
});
