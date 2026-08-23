// The difficulty and demand the SERVER actually asks for.
//
// Two defects lived here, and both are the same shape as the ones this whole
// project keeps turning up: a value computed carefully in one place and then
// not consumed by the place that matters.
//
//   1. The policy asked for difficulty band 5. Nothing in the 5,186-template
//      bank is authored above band 4. Selection degrades to the nearest band so
//      no session ever broke — which is exactly why it survived — but every
//      Honors extension session was reaching past the end of the content, and
//      the "preferred band" reported to teachers was one nobody could serve.
//
//   2. The policy expressed no cognitive demand at all, and selection never
//      looked at DOK. The platform tracks DOK and difficulty as independent
//      axes everywhere, decides a DOK for every session, shows it to teachers
//      and writes it onto the evidence — and then the one function that chooses
//      the student's actual question considered only difficulty.
//
// The DOK decision is made server-side on purpose. A browser that could name
// its own difficulty could name band 1 forever.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { rankCandidates, selectNextFamily } from '../../functions/shared/pathQuestionSelection.mjs';

const require = createRequire(import.meta.url);
const { resolveAdaptiveRigor } = require('../../functions/lib/rigorPolicy.js');

const SEED_DIR = 'seed/pathQuestionBank';

const bankTemplates = () => {
  const docs = [];
  readdirSync(SEED_DIR).filter((name) => name.endsWith('.json')).forEach((name) => {
    const parsed = JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8'));
    (parsed.documents || []).forEach((doc) => { if (doc.active !== false) docs.push(doc); });
  });
  return docs;
};

const PROFILES = {
  none: {},
  developing: { mastery: { status: 'Developing', estimate: 55, confidence: 'Medium' }, dimensions: { eligibleGradeLevelEvents: 6 } },
  onTrack: { mastery: { status: 'Secure', estimate: 78, confidence: 'Medium' }, dimensions: { eligibleGradeLevelEvents: 6 } },
  advanced: { mastery: { status: 'Mastered', estimate: 95, confidence: 'High' }, dimensions: { eligibleGradeLevelEvents: 9 } },
};

const everyCase = () => {
  const out = [];
  ['standard', 'honors'].forEach((courseLevel) => {
    Object.entries(PROFILES).forEach(([name, profile]) => {
      out.push({ courseLevel, name, rigor: resolveAdaptiveRigor({ courseLevel, profile }) });
    });
  });
  return out;
};

// --- The server never asks for content that does not exist ---------------------

test('the bank tops out at band 4 and DOK 3', () => {
  // The premise every assertion below rests on. If the bank ever gains band 5
  // content, this fails first and the policy can be widened deliberately.
  const templates = bankTemplates();
  assert.ok(templates.length > 5000, `only ${templates.length} templates loaded`);
  const maxBand = Math.max(...templates.map((doc) => Number(doc.difficultyBand) || 0));
  const maxDok = Math.max(...templates.map((doc) => Number(doc.dok) || 0));
  assert.equal(maxBand, 4);
  assert.equal(maxDok, 3);
});

test('no readiness case asks for a difficulty the bank cannot serve', () => {
  // The specific defect: honorsExtension requested band 5.
  everyCase().forEach(({ courseLevel, name, rigor }) => {
    assert.ok(rigor.preferredDifficultyBand >= 1 && rigor.preferredDifficultyBand <= 4,
      `${courseLevel}/${name} asked for band ${rigor.preferredDifficultyBand}`);
    assert.ok(rigor.returnTargetBand >= 1 && rigor.returnTargetBand <= 4,
      `${courseLevel}/${name} returns to band ${rigor.returnTargetBand}`);
  });
});

test('no readiness case asks for a cognitive demand the bank cannot serve', () => {
  everyCase().forEach(({ courseLevel, name, rigor }) => {
    assert.ok(rigor.preferredDok >= 1 && rigor.preferredDok <= 3,
      `${courseLevel}/${name} asked for DOK ${rigor.preferredDok}`);
  });
});

test('an Honors student at the ceiling is stretched by depth, not by a band that does not exist', () => {
  const extension = resolveAdaptiveRigor({ courseLevel: 'honors', profile: PROFILES.advanced });
  assert.equal(extension.mode, 'honorsExtension');
  assert.equal(extension.preferredDifficultyBand, 4, 'capped at what is authored');
  assert.equal(extension.preferredDok, 3, 'the stretch has to come from somewhere');
});

test('repair lowers complexity and holds demand steady', () => {
  // Moving both axes at once makes the next result uninterpretable — you cannot
  // tell which change the student responded to.
  const standard = resolveAdaptiveRigor({ courseLevel: 'standard', profile: PROFILES.onTrack });
  const repair = resolveAdaptiveRigor({ courseLevel: 'standard', profile: PROFILES.developing });
  assert.ok(repair.preferredDifficultyBand < standard.preferredDifficultyBand, 'complexity comes down');
  assert.equal(repair.preferredDok, standard.preferredDok, 'demand stays put');
});

