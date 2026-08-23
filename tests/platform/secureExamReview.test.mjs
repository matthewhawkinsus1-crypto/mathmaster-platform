import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const secureExam = require('../../functions/lib/secureExam.js');

test('released secure-exam review returns sanitized learning feedback only after teacher release', () => {
  const base = {
    examSessionId: 'exam-review-1', examType: 'digitalSAT', title: 'SAT review', status: 'submitted',
    feedbackReleased: false, summary: { completedQuestions: 1, correctQuestions: 1 },
    responses: {
      q1: {
        questionInstanceId: 'q1', bankQuestionId: 'bank-secret-id', alignmentKeys: ['texas:A.2B'], questionType: 'response', familyId: 'family-1',
        grading: { score: 1, isCorrect: true }, responsePayload: { responses: { answer: '3/4' } }, submittedAt: 100,
        questionSnapshot: {
          prompt: 'What is $3/4$?', responseFields: [{ id: 'answer', label: 'Answer', expected: '3/4', accepted: ['0.75'] }],
          privateGrading: { fields: [{ expected: '3/4' }] }, generatorParameters: { numerator: 3 },
        },
      },
    },
  };
  assert.equal(secureExam.publicReview(base), null);
  const review = secureExam.publicReview({ ...base, feedbackReleased: true });
  assert.equal(review.scorePercent, 100);
  assert.equal(review.items[0].responsePayload.responses.answer, '3/4');
  assert.equal(review.items[0].questionSnapshot.prompt, 'What is $3/4$?');
  const serialized = JSON.stringify(review);
  assert.doesNotMatch(serialized, /"expected"/);
  assert.doesNotMatch(serialized, /"accepted"/);
  assert.doesNotMatch(serialized, /privateGrading/);
  assert.doesNotMatch(serialized, /generatorParameters/);
});


test('secure public question strips topic clues but preserves item-level calculator policy', () => {
  const result = secureExam.publicQuestion({
    questionInstanceId: 'q1', prompt: 'Solve $x+1=2$.', alignmentKey: 'A.5A',
    familyId: 'mathmaster:A.5A:solve-linear', familyVersion: 1, dok: 2, difficultyBand: 3,
    activityRole: 'test', assessedConstruct: 'linear-equation', assessmentContext: { framework: 'tsia2', domainId: 'algebraicReasoning', examStyle: true },
    responseFields: [{ id: 'answer', inputProfile: 'number' }],
  }, { examCalculatorMode: 'basic' });
  assert.equal(result.prompt, 'Solve $x+1=2$.');
  assert.equal(result.examCalculatorMode, 'basic');
  assert.equal(result.alignmentKey, undefined);
  assert.equal(result.familyId, undefined);
  assert.equal(result.dok, undefined);
  assert.equal(result.assessmentContext, undefined);
  assert.equal(result.assessedConstruct, undefined);
});
test('secure exam domain scheduler keeps Digital SAT practice near its published domain mix', () => {
  const session = { examType: 'digitalSAT', responses: {} };
  const sequence = [];
  for (let index = 0; index < 20; index += 1) {
    const domain = secureExam.nextDomainId(session);
    sequence.push(domain);
    session.responses[`q${index}`] = { assessmentDomainId: domain };
  }
  const counts = sequence.reduce((acc, domain) => ({ ...acc, [domain]: (acc[domain] || 0) + 1 }), {});
  assert.equal(Object.values(counts).reduce((sum, value) => sum + value, 0), 20);
  assert.ok(counts.algebra >= 6 && counts.algebra <= 8, JSON.stringify(counts));
  assert.ok(counts.advancedMath >= 6 && counts.advancedMath <= 8, JSON.stringify(counts));
  assert.ok(counts.problemSolvingData >= 2 && counts.problemSolvingData <= 4, JSON.stringify(counts));
  assert.ok(counts.geometryTrigonometry >= 2 && counts.geometryTrigonometry <= 4, JSON.stringify(counts));
});

test('secure exam domain scheduler honors ASVAB half-and-half math subtests', () => {
  const session = { examType: 'asvab', responses: {} };
  const counts = {};
  for (let index = 0; index < 30; index += 1) {
    const domain = secureExam.nextDomainId(session);
    counts[domain] = (counts[domain] || 0) + 1;
    session.responses[`q${index}`] = { assessmentDomainId: domain };
  }
  assert.deepEqual(counts, { arithmeticReasoning: 15, mathematicsKnowledge: 15 });
});
