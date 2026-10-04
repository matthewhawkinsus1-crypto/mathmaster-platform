/*
 * SOLVING A GENERATED 2×2 SYSTEM IN THE SYSTEMS WORKSPACE (ALGEBRAIC MODE).
 *
 * Operates the real controls of AlgebraicSystemMode.jsx — the method choice,
 * the elimination board (Scale, distribute the factor, + / −, mark the
 * cancelling terms, type what remains), substitution (isolate in the embedded
 * Step Algebra, pick up the expression, drop it on the variable), the
 * embedded one-variable solves, back-substitution, the original-equation
 * checks, and the special-case readings — and nothing else.
 *
 * Every number typed is the student's own arithmetic, computed here with
 * mathjs fractions from the equations on screen; the family's key is only
 * used afterwards to judge the result.
 */
import { create, all } from 'mathjs';
import { setMathField, settle } from './relationWorkspaceDriver.mjs';
import { isolateInEquationWorkspace, linearLatex, solveLinearInEquationWorkspace } from './equationWorkspacePlanner.mjs';

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const isZero = (value) => math.equal(F(value), 0);
const text = (value) => {
  const fraction = F(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};
const latex = (value) => {
  const fraction = F(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}\\frac{${fraction.n}}{${fraction.d}}`;
};
/** "−12y", "x", "0": a coefficient times a variable, as a student writes it. */
const termText = (coefficient, variable) => {
  const value = F(coefficient);
  if (isZero(value)) return '0';
  const magnitude = text(math.abs(value));
  const body = magnitude === '1' ? variable : `${magnitude.includes('/') ? `(${magnitude})` : magnitude}${variable}`;
  return math.smaller(value, 0) ? `-${body}` : body;
};

/** a·x + b·y = c from "3x - 2y = 7", exactly. */
export const rowOf = (equation, [first, second] = ['x', 'y']) => {
  const [left, right] = equation.split('=');
  const at = (x, y) => F(math.evaluate(`(${left}) - (${right})`, { [first]: F(x), [second]: F(y) }));
  const c0 = at(0, 0);
  return { a: math.subtract(at(1, 0), c0), b: math.subtract(at(0, 1), c0), c: math.unaryMinus(c0) };
};

const embedded = (page) => page.locator('.mathmaster-systems-embedded-step-algebra').first();

export const chooseMethod = async (page, method, log = () => {}) => {
  const button = page.locator('button:visible').filter({ hasText: new RegExp(`^${method === 'elimination' ? 'Elimination' : 'Substitution'}$`) }).first();
  if (await button.count()) {
    await button.click();
    await settle(page, 600);
    log(`method: ${method}`);
  }
};

/**
 * Elimination: scale the rows so `target` cancels, add or subtract, mark the
 * two cancelling terms, and type what remains. Returns the combined row.
 */
export const eliminate = async (page, rows, target, log = () => {}) => {
  const key = target === 'x' ? 'a' : 'b';
  const other = target === 'x' ? 'y' : 'x';
  const otherKey = target === 'x' ? 'b' : 'a';
  await page.locator('button:visible').filter({ hasText: new RegExp(`^Eliminate ${target}$`) }).first().click();
  await settle(page, 600);
  // The least common multiple of the two target coefficients.
  const p = Math.abs(Number(F(rows[0][key]).n));
  const q = Math.abs(Number(F(rows[1][key]).n));
  const gcd = (u, v) => (v ? gcd(v, u % v) : u);
  const lcm = (p * q) / gcd(p, q);
  const factors = [lcm / p, lcm / q];
  const scaled = rows.map((row, index) => ({
    a: math.multiply(row.a, factors[index]),
    b: math.multiply(row.b, factors[index]),
    c: math.multiply(row.c, factors[index]),
  }));
  for (const index of [0, 1]) {
    if (factors[index] === 1) continue;
    const name = `Equation ${index + 1}`;
    await page.locator(`button[aria-label="Scale ${name}"]:visible`).first().click();
    await settle(page, 400);
    await setMathField(page, page.locator(`math-field[aria-label="Scale factor for ${name}"]:visible`).first(), String(factors[index]));
    await page.locator('button:visible', { hasText: 'Apply this factor' }).first().click();
    await settle(page, 500);
    await setMathField(page, page.locator(`math-field[aria-label="Scaled x term for ${name}"]:visible`).first(), termText(scaled[index].a, 'x'));
    await setMathField(page, page.locator(`math-field[aria-label="Scaled y term for ${name}"]:visible`).first(), termText(scaled[index].b, 'y'));
    await setMathField(page, page.locator(`math-field[aria-label="Scaled right side for ${name}"]:visible`).first(), text(scaled[index].c));
    await page.locator('button:visible', { hasText: 'Check my scaled terms' }).first().click();
    await settle(page, 600);
    log(`scale ${name} by ${factors[index]}`);
  }
  const sameSign = math.equal(math.sign(scaled[0][key]), math.sign(scaled[1][key]));
  const combined = {
    a: sameSign ? math.subtract(scaled[0].a, scaled[1].a) : math.add(scaled[0].a, scaled[1].a),
    b: sameSign ? math.subtract(scaled[0].b, scaled[1].b) : math.add(scaled[0].b, scaled[1].b),
    c: sameSign ? math.subtract(scaled[0].c, scaled[1].c) : math.add(scaled[0].c, scaled[1].c),
  };
  await page.locator(`button[aria-label="${sameSign ? 'Subtract Equation 2 from Equation 1' : 'Add Equation 2 to Equation 1'}"]:visible`).first().click();
  await settle(page, 600);
  for (let mark = 0; mark < 2; mark += 1) {
    await page.locator(`button[aria-label^="Mark the ${target} term"][aria-pressed="false"]:visible`).first().click();
    await settle(page, 300);
  }
  await setMathField(page, page.locator(`math-field[aria-label="Combined ${other} term"]:visible`).first(), termText(combined[otherKey], other));
  await setMathField(page, page.locator('math-field[aria-label="Combined right side"]:visible').first(), text(combined.c));
  await page.locator('button:visible', { hasText: 'Check my combination' }).first().click();
  await settle(page, 900);
  log(`${sameSign ? 'subtract' : 'add'} -> ${termText(combined[otherKey], other)} = ${text(combined.c)}`);
  return { ...combined, surviving: other, reduced: { coefficient: combined[otherKey], constant: combined.c } };
};

/** The variable a student would eliminate: the one whose two coefficients have the smaller common multiple. */
export const eliminationTarget = (rows) => {
  const gcd = (u, v) => (v ? gcd(v, u % v) : u);
  const cost = (key) => {
    const p = Math.abs(Number(F(rows[0][key]).n));
    const q = Math.abs(Number(F(rows[1][key]).n));
    return (p * q) / gcd(p, q);
  };
  return cost('a') <= cost('b') ? 'x' : 'y';
};

/**
 * Substitution: isolate the variable with the smallest coefficient (a unit
 * coefficient isolates without fractions), use that expression, and drop it
 * on the same variable in the other equation.
 */
export const substitute = async (page, rows, log = () => {}) => {
  const choices = [];
  rows.forEach((row, index) => [['x', 'a'], ['y', 'b']].forEach(([variable, key]) => {
    if (!isZero(row[key])) choices.push({ index, variable, size: Math.abs(Number(F(row[key]))) });
  }));
  choices.sort((p, q) => p.size - q.size || p.index - q.index);
  const { index, variable } = choices[0];
  const other = variable === 'x' ? 'y' : 'x';
  await page.locator(`button[aria-label="Isolate ${variable} in Equation ${index + 1}"]:visible`).first().click();
  await settle(page, 900);
  // An equation already solved for the variable skips the solver.
  if (await page.locator('.mathmaster-systems-embedded-step-algebra').count()) {
    const isolated = await isolateInEquationWorkspace(page, embedded(page), { variable, other, log: (line) => log(`  [isolate ${variable}] ${line}`) });
    // The solver stops as soon as the variable stands alone — (−6x − 3)/−1
    // counts. Writing that as 6x + 3 is the optional simplification a student
    // would choose before substituting.
    if (isolated.divided) {
      await page.locator('button:visible', { hasText: 'Simplify first (optional)' }).first().click();
      await settle(page, 400);
      await setMathField(page, page.locator('math-field[aria-label="Optional simplified expression to substitute"]:visible').first(), linearLatex(isolated, other));
      await page.locator('button:visible', { hasText: 'Check and use my simplification' }).first().click();
      await settle(page, 600);
      log(`simplify the isolated expression: ${variable} = ${linearLatex(isolated, other)}`);
    }
  }
  if (await page.locator('button:visible', { hasText: /^Use this expression$/ }).count()) {
    await page.locator('button:visible', { hasText: /^Use this expression$/ }).first().click();
    await settle(page, 500);
  }
  const token = page.locator('button[aria-label^="Pick up the expression"]:visible').first();
  const expression = (await token.getAttribute('aria-label')).replace(/^Pick up the expression /, '').replace(/ from the isolated equation$/, '');
  await token.click();
  await settle(page, 300);
  const target = 1 - index;
  await page.locator(`[role="group"][aria-label="Equation ${target + 1}: choose where the isolated expression belongs"]`)
    .locator(`[aria-label="Variable ${variable}. Place the selected value or expression here"]`).first().click();
  await settle(page, 1000);
  log(`isolate ${variable} in Equation ${index + 1} (${variable} = ${expression}), substitute into Equation ${target + 1}`);
  // What the substituted equation reduces to, by the student's own
  // arithmetic: v = A·w + B in a2·v + b2·w = c2 is (a2·A + b2)·w = c2 − a2·B.
  const source = rows[index];
  const [sourceV, sourceW] = variable === 'x' ? [source.a, source.b] : [source.b, source.a];
  const A = math.divide(math.unaryMinus(sourceW), sourceV);
  const B = math.divide(source.c, sourceV);
  const into = rows[target];
  const [targetV, targetW] = variable === 'x' ? [into.a, into.b] : [into.b, into.a];
  const reduced = { coefficient: math.add(math.multiply(targetV, A), targetW), constant: math.subtract(into.c, math.multiply(targetV, B)) };
  return { variable, expression, source: index, target, surviving: other, reduced };
};

/** The three readings of a statement with no variable. */
export const readSpecialCase = async (page, { isTrue }, log = () => {}) => {
  await page.getByLabel('Is this statement true or false?').selectOption(isTrue ? 'true' : 'false');
  await settle(page, 200);
  await page.getByLabel('What does that mean for the system?').selectOption(isTrue ? 'infinite' : 'none');
  await settle(page, 200);
  await page.getByLabel('How would you classify this system?').selectOption(isTrue ? 'consistent-dependent' : 'inconsistent');
  await settle(page, 300);
  log(`readings: ${isTrue ? 'true / infinitely many / consistent-dependent' : 'false / no solution / inconsistent'}`);
};

/** Solve the embedded one-variable equation the workspace opened. */
export const solveEmbedded = async (page, variable, log = () => {}) => {
  const host = embedded(page);
  await host.waitFor({ timeout: 15000 });
  await settle(page, 600);
  const result = await solveLinearInEquationWorkspace(page, host, { variable, log: (line) => log(`  [embedded ${variable}] ${line}`) });
  await settle(page, 900);
  return result;
};

export const checkMyWork = async (page, log = () => {}) => {
  await page.locator('button:visible', { hasText: 'Check my work' }).first().click();
  await settle(page, 1500);
  log('checked');
};

/**
 * Back-substitute: pick up the solved value and place it on its variable in
 * the equation whose other coefficient is simplest, then solve that equation.
 */
export const backSubstitute = async (page, rows, solved, log = () => {}) => {
  const remaining = solved.variable === 'x' ? 'y' : 'x';
  const remainingKey = remaining === 'x' ? 'a' : 'b';
  const index = math.abs(rows[0][remainingKey]) <= math.abs(rows[1][remainingKey]) ? 0 : 1;
  // The token shows the value as the solver left it (21/9 or 7/3): it is the
  // only solved value on the page at this stage.
  const token = page.locator('button[aria-label^="Pick up the solved value "]:visible').first();
  await token.click();
  await settle(page, 300);
  await page.locator('.mathmaster-systems-backsub-equations > div').nth(index)
    .locator(`[aria-label="Variable ${solved.variable}. Place the selected value or expression here"]`).first().click();
  await settle(page, 900);
  log(`back-substitute ${solved.variable} = ${solved.value} into Equation ${index + 1}`);
  const result = await solveEmbedded(page, remaining, log);
  return { variable: remaining, value: result.value };
};

/** Check both original equations with the solved values, as the verification stage asks. */
export const verifyOriginalEquations = async (page, equations, solution, log = () => {}) => {
  const stage = page.locator('.mathmaster-systems-verification-stage');
  await stage.waitFor({ timeout: 10000 });
  for (let index = 0; index < equations.length; index += 1) {
    const card = stage.locator('.mathmaster-systems-verification-card').nth(index);
    for (const variable of ['x', 'y']) {
      const targets = card.locator(`[aria-label="Variable ${variable}. Place the selected value or expression here"]`);
      const count = await targets.count();
      for (let placed = 0; placed < count; placed += 1) {
        // The token shows the value as the solver left it (7/3, or 21/9).
        await page.locator(`button[aria-label^="Pick up solved value "][aria-label$=" for ${variable}"]:visible`).first().click();
        await settle(page, 200);
        await card.locator(`[aria-label="Variable ${variable}. Place the selected value or expression here"]`).first().click();
        await settle(page, 300);
      }
    }
    const [left, right] = equations[index].split('=');
    const scope = { x: F(solution.x), y: F(solution.y) };
    const leftValue = math.evaluate(left, scope);
    const rightValue = math.evaluate(right, scope);
    await setMathField(page, page.locator(`math-field[aria-label="Equation ${index + 1} left side value"]:visible`).first(), latex(leftValue));
    await setMathField(page, page.locator(`math-field[aria-label="Equation ${index + 1} right side value"]:visible`).first(), latex(rightValue));
    await page.locator('button:visible', { hasText: `Check equation ${index + 1}` }).first().click();
    await settle(page, 600);
    log(`verify Equation ${index + 1}: ${text(leftValue)} = ${text(rightValue)}`);
  }
};