test('every case reports both axes, so a teacher explanation is not half a sentence', () => {
  everyCase().forEach(({ courseLevel, name, rigor }) => {
    assert.ok('preferredDifficultyBand' in rigor, `${courseLevel}/${name} has no band`);
    assert.ok('preferredDok' in rigor, `${courseLevel}/${name} has no DOK`);
    assert.ok(rigor.mode, `${courseLevel}/${name} has no mode`);
  });
});

// --- DOK now actually reaches selection --------------------------------------------

const family = (id, { band = 3, dok = 2, representation = 'symbolic', taskType = 'procedural' } = {}) => ({
  id,
  difficultyBand: band,
  dok,
  representation,
  taskType,
  questionType: 'multipleChoice',
  prompt: 'A real prompt with enough substance to pass the quality audit.',
  choices: [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }, { id: 'c', label: 'Three' }],
  responseFields: [{ id: 'answer', inputProfile: 'choice', expected: 'a' }],
  solutionReview: { headline: 'Because', reasoning: ['One', 'Two'], answerSummary: 'a' },
});

test('at the same band, the requested demand decides', () => {
  // The whole point. Two families equally accessible; only the thinking differs.
  const candidates = [family('shallow', { band: 3, dok: 1 }), family('deep', { band: 3, dok: 3 })];
  const wantsDepth = selectNextFamily(candidates, { preferredBand: 3, preferredDok: 3 });
  const wantsRecall = selectNextFamily(candidates, { preferredBand: 3, preferredDok: 1 });
  assert.equal(wantsDepth.question.id, 'deep');
  assert.equal(wantsRecall.question.id, 'shallow');
});

test('complexity still outranks demand, because it governs whether the student can engage at all', () => {
  // Asking the right KIND of thinking at an unreachable complexity helps nobody.
  const candidates = [
    family('rightBandWrongDok', { band: 2, dok: 1 }),
    family('wrongBandRightDok', { band: 4, dok: 3 }),
  ];
  const chosen = selectNextFamily(candidates, { preferredBand: 2, preferredDok: 3 });
  assert.equal(chosen.question.id, 'rightBandWrongDok');
});

test('omitting a DOK preference changes nothing', () => {
  // Every caller that has not opted in must behave exactly as before.
  const candidates = [family('a', { band: 2, dok: 3 }), family('b', { band: 3, dok: 1 })];
  const without = selectNextFamily(candidates, { preferredBand: 3 });
  const explicitNull = selectNextFamily(candidates, { preferredBand: 3, preferredDok: null });
  assert.equal(without.question.id, explicitNull.question.id);
  assert.equal(without.question.id, 'b', 'band alone still decides');
});

test('the choice reports the demand it was asked for and the one it served', () => {
  // A teacher screen cannot explain a decision it was not told about.
  const candidates = [family('only', { band: 3, dok: 2 })];
  const chosen = selectNextFamily(candidates, { preferredBand: 3, preferredDok: 3 });
  assert.equal(chosen.preferredDok, 3);
  assert.equal(chosen.dok, 2);
  assert.equal(chosen.dokDistanceFromPreferred, 1, 'the shortfall is reportable, not hidden');
});

test('a family with no DOK declared is treated as ordinary demand, not as a mismatch', () => {
  const candidates = [{ ...family('untagged'), dok: undefined }, family('tagged', { dok: 2 })];
  const ranked = rankCandidates(candidates, { preferredBand: 3, preferredDok: 2 });
  ranked.forEach((entry) => {
    assert.ok(Number.isFinite(entry.dokDistance), 'an untagged family must still rank');
  });
});

test('a lockstep standard still serves the closest available pairing', () => {
  // 198 exam-bank standards author DOK and band as a fixed ladder — DOK 1 at
  // band 2, DOK 2 at band 3, DOK 3 at band 4 — so a request for DOK 3 at band 2
  // cannot be met exactly. It must degrade to the nearest thing rather than
  // returning nothing.
  const ladder = [
    family('l1', { band: 2, dok: 1 }),
    family('l2', { band: 3, dok: 2 }),
    family('l3', { band: 4, dok: 3 }),
  ];
  const chosen = selectNextFamily(ladder, { preferredBand: 2, preferredDok: 3 });
  assert.ok(chosen, 'a lockstep standard must still yield a question');
  assert.equal(chosen.question.id, 'l1', 'accessibility wins, and the shortfall is reported');
  assert.equal(chosen.dokDistanceFromPreferred, 2);
});
