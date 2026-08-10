import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAIN_STATE, buildDomainReadiness, domainProficiency, explainDomain,
} from '../../src/platform/ccmr/domainReadiness.js';
import { READINESS, getAssessmentRecommendations } from '../../src/platform/ccmr/assessmentPathways.js';
import { getAssessmentProfile } from '../../src/platform/ccmr/assessmentProfiles.js';
import { getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { getSkillGraph } from '../../src/platform/path/skillGraph.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';
import { withSimulatedEvidence } from '../../src/platform/ccmr/assessmentEvidence.js';

const skills = getSkillGraph('algebra1');

const pathOptionsFor = (masteryBySkill = {}) => getStudentPathOptions({
  courseId: 'algebra1',
  masteryBySkill,
  pacing: { windowIndex: 3, windowCount: 6, accelerationRadius: 1 },
  pacingProvider: sequenceProvider({ skills, windowCount: 6 }),
});

const recommendationsFor = ({ masteryBySkill = {}, assessmentEvidence = {}, framework = 'digitalSAT' } = {}) => (
  getAssessmentRecommendations({ framework, pathOptions: pathOptionsFor(masteryBySkill), assessmentEvidence })
);

// --- The wheel covers the whole test, not just the matched part -------------

test('every domain the assessment has gets a segment', () => {
  const recommendations = recommendationsFor({});
  const domains = buildDomainReadiness(recommendations);
  const profile = getAssessmentProfile('digitalSAT');
  assert.equal(domains.length, profile.domains.length);
  assert.deepEqual(domains.map((entry) => entry.domainId), profile.domains.map((entry) => entry.id));
  assert.ok(domains.every((entry) => entry.title));
});

test('a domain with no aligned skill is shown, greyed, not hidden', () => {
  const domains = buildDomainReadiness(recommendationsFor({}));
  const empty = domains.filter((entry) => entry.skillCount === 0);
  empty.forEach((entry) => {
    assert.equal(entry.state, DOMAIN_STATE.NO_ALIGNMENT);
    assert.equal(entry.selectable, false, 'there is nothing to open');
    assert.equal(entry.proficiency, null);
  });
});

test('the registry decides the domains and their weights', () => {
  ['digitalSAT', 'act', 'tsia2', 'asvab'].forEach((framework) => {
    const domains = buildDomainReadiness(recommendationsFor({ framework }));
    const profile = getAssessmentProfile(framework);
    assert.deepEqual(domains.map((entry) => entry.title), profile.domains.map((entry) => entry.title));
    domains.forEach((entry, index) => assert.equal(entry.weight, profile.domains[index].weight ?? null));
  });
});

// --- No evidence is not zero -------------------------------------------------

test('an unpractised domain is ready to try, never 0%', () => {
  const mastery = Object.fromEntries(skills.slice(0, 12).map((skill) => [skill.skillId, { mastery: 0.95, attempts: 10, recentAccuracy: 0.95 }]));
  const domains = buildDomainReadiness(recommendationsFor({ masteryBySkill: mastery }));
  const withSkills = domains.filter((entry) => entry.skillCount > 0 && entry.practisedCount === 0);
  assert.ok(withSkills.length, 'the fixture must leave something unpractised');
  withSkills.forEach((entry) => {
    assert.equal(entry.proficiency, null, `${entry.title} must have no percentage to show`);
    assert.notEqual(entry.state, DOMAIN_STATE.DEVELOPING);
    assert.notEqual(entry.state, DOMAIN_STATE.STRONG);
  });
});

test('proficiency averages only what was practised', () => {
  assert.equal(domainProficiency([]), null);
  assert.equal(domainProficiency([{ evidenceBasis: 'crosswalk', assessmentProficiency: null }]), null);
  const average = domainProficiency([
    { evidenceBasis: 'direct', assessmentProficiency: 0.8 },
    { evidenceBasis: 'direct', assessmentProficiency: 0.6 },
    { evidenceBasis: 'crosswalk', assessmentProficiency: null },
  ]);
  assert.ok(Math.abs(average - 0.7) < 1e-9, `expected 0.7, got ${average}`);
});

// --- The states ---------------------------------------------------------------

const domainFrom = (items) => buildDomainReadiness({
  framework: 'digitalSAT',
  profile: { displayName: 'Digital SAT', domains: [{ id: 'd', title: 'Algebra', weight: 1 }] },
  byDomain: [{ domainId: 'd', items }],
})[0];

const item = (status, extra = {}) => ({ status, evidenceBasis: 'crosswalk', assessmentProficiency: null, ...extra });

test('a transfer gap is the headline whenever one exists', () => {
  const entry = domainFrom([
    item(READINESS.STRONG, { evidenceBasis: 'direct', assessmentProficiency: 0.9 }),
    item(READINESS.TRANSFER_GAP, { evidenceBasis: 'direct', assessmentProficiency: 0.3 }),
  ]);
  assert.equal(entry.state, DOMAIN_STATE.TRANSFER_GAP);
  assert.equal(entry.transferGaps, 1);
  assert.match(explainDomain(entry), /way this test asks/);
});

test('a domain waiting on the mathematics says so, rather than blaming the format', () => {
  const entry = domainFrom([item(READINESS.STRENGTHEN), item(READINESS.STRENGTHEN)]);
  assert.equal(entry.state, DOMAIN_STATE.PREREQUISITE_NEEDED);
  assert.match(explainDomain(entry), /Strengthen the mathematics/);
});

test('practised and mostly strong reads as strong', () => {
  const strong = item(READINESS.STRONG, { evidenceBasis: 'direct', assessmentProficiency: 0.9 });
  const entry = domainFrom([strong, strong, { ...strong, status: READINESS.READY }]);
  assert.equal(entry.state, DOMAIN_STATE.STRONG);
  assert.equal(Math.round(entry.proficiency * 100), 90);
});

test('practised but uneven reads as developing, not strong', () => {
  const entry = domainFrom([
    item(READINESS.READY, { evidenceBasis: 'direct', assessmentProficiency: 0.5 }),
    item(READINESS.READY, { evidenceBasis: 'direct', assessmentProficiency: 0.6 }),
    item(READINESS.STRONG, { evidenceBasis: 'direct', assessmentProficiency: 0.95 }),
  ]);
  assert.equal(entry.state, DOMAIN_STATE.DEVELOPING);
});

test('recommended beats ready, and ready beats nothing', () => {
  assert.equal(domainFrom([item(READINESS.RECOMMENDED), item(READINESS.READY)]).state, DOMAIN_STATE.RECOMMENDED);
  assert.equal(domainFrom([item(READINESS.READY)]).state, DOMAIN_STATE.READY_NOT_PRACTISED);
  assert.equal(domainFrom([]).state, DOMAIN_STATE.NO_ALIGNMENT);
});

test('every state has a sentence, and none of them leaks a code', () => {
  Object.values(DOMAIN_STATE).forEach((state) => {
    const sentence = explainDomain({ state });
    assert.ok(sentence.length > 10, `${state} needs an explanation`);
    assert.ok(!/_/.test(sentence), `${state} explanation leaks a state id`);
  });
});

// --- Real evidence moves the wheel --------------------------------------------

test('practising a skill in one format changes that domain and no other', () => {
  const mastery = Object.fromEntries(skills.slice(0, 14).map((skill) => [skill.skillId, { mastery: 0.95, attempts: 10, recentAccuracy: 0.95 }]));
  const before = buildDomainReadiness(recommendationsFor({ masteryBySkill: mastery }));
  const target = before.find((entry) => entry.skillCount > 0);
  assert.ok(target, 'the fixture must match at least one domain');
  const skillId = target.items[0].skillId;

  const evidence = withSimulatedEvidence({}, { skillId, framework: 'digitalSAT', proficiency: 0.35 });
  const after = buildDomainReadiness(recommendationsFor({ masteryBySkill: mastery, assessmentEvidence: evidence }));

  const changed = after.find((entry) => entry.domainId === target.domainId);
  assert.equal(changed.practisedCount, 1);
  assert.ok(changed.proficiency != null);

  after.filter((entry) => entry.domainId !== target.domainId).forEach((entry) => {
    const original = before.find((row) => row.domainId === entry.domainId);
    assert.equal(entry.practisedCount, original.practisedCount, `${entry.title} must not move`);
  });
});

test('nothing to build from returns nothing rather than a blank circle', () => {
  assert.deepEqual(buildDomainReadiness(null), []);
  assert.deepEqual(buildDomainReadiness({}), []);
});
