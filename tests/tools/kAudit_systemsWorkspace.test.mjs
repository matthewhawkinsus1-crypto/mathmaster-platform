import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildSystemsWorkspaceReview } from '../../src/tools/shared/reviews/systemsWorkspaceReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE SYSTEMS WORKSPACE WORKED SOLUTION, RECOMPUTED INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. For every graded mode — linear, matrix
 * (2×2), matrix3, linearQuadratic, inequalities (legacy and student build),
 * algebraic 2×2 and 3×3 (each method; unique, dependent and inconsistent) —
 * hundreds of seeded systems are drawn (integer, fractional and decimal
 * coefficients, zero entries, a variable missing from an equation, parallel
 * and coincident lines, tangent and missed parabolas, vertical and horizontal
 * boundaries) and each review is read back from its TEXT:
 *
 *   - every equation or chain of equalities a step writes in the variables is
 *     checked, in exact Fraction arithmetic with mathjs, to be a consequence of
 *     the system (a linear combination of its augmented rows), and every
 *     purely numeric chain to be equal link by link;
 *   - every row operation of a 2×2 reduction is redone, the RREF a 3×3 shows is
 *     recomputed by Gaussian elimination here, the discriminant, roots and
 *     y-values of a line-and-parabola are recomputed, and each inequality
 *     boundary point, shade point, test-point verdict and vertex is checked;
 *   - the stated answer is independently the true one, and the shared grader
 *     (gradeToolWork) marks the work a student following it submits correct;
 *   - the text has no "+ −3", "1x", "−−", −0, "× −2", NaN or unreduced fraction.
 *
 * Nothing here calls the builder's or the tool's own math helpers.
 */

