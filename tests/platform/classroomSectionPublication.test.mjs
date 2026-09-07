import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  publicationDocumentId,
  normalizePublicationSectionKey,
  publicationSectionLabel,
} = require('../../functions/lib/publication.js');

test('whole-assignment publication keeps the legacy deterministic document id', () => {
  const legacy = publicationDocumentId('assignment-1', 'course-1');
  assert.equal(publicationDocumentId('assignment-1', 'course-1', 'whole'), legacy);
  assert.equal(publicationDocumentId('assignment-1', 'course-1', null), legacy);
});

test('each section gets its own deterministic Classroom publication id', () => {
  const whole = publicationDocumentId('assignment-1', 'course-1', 'whole');
  const warmup = publicationDocumentId('assignment-1', 'course-1', 'warmup');
  const classwork = publicationDocumentId('assignment-1', 'course-1', 'classwork');
  const practice = publicationDocumentId('assignment-1', 'course-1', 'practice');
  const dol = publicationDocumentId('assignment-1', 'course-1', 'dol');

  assert.equal(new Set([whole, warmup, classwork, practice, dol]).size, 5);
  assert.equal(publicationDocumentId('assignment-1', 'course-1', 'practice'), practice);
});

test('section keys are fail-closed and have student/teacher-facing labels', () => {
  assert.equal(normalizePublicationSectionKey(' WarmUp '), 'warmup');
  assert.equal(normalizePublicationSectionKey('CLASSWORK'), 'classwork');
  assert.equal(normalizePublicationSectionKey('practice'), 'practice');
  assert.equal(normalizePublicationSectionKey('dol'), 'dol');
  assert.equal(normalizePublicationSectionKey('whole'), 'whole');
  assert.equal(normalizePublicationSectionKey('not-a-section'), 'whole');

  assert.equal(publicationSectionLabel('warmup'), 'Warm-Up');
  assert.equal(publicationSectionLabel('classwork'), 'Classwork');
  assert.equal(publicationSectionLabel('practice'), 'Practice');
  assert.equal(publicationSectionLabel('dol'), 'DOL');
  assert.equal(publicationSectionLabel('whole'), 'Whole assignment');
});
