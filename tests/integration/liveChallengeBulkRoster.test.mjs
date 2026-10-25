// LC02: a bulk roster change invites the students it moves into their class's
// Live Challenge — through the real callables against a real Firestore. Run
// through `npm run test:challenge-finish`.
//
// WHY. A student added to a class while its game was on was invited by
// setStudentClass, assignStudentToTeacher and createStudentAccount, but not by
// saveClass (an administrator editing a class restamps its students' teacher
// and period, which also repairs a student whose stored teacher had drifted
// off the class) or migrateClassesFromPeriods. A repaired student sat out the
// game until the next one. The rules of the bulk invite are pure and unit
// tested (tests/platform/liveChallengeBulkInvite.test.mjs); what only a
// database shows is that the callable invites exactly the students it moved,
// into the right game, once, and that a failing invite never fails the
// roster change.
//
// (migrateClassesFromPeriods is not run here: it scans every student in the
// database, and the integration files share one emulator in parallel. Its
// wiring is pinned in the platform test.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const authLib = require(path.join(repo, 'functions/lib/auth.js'));
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const { buildChallengeRewardPolicy } = await import(path.join(repo, 'src/platform/rewards/challengeRewardPolicy.js'));
const db = admin.firestore();
const { Timestamp } = admin.firestore;

// Unique to this run as well as this file: the integration files share one emulator in parallel, and a run
// against an emulator that is kept (a developer's) finds nothing left by the last.
const RUN = randomUUID().slice(0, 8);
const STANDARD = 'BULKROSTER1';
const ALIGNMENT_KEY = `texas:${STANDARD}`;