const TOOL_ID = 'systemsWorkspace';
const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const sw = (fields) => ({ type: TOOL_ID, prompt: 'Systems Workspace question', ...fields });
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const assertAccepted = (question, work, label) => {
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded (${result.reason})`);
  assert.equal(result.isCorrect, true, `${label}: the grader accepts the stated answer — ${JSON.stringify(result.parts)}`);
  return result;
};

const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const int = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];
const nonzero = (random, low, high) => {
  const value = int(random, low, high);
  return value === 0 ? 1 : value;
};

/* ---------------------------------------------------------------- reading */

const plain = (text) => String(text).replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/²/g, '^2');
const value = (text) => F(math.evaluate(plain(text)));
const textsOf = (model) => [model.title, model.why, model.note, ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])].filter(Boolean);
const itemValue = (model, label) => {
  const found = model.items.find((item) => item.label === label);
  assert.ok(found, `an item "${label}" in ${JSON.stringify(model.items.map((item) => item.label))}`);
  return found.value;
};
const hasItem = (model, label) => model.items.some((item) => item.label === label);
const pointsIn = (text) => [...String(text).matchAll(/\(([^()]+)\)/g)]
  .map(([, inner]) => inner.split(',').map((part) => part.replace('≈', '').trim()))
  .filter((parts) => parts.every((part) => /^[-−]?\d+(\.\d+)?(\/\d+)?$/.test(part)))
  .map((parts) => parts.map((part) => Number(value(part).valueOf())));
const typed = (number) => String(number);

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const assertClean = (model, label) => {
  textsOf(model).forEach((raw) => {
    const text = plain(raw);
    assert.doesNotMatch(text, /undefined|NaN|Infinity|\[object|\bnull\b/, `${label}: leaked value in "${raw}"`);
    assert.doesNotMatch(text, /[+-]\s*-\s*\d|--|[*/]\s*-/, `${label}: a doubled or unbracketed sign in "${raw}"`);
    assert.doesNotMatch(text, /(^|[^\d.)/])1[a-z]\b(?!\))/, `${label}: a written-out 1 coefficient in "${raw}"`);
    assert.doesNotMatch(text, /(^|[=(,:\s])-0(?![\d.\/])/, `${label}: −0 in "${raw}"`);
    for (const [, n, d] of text.matchAll(/(?<![\d.])(\d+)\/(\d+)(?![\d.])/g)) {
      assert.equal(gcd(Number(n), Number(d)), 1, `${label}: ${n}/${d} not in lowest terms in "${raw}"`);
      assert.notEqual(Number(d), 1, `${label}: ${n}/1 in "${raw}"`);
    }
  });
};

/*
 * The runs of mathematics in a sentence: maximal stretches of words made only
 * of numbers, the system's variables, brackets and operators. A run with "="
 * is an equation or a chain "a = b = c".
 */
const mathRuns = (sentence, vars) => {
  const variable = vars.join('');
  const word = new RegExp(`^[(−\\-+]*(?:\\d+(?:\\.\\d+)?(?:/\\d+)?|[${variable}]|[=+−\\-×])(?:[\\d./()${variable}−\\-²]*)$`);
  const runs = [];
  let run = [];
  const close = () => {
    if (run.length) runs.push(run.join(' '));
    run = [];
  };
  String(sentence).split(/\s+/).forEach((raw) => {
    const ends = /[,;:.]$/.test(raw);
    const token = raw.replace(/[,;:.]+$/, '');
    if (token && word.test(token)) {
      run.push(token);
      if (ends) close();
    } else close();
  });
  close();
  // Brackets the sentence opened or closed outside the run.
  const balance = (text) => {
    let result = text;
    const count = (open) => [...result].filter((char) => char === open).length;
    while (result.startsWith('(') && count('(') > count(')')) result = result.slice(1);
    while (result.endsWith(')') && count(')') > count('(')) result = result.slice(0, -1);
    return result.trim();
  };
  const balanced = (text) => {
    let depth = 0;
    for (const char of text) {
      depth += char === '(' ? 1 : char === ')' ? -1 : 0;
      if (depth < 0) return false;
    }
    return depth === 0;
  };
  // A run cut out of a point such as "(x, y, z) = (0.37, …" is not an equation.
  return runs.map(balance).filter((run) => run.includes('=') && balanced(run));
};

// L − R of "L = R" as [coefficients…, constant] (Σ a·v + k), exactly.
const linearRow = (left, right, vars) => {
  const node = math.parse(`(${plain(left)}) - (${plain(right)})`);
  const at = (values) => F(node.evaluate(Object.fromEntries(vars.map((name, index) => [name, F(values[index])]))));
  const zero = at(vars.map(() => 0));
  const coefficients = vars.map((_, index) => at(vars.map((__, other) => (other === index ? 1 : 0))).sub(zero));
  const probe = vars.map((_, index) => index + 2);
  const predicted = coefficients.reduce((sum, coefficient, index) => sum.add(coefficient.mul(probe[index])), zero);
  assert.ok(at(probe).equals(predicted), `not linear: ${left} = ${right}`);
  return [...coefficients, zero];
};

// Rank of rows of Fractions, by elimination.
const rank = (rows) => {
  const matrix = rows.map((row) => row.map(F));
  let rankFound = 0;
  const width = matrix[0]?.length ?? 0;
  for (let column = 0; column < width && rankFound < matrix.length; column += 1) {
    const pivot = matrix.findIndex((row, index) => index >= rankFound && !row[column].equals(0));
    if (pivot < 0) continue;
    [matrix[rankFound], matrix[pivot]] = [matrix[pivot], matrix[rankFound]];
    for (let index = 0; index < matrix.length; index += 1) {
      if (index === rankFound || matrix[index][column].equals(0)) continue;
      const factor = matrix[index][column].div(matrix[rankFound][column]);
      matrix[index] = matrix[index].map((entry, position) => entry.sub(factor.mul(matrix[rankFound][position])));
    }
    rankFound += 1;
  }
  return rankFound;
};

/*
 * Every equation and chain a review writes in `vars` follows from the system
 * (augmented rows [a…, −c] of Σ a·v − c = 0): a link with variables is a
 * linear combination of the rows, a link with none is a true equality.
 */
const assertDerivationsFollow = (model, vars, rows, label, { skip = () => false } = {}) => {
  const baseRank = rank(rows);
  // An inconsistent system implies every equation; there only the arithmetic of
  // its no-variable statements is checked ("only −54 = −50 — the statement 0 = 4").
  const inconsistent = baseRank > rank(rows.map((row) => row.slice(0, -1)));
  [...model.steps, model.why].forEach((sentence) => {
    const only = sentence.match(/only (\S+) = (\S+) — the statement 0 = (\S+)\./);
    if (only) assert.ok(value(only[3]).equals(value(only[2]).sub(value(only[1]))), `${label}: ${only[0]}`);
    mathRuns(sentence, vars).forEach((run) => {
      if (skip(run)) return;
      const links = run.split('=').map((part) => part.trim());
      if (links.some((link) => !link)) return;
      for (let index = 0; index + 1 < links.length; index += 1) {
        let row;
        try {
          row = linearRow(links[index], links[index + 1], vars);
        } catch (error) {
          assert.fail(`${label}: cannot read "${run}" in "${sentence}": ${error.message}`);
        }
        const hasVariables = row.slice(0, -1).some((entry) => !entry.equals(0));
        // "0 = c", the statement a dependent or inconsistent system reduces to.
        const statement = /^0$/.test(links[index]) && links.length === 2;
        if (inconsistent && !hasVariables) continue;
        if (hasVariables || statement) {
          assert.equal(rank([...rows, row]), baseRank, `${label}: "${links[index]} = ${links[index + 1]}" does not follow from the system, in "${sentence}"`);
        } else {
          assert.ok(row.at(-1).equals(0), `${label}: "${links[index]} = ${links[index + 1]}" is false, in "${sentence}"`);
        }
      }
    });
  });
};

/* ================================================================ linear */

const auditLinear = (system, label) => {
  const question = sw({ mode: 'linear', system });
  const model = buildSystemsWorkspaceReview(question);
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);
  const [m1, b1, m2, b2] = [system.m1, system.b1, system.m2, system.b2].map(F);
  const classification = { 'Exactly one solution': 'one', 'No solution': 'none', 'Infinitely many solutions': 'infinite' }[itemValue(model, 'Number of solutions')];
  const truth = m1.equals(m2) ? (b1.equals(b2) ? 'infinite' : 'none') : 'one';
  assert.equal(classification, truth, `${label}: classification`);
  if (truth !== 'one') {
    assertAccepted(question, { classification, x: '', y: '' }, label);
    return;
  }
  const x = b2.sub(b1).div(m1.sub(m2));
  const y = m1.mul(x).add(b1);
  // Rows of y − m·x − b = 0 in (x, y).
  const rows = [[m1.neg(), F(1), b1.neg()], [m2.neg(), F(1), b2.neg()]];
  assertDerivationsFollow(model, ['x', 'y'], rows, label);
  const points = pointsIn(itemValue(model, 'Intersection point'));
  // The exact point is stated first (or alone); the decimals typed are the last.
  const exactPoint = itemValue(model, 'Intersection point').match(/^\(([^()]+)\)/)[1].split(',').map((part) => value(part.trim()));
  assert.ok(exactPoint[0].equals(x) && exactPoint[1].equals(y), `${label}: the point is (${x.toFraction()}, ${y.toFraction()})`);
  points.forEach((point) => assertAccepted(question, { classification, x: typed(point[0]), y: typed(point[1]) }, `${label} ${point}`));
};

const LINEAR_SLOPES = [-3, -2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4, 0.25];
test('linear: 300 seeded pairs of lines — classification, every derived equation and the point recomputed; graded correct', () => {
  const random = prng(0x11);
  for (let index = 0; index < 300; index += 1) {
    const m1 = pick(random, LINEAR_SLOPES);
    const shape = int(random, 0, 5);
    const m2 = shape === 0 ? m1 : pick(random, LINEAR_SLOPES);
    const b1 = int(random, -9, 9);
    const b2 = shape === 0 && random() < 0.5 ? b1 : int(random, -9, 9);
    auditLinear({ m1, b1, m2, b2 }, `linear ${index} ${JSON.stringify({ m1, b1, m2, b2 })}`);
  }
  // Edge cases: through the origin, horizontal lines, a zero crossing.
  [{ m1: 0, b1: 3, m2: 1, b2: 0 }, { m1: 0, b1: 0, m2: 0, b2: 0 }, { m1: 0, b1: 2, m2: 0, b2: -2 }, { m1: 2, b1: 0, m2: -2, b2: 0 }, { m1: -1, b1: 4, m2: 1, b2: -4 }]
    .forEach((system) => auditLinear(system, `linear edge ${JSON.stringify(system)}`));
});

/* ================================================================ matrix 2×2 */

const ROW = /\[([^\]|]+)\|([^\]]+)\]/g;
const rowsIn = (text) => [...String(text).matchAll(ROW)].map(([, left, right]) => [...left.trim().split(/\s+/), right.trim()].map(value));
const sameRow = (first, second) => first.length === second.length && first.every((entry, index) => entry.equals(second[index]));

const auditMatrix2 = (matrix, label) => {
  const question = sw({ mode: 'matrix', matrix });
  const model = buildSystemsWorkspaceReview(question);
  const [a, b, c, d, e, f] = ['a11', 'a12', 'b1', 'a21', 'a22', 'b2'].map((key) => F(matrix[key]));
  const det = a.mul(e).sub(b.mul(d));
  const augmentedRank = rank([[a, b, c], [d, e, f]]);
  const coefficientRank = rank([[a, b], [d, e]]);
  const truth = !det.equals(0) ? 'one' : augmentedRank > coefficientRank ? 'none' : 'infinite';
  if (a.equals(0) && d.equals(0)) {
    // No pivot in the first column: the builder declines (x is free or the system fails) rather than reduce it.
    assert.equal(model, null, `${label}: no review without a pivot in column 1`);
    return truth;
  }
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);

  // Redo each row operation the steps state, from the matrix the first step shows.
  let rows = rowsIn(model.steps[0]);
  assert.ok(sameRow(rows[0], [a, b, c]) && sameRow(rows[1], [d, e, f]), `${label}: the opening matrix`);
  model.steps.slice(1).forEach((step) => {
    const shown = rowsIn(step);
    let match;
    if (/^Swap the rows/.test(step)) {
      rows = [rows[1], rows[0]];
      assert.ok(sameRow(shown[0], rows[0]) && sameRow(shown[1], rows[1]), `${label}: ${step}`);
    } else if ((match = step.match(/^Divide row (\d) by (\S+):/))) {
      const index = Number(match[1]) - 1;
      const divisor = value(match[2]);
      assert.ok(divisor.equals(rows[index][index]), `${label}: divides by the pivot in "${step}"`);
      rows[index] = rows[index].map((entry) => entry.div(divisor));
      assert.ok(sameRow(shown[0], rows[index]), `${label}: ${step}`);
    } else if ((match = step.match(/^Replace row (\d) with row \d − \(?(\S+?)\)? × row (\d):/))) {
      const [target, source] = [Number(match[1]) - 1, Number(match[3]) - 1];
      const factor = value(match[2]);
      rows[target] = rows[target].map((entry, position) => entry.sub(factor.mul(rows[source][position])));
      assert.ok(rows[target][source].equals(0), `${label}: the operation clears the entry in "${step}"`);
      assert.ok(sameRow(shown[0], rows[target]), `${label}: ${step}`);
    }
  });
  const classification = { 'Exactly one solution': 'one', 'No solution': 'none', 'Infinitely many solutions': 'infinite' }[itemValue(model, 'Number of solutions')];
  assert.equal(classification, truth, `${label}: classification`);
  if (truth !== 'one') {
    if (truth === 'none') {
      const said = model.steps.join(' ').match(/Row 2 now says 0 = (\S+?), which/);
      assert.ok(said && value(said[1]).equals(rows[1][2]) && !rows[1][2].equals(0), `${label}: the false row`);
    }
    assertAccepted(question, { classification, x: '', y: '' }, label);
    return truth;
  }
  const x = c.mul(e).sub(b.mul(f)).div(det);
  const y = a.mul(f).sub(c.mul(d)).div(det);
  assert.ok(rows[0][2].equals(x) && rows[1][2].equals(y), `${label}: the reduced matrix reads the solution`);
  assertDerivationsFollow(model, ['x', 'y'], [[a, b, c.neg()], [d, e, f.neg()]], label);
  const exactPoint = itemValue(model, 'Solution').match(/^\(([^()]+)\)/)[1].split(',').map((part) => value(part.trim()));
  assert.ok(exactPoint[0].equals(x) && exactPoint[1].equals(y), `${label}: solution item`);
  pointsIn(itemValue(model, 'Solution')).forEach((point) => assertAccepted(question, { classification, x: typed(point[0]), y: typed(point[1]) }, `${label} ${point}`));
  return truth;
};

test('matrix (2×2): 300 seeded systems — every row operation redone, the classification and solution recomputed; graded correct', () => {
  const random = prng(0x22);
  const seen = new Set();
  for (let index = 0; index < 300; index += 1) {
    const shape = int(random, 0, 4);
    const entry = () => (random() < 0.15 ? 0 : int(random, -6, 6));
    let matrix = { a11: entry(), a12: entry(), b1: int(random, -12, 12), a21: entry(), a22: entry(), b2: int(random, -12, 12) };
    if (shape === 0) {
      // Dependent or inconsistent: row 2 a multiple of row 1, its constant on or off.
      const k = pick(random, [2, -1, 3, -2, 0.5]);
      matrix = { ...matrix, a21: matrix.a11 * k, a22: matrix.a12 * k, b2: matrix.b1 * k + (random() < 0.5 ? 0 : 1) };
    }
    seen.add(auditMatrix2(matrix, `matrix ${index} ${JSON.stringify(matrix)}`));
  }
  assert.deepEqual([...seen].sort(), ['infinite', 'none', 'one'], 'every classification drawn');
});

/* ================================================================ matrix3 */

const rref = (source) => {
  const matrix = source.map((row) => row.map(F));
  let lead = 0;
  for (let r = 0; r < 3 && lead < 4; r += 1) {
    let i = r;
    while (matrix[i][lead].equals(0)) {
      i += 1;
      if (i === 3) {
        i = r;
        lead += 1;
        if (lead === 4) return matrix;
      }
    }
    [matrix[i], matrix[r]] = [matrix[r], matrix[i]];
    const pivot = matrix[r][lead];
    matrix[r] = matrix[r].map((entry) => entry.div(pivot));
    for (let k = 0; k < 3; k += 1) {
      if (k === r) continue;
      const factor = matrix[k][lead];
      matrix[k] = matrix[k].map((entry, position) => entry.sub(factor.mul(matrix[r][position])));
    }
    lead += 1;
  }
  return matrix;
};

const auditMatrix3 = (rows, label) => {
  const question = sw({ mode: 'matrix3', matrix: { rows } });
  const model = buildSystemsWorkspaceReview(question);
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);
  const reduced = rref(rows);
  const shown = rowsIn(itemValue(model, 'RREF (matrix technology)'));
  assert.equal(shown.length, 3, `${label}: three RREF rows`);
  const coefficientRank = rank(rows.map((row) => row.slice(0, 3)));
  const augmentedRank = rank(rows);
  const truth = augmentedRank > coefficientRank ? 'none' : coefficientRank < 3 ? 'infinite' : 'one';
  if (truth === 'none') {
    // The screen's technology reduces the coefficient columns only, so an
    // inconsistent system shows [0 0 0 | c] unscaled (see the lane notes). It
    // must still be row-equivalent to the matrix, with that impossible row.
    assert.equal(rank([...rows, ...shown]), augmentedRank, `${label}: the matrix shown is row-equivalent`);
    assert.equal(rank(shown), augmentedRank, `${label}: the matrix shown is row-equivalent`);
    assert.ok(shown.some((row) => row.slice(0, 3).every((entry) => entry.equals(0)) && !row[3].equals(0)), `${label}: a row 0 = c`);
  } else {
    shown.forEach((row, index) => assert.ok(sameRow(row, reduced[index]), `${label}: RREF row ${index + 1} is ${reduced[index].map((entry) => entry.toFraction()).join(' ')}`));
  }
  const classification = { 'Exactly one solution': 'one', 'No solution': 'none', 'Infinitely many solutions': 'infinite' }[itemValue(model, 'Number of solutions')];
  assert.equal(classification, truth, `${label}: classification`);
  if (truth !== 'one') {
    assertAccepted(question, { classification, x: '', y: '', z: '', technologyUsed: true }, label);
    return truth;
  }
  const solution = reduced.map((row) => row[3]);
  assertDerivationsFollow(model, ['x', 'y', 'z'], rows.map((row) => [...row.slice(0, 3), -row[3]]), label);
  const exactPoint = itemValue(model, 'Solution').match(/^\(([^()]+)\)/)[1].split(',').map((part) => value(part.trim()));
  exactPoint.forEach((entry, index) => assert.ok(entry.equals(solution[index]), `${label}: solution coordinate ${index + 1}`));
  pointsIn(itemValue(model, 'Solution')).forEach((point) => assertAccepted(question, {
    classification, x: typed(point[0]), y: typed(point[1]), z: typed(point[2]), technologyUsed: true,
  }, `${label} ${point}`));
  return truth;
};

test('matrix3: 200 seeded systems — the RREF shown is the true RREF, the classification and solution recomputed; graded correct', () => {
  const random = prng(0x33);
  const seen = new Set();
  for (let index = 0; index < 200; index += 1) {
    const entry = () => (random() < 0.2 ? 0 : int(random, -5, 5));
    const rows = Array.from({ length: 3 }, () => [entry(), entry(), entry(), int(random, -10, 10)]);
    if (index % 4 === 0) {
      // Row 3 a combination of rows 1 and 2, its constant on or off.
      const [p, q] = [int(random, -2, 2), nonzero(random, -2, 2)];
      rows[2] = rows[0].map((value, column) => p * value + q * rows[1][column] + (column === 3 && random() < 0.5 ? 1 : 0));
    }
    if (rows.some((row) => row.slice(0, 3).every((value) => value === 0))) continue;
    seen.add(auditMatrix3(rows, `matrix3 ${index} ${JSON.stringify(rows)}`));
  }
  assert.deepEqual([...seen].sort(), ['infinite', 'none', 'one'], 'every classification drawn');
});

/* ======================================================= linearQuadratic */

const auditLinearQuadratic = (config, label) => {
  const question = sw({ mode: 'linearQuadratic', linearQuadratic: config });
  const model = buildSystemsWorkspaceReview(question);
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);
  const [m, k, a, qb, qc] = [config.line.m, config.line.b, config.quadratic.a, config.quadratic.b, config.quadratic.c].map(F);
  const [A, B, C] = [a, qb.sub(m), qc.sub(k)];
  const discriminant = B.mul(B).sub(A.mul(C).mul(4));
  const count = discriminant.compare(0) > 0 ? 2 : discriminant.equals(0) ? 1 : 0;
  assert.equal(Number(itemValue(model, 'Number of intersections')), count, `${label}: the count`);
  const steps = model.steps.join(' ');
  // "Move every term to one side: Ax² + Bx + C = 0" and "The discriminant is (B)² − 4(A)(C) = D".
  const moved = steps.match(/Move every term to one side: (.+?) = 0\./);
  const poly = (text, x) => F(math.evaluate(plain(text), { x: F(x) }));
  [0, 1, -1, 2].forEach((x) => assert.ok(poly(moved[1], x).equals(A.mul(x * x).add(B.mul(x)).add(C)), `${label}: ${moved[1]} at x = ${x}`));
  const disc = steps.match(/The discriminant is (.+?) = (\S+?), which/);
  assert.ok(value(disc[1]).equals(discriminant) && value(disc[2]).equals(discriminant), `${label}: discriminant ${discriminant.toFraction()} in "${disc[0]}"`);
  // The quadratic formula as written evaluates to the roots it names.
  const formula = steps.match(/quadratic formula: x = \((\S+) ± (\S+)\) ÷ \(?(\S+?)\)?, so x (?:=|≈)/);
  if (formula && !formula[2].startsWith('√')) {
    const [minusB, root, denominator] = [value(formula[1]), value(formula[2]), value(formula[3])];
    assert.ok(minusB.equals(B.neg()) && root.mul(root).equals(discriminant) && denominator.equals(A.mul(2)), `${label}: ${formula[0]}`);
  }
  // An irrational root: the radicand is the whole discriminant ("√(73/9)",
  // never "√73/9", which reads as √73 ÷ 9), and the rounded roots follow.
  const surd = steps.match(/quadratic formula: x = \((\S+) ± √(\S+)\) ÷ (\(\S+\)|\S+), so x ≈ (\S+) or x ≈ (\S+?)\.(?:\s|$)/);
  if (surd) {
    const radicand = surd[2].match(/^\((.+)\)$/)?.[1] ?? surd[2];
    assert.ok(!radicand.includes('/') || surd[2].startsWith('('), `${label}: a fraction under √ is bracketed in "${surd[0]}"`);
    assert.ok(value(radicand).equals(discriminant), `${label}: √ of the discriminant in "${surd[0]}"`);
    const [minusB, denominator] = [Number(value(surd[1])), Number(value(surd[3]))];
    assert.ok(minusB === Number(B.neg()) && denominator === Number(A.mul(2)), `${label}: ${surd[0]}`);
    const roots = [-1, 1].map((sign) => (minusB + sign * Math.sqrt(Number(discriminant))) / denominator).sort((p, q) => p - q);
    const statedRoots = [surd[4], surd[5]].map((text) => Number(plain(text))).sort((p, q) => p - q);
    roots.forEach((root, index) => assert.ok(Math.abs(root - statedRoots[index]) <= 0.005 + 1e-9, `${label}: x ≈ ${root} in "${surd[0]}"`));
  }
  if (!count) {
    assertAccepted(question, { count: 0, points: [] }, label);
    return count;
  }
  const exactRoots = count === 1 || Number.isInteger(Math.sqrt(Number(discriminant.n))) && Number.isInteger(Math.sqrt(Number(discriminant.d)));
  if (exactRoots) {
    // Each "x = r gives y = … = v" and each parabola check, exactly.
    const roots = count === 1 ? [B.neg().div(A.mul(2))]
      : [1, -1].map((sign) => B.neg().add(F(Math.sqrt(Number(discriminant.n))).div(Math.sqrt(Number(discriminant.d))).mul(sign)).div(A.mul(2)));
    const stated = pointsIn(itemValue(model, count === 1 ? 'Intersection point' : 'Intersection points'))
      .filter((_, index, list) => list.length === count || index % 2 === 0);
    roots.forEach((root) => {
      const y = m.mul(root).add(k);
      assert.ok(A.mul(root).mul(root).add(B.mul(root)).add(C).equals(0), `${label}: ${root.toFraction()} is a root`);
      const found = [...steps.matchAll(/x = (\S+) gives y = ([^;]*?) = (\S+?)(?:;|\.(?:\s|$))/g)].find((match) => value(match[1]).equals(root));
      assert.ok(found, `${label}: a y-value for x = ${root.toFraction()}`);
      assert.ok(value(found[2]).equals(y) && value(found[3]).equals(y), `${label}: ${found[0]}`);
    });
    model.why.replace(/^Each point is on both graphs: /, '').split('; ').forEach((part) => {
      const match = part.match(/^at x = (\S+) the parabola gives (.+) = (\S+), the same y/);
      assert.ok(match, `${label}: "${part}"`);
      const x = value(match[1]);
      assert.ok(value(match[2]).equals(a.mul(x).mul(x).add(qb.mul(x)).add(qc)) && value(match[3]).equals(m.mul(x).add(k)), `${label}: ${part}`);
    });
    assert.ok(stated.length >= count, `${label}: points stated`);
  }
  const value2 = itemValue(model, count === 1 ? 'Intersection point' : 'Intersection points');
  const points = value2.split(' and ').map((text) => pointsIn(text).at(-1)).map(([x, y]) => ({ x, y }));
  assertAccepted(question, { count, points }, label);
  return count;
};

test('linearQuadratic: 300 seeded line-and-parabola pairs — the moved quadratic, discriminant, roots and y-values recomputed; graded correct', () => {
  const random = prng(0x44);
  const seen = new Set();
  for (let index = 0; index < 300; index += 1) {
    const a = pick(random, [1, -1, 2, -2, 3, 0.5]);
    let config;
    if (index % 3 === 0) {
      // Integer roots r1, r2 (or a tangent r1 = r2): line chosen to make them.
      const [r1, r2] = [int(random, -5, 5), random() < 0.3 ? null : int(random, -5, 5)];
      const second = r2 ?? r1;
      const qb = int(random, -6, 6);
      const qc = int(random, -9, 9);
      // a(x − r1)(x − r2) = ax² + qb·x + qc − (m·x + k)
      const m = qb + a * (r1 + second);
      const k = qc - a * r1 * second;
      config = { line: { m, b: k }, quadratic: { a, b: qb, c: qc } };
    } else {
      config = { line: { m: int(random, -4, 4), b: int(random, -8, 8) }, quadratic: { a, b: int(random, -5, 5), c: int(random, -8, 8) } };
    }
    seen.add(auditLinearQuadratic(config, `lq ${index} ${JSON.stringify(config)}`));
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2], 'every count drawn');
});

/* =============================================== inequalities: legacy */

const holds = (relation, left, right) => ({ '<': left < right, '<=': left <= right, '>': left > right, '>=': left >= right })[relation];
const SYMBOL = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' };

const auditLegacy = (question, label) => {
  const model = buildSystemsWorkspaceReview(question);
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);
  const lines = question.inequalities.map(({ m, b, relation }) => ({ m: F(m), b: F(b), relation }));
  const inside = ([x, y]) => lines.every((line) => holds(line.relation, F(y).compare(line.m.mul(x).add(line.b)), 0));
  const work = {};
  if (hasItem(model, 'Inequality 1: two boundary points')) {
    work.construction = lines.map((line, index) => {
      const k = index + 1;
      const points = pointsIn(itemValue(model, `Inequality ${k}: two boundary points`));
      assert.equal(points.length, 2, `${label}: two points`);
      assert.notEqual(points[0][0], points[1][0], `${label}: two different points`);
      points.forEach(([x, y]) => assert.ok(F(y).equals(line.m.mul(x).add(line.b)), `${label}: (${x}, ${y}) is on y = ${line.m.toFraction()}x + ${line.b.toFraction()}`));
      const style = itemValue(model, `Inequality ${k}: boundary style`);
      assert.equal(style, line.relation.includes('=') ? 'Solid' : 'Dashed', `${label}: style ${k}`);
      const shade = itemValue(model, `Inequality ${k}: shade`);
      assert.equal(shade, line.relation.includes('>') ? 'Above the boundary' : 'Below the boundary', `${label}: shade ${k}`);
      return { points: points.map(([x, y]) => ({ x, y })), boundaryStyle: style.toLowerCase(), shade: shade.startsWith('Above') ? 'above' : 'below' };
    });
  }
  const testItem = model.items.find((item) => item.label.startsWith('Is the marked point'));
  if (testItem) {
    const [point] = pointsIn(testItem.label);
    assert.deepEqual(point, [Number(question.testPoint?.x ?? point[0]), Number(question.testPoint?.y ?? point[1])], `${label}: the marked point`);
    assert.equal(testItem.value, inside(point) ? 'Yes' : 'No', `${label}: the marked point's verdict`);
    work.testChoice = testItem.value === 'Yes' ? 'yes' : 'no';
  }
  if (hasItem(model, 'A point in the feasible region')) {
    const [point] = pointsIn(itemValue(model, 'A point in the feasible region'));
    assert.ok(inside(point), `${label}: the example point is in the region`);
    work.candidate = { x: point[0], y: point[1] };
  }
  // Each "y (rel) expr = v is true/false" check, recomputed.
  model.steps.join(' ').split(/; |: /).forEach((piece) => {
    const match = piece.match(/^(−?[\d/]+) (≥|≤|>|<) (.+?) is (true|false)/);
    if (!match) return;
    const [, left, symbol, right, verdict] = match;
    const chain = right.split(' = ');
    const rightValue = value(chain.at(-1));
    if (chain.length > 1) assert.ok(value(chain[0]).equals(rightValue), `${label}: ${right}`);
    const relation = Object.keys(SYMBOL).find((key) => SYMBOL[key] === symbol);
    assert.equal(holds(relation, value(left).compare(rightValue), 0), verdict === 'true', `${label}: "${piece}"`);
  });
  assertAccepted(question, work, label);
};

