/*
 * READ ALOUD STAYS QUICK ON A VERY LONG BOX.
 *
 * A box can hold up to 16,000 characters (a restored draft is cut to
 * MAX_DRAFT_TEXT_LENGTH), and the screens that show a typed value read it
 * aloud on every render: MathDisplay's spoken copy (mathSpeechLabel), a
 * control's name (spokenMathLabel), Read aloud itself (speechTextFor). Many of
 * read aloud's patterns tried a long run again from each of its characters,
 * or re-read the whole text before every mark, so the time grew with the
 * square of the length: a box of digits, dots, primes, slashes or brackets
 * took up to 3.5 s in node, on every keystroke (the November build's
 * handoff, section 6). Each is now read once.
 *
 * The first test reads a whole box of each kind of run that was slowest,
 * through each reader: on the build before this change 68 of its 92 readings
 * took 0.17 to 3.5 s in node, and the slowest now takes about 30 ms. The
 * spoken text did not change: every input the speech tests use, a corpus of
 * 20,120 generated texts and a differential fuzz read the same, character
 * for character, before and after (the commit says how).
 *
 * The second reads boxes of many short pieces, which stay busy. The last two
 * hold the two matchers that replace span expressions for Read aloud to those
 * expressions, on random text: they must find exactly the same spans.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as speechText from '../../src/platform/language/speechText.js';
import * as mathSafeText from '../../src/platform/language/mathSafeText.js';
import { mathSpeechLabel, spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { MAX_DRAFT_TEXT_LENGTH } from '../../src/tools/shared/toolDraftShape.js';

const BUDGET_MS = 100;
const box = (unit) => unit.repeat(Math.ceil(MAX_DRAFT_TEXT_LENGTH / unit.length)).slice(0, MAX_DRAFT_TEXT_LENGTH);

// What a student may fill a box with, each one of the runs that was slowest.
const LONG_BOXES = Object.freeze({
  'a long number': '7',
  decimals: '0.5',
  'a run of letters': 'x',
  dots: '...',
  'an ellipsis': '…',
  primes: "f'",
  'prime marks': '′',
  'superscript letters': 'ˣ',
  'superscript digits': '⁴',
  hats: 'ŷ',
  subscripts: 'x₁',
  'opening brackets': '(',
  'square brackets': '[',
  'closing brackets': ')',
  slashes: '/',
  'words and slashes': 'a/b/',
  spaces: '  ',
  'LaTeX openings': '\\(',
  'escaped dollars': '\\$',
  'exclamation marks': '!',
  'full stops': '.',
  dashes: '—',
  apostrophes: '’',
});
const READERS = Object.freeze({
  mathToSpeech: (text) => speechText.mathToSpeech(text),
  speechTextFor: (text) => speechText.speechTextFor(text),
  spokenMathLabel: (text) => spokenMathLabel(text),
  mathSpeechLabel: (text) => mathSpeechLabel({ value: text }),
});

// The fastest of three readings: a busy machine slows one, not all three.
// When all three are over the budget but within four times it, up to five
// more are read: a machine kept busy for seconds (a test run beside browser
// journeys on four cores) slows three readings in a row, and one quiet slice
// is enough. A reader that is really slow still fails: no reading comes in
// under the budget, and one over four times it stops at once.
const fastest = (read, text, budget = BUDGET_MS) => {
  let best = Infinity;
  for (let round = 0; round < (best > budget ? 8 : 3) && best > budget / 4; round += 1) {
    const started = performance.now();
    read(text);
    best = Math.min(best, performance.now() - started);
    if (best > budget * 4) break;
  }
  return best;
};

test(`a ${MAX_DRAFT_TEXT_LENGTH.toLocaleString('en-US')}-character box is read aloud in well under ${BUDGET_MS} ms`, (t) => {
  assert.equal(MAX_DRAFT_TEXT_LENGTH, 16000);
  const slow = [];
  let slowest = 0;
  for (const [name, unit] of Object.entries(LONG_BOXES)) {
    const text = box(unit);
    assert.equal(text.length, MAX_DRAFT_TEXT_LENGTH);
    for (const [reader, read] of Object.entries(READERS)) {
      const ms = fastest(read, text);
      slowest = Math.max(slowest, ms);
      if (ms >= BUDGET_MS) slow.push(`${reader}: ${name} took ${Math.round(ms)} ms`);
    }
  }
  t.diagnostic(`slowest reading: ${slowest.toFixed(1)} ms`);
  assert.deepEqual(slow, []);
});

// Boxes of many short pieces of mathematics, each read on its own: linear, but
// still busy (0.04 to 0.2 s here). They took 0.7 to 8 s before (a list of
// arrows re-read every arrow of its sentence for every arrow; a root after
// each letter copied all that was read before it, at every root).
const BUSY_BOXES = Object.freeze({ 'a list of arrows': 'A→B, ', 'a mapping list': 'S1 → P1, ', 'a root after each letter': 'x√' });
const BUSY_BUDGET_MS = 500;

test(`a ${MAX_DRAFT_TEXT_LENGTH.toLocaleString('en-US')}-character box of arrows or roots is read aloud in under half a second`, (t) => {
  const slow = [];
  let slowest = 0;
  for (const [name, unit] of Object.entries(BUSY_BOXES)) {
    const text = box(unit);
    for (const [reader, read] of Object.entries(READERS)) {
      const ms = fastest(read, text, BUSY_BUDGET_MS);
      slowest = Math.max(slowest, ms);
      if (ms >= BUSY_BUDGET_MS) slow.push(`${reader}: ${name} took ${Math.round(ms)} ms`);
    }
  }
  t.diagnostic(`slowest reading: ${slowest.toFixed(1)} ms`);
  assert.deepEqual(slow, []);
});

// Short random texts of the characters spans are made of.
const randomTexts = (count, alphabet, seed) => {
  let state = seed;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  return Array.from({ length: count }, () => {
    let text = '';
    const length = 1 + Math.floor(random() * 22);
    for (let index = 0; index < length; index += 1) text += alphabet[Math.floor(random() * alphabet.length)];
    return text;
  });
};
const SPAN_ALPHABET = ['$', '$', '\\', '(', ')', '[', ']', '{', '}', '{{', '}}', '\n', '\r', ' ', 'x', ' ', '$$', '\\(', '\\)', '\\[', '\\]', '\\$', '5', ','];

test('latexSpans finds exactly the spans LATEX_SPAN matches', () => {
  assert.equal(typeof speechText.latexSpans, 'function');
  for (const text of randomTexts(20000, SPAN_ALPHABET, 17)) {
    const want = [...text.matchAll(speechText.LATEX_SPAN)].map((match) => [match.index, match[0]]);
    assert.deepEqual(speechText.latexSpans(text).map((span) => [span.index, span[0]]), want, JSON.stringify(text));
  }
});

test('speechSpans finds exactly the spans DELIMITED_SPEECH matches, after a span turned down too', () => {
  assert.equal(typeof speechText.speechSpans, 'function');
  // As segmentMathText collects them: a span its check turns down is passed
  // over, and the search goes on from the character after its start.
  const collect = (pattern, text, keep) => {
    const out = [];
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      out.push([match.index, match[0], pattern.lastIndex]);
      if (!keep(match.index, match[0])) pattern.lastIndex = match.index + 1;
    }
    out.push(pattern.lastIndex);
    return out;
  };
  randomTexts(20000, SPAN_ALPHABET, 29).forEach((text, number) => {
    const keep = (start, value) => (start * 31 + value.length + number) % 3 !== 0;
    assert.deepEqual(collect(speechText.speechSpans(text), text, keep), collect(mathSafeText.DELIMITED_SPEECH, text, keep), JSON.stringify(text));
  });
});
