// A LATEX COMMAND IS SPOKEN WHATEVER FOLLOWS IT (release-candidate QA M4).
//
// speechText.js used to end each command at `\b`. There is no word boundary
// between a letter and a digit, so `C\ge15` was read "C 15", `x\ne4` "x 4" and
// `\pi2` "2": the command fell through to the catch-all that deletes unknown
// commands. MathDisplay hides the typeset math from assistive technology, so
// this text is all a screen reader hears — of a prompt, the student's own
// answer and a review — and Read Aloud speaks it too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';

test('the QA examples are read in full', () => {
  assert.equal(mathToSpeech('C\\ge15'), 'C is greater than or equal to 15');
  assert.equal(mathToSpeech('0\\le h\\le12'), '0 is less than or equal to h is less than or equal to 12');
  assert.equal(mathToSpeech('x\\ne4'), 'x is not equal to 4');
  assert.equal(mathToSpeech('x\\lt7'), 'x is less than 7');
  assert.equal(mathToSpeech('x\\gt7'), 'x is greater than 7');
  assert.equal(mathToSpeech('\\pi2'), 'pi 2');
  // In a prompt, through the same path MathDisplay and Read Aloud use.
  assert.equal(speechTextFor('Solve $C\\ge15$.'), 'Solve C is greater than or equal to 15.');
});

// Every operator-like command the reader names, with words it must produce.
const COMMANDS = [
  ['le', 'is less than or equal to'], ['leq', 'is less than or equal to'],
  ['ge', 'is greater than or equal to'], ['geq', 'is greater than or equal to'],
  ['ne', 'is not equal to'], ['neq', 'is not equal to'],
  ['lt', 'is less than'], ['gt', 'is greater than'],
  ['approx', 'is approximately equal to'], ['cong', 'is congruent to'], ['sim', 'is similar to'],
  ['parallel', 'is parallel to'], ['perp', 'is perpendicular to'],
  ['angle', 'angle'], ['triangle', 'triangle'], ['in', 'is in'],
  ['pm', 'plus or minus'], ['infty', 'infinity'], ['cdot', 'times'], ['times', 'times'], ['div', 'divided by'],
  ['pi', 'pi'], ['theta', 'theta'], ['circ', 'degrees'],
  ['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['ln', 'ln'], ['log', 'log'],
];
const said = (speech, words) => new RegExp(`(?:^| )${words}(?: |$)`).test(speech);

test('every command is spoken when a digit, a space, a brace or the end follows it', () => {
  for (const [name, words] of COMMANDS) {
    for (const [follower, kept] of [['7', '7'], [' 7', '7'], ['{7}', '7'], ['', null]]) {
      const latex = `x\\${name}${follower}`;
      const speech = mathToSpeech(latex);
      assert.ok(said(speech, words), `${latex} → "${speech}" says "${words}"`);
      if (kept) assert.ok(said(speech, kept), `${latex} → "${speech}" keeps ${kept}`);
      assert.doesNotMatch(speech, /\\|[{}]/, `${latex}: no LaTeX survives`);
    }
  }
});

test('a letter after a command name makes it a different command, never the short one', () => {
  // `\piz` is not `\pi` followed by z, and `\lnot` is not `\ln`.
  for (const [name, words] of COMMANDS) {
    const latex = `x\\${name}z 7`;
    const speech = mathToSpeech(latex);
    // `\lez` and the like are no commands: the catch-all drops them; what
    // matters is that the short command's words are not read for them.
    assert.ok(!said(speech, words), `${latex} → "${speech}" does not say "${words}"`);
  }
  assert.equal(mathToSpeech('\\lnot p'), 'p', '\\lnot is not \\ln');
  assert.equal(mathToSpeech('\\pitchfork'), '', '\\pitchfork is not \\pi');
  assert.equal(mathToSpeech('x\\neg y'), 'x y', '\\neg is not \\ne');
  assert.equal(mathToSpeech('x\\leqslant 5'), 'x 5', '\\leqslant is not \\le or \\leq');
  // Longer names the reader does know keep their own reading.
  assert.equal(mathToSpeech('x\\leq5'), 'x is less than or equal to 5');
  assert.equal(mathToSpeech('x\\neq5'), 'x is not equal to 5');
  assert.equal(mathToSpeech('\\infty'), 'infinity', '\\infty is not \\in');
  assert.equal(mathToSpeech('\\left(x\\right)'), 'the quantity x', '\\left is not \\le');
});

test('commands that take an argument also end at a non-letter', () => {
  assert.equal(mathToSpeech('\\sqrt2'), 'the square root of 2');
  assert.equal(mathToSpeech('\\frac12'), '1 over 2');
  assert.equal(mathToSpeech('\\dfrac34'), '3 over 4');
  // `\textbf` is not `\text` with an argument of "b".
  assert.equal(mathToSpeech('\\textbf{Area} = 5'), 'Area equals 5');
  assert.equal(mathToSpeech('\\sin2x'), 'sin 2x');
});
