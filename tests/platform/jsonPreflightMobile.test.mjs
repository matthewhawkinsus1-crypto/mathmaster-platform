import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { normalizeLessonBundle } from '../../src/platform/schemas/BundleDefinition.js';
import { validateLessonBundle } from '../../src/platform/validation/bundleValidator.js';
import { clientPointToGraphCoordinate } from '../../src/utils/responsiveCoordinates.js';

test('Bundle V3 activities are authoritative over a legacy questions mirror', () => {
  const parsed = parseAssignmentBlueprintText(JSON.stringify({
    schemaVersion: 3,
    lessonMetadata: { title: 'Preview authority test', course: 'Algebra I' },
    assignment: { title: 'Preview authority test', variantMode: 'shared' },
    questions: [{ questionId: 'legacy-mirror', type: 'algebra', a: 1, b: 1, c: 2 }],
    activities: [
      { role: 'classwork', questions: [{ questionId: 'bundle-source', type: 'algebra', a: 2, b: 1, c: 5 }] },
      { role: 'practice', questions: [{ questionId: 'bundle-tool', type: 'transformationsLab', mode: 'pointMap', family: 'quadratic', function: { type: 'quadratic', a: 2, h: 1, k: -3 }, parentPoint: [1, 1] }] },
    ],
  }));

  assert.equal(parsed.isBundle, true);
  assert.deepEqual(parsed.questions.map((question) => question.questionId), ['bundle-source', 'bundle-tool']);
  assert.deepEqual(parsed.questions.map((question) => question.activityRole), ['classwork', 'practice']);
  assert.doesNotThrow(() => validateAssignmentQuestions(parsed.questions, { variantMode: 'shared' }));
  const report = validateLessonBundle(normalizeLessonBundle(parsed.bundleSource));
  assert.equal(report.isValid, true, JSON.stringify(report, null, 2));
});

test('Bundle V3 no longer requires a legacy top-level questions array', () => {
  const parsed = parseAssignmentBlueprintText(JSON.stringify({
    schemaVersion: 3,
    lessonMetadata: { title: 'Bundle only', course: 'Algebra I' },
    activities: [{ role: 'dol', questions: [{ questionId: 'dol-only', type: 'algebra', a: 3, b: 2, c: 8 }] }],
  }));
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].activityRole, 'dol');
});

test('responsive coordinate conversion gives the same graph point after SVG scaling', () => {
  const viewBox = { viewBoxWidth: 560, viewBoxHeight: 380, padding: 42, xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const viewX = 42 + 0.75 * (560 - 84);
  const viewY = 42 + 0.25 * (380 - 84);
  const full = clientPointToGraphCoordinate({ clientX: viewX, clientY: viewY, rect: { left: 0, top: 0, width: 560, height: 380 }, ...viewBox });
  const scaled = clientPointToGraphCoordinate({ clientX: 100 + viewX / 2, clientY: 50 + viewY / 2, rect: { left: 100, top: 50, width: 280, height: 190 }, ...viewBox });
  assert.ok(Math.abs(full.x - 5) < 1e-9);
  assert.ok(Math.abs(full.y - 5) < 1e-9);
  assert.ok(Math.abs(scaled.x - full.x) < 1e-9);
  assert.ok(Math.abs(scaled.y - full.y) < 1e-9);
});

test('responsive coordinate conversion rejects taps outside the plotted region', () => {
  const result = clientPointToGraphCoordinate({
    clientX: 5,
    clientY: 5,
    rect: { left: 0, top: 0, width: 280, height: 190 },
    viewBoxWidth: 560,
    viewBoxHeight: 380,
    padding: 42,
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
  });
  assert.equal(result, null);
});
