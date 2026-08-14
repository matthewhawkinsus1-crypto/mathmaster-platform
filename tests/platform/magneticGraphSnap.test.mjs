import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentTableMagneticTargets,
  findMagneticSnapTarget,
  normalizeMagneticSnapTargets,
  resolveReachableSnapStep,
  snapValue,
} from '../../src/graphInteractionPrecision.js';

test('fixed decimal points retain exact free-placement precision', () => {
  const tasks = [
    { id: 'p1', expected: [0, 0] },
    { id: 'p2', expected: [0.5, 0.9] },
    { id: 'p3', expected: [2.5, 4.5] },
    { id: 'p4', expected: [5, 9] },
  ];
  assert.equal(resolveReachableSnapStep(0.5, tasks), 0.1);
  assert.equal(snapValue(0.9, 0.1), 0.9);
});

test('student table points become opt-in magnetic targets', () => {
  const tasks = [
    { id: 'point-2', expected: [0.5, 0.9] },
    { id: 'point-key', expected: [0, 0] },
  ];
  const targets = normalizeMagneticSnapTargets(
    buildStudentTableMagneticTargets([[0, 0], [0.5, 0.9]]),
    tasks,
  );
  assert.equal(targets.find((target) => target.point[1] === 0.9).taskId, 'point-2');
  assert.equal(targets.find((target) => target.point[0] === 0).taskId, 'point-key');
});

test('nearby pointer magnetizes to the exact student-known decimal point', () => {
  const targets = normalizeMagneticSnapTargets(
    buildStudentTableMagneticTargets([[0.5, 0.9]]),
    [{ id: 'point-1', expected: [0.5, 0.9] }],
  );
  const result = findMagneticSnapTarget({
    taskId: 'point-1',
    rawScreenPoint: [104, 92],
    targets,
    toScreenPoint: () => [100, 100],
    cssScaleX: 1,
    cssScaleY: 1,
    radiusPixels: 18,
  });
  assert.deepEqual(result.point, [0.5, 0.9]);
});

test('outside the magnetic radius leaves placement free', () => {
  const targets = normalizeMagneticSnapTargets(
    buildStudentTableMagneticTargets([[0.5, 0.9]]),
    [{ id: 'point-1', expected: [0.5, 0.9] }],
  );
  assert.equal(findMagneticSnapTarget({
    taskId: 'point-1', rawScreenPoint: [140, 140], targets,
    toScreenPoint: () => [100, 100], cssScaleX: 1, cssScaleY: 1, radiusPixels: 18,
  }), null);
});

test('hidden expected values do not create magnetic targets by themselves', () => {
  assert.deepEqual(normalizeMagneticSnapTargets(undefined, [{ id: 'secret', expected: [7, 11] }]), []);
});

test('ambiguous nearby targets do not choose for the student', () => {
  const result = findMagneticSnapTarget({
    taskId: null,
    rawScreenPoint: [102, 102],
    targets: [
      { taskId: null, point: [1, 1], source: 'student-known' },
      { taskId: null, point: [1.1, 1.1], source: 'student-known' },
    ],
    toScreenPoint: (point) => point[0] === 1 ? [100, 100] : [104, 104],
    cssScaleX: 1,
    cssScaleY: 1,
    radiusPixels: 18,
    ambiguityPixels: 4,
  });
  assert.equal(result, null);
});

test('magnetic radius is measured in CSS pixels so mobile keeps a usable target', () => {
  const targets = normalizeMagneticSnapTargets(
    buildStudentTableMagneticTargets([[0.5, 0.9]]),
    [{ id: 'point-1', expected: [0.5, 0.9] }],
  );
  const result = findMagneticSnapTarget({
    taskId: 'point-1',
    rawScreenPoint: [120, 100], // 20 viewBox units away
    targets,
    toScreenPoint: () => [100, 100],
    cssScaleX: 0.4, // only 8 CSS px on a narrow rendered graph
    cssScaleY: 0.4,
    radiusPixels: 18,
  });
  assert.deepEqual(result.point, [0.5, 0.9]);
});
