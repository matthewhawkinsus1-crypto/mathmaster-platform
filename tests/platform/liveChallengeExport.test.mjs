import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHALLENGE_EXPORT_KIND,
  CHALLENGE_EXPORT_VERSION,
  buildChallengeExport,
  challengeExportFileName,
  parseChallengeExport,
} from '../../functions/shared/liveChallengeExport.mjs';
import { buildChallengeReport } from '../../functions/shared/liveChallengeReport.mjs';

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const report = () => buildChallengeReport({
  room: { title: 'P3 Challenge', courseId: 'algebra1', standardCode: 'mixed', roundSeconds: 45, className: 'Period 3' },
  scheduledRoundCount: 3,
  roundMisses: { 0: 2, 1: 8, 2: 0 },
  roundStandards: { 0: 'A.2A', 1: 'A.7A', 2: 'A.2A' },
  answeredCounts: { 0: 10, 1: 10, 2: 9 },
  questionIds: ['q-alpha', 'q-beta', 'q-gamma'],
  players: [
    { studentId: 's1', alias: 'Prime Fox 12', joined: true, score: 3200, correctCount: 3, roundsAnswered: 3 },
    { studentId: 's2', alias: 'Nova Owl 20', joined: true, score: 900, correctCount: 1, roundsAnswered: 3 },
  ],
});

test('a finished game can be saved and run again', () => {
  const payload = buildChallengeExport(report());
  assert.equal(payload.kind, CHALLENGE_EXPORT_KIND);
  assert.equal(payload.roundCount, 3);
  assert.deepEqual(payload.rounds.map((round) => round.questionId), ['q-alpha', 'q-beta', 'q-gamma']);
  assert.equal(payload.roundSeconds, 45);
  assert.equal(payload.courseId, 'algebra1');
});

test('an exported set carries no student data', () => {
  // A teacher may reasonably email this to a colleague, and it has to be safe to
  // do that without thinking about it.
  const payload = buildChallengeExport(report());
  const text = JSON.stringify(payload);
  for (const leak of ['s1', 's2', 'Prime Fox', 'Nova Owl', 'players', 'neverJoined', 'studentId']) {
    assert.ok(!text.includes(leak), `export must not carry ${leak}`);
  }
});

test('the class result rides along, because it is what distinguishes two saved sets', () => {
  const payload = buildChallengeExport(report());
  assert.equal(payload.classAccuracyPercent, 66);
});

test('nothing to save produces nothing, not an empty file', () => {
  assert.equal(buildChallengeExport(null), null);
  assert.equal(buildChallengeExport({ rounds: [] }), null);
  // A report from before question ids were carried has rounds but no ids.
  assert.equal(buildChallengeExport({ rounds: [{ roundNumber: 1, standard: 'A.2A' }] }), null);
});

test('a saved set reads back as the same set', () => {
  const payload = buildChallengeExport(report());
  const { payload: parsed, errors } = parseChallengeExport(JSON.stringify(payload));
  assert.deepEqual(errors, []);
  assert.equal(parsed.roundCount, payload.roundCount);
  assert.deepEqual(parsed.rounds, payload.rounds);
  assert.equal(parsed.title, 'P3 Challenge');
});

test('a wrong file is answered with a sentence, not a stack trace', () => {
  // This runs against a file a human picked off a disk.
  assert.deepEqual(parseChallengeExport('not json').errors, ['That file is not valid JSON.']);
  assert.match(parseChallengeExport('{"kind":"something-else"}').errors[0], /not a MathMaster Live Challenge round set/);
  assert.match(parseChallengeExport('[]').errors[0], /does not contain a round set/);
  assert.match(parseChallengeExport(null).errors[0], /does not contain a round set/);
  assert.match(
    parseChallengeExport({ kind: CHALLENGE_EXPORT_KIND, rounds: [] }).errors[0],
    /no questions in it/,
  );
});

test('a set from a newer MathMaster is refused rather than half read', () => {
  const { payload, errors } = parseChallengeExport({
    kind: CHALLENGE_EXPORT_KIND,
    version: CHALLENGE_EXPORT_VERSION + 5,
    rounds: [{ questionId: 'q1' }],
  });
  assert.equal(payload, null);
  assert.match(errors[0], /newer version/);
});

test('the file has a name a teacher can find again in six weeks', () => {
  assert.equal(challengeExportFileName({ title: 'P3 Challenge' }), 'p3-challenge-round-set.json');
  assert.equal(challengeExportFileName({ title: '  ***  ' }), 'live-challenge-round-set.json');
  assert.equal(challengeExportFileName(null), 'live-challenge-round-set.json');
});

test('the report carries the question set the export needs', () => {
  // Private state holds the set and is deleted when the room closes, so if the
  // report does not carry it, nothing can.
  const built = report();
  assert.deepEqual(built.rounds.map((round) => round.questionId), ['q-alpha', 'q-beta', 'q-gamma']);
  assert.equal(built.courseId, 'algebra1');

  const server = codeOf('functions/index.js');
  assert.match(server, /questionIds: Array\.isArray\(privateState\.questionIds\)/);
});

test('the export is anchored to the report, not the live room', () => {
  // Exporting from a running game would work once and be impossible for every
  // game already finished.
  const teacher = codeOf('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /buildChallengeExport\(report\)/);
  assert.match(teacher, /Save this round set/);
});

test('import is documented as needing the server validation gate', () => {
  // Passing the file check means the FILE is well formed. It does not mean the
  // questions still exist, are active, or are issuable.
  const source = readFileSync('functions/shared/liveChallengeExport.mjs', 'utf8');
  assert.match(source, /safeBuildTemplateIssuePlan/);
  assert.match(source, /before a single round reaches a class/);
});
