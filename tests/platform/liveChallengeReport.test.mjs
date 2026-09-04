import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildChallengeReport,
  summarizePlayers,
  summarizeRounds,
  summarizeStandards,
} from '../../functions/shared/liveChallengeReport.mjs';

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const base = {
  room: { title: 'P3 Challenge', className: 'Period 3', roundSeconds: 45, standardCode: 'mixed', teacherEmail: 't@x.edu' },
  scheduledRoundCount: 3,
  roundMisses: { 0: 2, 1: 8, 2: 0 },
  roundStandards: { 0: 'A.2A', 1: 'A.7A', 2: 'A.2A' },
  answeredCounts: { 0: 10, 1: 10, 2: 9 },
  secondChanceOf: { 3: 1 },
  players: [
    { studentId: 's1', alias: 'Prime Fox 12', joined: true, score: 3200, correctCount: 3, roundsAnswered: 3, comebackCount: 1, bestStreak: 3 },
    { studentId: 's2', alias: 'Nova Owl 20', joined: true, score: 900, correctCount: 1, roundsAnswered: 3, recoveryCount: 1 },
    { studentId: 's3', alias: 'Delta Hawk 44', joined: false },
  ],
};

test('a missed round is reported against the people who answered it', () => {
  // "8 missed it" cannot be told apart from "8 of 10" and "8 of 24" without a
  // denominator, and a teacher reads accuracy, not raw misses.
  const rounds = summarizeRounds(base);
  assert.equal(rounds[1].missed, 8);
  assert.equal(rounds[1].answered, 10);
  assert.equal(rounds[1].correct, 2);
  assert.equal(rounds[1].accuracyPercent, 20);
});

test('a student who never answered is not a student who got it wrong', () => {
  const rounds = summarizeRounds({ ...base, answeredCounts: { 0: 4 }, roundMisses: { 0: 1 } });
  assert.equal(rounds[0].answered, 4);
  assert.equal(rounds[0].correct, 3);
  // Rounds nobody reached report nothing rather than 0%.
  assert.equal(rounds[1].answered, 0);
  assert.equal(rounds[1].accuracyPercent, null);
});

test('a replayed round is marked, not listed twice', () => {
  // A teacher wants to know how question 2 went, not that it appeared twice.
  const rounds = summarizeRounds(base);
  assert.equal(rounds.length, 3);
  assert.equal(rounds[1].replayed, true);
  assert.equal(rounds[0].replayed, false);
});

test('standards are ranked hardest first, which is the line a teacher acts on', () => {
  const standards = summarizeStandards(summarizeRounds(base));
  assert.equal(standards[0].standard, 'A.7A');
  assert.equal(standards[0].accuracyPercent, 20);
  // The two A.2A rounds combine into one row.
  const a2a = standards.find((entry) => entry.standard === 'A.2A');
  assert.equal(a2a.rounds, 2);
  assert.equal(a2a.answered, 19);
});

test('a round nobody reached says nothing about its standard', () => {
  const standards = summarizeStandards(summarizeRounds({
    ...base, answeredCounts: { 0: 10 }, roundMisses: { 0: 5 },
  }));
  assert.equal(standards.length, 1);
  assert.equal(standards[0].standard, 'A.2A');
});

test('students who never joined are kept, because that is a question the report answers', () => {
  const report = buildChallengeReport(base);
  assert.equal(report.playedCount, 2);
  assert.equal(report.eligibleCount, 3);
  assert.deepEqual(report.neverJoined, [{ studentId: 's3', alias: 'Delta Hawk 44' }]);
});

test('the teacher report names students', () => {
  // The anonymity in this game protects students from each other, not from the
  // person teaching them.
  const report = buildChallengeReport(base);
  assert.ok(report.players.every((entry) => 'studentId' in entry));
  assert.equal(report.players[0].studentId, 's1');
});

test('the report states facts and never a verdict on a student', () => {
  // A student who lost wifi produces the same record as one who gave up.
  const report = buildChallengeReport(base);
  const text = JSON.stringify(report).toLowerCase();
  for (const word of ['disengaged', 'off task', 'offtask', 'lazy', 'refused', 'unmotivated']) {
    assert.ok(!text.includes(word), `report must not judge: ${word}`);
  }
  assert.equal(report.players[1].participationPercent, 100);
  assert.equal(report.players[1].accuracyPercent, 33);
});