const LEGACY_SLOPES = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 1 / 3, -2 / 3];
test('inequalities (legacy): 200 seeded systems — boundary points, style, shading, verdicts and the example point recomputed; graded correct', () => {
  const random = prng(0x55);
  for (let index = 0; index < 200; index += 1) {
    const count = int(random, 1, 3);
    const inequalities = Array.from({ length: count }, () => ({ m: pick(random, LEGACY_SLOPES), b: int(random, -5, 5), relation: pick(random, ['<', '<=', '>', '>=']) }));
    const interaction = pick(random, ['construct', 'analyze']);
    const question = sw({ mode: 'inequalities', interaction, inequalities, testPoint: { x: int(random, -6, 6), y: int(random, -6, 6) } });
    if (interaction === 'analyze') {
      // The own point is an example strictly inside the region, on the graph's grid;
      // with none (the region is a sliver between grid lines) the review is honestly null.
      const lines = inequalities.map(({ m, b, relation }) => ({ m: F(m), b: F(b), relation }));
      let any = false;
      // The default graph, x from −6 to 8 and y from −4 to 10: the plane snaps a tap to it.
      for (let x = -6; x <= 8 && !any; x += 1) for (let y = -4; y <= 10 && !any; y += 1) any = lines.every((line) => holds(line.relation.replace('=', ''), F(y).compare(line.m.mul(x).add(line.b)), 0));
      if (!any) {
        assert.equal(buildSystemsWorkspaceReview(question), null, `legacy ${index}: no own point exists, no review`);
        continue;
      }
    }
    auditLegacy(question, `legacy ${index} ${JSON.stringify(question.inequalities)} ${interaction}`);
  }
});

