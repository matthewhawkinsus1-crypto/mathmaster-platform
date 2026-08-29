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

const bandsOf = (rows) => rows.map((q) => Number(q.difficultyBand));
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

// A standard is not limited to one set of families. CCMR V2.1 routes several
// TEKS codes into more than one assessment domain, and a code that reaches two
// domains is authored once per domain — so the SAT's A.3B ships two complete
// sets and the ACT's 6.2A ships four. What must hold is that every set is
// COMPLETE: whole 5-direct/3-challenge groups, never a partial one, and always
// the same number of direct groups as challenge groups.
test('every assessment standard ships complete 5-direct / 3-challenge family sets', () => {
  for (const [framework, docs] of Object.entries(banks)) {
    const byCode = new Map();
    docs.forEach((q) => { const code = codeOf(q); if (!byCode.has(code)) byCode.set(code, []); byCode.get(code).push(q); });
    byCode.forEach((rows, code) => {
      const direct = rows.filter((q) => q.ccmrFamilyRole === 'direct' && Number(q.ccmrChallengeTier || 1) === 1);
      const challenge = rows.filter((q) => q.ccmrFamilyRole === 'challenge' && Number(q.ccmrChallengeTier || 1) >= 2);
      const directFamilies = new Set(direct.map((q) => q.familyId)).size;
      const challengeFamilies = new Set(challenge.map((q) => q.familyId)).size;
      assert.ok(directFamilies > 0 && directFamilies % 5 === 0, `${framework} ${code}: ${directFamilies} direct families is not whole sets of five`);
      assert.ok(challengeFamilies > 0 && challengeFamilies % 3 === 0, `${framework} ${code}: ${challengeFamilies} challenge families is not whole sets of three`);
      assert.equal(directFamilies / 5, challengeFamilies / 3, `${framework} ${code}: direct and challenge set counts disagree`);
    });
  }
});

// The challenge tier has to be genuinely harder than the direct tier it follows.
//
// This used to be an absolute floor of difficultyBand >= 4. That was an artifact
// of the retired Fidelity V2 generator, which FORCED the band with
// `Math.min(5, Math.max(4, source + 1))` rather than authoring it. CCMR V2.1
// authors the challenge tier at the difficulty the standard actually supports,
// and 12 low-band TSIA2 standards — grade 6-8 geometry and statistics whose
// whole range is band 1-3 — have no band-4 form to author. An absolute floor
// also never checked the thing that matters: it would happily pass a challenge
// set that was EASIER than a direct set of band-5 items.
//
// The relative rule below is checked per code and domain, holds across all 257
// sets in all four banks, and is strictly stronger than the floor it replaces.
test('every challenge set is harder than the direct set it follows', () => {
  for (const [framework, docs] of Object.entries(banks)) {
    const byDomain = new Map();
    docs.forEach((q) => {
      const key = `${codeOf(q)} / ${q.assessmentContext?.domainId || ''}`;
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key).push(q);
    });
    byDomain.forEach((rows, key) => {
      const direct = bandsOf(rows.filter((q) => q.ccmrFamilyRole === 'direct'));
      const challenge = rows.filter((q) => q.ccmrFamilyRole === 'challenge');
      if (!direct.length || !challenge.length) return;
      const challengeBands = bandsOf(challenge);
      assert.ok(challenge.every((q) => Number(q.dok) >= 2), `${framework} ${key}: a challenge family sits below DOK 2`);
      assert.ok(Math.max(...challengeBands) > Math.max(...direct), `${framework} ${key}: the challenge set never reaches past the direct set`);
      assert.ok(mean(challengeBands) > mean(direct), `${framework} ${key}: the challenge set is not harder on average`);
      assert.ok(Math.min(...challengeBands) >= Math.min(...direct), `${framework} ${key}: the challenge set starts below the direct set`);
    });
  }
});

