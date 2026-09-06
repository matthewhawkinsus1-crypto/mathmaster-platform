import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createCourseWork } = require('../../functions/lib/classroom.js');

function classroomRecorder() {
  const calls = [];
  return {
    calls,
    classroom: {
      courses: {
        courseWork: {
          async create(args) {
            calls.push(args);
            return { data: { id: 'coursework-1', ...args.requestBody } };
          },
        },
      },
    },
  };
}

const baseInput = {
  courseId: 'course-1',
  title: 'Lesson 1 Warm-Up',
  description: 'Open this section in MathMaster.',
  materials: [],
  launchUrl: 'https://mathmaster-aleks.web.app/?assignment=a1&section=warmup',
  maxPoints: 5,
};

test('future release creates teacher-only scheduled CourseWork until the intended time', async () => {
  const { classroom, calls } = classroomRecorder();
  const publishAt = new Date('2099-09-06T14:30:00.000Z');

  await createCourseWork(classroom, { ...baseInput, publishAt });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestBody.state, 'DRAFT');
  assert.equal(calls[0].requestBody.scheduledTime, publishAt.toISOString());
});

test('past release publishes immediately and does not send stale scheduledTime', async () => {
  const { classroom, calls } = classroomRecorder();
  const publishAt = new Date('2000-09-06T14:30:00.000Z');

  await createCourseWork(classroom, { ...baseInput, publishAt });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestBody.state, 'PUBLISHED');
  assert.equal(calls[0].requestBody.scheduledTime, undefined);
});

test('no release time keeps the existing immediate-publish behavior', async () => {
  const { classroom, calls } = classroomRecorder();

  await createCourseWork(classroom, baseInput);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestBody.state, 'PUBLISHED');
  assert.equal(calls[0].requestBody.scheduledTime, undefined);
});
