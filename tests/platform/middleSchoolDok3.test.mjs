// Grade 7 and Grade 6 DOK 3, checked against independent arithmetic.
//
// Same discipline as the Grade 8 file: a generator that says its answer is 7
// and produces a question whose answer is 7 has proved nothing when both
// numbers came from the same expression. Every check below re-derives the
// mathematics with its own formula, written from the standard rather than from
// the template.
//
// The misconceptions these items target are the ones that block the next year —
// treating a constant rate as proportional, using a diameter where a radius
// belongs, reading |-5| as -5, adding when a ratio calls for multiplying. Each
// generator is built so the misconception genuinely produces a DIFFERENT answer
// from the correct one; an item where the wrong method happens to give the
// right number teaches nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const load = (grade) => JSON.parse(
  readFileSync(`seed/pathQuestionBank/${grade}_pathQuestionBank_seed.json`, 'utf8'),
).documents;

const G7 = load('grade7');
const G6 = load('grade6');
const ALL = [...G7, ...G6];
const byId = (id) => ALL.find((doc) => doc.id === id);

const DRAWS = 40;

const draws = (id, count = DRAWS) => {
  const template = byId(id);
  assert.ok(template, `template ${id} is missing`);
  const out = [];
  for (let seed = 0; seed < count; seed += 1) {
    const result = generatePathInstance(template, `verify-${seed}`);
    assert.ok(result.question, `${id} failed on seed ${seed}: ${result.reason}`);
    out.push(result.parameters);
  }
  return out;
};

const DOK3 = ALL.filter((doc) => doc.dok === 3 && ['grade6', 'grade7'].includes(doc.courseId));

// --- Shape ----------------------------------------------------------------------

test('Grade 6 and Grade 7 now have DOK 3 content', () => {
  assert.ok(G7.filter((doc) => doc.dok === 3).length >= 12, 'Grade 7 is short of DOK 3 items');
  assert.ok(G6.filter((doc) => doc.dok === 3).length >= 12, 'Grade 6 is short of DOK 3 items');
});

test('every item asks the student to judge rather than to execute', () => {
  DOK3.forEach((template) => {
    assert.ok(['justification', 'errorAnalysis'].includes(template.taskType),
      `${template.id} has taskType "${template.taskType}"`);
    assert.match(
      template.prompt,
      /\bwhy\b|\bwrong\b|\bwhich\b|\ba student says\b|\bis (?:that|it)\b|\bwhat (?:is|does|actually|should)\b|\bcheck\b|\bhow many\b|\bwhat happens\b/i,
      `${template.id} does not ask the student to evaluate anything`,
    );
  });
});

test('every item has real distractors and a reachable answer', () => {
  DOK3.forEach((template) => {
    assert.ok(template.choices.length >= 3, `${template.id} has too few choices`);
    const expected = template.responseFields[0].expected;
    assert.ok(template.choices.some((entry) => entry.id === expected),
      `${template.id} expects "${expected}", not among its choices`);
    assert.equal(new Set(template.choices.map((entry) => entry.id)).size, template.choices.length,
      `${template.id} has duplicate choice ids`);
  });
});

test('every item explains its reasoning in at least two steps', () => {
  DOK3.forEach((template) => {
    assert.ok((template.solutionReview?.reasoning || []).length >= 2, `${template.id} under-explains`);
  });
});

// --- Grade 7 mathematics ----------------------------------------------------------

test('7.4C — the two ratios genuinely disagree', () => {
  draws('mm_gen_7_7_4C_ratio-must-hold-everywhere').forEach((p) => {
    assert.equal(p.y1 / p.x1, p.k, 'the first pair must give the stated k');
    assert.notEqual(p.y2 / p.x2, p.k, 'the second pair must NOT, or the item has no answer');
  });
});

test('7.11B — the guess fails and the stated solution works', () => {
  draws('mm_gen_7_7_11B_does-the-value-fit').forEach((p) => {
    assert.equal(p.a * p.x + p.b, p.c, 'the stated solution must actually solve it');
    assert.equal(p.a * p.guess + p.b, p.guessValue);
    assert.notEqual(p.guessValue, p.c, 'the guess must actually fail');
  });
});

test('7.4D — down then up really does land lower', () => {
  draws('mm_gen_7_7_4D_percent-off-then-on').forEach((p) => {
    // Independent: price * (1 - p/100) * (1 + p/100), in hundredths.
    const expected = p.price * (100 - p.p) * (100 + p.p) / 100;
    assert.equal(p.finalCents, expected);
    assert.ok(p.finalCents / 100 < p.price,
      `${p.price} at ${p.p}% ended at ${p.finalCents / 100}, not lower`);
  });
});

