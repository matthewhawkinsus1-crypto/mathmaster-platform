import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PATH_ANALYSIS_INTERVAL_KINDS, PATH_ANALYSIS_NOTATION_KINDS, PATH_ANALYSIS_POINT_FEATURES,
  analysisKeypadProfile,
} from '../../functions/shared/pathToolContracts.mjs';

// An analysis part's `kind` has to mean what the part asks.
//
// It did not. Every one of the 24 analysis requests in the seed bank was filed
// as `increasing`, `decreasing` or `constant` — including "What is the slope of
// this line?", "What is the domain of this function?" and "Does this parabola
// open upward or downward?". The field passed validation because validation
// only checked membership in a list, never agreement with the question.
//
// It was not cosmetic. The workspace picks the answer keypad from the kind, so
// a student answering "What is the slope?" was handed ( ) [ ] ∞ ∪.
//
// This test reads the labels and holds the kinds to them.

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(here, '../../functions/seeds/pathQuestionBank');

const seedQuestions = readdirSync(SEED_DIR).filter((name) => name.endsWith('.json')).flatMap((name) => {
  const parsed = JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'));
  return (Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []))
    .map((question) => ({ ...question, __seedFile: name }));
});

// What a label announces it is asking for. Only confident readings appear here:
// a label this cannot classify is left alone rather than guessed at.
const KIND_FROM_LABEL = [
  [/\bdomain\b/i, 'domain'],
  [/\brange\b/i, 'range'],
  [/interval.*increas|where.*increas|increasing\b/i, 'increasing'],
  [/interval.*decreas|where.*decreas|decreasing\b/i, 'decreasing'],
];

const analysisPartsInBank = seedQuestions.flatMap((question) => (question.analysisRequests || [])
  .map((part) => ({ ...part, questionId: question.id, seedFile: question.__seedFile })));

test('the seed bank actually has analysis parts to check', () => {
  assert.ok(analysisPartsInBank.length >= 20, `only ${analysisPartsInBank.length} analysis parts found`);
});

test('every analysis kind is one the renderer knows', () => {
  const bad = analysisPartsInBank.filter((part) => {
    const kind = String(part.kind || '');
    if (PATH_ANALYSIS_NOTATION_KINDS.includes(kind)) return false;
    return !(kind === 'point' && PATH_ANALYSIS_POINT_FEATURES.includes(String(part.feature || '')));
  });
  assert.deepEqual(bad.map((part) => `${part.questionId}/${part.id}: ${part.kind}`), []);
});

test('an analysis kind agrees with the question its label asks', () => {
  const disagreements = [];
  analysisPartsInBank.forEach((part) => {
    const label = String(part.label || '');
    const expected = KIND_FROM_LABEL.find(([pattern]) => pattern.test(label))?.[1];
    if (!expected) return;
    if (String(part.kind || '') !== expected) {
      disagreements.push(`${part.questionId}/${part.id}: label asks for ${expected}, kind says ${part.kind}`);
    }
  });
  assert.deepEqual(disagreements, []);
});

test('a short answer is not filed as an interval question', () => {
  // "What is the slope?" is a value. Filing it under an interval kind is what
  // put an interval keypad in front of it.
  const intervalWords = /\binterval\b|\bdomain\b|\brange\b|increas|decreas|\bconstant\b|\bpositive\b|\bnegative\b/i;
  const wrong = analysisPartsInBank
    .filter((part) => PATH_ANALYSIS_INTERVAL_KINDS.includes(String(part.kind || '')))
    .filter((part) => !intervalWords.test(String(part.label || '')))
    .map((part) => `${part.questionId}/${part.id}: "${part.label}" filed as ${part.kind}`);
  assert.deepEqual(wrong, []);
});

test('an answer written as an inequality asks for the inequality keypad', () => {
  const mismatched = analysisPartsInBank
    .filter((part) => [...(part.expected || []), ...(part.acceptedAnswers || [])]
      .some((value) => /[<>]=?|≤|≥/.test(String(value))))
    .filter((part) => part.notation !== 'inequality')
    .map((part) => `${part.questionId}/${part.id}`);
  assert.deepEqual(mismatched, []);
});

test('`value` is renderable but never routes to the interval keypad', () => {
  assert.equal(PATH_ANALYSIS_NOTATION_KINDS.includes('value'), true);
  assert.equal(PATH_ANALYSIS_INTERVAL_KINDS.includes('value'), false);
});

test('the keypad follows what the part is asking for', () => {
  assert.equal(analysisKeypadProfile({ kind: 'value' }), 'basic', 'a slope is not an interval');
  assert.equal(analysisKeypadProfile({ kind: 'domain' }), 'interval');
  assert.equal(analysisKeypadProfile({ kind: 'increasing' }), 'interval');
  // An explicit notation from the author always wins over the kind.
  assert.equal(analysisKeypadProfile({ kind: 'domain', notation: 'inequality' }), 'inequality');
  assert.equal(analysisKeypadProfile({ kind: 'value', notation: 'set' }), 'set');
  assert.equal(analysisKeypadProfile({ kind: 'value', notation: 'interval' }), 'interval');
  // An unknown kind is a short answer, not an interval — failing open to the
  // interval pad is what produced the original bug.
  assert.equal(analysisKeypadProfile({}), 'basic');
  assert.equal(analysisKeypadProfile({ kind: 'somethingNew' }), 'basic');
});

test('every analysis part in the bank now gets a sensible keypad', () => {
  const surprises = analysisPartsInBank
    .map((part) => ({ part, keypad: analysisKeypadProfile(part) }))
    // A short-answer question handed the interval pad is the original defect.
    .filter(({ part, keypad }) => keypad === 'interval' && !/\bdomain\b|\brange\b|interval|increas|decreas/i.test(String(part.label || '')))
    .map(({ part, keypad }) => `${part.questionId}/${part.id}: "${part.label}" -> ${keypad}`);
  assert.deepEqual(surprises, []);
});
