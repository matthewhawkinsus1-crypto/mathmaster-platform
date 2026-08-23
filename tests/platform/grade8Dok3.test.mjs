// The Grade 8 DOK 3 templates, checked against independent arithmetic.
//
// A generator that says its answer is 7 and produces a question whose answer is
// 7 has proved nothing — both numbers came from the same expression. So every
// check below RE-DERIVES the mathematics from the drawn parameters using its
// own formula, written from the standard rather than from the template, and
// compares. Where the two disagree, one of them is wrong and the test says so.
//
// This is the class of defect that matters most in a maths platform: a
// confidently-presented question with a wrong answer key teaches a student that
// their correct work is incorrect.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const SEED = 'seed/pathQuestionBank/grade8_pathQuestionBank_seed.json';
const documents = JSON.parse(readFileSync(SEED, 'utf8')).documents;
const byId = (id) => documents.find((doc) => doc.id === id);

const DRAWS = 40;

/** Every parameter set a template produces across many seeds. */
const draws = (id, count = DRAWS) => {
  const template = byId(id);
  assert.ok(template, `template ${id} is missing from the seed`);
  const out = [];
  for (let seed = 0; seed < count; seed += 1) {
    const result = generatePathInstance(template, `verify-${seed}`);
    assert.ok(result.question, `${id} failed to generate on seed ${seed}: ${result.reason}`);
    out.push({ p: result.parameters, q: result.question });
  }
  return out;
};

const expectedChoice = (question) => question.responseFields[0].expected;
const labelOf = (question, id) => question.choices.find((entry) => entry.id === id)?.label;

// --- Shape: the things every one of them must satisfy -------------------------

const DOK3_IDS = documents.filter((doc) => doc.dok === 3 && doc.courseId === 'grade8').map((doc) => doc.id);

test('Grade 8 now has DOK 3 content at all', () => {
  // The gap the audit named: middle school could be given harder numbers but
  // not harder thinking.
  assert.ok(DOK3_IDS.length >= 12, `only ${DOK3_IDS.length} Grade 8 DOK 3 templates`);
});

test('every DOK 3 item asks the student to judge, not to execute', () => {
  // DOK 3 is strategic reasoning. A longer computation is difficulty band, the
  // other axis — and an item that only computes would make the two axes the
  // same thing again.
  DOK3_IDS.forEach((id) => {
    const template = byId(id);
    assert.ok(['justification', 'errorAnalysis'].includes(template.taskType),
      `${id} has taskType "${template.taskType}"`);
    assert.match(
      template.prompt,
      /\bwhy\b|\bwrong\b|\bwhich\b|\ba student says\b|\bis it\b|\bwhat (?:is|does|actually)\b|\bcheck\b|\bsettles\b|\bhow much\b/i,
      `${id} does not appear to ask the student to evaluate anything`,
    );
  });
});

test('every DOK 3 item offers real distractors, not one answer and three jokes', () => {
  DOK3_IDS.forEach((id) => {
    const template = byId(id);
    assert.ok(template.choices.length >= 3, `${id} has ${template.choices.length} choices`);
    const expected = template.responseFields[0].expected;
    assert.ok(template.choices.some((entry) => entry.id === expected),
      `${id} expects "${expected}", which is not one of its choices`);
  });
});

test('every DOK 3 item explains its reasoning, not just its answer', () => {
  DOK3_IDS.forEach((id) => {
    const template = byId(id);
    assert.ok((template.solutionReview?.reasoning || []).length >= 2,
      `${id} has fewer than two lines of reasoning`);
  });
});

test('the DOK 3 items sit on the difficulty axis independently', () => {
  // If every DOK 3 item were also the hardest band, the platform could not ask
  // for "same complexity, deeper thinking" — which is the whole reason the two
  // axes are tracked separately.
  DOK3_IDS.forEach((id) => {
    const band = byId(id).difficultyBand;
    assert.ok(band >= 1 && band <= 4, `${id} is band ${band}`);
  });
});

// --- The mathematics, re-derived ------------------------------------------------

test('8.2C — the larger exponent really does win', () => {
  draws('mm_gen_8_8_2C_compare-notation-claim').forEach(({ p, q }) => {
    const first = p.a * (10 ** p.p);
    const second = p.b * (10 ** p.q);
    assert.ok(p.a > p.b, 'the premise is that the first coefficient is larger');
    assert.ok(second > first,
      `a=${p.a}e${p.p} b=${p.b}e${p.q}: the claim "exponent wins" is false here`);
    assert.equal(expectedChoice(q), 'exponent');
  });
});

