// LC02: a BULK roster change invites the students it moves into their class's
// Live Challenge, the way a single one does (setStudentClass,
// assignStudentToTeacher, createStudentAccount). The rules are pure
// (liveChallengeBulkInvite.mjs) and tested here with a fake game; the callables'
// wiring is read as source (Node cannot run functions/index.js without the
// emulator), and tests/integration/liveChallengeBulkRoster.test.mjs plays it
// against a real Firestore.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';
import {
  BULK_INVITE_BUDGET_MS,
  TEACHER_LEVEL_REFUSALS,
  groupMovedByTeacher,
  inviteMovedStudents,
  movedByClassRestamp,
  movedFromMigrationUpdates,
} from '../../functions/shared/liveChallengeBulkInvite.mjs';

const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

/** A fake game board: which teachers have a game, what inviting each student says, and what was asked. */
const board = ({ games = [], outcomes = {} } = {}) => {
  const asked = [];
  const invited = [];
  let inFlight = 0;
  let widest = 0;
  return {
    asked,
    invited,
    get widest() { return widest; },
    hasGame: async (teacherEmail) => { asked.push(teacherEmail); return games.includes(teacherEmail); },
    invite: async (studentId) => {
      inFlight += 1;
      widest = Math.max(widest, inFlight);
      await Promise.resolve();
      invited.push(studentId);
      inFlight -= 1;
      return outcomes[studentId] || { invited: true };
    },
  };
};
const moves = (teacher, ids) => ids.map((studentId) => ({ studentId, teacherEmail: teacher }));
const run = (fake, moved, extra = {}) => inviteMovedStudents({ moved, hasGame: fake.hasGame, invite: fake.invite, ...extra });
// A clock that moves 4 seconds with every look at it.
const steppingClock = () => { let ticks = 0; return () => { ticks += 1; return ticks * 4_000; }; };

test('moved students are grouped by the teacher they now belong to, each once, in the order first seen', () => {
  const groups = groupMovedByTeacher([
    { studentId: 'a', teacherEmail: 'Ms.Rivera@School.org ' },
    { studentId: 'b', teacherEmail: 'mr.kim@school.org' },
    { studentId: 'c', teacherEmail: 'ms.rivera@school.org' },
    { studentId: 'a', teacherEmail: 'ms.rivera@school.org' },
    { studentId: ' a ', teacherEmail: 'ms.rivera@school.org' },
  ]);
  assert.deepEqual([...groups.entries()], [['ms.rivera@school.org', ['a', 'c']], ['mr.kim@school.org', ['b']]]);
  // Nobody a game could invite is dropped: no id, or no teacher.
  const dropped = groupMovedByTeacher([{ studentId: '', teacherEmail: 'x@y.org' }, { studentId: 'a', teacherEmail: '' }, { studentId: 'b' }, null, undefined, { teacherEmail: 'x@y.org' }]);
  assert.equal(dropped.size, 0);
  assert.equal(groupMovedByTeacher(undefined).size, 0);
  assert.equal(groupMovedByTeacher('not a list').size, 0);
});

test('a class restamp moves the students whose stored teacher was not exactly the class\'s, and nobody else', () => {
  const members = [
    { studentId: 'already', assignedTeacherEmail: 'ms.rivera@school.org' },
    { studentId: 'cased', assignedTeacherEmail: 'Ms.Rivera@School.org' },
    { studentId: 'drifted', assignedTeacherEmail: null },
    { studentId: 'blank' },
    { studentId: 'other', assignedTeacherEmail: 'mr.kim@school.org' },
  ];
  // A game's roster is matched on the exact string, so a restamp that normalizes
  // the address ('cased') makes the student eligible too.
  assert.deepEqual(movedByClassRestamp({ members, teacherEmail: 'Ms.Rivera@school.org' }), [
    { studentId: 'cased', teacherEmail: 'ms.rivera@school.org' },
    { studentId: 'drifted', teacherEmail: 'ms.rivera@school.org' },
    { studentId: 'blank', teacherEmail: 'ms.rivera@school.org' },
    { studentId: 'other', teacherEmail: 'ms.rivera@school.org' },
  ]);
  // A class with no teacher invites nobody; a class whose members are all stamped moves nobody.
  assert.deepEqual(movedByClassRestamp({ members, teacherEmail: null }), []);
  assert.deepEqual(movedByClassRestamp({ members: members.slice(0, 1), teacherEmail: 'ms.rivera@school.org' }), []);
  assert.deepEqual(movedByClassRestamp({}), []);
});

