import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modulePath = path.resolve('functions/shared/liveChallengeExperience.mjs');

const loadExperience = async () => {
  assert.equal(
    existsSync(modulePath),
    true,
    'functions/shared/liveChallengeExperience.mjs must implement the Option B experience contract',
  );
  return import(`${pathToFileURL(modulePath).href}?contract=${Date.now()}`);
};

test('speed influence defaults to Standard 20% and clamps custom values', async () => {
  const { normalizeSpeedInfluencePercent, speedBonusCapForPercent } = await loadExperience();
  assert.equal(normalizeSpeedInfluencePercent(undefined), 20);
  assert.equal(normalizeSpeedInfluencePercent(null), 20);
  assert.equal(normalizeSpeedInfluencePercent(''), 20);
  assert.equal(normalizeSpeedInfluencePercent(-5), 0);
  assert.equal(normalizeSpeedInfluencePercent(10), 10);
  assert.equal(normalizeSpeedInfluencePercent(20), 20);
  assert.equal(normalizeSpeedInfluencePercent(35), 35);
  assert.equal(normalizeSpeedInfluencePercent(80), 50);
  assert.equal(speedBonusCapForPercent(0), 0);
  assert.equal(speedBonusCapForPercent(20), 200);
  assert.equal(speedBonusCapForPercent(35), 350);
});

test('experience adjustment scales only the existing speed component', async () => {
  const { experienceScoreAdjustment } = await loadExperience();
  assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 20, secondChance: false }), 100);
  assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 0, secondChance: false }), -100);
  assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 10, secondChance: false }), 0);
  assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 35, secondChance: false }), 250);
  assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 63, speedInfluencePercent: 20, secondChance: false }), 63);
  assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 35, secondChance: true }), 0);
});

test('player display modes are normalized and code names remain the default', async () => {
  const { normalizePlayerDisplayMode } = await loadExperience();
  assert.equal(normalizePlayerDisplayMode(), 'codeName');
  assert.equal(normalizePlayerDisplayMode('codeName'), 'codeName');
  assert.equal(normalizePlayerDisplayMode('firstLastInitial'), 'firstLastInitial');
  assert.equal(normalizePlayerDisplayMode('firstName'), 'firstName');
  assert.equal(normalizePlayerDisplayMode('fullName'), 'fullName');
  assert.equal(normalizePlayerDisplayMode('studentId'), 'codeName');
});

test('display aliases expose only the teacher-selected name shape', async () => {
  const { displayAliasForStudent } = await loadExperience();
  const student = { firstName: 'Ada', lastName: 'Lovelace', studentId: 'secret-id' };
  assert.equal(displayAliasForStudent({ student, mode: 'codeName', codeAlias: 'Prime Falcon 17' }), 'Prime Falcon 17');
  assert.equal(displayAliasForStudent({ student, mode: 'firstLastInitial', codeAlias: 'Prime Falcon 17' }), 'Ada L.');
  assert.equal(displayAliasForStudent({ student, mode: 'firstName', codeAlias: 'Prime Falcon 17' }), 'Ada');
  assert.equal(displayAliasForStudent({ student, mode: 'fullName', codeAlias: 'Prime Falcon 17' }), 'Ada Lovelace');
});

test('display aliases fall back through legacy display names and then the code alias', async () => {
  const { displayAliasForStudent } = await loadExperience();
  assert.equal(
    displayAliasForStudent({ student: { displayName: 'Grace Hopper' }, mode: 'firstLastInitial', codeAlias: 'Vector Owl 22' }),
    'Grace H.',
  );
  assert.equal(
    displayAliasForStudent({ student: {}, mode: 'fullName', codeAlias: 'Vector Owl 22' }),
    'Vector Owl 22',
  );
  assert.equal(
    displayAliasForStudent({ student: { firstName: 'Cher' }, mode: 'firstLastInitial', codeAlias: 'Vector Owl 22' }),
    'Cher',
  );
});

test('scoring preview explains actual maximum speed points for a round', async () => {
  const { buildChallengeScoringPreview } = await loadExperience();
  const preview = buildChallengeScoringPreview({ roundSeconds: 20, speedInfluencePercent: 20 });
  assert.equal(preview.basePoints, 1000);
  assert.equal(preview.maxSpeedBonus, 200);
  assert.deepEqual(
    preview.examples.map((entry) => [entry.secondsUsed, entry.pointsBeforeStreakComeback]),
    [[0, 1200], [5, 1150], [10, 1100], [15, 1050], [20, 1000]],
  );
  assert.match(preview.academicCreditNote, /not part of the assignment grade/i);
});
