/*
 * DRIVING PROCESS MODE THE WAY A STUDENT DOES — SHARED BY THE BROWSER GATES.
 *
 * Every helper operates the board's real Process Mode controls: the "What I
 * know" strip's Find buttons, the method chips, the fields, rows, points and
 * picks each method shows, the embedded Step Algebra workspace (through
 * stepAlgebraDriver.mjs), and Check or Save. Nothing here computes a fact for
 * the student: the values typed are worked out from the version's own line,
 * exactly as a student would work them out, and the board marks them.
 */
import { balancedMove, cancelFactor, cancelTerm, setMathField, simplifySide } from './stepAlgebraDriver.mjs';
import { deriveLinearMultipleRepresentations } from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';

const settle = (page, ms = 300) => page.waitForTimeout(ms);

export const processWorkspace = (page) => page.locator('[data-lmr-card="process"]');
export const factsStrip = (page) => page.locator('[data-process-facts]');

const press = async (page, locator, touch = false) => {
  await locator.scrollIntoViewIfNeeded();
  if (touch) await locator.tap();
  else await locator.click();
  await settle(page, 250);
};

/** "Find the slope" (or the y-intercept, x-intercept, a point) in What I know. */
export const findFact = async (page, fact, { touch = false } = {}) => {
  await press(page, factsStrip(page).locator(`[data-process-find="${fact}"]`), touch);
  await processWorkspace(page).waitFor({ timeout: 5000 });
  await settle(page, 400);
};

/** Choose a method (and, when it has more than one, where to work from). */
export const chooseMethod = async (page, strategy, { source = null, touch = false } = {}) => {
  const chip = processWorkspace(page).locator(`[data-process-choice="method:${strategy}"]`);
  if ((await chip.getAttribute('aria-checked')) !== 'true') await press(page, chip, touch);
  if (source) {
    const sourceChip = processWorkspace(page).locator(`[data-process-choice="source:${strategy}@${source}"]`);
    if (await sourceChip.count() && (await sourceChip.getAttribute('aria-checked')) !== 'true') await press(page, sourceChip, touch);
  }
  await settle(page, 400);
};

export const typeProcessField = (page, name, value) => setMathField(page, processWorkspace(page).locator(`[data-process-field="${name}"] math-field`), value);

/** Check (guided) or Save (outcomes withheld). */
export const checkProcess = async (page, { touch = false } = {}) => {
  await press(page, processWorkspace(page).locator('[data-card-check="true"]'), touch);
  await settle(page, 700);
};

export const processMessage = async (page) => ((await processWorkspace(page).count())
  ? (await processWorkspace(page).locator('p[role="status"]').allInnerTexts()).join(' ')
  : '');

const text = ({ n, d }) => (d === 1 ? String(n) : `${n}/${d}`);
const fraction = (value) => {
  for (let d = 1; d <= 24; d += 1) {
    const n = Math.round(value * d);
    if (Math.abs(n / d - value) < 1e-9) return { n, d };
  }
  return { n: value, d: 1 };
};

/**
 * Solve 0 = m·x + b for x in the open Step Algebra workspace: move b across,
 * cancel it, simplify; divide by m, cancel, simplify. Leaves "v = x".
 */
export const solveZeroEquals = async (page, m, b) => {
  const host = processWorkspace(page);
  if (b !== 0) {
    await balancedMove(page, host, b > 0 ? 'Subtract' : 'Add', String(Math.abs(b)));
    await cancelTerm(page, host, b > 0 ? '+ ' + Math.abs(b) : '- ' + Math.abs(b));
    if (await host.locator('math-field[aria-label="Left side: enter your simplification"]').count()) await simplifySide(page, host, 'left', String(-b));
  }
  if (m !== 1) {
    await balancedMove(page, host, 'Divide by', String(m));
    if (await host.locator('[aria-label$="mark this factor for cancellation"]').count()) await cancelFactor(page, host);
    await settle(page, 400);
    if (await host.locator('math-field[aria-label="Left side: enter your simplification"]').count()) await simplifySide(page, host, 'left', text(fraction(-b / m)));
  }
  await settle(page, 600);
};

