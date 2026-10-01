// The support catalog is the one place a support's classification is decided.
//
// The brief's non-negotiable: accommodations (access) and modifications (a
// different learning expectation) are never silently combined. These tests pin
// the classifications the teacher UI has always stored, the two
// reduced-item-count meanings, and that nothing a student sees names a
// disability program.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORT_CATALOG, SUPPORT_CLASSIFICATION, SUPPORT_AUTOMATION, SUPPORT_CATEGORY,
  QUICK_ACTION_SUPPORT_IDS, INCLUSION_IMPLIED_SUPPORT_IDS,
  supportById, canonicalSupportId, isAccommodation, isModification, isService,
  quickActions, serviceTypes, studentFacingLabel, supportLabel, classifySupportIds,
} from '../../functions/shared/supportCatalog.mjs';

test('reduce-complexity is a MODIFICATION and stays one', () => {
  assert.equal(supportById('reduce-complexity').classification, SUPPORT_CLASSIFICATION.MODIFICATION);
  assert.ok(isModification('reduce-complexity'));
  assert.ok(!isAccommodation('reduce-complexity'));
});

test('fewer items is an accommodation only when TEKS and rigor are preserved', () => {
  assert.ok(isAccommodation('reduced-item-count-same-rigor'));
  assert.ok(isModification('reduced-coverage'));
  // An unqualified "reduced item count" is ambiguous by design and must not be
  // promoted to either one silently.
  assert.equal(supportById('reduced-item-count'), null);
});

test('every id the teacher UI has persisted keeps the classification it was stored under', () => {
  // The option list Students → Supports has always written (App.jsx supportOptions).
  const storedAccommodations = [
    'text-to-speech', 'extra-time', 'visual-chunking', 'calculator', 'calculator-override-computation',
    'high-contrast', 'large-text', 'no-countdown', 'declutter-ui', 'algebra-auto-apply',
  ];
  const storedModifications = ['reduce-complexity', 'prefill-first-step'];
  storedAccommodations.forEach((id) => {
    assert.equal(canonicalSupportId(id), id, `${id} keeps its exact stored spelling`);
    assert.ok(isAccommodation(id), `${id} is an accommodation`);
  });
  storedModifications.forEach((id) => {
    assert.equal(canonicalSupportId(id), id);
    assert.ok(isModification(id), `${id} is a modification`);
  });
});

test('the algebra shortcut stays an accommodation but is flagged as affecting independence evidence', () => {
  const entry = supportById('algebra-auto-apply');
  assert.equal(entry.classification, SUPPORT_CLASSIFICATION.ACCOMMODATION);
  assert.equal(entry.affectsIndependence, true);
  assert.equal(supportById('text-to-speech').affectsIndependence, false);
});

test('catalog entries are well formed and unique', () => {
  const ids = new Set();
  SUPPORT_CATALOG.forEach((entry) => {
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.ok(Object.values(SUPPORT_CLASSIFICATION).includes(entry.classification), entry.id);
    assert.ok(Object.values(SUPPORT_AUTOMATION).includes(entry.automation), entry.id);
    assert.ok(Object.values(SUPPORT_CATEGORY).includes(entry.category), entry.id);
    assert.ok(entry.evidence.length > 0, `${entry.id} names how it can be evidenced`);
    assert.ok(Object.isFrozen(entry));
    // A modification is never offered to the student as a tool.
    if (entry.classification === SUPPORT_CLASSIFICATION.MODIFICATION) assert.equal(entry.studentLabel, null, entry.id);
    // Only a platform feature can produce a student "use".
    if (entry.evidence.includes('used')) assert.equal(entry.automation, SUPPORT_AUTOMATION.PLATFORM_AVAILABLE, entry.id);
  });
});

test('nothing a student sees names a program, a label or a modification', () => {
  const forbidden = /\b(iep|504|sped|mod|modif\w*|inclusion|accommodat\w*|special\s*ed\w*|disab\w*)\b/i;
  SUPPORT_CATALOG.forEach((entry) => {
    const label = studentFacingLabel(entry.id);
    if (label) assert.doesNotMatch(label, forbidden, `${entry.id}: "${label}"`);
  });
  // No fallback to the teacher label, which may say "modified".
  assert.equal(studentFacingLabel('reduce-complexity'), null);
  assert.equal(studentFacingLabel('extra-time'), null);
  assert.equal(studentFacingLabel('text-to-speech'), 'Read aloud');
});

test('the one-click classroom actions are the seven the brief lists, in order', () => {
  assert.deepEqual(quickActions().map((entry) => entry.quickAction), [
    'Checked understanding',
    'Re-explained directions',
    'Provided reteach',
    'Gave feedback',
    'On-task prompt',
    'Provided supplemental aid',
    'Inclusion support present',
  ]);
  assert.equal(QUICK_ACTION_SUPPORT_IDS.length, 7);
  QUICK_ACTION_SUPPORT_IDS.forEach((id) => assert.equal(supportById(id).automation, SUPPORT_AUTOMATION.MANUAL));
});

test('services are their own classification and are the only loggable minutes', () => {
  assert.ok(isService('inclusion-support'));
  assert.ok(serviceTypes().length >= 3);
  serviceTypes().forEach((entry) => assert.equal(entry.classification, SUPPORT_CLASSIFICATION.SERVICE));
});

test('aliases resolve, unknown ids stay visible rather than disappearing', () => {
  assert.equal(canonicalSupportId('TTS'), 'text-to-speech');
  assert.equal(canonicalSupportId('extended-time'), 'extra-time');
  assert.equal(supportLabel('something-new'), 'something-new');
  assert.deepEqual(classifySupportIds(['text-to-speech', 'reduce-complexity', 'inclusion-support', 'mystery', 'tts']), {
    accommodations: ['text-to-speech'],
    modifications: ['reduce-complexity'],
    services: ['inclusion-support'],
    unknown: ['mystery'],
  });
});

test('inclusion status implies exactly the presentation supports it has always switched on', () => {
  assert.deepEqual([...INCLUSION_IMPLIED_SUPPORT_IDS].sort(), [
    'declutter-ui', 'disable-idle-timer', 'high-contrast', 'large-text', 'no-countdown', 'visual-chunking',
  ]);
  INCLUSION_IMPLIED_SUPPORT_IDS.forEach((id) => assert.ok(isAccommodation(id), id));
});
