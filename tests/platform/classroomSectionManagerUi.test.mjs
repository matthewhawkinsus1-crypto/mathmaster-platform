import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const uiModuleUrl = pathToFileURL(path.join(root, 'src/classroomSectionPublishingUi.js')).href;
const {
  availableClassroomSectionKeys,
  nextClassroomSectionSelection,
} = await import(uiModuleUrl);

test('teacher section selector only offers grade-bearing sections that contain included questions', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [
      { role: 'warmup', questions: [{ id: 'w1' }, { id: 'w2', teacherExcluded: true }] },
      { role: 'classwork', questions: [{ id: 'c1', teacherExcluded: true }] },
      { role: 'classwork', questions: [{ id: 'p1', activityRole: 'practice' }] },
      { role: 'dol', questions: [{ id: 'd1' }] },
    ],
  };

  assert.deepEqual(
    availableClassroomSectionKeys(assignment),
    ['whole', 'warmup', 'practice', 'dol'],
  );
});

test('whole assignment is mutually exclusive with individual Classroom section posts', () => {
  let selection = ['whole'];
  selection = nextClassroomSectionSelection(selection, 'warmup');
  assert.deepEqual(selection, ['warmup']);

  selection = nextClassroomSectionSelection(selection, 'dol');
  assert.deepEqual(selection, ['warmup', 'dol']);

  selection = nextClassroomSectionSelection(selection, 'warmup');
  assert.deepEqual(selection, ['dol']);

  selection = nextClassroomSectionSelection(selection, 'dol');
  assert.deepEqual(selection, ['whole']);

  selection = nextClassroomSectionSelection(['warmup', 'practice'], 'whole');
  assert.deepEqual(selection, ['whole']);
});

test('Classroom Manager renders the explicit grade-represents selector and sends sectionKeys to publish', () => {
  const manager = read('src/ClassroomManagerV2.jsx');
  assert.match(manager, /ClassroomSectionGradeSelector/);
  assert.match(manager, /Google Classroom grade represents/i);
  assert.match(manager, /sectionKeys:\s*selectedClassroomSectionKeys/);
});
