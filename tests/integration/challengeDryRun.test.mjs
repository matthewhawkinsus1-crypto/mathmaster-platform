// A teacher rehearsing their own challenge, against a real Firestore.
//
// HOW TO RUN:  npm run test:challenge-finish
//
// The whole point of a dry run is that it is NOT a game. Most of what follows
// asserts absence: no room, no invite, no player, no report, no mastery
// evidence, nothing a student could join and nothing attached to anybody's
// record. Those are the assertions that would matter if this ever drifted,
// because the failure mode is silent — a rehearsal that quietly invited a class
// looks fine until twenty-four Chromebooks light up.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set.');

const requireFunctionsModule = (specifier) => {
  try {
    return require(path.join(repo, 'functions/node_modules', specifier));
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      throw new Error(`${specifier} is not installed. Run \`npm --prefix functions ci\` before this suite.`);
    }
    throw error;
  }
};

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = requireFunctionsModule('firebase-admin');
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const db = admin.firestore();

const TEACHER = 'teacher@example.com';
const OTHER_TEACHER = 'someone-else@example.com';

const asTeacher = (data, email = TEACHER) => ({
  auth: { uid: `${email}-uid`, token: { role: 'teacher', email, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const asStudent = (data) => ({
  auth: { uid: 'student-uid', token: { role: 'student', studentId: 'student-1', email: 's@example.com', email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

// The bank the dry run draws from. Real seed items so the issuability gate and
// the grader behave as they do in a game.
const seedBank = async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = path.join(repo, 'functions/seeds/pathQuestionBank');
  const chosen = [];
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
      if (chosen.length >= 12) break;
      const instantiated = await mathPath.instantiateQuestion(item, `probe|${item.id}`);
      if (!instantiated?.question) continue;
      if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (plan?.issuable) chosen.push({ ...item, courseId: 'algebra1' });
    }
    if (chosen.length >= 12) break;
  }
  assert.ok(chosen.length >= 6, `need at least 6 issuable questions, found ${chosen.length}`);
  const batch = db.batch();
  chosen.forEach((item) => batch.set(db.collection('pathQuestionBank').doc(item.id), item));
  await batch.commit();
  return chosen;
};

const banked = await seedBank();

const created = await functionsIndex.createChallengeDryRun.run(asTeacher({
  courseId: 'algebra1', standardCode: 'mixed', roundCount: 4, roundSeconds: 30,
}));

test('a dry run returns playable rounds', () => {
  assert.ok(created.dryRunId, 'a dry run id is returned');
  assert.equal(created.rounds.length, 4);
  created.rounds.forEach((round, index) => {
    assert.equal(round.roundIndex, index);
    assert.ok(round.question, 'each round carries a question');
    assert.ok(round.question.questionInstanceId, 'the question is a sanitized instance');
  });
});

test('the questions carry no answer for the browser to read', () => {
  // The teacher may see the question. The sanitizer is still what decides what
  // crosses the wire, exactly as it does for a student.
  const serialised = JSON.stringify(created.rounds);
  assert.doesNotMatch(serialised, /"expected"/, 'a sanitized instance never carries the expected answer');
  assert.doesNotMatch(serialised, /privateGrading/);
});

/* ---------- what a dry run must not create ---------- */

test('no room exists that anyone could join', async () => {
  const room = await db.collection('liveChallengeRooms').doc(created.dryRunId).get();
  assert.equal(room.exists, false);
});

test('no invite is written to any student', async () => {
  const invites = await db.collection('liveChallengeInvites').get();
  const mine = invites.docs.filter((d) => d.data().roomId === created.dryRunId);
  assert.equal(mine.length, 0, 'a rehearsal must never invite anybody');
});

test('no player records and no private game state are created', async () => {
  const players = await db.collection('liveChallengePrivate').doc(created.dryRunId).collection('players').get();
  assert.equal(players.size, 0);
  const privateState = await db.collection('liveChallengePrivate').doc(created.dryRunId).get();
  assert.equal(privateState.exists, false);
});

/* ---------- grading is the real grader ---------- */

const firstQuestionId = (await db.collection('liveChallengeDryRuns').doc(created.dryRunId).get()).data().questionIds[0];
const correctAnswer = await (async () => {
  const authored = (await db.collection('pathQuestionBank').doc(firstQuestionId).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${created.dryRunId}|0|${firstQuestionId}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return plan.privateGrading.fields[0].expected;
})();

const rightAnswer = await functionsIndex.gradeChallengeDryRunResponse.run(asTeacher({
  dryRunId: created.dryRunId, roundIndex: 0, responsePayload: { responses: { answer: correctAnswer } },
}));
const wrongAnswer = await functionsIndex.gradeChallengeDryRunResponse.run(asTeacher({
  dryRunId: created.dryRunId, roundIndex: 0, responsePayload: { responses: { answer: 'not-the-answer' } },
}));

test('the real grader marks the real answer', () => {
  assert.equal(rightAnswer.isCorrect, true, 'the derived answer must actually be correct');
  assert.equal(wrongAnswer.isCorrect, false);
});

test('grading is marked as a dry run and writes nothing', async () => {
  assert.equal(rightAnswer.dryRun, true);
  const grades = await db.collection('grades').doc(TEACHER).get();
  assert.equal(grades.exists, false, 'a rehearsal never writes to anybody\'s record');
  const reports = await db.collection('liveChallengeReports').doc(created.dryRunId).get();
  assert.equal(reports.exists, false, 'a rehearsal produces no report');
});

test('no mastery evidence is recorded for a rehearsal', async () => {
  for (const id of [TEACHER, 'student-1']) {
    const events = await db.collection('grades').doc(id).collection('evidenceEvents').get();
    const fromDryRun = events.docs.filter((d) => d.data().source?.roomId === created.dryRunId);
    assert.equal(fromDryRun.length, 0);
  }
});

/* ---------- swapping a question the teacher does not want ---------- */

test('swapping a round returns a different question', async () => {
  const before = (await db.collection('liveChallengeDryRuns').doc(created.dryRunId).get()).data().questionIds[1];
  const swapped = await functionsIndex.swapChallengeDryRunRound.run(asTeacher({
    dryRunId: created.dryRunId, roundIndex: 1,
  }));
  const after = (await db.collection('liveChallengeDryRuns').doc(created.dryRunId).get()).data().questionIds[1];
  assert.equal(swapped.roundIndex, 1);
  assert.notEqual(after, before, 'the stored question must actually change');
  assert.ok(swapped.question.questionInstanceId);
});

test('a swap never duplicates a question already in the dry run', async () => {
  const ids = (await db.collection('liveChallengeDryRuns').doc(created.dryRunId).get()).data().questionIds;
  assert.equal(new Set(ids).size, ids.length, 'a swapped-in question that was already there looks like a broken button');
});

test('grading follows the swapped question, not the one it replaced', async () => {
  const ids = (await db.collection('liveChallengeDryRuns').doc(created.dryRunId).get()).data().questionIds;
  const authored = (await db.collection('pathQuestionBank').doc(ids[1]).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${created.dryRunId}|1|${ids[1]}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  const result = await functionsIndex.gradeChallengeDryRunResponse.run(asTeacher({
    dryRunId: created.dryRunId,
    roundIndex: 1,
    responsePayload: { responses: { answer: plan.privateGrading.fields[0].expected } },
  }));
  assert.equal(result.isCorrect, true);
});

/* ---------- who may open one ---------- */

test('a student cannot create, play or swap a dry run', async () => {
  await assert.rejects(() => functionsIndex.createChallengeDryRun.run(asStudent({ courseId: 'algebra1' })), /teacher/i);
  await assert.rejects(
    () => functionsIndex.gradeChallengeDryRunResponse.run(asStudent({ dryRunId: created.dryRunId, roundIndex: 0 })),
    /teacher/i,
  );
});

test('another teacher cannot open someone else\'s dry run', async () => {
  await assert.rejects(
    () => functionsIndex.swapChallengeDryRunRound.run(asTeacher({ dryRunId: created.dryRunId, roundIndex: 0 }, OTHER_TEACHER)),
    /your own/i,
  );
});

test('discarding removes it', async () => {
  await functionsIndex.discardChallengeDryRun.run(asTeacher({ dryRunId: created.dryRunId }));
  const doc = await db.collection('liveChallengeDryRuns').doc(created.dryRunId).get();
  assert.equal(doc.exists, false);
  await assert.rejects(
    () => functionsIndex.gradeChallengeDryRunResponse.run(asTeacher({ dryRunId: created.dryRunId, roundIndex: 0 })),
    /no longer exists/i,
  );
});

test('the bank the rehearsal drew from is untouched', async () => {
  for (const item of banked.slice(0, 3)) {
    const doc = await db.collection('pathQuestionBank').doc(item.id).get();
    assert.equal(doc.exists, true, 'a dry run must never consume or retire a question');
  }
});
