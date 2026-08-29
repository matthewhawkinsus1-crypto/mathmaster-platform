import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizeTransformationSpec,
  evaluateTransformedFunction,
  mapParentPoint,
  unmapTransformedPoint,
  transformationDescriptor,
  transformationGraphScore,
  transformationParameterScore,
} from '../../src/tools/transformations/transformationsMath.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateQuestionsSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { assertFirestoreSafeAssignmentPayload } from '../../src/assignmentBlueprint.js';
import { generateQuestion } from '../../src/problemGenerator.js';

test('full a f(b(x-h))+k model follows x reciprocal/opposite and y direct behavior', () => {
  const spec = normalizeTransformationSpec({
    type: 'absolute',
    a: -2,
    b: -0.5,
    h: 3,
    k: 4,
  });

  assert.equal(spec.b, -0.5);

  const mapped = mapParentPoint([2, 2], spec);
  assert.deepEqual(mapped, [-1, 0]);
  assert.deepEqual(unmapTransformedPoint(mapped, spec), [2, 2]);

  const descriptor = transformationDescriptor(spec);
  assert.equal(descriptor.reflection, true);
  assert.equal(descriptor.verticalScale, 2);
  assert.equal(descriptor.horizontalReflection, true);
  assert.equal(descriptor.horizontalScale, 2);
  assert.equal(descriptor.horizontalScaleKind, 'stretch');
  assert.equal(descriptor.horizontalDirection, 'right');
  assert.equal(descriptor.horizontalDistance, 3);
  assert.equal(descriptor.verticalDirection, 'up');
  assert.equal(descriptor.verticalDistance, 4);
});

test('horizontal compression y=f(2x) is evaluated with factor one-half on x', () => {
  const spec = normalizeTransformationSpec({ type: 'absolute', a: 1, b: 2, h: 0, k: 0 });
  // parent point (2,2) maps to (1,2)
  assert.deepEqual(mapParentPoint([2, 2], spec), [1, 2]);
  assert.equal(evaluateTransformedFunction(spec, 1), 2);
  assert.equal(transformationDescriptor(spec).horizontalScale, 0.5);
});

test('graph matching accepts equivalent absolute-value parameterizations', () => {
  const writtenAsHorizontalCompression = { type: 'absolute', a: 1, b: 2, h: 0, k: -4 };
  const equivalentVerticalStretch = { type: 'absolute', a: 2, b: 1, h: 0, k: -4 };
  const score = transformationGraphScore(equivalentVerticalStretch, writtenAsHorizontalCompression);
  assert.equal(score.isCorrect, true);
});

test('parameter grading includes b so an x-scale error cannot pass', () => {
  const target = { a: 1, b: 2, h: 0, k: -4 };
  assert.equal(transformationParameterScore({ a: 1, b: 1, h: 0, k: -4 }, target).isCorrect, false);
  assert.equal(transformationParameterScore({ a: 1, b: 2, h: 0, k: -4 }, target).isCorrect, true);
});

test('V5 compiler preserves b and ALEKS-style source points for transformation plotting', () => {
  const source = {
    schemaVersion: 5,
    assignment: {
      title: 'Transformation plotting smoke test',
      courseId: 'algebra2',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A2.2A',
        prompt: 'Draw the graph of y = 2h(x+1).',
        studentActions: ['analyzeTransformations'],
        transformation: { mode: 'plotTransform' },
        function: { family: 'linear', a: 2, b: 1, h: -1, k: 0 },
        sourcePoints: [[-2, -4], [0, 0], [4, -2]],
        graphBounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
        snapStep: 1,
        dok: 2,
        difficultyBand: 2,
      }],
    }],
  };

  const compiled = compileAuthoringIntentV5(source).package.sections[0].questions[0];
  assert.equal(compiled.type, 'transformationsLab');
  assert.equal(compiled.mode, 'plotTransform');
  assert.equal(compiled.function.b, 1);
  assert.equal(compiled.function.h, -1);
  assert.deepEqual(compiled.sourcePoints, [
    { x: -2, y: -4 },
    { x: 0, y: 0 },
    { x: 4, y: -2 },
  ]);
  assert.equal(compiled.snapStep, 1);
});