test("a migration's updates move each student to the teacher their class gives them", () => {
  const moved = movedFromMigrationUpdates([
    { studentId: 's1', fields: { classId: 'c1', classPeriod: '3', assignedTeacherEmail: 'ms.rivera@school.org' } },
    { studentId: 's2', fields: { classId: 'c2', classPeriod: '4', assignedTeacherEmail: null } },
    { studentId: 's3', fields: { classId: 'c1', classPeriod: '3', assignedTeacherEmail: 'ms.rivera@school.org' } },
  ]);
  assert.deepEqual(moved, [
    { studentId: 's1', teacherEmail: 'ms.rivera@school.org' },
    { studentId: 's2', teacherEmail: null },
    { studentId: 's3', teacherEmail: 'ms.rivera@school.org' },
  ]);
  // A class nobody teaches has no game to invite into.
  assert.deepEqual([...groupMovedByTeacher(moved).entries()], [['ms.rivera@school.org', ['s1', 's3']]]);
  assert.deepEqual(movedFromMigrationUpdates(undefined), []);
});

test('with no game on, no student is asked about: one read per teacher, however many moved', async () => {
  const fake = board({ games: [] });
  const summary = await run(fake, [...moves('a@school.org', ['s1', 's2', 's3', 's4', 's5']), ...moves('b@school.org', ['s6', 's7'])]);
  assert.deepEqual(summary, { considered: 7, invited: 0, notReached: 0 });
  assert.deepEqual(fake.asked, ['a@school.org', 'b@school.org'], 'each teacher once');
  assert.deepEqual(fake.invited, [], 'nobody is invited, nobody is asked about');
});

test('a teacher with a game has each moved student invited, one at a time, and a teacher without one is left alone', async () => {
  const fake = board({ games: ['a@school.org'] });
  const summary = await run(fake, [...moves('a@school.org', ['s1', 's2', 's3']), ...moves('b@school.org', ['s4'])]);
  assert.deepEqual(summary, { considered: 4, invited: 3, notReached: 0 });
  assert.deepEqual(fake.invited, ['s1', 's2', 's3']);
  assert.equal(fake.widest, 1, 'one transaction at a time: each allocates a seat');
});

test("what the invite says about a student does not stop the others; what it says about the teacher's game does", async () => {
  // About the student: already invited, in another game, not in this class, or the invite failed.
  const student = board({
    games: ['a@school.org'],
    outcomes: {
      s1: { invited: false, reason: 'already_invited' },
      s2: { invited: false, reason: 'in_another_game' },
      s3: { invited: false, reason: 'not_in_class' },
      s4: { invited: false, reason: 'failed' },
    },
  });
  const first = await run(student, moves('a@school.org', ['s1', 's2', 's3', 's4', 's5']));
  assert.deepEqual(first, { considered: 5, invited: 1, notReached: 0 });
  assert.deepEqual(student.invited, ['s1', 's2', 's3', 's4', 's5'], 'every student was asked');

  // About the teacher's game: it is not on (or idle past the window). The same for every student of theirs, so
  // the rest are not asked, and another teacher's students still are.
  for (const reason of TEACHER_LEVEL_REFUSALS) {
    const teacher = board({ games: ['a@school.org', 'b@school.org'], outcomes: { s1: { invited: false, reason } } });
    // eslint-disable-next-line no-await-in-loop
    const summary = await run(teacher, [...moves('a@school.org', ['s1', 's2', 's3']), ...moves('b@school.org', ['s4'])]);
    assert.deepEqual(teacher.invited, ['s1', 's4'], reason);
    assert.deepEqual(summary, { considered: 4, invited: 1, notReached: 0 }, reason);
  }
  assert.deepEqual([...TEACHER_LEVEL_REFUSALS].sort(), ['no_game', 'stale_game']);
});

