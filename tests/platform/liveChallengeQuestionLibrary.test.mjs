import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modulePath = path.resolve('src/platform/liveChallenge/challengeQuestionImport.js');
const loadImport = async () => {
  assert.equal(existsSync(modulePath), true, 'challengeQuestionImport.js must exist');
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
};

test('normalizer accepts raw arrays and known package wrappers', async () => {
  const { normalizeChallengeQuestionPackage } = await loadImport();
  const docs = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(normalizeChallengeQuestionPackage(docs), docs);
  assert.deepEqual(normalizeChallengeQuestionPackage({ documents: docs }), docs);
  assert.deepEqual(normalizeChallengeQuestionPackage({ items: docs }), docs);
  assert.deepEqual(normalizeChallengeQuestionPackage({ questions: docs }), docs);
});

test('normalizer accepts pasted JSON text but rejects malformed or empty packages clearly', async () => {
  const { normalizeChallengeQuestionPackage } = await loadImport();
  assert.deepEqual(normalizeChallengeQuestionPackage('[{"id":"q1"}]'), [{ id: 'q1' }]);
  assert.throws(() => normalizeChallengeQuestionPackage('{not json'), /valid JSON/i);
  assert.throws(() => normalizeChallengeQuestionPackage({ nope: [] }), /documents, items, or questions/i);
  assert.throws(() => normalizeChallengeQuestionPackage([]), /at least one question/i);
});

test('assignment extraction understands V5 sections without inventing a second question shape', async () => {
  const { challengeQuestionsFromAssignment } = await loadImport();
  const assignment = {
    schemaVersion: 5,
    sections: [
      { id: 'warmup', questions: [{ id: 'w1' }, { id: 'w2' }] },
      { id: 'classwork', questions: [{ id: 'c1' }] },
      { id: 'dol', questions: [{ id: 'd1' }] },
    ],
  };
  assert.deepEqual(challengeQuestionsFromAssignment(assignment).map((q) => q.id), ['w1', 'w2', 'c1', 'd1']);
});

test('assignment extraction supports legacy section buckets for safe import migration', async () => {
  const { challengeQuestionsFromAssignment } = await loadImport();
  const assignment = {
    warmup: { questions: [{ id: 'w' }] },
    classwork: { questions: [{ id: 'c' }] },
    practice: { questions: [{ id: 'p' }] },
    dol: { questions: [{ id: 'd' }] },
  };
  assert.deepEqual(challengeQuestionsFromAssignment(assignment).map((q) => q.id), ['w', 'c', 'p', 'd']);
});

test('assignment extraction deduplicates exact question ids while preserving first occurrence', async () => {
  const { challengeQuestionsFromAssignment } = await loadImport();
  const assignment = { sections: [{ questions: [{ id: 'same', prompt: 'first' }, { id: 'same', prompt: 'duplicate' }, { id: 'other' }] }] };
  const questions = challengeQuestionsFromAssignment(assignment);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].prompt, 'first');
});