/* ============================================ inequalities: student build */

// Constraint A·x + B·y + C (rel) 0, from an authored inequality.
const constraintOf = (inequality) => {
  if (inequality.orientation === 'vertical') return { A: F(1), B: F(0), C: F(-inequality.x), relation: inequality.relation };
  if (inequality.orientation === 'horizontal') return { A: F(0), B: F(1), C: F(-inequality.y), relation: inequality.relation };
  return { A: F(inequality.m).neg(), B: F(1), C: F(inequality.b).neg(), relation: inequality.relation };
};
const satisfies = (constraint, [x, y]) => holds(constraint.relation, constraint.A.mul(x).add(constraint.B.mul(y)).add(constraint.C).compare(0), 0);
const onLine = (constraint, [x, y]) => constraint.A.mul(x).add(constraint.B.mul(y)).add(constraint.C).equals(0);

const auditStudentBuild = (question, label) => {
  const model = buildSystemsWorkspaceReview(question);
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);
  const constraints = question.inequalities.map(constraintOf);
  const work = { build: [], regionClassification: '', vertices: [] };
  work.build = constraints.map((constraint, index) => {
    const k = index + 1;
    const entry = {
      method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '',
      point1Plotted: false, point2Plotted: false, boundaryAttempts: 0, style: '', styleAttempts: 0, shadePoint: null, shadeAttempts: 0, visible: true,
    };
    if (hasItem(model, `Constraint ${k}: boundary`)) {
      const text = itemValue(model, `Constraint ${k}: boundary`);
      const line = text.match(/^(Vertical|Horizontal) line [xy] = (\S+)$/);
      if (line) {
        const c = value(line[2]);
        assert.ok(line[1] === 'Vertical' ? constraint.B.equals(0) && constraint.A.mul(c).add(constraint.C).equals(0) : constraint.A.equals(0) && constraint.B.mul(c).add(constraint.C).equals(0), `${label}: ${text}`);
        Object.assign(entry, { method: line[1].toLowerCase(), constant: typed(Number(c.valueOf())) });
      } else {
        const [[x1, y1], [x2, y2]] = pointsIn(text.split(' through ')[1]);
        assert.ok(onLine(constraint, [x1, y1]) && onLine(constraint, [x2, y2]) && (x1 !== x2 || y1 !== y2), `${label}: ${text}`);
        Object.assign(entry, { method: 'points', x1, y1, x2, y2, point1Plotted: true, point2Plotted: true });
      }
      entry.boundaryAttempts = 1;
    }
    if (hasItem(model, `Constraint ${k}: line`)) {
      const style = itemValue(model, `Constraint ${k}: line`);
      assert.equal(style, constraint.relation.includes('=') ? 'Solid' : 'Dashed', `${label}: style ${k}`);
      Object.assign(entry, { style: style.toLowerCase(), styleAttempts: 1 });
    }
    if (hasItem(model, `Constraint ${k}: shading`)) {
      const text = itemValue(model, `Constraint ${k}: shading`);
      const [point] = pointsIn(text.split('containing ')[1]);
      assert.ok(satisfies(constraint, point) && !onLine(constraint, point), `${label}: shade point ${point} is strictly on the solution side`);
      Object.assign(entry, { shadePoint: point, shadeAttempts: 1 });
    }
    return entry;
  });
  if (hasItem(model, 'Solution region')) {
    work.regionClassification = { 'Bounded region': 'bounded', 'Unbounded region': 'unbounded', 'No solution': 'empty' }[itemValue(model, 'Solution region')];
  }
  const marked = model.items.find((item) => /^Marked point .*: each inequality$/.test(item.label));
  if (marked) {
    const prefix = marked.label.replace(/: each inequality$/, '');
    const [point] = pointsIn(prefix);
    const verdicts = constraints.map((constraint) => (satisfies(constraint, point) ? 'Yes' : 'No'));
    assert.equal(marked.value, verdicts.join(', '), `${label}: the marked point, inequality by inequality`);
    assert.equal(itemValue(model, `${prefix}: the whole system`), verdicts.every((verdict) => verdict === 'Yes') ? 'Yes' : 'No', `${label}: the marked point overall`);
    const probe = hasItem(model, `${prefix}: on a boundary line?`);
    if (probe) assert.ok(constraints.some((constraint) => onLine(constraint, point)), `${label}: "on a boundary" only for a point on one`);
    work.teacherPointResponse = {
      perInequality: marked.value.split(', ').map((text) => text.toLowerCase()),
      overall: itemValue(model, `${prefix}: the whole system`).toLowerCase(),
      onBoundary: probe ? 'yes' : '',
      boundaryIncluded: probe ? itemValue(model, `${prefix}: included in the region?`).toLowerCase() : '',
    };
  }
  if (hasItem(model, 'Your own test point (example)')) {
    const [point] = pointsIn(itemValue(model, 'Your own test point (example)'));
    const verdicts = constraints.map((constraint) => (satisfies(constraint, point) ? 'Yes' : 'No'));
    assert.equal(itemValue(model, 'Your point: each inequality'), verdicts.join(', '), `${label}: own point verdicts`);
    work.studentTestPoint = point;
    work.studentPointResponse = { perInequality: verdicts.map((text) => text.toLowerCase()), overall: verdicts.every((verdict) => verdict === 'Yes') ? 'yes' : 'no', onBoundary: '', boundaryIncluded: '' };
  }
  if (hasItem(model, 'Vertices')) {
    const text = itemValue(model, 'Vertices');
    work.vertices = text === 'none' ? [] : text.split('; ').map((part) => {
      const [[x, y]] = pointsIn(part);
      // A corner: where two boundaries meet. A corner shown rounded ("≈ (1.67, 1)")
      // is checked as that intersection, to the rounding.
      const corners = [];
      constraints.forEach((first, i) => constraints.slice(i + 1).forEach((second) => {
        const det = first.A.mul(second.B).sub(first.B.mul(second.A));
        if (det.equals(0)) return;
        corners.push([first.B.mul(second.C).sub(first.C.mul(second.B)).div(det), first.C.mul(second.A).sub(first.A.mul(second.C)).div(det)]);
      }));
      const point = corners.find(([cx, cy]) => Math.abs(cx.valueOf() - x) <= 0.006 && Math.abs(cy.valueOf() - y) <= 0.006);
      assert.ok(point, `${label}: ${part} is where two boundaries meet`);
      if (!part.startsWith('≈')) assert.ok(point[0].equals(F(x)) && point[1].equals(F(y)), `${label}: ${part} is exact`);
      const closed = constraints.every((constraint) => satisfies({ ...constraint, relation: constraint.relation.replace(/^([<>])$/, '$1=') }, point));
      assert.ok(closed, `${label}: ${part} is a corner of the region`);
      const included = constraints.every((constraint) => satisfies(constraint, point));
      assert.equal(part.endsWith(' not included'), !included, `${label}: ${part}`);
      return { x, y, includedAnswer: included ? 'yes' : 'no' };
    });
  }
  assertAccepted(question, work, label);
};

