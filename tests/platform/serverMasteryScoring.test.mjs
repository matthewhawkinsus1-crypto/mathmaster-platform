/*
 * THE SERVER SCORES EACH QUESTION ONCE, BY ITS FINAL ATTEMPT (student push I).
 *
 * The trigger used to add every attempt to a skill's sums, so "right on the
 * second try" read 50% where the assignment record reads 100%, and the Path
 * map (more favourable of the two) disagreed with the wheel, its card and the
 * planner (server number). functions/shared/masteryScoring.mjs replaces each
 * question's earlier contribution with its latest attempt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  MAX_QUESTION_ROWS,
  MAX_QUESTIONS_PER_SKILL,
  compactQuestionRows,
  applyMasteryEvent,
  masteryEventFacts,
  questionKeyFor,
  rescoreProfilesFromEvidence,
} from '../../functions/shared/masteryScoring.mjs';
import { MASTERY_STATUS, classifyMasteryStatus, masteryFactsFromProfile } from '../../functions/shared/masteryRule.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const mathPath = createRequire(import.meta.url)('../../functions/lib/mathPath.js');

const assignmentAttempt = ({ question = 'q1', variant = 0, attempt = 1, correct = true, at = 1000, dok = 3, supportUsage = {} } = {}) => ({
  eventKey: `ev-${question}-${variant}-${attempt}`,
  occurredAt: at,
  masteryEvidenceKeys: ['texas:A.5A'],
  questionSnapshot: { questionInstanceId: `qi-${question}-${variant}`, questionId: question, dok, variantIndex: variant },
  source: { kind: 'assignment', assignmentId: 'lesson-1', activityRole: 'practice', questionIndex: 0 },
  performance: { score: correct ? 1 : 0, isCorrect: correct, attemptNumber: attempt },
  supportUsage,
});

const apply = (entry, evidence) => applyMasteryEvent(entry, masteryEventFacts(evidence, mathPath), 'A.5A', { now: 5 }).entry;

test('right on the second try is one question at 100%, not two events at 50%', () => {
  let entry = apply(undefined, assignmentAttempt({ attempt: 1, correct: false, at: 1000 }));
  assert.equal(entry.mastery.estimate, 0);
  entry = apply(entry, assignmentAttempt({ attempt: 2, correct: true, at: 2000 }));
  assert.equal(entry.mastery.estimate, 100);
  assert.equal(entry.accumulator.eligibleEvents, 1);
  assert.equal(entry.accumulator.independentSuccesses, 1);
  assert.equal(Object.keys(entry.questions).length, 1);
});

test('an older attempt delivered late changes nothing (triggers do not run in order)', () => {
  const second = apply(undefined, assignmentAttempt({ attempt: 2, correct: true, at: 2000 }));
  const result = applyMasteryEvent(second, masteryEventFacts(assignmentAttempt({ attempt: 1, correct: false, at: 1000 }), mathPath), 'A.5A');
  assert.equal(result.changed, false);
  assert.equal(result.entry.mastery.estimate, 100);
  // The same attempt twice (a retried trigger) is counted once.
  const again = apply(second, assignmentAttempt({ attempt: 2, correct: true, at: 2000 }));
  assert.equal(again.accumulator.eligibleEvents, 1);
  assert.equal(again.accumulator.weightedScoreSum, second.accumulator.weightedScoreSum);
});

test('a new version of the same assignment question is still that question, as in the assignment record', () => {
  assert.equal(questionKeyFor(assignmentAttempt({ variant: 0 })), questionKeyFor(assignmentAttempt({ variant: 3 })));
  let entry = apply(undefined, assignmentAttempt({ variant: 0, attempt: 1, correct: false, at: 1000 }));
  entry = apply(entry, assignmentAttempt({ variant: 1, attempt: 2, correct: true, at: 2000 }));
  assert.equal(entry.accumulator.eligibleEvents, 1);
  assert.equal(entry.mastery.estimate, 100);
  // Two different questions are two.
  entry = apply(entry, assignmentAttempt({ question: 'q2', attempt: 1, correct: false, at: 3000 }));
  assert.equal(entry.accumulator.eligibleEvents, 2);
  assert.equal(entry.mastery.estimate, 50);
});

test('outside assignments each delivered instance is a question; without one, each event is', () => {
  const path = { eventKey: 'p1', questionSnapshot: { questionInstanceId: 'pq-1' }, source: { kind: 'path' } };
  assert.equal(questionKeyFor(path), questionKeyFor({ ...path, eventKey: 'p2' }));
  const challenge = { eventKey: 'liveChallenge_room_A.5A', questionSnapshot: {}, source: { kind: 'liveChallenge' } };
  assert.notEqual(questionKeyFor(challenge), questionKeyFor({ ...challenge, eventKey: 'liveChallenge_room2_A.5A' }));
});

test('an entry the old trigger wrote keeps its sums as the base; new questions add once each', () => {
  const old = {
    mastery: { estimate: 50, status: MASTERY_STATUS.DEVELOPING },
    accumulator: { effectiveWeight: 4, weightedScoreSum: 2, eligibleEvents: 4, modifiedEvents: 0, independentSuccesses: 2 },
    dimensions: { dokRepresented: [2, 3] },
  };
  let entry = apply(old, assignmentAttempt({ question: 'new', attempt: 1, correct: false, at: 1000 }));
  entry = apply(entry, assignmentAttempt({ question: 'new', attempt: 2, correct: true, at: 2000 }));
  assert.equal(entry.accumulator.eligibleEvents, 5);
  assert.equal(entry.accumulator.weightedScoreSum, 3);
  assert.equal(entry.mastery.estimate, 60);
});

test('the per-question list is bounded; dropped rows stay folded into the sums', () => {
  let entry;
  for (let index = 0; index < MAX_QUESTIONS_PER_SKILL + 5; index += 1) {
    entry = apply(entry, assignmentAttempt({ question: `q${index}`, at: 1000 + index }));
  }
  assert.equal(Object.keys(entry.questions).length, MAX_QUESTIONS_PER_SKILL);
  assert.equal(entry.accumulator.eligibleEvents, MAX_QUESTIONS_PER_SKILL + 5);
});

test('the more favourable record lifts every reader that classifies through the shared rule', () => {
  const profile = {
    mastery: { estimate: 40 },
    accumulator: { eligibleEvents: 5, effectiveWeight: 5, independentSuccesses: 1 },
    dimensions: { dokRepresented: [2] },
    favourableRecord: { status: MASTERY_STATUS.MASTERED, estimate: 92, effectiveWeight: 6, items: 3 },
  };
  const facts = masteryFactsFromProfile(profile);
  assert.equal(facts.estimate, 92);
  assert.equal(facts.effectiveWeight, 6);
  assert.equal(facts.eligibleEvents, 3, 'the questions the shown number rests on');
  assert.equal(classifyMasteryStatus(facts), MASTERY_STATUS.MASTERED);
  // It never lowers, and never sets "Not Enough Evidence".
  assert.equal(classifyMasteryStatus({ ...facts, estimate: 40, eligibleEvents: 5, favourableRecord: { status: MASTERY_STATUS.NOT_ENOUGH_EVIDENCE } }), MASTERY_STATUS.NEEDS_ATTENTION);
  assert.equal(classifyMasteryStatus({ estimate: 100, eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 6, dokRepresented: [3], favourableRecord: { status: MASTERY_STATUS.SECURE } }), MASTERY_STATUS.MASTERED);
  // The server never stores one: a scored entry carries none.
  assert.equal(apply(undefined, assignmentAttempt({})).favourableRecord, undefined);
});

test('the document stays far below Firestore\'s 1 MiB limit however long the history', () => {
  // 52 skills × 200 questions each: the review measured 1,066 KiB before the budget.
  const profiles = {};
  for (let skill = 0; skill < 52; skill += 1) {
    const code = `A.${skill}Z`;
    for (let question = 0; question < 200; question += 1) {
      const evidence = { ...assignmentAttempt({ question: `q${skill}-${question}`, at: 1000 + skill * 1000 + question }), masteryEvidenceKeys: [`texas:${code}`] };
      profiles[code] = applyMasteryEvent(profiles[code], masteryEventFacts(evidence, mathPath), code, { now: 5 }).entry;
      compactQuestionRows(profiles);
    }
  }
  const rows = Object.values(profiles).reduce((sum, entry) => sum + Object.keys(entry.questions || {}).length, 0);
  assert.ok(rows <= MAX_QUESTION_ROWS, `${rows} rows`);
  Object.values(profiles).forEach((entry) => assert.ok(Object.keys(entry.questions).length <= MAX_QUESTIONS_PER_SKILL));
  const bytes = Buffer.byteLength(JSON.stringify({ profiles }));
  assert.ok(bytes < 400 * 1024, `${Math.round(bytes / 1024)} KiB`);
  // Every question still counted once in the sums.
  Object.values(profiles).forEach((entry) => assert.equal(entry.accumulator.eligibleEvents, 200));
  // The trigger compacts after every answer.
  const trigger = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  assert.match(region(trigger, 'exports.updateMyMathPathMasteryFromEvidence', '\nexports.', 'trigger'), /masteryScoring\.compactQuestionRows\(profiles\);/);
});

test('the evidence a skill first reached Mastered with is kept, so a rescored or slipped skill still pays its growth reward', async () => {
  const { reachedMasteredEvidence } = await import('../../functions/shared/growthRewardRules.mjs');
  let entry;
  ['a', 'b', 'c', 'd'].forEach((question, index) => { entry = apply(entry, assignmentAttempt({ question, at: 1000 + index })); });
  assert.equal(entry.mastery.status, MASTERY_STATUS.MASTERED);
  assert.equal(entry.masteredEvidence.eligibleEvents, 4);
  assert.equal(entry.masteredEvidence.at, 1003);
  // A later attempt replaces one right answer with a wrong one: the live counts
  // fall below the thresholds, the snapshot does not.
  const slipped = apply(entry, assignmentAttempt({ question: 'a', attempt: 2, correct: false, at: 5000 }));
  assert.equal(slipped.accumulator.independentSuccesses, 3);
  const rebuilt = { ...slipped, accumulator: { ...slipped.accumulator, eligibleEvents: 3, independentSuccesses: 1 }, dimensions: { ...slipped.dimensions, eligibleGradeLevelEvents: 3, independentSuccesses: 1 } };
  assert.equal(reachedMasteredEvidence('A.5A', rebuilt), true, 'paid on the snapshot');
  const { masteredEvidence: _kept, ...noSnapshot } = rebuilt;
  assert.equal(reachedMasteredEvidence('A.5A', noSnapshot), false);
  // A snapshot below the thresholds is not mastery.
  assert.equal(reachedMasteredEvidence('A.5A', { ...noSnapshot, masteredEvidence: { ...entry.masteredEvidence, independentSuccesses: 1 } }), false);
});

test('rescoring a whole history gives the same profile in any order', () => {
  const events = [
    assignmentAttempt({ attempt: 1, correct: false, at: 1000 }),
    assignmentAttempt({ attempt: 2, correct: true, at: 2000 }),
    assignmentAttempt({ question: 'q2', attempt: 1, correct: true, at: 3000 }),
  ].map((evidence, index) => ({ id: `e${index}`, evidence }));
  const forward = rescoreProfilesFromEvidence(events, mathPath, { now: 1 });
  const backward = rescoreProfilesFromEvidence([...events].reverse(), mathPath, { now: 1 });
  assert.deepEqual(forward, backward);
  assert.equal(forward['A.5A'].mastery.estimate, 100);
  assert.equal(forward['A.5A'].accumulator.eligibleEvents, 2);
});

test('the trigger scores through the shared scorer and writes the whole document', () => {
  const trigger = region(
    executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')),
    'exports.updateMyMathPathMasteryFromEvidence',
    '\nexports.',
    'mastery trigger',
  );
  assert.match(trigger, /const facts = masteryScoring\.masteryEventFacts\(evidence, mathPath, \{ eventId: event\.params\.eventId \}\);/);
  assert.match(trigger, /profiles\[code\] = masteryScoring\.applyMasteryEvent\(profiles\[code\], facts, code, \{ now: Date\.now\(\) \}\)\.entry;/);
  // A merge would keep a floor the student reached and dropped question rows.
  const write = region(trigger, 'transaction.set(profileRef, {', '\n      });', 'profile write');
  assert.match(write, /\.\.\.stored,/);
  assert.doesNotMatch(region(trigger, 'transaction.set(profileRef, {', 'let historyDocument', 'profile write tail'), /merge: true/);
  // The per-attempt sums the old trigger kept are gone from it.
  assert.doesNotMatch(trigger, /Number\(accumulator\.eligibleEvents \|\| 0\) \+/);
});

test('the skill card never says "You have mastered this" above unmet counts', async () => {
  const { masteryChecklist } = await import('../../functions/shared/masteryRule.mjs');
  // Mastered on the assignment record (1 question right), evidence checklist unmet.
  const byRecord = masteryChecklist({
    mastery: { estimate: 100 }, accumulator: { eligibleEvents: 1, effectiveWeight: 1, independentSuccesses: 1 }, dimensions: { dokRepresented: [2] },
    favourableRecord: { status: MASTERY_STATUS.MASTERED, estimate: 100, effectiveWeight: 1, items: 1 },
  });
  assert.equal(byRecord.mastered, true);
  assert.equal(byRecord.masteredBy, 'assignmentRecord');
  assert.equal(byRecord.remaining, 0);
  assert.deepEqual(byRecord.items.map((item) => item.met), [true]);
  // Not mastered: the full checklist, as before.
  const open = masteryChecklist({ mastery: { estimate: 60 }, accumulator: { eligibleEvents: 2, effectiveWeight: 2, independentSuccesses: 1 }, dimensions: { dokRepresented: [2] } });
  assert.equal(open.mastered, false);
  assert.equal(open.items.length, 4);
  assert.ok(open.remaining > 0);
});