/**
 * Establish every fact a Process Mode version's board needs, the way a
 * student would on its GIVEN — reading what it shows, deriving what it hides —
 * from that version's own line (`line`: { m, b, zero } as numbers).
 */
export const establishProcessFacts = async (page, question, line, { touch = false } = {}) => {
  const kind = question.source.kind;
  const { m, b, zero } = line;
  const fx = (value) => text(fraction(value));
  if (kind === 'slopeIntercept') {
    await findFact(page, 'slope', { touch });
    await typeProcessField(page, 'm', fx(m));
    await typeProcessField(page, 'b', fx(b));
    await checkProcess(page, { touch });
  } else if (kind === 'pointSlope') {
    // The point the equation shows, as the student reads it (a generated
    // GIVEN writes it into the equation: y + 3 = 3(x + 3)).
    const [x1, y1] = deriveLinearMultipleRepresentations(question).sourcePoint;
    await findFact(page, 'slope', { touch });
    await chooseMethod(page, 'readPointSlope', { touch });
    await typeProcessField(page, 'm', fx(m));
    await typeProcessField(page, 'point', `(${x1}, ${y1})`);
    await checkProcess(page, { touch });
    // b from the slope and the point the equation shows.
    await findFact(page, 'yIntercept', { touch });
    await chooseMethod(page, 'solveForB', { touch });
    await press(page, processWorkspace(page).locator(`[data-process-choice="point:point:${x1},${y1}"]`), touch);
    for (const [name, value] of [['y1', String(y1)], ['m', fx(m)], ['x1', String(x1)], ['b', fx(b)]]) await typeProcessField(page, name, value);
    await checkProcess(page, { touch });
  } else if (kind === 'table') {
    const rows = question.source.rows.map((row) => ({ x: Number(row.x), y: Number(row.y) }));
    await findFact(page, 'slope', { touch });
    await press(page, processWorkspace(page).locator('[data-process-row="0"]'), touch);
    await press(page, processWorkspace(page).locator('[data-process-row="1"]'), touch);
    await typeProcessField(page, 'dy', fx(rows[1].y - rows[0].y));
    await typeProcessField(page, 'dx', fx(rows[1].x - rows[0].x));
    await typeProcessField(page, 'm', fx(m));
    await checkProcess(page, { touch });
    for (const [fact, axisRow, value] of [['yIntercept', rows.findIndex((row) => row.x === 0), { x: '0', y: fx(b) }], ['xIntercept', rows.findIndex((row) => row.y === 0), { x: fx(zero), y: '0' }]]) {
      await findFact(page, fact, { touch });
      if (axisRow >= 0) {
        await chooseMethod(page, 'tableRead', { touch });
        await press(page, processWorkspace(page).locator(`[data-process-row="${axisRow}"]`), touch);
      } else {
        await chooseMethod(page, 'extendTable', { touch });
        await page.locator('[data-process-extend="0:x"]').fill(value.x);
        await page.locator('[data-process-extend="0:y"]').fill(value.y);
      }
      await checkProcess(page, { touch });
    }
  } else if (kind === 'scenario') {
    await findFact(page, 'slope', { touch });
    await typeProcessField(page, 'rate', fx(m));
    await typeProcessField(page, 'start', fx(b));
    await checkProcess(page, { touch });
  } else {
    throw new Error(`establishProcessFacts: no student route written for a ${kind} GIVEN`);
  }
  // The x-intercept, where the GIVEN does not show it: substitute y = 0 and
  // solve 0 = mx + b in Step Algebra.
  if (kind !== 'table' && !(await factsStrip(page).locator('[data-process-fact="xIntercept"]').count())) {
    await findFact(page, 'xIntercept', { touch });
    await chooseMethod(page, 'substituteZero', { source: kind === 'slopeIntercept' ? 'given' : 'facts', touch });
    await press(page, processWorkspace(page).locator('[data-process-choice="zero:y"]'), touch);
    await settle(page, 1200);
    await solveZeroEquals(page, m, b);
    await typeProcessField(page, 'point', `(${fx(zero)}, 0)`);
    await checkProcess(page, { touch });
  }
};