test('8.4C — the intercept is one rate of change back from the x=1 value', () => {
  draws('mm_gen_8_8_4C_intercept-not-first-row').forEach(({ p, q }) => {
    // Independent: y = mx + b, so y(1) = m + b and b = y(1) - m.
    assert.equal(p.y1, p.m + p.b, 'the table value at x=1 must be m + b');
    assert.equal(p.b, p.y1 - p.m);
    assert.notEqual(p.b, p.y1, 'the item is pointless if the intercept equals the first row');
    assert.ok(labelOf(q, 'stepback').includes(String(p.b)));
  });
});

test('8.5F — one plan passes through the origin and the other does not', () => {
  draws('mm_gen_8_8_5F_both-linear-one-proportional').forEach(({ p }) => {
    // Independent: proportional iff y/x is constant.
    const planA = (x) => p.r * x;
    const planB = (x) => p.r * x + p.fee;
    assert.equal(planA(1) / 1, planA(2) / 2, 'Plan A must be proportional');
    assert.notEqual(planB(1) / 1, planB(2) / 2, 'Plan B must not be');
    assert.ok(p.fee > 0, 'a zero fee would make both plans proportional');
  });
});

test('8.5I — the proposed equation misses the line, and the stated one fits it', () => {
  draws('mm_gen_8_8_5I_equation-fits-one-point').forEach(({ p }) => {
    // Independent: recompute the slope from the two points.
    const slope = (p.y2 - p.y1) / (p.x2 - p.x1);
    assert.equal(slope, p.m, 'the stated slope must be the actual slope');

    // The correct equation fits BOTH points.
    assert.equal(p.m * p.x1 + p.b, p.y1);
    assert.equal(p.m * p.x2 + p.b, p.y2);

    // The student's equation fits NEITHER.
    assert.notEqual(p.m * p.x1 + p.wrongB, p.y1);
    assert.notEqual(p.m * p.x2 + p.wrongB, p.y2);
  });
});

test('8.7C — the triangle really is not right, and really is a triangle', () => {
  draws('mm_gen_8_8_7C_converse-check').forEach(({ p }) => {
    // Independent: the converse test, and the triangle inequality.
    assert.notEqual(p.a * p.a + p.b * p.b, p.c * p.c,
      `${p.a},${p.b},${p.c} IS a right triangle — the stated answer "no" would be wrong`);
    assert.equal(p.cSquared, p.c * p.c);
    assert.equal(p.sumSquares, p.a * p.a + p.b * p.b);
    assert.ok(p.a + p.b > p.c, `${p.a},${p.b},${p.c} violates the triangle inequality`);
    assert.ok(p.c > p.a && p.c > p.b, `${p.c} is not the longest side`);
  });
});

test('8.8C — step 1 is sound, step 2 is the error, and the real solution is x', () => {
  draws('mm_gen_8_8_8C_find-the-flawed-step').forEach(({ p }) => {
    // Independent: solve the original equation from scratch.
    const solved = (p.b2 - p.b1) / (p.m1 - p.m2);
    assert.equal(solved, p.x, 'the equation must actually have the solution it was built from');

    // Step 1 as printed is a correct consequence of the original.
    assert.equal(p.diffM, p.m1 - p.m2);
    assert.equal(p.diffM * p.x + p.b1, p.b2, 'step 1 must be true at the solution');

    // Step 2 as printed is wrong, and wrong in exactly the stated way.
    assert.equal(p.wrongRight, p.b2, 'the corrupted line keeps the right side unchanged');
    assert.equal(p.rightSide, p.b2 - p.b1, 'the correct right side subtracts b1');
    assert.notEqual(p.wrongRight, p.rightSide, 'there must actually be an error to find');

    // And the student's wrong answer is a whole number, not a 17-digit decimal.
    assert.equal(p.wrongX, Math.round(p.wrongX), `wrongX was ${p.wrongX}`);
  });
});

test('8.9 — the proposed point is on one line and off the other', () => {
  draws('mm_gen_8_8_9_satisfies-only-one').forEach(({ p }) => {
    // Independent: evaluate both lines at the proposed x.
    const line1 = p.m1 * p.px + p.c1;
    const line2 = p.m2 * p.px + p.c2;
    assert.equal(line1, p.py, 'the point must satisfy the first equation');
    assert.notEqual(line2, p.py, 'the point must NOT satisfy the second');
    assert.equal(p.secondValue, line2, 'the stated second value must be the real one');

    // And the system's real solution must genuinely solve both.
    assert.equal(p.m1 * p.sx + p.c1, p.sy);
    assert.equal(p.m2 * p.sx + p.c2, p.sy);
  });
});

