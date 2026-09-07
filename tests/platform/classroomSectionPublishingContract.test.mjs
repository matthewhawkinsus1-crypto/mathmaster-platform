import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  classroomPublicationSpecs,
  classroomPublicationTargets,
} = require('../../functions/lib/classroomSectionPublishing.js');

test('whole assignment remains the default publication contract', () => {
  const [spec] = classroomPublicationSpecs({
    assignment: {
      schemaVersion: 5,
      title: 'Functions Review',
      releaseAt: '2026-09-08T13:00:00.000Z',
      sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }],
    },
    requestData: {},
  });
  assert.equal(spec.sectionKey, 'whole');
  assert.equal(spec.title, 'Functions Review');
  assert.deepEqual(spec.questionIndices, [0]);
  assert.equal(spec.publishAt, '2026-09-08T13:00:00.000Z');
});

test('split publication deduplicates requested sections and uses section-only titles and indices', () => {
  const specs = classroomPublicationSpecs({
    assignment: {
      schemaVersion: 5,
      title: 'Functions Review',
      sections: [
        { role: 'warmup', questions: [{ id: 'w1' }, { id: 'w2', teacherExcluded: true }] },
        { role: 'classwork', questions: [{ id: 'c1' }] },
        { role: 'dol', questions: [{ id: 'd1' }] },
      ],
    },
    requestData: { sectionKeys: ['warmup', 'dol', 'warmup'] },
  });
  assert.deepEqual(specs.map((spec) => spec.sectionKey), ['warmup', 'dol']);
  assert.deepEqual(specs.map((spec) => spec.questionIndices), [[0], [3]]);
  assert.match(specs[0].title, /Warm-Up/);
  assert.match(specs[1].title, /DOL/);
});

test('split publication fails closed for unknown or empty sections', () => {
  const assignment = {
    schemaVersion: 5,
    title: 'Functions Review',
    sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }],
  };
  assert.throws(
    () => classroomPublicationSpecs({ assignment, requestData: { sectionKeys: ['mystery'] } }),
    /Unsupported Classroom section/i,
  );
  assert.throws(
    () => classroomPublicationSpecs({ assignment, requestData: { sectionKeys: ['dol'] } }),
    /has no included questions/i,
  );
});

test('publication targets expand every selected course and section with deterministic independent ids', () => {
  const targets = classroomPublicationTargets({
    assignmentId: 'a1',
    assignment: {
      schemaVersion: 5,
      title: 'Functions Review',
      sections: [
        { role: 'warmup', questions: [{ id: 'w1' }] },
        { role: 'dol', questions: [{ id: 'd1' }] },
      ],
    },
    courseIds: ['course-1', 'course-2'],
    requestData: { sectionKeys: ['warmup', 'dol'] },
  });

  assert.equal(targets.length, 4);
  assert.equal(new Set(targets.map((target) => target.publicationId)).size, 4);
  assert.deepEqual(
    targets.map((target) => target.sectionKey),
    ['warmup', 'dol', 'warmup', 'dol'],
  );
  assert.deepEqual(
    targets.map((target) => target.courseId),
    ['course-1', 'course-1', 'course-2', 'course-2'],
  );
});