test('inequalities (student build): 200 seeded systems — every boundary, shade point, verdict and vertex recomputed; graded correct', () => {
  const random = prng(0x66);
  let reviewed = 0;
  for (let index = 0; index < 200; index += 1) {
    const count = int(random, 1, 3);
    const inequalities = Array.from({ length: count }, () => {
      const shape = int(random, 0, 5);
      const relation = pick(random, ['<', '<=', '>', '>=']);
      if (shape === 0) return { orientation: 'vertical', x: int(random, -5, 5), relation };
      if (shape === 1) return { orientation: 'horizontal', y: int(random, -5, 5), relation };
      return { m: pick(random, [-2, -1, -0.5, 0.5, 1, 2, 3]), b: int(random, -4, 4), relation };
    });
    const question = sw({
      mode: 'inequalities',
      studentBuild: { boundary: true, lineStyle: true, shading: true },
      reasoning: { classifyRegion: random() < 0.5, vertices: random() < 0.5, testPoint: random() < 0.5 },
      inequalities,
      testPoint: random() < 0.5 ? { x: int(random, -4, 4), y: int(random, -4, 4) } : undefined,
    });
    if (!buildSystemsWorkspaceReview(question)) continue;
    auditStudentBuild(question, `build ${index} ${JSON.stringify(inequalities)}`);
    reviewed += 1;
  }
  assert.ok(reviewed > 150, `most student-build draws reviewed (${reviewed})`);
});

