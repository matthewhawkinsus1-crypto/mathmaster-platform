/*
 * GOOGLE CLASSROOM TOPICS NAMED BY WEEK.
 *
 * A teacher can file Classroom posts under "Week of Oct 12" (or
 * "Week of Oct 12 • Module 2 • Topic 2") instead of the folder's module topic,
 * so students can find an assignment by when they got it. The week is the one
 * students first see the post — its scheduled release, else when it is
 * published — in the teacher's time zone, Monday-start.
 */
// The teacher's browser is in Central time; the week must be read there.
process.env.TZ = 'America/Chicago';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { region, executableSource } from './helpers/sourceContract.mjs';

const {
  CLASSROOM_TOPIC_STYLE_OPTIONS,
  CLASSROOM_TOPIC_STYLE_STORAGE_KEY,
  automaticClassroomTopicName,
  classroomPostWeekDate,
  classroomTopicNameFor,
  classroomWeekStart,
  readClassroomTopicStyle,
  saveClassroomTopicStyle,
  weekOfTopicLabel,
} = await import('../../src/platform/classroom/classroomTopicNaming.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, '../..', relative), 'utf8');

test('a week is named by its Monday, whatever day inside it', () => {
  assert.equal(weekOfTopicLabel(new Date(2026, 9, 12, 0, 0)), 'Week of Oct 12'); // Monday
  assert.equal(weekOfTopicLabel(new Date(2026, 9, 15, 9, 30)), 'Week of Oct 12'); // Thursday
  assert.equal(weekOfTopicLabel(new Date(2026, 9, 18, 23, 59)), 'Week of Oct 12'); // Sunday night
  assert.equal(weekOfTopicLabel(new Date(2026, 9, 19, 0, 1)), 'Week of Oct 19'); // the next Monday
  assert.equal(weekOfTopicLabel(new Date(2027, 0, 1, 12)), 'Week of Dec 28', 'a week that starts in the old year');
  assert.equal(weekOfTopicLabel(new Date(2026, 10, 1, 12)), 'Week of Oct 26', 'a week that crosses a month');
  assert.equal(classroomWeekStart('not a date'), null);
  assert.equal(weekOfTopicLabel(null), '');
});

test('the week is read in the teacher\'s time zone, not UTC', () => {
  // 04:30 UTC on Monday Oct 19 is 11:30 pm on Sunday Oct 18 in Chicago: a
  // Sunday-night release belongs to the week the class is in.
  const release = '2026-10-19T04:30:00.000Z';
  assert.equal(new Date(release).getUTCDay(), 1, 'UTC would call it Monday');
  assert.equal(weekOfTopicLabel(release), 'Week of Oct 12');
});

test('the week students first see the post: its scheduled release, else the publish moment — never the due date', () => {
  const now = new Date(2026, 9, 15, 10);
  assert.equal(weekOfTopicLabel(classroomPostWeekDate({ releaseAt: '2026-10-20T13:00:00.000Z', dueAt: '2026-10-30T13:00:00.000Z' }, now)), 'Week of Oct 19');
  assert.equal(weekOfTopicLabel(classroomPostWeekDate({ dueAt: '2026-10-30T13:00:00.000Z' }, now)), 'Week of Oct 12', 'a due date does not move the topic');
  assert.equal(weekOfTopicLabel(classroomPostWeekDate({ releaseAt: '' }, now)), 'Week of Oct 12');
  // Firestore Timestamp shapes.
  const seconds = Math.floor(new Date(2026, 9, 21, 8).getTime() / 1000);
  assert.equal(weekOfTopicLabel(classroomPostWeekDate({ releaseAt: { seconds } }, now)), 'Week of Oct 19');
  assert.equal(weekOfTopicLabel(classroomPostWeekDate({ releaseAt: { toDate: () => new Date(2026, 9, 27, 8) } }, now)), 'Week of Oct 26');
});

test('each style names the topic, and an unknown style keeps the folder topic', () => {
  const assignment = { releaseAt: '2026-10-13T14:00:00.000Z' };
  const moduleTopic = 'Module 2 • Topic 2';
  assert.equal(classroomTopicNameFor({ style: 'module', moduleTopic, assignment }), 'Module 2 • Topic 2');
  assert.equal(classroomTopicNameFor({ style: 'week', moduleTopic, assignment }), 'Week of Oct 12');
  assert.equal(classroomTopicNameFor({ style: 'weekModule', moduleTopic, assignment }), 'Week of Oct 12 • Module 2 • Topic 2');
  assert.equal(classroomTopicNameFor({ style: 'weekModule', moduleTopic: '  ', assignment }), 'Week of Oct 12');
  assert.equal(classroomTopicNameFor({ style: 'surprise', moduleTopic, assignment }), 'Module 2 • Topic 2');
  assert.deepEqual(CLASSROOM_TOPIC_STYLE_OPTIONS.map((option) => option.id), ['module', 'week', 'weekModule']);
});

test('automatic publishing: the module style is exactly the old behaviour; the week style always has a topic', () => {
  const now = new Date(2026, 9, 15, 10);
  const withTopic = { classroomPackage: { topic: { name: 'Module 2 • Topic 2' } } };
  assert.equal(automaticClassroomTopicName(withTopic, { style: 'module', now }), 'Module 2 • Topic 2');
  assert.equal(automaticClassroomTopicName({}, { style: 'module', now }), '', 'no folder topic and no week style: no topic, as before');
  assert.equal(automaticClassroomTopicName({}, { style: 'week', now }), 'Week of Oct 12');
  assert.equal(automaticClassroomTopicName(withTopic, { style: 'weekModule', now }), 'Week of Oct 12 • Module 2 • Topic 2');
});

test('the choice is remembered per browser, and storage failures fall back to the module style', () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) } };
  try {
    assert.equal(readClassroomTopicStyle(), 'module');
    saveClassroomTopicStyle('week');
    assert.equal(store.get(CLASSROOM_TOPIC_STYLE_STORAGE_KEY), 'week');
    assert.equal(readClassroomTopicStyle(), 'week');
    store.set(CLASSROOM_TOPIC_STYLE_STORAGE_KEY, 'nonsense');
    assert.equal(readClassroomTopicStyle(), 'module');
    globalThis.window = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } };
    assert.equal(readClassroomTopicStyle(), 'module');
    assert.doesNotThrow(() => saveClassroomTopicStyle('week'));
  } finally {
    delete globalThis.window;
  }
});

