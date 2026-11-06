// A LINE BREAK THE AUTHOR WROTE (platform-polish-3; F-PROMPT-LINES in the
// 2026-11-06 Algebra I M3 T2 walkthrough).
//
// The task card showed a prompt as one paragraph, so a prompt written as a
// list ran together: "…System A: y = 3x − 2 and 6x − 2y = a System B: …",
// the parameter a running into the next label, and an error analysis's
// steps as one line. Read aloud ran them together too. Now each authored
// line is a line on the card (QuestionPrompt, promptLines.js), and Read aloud
// pauses there (speechText.js lineBreaksAsPauses). A prompt with no line
// break is drawn and read as before.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proseLines, withoutOuterLineBreaks } from '../../src/components/common/promptLines.js';
import { lineBreaksAsPauses, speechTextFor } from '../../src/platform/language/speechText.js';
import { questionReadingParts } from '../../src/platform/language/questionReading.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SYSTEMS = 'Honors — Parameters decide the case. Use substitution with a letter in place of a number.\nSystem A:  y = 3x − 2  and  6x − 2y = a\nSystem B:  kx + 2y = 7  and  y = −2x + 1';

test('the task card draws each authored line as a line, and a run of breaks as one', () => {
  assert.deepEqual(proseLines(SYSTEMS), [
    'Honors — Parameters decide the case. Use substitution with a letter in place of a number.',
    'System A:  y = 3x − 2  and  6x − 2y = a',
    'System B:  kx + 2y = 7  and  y = −2x + 1',
  ]);
  // A blank line (bank items put one around a table or a list of choices) is
  // one break, never an empty line; the spaces around a break go with it.
  assert.deepEqual(proseLines('Which equation defines f? \n\n  Type A, B, C, or D.'), ['Which equation defines f?', 'Type A, B, C, or D.']);
  // A break at either end of the prompt draws nothing.
  assert.equal(withoutOuterLineBreaks('\n\nSolve the system.\n'), 'Solve the system.');
  // A prompt with no line break is the same text, spaces and all.
  for (const text of ['Solve 2x + 3 = 7.', '  Graph y = 2x.  ', '']) {
    assert.deepEqual(proseLines(text), [text]);
    assert.equal(withoutOuterLineBreaks(text), text);
  }
});

test('QuestionPrompt breaks the line where the prose has one, and nowhere else', () => {
  const source = executableSource(readFileSync(path.join(ROOT, 'src/QuestionPrompt.jsx'), 'utf8'));
  // The prompt loses only the breaks at its ends…
  assert.match(source, /const text = withoutOuterLineBreaks\(studentSafePromptText\(children\)\);/);
  // …and every prose run is drawn with its own line breaks as <br />.
  const helper = region(source, 'const withLineBreaks', 'export default function QuestionPrompt', 'the line-break helper');
  assert.match(helper, /const lines = proseLines\(text\);/);
  assert.match(helper, /if \(lines\.length === 1\) return text;/);
  assert.match(helper, /<br key=/);
  const prose = region(source, 'const fractionRuns = splitProseFractionRuns(segment);', 'const math = unwrapMathSegment(segment);', 'the prose branch');
  assert.match(prose, /\{withLineBreaks\(normalizePlainMathTypography\(run\.text\), `\$\{index\}-p-\$\{runIndex\}`\)\}/);
});

test('Read aloud pauses between authored lines', () => {
  assert.equal(
    speechTextFor(SYSTEMS),
    'Honors — Parameters decide the case. Use substitution with a letter in place of a number. System A: y equals 3x minus 2 and 6x minus 2y equals a. System B: kx plus 2y equals 7 and y equals negative 2x plus 1',
  );
  // An error analysis's steps are heard one by one.
  assert.equal(
    speechTextFor('Error analysis. Malik solved −3x + 4 > 19:\nStep 1:  −3x > 15\nStep 2:  x > −5'),
    'Error analysis. Malik solved negative 3x plus 4 is greater than 19: Step 1: negative 3x is greater than 15. Step 2: x is greater than negative 5',
  );
  // In Spanish too.
  assert.equal(speechTextFor('Sistema A: y = 3x − 2\nSistema B: y = x', { language: 'es' }), 'Sistema A: y es igual a 3x menos 2. Sistema B: y es igual a x');
});

test('a pause is added only where a line has none, and never inside display mathematics', () => {
  // A line that already ends a sentence, a clause or a list item keeps its own stop.
  assert.equal(lineBreaksAsPauses('Solve the system:\ny = 2x,\ny = x + 1.\nThen check.'), 'Solve the system:\ny = 2x,\ny = x + 1.\nThen check.');
  assert.equal(lineBreaksAsPauses('Is it true?\n(A) Yes'), 'Is it true?\n(A) Yes');
  // The last line, blank lines and a break at the end add nothing.
  assert.equal(lineBreaksAsPauses('Line one\n\nLine two\n'), 'Line one.\n\nLine two\n');
  // Display mathematics keeps its own breaks; the line it ends gets the pause.
  assert.equal(lineBreaksAsPauses('Solve\n$$\nx + y = 3\n$$\nfor x'), 'Solve.\n$$\nx + y = 3\n$$.\nfor x');
  // No line break: the same text.
  for (const text of ['Solve 2x + 3 = 7', 'A $4 fee', '']) assert.equal(lineBreaksAsPauses(text), text);
});

test('the whole-question reading pauses between the prompt\'s lines, and the step\'s', () => {
  const [prompt] = questionReadingParts({ prompt: SYSTEMS });
  assert.equal(prompt.text, 'Honors — Parameters decide the case. Use substitution with a letter in place of a number. System A: y = 3x − 2 and 6x − 2y = a. System B: kx + 2y = 7 and y = −2x + 1.');
  const parts = questionReadingParts({ prompt: 'Solve.' }, { stage: { stage: { id: 's1', prompt: 'Name each step:\nStep 1: x + 2 = 5\nStep 2: x = 3' }, index: 0, total: 2 } });
  assert.equal(parts.find((part) => part.kind === 'step').text, 'Step 1 of 2: Name each step: Step 1: x + 2 = 5. Step 2: x = 3.');
});

test('every lesson prompt with a line break is drawn one line per authored line, and read with a pause between them', () => {
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.json')) files.push(full);
  });
  walk(path.join(ROOT, 'teacher-import-jsons'));
  const prompts = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node.prompt === 'string' && node.prompt.includes('\n')) prompts.push(node.prompt);
    Object.values(node).forEach(visit);
  };
  files.forEach((file) => { try { visit(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* not a lesson */ } });
  // Algebra I M3 T1 L1 and L3, M3 T2 L2 Honors, the Algebra II Honors DOL 2 review.
  assert.ok(prompts.length >= 20, `${prompts.length} lesson prompts with a line break`);
  for (const prompt of prompts) {
    const authored = prompt.split('\n').map((line) => line.trim()).filter(Boolean);
    assert.deepEqual(proseLines(withoutOuterLineBreaks(prompt)).map((line) => line.trim()), authored, prompt);
    // Each line but the last ends in a stop in what Read aloud is given.
    const read = lineBreaksAsPauses(prompt).split('\n').map((line) => line.trim()).filter(Boolean);
    read.slice(0, -1).forEach((line) => assert.match(line, /[.;:!?,…][)\]"'”’]*$/u, line));
  }
});