/* ============================================================ algebraic */

const VARS2 = ['x', 'y'];
const VARS3 = ['x', 'y', 'z'];

// Σ a·v = c written the ways a teacher writes it.
const writeEquation = (random, coefficients, constant, vars) => {
  const term = (a, name, first) => {
    if (a === 0) return '';
    const body = Math.abs(a) === 1 ? name : `${Math.abs(a)}${name}`;
    if (first) return a < 0 ? `-${body}` : body;
    return a < 0 ? ` - ${body}` : ` + ${body}`;
  };
  const left = (terms) => {
    let text = '';
    terms.forEach(([a, name]) => { text += term(a, name, !text); });
    return text || '0';
  };
  const pairs = vars.map((name, index) => [coefficients[index], name]);
  const lastIndex = vars.length - 1;
  // "y = 2x - 3": the last variable alone, when its coefficient is 1.
  if (coefficients[lastIndex] === 1 && random() < 0.4) {
    const rest = pairs.slice(0, lastIndex).map(([a, name]) => [-a, name]);
    const text = left(rest.filter(([a]) => a !== 0));
    const tail = constant === 0 ? '' : constant < 0 ? ` - ${-constant}` : ` + ${constant}`;
    return `${vars[lastIndex]} = ${text === '0' ? String(constant) : `${text}${tail}`}`;
  }
  return `${left(pairs)} = ${constant}`;
};

const augmentedRows = (equations, vars) => equations.map((text) => {
  const [left, right] = text.split('=');
  return linearRow(left, right, vars);
});

const auditAlgebraic = (question, vars, label) => {
  const model = buildSystemsWorkspaceReview(question);
  const rows = augmentedRows(question.equations, vars);
  const coefficientRank = rank(rows.map((row) => row.slice(0, -1)));
  const augmentedRank = rank(rows);
  const truth = augmentedRank > coefficientRank ? 'none' : coefficientRank < vars.length ? 'infinite' : 'one';
  if (truth !== 'one' && vars.length === 3 && question.method !== 'elimination') {
    assert.equal(model, null, `${label}: a nonunique 3×3 outside elimination is not graded`);
    return truth;
  }
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);
  assertDerivationsFollow(model, vars, rows, label);
  const count = vars.length;
  if (truth === 'one') {
    // The solution: the unique point, by elimination here.
    const reduced = rref(count === 3 ? rows.map((row) => [...row.slice(0, 3), row[3].neg()]) : [...rows.map((row) => [row[0], row[1], F(0), row[2].neg()]), [F(0), F(0), F(1), F(0)]]);
    const solution = vars.map((_, index) => reduced[index][3]);
    const stated = itemValue(model, `Solution (${vars.join(', ')})`).match(/^\(([^()]+)\)$/)[1].split(',').map((part) => value(part.trim()));
    stated.forEach((entry, index) => assert.ok(entry.equals(solution[index]), `${label}: ${vars[index]} = ${solution[index].toFraction()}`));
    const verification = {};
    question.equations.forEach((text, index) => {
      const itemLabel = `Check Equation ${index + 1}`;
      if (!hasItem(model, itemLabel)) return;
      const match = itemValue(model, itemLabel).match(/^left side (\S+)(?: \(given\))?, right side (\S+)(?: \(given\))?$/);
      const scope = Object.fromEntries(vars.map((name, position) => [name, solution[position]]));
      const [left, right] = text.split('=');
      assert.ok(value(match[1]).equals(F(math.evaluate(plain(left), scope))) && value(match[2]).equals(F(math.evaluate(plain(right), scope))), `${label}: ${itemLabel}`);
      verification[`E${index + 1}`] = { left: plain(match[1]), right: plain(match[2]) };
    });
    const method = question.method === 'studentChoice' ? (count === 3 ? itemValue(model, 'Method').toLowerCase() : '') : question.method;
    const values = Object.fromEntries(vars.map((name, index) => [name, Number(solution[index].valueOf())]));
    const work = count === 3
      ? { dimension: 3, method, values, verification }
      : { dimension: 2, method, values, verification, reducedStatement: null, specialCase: { statementTruth: '', solutionCount: '', classification: '' } };
    assertAccepted(question, work, label);
    return truth;
  }
  const statement = itemValue(model, 'Statement with no variable');
  const constant = value(statement.replace(/^0 = /, ''));
  assert.equal(constant.equals(0), truth === 'infinite', `${label}: ${statement} for ${truth}`);
  if (count === 2) {
    assertAccepted(question, {
      dimension: 2, method: '', values: {}, verification: {}, reducedStatement: statement,
      specialCase: {
        statementTruth: itemValue(model, 'Is the statement true or false?').toLowerCase(),
        solutionCount: { 'No solution': 'none', 'Infinitely many solutions': 'infinite' }[itemValue(model, 'What does that mean for the system?')],
        classification: { Inconsistent: 'inconsistent', 'Consistent and dependent': 'consistent-dependent' }[itemValue(model, 'Classification')],
      },
    }, label);
    // The why's ratio: Equation 2 is r times Equation 1 in its variable terms.
    const ratio = model.why.match(/(?:is|are) (\S+) times/);
    const r = value(ratio[1]);
    assert.ok(rows[1].slice(0, -1).every((entry, index) => entry.equals(rows[0][index].mul(r))), `${label}: ${model.why}`);
    return truth;
  }
  // 3×3: each plane pair, recomputed.
  const relation = (first, second) => {
    const pairRank = rank([first.slice(0, 3), second.slice(0, 3)]);
    if (pairRank === 2) return 'line';
    return rank([first, second]) === 1 ? 'coincident' : 'parallel';
  };
  [[0, 1], [0, 2], [1, 2]].forEach(([p, q]) => {
    const text = itemValue(model, `Planes ${p + 1} and ${q + 1}`);
    const expected = relation(rows[p], rows[q]);
    const step = model.steps.find((line) => line.startsWith(`Planes ${p + 1} and ${q + 1}:`));
    assert.ok(step, `${label}: a step for planes ${p + 1} and ${q + 1}`);
    if (expected === 'line') assert.match(step, /not in one ratio/, `${label}: ${step}`);
    else {
      const match = step.match(/is (\S+) times plane \d's, and its constant (\S+) (is|is not) (\S+) × (\S+), so/);
      assert.ok(match, `${label}: ${step}`);
      const r = value(match[1]);
      assert.ok(rows[q].slice(0, 3).every((entry, index) => entry.equals(rows[p][index].mul(r))), `${label}: the ratio in "${step}"`);
      assert.ok(value(match[2]).equals(rows[q][3].neg()) && value(match[5]).equals(rows[p][3].neg()), `${label}: the constants in "${step}"`);
      assert.equal(match[3] === 'is', expected === 'coincident', `${label}: ${step}`);
    }
    assert.ok(text, `${label}: ${expected}`);
  });
  return truth;
};