test('players sort by score, and a non-player sorts last without a fake zero', () => {
  const players = summarizePlayers({ players: base.players, totalRounds: 3 });
  assert.deepEqual(players.map((entry) => entry.alias), ['Prime Fox 12', 'Nova Owl 20', 'Delta Hawk 44']);
  assert.equal(players[2].accuracyPercent, null);
  assert.equal(players[2].participationPercent, 0);
});

test('perseverance shows up in the record', () => {
  const report = buildChallengeReport(base);
  assert.equal(report.players[0].comebacks, 1);
  assert.equal(report.players[1].recoveries, 1);
  assert.equal(report.players[0].bestStreak, 3);
});

test('a correct count larger than the answered count cannot invent accuracy', () => {
  const players = summarizePlayers({
    players: [{ alias: 'X', joined: true, correctCount: 99, roundsAnswered: 3 }],
    totalRounds: 3,
  });
  assert.equal(players[0].correct, 3);
  assert.equal(players[0].accuracyPercent, 100);
});

test('an empty game produces an empty report rather than throwing', () => {
  const report = buildChallengeReport({});
  assert.equal(report.scheduledRoundCount, 0);
  assert.deepEqual(report.rounds, []);
  assert.deepEqual(report.standards, []);
  assert.equal(report.weakestStandard, null);
  assert.equal(report.classAccuracyPercent, null);
});

test('the report is written before the state it reads is deleted', () => {
  // deletePrivateChallengeState removes roundMisses, roundStandards and
  // roundAnswers. Assembling afterwards would produce an empty report, which is
  // how a report quietly becomes useless rather than obviously broken.
  const source = codeOf('functions/index.js');
  const finish = source.slice(source.indexOf('async function finishLiveChallengeRoom'));
  const body = finish.slice(0, finish.indexOf('exports.advanceLiveChallenge'));
  assert.ok(
    body.indexOf('LIVE_CHALLENGE_REPORTS') < body.indexOf('deletePrivateChallengeState'),
    'the report must be built before private state is deleted',
  );
});

test('a failed report never strands a room the teacher cannot end', () => {
  const source = codeOf('functions/index.js');
  const finish = source.slice(source.indexOf('async function finishLiveChallengeRoom'));
  assert.match(finish.slice(0, 2200), /catch \(error\)[\s\S]{0,200}liveChallenge\.report\.failed/);
});

test('the standard for each round is captured when the room is built', () => {
  // Re-reading the bank after the game would give whatever the question says
  // today rather than what the class actually answered.
  const source = codeOf('functions/index.js');
  assert.match(source, /roundStandards: Object\.fromEntries\(selected\.map/);
});

test('every answer is counted, not only the misses', () => {
  // Without a denominator, "8 missed it" cannot be told from "8 of 10" or
  // "8 of 24". Both numbers used to be incremented on a shared document per
  // submission; they are now derived from the player records, but the report
  // must still receive both.
  const source = codeOf('functions/index.js');
  assert.match(source, /roundAnswers: derivedTallies\.roundAnswers/);
  assert.match(source, /answeredCounts: derivedTallies\.roundAnswers/);
  assert.match(source, /roundMisses: derivedTallies\.roundMisses/);
});

test('a report that names students is not readable by students', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const start = rules.indexOf('match /liveChallengeReports/{roomId}');
  assert.ok(start > 0, 'the reports collection needs a rule of its own');
  // The rule block, not the first brace — which belongs to the {roomId} wildcard.
  const scope = rules.slice(start, rules.indexOf('\n    }', start));
  assert.match(scope, /allow read: if rootAdmin\(\)/);
  assert.match(scope, /resource\.data\.teacherEmail == request\.auth\.token\.email/);
  assert.doesNotMatch(scope, /studentId/);
  assert.match(scope, /allow create, update, delete: if false/);
});

test('mastery evidence is deliberately not written by the report', () => {
  // Whether a timed, gamified round counts as evidence of what a student knows
  // is a policy decision that has not been made. Writing it while building a
  // report would decide it by accident.
  const source = codeOf('functions/shared/liveChallengeReport.mjs');
  assert.doesNotMatch(source, /mastery|evidence[A-Z]|masteryEvidence/);
});