test('7.4D shows only whole dollars to the student', () => {
  // The first draft told a seventh-grader the price ended at "2970 hundredths
  // of a dollar", which is not how anyone talks. Every figure the item displays
  // is now a whole number of dollars; the exact endpoint stays in the test.
  draws('mm_gen_7_7_4D_percent-off-then-on').forEach((p) => {
    assert.equal(p.discount, p.price * p.p / 100);
    assert.equal(p.sale, p.price - p.discount);
    assert.equal(p.discount, Math.round(p.discount), `discount ${p.discount} is not whole`);
    assert.equal(p.sale, Math.round(p.sale), `sale price ${p.sale} is not whole`);
    // And the argument the item makes has to be true: the add-back is smaller
    // than the discount was.
    assert.ok(p.sale * p.p / 100 < p.discount,
      'the increase must add back less than the discount removed');
  });
});

test('7.9B — the radius is half the diameter and the areas differ by four', () => {
  draws('mm_gen_7_7_9B_diameter-not-radius').forEach((p) => {
    assert.equal(p.d, 2 * p.r);
    assert.equal(p.area, p.r * p.r, 'area coefficient is r squared');
    assert.equal(p.wrongArea, p.d * p.d, 'the error uses the diameter');
    assert.equal(p.wrongArea, 4 * p.area, 'the mistake must be visibly wrong, not marginally');
  });
});

test('7.11C — the triangle angle actually exists', () => {
  draws('mm_gen_7_7_11C_triangle-not-quadrilateral').forEach((p) => {
    assert.equal(p.a + p.b + p.x, 180, 'the three angles must sum to 180');
    assert.ok(p.x > 0, `a triangle cannot have a ${p.x} degree angle`);
    assert.equal(p.wrongX, 360 - p.a - p.b);
    assert.notEqual(p.x, p.wrongX);
  });
});

test('7.3A — subtracting a negative adds', () => {
  draws('mm_gen_7_7_3A_subtracting-a-negative').forEach((p) => {
    assert.equal(p.right, p.a + p.b, 'a - (-b) = a + b');
    assert.equal(p.wrong, p.a - p.b);
    assert.notEqual(p.right, p.wrong, 'b must be non-zero for the item to have a point');
  });
});

test('7.6E — the two probabilities sum to one', () => {
  draws('mm_gen_7_7_6E_complement-of-an-event').forEach((p) => {
    assert.equal(p.total, p.win + p.lose);
    assert.equal((p.win / p.total) + (p.lose / p.total), 1,
      'an event and its complement must sum to 1');
    assert.notEqual(p.win / p.lose, p.lose / p.total,
      'the distractor must differ from the answer');
  });
});

test('7.4A — the two steps really are different', () => {
  draws('mm_gen_7_7_4A_check-every-step').forEach((p) => {
    assert.equal(p.y1 - p.y0, p.m, 'the first step must be the stated rate');
    assert.equal(p.y2 - p.y1, p.step2);
    assert.notEqual(p.step2, p.m, 'the second step must differ, or the table IS linear');
  });
});

test('7.7 — rate and start are distinguishable', () => {
  draws('mm_gen_7_7_7_rate-versus-start').forEach((p) => {
    assert.equal(p.total, p.rate * p.months + p.start);
    assert.notEqual(p.rate, p.start,
      'if the two numbers were equal, swapping them would be invisible');
  });
});

test('7.10A — the two-step equation is the one that works', () => {
  draws('mm_gen_7_7_10A_one-step-or-two').forEach((p) => {
    assert.equal(p.rate * p.t + p.park, p.total, 'the two-step equation must be true');
    assert.notEqual(p.rate * p.t, p.total, 'the one-step distractor must be false');
    assert.notEqual((p.rate + p.park) * p.t, p.total, 'the per-ticket distractor must be false');
  });
});

test('7.5A — corresponding sides give the same factor, the mismatched pair does not', () => {
  draws('mm_gen_7_7_5A_corresponding-sides').forEach((p) => {
    assert.equal(p.a2 / p.a, p.k);
    assert.equal(p.b2 / p.b, p.k, 'both corresponding pairs must give the same scale factor');
    assert.notEqual(p.a2 / p.b, p.k, 'the student\'s mismatched ratio must differ');
  });
});

