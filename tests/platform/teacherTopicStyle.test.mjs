/*
 * THE CLASSROOM TOPIC STYLE FOLLOWS THE TEACHER, NOT THE BROWSER (TT07).
 *
 * The style Classroom topics are named in ("Module 2 • Topic 2", "Week of
 * Oct 12", both) was remembered per browser, so a teacher publishing from two
 * devices got a different topic on each. It is now also kept in
 * teacherPreferences/{uid}, which only that teacher reads and writes
 * (tests/rules/teacherPreferencesRules.test.mjs holds the rules in the
 * emulator), and a device reads it when the Classroom screen opens and just
 * before an automatic publish.
 *
 * Here: which style a device uses and what it saves (plain functions, with the
 * database stood in for), and the wiring on the screens, bound to the code that
 * does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CLASSROOM_TOPIC_STYLE_STORAGE_KEY,
  readClassroomTopicStyle,
  storedClassroomTopicStyle,
} from '../../src/platform/classroom/classroomTopicNaming.js';
import {
  chooseTeacherTopicStyle,
  reconcileTopicStyle,
  syncTeacherTopicStyle,
} from '../../src/platform/classroom/teacherTopicStyle.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// A browser's own copy, one per device.
const withBrowser = async (stored, run) => {
  const values = new Map(stored ? [[CLASSROOM_TOPIC_STYLE_STORAGE_KEY, stored]] : []);
  globalThis.window = { localStorage: { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)) } };
  try {
    return await run(values);
  } finally {
    delete globalThis.window;
  }
};
// The teacher's document, stood in for: what it holds, and every save sent to it.
const teacherDocument = (saved, { failRead = false, failSave = false } = {}) => {
  const state = { saved, saves: [], reads: 0 };
  return {
    state,
    read: async () => { state.reads += 1; if (failRead) throw new Error('permission-denied'); return state.saved; },
    save: async (_db, _uid, style) => { if (failSave) throw new Error('unavailable'); state.saves.push(style); state.saved = style; },
  };
};
const DB = {};
const UID = 'teacher-uid';

test('the teacher\'s saved style wins; a browser\'s own earlier choice is saved only when nothing is; no choice is the module style', () => {
  assert.deepEqual(reconcileTopicStyle({ saved: 'week', browser: 'module' }), { style: 'week', saveForTeacher: false });
  assert.deepEqual(reconcileTopicStyle({ saved: 'weekModule', browser: null }), { style: 'weekModule', saveForTeacher: false });
  assert.deepEqual(reconcileTopicStyle({ saved: null, browser: 'week' }), { style: 'week', saveForTeacher: true });
  assert.deepEqual(reconcileTopicStyle({ saved: null, browser: null }), { style: 'module', saveForTeacher: false });
  // Anything that is not one of the three is no choice.
  assert.deepEqual(reconcileTopicStyle({ saved: 'day', browser: 'nonsense' }), { style: 'module', saveForTeacher: false });
  assert.deepEqual(reconcileTopicStyle({ saved: undefined, browser: 'week' }), { style: 'week', saveForTeacher: true });
  assert.deepEqual(reconcileTopicStyle(), { style: 'module', saveForTeacher: false });
});

test('a browser tells "never chose" from "chose the module style"', async () => {
  await withBrowser(null, async () => {
    assert.equal(storedClassroomTopicStyle(), null);
    assert.equal(readClassroomTopicStyle(), 'module');
  });
  await withBrowser('module', async () => assert.equal(storedClassroomTopicStyle(), 'module'));
  await withBrowser('nonsense', async () => assert.equal(storedClassroomTopicStyle(), null));
  globalThis.window = { localStorage: { getItem: () => { throw new Error('blocked'); } } };
  try {
    assert.equal(storedClassroomTopicStyle(), null);
  } finally {
    delete globalThis.window;
  }
});

test('syncing brings a browser in line with the teacher\'s saved style, on every device', async () => {
  // A second device that never chose.
  const first = teacherDocument('week');
  assert.deepEqual(
    await withBrowser(null, async (values) => ({ style: await syncTeacherTopicStyle({ db: DB, uid: UID, read: first.read, save: first.save }), cached: values.get(CLASSROOM_TOPIC_STYLE_STORAGE_KEY) })),
    { style: 'week', cached: 'week' },
  );
  assert.deepEqual(first.state.saves, [], 'nothing to save: the teacher already has a choice');

  // A device that chose something else, long ago: the teacher's choice replaces it.
  const second = teacherDocument('weekModule');
  assert.deepEqual(
    await withBrowser('module', async (values) => ({ style: await syncTeacherTopicStyle({ db: DB, uid: UID, read: second.read, save: second.save }), cached: values.get(CLASSROOM_TOPIC_STYLE_STORAGE_KEY) })),
    { style: 'weekModule', cached: 'weekModule' },
  );
  assert.deepEqual(second.state.saves, []);
});

test('a choice made in a browser before this existed is saved for the teacher once, then every device agrees', async () => {
  const stored = teacherDocument(null);
  const firstDevice = await withBrowser('week', async (values) => ({ style: await syncTeacherTopicStyle({ db: DB, uid: UID, read: stored.read, save: stored.save }), cached: values.get(CLASSROOM_TOPIC_STYLE_STORAGE_KEY) }));
  assert.deepEqual(firstDevice, { style: 'week', cached: 'week' });
  assert.deepEqual(stored.state.saves, ['week'], 'saved for the teacher');
  // Another device, with its own older choice, now takes the teacher\'s.
  const otherDevice = await withBrowser('module', async (values) => ({ style: await syncTeacherTopicStyle({ db: DB, uid: UID, read: stored.read, save: stored.save }), cached: values.get(CLASSROOM_TOPIC_STYLE_STORAGE_KEY) }));
  assert.deepEqual(otherDevice, { style: 'week', cached: 'week' });
  assert.deepEqual(stored.state.saves, ['week'], 'and does not save over it');
});

test('a browser that never chose is not made to look as if it had, and nothing is saved for a teacher who never chose', async () => {
  const none = teacherDocument(null);
  const result = await withBrowser(null, async (values) => ({ style: await syncTeacherTopicStyle({ db: DB, uid: UID, read: none.read, save: none.save }), cached: values.has(CLASSROOM_TOPIC_STYLE_STORAGE_KEY) }));
  assert.deepEqual(result, { style: 'module', cached: false });
  assert.deepEqual(none.state.saves, []);
});

test('when the saved style cannot be read or saved, the teacher notices nothing: this browser\'s choice stands', async () => {
  const unreadable = teacherDocument('week', { failRead: true });
  assert.equal(await withBrowser('weekModule', () => syncTeacherTopicStyle({ db: DB, uid: UID, read: unreadable.read, save: unreadable.save })), 'weekModule');
  assert.equal(await withBrowser(null, () => syncTeacherTopicStyle({ db: DB, uid: UID, read: unreadable.read, save: unreadable.save })), 'module');
  assert.deepEqual(unreadable.state.saves, [], 'a failed read saves nothing');

  const unsavable = teacherDocument(null, { failSave: true });
  assert.equal(await withBrowser('week', () => syncTeacherTopicStyle({ db: DB, uid: UID, read: unsavable.read, save: unsavable.save })), 'week', 'a failed save changes nothing for this device');

  // Not signed in as a teacher with an id: no read at all.
  const idle = teacherDocument('week');
  assert.equal(await withBrowser('module', () => syncTeacherTopicStyle({ db: DB, uid: '', read: idle.read, save: idle.save })), 'module');
  assert.equal(await withBrowser(null, () => syncTeacherTopicStyle({ db: null, uid: UID, read: idle.read, save: idle.save })), 'module');
  assert.equal(await withBrowser(null, () => syncTeacherTopicStyle()), 'module');
  assert.equal(idle.state.reads, 0);
});

test('choosing a style keeps it in this browser at once and saves it for the teacher', async () => {
  const stored = teacherDocument(null);
  const outcome = await withBrowser(null, async (values) => ({
    saved: await chooseTeacherTopicStyle({ db: DB, uid: UID, style: 'weekModule', save: stored.save }),
    cached: values.get(CLASSROOM_TOPIC_STYLE_STORAGE_KEY),
  }));
  assert.deepEqual(outcome, { saved: true, cached: 'weekModule' });
  assert.deepEqual(stored.state.saves, ['weekModule']);

  // A save that fails still leaves this browser with the choice, and says so.
  const failing = teacherDocument(null, { failSave: true });
  const offline = await withBrowser(null, async (values) => ({
    saved: await chooseTeacherTopicStyle({ db: DB, uid: UID, style: 'week', save: failing.save }),
    cached: values.get(CLASSROOM_TOPIC_STYLE_STORAGE_KEY),
  }));
  assert.deepEqual(offline, { saved: false, cached: 'week' });
  // No teacher id: this browser only.
  assert.equal(await withBrowser(null, () => chooseTeacherTopicStyle({ db: DB, uid: '', style: 'week', save: stored.save })), false);
  assert.deepEqual(stored.state.saves, ['weekModule'], 'nothing was sent without an id');
});

test('the Classroom screen reads the saved style when it opens, saves a choice for the teacher, and the topic follows the style in force', () => {
  const manager = executableSource(read('src/ClassroomManagerV2.jsx'));
  assert.match(manager, /import \{ chooseTeacherTopicStyle, syncTeacherTopicStyle \} from '\.\/platform\/classroom\/teacherTopicStyle\.js';/);
  const sync = region(manager, 'syncTeacherTopicStyle({ db, uid: teacherUid })', '[teacherUid]', 'sync on open');
  assert.match(sync, /\.then\(\(style\) => \{ if \(current\) setTopicStyle\(style\); \}\)/);
  const follows = region(manager, 'const topicStyleShownRef = useRef(topicStyle);', '[topicStyle]', 'topic follows style');
  assert.match(follows, /if \(topicStyleShownRef\.current === topicStyle\) return;/);
  assert.match(follows, /setTopicName\(topicForAssignment\(selectedAssignment, topicStyle\)\)/);
  assert.match(manager, /teacherUid = '',/);

  const workspace = read('src/app/teacher/TeacherWorkspace.jsx');
  assert.match(region(workspace, '<ClassroomManagerV2', '/>', 'manager mount'), /teacherUid=\{user\.uid\}/);
});

test('an automatic publish names the topic from the teacher\'s saved style, through the teacher kit', async () => {
  const kit = await import('../../src/app/teacher/teacherKit.js');
  assert.equal(kit.teacherClassroomTopicStyle, syncTeacherTopicStyle);
  const publish = executableSource(region(read('src/App.jsx'), 'const autoPublishAssignmentPackageToClassroom = async', 'const summary = response?.summary', 'automatic Classroom publish'));
  assert.match(publish, /teacherClassroomTopicStyle \} = requireTeacherKit\(\);/);
  assert.match(publish, /const topicStyle = await teacherClassroomTopicStyle\(\{ db, uid: user\?\.uid \}\);/);
  assert.match(publish, /automaticClassroomTopicName\(assignment, \{ style: topicStyle \}\)/);
});