test('algebraic 2×2: 300 seeded systems, every method — every derived equation follows, the answer recomputed; graded correct', () => {
  const random = prng(0x77);
  const seen = new Set();
  for (let index = 0; index < 300; index += 1) {
    const method = pick(random, ['elimination', 'substitution', 'studentChoice']);
    const solution = [int(random, -6, 6), int(random, -6, 6)];
    const coefficient = () => (random() < 0.1 ? 0 : int(random, -6, 6));
    let first = [coefficient(), coefficient()];
    if (first.every((entry) => entry === 0)) first = [1, 1];
    let second = [coefficient(), coefficient()];
    let shift = 0;
    if (index % 4 === 0) {
      const k = pick(random, [2, -1, 3, -2]);
      second = first.map((entry) => entry * k);
      shift = random() < 0.5 ? 0 : int(random, 1, 4);
    } else if (first[0] * second[1] - first[1] * second[0] === 0) continue;
    if (second.every((entry) => entry === 0)) continue;
    const constantOf = (coefficients) => coefficients[0] * solution[0] + coefficients[1] * solution[1];
    const equations = [
      writeEquation(random, first, constantOf(first), VARS2),
      writeEquation(random, second, constantOf(second) + shift, VARS2),
    ];
    const question = sw({ mode: 'algebraic', method, equations, requireVerification: random() < 0.7 });
    if (!buildSystemsWorkspaceReview(question)) {
      // The only honest nulls: a one-variable equation the workspace solves directly whose partner has no other variable.
      assert.fail(`algebraic 2×2 ${index}: no review for ${JSON.stringify(question.equations)} (${method})`);
    }
    seen.add(auditAlgebraic(question, VARS2, `algebraic2 ${index} ${JSON.stringify(equations)} ${method}`));
  }
  assert.deepEqual([...seen].sort(), ['infinite', 'none', 'one']);
});

test('algebraic 3×3: 200 seeded systems, every method — every derived equation follows, the answer and plane pairs recomputed; graded correct', () => {
  const random = prng(0x88);
  const seen = new Set();
  let reviewed = 0;
  for (let index = 0; index < 200; index += 1) {
    const special = index % 4 === 0;
    const method = special ? 'elimination' : pick(random, ['elimination', 'substitution', 'studentChoice']);
    const solution = [int(random, -4, 4), int(random, -4, 4), int(random, -4, 4)];
    const coefficient = () => (random() < 0.12 ? 0 : int(random, -4, 4));
    const rows = Array.from({ length: 3 }, () => [coefficient(), coefficient(), coefficient()]);
    const shifts = [0, 0, 0];
    if (special) {
      const [p, q] = [nonzero(random, -2, 2), int(random, -2, 2)];
      rows[2] = rows[0].map((entry, column) => p * entry + q * rows[1][column]);
      shifts[2] = random() < 0.5 ? 0 : int(random, 1, 3);
    }
    if (rows.some((row) => row.every((entry) => entry === 0))) continue;
    const coefficientRank = rank(rows);
    if (!special && coefficientRank < 3) continue;
    if (special && coefficientRank < 2) continue;
    const equations = rows.map((row, position) => writeEquation(random, row, row.reduce((sum, entry, column) => sum + entry * solution[column], 0) + shifts[position], VARS3));
    const question = sw({ mode: 'algebraic', method, equations, requireVerification: random() < 0.7 });
    const model = buildSystemsWorkspaceReview(question);
    if (!model) continue;
    reviewed += 1;
    seen.add(auditAlgebraic(question, VARS3, `algebraic3 ${index} ${JSON.stringify(equations)} ${method}`));
  }
  assert.ok(reviewed > 120, `most 3×3 draws reviewed (${reviewed})`);
  assert.deepEqual([...seen].sort(), ['infinite', 'none', 'one']);
});

test('a negative number after × or ÷ is bracketed: "2 × (−1)", "÷ (−4)", "−1 × (−15)"', () => {
  // Defect found by this audit: the quadratic formula, the 2×2 "why" and the
  // plane-pair steps wrote "÷ (2 × −1)", "÷ −4" and "−1 × −15".
  const steps = (question) => {
    const model = buildSystemsWorkspaceReview(question);
    assertClean(model, JSON.stringify(question));
    return [...model.steps, model.why].join(' ');
  };
  assert.match(steps(sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: -1, b: 8 }, quadratic: { a: -1, b: -3, c: 7 } } })), /x = −\(−2\) ÷ \(2 × \(−1\)\) = −1\./);
  assert.match(steps(sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: -1, b: 0 }, quadratic: { a: -2, b: 3, c: 1 } } })), /x = \(−4 ± √24\) ÷ \(−4\), so/);
  assert.match(steps(sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 0, b: 0 }, quadratic: { a: -1, b: 0, c: 4 } } })), /x = \(0 ± 4\) ÷ \(−2\), so x = −2 or x = 2\./);
  assert.match(steps(sw({ mode: 'algebraic', method: 'studentChoice', equations: ['-2x + 3y = -15', '2x - 3y = 16'] })), /is not −1 × \(−15\), so no pair/);
  assert.match(steps(sw({ mode: 'algebraic', method: 'elimination', equations: ['x + y + z = -3', '2x + 2y + 2z = 5', 'x - y + z = 1'] })), /its constant 5 is not 2 × \(−3\), so they/);
});

test('linearQuadratic: the discriminant is written like its coefficients, and a fraction under √ is bracketed', () => {
  // Found by the verifier: beside decimal coefficients the discriminant was
  // a fraction ("(−0.45)² − 4(0.5)(5.25) = −4119/400"); and a fractional
  // discriminant under the root read "√73/9", which is √73 ÷ 9.
  const steps = (linearQuadratic) => {
    const question = sw({ mode: 'linearQuadratic', linearQuadratic });
    auditLinearQuadratic(linearQuadratic, JSON.stringify(linearQuadratic));
    return buildSystemsWorkspaceReview(question).steps.join(' ');
  };
  assert.match(steps({ line: { m: 0.2, b: -0.25 }, quadratic: { a: 0.5, b: -0.25, c: 5 } }), /\(−0\.45\)² − 4\(0\.5\)\(5\.25\) = −10\.2975, which is negative/);
  assert.match(steps({ line: { m: 0.2, b: 3 }, quadratic: { a: 0.5, b: -0.25, c: 1 } }), /= 4\.2025, which is positive/);
  // Beside fractions it stays a fraction, bracketed under the root.
  const thirds = steps({ line: { m: 1 / 3, b: 3 }, quadratic: { a: 1, b: 0, c: 1 } });
  assert.match(thirds, /\(−1\/3\)² − 4\(1\)\(−2\) = 73\/9, which is positive/);
  assert.match(thirds, /x = \(1\/3 ± √\(73\/9\)\) ÷ 2, so x ≈ −1\.26 or x ≈ 1\.59\./);
});

test('spatial: 150 seeded three-plane models — the point (or no point) stated is the system\'s own, its checks are true; graded correct', () => {
  const random = prng(0x99);
  let reviewed = 0;
  for (let index = 0; index < 150; index += 1) {
    const solution = [int(random, -4, 4), int(random, -4, 4), int(random, -4, 4)];
    const rows = Array.from({ length: 3 }, () => [int(random, -4, 4), int(random, -4, 4), int(random, -4, 4)]);
    const shifts = [0, 0, index % 3 === 0 ? int(random, 0, 2) : 0];
    if (index % 3 === 0) rows[2] = rows[0].map((entry, column) => 2 * entry - rows[1][column]);
    if (rows.some((row) => row.every((entry) => entry === 0))) continue;
    const equations = rows.map((row, position) => writeEquation(random, row, row.reduce((sum, entry, column) => sum + entry * solution[column], 0) + shifts[position], VARS3));
    const augmented = augmentedRows(equations, VARS3);
    const coefficientRank = rank(augmented.map((row) => row.slice(0, 3)));
    const truth = rank(augmented) > coefficientRank ? 'none' : coefficientRank < 3 ? 'infinite' : 'one';
    const answer = { one: 'one point', none: 'no point', infinite: 'a line of points' }[truth];
    const question = sw({
      mode: 'spatial', spatialModel: { kind: 'threePlanes' }, studentActions: ['connectRepresentations'], equations, variables: VARS3,
      answerFields: [{ id: 'meet', label: 'Where do the planes meet?', options: ['one point', 'no point', 'a line of points'], answer }],
    });
    const model = buildSystemsWorkspaceReview(question);
    assert.ok(model, `spatial ${index}: a review`);
    const label = `spatial ${index} ${JSON.stringify(equations)}`;
    assertClean(model, label);
    assertDerivationsFollow(model, VARS3, augmented, label);
    const first = model.steps[0];
    if (truth === 'one') {
      const [point] = pointsIn(first.match(/single point (\([^)]*\))/)[1]);
      const reduced = rref(augmented.map((row) => [...row.slice(0, 3), row[3].neg()]));
      point.forEach((coordinate, position) => assert.ok(F(coordinate).equals(reduced[position][3]), `${label}: coordinate ${position + 1}`));
      reviewed += 1;
    } else if (/The three planes are/.test(first)) {
      assert.match(first, truth === 'none' ? /no point in common/ : /infinitely many points/, label);
    }
    assert.equal(itemValue(model, 'Where do the planes meet?'), answer, label);
    assertAccepted(question, { responses: [{ id: 'meet', value: answer }] }, label);
  }
  assert.ok(reviewed > 50, `unique systems reviewed (${reviewed})`);
});