test('7.13E — compound genuinely beats simple over two years', () => {
  draws('mm_gen_7_7_13E_simple-versus-compound').forEach((p) => {
    // Independent: simple = 2pr/100; compound = p(1+r/100)^2 - p.
    const simple = 2 * p.p * p.r / 100;
    const compound = p.p * ((1 + p.r / 100) ** 2) - p.p;
    assert.equal(p.simpleInterest, simple);
    assert.ok(compound > simple, `at ${p.r}% compound (${compound}) did not beat simple (${simple})`);
    assert.equal(p.afterYear1, p.p + p.p * p.r / 100);
  });
});

// --- Grade 6 mathematics ----------------------------------------------------------

test('6.2B — the absolute value is positive and the item is not trivial', () => {
  draws('mm_gen_6_6_2B_absolute-value-is-a-distance').forEach((p) => {
    assert.equal(Math.abs(-p.n), p.n);
    assert.ok(p.n > 0, 'n = 0 would make the misconception invisible');
  });
});

test('6.3D — the subtraction genuinely crosses zero', () => {
  draws('mm_gen_6_6_3D_crossing-zero').forEach((p) => {
    assert.equal(p.right, p.a - p.b);
    assert.equal(p.wrong, p.b - p.a);
    assert.ok(p.right < 0, 'the answer must be negative, or the misconception does not bite');
    assert.equal(p.right, -p.wrong);
  });
});

test('6.4C — the ratio survives scaling and the difference does not', () => {
  draws('mm_gen_6_6_4C_times-as-many-not-more-than').forEach((p) => {
    // "There are 2 MORE" and "2 TIMES as many" showing the same 2 makes the
    // very distinction the item teaches invisible.
    assert.notEqual(p.diff, p.times,
      `difference and multiplier are both ${p.diff}, so the item reads as a coincidence`);
    assert.equal(p.blue, p.red * p.times);
    assert.equal(p.diff, p.blue - p.red);
    // The whole argument of the item: double both and check what changed.
    assert.equal(p.blue2 / p.red2, p.blue / p.red, 'the ratio must be unchanged by doubling');
    assert.notEqual(p.diff2, p.diff, 'the difference must change, which is the point');
  });
});

test('6.5B — the part is exactly that percent of the whole', () => {
  draws('mm_gen_6_6_5B_find-the-whole').forEach((p) => {
    assert.equal(p.part, p.whole * p.p / 100);
    assert.equal(p.part, Math.round(p.part), 'a fractional student is not a sensible answer');
    assert.ok(p.whole > p.part, 'the whole must exceed the part, which is why you divide');
  });
});

test('6.6A — the dependent quantity really is determined by the other', () => {
  draws('mm_gen_6_6_6A_which-depends-on-which').forEach((p) => {
    assert.equal(p.cost, p.rate * p.hours);
    assert.ok(p.rate > 0, 'a zero rate would make cost independent of hours');
  });
});

test('6.7A — order of operations changes the answer here', () => {
  draws('mm_gen_6_6_7A_not-left-to-right').forEach((p) => {
    assert.equal(p.right, p.a + p.b * p.c);
    assert.equal(p.wrong, (p.a + p.b) * p.c);
    assert.notEqual(p.right, p.wrong,
      'if both orders agreed, the item would teach the wrong lesson');
  });
});

test('6.7C — the counterexample genuinely distinguishes the two expressions', () => {
  draws('mm_gen_6_6_7C_distribute-to-both').forEach((p) => {
    assert.equal(p.kn, p.k * p.n);
    assert.equal(p.correctValue, p.k * (p.test + p.n));
    assert.equal(p.wrongValue, p.k * p.test + p.n);
    assert.notEqual(p.correctValue, p.wrongValue,
      'the chosen test value must actually separate them');
  });
});

test('6.9A — division undoes the multiplication exactly', () => {
  draws('mm_gen_6_6_9A_which-operation-undoes-it').forEach((p) => {
    assert.equal(p.total, p.groups * p.s);
    assert.equal(p.total / p.groups, p.s);
    assert.equal(p.s, Math.round(p.s), 'a fractional sticker is not a sensible answer');
  });
});

test('6.10B — the guess falls below the boundary', () => {
  draws('mm_gen_6_6_10B_test-the-inequality').forEach((p) => {
    assert.equal(p.guessValue, p.guess + p.b);
    assert.ok(!(p.guessValue > p.c), 'the guess must genuinely fail the inequality');
    // And the boundary is where it stops failing.
    assert.equal(p.boundary + p.b, p.c);
  });
});

