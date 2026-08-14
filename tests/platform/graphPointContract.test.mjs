import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { auditStaticGraphViewport } from '../../src/graphSpecUtils.js';
import {
  readGraphPointCoordinates,
  normalizeGraphPointForRuntime,
  normalizeStaticGraphPoints,
} from '../../src/graphPointUtils.js';

assert.deepEqual(readGraphPointCoordinates({ x: 0.5, y: 0.9 }), [0.5, 0.9]);
assert.deepEqual(readGraphPointCoordinates({ coordinates: [2, 5] }), [2, 5]);
assert.deepEqual(readGraphPointCoordinates([3, -4]), [3, -4]);
assert.equal(readGraphPointCoordinates({ x: 2 }), null);

assert.deepEqual(normalizeGraphPointForRuntime({ x: 1, y: 5, label: 'A' }), {
  coordinates: [1, 5],
  label: 'A',
});
assert.deepEqual(normalizeGraphPointForRuntime([2, 8]), { coordinates: [2, 8] });

const normalized = normalizeStaticGraphPoints({
  xMin: 0, xMax: 2, yMin: 0, yMax: 10,
  points: [{ x: 0, y: 0 }, { coordinates: [1, 5] }, [2, 10]],
});
assert.deepEqual(normalized.points, [
  { coordinates: [0, 0] },
  { coordinates: [1, 5] },
  { coordinates: [2, 10] },
]);

const v5 = {
  schemaVersion: 5,
  assignment: { title: 'Point contract', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  activities: [{
    role: 'classwork',
    questions: [{
      standard: 'A.3C',
      prompt: 'Match the stories to the graphs.',
      studentActions: ['matchGraphsToStories'],
      stories: [{ id: 's1', description: 'Whole objects.' }],
      candidateGraphs: [{
        id: 'g1', label: 'Graph 1',
        graph: { xMin: 0, xMax: 2, yMin: 0, yMax: 10, points: [{ x: 0, y: 0 }, { x: 1, y: 5 }] },
      }],
      correctMatches: { s1: 'g1' },
    }],
  }],
};
const compiled = compileAuthoringIntentV5(v5).package.activities[0].questions[0];
assert.deepEqual(compiled.graphs[0].graph.points, [
  { coordinates: [0, 0] },
  { coordinates: [1, 5] },
]);

const validAudit = auditStaticGraphViewport({
  xMin: 0, xMax: 2, yMin: 0, yMax: 10,
  points: [{ x: 0, y: 0 }, { coordinates: [1, 5] }],
}, { label: 'graph' });
assert.deepEqual(validAudit.errors, []);

const badAudit = auditStaticGraphViewport({
  xMin: 0, xMax: 2, yMin: 0, yMax: 10,
  points: [{ x: 1 }],
}, { label: 'graph' });
assert.ok(badAudit.errors.some((message) => message.includes('graph.points[0]')));
assert.ok(badAudit.errors.some((message) => message.includes('{x, y}')));

console.log('graphPointContract.test.mjs: passed');