test('CoordinatePlane exposes reusable polyline rendering for source and student graphs', () => {
  const source = fs.readFileSync('src/tools/shared/CoordinatePlane.jsx', 'utf8');
  assert.match(source, /polylines = \[\]/);
  assert.match(source, /<polyline/);
});


test('the complete Lesson 1 ALEKS bridge compiles and its transformation visuals satisfy Preflight', () => {
  const source = JSON.parse(fs.readFileSync(
    'teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json',
    'utf8',
  ));
  const compiled = compileAuthoringIntentV5(source).package;
  const questions = compiled.sections.flatMap((section) => section.questions || []);
  const semantic = validateQuestionsSemantics(questions);

  assert.deepEqual(
    semantic.errors,
    [],
    `Lesson 1 ALEKS bridge must be fully renderable in Preflight:\n${semantic.errors.join('\n')}`,
  );

  const transformationItems = questions.filter((question) => question.type === 'transformationsLab');
  transformationItems.forEach((question, index) => {
    const validation = validateToolQuestion(question);
    assert.deepEqual(
      validation.errors,
      [],
      `Transformations Lab item ${index + 1} must satisfy the live tool schema: ${validation.errors.join(' | ')}`,
    );
  });

  const plotItems = transformationItems.filter((question) => question.mode === 'plotTransform');
  assert.ok(plotItems.length >= 6, 'bridge should exercise several ALEKS-style source-graph transformations');
  plotItems.forEach((question) => {
    assert.ok(Array.isArray(question.sourcePoints) && question.sourcePoints.length >= 2);
    assert.ok(question.sourcePoints.every((point) => (
      point && typeof point === 'object' && !Array.isArray(point)
      && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
    )), 'plotTransform source points must be Firestore-safe coordinate objects');
  });

  assert.doesNotThrow(
    () => assertFirestoreSafeAssignmentPayload(compiled),
    'the complete reviewed Lesson 1 V5 assignment must be directly saveable to Firestore',
  );
});


test('absolute-value match grading uses the displayed family instead of silently grading a quadratic', () => {
  const target = normalizeTransformationSpec({ type: 'absolute', a: 1, b: 2, h: 0, k: -4 }, 'absolute');
  const student = normalizeTransformationSpec({ type: 'absolute', a: 1, b: 2, h: 0, k: -4 }, 'absolute');
  assert.equal(transformationGraphScore(student, target).isCorrect, true);

  const component = fs.readFileSync('src/tools/transformations/TransformationsLab.jsx', 'utf8');
  assert.match(component, /transformationGraphScore\(studentSpec, expected/);
  assert.doesNotMatch(component, /transformationGraphScore\(student, expected/);
});

test('the audited Lesson 1 SAT template is instantiated before student delivery', () => {
  const source = JSON.parse(fs.readFileSync(
    'teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json',
    'utf8',
  ));
  const compiled = compileAuthoringIntentV5(source).package;
  const questions = compiled.sections.flatMap((section) => section.questions || []);
  const template = questions.find((question) => (
    question.familyId === 'mathmaster:sat:A2.2A:absolute-value-interval-maximum'
  ));
  assert.ok(template, 'Lesson 1 should contain the audited A2.2A Digital SAT item');

  const delivered = generateQuestion(template, 'lesson1-sat-student-1');
  assert.ok(delivered, 'the generator must return a student-ready question');

  const strings = [];
  const collect = (value) => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(delivered);
  assert.ok(!strings.some((value) => /\{\{\s*[A-Za-z_]/.test(value)), 'no generator placeholder may reach the student');
  assert.match(delivered.prompt, /domain is restricted to/);
  assert.ok(!/\{\{/.test(delivered.prompt));
  assert.equal(typeof delivered.answerFields?.[0]?.answer, 'number');
});

test('successful library creation no longer throws from a stale parsed variable', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  const start = app.indexOf('const handleCreateAssignment = async');
  const end = app.indexOf('const updateExistingAssignmentFromReview', start);
  assert.ok(start >= 0 && end > start);
  const createBlock = app.slice(start, end);
  assert.doesNotMatch(createBlock, /parsed\.repairs/);
});
