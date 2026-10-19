/*
 * EVERY QUESTION FAMILY RENDERS CLOSED, CORRECT AND IN PROGRESS.
 *
 * lmr-wu-1 failed only once a question was CLOSED: its solution review put a
 * family set's table spec (`{ xValues: [...] }`) into the page, and React threw
 * outside the response module's boundary. Ordinary use rarely reaches a closed
 * question — a student who has used every attempt has usually moved on — so
 * nothing had ever rendered one. This renders, for every registered family
 * version and every tool it can be delivered as, the instance three students
 * are dealt, under each record a reload can bring back: closed (attempts
 * used), correct, and in progress — through the real QuestionEngine and its
 * lazily loaded tool (helpers/warmupServerLifecycle.mjs renderQuestion), where
 * any render error is a failure.
 *
 * The two representation tools need authored boards, so they come from the
 * production Linear Multiple Representations lesson (the incident's); every
 * other family is authored here the minimal way a teacher can. A family
 * registered later is covered automatically — or this fails, naming it.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { allRegisteredQuestionFamilies } from '../../functions/shared/questionFamilyRegistry.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import {
  CLASS_ID,
  DAY,
  at,
  closeRenderer,
  createDevice,
  lmrAssignment,
  loadRenderer,
  openQuestion,
  questionsOf,
  readRender,
  renderQuestion,
} from './helpers/warmupServerLifecycle.mjs';

const STUDENTS = ['family-s-01', 'family-s-02', 'family-s-03'];
const AUTHORED_BOARDS = new Set(['representationMatch', 'representationBridge']);
const ATTEMPTS = getEffectiveActivityPolicy('warmup').attempts;

before(async () => { await loadRenderer(); });
after(async () => { await closeRenderer(); });

/** Every registered family version × every tool it can be delivered as, in one Warm-Up. */
const registryAssignment = () => {
  const questions = allRegisteredQuestionFamilies().flatMap((family) => Object.keys(family.tools || {})
    .filter((tool) => !AUTHORED_BOARDS.has(tool))
    .map((tool) => ({
      questionId: `family-${family.id}-v${family.version}-${tool}`,
      type: tool,
      prompt: 'Work the problem.',
      questionFamily: { id: family.id, version: family.version },
    })));
  const base = {
    id: 'family-closed-render',
    title: 'Every family, closed',
    schemaVersion: 5,
    variantPolicy: { mode: 'personalized' },
    sections: [{ id: 'warmup', role: 'warmup', title: 'Warm-Up', questions }],
    releaseAt: `${DAY}T00:00:00`,
    dueAt: `${DAY}T23:59:00`,
    lateDueAt: '2026-10-09T23:59:00',
    assignedClassIds: [CLASS_ID],
    warmup: { enabled: true, minutesBeforeStart: 7, closeMinutesAfterStart: 10, instructionDatesByClassId: { [CLASS_ID]: DAY } },
  };
  const seats = planSeatAdditions({ assignment: base, assignmentId: base.id, classId: CLASS_ID, studentIds: STUDENTS });
  return { ...base, generationSeats: { version: 1, byClassId: { [CLASS_ID]: seats } } };
};

const recordsFor = (pin) => ({
  closed: { status: 'expired', attemptCount: ATTEMPTS, totalAttempts: ATTEMPTS, partialCredit: 30, bestPartialCredit: 30, variantIndex: 0, familyDelivery: pin, submissionOrigin: 'deadline-auto-submit' },
  correct: { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100, variantIndex: 0, familyDelivery: pin },
  'in progress': { status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0, bestPartialCredit: 0, variantIndex: 0, familyDelivery: pin },
});

test('every family version and tool renders closed, correct and in progress, for every student it is dealt to', async () => {
  const covered = new Set();
  const failures = [];
  let renders = 0;
  for (const assignment of [registryAssignment(), lmrAssignment({ studentIds: STUDENTS })]) {
    const questions = questionsOf(assignment);
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      if (!question?.questionFamily) continue;
      for (const studentId of STUDENTS) {
        const device = createDevice(studentId);
        const dealt = await openQuestion(device, { assignment, questionIndex: index, nowMs: at(DAY, '08:01') });
        const pin = dealt.processed.familyDelivery;
        const where = `${question.questionId} (${dealt.processed.type}) for ${studentId}`;
        if (!pin) {
          failures.push(`${where}: no instance was dealt (${dealt.processed.type})`);
          continue;
        }
        covered.add(`${pin.familyId}@${pin.familyVersion}:${dealt.processed.type}`);
        for (const [state, record] of Object.entries(recordsFor(pin))) {
          const opened = await openQuestion(device, { assignment, record, questionIndex: index, nowMs: at(DAY, '08:20') });
          // A render that throws is one failure among the rest, not the end of the audit.
          const rendered = await renderQuestion(device, opened, { record, nowMs: at(DAY, '08:20') })
            .catch((error) => ({ html: '', errors: [error] }));
          renders += 1;
          const screen = readRender(rendered);
          if (opened.familyContext?.pinSource !== 'canonical') failures.push(`${where}, ${state}: replayed from ${opened.familyContext?.pinSource}, not the record's pin`);
          if (opened.processed.familyDelivery?.fingerprint !== pin.fingerprint) failures.push(`${where}, ${state}: a different instance came back`);
          if (rendered.errors.length) failures.push(`${where}, ${state}: ${rendered.errors.map((error) => String(error?.message || error).slice(0, 200)).join(' | ')}`);
          if (screen.failed) failures.push(`${where}, ${state}: the question-resolution boundary failed`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], `${failures.length} of ${renders} renders failed`);

  // Nothing registered went untested.
  const expected = allRegisteredQuestionFamilies().flatMap((family) => Object.keys(family.tools || {})
    .map((tool) => `${family.id}@${family.version}:${tool}`));
  assert.deepEqual(expected.filter((key) => !covered.has(key)), [], 'a registered family/tool was never rendered');
});
