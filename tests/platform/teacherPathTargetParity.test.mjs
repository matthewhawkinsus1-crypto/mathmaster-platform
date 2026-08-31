import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';

const seed = JSON.parse(readFileSync('seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json', 'utf8'));
const records = seed.documents || [];

const primaryCode = (question = {}) => String(
  (question.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '',
).replace(/^texas:/, '');

const targetRecord = records.find((question) => {
  const variants = Array.isArray(question.variants) ? question.variants : [];
  const pairs = new Set(variants.map((variant) => [
    Number(variant.dok ?? question.dok),
    Number(variant.difficultyBand ?? question.difficultyBand),
  ].join(':')));
  return question.active !== false && pairs.has('3:4') && pairs.has('2:2') && primaryCode(question);
});

test('Teacher Path Simulator honors the same weekly DOK and difficulty target used by live issuance', async () => {
  assert.ok(targetRecord, 'promoted Algebra I bank must expose at least one family with 2/2 and 3/4 variants');
  const code = primaryCode(targetRecord);
  const runtime = createTeacherPathRuntime({
    pathBankQuestions: records,
    courseId: 'algebra1',
  });

  const challenge = await runtime.startOrResumePathSession({
    targetAlignmentKey: 'texas:' + code,
    weekKey: '2026-08-31',
    weeklySlotKey: 'challenge-slot',
    weeklySlot: 1,
    weeklyPurpose: 'extension',
    intendedDok: 3,
    intendedDifficultyBand: 4,
  });
  assert.equal(challenge.session.weeklyPurpose, 'extension');
  assert.equal(challenge.session.intendedDok, 3);
  assert.equal(challenge.session.intendedDifficultyBand, 4);

  const challengeQuestion = (await runtime.fetchNextSanitizedQuestion({
    sessionId: challenge.session.sessionId,
  })).questionInstance;
  assert.equal(challengeQuestion.preferredDok, 3);
  assert.equal(challengeQuestion.preferredBand, 4);
  assert.equal(challengeQuestion.selectedDok, 3);
  assert.equal(challengeQuestion.dok, 3);
  assert.equal(challengeQuestion.difficultyBand, 4);

  const foundation = await runtime.startOrResumePathSession({
    targetAlignmentKey: 'texas:' + code,
    weekKey: '2026-08-31',
    weeklySlotKey: 'foundation-slot',
    weeklySlot: 2,
    weeklyPurpose: 'currentLearning',
    intendedDok: 2,
    intendedDifficultyBand: 2,
  });
  const foundationQuestion = (await runtime.fetchNextSanitizedQuestion({
    sessionId: foundation.session.sessionId,
  })).questionInstance;
  assert.equal(foundationQuestion.preferredDok, 2);
  assert.equal(foundationQuestion.preferredBand, 2);
  assert.equal(foundationQuestion.selectedDok, 2);
  assert.equal(foundationQuestion.dok, 2);
  assert.equal(foundationQuestion.difficultyBand, 2);
});

test('live Path service does not trust browser-supplied weekly rigor', () => {
  const liveService = readFileSync('src/services/pathSessionService.js', 'utf8');
  assert.doesNotMatch(liveService, /intendedDok/);
  assert.doesNotMatch(liveService, /intendedDifficultyBand/);
  assert.doesNotMatch(liveService, /weeklyPurpose/);

  const server = readFileSync('functions/index.js', 'utf8');
  assert.match(server, /intendedDok: weeklySlot\?\.dok \|\| null/);
  assert.match(server, /intendedDifficultyBand: weeklySlot\?\.difficultyBand \|\| null/);
  assert.match(server, /weeklyPurpose: weeklySlot\?\.purpose \|\| null/);
});


test('Teacher Path Simulator free-choice Challenge intent also targets DOK3 Band4', async () => {
  assert.ok(targetRecord);
  const code = primaryCode(targetRecord);
  const runtime = createTeacherPathRuntime({
    pathBankQuestions: records,
    courseId: 'algebra1',
  });
  const started = await runtime.startOrResumePathSession({
    targetAlignmentKey: 'texas:' + code,
    coursePracticeIntent: 'challenge',
  });
  assert.equal(started.session.coursePracticeIntent, 'challenge');
  assert.equal(started.session.intendedDok, 3);
  assert.equal(started.session.intendedDifficultyBand, 4);

  const question = (await runtime.fetchNextSanitizedQuestion({
    sessionId: started.session.sessionId,
  })).questionInstance;
  assert.equal(question.preferredDok, 3);
  assert.equal(question.preferredBand, 4);
  assert.equal(question.dok, 3);
  assert.equal(question.difficultyBand, 4);
});
