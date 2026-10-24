import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');

/*
 * JOB K FOLLOW-UP — two CCMR prompts the bank verifier flagged, fixed in
 * drafts/ccmr-v2.1 and regenerated into the shipped mirrors. Read from the
 * functions/seeds mirror (what the Path ships), drawn the way the Path draws.
 *
 * CT19 adds the same fix for two more A2.4G items that printed "where q<b<p":
 * the letters are the generator's names for the numbers, never defined for a
 * student.
 */

const bank = (framework) => JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`, import.meta.url), 'utf8')).documents;
const draws = (framework, id, count = 8) => {
  const item = bank(framework).find((entry) => entry.id === id);
  assert.ok(item, id);
  return Array.from({ length: count }, (_, draw) => generatePathInstanceWithRetries(
    compilePathRecordForStorage({ ...item, active: item.active !== false }).document,
    `k-follow-ccmr-content-${draw}`,
    4,
  ).question);
};
// Unescaped single dollars, the inline-TeX delimiters.
const inlineMath = (text) => String(text).match(/(?<!\\)\$(?:\\.|[^$\\])*?(?<!\\)\$/g) || [];

test('A2.4G context-time verification does not show its generator constraint p < c < q as mathematics', () => {
  for (const question of draws('digitalSAT', 'mm_sat_A2_4G_challenge_context-time-verification_v21')) {
    // Every inline expression the student sees is about t and numbers only:
    // p, c and q are the generator's names for the numbers, never shown.
    for (const segment of inlineMath(question.prompt)) {
      const letters = segment.replace(/\\[A-Za-z]+/g, '').match(/[A-Za-z]/g) || [];
      assert.deepEqual([...new Set(letters)].filter((letter) => letter !== 't'), [], `${segment} in "${question.prompt}"`);
    }
  }
});

test('TSIA2 rental-fee expression item does not open TeX with a currency dollar sign', () => {
  for (const question of draws('tsia2', 'mm_tsia2_qr_leei_4_v21')) {
    const dollars = String(question.prompt).match(/(?<!\\)\$/g) || [];
    assert.equal(dollars.length % 2, 0, question.prompt);
    // The only mathematics in the stem is the two variables.
    assert.deepEqual(inlineMath(question.prompt), ['$C$', '$h$'], question.prompt);
  }
});

// CT19: two Digital SAT items squared a radical equation and then said "where
// q<b<p". p, q and b are the generator's names for the two roots and the
// number subtracted; the student is shown the numbers, so the letters were
// never defined anywhere they could read. The roots are printed as numbers and
// nothing else is needed to find the extraneous one.
const SQUARED_RADICAL_ITEMS = Object.freeze([
  'mm_sat_A2_4G_challenge_general-scaled-radicand_v21',
  'mm_sat_A2_4G_why-invalid-decreasing-radicand_v21',
]);
const printedRoots = (prompt) => [...String(prompt).matchAll(/\$x=(-?\d+)\$/g)].map((match) => Number(match[1]));
const keyedLabel = (question) => question.choices.find((choice) => choice.id === question.responseFields[0].expected).label;

test('A2.4G squared-radical items print the roots as numbers, never the letters q, b and p', () => {
  for (const id of SQUARED_RADICAL_ITEMS) {
    for (const question of draws('digitalSAT', id, 24)) {
      // Every inline expression is about x and numbers only.
      for (const segment of inlineMath(question.prompt)) {
        const letters = segment.replace(/\\[A-Za-z]+/g, '').match(/[A-Za-z]/g) || [];
        assert.deepEqual([...new Set(letters)].filter((letter) => letter !== 'x'), [], `${segment} in "${question.prompt}"`);
      }
    }
  }
});

test('A2.4G squared-radical items: the stem still names two roots and the key is still the one below the subtracted number', () => {
  for (const question of draws('digitalSAT', SQUARED_RADICAL_ITEMS[0], 24)) {
    const [larger, smaller, ...rest] = printedRoots(question.prompt);
    assert.equal(rest.length, 0, question.prompt);
    assert.ok(smaller < larger, question.prompt);
    // "What is the extraneous root?": the smaller root, the one under b.
    assert.equal(Number(keyedLabel(question)), smaller, question.prompt);
  }
  for (const question of draws('digitalSAT', SQUARED_RADICAL_ITEMS[1], 24)) {
    const [larger, smaller, rejected, ...rest] = printedRoots(question.prompt);
    assert.equal(rest.length, 0, question.prompt);
    assert.ok(smaller < larger, question.prompt);
    // "Why must x = (the smaller root) be rejected?": the right side is negative there.
    assert.equal(rejected, smaller, question.prompt);
    assert.match(keyedLabel(question), new RegExp(`^At \\$x=${smaller}\\$, the right side .* is negative`), question.prompt);
  }
});

// An ordering of three bare letters ("q<b<p", "p<c<q") that a student can read
// is the generator's constraint on its own numbers, printed by mistake. Tokens
// such as {{p}}<{{c}} are filled with numbers, and the strings the generator
// computes (generator.*) are code, so neither counts.
const LETTER = String.raw`(?<![A-Za-z\\])[A-Za-z](?![A-Za-z])`;
const ORDER = String.raw`(?:<|>|\\le(?:q)?(?![A-Za-z])|\\ge(?:q)?(?![A-Za-z]))`;
const LETTER_CHAIN = new RegExp(`${LETTER}\\s*${ORDER}\\s*${LETTER}\\s*${ORDER}\\s*${LETTER}`);
const bankDocuments = () => {
  const directory = new URL('../../functions/seeds/pathQuestionBank/', import.meta.url);
  return readdirSync(directory)
    .filter((file) => file.endsWith('_pathQuestionBank_seed.json'))
    .flatMap((file) => JSON.parse(readFileSync(new URL(file, directory), 'utf8')).documents.map((doc) => ({ file, doc })));
};
const studentStrings = (value, trail = '') => {
  if (typeof value === 'string') return [[trail, value]];
  if (Array.isArray(value)) return value.flatMap((entry, index) => studentStrings(entry, `${trail}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => key !== 'generator')
      .flatMap(([key, entry]) => studentStrings(entry, trail ? `${trail}.${key}` : key));
  }
  return [];
};

test('the letter-chain check reads a bare ordering and nothing else', () => {
  for (const text of ['where $q<b<p$.', 'with $p<c<q$.', '$x < y < z$', '$a\\le b\\le c$']) assert.match(text, LETTER_CHAIN, text);
  for (const text of ['$0<x<5$', '$a>b$', '$x<4$', 'where {{q}}<{{b}}<{{p}}', '$\\le$ and $<$ and $>$', 'p < q is a word problem']) {
    assert.doesNotMatch(text, LETTER_CHAIN, text);
  }
});

test('no student-visible string in any bank prints an ordering of three bare letters', () => {
  const documents = bankDocuments();
  assert.ok(documents.length > 3000, `${documents.length} bank documents read`);
  const found = documents.flatMap(({ file, doc }) => studentStrings(doc)
    .filter(([, text]) => LETTER_CHAIN.test(text))
    .map(([trail, text]) => `${file} ${doc.id} ${trail}: ${text.slice(0, 120)}`));
  assert.deepEqual(found, []);
});
