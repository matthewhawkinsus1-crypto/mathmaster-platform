// The engine may only ask for questions that exist.
//
// This is the test that would have caught the defect the DOK/difficulty audit
// found: `resolveTarget` extended a student at Band 4 by asking for Band 5, and
// nothing in the entire 5,150-template bank is authored at Band 5. The student
// does not experience that as "there is nothing harder here". They experience
// it as a session that will not start.
//
// It reads the real seed files, so it fails in BOTH directions — if the engine
// starts asking for something the bank cannot serve, and if the bank grows past
// what the engine will ever request.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUTHORED_CEILING, PURPOSE, resolveTarget,
} from '../../src/platform/path/recommendationV2.js';

const SEED_DIR = 'seed/pathQuestionBank';

const bankTemplates = () => {
  const docs = [];
  readdirSync(SEED_DIR).filter((name) => name.endsWith('.json')).forEach((name) => {
    const parsed = JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8'));
    (parsed.documents || []).forEach((doc) => {
      if (doc.active !== false) docs.push(doc);
    });
  });
  return docs;
};

const templates = bankTemplates();

const observed = templates.reduce((acc, doc) => {
  const dok = Number(doc.dok);
  const band = Number(doc.difficultyBand);
  if (Number.isFinite(dok)) acc.maxDok = Math.max(acc.maxDok, dok);
  if (Number.isFinite(band)) acc.maxBand = Math.max(acc.maxBand, band);
  return acc;
}, { maxDok: 0, maxBand: 0 });

test('the bank is actually loadable and non-trivial', () => {
  assert.ok(templates.length > 1000, `only ${templates.length} templates found`);
});

test('the declared ceiling matches what the bank authors', () => {
  // Both directions on purpose. Too high and the engine requests questions that
  // do not exist; too low and content that was authored can never be reached.
  assert.equal(AUTHORED_CEILING.difficultyBand, observed.maxBand,
    `engine ceiling is band ${AUTHORED_CEILING.difficultyBand}, bank tops out at ${observed.maxBand}`);
  assert.equal(AUTHORED_CEILING.dok, observed.maxDok,
    `engine ceiling is DOK ${AUTHORED_CEILING.dok}, bank tops out at DOK ${observed.maxDok}`);
});

test('no purpose, at any stable band, requests something the bank cannot serve', () => {
  // The exhaustive version: every purpose crossed with every band a student can
  // stabilise at, plus the failure-retry branch.
  const purposes = Object.values(PURPOSE);
  const bands = [1, 2, 3, 4, 5];

  purposes.forEach((purpose) => {
    bands.forEach((stableBand) => {
      const profile = { difficultyProfile: { stableBand }, dokProfile: { 3: { confident: true, accuracy: 0.9 } } };
      [null, 1, 2, 3, 4, 5].forEach((recentFailureBand) => {
        const target = resolveTarget({ purpose, profile, recentFailureBand });
        assert.ok(
          target.difficultyBand >= 1 && target.difficultyBand <= observed.maxBand,
          `${purpose} at stable ${stableBand} (miss ${recentFailureBand}) asked for band ${target.difficultyBand}`,
        );
        assert.ok(
          target.dok >= 1 && target.dok <= observed.maxDok,
          `${purpose} at stable ${stableBand} asked for DOK ${target.dok}`,
        );
      });
    });
  });
});

test('a student at the ceiling is extended by depth, not by a band that does not exist', () => {
  const atCeiling = resolveTarget({
    purpose: PURPOSE.EXTENSION,
    profile: { difficultyProfile: { stableBand: observed.maxBand } },
  });
  assert.equal(atCeiling.difficultyBand, observed.maxBand);
  assert.equal(atCeiling.dok, observed.maxDok, 'the stretch has to come from somewhere');
});

test('every template carries both axes', () => {
  // The engine reads dok and difficultyBand on every request. A template
  // missing either cannot be matched and is dead inventory.
  const missing = templates.filter((doc) => (
    !Number.isFinite(Number(doc.dok)) || !Number.isFinite(Number(doc.difficultyBand))
  ));
  assert.equal(missing.length, 0, `${missing.length} templates missing dok or difficultyBand`);
});

test('every template declares a representation', () => {
  // The weekly-set optimiser penalises repeating a representation. A template
  // without one silently opts out of the variety mechanism.
  const missing = templates.filter((doc) => !doc.representation);
  assert.equal(missing.length, 0, `${missing.length} templates missing representation`);
});