test('a spent time budget invites nobody more, and says how many were not reached', async () => {
  // Never started: nobody, and no game is even looked up.
  const spent = board({ games: ['a@school.org', 'b@school.org'] });
  const none = await run(spent, [...moves('a@school.org', ['s1', 's2']), ...moves('b@school.org', ['s3'])], { now: steppingClock(), budgetMs: 0 });
  assert.deepEqual(none, { considered: 3, invited: 0, notReached: 3 });
  assert.deepEqual(spent.invited, []);
  assert.deepEqual(spent.asked, []);

  // Part-way: the budget runs out inside a teacher's students, and the next teacher's are not reached either.
  const partway = board({ games: ['a@school.org', 'b@school.org'] });
  const some = await run(partway, [...moves('a@school.org', ['s1', 's2', 's3', 's4']), ...moves('b@school.org', ['s5', 's6'])], { now: steppingClock(), budgetMs: 13_000 });
  assert.deepEqual(partway.invited, ['s1', 's2'], 'two fit in the budget');
  assert.deepEqual(some, { considered: 6, invited: 2, notReached: 4 });

  // A budget is spent the moment the time used reaches it, not a moment after.
  const exact = board({ games: ['a@school.org'] });
  const reached = await run(exact, moves('a@school.org', ['s1', 's2', 's3', 's4']), { now: steppingClock(), budgetMs: 12_000 });
  assert.deepEqual(exact.invited, ['s1']);
  assert.deepEqual(reached, { considered: 4, invited: 1, notReached: 3 });

  // The budget runs out between teachers: the next teacher's students are not reached.
  const between = board({ games: ['a@school.org', 'b@school.org'] });
  const next = await run(between, [...moves('a@school.org', ['s1']), ...moves('b@school.org', ['s2', 's3'])], { now: steppingClock(), budgetMs: 13_000 });
  assert.deepEqual(between.invited, ['s1']);
  assert.deepEqual(next, { considered: 3, invited: 1, notReached: 2 });

  // Plenty of time: everyone, whatever the clock says between.
  const roomy = board({ games: ['a@school.org'] });
  const all = await run(roomy, moves('a@school.org', ['s1', 's2', 's3']), { now: () => 0, budgetMs: 1 });
  assert.deepEqual(all, { considered: 3, invited: 3, notReached: 0 });
  assert.equal(BULK_INVITE_BUDGET_MS, 15_000, "a quarter of the callable's 60 seconds");
});