test('8.4A — both slope triangles give the same ratio', () => {
  draws('mm_gen_8_8_4A_slope-independent-of-points').forEach(({ p }) => {
    assert.equal(p.r1 / p.u1, p.slope);
    assert.equal(p.r2 / p.u2, p.slope);
    assert.notEqual(p.u1, p.u2, 'the triangles must be different sizes for the item to mean anything');
  });
});

test('8.3C — length scales by k and area scales by k squared', () => {
  draws('mm_gen_8_8_3C_scale-factor-length-vs-area').forEach(({ p }) => {
    // Independent: compute both perimeters and both areas.
    const perimeter = 2 * (p.w + p.h);
    const newPerimeter = 2 * (p.w * p.k + p.h * p.k);
    assert.equal(newPerimeter, perimeter * p.k, 'perimeter must scale by k');

    const area = p.w * p.h;
    assert.equal(p.newArea, area * p.k * p.k, 'area must scale by k squared');
    assert.equal(p.kSquared, p.k * p.k);
    assert.notEqual(p.k, p.kSquared, 'k = 1 would make the distinction invisible');
  });
});

test('8.7D — the triple is genuine and the saving is a whole number', () => {
  draws('mm_gen_8_8_7D_straight-line-vs-grid-path').forEach(({ p }) => {
    // Independent: the Pythagorean relation itself.
    assert.equal(p.a * p.a + p.b * p.b, p.c * p.c,
      `${p.a},${p.b},${p.c} is not a Pythagorean triple`);
    assert.ok(p.a > 0 && p.b > 0, `degenerate triangle ${p.a},${p.b}`);
    assert.equal(p.gridPath, p.a + p.b);
    assert.equal(p.diff, p.a + p.b - p.c);
    assert.ok(p.diff > 0, 'the straight route must be shorter — that is the point of the item');
    assert.equal(p.c, Math.round(p.c), 'the hypotenuse must be a whole number');
  });
});

test('8.5B — the constant is what is there before the filling starts', () => {
  draws('mm_gen_8_8_5B_interpret-the-constant').forEach(({ p }) => {
    assert.equal(p.after, p.m * p.t + p.b);
    assert.ok(p.b > 0, 'a zero starting amount would make the item self-answering');
    assert.equal(p.after - p.m * p.t, p.b, 'b is exactly what filling did not supply');
  });
});

test('8.2B — the radicand really does sit between those two squares', () => {
  draws('mm_gen_8_8_2B_justify-the-bound').forEach(({ p }) => {
    assert.equal(p.loSq, p.lo * p.lo);
    assert.equal(p.hiSq, p.hi * p.hi);
    assert.equal(p.hi, p.lo + 1, 'the bounds must be CONSECUTIVE whole numbers');
    assert.ok(p.loSq < p.n && p.n < p.hiSq, `${p.n} is not between ${p.loSq} and ${p.hiSq}`);
    // And it must be genuinely irrational, or "between two whole numbers" is a
    // strange thing to ask.
    assert.notEqual(Math.sqrt(p.n), Math.round(Math.sqrt(p.n)),
      `${p.n} is a perfect square, so its root is not irrational`);
  });
});

// --- Rendering ------------------------------------------------------------------

test('no DOK 3 instance reaches a student with a placeholder or a double sign', () => {
  const collect = (node, out = []) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((item) => collect(item, out));
    else if (node && typeof node === 'object') Object.values(node).forEach((value) => collect(value, out));
    return out;
  };

  DOK3_IDS.forEach((id) => {
    draws(id, 12).forEach(({ q }, seed) => {
      collect(q).forEach((text) => {
        assert.ok(!/\{\{\s*[A-Za-z_]/.test(text), `${id} seed ${seed}: unsubstituted placeholder in "${text.slice(0, 70)}"`);
        assert.ok(!/[0-9A-Za-z)\]}=(,[]\s*[-+]\s*[-+]\s*\d/.test(text), `${id} seed ${seed}: double sign in "${text.slice(0, 70)}"`);
        assert.ok(!/\bNaN\b|\bInfinity\b/.test(text), `${id} seed ${seed}: bad number in "${text.slice(0, 70)}"`);
      });
    });
  });
});

test('every DOK 3 item varies across seeds', () => {
  DOK3_IDS.forEach((id) => {
    const prompts = new Set(draws(id, 10).map(({ q }) => q.prompt));
    assert.ok(prompts.size > 1, `${id} produced the same prompt from every seed`);
  });
});
