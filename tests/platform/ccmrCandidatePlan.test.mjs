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
  // Place by place: each gets as many items as it can use while the budget
  // lasts, lists the items no earlier place was offered first, and takes one
  // offered elsewhere only when too few of its own are left (a narrow
  // construct, a small pool) — checked against the bank, not counted.
  const offeredInTurn = (assignment, plan) => {
    const offered = new Set();
    let budget = 40;
    for (const slot of plan.slots) {
      const ids = idsOf(slot);
      const source = assignment.sections[slot.sectionIndex].questions[slot.questionIndex];
      assert.equal(ids.length, Math.min(5, slot.semanticallyCompatibleCount, budget), `${slot.questionId} gets as many as it can use`);
      const fresh = ids.filter((id) => !offered.has(id));
      assert.deepEqual(ids.slice(0, fresh.length), fresh, `${slot.questionId} lists its own items before ones offered elsewhere`);
      if (fresh.length < ids.length) {
        const own = bank.rankAuditedBankDocuments({ teksCodes: slot.teksCodes, sourceQuestion: source, excludeDocumentIds: [...offered] });
        assert.equal(own.length, fresh.length, `${slot.questionId} repeats an item only after its own ran out`);
      }
      ids.forEach((id) => offered.add(id));
      budget -= ids.length;
    }
    return offered;
  };

  // Thirteen Practice places on A.3E/A.3C. The places whose task does not
  // show share dozens of compatible items, and each is offered items no other
  // place was. (Offering each place the same top five left five items in
  // all, three of which promise a graph.) The Transformations Lab places
  // share the items that practise a transformation (TT15).
  const wide = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(TRANSFORMATIONS), { ensurePracticeTarget: true, includeCandidates: true }).audit.plan;
  offeredInTurn(TRANSFORMATIONS, wide);
  const taskHidden = wide.slots
    .filter((slot) => bank.deriveSourceSemanticProfile(TRANSFORMATIONS.sections[slot.sectionIndex].questions[slot.questionIndex]).taskKinds.length === 0)
    .flatMap(idsOf);
  assert.ok(taskHidden.length > 5);
  assert.equal(new Set(taskHidden).size, taskHidden.length, 'no item is offered at two of those places');

  // Six inverse-function places share a small pool: once it is all offered, a
  // place is filled out with items offered elsewhere rather than left with too few.
  const narrow = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(INVERSES), { ensurePracticeTarget: true, includeCandidates: true }).audit.plan;
  const offered = offeredInTurn(INVERSES, narrow);
  assert.equal(offered.size, narrow.slots[0].semanticallyCompatibleCount, 'every compatible item is offered somewhere');
});

test('ranking: a narrowly aligned item comes before one crosswalked onto dozens of TEKS', () => {
  // Where a place's task does not show, the TEKS match decides and breadth
  // orders it: a multi-part transformations question shares A.3E with narrow
  // Digital SAT items and with items crosswalked onto dozens of TEKS.
  const practice = TRANSFORMATIONS.sections.find((section) => section.role === 'practice');
  const source = practice.questions.find((question) => bank.deriveSourceSemanticProfile(question).taskKinds.length === 0);
  const ranked = bank.rankAuditedBankDocuments({ teksCodes: bank.questionTeksCodes(source), seed: 'breadth', sourceQuestion: source });
  const breadths = ranked.map((document) => bank.documentTeksCodes(document).length);
  const firstBroad = breadths.findIndex((count) => count >= 6);
  assert.ok(firstBroad > 0, `both are offered, a narrow one first (${ranked[0].id}: ${breadths[0]} TEKS)`);
  assert.ok(breadths.slice(firstBroad).every((count) => count >= 6), 'every narrow candidate is offered before any broad one');

  // An inverse-functions question shows its task (TT15), so the 152-TEKS
  // translation item — and every other item that does not practise an
  // inverse function — is not offered for it at all.
  const inverses = INVERSES.sections.find((section) => section.role === 'practice');
  const inverse = inverses.questions[inverses.questions.length - 1];
  const forInverse = bank.rankAuditedBankDocuments({ teksCodes: bank.questionTeksCodes(inverse), seed: 'breadth', sourceQuestion: inverse });
  assert.ok(forInverse.length > 0);
  assert.ok(!forInverse.some((document) => document.id === 'mm_act_fn_4_translated-point_v21'), 'the 152-TEKS translation item no longer fronts an inverse-functions lesson');
  forInverse.forEach((document) => assert.match(document.taskType, /inverse/i, `${document.id} practises an inverse function`));
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

test('a graphing question whose `standard` is its line, not a code, offers only real TEKS codes', () => {
  // graphing2 standard form keeps the line it graphs in `standard` ({A, B, C});
  // read as text it became the code "[OBJECT OBJECT]" on every such place.
  const line = {
    questionId: 'graph-intercepts',
    type: 'graphing2',
    mode: 'standardForm',
    standard: { A: 3, B: 4, C: 12 },
    alignments: [{ framework: 'teks', code: 'A.3C', role: 'primary' }],
  };
  assert.deepEqual(bank.questionTeksCodes(line), ['A.3C']);
  assert.deepEqual(bank.questionTeksCodes({ ...line, alignments: [], standard: 'a.3c' }), ['A.3C'], 'a code written in `standard` still counts');

  const graphing = lesson('teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json');
  const { plan } = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(graphing), { ensurePracticeTarget: true, includeCandidates: true }).audit;
  const codes = plan.slots.flatMap((slot) => slot.teksCodes);
  assert.ok(plan.slots.some((slot) => slot.questionId === 'm3t2l1-pr-6'), 'the lesson\'s intercept-graphing place is in the plan');
  assert.deepEqual(codes.filter((code) => !/^A\.\d+[A-Z]$/.test(code)), [], 'every place names TEKS codes only');
});