test('inequalities (student build, rewrite and model): 150 seeded constraints — each rewrite is the same half-plane with y alone; graded correct', () => {
  const random = prng(0xaa);
  const SYMBOLS = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' };
  const FLIPPED = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };
  let reviewed = 0;
  for (let index = 0; index < 150; index += 1) {
    const count = int(random, 1, 2);
    const expectedConstraints = Array.from({ length: count }, () => ({ A: int(random, -4, 4), B: nonzero(random, -3, 3), C: int(random, -8, 8), relation: pick(random, ['<', '<=', '>', '>=']) }));
    const question = sw({
      mode: 'inequalities', studentBuild: { rewrite: true, boundary: true, lineStyle: true, shading: true },
      sourceConstraints: expectedConstraints.map(({ A, B, C, relation }) => `${writeEquation(() => 1, [A, B], -C, ['x', 'y']).replace(' = ', ` ${relation} `)}`),
      expectedConstraints,
    });
    const model = buildSystemsWorkspaceReview(question);
    if (!model) continue;
    reviewed += 1;
    const label = `rewrite ${index} ${JSON.stringify(expectedConstraints)}`;
    assertClean(model, label);
    const rewrite = expectedConstraints.map(({ A, B, C, relation }, position) => {
      const text = itemValue(model, `Constraint ${position + 1} rewritten`);
      const match = text.match(/^y (≥|≤|>|<) (.+)$/);
      assert.ok(match, `${label}: y alone in "${text}"`);
      const row = linearRow('y', match[2], ['x', 'y']);
      const [m, b] = [row[0].neg(), row[2].neg()];
      assert.ok(m.equals(F(-A).div(B)) && b.equals(F(-C).div(B)), `${label}: ${text} has the boundary of ${A}x + ${B}y + ${C} = 0`);
      const expectedRelation = B < 0 ? FLIPPED[relation] : relation;
      assert.equal(match[1], SYMBOLS[expectedRelation], `${label}: the symbol (dividing by a negative reverses it)`);
      return { relation: text, graphingForm: { A: Number(m.neg().valueOf()), B: 1, C: Number(b.neg().valueOf()), relation: expectedRelation } };
    });
    // The rewritten constraints, built: the same audit as the authored ones.
    const inequalities = rewrite.map(({ graphingForm }) => ({ A: F(graphingForm.A), B: F(1), C: F(graphingForm.C), relation: graphingForm.relation }));
    const build = inequalities.map((constraint, position) => {
      const k = position + 1;
      const entry = { method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '', point1Plotted: false, point2Plotted: false, boundaryAttempts: 1, style: '', styleAttempts: 1, shadePoint: null, shadeAttempts: 1, visible: true };
      const boundary = itemValue(model, `Constraint ${k}: boundary`);
      const horizontal = boundary.match(/^Horizontal line y = (\S+)$/);
      if (horizontal) Object.assign(entry, { method: 'horizontal', constant: typed(Number(value(horizontal[1]).valueOf())) });
      else {
        const [[x1, y1], [x2, y2]] = pointsIn(boundary.split(' through ')[1]);
        assert.ok(onLine(constraint, [x1, y1]) && onLine(constraint, [x2, y2]), `${label}: ${boundary}`);
        Object.assign(entry, { method: 'points', x1, y1, x2, y2, point1Plotted: true, point2Plotted: true });
      }
      const style = itemValue(model, `Constraint ${k}: line`);
      assert.equal(style, constraint.relation.includes('=') ? 'Solid' : 'Dashed', label);
      const [shade] = pointsIn(itemValue(model, `Constraint ${k}: shading`).split('containing ')[1]);
      assert.ok(satisfies(constraint, shade) && !onLine(constraint, shade), `${label}: shade point ${shade}`);
      return { ...entry, style: style.toLowerCase(), shadePoint: shade };
    });
    assertAccepted(question, { build, rewrite, regionClassification: '', vertices: [] }, label);
  }
  assert.ok(reviewed > 100, `most rewrite draws reviewed (${reviewed})`);
});

test('grader: a 2×2 matrix with no variable in either row is classified by its constants (0 = 5 is no solution)', () => {
  // Defect found by this audit (functions/shared/toolMath/systemsWorkspace/systemsMath.mjs
  // solve2x2System): with every coefficient 0, all of its consistency minors
  // are 0, so [0 0 | 5], [0 0 | 3] was graded "infinitely many solutions".
  const classify = (matrix, classification) => grade(sw({ mode: 'matrix', matrix }), { classification, x: '', y: '' }).isCorrect;
  for (const [matrix, truth] of [
    [{ a11: 0, a12: 0, b1: 5, a21: 0, a22: 0, b2: 0 }, 'none'],
    [{ a11: 0, a12: 0, b1: 5, a21: 0, a22: 0, b2: 3 }, 'none'],
    [{ a11: 0, a12: 0, b1: 0, a21: 0, a22: 0, b2: -2 }, 'none'],
    [{ a11: 0, a12: 0, b1: 0, a21: 0, a22: 0, b2: 0 }, 'infinite'],
    // Unchanged: one row with a variable.
    [{ a11: 0, a12: 0, b1: 5, a21: 1, a22: 1, b2: 2 }, 'none'],
    [{ a11: 0, a12: 0, b1: 0, a21: 1, a22: 1, b2: 2 }, 'infinite'],
    [{ a11: 1, a12: 2, b1: 3, a21: 2, a22: 4, b2: 6 }, 'infinite'],
    [{ a11: 1, a12: 2, b1: 3, a21: 2, a22: 4, b2: 7 }, 'none'],
  ]) {
    assert.equal(classify(matrix, truth), true, `${JSON.stringify(matrix)} is ${truth}`);
    assert.equal(classify(matrix, truth === 'none' ? 'infinite' : 'none'), false, `${JSON.stringify(matrix)} is not the other`);
    // No review is written for these (no pivot in column 1 or a single real row), and none crashes.
    assert.doesNotThrow(() => buildSystemsWorkspaceReview(sw({ mode: 'matrix', matrix })));
  }
});

test('grader: an algebraic 2×2 whose equations both lose every variable is classified by its constants (0 = 5 is no solution)', () => {
  // The same defect in the algebraic grader's key (algebraicSystemsEngine.mjs
  // solveAlgebraicSystem): its consistency minors are all 0 when no variable
  // is left, so ['x - x = 5', 'y - y = 3'] was graded "infinitely many".
  const special = (equations, isTrue, statement) => grade(sw({ mode: 'algebraic', method: 'elimination', equations }), {
    reducedStatement: statement,
    specialCase: {
      statementTruth: isTrue ? 'true' : 'false',
      solutionCount: isTrue ? 'infinite' : 'none',
      classification: isTrue ? 'consistent-dependent' : 'inconsistent',
    },
  });
  for (const [equations, isTrue, statement] of [
    [['x - x = 5', 'y - y = 3'], false, '0 = 5'],
    [['0 = 5', '0 = 3'], false, '0 = 5'],
    [['0 = 0', '0 = -2'], false, '0 = -2'],
    [['x - x = 0', 'y - y = 0'], true, '0 = 0'],
    // Unchanged: one equation with a variable.
    [['0 = 5', 'x + y = 2'], false, '0 = 5'],
    [['x + 2y = 3', '2x + 4y = 6'], true, '0 = 0'],
    [['x + 2y = 3', '2x + 4y = 7'], false, '0 = 1'],
  ]) {
    const right = special(equations, isTrue, statement);
    assert.equal(right.isCorrect, true, `${equations.join(', ')}: ${JSON.stringify(right.parts?.map((part) => [part.id, part.isCorrect]))}`);
    const wrong = special(equations, !isTrue, statement);
    assert.equal(wrong.isCorrect, false, `${equations.join(', ')} is not ${isTrue ? 'none' : 'infinite'}`);
    assert.doesNotThrow(() => buildSystemsWorkspaceReview(sw({ mode: 'algebraic', method: 'elimination', equations })));
  }
});
