// READ ALOUD SAYS A PRICE AS MONEY (platform-polish-3; F-READ-PRICES in the
// 2026-11-06 Algebra I M3 T2 walkthrough).
//
// Read aloud took the words between two prices for LaTeX: "$4,890. A
// main-floor seat costs $" and "$10 a week: y = 10x + 40. Isabella deposits $"
// were read as mathematics ("A main minus floor seat costs 5 more"), and the
// prices lost "dollars". A price inside a calculation ("10(6) + 40 = $100",
// "450 × $5") lost it too. The screen keeps these sentences as prose; Read
// aloud now does the same, and a "$" before a number in the mathematics it
// builds from a sentence is a price.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { segmentMathText } from '../../src/platform/language/mathSafeText.js';

const es = { language: 'es' };
const SEATS = 'A theater sold all 120 main-floor seats and all 80 balcony seats for one show and collected $4,890. A main-floor seat costs $5 more than a balcony seat. Let m be the price of a main-floor seat and b be the price of a balcony seat, in dollars.';

test('a price and then words is prose with a price in it, whatever the span holds', () => {
  assert.equal(
    speechTextFor(SEATS),
    'A theater sold all 120 main-floor seats and all 80 balcony seats for one show and collected 4,890 dollars. A main-floor seat costs 5 dollars more than a balcony seat. Let m be the price of a main-floor seat and b be the price of a balcony seat, in dollars.',
  );
  assert.equal(
    speechTextFor('Diego still saves $10 a week: y = 10x + 40. Isabella deposits $4 on Tuesdays and $6 on Saturdays: y = 4x + 6x + 40.'),
    'Diego still saves 10 dollars a week: y equals 10x plus 40. Isabella deposits 4 dollars on Tuesdays and 6 dollars on Saturdays: y equals 4x plus 6x plus 40.',
  );
  assert.equal(
    speechTextFor('Plan A charges a $24 sign-up fee plus $8 per month: y = 8x + 24. Plan B charges an $8 sign-up fee plus $12 per month.'),
    'Plan A charges a 24 dollars sign-up fee plus 8 dollars per month: y equals 8x plus 24. Plan B charges an 8 dollars sign-up fee plus 12 dollars per month.',
  );
  assert.equal(
    speechTextFor('Company A charges $40 plus $0.25 per mile: y = 0.25x + 40. Company B charges $25 plus $0.40 per mile.'),
    'Company A charges 40 dollars plus 25 cents per mile: y equals 0.25x plus 40. Company B charges 25 dollars plus 40 cents per mile.',
  );
  assert.equal(speechTextFor(SEATS, es).includes('collected 4,890 dólares. A main-floor seat costs 5 dólares more'), true);
});

test('a price inside a calculation is money', () => {
  assert.equal(speechTextFor('After 6 weeks each has 10(6) + 40 = $100.'), 'After 6 weeks each has 10 times 6 plus 40 equals 100 dollars.');
  assert.equal(speechTextFor('Every ticket sold is a student ticket: 450 × $5'), 'Every ticket sold is a student ticket: 450 times 5 dollars');
  assert.equal(speechTextFor('Isabella deposits $4 + $6 = $10 a week, the same as Diego.'), 'Isabella deposits 4 dollars plus 6 dollars equals 10 dollars a week, the same as Diego.');
  assert.equal(
    speechTextFor('At 150 miles: A = 0.25(150) + 40 = $77.50 and B = 0.4(150) + 25 = $85.'),
    'At 150 miles: A equals 0.25 times 150 plus 40 equals 77 dollars and 50 cents and B equals 0.4 times 150 plus 25 equals 85 dollars.',
  );
  assert.equal(speechTextFor('450 × $5', es), '450 por 5 dólares');
});

test('LaTeX keeps its reading: a number in $…$, a calculation in $…$, an escaped price, a unit and a list of prices', () => {
  assert.equal(speechTextFor('$7$ is a number'), '7 is a number');
  assert.equal(speechTextFor('Solve $3 + 2$ now'), 'Solve 3 plus 2 now');
  assert.equal(speechTextFor('It costs $15 per month. Solve $x + 2 = 5$.'), 'It costs 15 dollars per month. Solve x plus 2 equals 5.');
  assert.doesNotMatch(speechTextFor('$2(lw+lh+wh)$'), /dollar/, 'a product of letters is no price and words');
  assert.equal(speechTextFor('Cost ($)'), 'Cost in dollars');
  assert.equal(speechTextFor('sold $20, $25, and $50 cards'), 'sold 20 dollars, 25 dollars, and 50 dollars cards');
  assert.equal(speechTextFor('$20 or $30'), '20 dollars or 30 dollars');
});

test('only Read aloud\'s split changes: Translate\'s masked lines keep theirs', () => {
  // The Spanish pack's lines are keyed to the masked text (maskMath), so a
  // translated prompt is found as before.
  const span = '$4,890. A main-floor seat costs $';
  assert.ok(segmentMathText(SEATS).some((segment) => segment.kind === 'math' && segment.value.startsWith(span)), 'Translate: the span, as before');
  assert.ok(!segmentMathText(SEATS, { speech: true }).some((segment) => segment.value.includes(span)), 'Read aloud: prose and two prices');
  // Read aloud's runs say whether they hold a $…$ span: where one does, its
  // signs are LaTeX's, never a price's.
  const [run] = segmentMathText('$x + 2 = 5$', { speech: true });
  assert.deepEqual([run.kind, run.delimited], ['math', true]);
  assert.equal(segmentMathText('10(6) + 40 = $100', { speech: true })[0].delimited, undefined);
  assert.equal(segmentMathText('$x + 2 = 5$')[0].delimited, undefined, 'Translate\'s segments are as they were');
});

test('every price in the Algebra I M3 T2 lessons is said as money', () => {
  const files = ['T2_L1_Solving_Systems_by_Graphing.json', 'T2_L1_Solving_Systems_by_Graphing_Honors.json', 'T2_L2_Solving_Systems_by_Substitution.json', 'T2_L2_Solving_Systems_by_Substitution_Honors.json'];
  const texts = new Set();
  const visit = (node) => {
    if (typeof node === 'string') { if (/\$\d/.test(node) && !/\{\{/.test(node)) texts.add(node); return; }
    if (node && typeof node === 'object') Object.values(node).forEach(visit);
  };
  files.forEach((name) => visit(JSON.parse(readFileSync(new URL(`../../teacher-import-jsons/algebra1-module3/${name}`, import.meta.url), 'utf8'))));
  texts.add(SEATS);
  assert.ok(texts.size >= 10, `${texts.size} texts with a price`);
  for (const text of texts) {
    const said = speechTextFor(text);
    const prices = (text.match(/\$\d/g) || []).length;
    const money = (said.match(/\b(?:dollars?|cents?)\b/g) || []).length - (text.match(/\b(?:dollars?|cents?)\b/g) || []).length;
    assert.ok(money >= prices, `${prices} prices, ${money} said as money: ${said}`);
    assert.doesNotMatch(said, /\b[a-z]{2,} minus [a-z]{2,}\b/, `no word read as subtraction: ${said}`);
  }
});
