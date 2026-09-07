import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  launchPayloadForPublication,
  launchRedirectParams,
} = require('../../functions/lib/classroomLaunch.js');

test('section launch payload and redirect retain section identity', () => {
  const payload = launchPayloadForPublication({
    assignmentId: 'a1',
    courseId: 'c1',
    publicationId: 'p1',
    sectionKey: 'practice',
  });

  assert.deepEqual(payload, {
    assignmentId: 'a1',
    courseId: 'c1',
    publicationId: 'p1',
    sectionKey: 'practice',
  });

  const params = launchRedirectParams(payload);
  assert.equal(params.get('launch'), 'a1');
  assert.equal(params.get('classroomCourse'), 'c1');
  assert.equal(params.get('classroomPublication'), 'p1');
  assert.equal(params.get('classroomSection'), 'practice');
});

test('legacy whole-assignment launch remains byte-shape compatible by omitting sectionKey and classroomSection', () => {
  const payload = launchPayloadForPublication({
    assignmentId: 'a1',
    courseId: 'c1',
    publicationId: 'p1',
  });
  assert.deepEqual(payload, {
    assignmentId: 'a1',
    courseId: 'c1',
    publicationId: 'p1',
  });

  const params = launchRedirectParams(payload);
  assert.equal(params.get('launch'), 'a1');
  assert.equal(params.has('classroomSection'), false);
});

test('explicit invalid section launch fails closed', () => {
  assert.throws(
    () => launchPayloadForPublication({
      assignmentId: 'a1',
      courseId: 'c1',
      publicationId: 'p1',
      sectionKey: 'mystery',
    }),
    /Unsupported Classroom section/i,
  );

  assert.throws(
    () => launchRedirectParams({ assignmentId: 'a1', sectionKey: 'mystery' }),
    /Unsupported Classroom section/i,
  );
});
