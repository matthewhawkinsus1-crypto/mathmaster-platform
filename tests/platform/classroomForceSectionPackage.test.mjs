import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const require = createRequire(import.meta.url);

const { classroomPublicationSpecs } = require('../../functions/lib/classroomSectionPublishing.js');
const uiModule = await import(pathToFileURL(path.join(root, 'src/classroomSectionPublishingUi.js')).href);

test('selected section publication content is section-first and concise', () => {
  const specs = classroomPublicationSpecs({
    assignment: {
      schemaVersion: 5,
      title: 'Functions Review',
      dueAt: '2026-09-09T23:59:00.000Z',
      sections: [
        { role: 'warmup', questions: [{ id: 'w1' }] },
        { role: 'classwork', questions: [{ id: 'c1' }] },
        { role: 'practice', questions: [{ id: 'p1' }] },
        { role: 'dol', questions: [{ id: 'd1' }] },
      ],
    },
    requestData: {
      sectionKeys: ['warmup', 'classwork', 'practice', 'dol'],
      instructions: 'Complete the entire assignment in MathMaster.',
    },
  });

  assert.deepEqual(
    specs.map((spec) => spec.title),
    [
      'Warm-Up — Functions Review',
      'Classwork — Functions Review',
      'Practice — Functions Review',
      'DOL — Functions Review',
    ],
  );
  assert.deepEqual(
    specs.map((spec) => spec.instructions),
    [
      'Complete the Warm-Up in MathMaster.',
      'Complete the Classwork in MathMaster.',
      'Complete the Practice in MathMaster.',
      'Complete the DOL in MathMaster.',
    ],
  );
});

test('force preview planner returns one prefilled card per selected section', () => {
  assert.equal(typeof uiModule.classroomSectionPostPreviews, 'function');
  const previews = uiModule.classroomSectionPostPreviews({
    assignment: {
      schemaVersion: 5,
      title: 'Functions Review',
      dueAt: '2026-09-09T23:59:00.000Z',
      sections: [
        { role: 'warmup', title: 'Recognize Features', questions: [{ id: 'w1' }, { id: 'w2', teacherExcluded: true }] },
        { role: 'classwork', title: 'Guided Review', questions: [{ id: 'c1' }] },
        { role: 'practice', title: 'Independent Practice', questions: [{ id: 'p1' }, { id: 'p2' }] },
        { role: 'dol', title: 'Exit Ticket', questions: [{ id: 'd1' }] },
      ],
    },
    selectedKeys: ['warmup', 'classwork', 'practice', 'dol'],
  });

  assert.deepEqual(previews.map((preview) => preview.sectionKey), ['warmup', 'classwork', 'practice', 'dol']);
  assert.deepEqual(previews.map((preview) => preview.points), [5, 100, 100, 100]);
  assert.deepEqual(previews.map((preview) => preview.questionCount), [1, 1, 2, 1]);
  assert.equal(previews[0].title, 'Warm-Up — Functions Review');
  assert.equal(previews[0].instructions, 'Complete the Warm-Up in MathMaster.');
  assert.equal(previews[0].gradingMode, 'engagement');
});

test('platform entry routes split force requests without replacing the legacy whole force callable', () => {
  const entry = read('functions/platformEntry.js');
  assert.match(entry, /legacyForceRepublishAssignmentToClassrooms\s*=\s*base\.forceRepublishAssignmentToClassrooms/);
  assert.match(entry, /forceRepublishAssignmentSectionsHandler/);
  assert.match(entry, /exports\.forceRepublishAssignmentToClassrooms\s*=\s*onCall/);
  assert.match(entry, /return legacyForceRepublishAssignmentToClassrooms\.run\(request\)/);
});

test('forced section repost keeps section identity and explicitly resends grades to the replacement CourseWork', () => {
  const forceEntry = read('functions/classroomSectionForceEntry.js');
  assert.match(forceEntry, /forcePublicationInstanceMarker\(forceRequestId, target\.publicationId\)/);
  assert.match(forceEntry, /findCourseWorkByPublicationMarker[\s\S]*?\[instanceMarker\]/);
  assert.match(forceEntry, /sectionGradePassbackEnabled:\s*gradePassbackEnabled !== false/);
  assert.match(forceEntry, /supersededCourseworkIds\s*=\s*FieldValue\.arrayUnion/);
  assert.match(forceEntry, /reason:\s*"manual-retry"/);
});

test('Classroom Manager sends the selected grade targets to force repost and renders the force preview', () => {
  const manager = read('src/ClassroomManagerV2.jsx');
  const forceHandler = manager.match(/const handleForceRepublish[\s\S]*?const handlePublishMaterial/)?.[0] || '';
  assert.match(forceHandler, /sectionKeys:\s*selectedClassroomSectionKeys/);
  assert.match(manager, /ClassroomForceRepublishPreview/);
  assert.match(manager, /selectedKeys=\{selectedClassroomSectionKeys\}/);
});

test('regular automatic Classroom publish forwards the authored V5 section package instead of collapsing to whole', () => {
  const app = read('src/App.jsx');
  assert.match(app, /classroomSectionKeysForAssignment/);
  assert.match(app, /sectionKeys:\s*classroomSectionKeysForAssignment\(assignment\)/);
});
