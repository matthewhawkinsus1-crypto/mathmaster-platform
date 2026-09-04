import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
const dryRun = read('../../src/components/liveChallenge/ChallengeDryRun.jsx');
const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
const service = read('../../src/platform/liveChallenge/liveChallengeService.js');
const rules = read('../../firestore.rules');
const functionsIndex = read('../../functions/index.js');

/* ---------- a feature nobody can open is not shipped ---------- */

test('a teacher can reach the dry run from the create-a-challenge panel', () => {
  // The Warm-Up challenge shipped once with no way for a student to switch it
  // on. This asserts the same mistake is not repeated here: the component is
  // imported, mounted, and opened by a control that exists on the screen the
  // teacher is already standing on.
  assert.match(teacher, /import ChallengeDryRun from '\.\/ChallengeDryRun\.jsx'/);
  assert.match(teacher, /<ChallengeDryRun/);
  assert.match(teacher, /setDryRunOpen\(true\)/);
  assert.match(teacher, /Try it yourself first/);
});

test('the dry run rehearses the settings the teacher is about to launch', () => {
  // A rehearsal of a different course, standard or clock would be worse than
  // none: it would answer a question the teacher did not ask.
  for (const prop of ['courseId', 'standardCode', 'roundCount', 'roundSeconds']) {
    assert.match(
      teacher,
      new RegExp(`<ChallengeDryRun[\\s\\S]{0,400}${prop}=\\{${prop}\\}`),
      `${prop} must be passed through to the dry run`,
    );
  }
});

test('changing any of those settings closes a stale rehearsal', () => {
  assert.match(
    teacher,
    /useEffect\(\(\) => \{ setDryRunOpen\(false\); \}, \[classId, courseId, standardCode, roundCount, roundSeconds\]\)/,
  );
});

test('the dry run is not reachable once a room exists', () => {
  // Past the lobby the questions are already drawn and a fresh draw would show
  // a teacher rounds their class will never see.
  const gate = teacher.indexOf('if (!roomId || !room) {');
  assert.ok(gate > 0, 'the pre-room branch must still exist');
  assert.ok(teacher.indexOf('<ChallengeDryRun') > gate, 'the dry run must render inside the pre-room branch');
  assert.equal(teacher.split('<ChallengeDryRun').length - 1, 1, 'exactly one mount point');
});

/* ---------- it must be the student's round, not a lookalike ---------- */

test('the dry run plays the exported student round component', () => {
  assert.match(dryRun, /import \{ ChallengeRound \} from '\.\/LiveChallengeStudent\.jsx'/);
  assert.match(student, /export function ChallengeRound\(/);
  // No second copy of the question surface: a lookalike would reassure a
  // teacher about a screen students never see.
  assert.doesNotMatch(dryRun, /QuestionEngine|FieldQuestion/);
});

test('the student round still submits to the real game by default', () => {
  // The injection point exists for the rehearsal. If the default ever changed,
  // every real student answer would be graded by the dry-run callable.
  assert.match(student, /submitResponse = submitLiveChallengeResponse/);
  assert.match(student, /await submitResponse\(\{ roomId: room\.roomId, roundIndex, responsePayload \}\)/);
});

test('the rehearsal is graded by the dry-run callable and never by the room one', () => {
  assert.match(dryRun, /gradeChallengeDryRunResponse\(\{ dryRunId/);
  assert.doesNotMatch(dryRun, /submitLiveChallengeResponse/);
});

test('leaving the rehearsal throws it away', () => {
  assert.match(dryRun, /discardChallengeDryRun\(\{ dryRunId: dryRun\.dryRunId \}\)/);
});

/* ---------- what a rehearsal must never touch ---------- */

test('every dry-run callable the client calls exists on the server', () => {
  for (const name of [
    'createChallengeDryRun',
    'swapChallengeDryRunRound',
    'gradeChallengeDryRunResponse',
    'discardChallengeDryRun',
  ]) {
    assert.match(service, new RegExp(`export const ${name} =`), `${name} must be exported by the service`);
    assert.match(functionsIndex, new RegExp(`exports\\.${name} = onCall`), `${name} must be a callable`);
    assert.match(service, new RegExp(`httpsCallable\\([^)]*'${name}'\\)|'${name}'`), `${name} must name the callable`);
  }
});

test('the dry-run callables write nothing but the dry-run document', () => {
  // The whole safety claim of this feature — no room, no invite, no player, no
  // report, no mastery evidence, no grade — rests on this block touching one
  // collection. Reading the bank is expected; writing anywhere else is not.
  const start = functionsIndex.indexOf('async function requireOwnedDryRun(');
  const end = functionsIndex.indexOf('exports.joinLiveChallenge = onCall');
  assert.ok(start > 0 && end > start, 'the dry-run block must be locatable');
  const block = functionsIndex.slice(start, end);

  for (const forbidden of [
    'LIVE_CHALLENGE_ROOMS',
    'LIVE_CHALLENGE_INVITES',
    'CHALLENGE_REPORTS',
    'recordChallengeEvidence',
    'masteryEvidence',
    'studentId',
    '"grades"',
  ]) {
    assert.ok(!block.includes(forbidden), `a dry run must not reference ${forbidden}`);
  }
  const writes = block.match(/\.(set|update|add|create)\(/g) || [];
  assert.equal(writes.length, 2, 'only the create and the swap may write');
  assert.equal((block.match(/\.delete\(\)/g) || []).length, 1, 'only discard may delete');
});

test('a dry run cannot be read or written from a browser', () => {
  assert.match(rules, /match \/liveChallengeDryRuns\/\{dryRunId\}[\s\S]{0,160}allow read, create, update, delete: if false;/);
});

test('the rehearsal scores with the real scorer, not an invented number', () => {
  // Partial-credit tools pay proportional base points in the real game. A
  // rehearsal that showed 0 for 60% credit would teach a teacher the wrong
  // thing about their own question.
  const start = functionsIndex.indexOf('exports.gradeChallengeDryRunResponse');
  const end = functionsIndex.indexOf('exports.discardChallengeDryRun');
  const block = functionsIndex.slice(start, end);
  assert.match(block, /challenge\.scoreChallengeRound\(/);
  assert.match(block, /remainingMs: 0/);
  assert.match(block, /previousStreak: 0/);
  assert.match(block, /dryRun: true/);
});