const teacherRequest = (email, data) => ({
  auth: { uid: `${email}-uid`, token: { role: 'teacher', email, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const rootRequest = (data) => ({
  auth: { uid: 'bulk-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const call = (name, request) => functionsIndex[name].run(request);

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const gradeOf = async (studentId) => (await db.collection('grades').doc(studentId).get()).data() || {};
const inviteOf = async (studentId) => (await db.collection('liveChallengeInvites').doc(studentId).get()).data() || null;
const playerOf = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data() || null;

/* ---------- a bank of gradable questions, and one class per scenario ---------- */

const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `bulk-probe|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
assert.ok(bank.length >= 3, 'the seed bank must hold at least three gradable choice questions');
await Promise.all(bank.map((item) => {
  const id = `${item.id}--bulk-roster-suite`;
  return db.collection('pathQuestionBank').doc(id).set({
    ...item, id, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, ALIGNMENT_KEY],
  });
}));

/**
 * A teacher (signed in, active), their class and its students — and two
 * students of the class whose stored teacher has drifted off it (none, and a
 * teacher the class had before), so a game created for the class does not
 * invite them (its roster is the class's students under the teacher).
 */
const seedClass = async (name) => {
  const tag = `${name}-${RUN}`;
  const teacher = `bulk-${tag}-teacher@example.com`;
  const classId = `bulk-${tag}-class`;
  await db.collection(authLib.TEACHER_COLLECTION).doc(teacher).set({ active: true });
  await db.collection('classes').doc(classId).set({ teacherOfRecord: teacher, status: 'active', course: 'algebra1', period: '3', name: `Bulk ${tag}` });
  const students = [];
  for (let index = 0; index < 2; index += 1) {
    const studentId = `bulk-${tag}-s${index + 1}`;
    students.push(studentId);
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({ assignedTeacherEmail: teacher, classId, classPeriod: '3', firstName: `Bulk${index + 1}`, lastName: tag });
  }
  const drifted = `bulk-${tag}-drifted`;
  await db.collection('grades').doc(drifted).set({ classId, classPeriod: '3', firstName: 'Drifted', lastName: tag });
  const stale = `bulk-${tag}-stale`;
  await db.collection('grades').doc(stale).set({ assignedTeacherEmail: 'the-class-before@example.com', classId, classPeriod: '3', firstName: 'Stale', lastName: tag });
  return { teacher, classId, students, drifted, stale, repaired: [drifted, stale], as: (data) => teacherRequest(teacher, data) };
};

const create = (klass) => call('createLiveChallenge', klass.as({
  classId: klass.classId,
  courseId: 'algebra1',
  standardCode: STANDARD,
  questionStyle: 'noTools',
  roundCount: 3,
  roundSeconds: 30,
  scoringStrategyId: 'grandPrix',
  rewardPolicy: buildChallengeRewardPolicy({ passPlaces: 1, championBadge: true }),
}));
const saveClass = (klass, changes) => call('saveClass', rootRequest({ classId: klass.classId, ...changes }));

test("saving a class repairs the students whose teacher had drifted, and invites them into the class's game", async () => {
  const klass = await seedClass('repair');
  const { roomId } = await create(klass);
  for (const studentId of klass.repaired) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await inviteOf(studentId), null, `${studentId} is not on the roster the game was created from`);
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await playerOf(roomId, studentId), null);
  }
  const before = await Promise.all(klass.students.map((studentId) => playerOf(roomId, studentId)));
  assert.equal((await roomOf(roomId)).eligibleCount, 2);

  const saved = await saveClass(klass, { period: '4' });
  assert.equal(saved.rostersUpdated, 4, 'the class restamps its four students');
  for (const studentId of klass.repaired) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await gradeOf(studentId)).assignedTeacherEmail, klass.teacher);
  }

  const players = await Promise.all(klass.repaired.map((studentId) => playerOf(roomId, studentId)));
  const invites = await Promise.all(klass.repaired.map((studentId) => inviteOf(studentId)));
  invites.forEach((invite, position) => {
    assert.equal(invite?.roomId, roomId, 'their screen follows the invite into the game');
    assert.equal(invite.status, 'invited');
    assert.equal(invite.playerKey, players[position].playerKey);
  });
  assert.deepEqual(players.map((row) => row.slot).sort(), [2, 3], 'the next two seats, one each');
  const taken = new Set(before.map((row) => row.alias));
  assert.ok(players.every((row) => !taken.has(row.alias)) && new Set(players.map((row) => row.alias)).size === 2, 'code names nobody else holds');
  assert.equal((await roomOf(roomId)).eligibleCount, 4, "the console's count includes them");

  // The students who were already in are untouched: same seat, same key.
  const after = await Promise.all(klass.students.map((studentId) => playerOf(roomId, studentId)));
  assert.deepEqual(after.map((row) => [row.slot, row.playerKey]), before.map((row) => [row.slot, row.playerKey]));

  // Saving again changes nothing: they are already in.
  await saveClass(klass, { period: '5' });
  const again = await Promise.all(klass.repaired.map((studentId) => playerOf(roomId, studentId)));
  assert.deepEqual(again.map((row) => row.playerKey), players.map((row) => row.playerKey));
  assert.equal((await roomOf(roomId)).eligibleCount, 4);
  await call('cancelLiveChallenge', klass.as({ roomId }));
});

test('saving a class that moves nobody, or whose game is not on, invites nobody and changes nothing else', async () => {
  const quiet = await seedClass('quiet');
  const saved = await saveClass(quiet, { period: '4' });
  assert.equal(saved.rostersUpdated, 4);
  assert.equal(await inviteOf(quiet.drifted), null, 'no game, no invite');
  assert.equal((await gradeOf(quiet.drifted)).assignedTeacherEmail, quiet.teacher, 'the restamp itself still happened');

  // A class whose students are all stamped already: nothing to invite, the game untouched.
  const steady = await seedClass('steady');
  for (const studentId of steady.repaired) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({ assignedTeacherEmail: steady.teacher }, { merge: true });
  }
  const { roomId } = await create(steady);
  assert.equal((await roomOf(roomId)).eligibleCount, 4);
  await saveClass(steady, { period: '4' });
  assert.equal((await roomOf(roomId)).eligibleCount, 4);
  await call('cancelLiveChallenge', steady.as({ roomId }));

  // A game left open since yesterday is not on for a student repaired now.
  const stale = await seedClass('stale');
  const { roomId: staleRoom } = await create(stale);
  const yesterday = Timestamp.fromMillis(Date.now() - 13 * 60 * 60 * 1000);
  await roomRef(staleRoom).update({ createdAt: yesterday, updatedAt: yesterday });
  await saveClass(stale, { period: '4' });
  assert.equal(await inviteOf(stale.drifted), null);
  assert.equal((await gradeOf(stale.drifted)).assignedTeacherEmail, stale.teacher);
  await call('cancelLiveChallenge', stale.as({ roomId: staleRoom }));
});

test("handing a class to a teacher whose game is another class's invites none of its students into it", async () => {
  const klass = await seedClass('handover');
  const other = await seedClass('handover-other');
  const { roomId: otherRoom } = await create(other);
  // The class goes to the other class's teacher, who has a game on — for their own class.
  const saved = await saveClass(klass, { teacherOfRecord: other.teacher });
  assert.equal(saved.rostersUpdated, 4);
  assert.equal((await gradeOf(klass.students[0])).assignedTeacherEmail, other.teacher, 'they moved');
  for (const studentId of [...klass.students, ...klass.repaired]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await inviteOf(studentId), null, `${studentId} is in a different class from that game`);
  }
  assert.equal((await roomOf(otherRoom)).eligibleCount, 2, 'their game is exactly as it was');
  await call('cancelLiveChallenge', other.as({ roomId: otherRoom }));
});

test('a game that cannot be reached never fails the class save', async () => {
  // The invite itself failing: the single invite's own transaction.
  const klass = await seedClass('failing');
  const { roomId } = await create(klass);
  const realTransaction = db.runTransaction;
  db.runTransaction = async () => { throw new Error('the game is unreachable'); };
  let saved;
  try {
    saved = await saveClass(klass, { period: '4' });
  } finally {
    db.runTransaction = realTransaction;
  }
  assert.equal(saved.rostersUpdated, 4, 'the roster change went through');
  assert.equal((await gradeOf(klass.drifted)).assignedTeacherEmail, klass.teacher);
  assert.equal(await inviteOf(klass.drifted), null, 'and the student sits this game out, as they did before');
  await call('cancelLiveChallenge', klass.as({ roomId }));

  // Finding the teacher's game failing: the bulk invite's own read.
  const second = await seedClass('failing-read');
  const { roomId: secondRoom } = await create(second);
  const realCollection = db.collection;
  db.collection = function guarded(name, ...rest) {
    if (name === 'liveChallengeTeacherActive') throw new Error('the pointer is unreachable');
    return realCollection.call(this, name, ...rest);
  };
  let savedAgain;
  try {
    savedAgain = await saveClass(second, { period: '4' });
  } finally {
    db.collection = realCollection;
  }
  assert.equal(savedAgain.rostersUpdated, 4, 'the roster change went through');
  assert.equal((await gradeOf(second.stale)).assignedTeacherEmail, second.teacher);
  assert.equal(await inviteOf(second.stale), null);
  await call('cancelLiveChallenge', second.as({ roomId: secondRoom }));
});
