/*
 * THE SERVER OFFERS RANKED, COMPATIBLE ALTERNATIVES — AND NOTHING ELSE CHANGES.
 *
 * replaceDirectCcmrQuestionsWithAuditedBank(…, { includeCandidates: true })
 * returns, beside the assignment it always returned, `audit.plan`: for every
 * Practice place the Honors target may use, the audited candidates ranked
 * best first, so Pre-Flight can validate them in order
 * (canonicalCcmrHydration.js). Callers that do not ask get exactly what they
 * got before. Ranking keeps the #359 construct gate and now prefers an item
 * aligned narrowly to the place's primary TEKS over one crosswalked onto
 * dozens of standards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const lesson = (relPath) => buildAssignmentV5PreflightModel(parseAssignmentBlueprintText(read(relPath)).assignmentV5).assignmentV5;
const TRANSFORMATIONS = lesson('teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json');
const INVERSES = lesson('teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json');

const teksOf = (intent) => bank.documentTeksCodes(intent);

test('without includeCandidates the callable answers exactly as before: no plan, the same choices', () => {
  const plain = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true });
  const planned = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true, includeCandidates: true });
  assert.equal('plan' in plain.audit, false);
  assert.deepEqual(planned.assignment, plain.assignment, 'asking for alternatives never changes the first choice');
  const { plan, ...rest } = planned.audit;
  assert.deepEqual(rest, plain.audit);
  assert.equal(plan.version, 1);
  assert.equal(plan.targetCount, plain.audit.targetCount);
});

test('every Practice place the target may use is offered, with compatible audited candidates on its own TEKS', () => {
  const { audit } = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true, includeCandidates: true });
  const practice = TRANSFORMATIONS.sections.findIndex((section) => section.role === 'practice');
  assert.equal(audit.plan.slots.length, TRANSFORMATIONS.sections[practice].questions.length, 'one place per Practice question');
  assert.ok(!('budget' in audit.plan), 'internal bookkeeping stays on the server');
  let offered = 0;
  for (const slot of audit.plan.slots) {
    assert.equal(slot.kind, 'practiceTarget');
    const authored = TRANSFORMATIONS.sections[slot.sectionIndex].questions[slot.questionIndex];
    assert.equal(slot.questionId, authored.questionId, 'each place names the question it was planned for');
    assert.ok(slot.candidates.length <= 5);
    offered += slot.candidates.length;
    for (const intent of slot.candidates) {
      assert.equal(intent.ccmrSource.source, 'auditedBank');
      assert.equal(intent.ccmrSource.releaseTarget, bank.RELEASE_TARGET);
      assert.ok(teksOf(intent).some((code) => slot.teksCodes.includes(code)), `${intent.ccmrSource.documentId} shares a TEKS with its place`);
      assert.equal(intent.activityRole, 'practice');
    }
  }
  assert.ok(offered <= 40, `a bounded answer (${offered} candidates)`);
});

// Every item in the order the client tries them: place by place, each
// place's own items, an item offered at an earlier place counted there.
const triedInOrder = (plan) => [...new Map(plan.slots
  .flatMap((slot) => slot.candidates)
  .map((intent) => [intent.ccmrSource.documentId, intent])).values()];

test('ranking: an item on the place’s primary TEKS comes before one that shares only a secondary code', () => {
  const { audit } = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true, includeCandidates: true });
  // Every Practice question here is A.3E (primary) and A.3C (secondary). In
  // the order the client tries them: narrow A.3E items, then narrow items on
  // A.3C only, then crosswalked items the same way round.
  const tierOf = (intent) => (teksOf(intent).length >= 6 ? 2 : 0) + (teksOf(intent).includes('A.3E') ? 0 : 1);
  const tiers = triedInOrder(audit.plan).map(tierOf);
  assert.equal(tiers[0], 0, 'the first item tried is narrowly aligned to A.3E');
  tiers.forEach((tier, index) => {
    if (index) assert.ok(tier >= tiers[index - 1], `item ${index + 1} (tier ${tier}) is not tried before a better-aligned one (tier ${tiers[index - 1]})`);
  });
  const chosen = bank.chooseAuditedBankDocumentAnyFramework({
    teksCodes: ['A.3E', 'A.3C'],
    seed: 'primary-teks',
    sourceQuestion: TRANSFORMATIONS.sections.find((section) => section.role === 'practice').questions[0],
  });
  assert.ok(bank.documentTeksCodes(chosen).includes('A.3E'));
});

test('places are offered different items: one that fails or is set aside never empties the plan', () => {
  const idsOf = (slot) => slot.candidates.map((intent) => intent.ccmrSource.documentId);
  // Thirteen Practice places on A.3E/A.3C and dozens of compatible items:
  // every candidate offered is a different item. (Offering each place the
  // same top five left five items in all, three of which promise a graph.)
  const wide = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true, includeCandidates: true }).audit.plan;
  const wideIds = wide.slots.flatMap(idsOf);
  assert.ok(wideIds.length > 5);
  assert.equal(new Set(wideIds).size, wideIds.length, 'no item is offered at two places');

  // Six places sharing 24 compatible items: each place still gets five, its
  // own first; once all 24 are offered, a place is filled out with items
  // offered elsewhere rather than left with too few.
  const narrow = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(INVERSES), { ensurePracticeTarget: true, includeCandidates: true }).audit.plan;
  const offered = new Set();
  for (const slot of narrow.slots) {
    const ids = idsOf(slot);
    assert.equal(ids.length, Math.min(5, slot.semanticallyCompatibleCount), `place ${slot.questionIndex + 1} gets as many as it can use`);
    const fresh = ids.filter((id) => !offered.has(id));
    assert.deepEqual(ids.slice(0, fresh.length), fresh, `place ${slot.questionIndex + 1} lists its own items before ones offered elsewhere`);
    ids.forEach((id) => offered.add(id));
  }
  assert.equal(offered.size, narrow.slots[0].semanticallyCompatibleCount, 'every compatible item is offered somewhere');
});

test('ranking: a narrowly aligned item comes before one crosswalked onto dozens of TEKS', () => {
  const practice = INVERSES.sections.find((section) => section.role === 'practice');
  const source = practice.questions[practice.questions.length - 1];
  const ranked = bank.rankAuditedBankDocuments({ teksCodes: bank.questionTeksCodes(source), seed: 'breadth', sourceQuestion: source });
  assert.ok(ranked.length > 0);
  const breadths = ranked.map((document) => bank.documentTeksCodes(document).length);
  const firstBroad = breadths.findIndex((count) => count >= 6);
  if (firstBroad >= 0) {
    assert.ok(breadths.slice(firstBroad).every((count) => count >= 6), 'every narrow candidate is offered before any broad one');
  }
  assert.ok(breadths[0] < 6, `the first choice is narrowly aligned (${ranked[0].id}: ${breadths[0]} TEKS)`);
  assert.notEqual(ranked[0].id, 'mm_act_fn_4_translated-point_v21', 'the 152-TEKS translation item no longer fronts an inverse-functions lesson');
});

test('the #359 construct gate still holds inside every ranked list', () => {
  const day1 = {
    questionId: 'day1-elimination',
    standard: 'A2.3A',
    studentActions: ['solveSystem'],
    type: 'systemsWorkspace',
    equations: ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'],
    variables: ['x', 'y', 'z'],
    alignments: [{ framework: 'teks', code: 'A2.3A', role: 'primary', evidenceLevel: 'assessed' }],
  };
  const ranked = bank.rankAuditedBankDocuments({ teksCodes: ['A2.3A'], seed: 'gate', sourceQuestion: day1 });
  for (const document of ranked) {
    assert.equal(bank.isSemanticallyCompatible(bank.deriveSourceSemanticProfile(day1), document), true, `${document.id} passes the construct gate`);
    assert.doesNotMatch(document.taskType || '', /quadratic/i);
  }
});

test('items the teacher set aside are never offered again, nor chosen in place', () => {
  const first = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true, includeCandidates: true });
  const setAside = first.audit.plan.slots.flatMap((slot) => slot.candidates.slice(0, 1).map((intent) => intent.ccmrSource.documentId));
  assert.ok(setAside.length > 0);
  const again = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true, includeCandidates: true, excludeDocumentIds: setAside });
  const offered = again.audit.plan.slots.flatMap((slot) => slot.candidates.map((intent) => intent.ccmrSource.documentId));
  assert.ok(!offered.some((id) => setAside.includes(id)));
  const chosen = again.assignment.sections.flatMap((section) => section.questions).map((question) => question?.ccmrSource?.documentId).filter(Boolean);
  assert.ok(!chosen.some((id) => setAside.includes(id)));
});

test('a direct exam-style claim is offered as its own place, from its own framework and domain', () => {
  const claim = {
    questionId: 'claim-1',
    prompt: 'AI-written SAT-like draft.',
    studentActions: ['solveEquation'],
    equation: '3x+4=40',
    answer: '12',
    standard: 'A.5A',
    dok: 2,
    alignments: [
      { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
      { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' },
    ],
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
  };
  const assignment = { schemaVersion: 5, assignment: { title: 'Claims', courseId: 'algebra1' }, sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: [claim] }] };
  const { audit } = bank.replaceDirectCcmrQuestionsWithAuditedBank(assignment, { includeCandidates: true });
  assert.equal(audit.plan.slots.length, 1);
  const [slot] = audit.plan.slots;
  assert.equal(slot.kind, 'directClaim');
  assert.equal(slot.framework, 'digitalSAT');
  assert.ok(slot.candidates.length > 0);
  slot.candidates.forEach((intent) => {
    assert.equal(intent.assessmentContext.framework, 'digitalSAT');
    assert.equal(intent.ccmrSource.domainId, 'algebra');
  });
});