test('6.8D — the triangle is exactly half the rectangle, in whole units', () => {
  draws('mm_gen_6_6_8D_the-missing-half').forEach((p) => {
    assert.equal(p.wrongArea, p.b * p.h);
    assert.equal(p.area, p.b * p.h / 2);
    assert.equal(p.area, Math.round(p.area), 'the constraint should keep the area whole');
  });
});

test('6.12C — the outlier moves the mean and the item says so honestly', () => {
  draws('mm_gen_6_6_12C_outlier-moves-the-mean').forEach((p) => {
    const four = [p.a, p.b, p.c, p.d];
    assert.deepEqual(four, [p.a, p.a + p.step, p.a + 2 * p.step, p.a + 3 * p.step]);
    assert.equal(p.mean4, four.reduce((sum, value) => sum + value, 0) / 4);
    assert.equal(p.mean5, (four.reduce((sum, value) => sum + value, 0) + p.outlier) / 5);
    assert.ok(p.mean5 > p.mean4, 'the outlier must pull the mean upward');
    // The median of the five is the middle value, which moves by one step only.
    const median5 = [...four, p.outlier].sort((x, y) => x - y)[2];
    const median4 = (four[1] + four[2]) / 2;
    assert.ok(Math.abs(p.mean5 - p.mean4) > Math.abs(median5 - median4),
      'the mean must move MORE than the median, which is the claim');
  });
});

test('6.3A — dividing by a unit fraction multiplies', () => {
  draws('mm_gen_6_6_3A_divide-by-a-fraction').forEach((p) => {
    assert.equal(p.answer, p.whole * p.n);
    assert.equal(p.answer, p.whole / (1 / p.n), 'dividing by 1/n must equal multiplying by n');
    assert.ok(p.answer > p.whole, 'the result must be BIGGER, which is the misconception');
  });
});

// --- Rendering --------------------------------------------------------------------

test('no middle-school DOK 3 instance renders a placeholder, double sign or bad number', () => {
  const collect = (node, out = []) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((item) => collect(item, out));
    else if (node && typeof node === 'object') Object.values(node).forEach((value) => collect(value, out));
    return out;
  };

  DOK3.forEach((template) => {
    for (let seed = 0; seed < 12; seed += 1) {
      const result = generatePathInstance(template, `render-${seed}`);
      assert.ok(result.question, `${template.id} failed on seed ${seed}`);
      collect(result.question).forEach((text) => {
        assert.ok(!/\{\{\s*[A-Za-z_]/.test(text), `${template.id}: placeholder in "${text.slice(0, 70)}"`);
        assert.ok(!/[0-9A-Za-z)\]}=(,[]\s*[-+]\s*[-+]\s*\d/.test(text), `${template.id}: double sign in "${text.slice(0, 70)}"`);
        assert.ok(!/\bNaN\b|\bInfinity\b/.test(text), `${template.id}: bad number in "${text.slice(0, 70)}"`);
      });
    }
  });
});

test('every middle-school DOK 3 item varies across seeds', () => {
  DOK3.forEach((template) => {
    const prompts = new Set();
    for (let seed = 0; seed < 10; seed += 1) {
      const result = generatePathInstance(template, `vary-${seed}`);
      if (result.question) prompts.add(result.question.prompt);
    }
    assert.ok(prompts.size > 1, `${template.id} produced one prompt from every seed`);
  });
});

// --- What remains, pinned so a regression is visible ---------------------------

test('every Algebra I and Algebra II standard has DOK 3 in every exam bank', () => {
  // This is the coverage that matters for CCMR transfer: the engine asks for
  // depth on a standard the student already knows in class, and those are
  // course standards. It is fully covered, and the remaining bank gaps are
  // exam-styled MIDDLE SCHOOL items — a much lower-consequence hole, since a
  // student is rarely sent SAT-format practice on a grade 6 standard.
  const gaps = [];
  ['act', 'tsia2', 'digitalSAT', 'asvab'].forEach((bank) => {
    const docs = JSON.parse(
      readFileSync(`seed/pathQuestionBank/${bank}_pathQuestionBank_seed.json`, 'utf8'),
    ).documents;
    const byCode = {};
    docs.forEach((doc) => {
      const code = (doc.alignmentKeys || [])[0].split(':').pop();
      (byCode[code] = byCode[code] || new Set()).add(doc.dok);
    });
    Object.entries(byCode).forEach(([code, doks]) => {
      if (/^A2?\./.test(code) && !doks.has(3)) gaps.push(`${bank}/${code}`);
    });
  });
  assert.deepEqual(gaps, [], `course standards without exam-style DOK 3: ${gaps.slice(0, 8).join(', ')}`);
});