test('saveClass and migrateClassesFromPeriods hand the students they moved to the bulk invite, after the change is made', () => {
  const save = region(index, 'exports.saveClass = onCall(', '\n});', 'saveClass');
  // The students' stored teachers are kept BEFORE the restamp overwrites them, and only when it restamps at all …
  const restamp = region(save, 'if (periodChanged || teacherChanged) {', '\n  await writeAdminAudit(', 'the restamp');
  assert.match(restamp, /storedTeachers = members\.docs\.map\(\(member\) => \(\{ studentId: member\.id, assignedTeacherEmail: member\.data\(\)\?\.assignedTeacherEmail \?\? null \}\)\);/);
  assert.ok(restamp.indexOf('storedTeachers = ') < restamp.indexOf('await batch.commit()'), 'read before the restamp overwrites them');
  // … and the moved students are worked out inside the bulk invite's guard, from the class's teacher.
  const call = 'await inviteStudentsToClassLiveChallengeSafely(db, (bulk) => bulk.movedByClassRestamp({ members: storedTeachers, teacherEmail: record.teacherOfRecord }));';
  // After the batch, the re-authorization and the audit: the roster change is whole before any game is asked.
  const audit = save.indexOf('await writeAdminAudit(');
  const invite = save.indexOf(call);
  assert.ok(audit !== -1 && invite > audit, 'invited after the audit');
  assert.ok(save.indexOf('await batch.commit()') < invite && save.indexOf('await reauthorizeStudentRecords(') < invite, 'after the roster is written');
  assert.ok(invite < save.indexOf('return { classId: ref.id'), 'and before the answer goes out');
  assert.doesNotMatch(save, /liveChallengeBulkInvite\(\)/, 'nothing about who moved is worked out outside the guard');

  const migrate = region(index, 'exports.migrateClassesFromPeriods = onCall(', '\n});', 'migrateClassesFromPeriods');
  const writes = region(migrate, 'if (!dryRun) {', '\n  return { dryRun', 'the writes');
  assert.match(writes, /await inviteStudentsToClassLiveChallengeSafely\(db, \(bulk\) => bulk\.movedFromMigrationUpdates\(plan\.studentUpdates\)\);/);
  assert.ok(writes.indexOf('writeAdminAudit(') < writes.indexOf('inviteStudentsToClassLiveChallengeSafely('), 'after the audit');
  assert.ok(writes.lastIndexOf('await batch.commit()') < writes.indexOf('inviteStudentsToClassLiveChallengeSafely('), 'after the students are written');
  // A dry run writes nothing, so it invites nobody: the call is inside the writes' block, and only there.
  assert.equal((migrate.match(/inviteStudentsToClassLiveChallengeSafely\(/g) || []).length, 1);
  assert.ok(writes.indexOf('inviteStudentsToClassLiveChallengeSafely(') < writes.lastIndexOf('\n  }'), 'before the block closes');
  assert.doesNotMatch(migrate, /liveChallengeBulkInvite\(\)/);
});

test("the bulk invite reads each teacher's active-game pointer, invites through the safe single invite, and never throws", () => {
  const wrapper = region(index, 'async function inviteStudentsToClassLiveChallengeSafely(', '\n}\n', 'the bulk wrapper');
  // `moved` is the list, or a function of the rules module that makes it — worked out inside the try.
  assert.match(wrapper, /const bulk = await liveChallengeBulkInvite\(\);\s*const summary = await bulk\.inviteMovedStudents\(\{\s*moved: typeof moved === "function" \? await moved\(bulk\) : moved,/);
  assert.match(wrapper, /hasGame: async \(teacherEmail\) => Boolean\(String\(\(await db\.collection\(LIVE_CHALLENGE_TEACHER_ACTIVE\)\.doc\(teacherEmail\)\.get\(\)\)\.data\(\)\?\.roomId \|\| ""\)\.trim\(\)\),/);
  assert.match(wrapper, /invite: \(studentId\) => inviteStudentToClassLiveChallengeSafely\(db, studentId\),/);
  assert.match(wrapper, /\} catch \(error\) \{\s*logger\.error\("liveChallenge\.bulkLateInvite\.failed", \{ message: error\?\.message \|\| String\(error\) \}\);\s*return \{ considered: 0, invited: 0, notReached: 0, failed: true \};/);
  // The loader reads the one module.
  assert.match(region(index, 'async function liveChallengeBulkInvite() {', '\n}\n', 'the loader'), /import\("\.\/shared\/liveChallengeBulkInvite\.mjs"\)/);
  // The single invite is still the one rule: the bulk path writes nothing itself, and the rules module touches no database.
  assert.doesNotMatch(wrapper, /\.set\(|\.update\(|\.delete\(|\.add\(|transaction|batch/, 'the wrapper only reads a pointer and calls the single invite');
  const rules = readFileSync(new URL('../../functions/shared/liveChallengeBulkInvite.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(rules.replace(/\/\*[\s\S]*?\*\//g, ''), /^import |firebase|Firestore|\.collection\(/m, 'pure');
});

test('a student moved between two classes with live games stays in the first: the single invite never takes anyone out of a room', () => {
  const single = region(index, 'async function inviteStudentToClassLiveChallenge(', '\n}\n', 'the single invite');
  // An invite to another room that is still live is left alone…
  assert.match(single, /if \(otherRoom\.exists && live\(otherRoom\.data\(\)\?\.status\)\) return \{ invited: false, reason: "in_another_game" \};/);
  // …and nothing in it deletes or moves an invite, a roster row or a player.
  const code = single.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /transaction\.delete\(|\.delete\(\)/, 'it removes nothing');
  assert.equal((code.match(/transaction\.set\(inviteRef, \{/g) || []).length, 1);
  assert.ok(code.indexOf('in_another_game') < code.indexOf('transaction.set(inviteRef, {'), 'refused before anything is written');
});
