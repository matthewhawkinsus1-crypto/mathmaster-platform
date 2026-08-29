import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAssessmentPracticeStage, CCMR_STAGE } from '../../src/platform/ccmr/assessmentFidelity.js';

const files = {
  digitalSAT: '../../seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json',
  act: '../../seed/pathQuestionBank/act_pathQuestionBank_seed.json',
  tsia2: '../../seed/pathQuestionBank/tsia2_pathQuestionBank_seed.json',
  asvab: '../../seed/pathQuestionBank/asvab_pathQuestionBank_seed.json',
};
const banks = Object.fromEntries(Object.entries(files).map(([framework, rel]) => [framework, JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')).documents]));
const codeOf = (q) => String((q.alignmentKeys || []).find((k) => /^texas:/i.test(k)) || '').replace(/^texas:/i, '').toUpperCase();
const norm = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ASVAB's two domains are two separate tests a recruit sits, not two reporting
// categories inside one test, so its direct tier is authored per subtest: A2.6L
// is assessed in both Arithmetic Reasoning and Mathematics Knowledge and carries
// five direct families in each. Every other framework's domains are reporting
// categories, so its direct tier is counted per code. The challenge tier is
// built one set of three per code for all four frameworks.
const SUBTEST_FRAMEWORKS = new Set(['asvab']);
const directKeyOf = (framework, q) => (SUBTEST_FRAMEWORKS.has(framework)
  ? `${codeOf(q)} / ${q.assessmentContext?.domainId || ''}`
  : codeOf(q));

test('every assessment standard has 5 direct and 3 challenge families', () => {
  for (const [framework, docs] of Object.entries(banks)) {
    const byCode = new Map();
    const byDirectKey = new Map();
    docs.forEach((q) => {
      const code = codeOf(q);
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(q);
      const key = directKeyOf(framework, q);
      if (!byDirectKey.has(key)) byDirectKey.set(key, []);
      byDirectKey.get(key).push(q);
    });
    byDirectKey.forEach((rows, key) => {
      const direct = rows.filter((q) => q.ccmrFamilyRole === 'direct' && Number(q.ccmrChallengeTier || 1) === 1);
      assert.equal(new Set(direct.map((q) => q.familyId)).size, 5, `${framework} ${key} direct`);
      assert.ok(rows.every((q) => q.ccmrFidelity?.version === 2 && q.ccmrFidelity.officialReferenceIds?.length));
    });
    byCode.forEach((rows, code) => {
      const challenge = rows.filter((q) => q.ccmrFamilyRole === 'challenge' && Number(q.ccmrChallengeTier || 1) >= 2);
      assert.equal(new Set(challenge.map((q) => q.familyId)).size, 3, `${framework} ${code} challenge`);
      assert.ok(challenge.every((q) => Number(q.difficultyBand) >= 4 && Number(q.dok) >= 2));
    });
  }
});

test('assessment corpora preserve their real response and calculator distinctions', () => {
  assert.ok(banks.digitalSAT.some((q) => q.assessmentItemFormat === 'studentProducedResponse'));
  assert.ok(banks.digitalSAT.some((q) => q.assessmentItemFormat === 'multipleChoice'));
  for (const framework of ['act', 'tsia2', 'asvab']) assert.ok(banks[framework].every((q) => q.assessmentItemFormat === 'multipleChoice'));
  assert.ok(banks.asvab.every((q) => q.calculatorPolicy === 'none' && q.examCalculatorMode === 'none'));
});

test('SAT, ACT and TSIA2 no longer ship identical prompt sets for shared standards', () => {
  const sets = {};
  for (const framework of ['digitalSAT', 'act', 'tsia2']) {
    sets[framework] = new Map();
    banks[framework].forEach((q) => { const code = codeOf(q); if (!sets[framework].has(code)) sets[framework].set(code, new Set()); sets[framework].get(code).add(norm(q.prompt)); });
  }
  const shared = [...sets.digitalSAT.keys()].filter((code) => sets.act.has(code) && sets.tsia2.has(code));
  assert.ok(shared.length > 100);
  shared.forEach((code) => {
    assert.notDeepEqual([...sets.digitalSAT.get(code)].sort(), [...sets.act.get(code)].sort(), `${code}: SAT/ACT clone set`);
    assert.notDeepEqual([...sets.act.get(code)].sort(), [...sets.tsia2.get(code)].sort(), `${code}: ACT/TSIA2 clone set`);
  });
});

test('CCMR progression moves from direct practice to challenge to maintenance', () => {
  assert.equal(resolveAssessmentPracticeStage({ directItemsAttempted: 0 }).stage, CCMR_STAGE.NEW);
  assert.equal(resolveAssessmentPracticeStage({ directItemsAttempted: 3, proficiency: 1 }).stage, CCMR_STAGE.BUILDING);
  assert.equal(resolveAssessmentPracticeStage({ directItemsAttempted: 5, proficiency: 0.8 }).stage, CCMR_STAGE.CHALLENGE_READY);
  assert.equal(resolveAssessmentPracticeStage({ tierSessionsPassed: { 2: 1 } }).stage, CCMR_STAGE.ADVANCED_CHALLENGE);
  assert.equal(resolveAssessmentPracticeStage({ tierSessionsPassed: { 3: 1 } }).stage, CCMR_STAGE.MAINTENANCE);
});

test('runtime contains server-owned tier progression and challenge-family selection', () => {
  const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(source, /loadCcmrProgress/);
  assert.match(source, /ccmrChallengeTier >= 2/);
  assert.match(source, /ccmrFamilyRole/);
  assert.match(source, /tier2SessionsPassed/);
  assert.match(source, /bootstrappedFromEvidence/);
});