test('App.jsx: automatic publishing sends the resolved topic to BOTH posts, from the resolver the teacher kit carries', async () => {
  const app = read('src/App.jsx');
  // Only a teacher publishes to Classroom: the resolver comes with the teacher
  // kit (src/app/teacher/teacherKit.js), never with a student's first load.
  const kit = await import('../../src/app/teacher/teacherKit.js');
  assert.equal(kit.automaticClassroomTopicName, automaticClassroomTopicName);
  assert.doesNotMatch(app, /from '\.\/platform\/classroom\/classroomTopicNaming\.js'/);
  const publish = executableSource(region(app, 'const autoPublishAssignmentPackageToClassroom = async', 'const summary = response?.summary', 'automatic Classroom publish'));
  // The name is built from the teacher's saved style, read first (TT07: a
  // second device names topics the same way); the resolver still names it.
  assert.match(publish, /const \{ automaticClassroomTopicName, [\w, ]*teacherClassroomTopicStyle[\w, ]* \} = requireTeacherKit\(\);/);
  assert.match(publish, /const topicStyle = await teacherClassroomTopicStyle\(\{ db, uid: user\?\.uid \}\);\s*const topicName = automaticClassroomTopicName\(assignment, \{ style: topicStyle \}\);/);
  const material = region(publish, 'publishClassroomMaterial({', '});', 'materials post');
  const post = region(publish, 'publishAssignmentToClassrooms({', '});', 'assignment post');
  for (const [name, call] of [['materials post', material], ['assignment post', post]]) {
    assert.match(call, /^\s*topicName,\s*$/m, `the ${name} sends the resolved topic`);
    assert.doesNotMatch(call, /topic\?\.name/, `the ${name} does not bypass the resolver`);
  }
});

test('Classroom Manager: the topic follows the chosen style, and the choice is saved', () => {
  const manager = read('src/ClassroomManagerV2.jsx');
  assert.match(manager, /from '\.\/platform\/classroom\/classroomTopicNaming\.js';/);
  const selection = executableSource(region(manager, 'useEffect(() => {\n    if (!selectedAssignment) return;', '}, [selectedAssignment?.id', 'assignment selection'));
  assert.match(selection, /setTopicName\(topicForAssignment\(selectedAssignment, topicStyle\)\)/);
  const picker = executableSource(region(manager, 'id="classroom-topic-style"', '</select>', 'topic style picker'));
  // Saved for the teacher (and in this browser) — teacherTopicStyle.js, TT07.
  assert.match(picker, /chooseTeacherTopicStyle\(\{ db, uid: teacherUid, style: next \}\)/);
  assert.match(picker, /setTopicName\(topicForAssignment\(selectedAssignment, next\)\)/);
  assert.match(manager, /useState\(readClassroomTopicStyle\)/);
});