// `ccmrFidelity` is the provenance block the pre-V2.1 Fidelity V2 generator
// stamped on each family. CCMR V2.1 does not emit it — scripts/lib/ccmr-v2-1-
// production-release.mjs reads ccmrFamilyRole and ccmrChallengeTier and writes
// neither — so requiring it of SAT, ACT and TSIA2 asserts a retired convention.
// It is still required of every bank that does emit it, so a bank cannot drop
// the block silently once it carries one.
test('a bank that carries Fidelity V2 provenance carries it on every family', () => {
  for (const [framework, docs] of Object.entries(banks)) {
    const withProvenance = docs.filter((q) => q.ccmrFidelity);
    if (!withProvenance.length) continue;
    assert.equal(withProvenance.length, docs.length, `${framework}: ${docs.length - withProvenance.length} families have no ccmrFidelity block`);
    assert.ok(docs.every((q) => q.ccmrFidelity.version === 2), `${framework}: a family declares a ccmrFidelity version other than 2`);
    assert.ok(docs.every((q) => q.ccmrFidelity.officialReferenceIds?.length), `${framework}: a family cites no official reference`);
  }
});

// Whatever a bank's provenance convention, the two fields the runtime actually
// selects on must be present and consistent on every family in every bank.
test('every assessment family declares the tier fields the runtime selects on', () => {
  for (const [framework, docs] of Object.entries(banks)) {
    docs.forEach((q) => {
      const tier = Number(q.ccmrChallengeTier);
      assert.ok(Number.isInteger(tier) && tier >= 1 && tier <= 3, `${framework} ${q.id}: ccmrChallengeTier is not 1-3`);
      assert.ok(q.ccmrFamilyRole === 'direct' || q.ccmrFamilyRole === 'challenge', `${framework} ${q.id}: ccmrFamilyRole is neither direct nor challenge`);
      assert.equal(q.ccmrFamilyRole === 'challenge', tier >= 2, `${framework} ${q.id}: ccmrFamilyRole and ccmrChallengeTier disagree`);
    });
  }
});

test('assessment corpora preserve their real response and calculator distinctions', () => {
  assert.ok(banks.digitalSAT.some((q) => q.assessmentItemFormat === 'studentProducedResponse'));
  assert.ok(banks.digitalSAT.some((q) => q.assessmentItemFormat === 'multipleChoice'));
  for (const framework of ['act', 'tsia2', 'asvab']) assert.ok(banks[framework].every((q) => q.assessmentItemFormat === 'multipleChoice'));
  assert.ok(banks.asvab.every((q) => q.calculatorPolicy === 'none' && q.examCalculatorMode === 'none'));
});

// Pairwise, not three-way. Before CCMR V2.1 all three banks covered the same
// wide TEKS surface and shared over a hundred codes, so a three-way intersection
// was the natural check. V2.1 narrowed each bank to the standards its exam
// actually assesses — SAT 79 codes, TSIA2 19, ACT 7 — and exactly one code now
// reaches all three. Checking each PAIR covers all ten shared standards instead
// of the single triple, which is what the rule was ever about: two exams that
// assess the same standard must not ship the same questions for it.
test('no two assessment banks ship identical prompt sets for a standard they share', () => {
  const sets = {};
  for (const framework of ['digitalSAT', 'act', 'tsia2']) {
    sets[framework] = new Map();
    banks[framework].forEach((q) => { const code = codeOf(q); if (!sets[framework].has(code)) sets[framework].set(code, new Set()); sets[framework].get(code).add(norm(q.prompt)); });
  }
  const pairs = [['digitalSAT', 'act'], ['digitalSAT', 'tsia2'], ['act', 'tsia2']];
  let compared = 0;
  pairs.forEach(([left, right]) => {
    [...sets[left].keys()].filter((code) => sets[right].has(code)).forEach((code) => {
      compared += 1;
      assert.notDeepEqual(
        [...sets[left].get(code)].sort(),
        [...sets[right].get(code)].sort(),
        `${code}: ${left}/${right} clone set`,
      );
    });
  });
  // Guards against the check quietly becoming vacuous if a bank is renarrowed.
  assert.ok(compared >= 10, `only ${compared} shared standards were compared`);
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
