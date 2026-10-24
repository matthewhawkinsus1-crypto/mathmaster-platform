/*
 * A SECURE INEQUALITY'S ANSWER CAN BE TYPED ON A PHONE (TS04).
 *
 * A secure field's math editor opens no phone keyboard: its keypad is the
 * keyboard. An inequality's letter keys came only from the prompt's
 * mathematics, so a key in a letter the prompt never writes in $…$ had no
 * key: y for a range beside f(x), y against x under a table or a graph, and
 * h, C or v named only in words. The keypad now also has x and y on every
 * inequality, and the letters the field's own label names
 * (secureAnswerEntry.js inequalityLetters). It still never reads the key.
 *
 * The bank test draws every family the secure runtime can issue — the
 * built-in Path seeds a simulation or a course Test falls back to, and the
 * secure-assessment seed — the way the server issues it
 * (mathPath.instantiateQuestion, then buildSanitizedQuestion), and checks
 * that every letter of every typed inequality key has a key on the keypad
 * that field gets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  EVERY_INEQUALITY_LETTER, SECURE_PROFILE_KEYS, inequalityLetters, secureAnswerEntryFor,
} from '../../src/platform/assessment/secureAnswerEntry.js';
import { normalizeInteractionInputProfile } from '../../src/platform/interaction/interactionContract.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const PROFILE_LABELS = new Set(SECURE_PROFILE_KEYS.inequality.map((key) => key.label));
const letterKeys = (entry) => entry.keys.map((key) => key.label).filter((label) => !PROFILE_LABELS.has(label));

test('every inequality keypad has x and y, beside the letters the student reads', () => {
  assert.deepEqual([...EVERY_INEQUALITY_LETTER], ['x', 'y']);
  // A range written in y, beside a function of x (mm_A2_7I range items).
  assert.deepEqual(
    letterKeys(secureAnswerEntryFor({ inputProfile: 'inequality', label: 'Range — inequality' }, { prompt: 'The quadratic $q(x)=3(x-1)^2-4$ opens upward. Write its range.' })),
    ['q', 'x', 'y'],
  );
  // A boundary line shown only in a table: the prompt writes no mathematics.
  assert.deepEqual(
    letterKeys(secureAnswerEntryFor({ inputProfile: 'inequality', label: 'Inequality' }, { prompt: 'The table lists points on the boundary. Write the inequality in slope-intercept form.' })),
    ['x', 'y'],
  );
  // The prompt's own letters come first, as before.
  assert.deepEqual(letterKeys(secureAnswerEntryFor({ inputProfile: 'inequality' }, { prompt: 'Let $h$ be the height and $t$ the time.' })), ['h', 't', 'x', 'y']);
  // No other profile gets letters.
  for (const profile of ['number', 'set', 'interval', 'orderedPair']) {
    assert.deepEqual(secureAnswerEntryFor({ inputProfile: profile, label: 'Range of C' }, { prompt: 'Solve $2h+5 \\le 9$.' }).keys.filter((key) => /^[A-Za-z]$/.test(key.label)), [], profile);
  }
});

test('the letters a field\'s label names are keys: "Range of C", "Reasonable domain of h"', () => {
  const prompt = 'A service charges 30 dollars plus 2 dollars per hour for 0 through 2 hours. Write the reasonable domain of h and the range of C as inequalities.';
  assert.deepEqual(letterKeys(secureAnswerEntryFor({ inputProfile: 'inequality', label: 'Reasonable domain of h' }, { prompt })), ['h', 'x', 'y']);
  assert.deepEqual(letterKeys(secureAnswerEntryFor({ inputProfile: 'inequality', label: 'Range of C' }, { prompt })), ['C', 'x', 'y']);
  assert.deepEqual(letterKeys(secureAnswerEntryFor({ inputProfile: 'inequality', label: 'Physical restriction on v' }, { prompt })), ['v', 'x', 'y']);
  // A label's mathematics counts too.
  assert.deepEqual(inequalityLetters({ prompt: '', label: 'Domain of $g(t)$' }), ['g', 't', 'x', 'y']);
  // "a", "A" and "I" in words are words; a letter inside a word is not a letter.
  assert.deepEqual(inequalityLetters({ prompt: '', label: 'A compound inequality I would write as a range' }), ['x', 'y']);
  assert.deepEqual(inequalityLetters({ prompt: '', label: "Student's answer, part b" }), ['b', 'x', 'y']);
  // Each letter once.
  assert.deepEqual(inequalityLetters({ prompt: 'Solve $y < 2x$.', label: 'y in terms of x' }), ['y', 'x']);
});

const NOT_LETTERS = new Set(['and', 'or', 'pi', 'inf', 'oo', 'abs', 'sqrt', 'cbrt', 'root', 'log', 'ln', 'sin', 'cos', 'tan', 'exp']);
/** The variables a key is written in: single letters, never a word or a function name. */
const keyLetters = (key) => {
  const body = String(key ?? '')
    .replace(/\\(?:text|mathrm|operatorname|textbf|mbox)\s*\{[^{}]*\}/g, ' ')
    .replace(/\\[A-Za-z]+/g, ' ');
  const letters = [];
  for (const run of body.match(/[A-Za-z]+/g) || []) {
    if (NOT_LETTERS.has(run.toLowerCase())) continue;
    assert.ok(run.length <= 3, `a key holds the word "${run}": read it here before counting its letters`);
    for (const letter of run) if (!letters.includes(letter)) letters.push(letter);
  }
  return letters;
};

const seedFiles = () => {
  const bank = new URL('../../functions/seeds/pathQuestionBank/', import.meta.url);
  const secure = new URL('../../functions/seeds/secureAssessments/', import.meta.url);
  return [
    ...readdirSync(bank).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).map((name) => new URL(name, bank)),
    ...readdirSync(secure).filter((name) => name.endsWith('.json')).map((name) => new URL(name, secure)),
  ];
};

test('every typed inequality key in the secure banks can be typed on its phone keypad', async () => {
  let fields = 0;
  const untypeable = [];
  for (const file of seedFiles()) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const documents = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    for (const item of documents) {
      if (item?.active === false) continue;
      for (let draw = 0; draw < 3; draw += 1) {
        // eslint-disable-next-line no-await-in-loop
        const question = (await mathPath.instantiateQuestion(item, `ts04-keypad-${draw}`))?.question;
        if (!question) continue;
        const issued = mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'q' });
        issued.responseFields.forEach((field, index) => {
          if (normalizeInteractionInputProfile(field.inputProfile) !== 'inequality') return;
          // A field answered by choosing is not typed.
          if (field.choices?.length || (issued.responseFields.length === 1 && issued.choices.length)) return;
          fields += 1;
          const raw = question.responseFields[index] || {};
          const keys = letterKeys(secureAnswerEntryFor(field, { prompt: issued.prompt }));
          const missing = keyLetters(raw.expected ?? raw.answer).filter((letter) => !keys.includes(letter));
          if (missing.length) untypeable.push(`${item.id} ${field.id}: ${missing.join(', ')} (keys ${keys.join(', ')})`);
        });
      }
    }
  }
  assert.ok(fields > 50, `the banks hold typed inequality fields to check (found ${fields})`);
  assert.deepEqual([...new Set(untypeable)], [], 'a letter of the key has no key on the phone keypad');
});
