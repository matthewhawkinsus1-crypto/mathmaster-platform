/*
 * SOLVING SYSTEMS BY SUBSTITUTION (A.5C) — the Warm-Up family behind the
 * Algebra I lesson "Using Substitution to Solve Linear Systems" (Module 3,
 * Topic 2, Lesson 2).
 *
 *   systems.knownValue   A system in which one equation already says what a
 *                        variable equals — x = 12, x = y, x = y + 3 — and the
 *                        other is y = mx + b. Substitute, find y, and write
 *                        the solution. The three shapes are balanced across a
 *                        class. multiAnswer.
 *
 * This is the lesson's own Prepare ("Analyze each system. What can you
 * conclude about the value of y?"): the substitution idea before the method
 * has a name.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  CONSTRAINT_POLICY,
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
  intDomain,
  rangeKnob,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));

/** "3x", "−x", "x" */
const term = (coefficient, variable) => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `${MINUS}${variable}`;
  return `${shown(coefficient)}${variable}`;
};
const plus = (constant) => (constant === 0 ? '' : ` ${constant < 0 ? MINUS : '+'} ${Math.abs(constant)}`);

export const KNOWN_VALUE_SHAPES = Object.freeze(['given', 'equal', 'offset']);

const PAIR_SYMBOLS = Object.freeze(['(', ')', ',']);

export const knownValueFamily = defineQuestionFamily({
  id: 'systems.knownValue',
  version: 1,
  title: 'Substitute a known value or expression into a system',
  skill: {
    objective: 'Solve a system of two linear equations in which one equation already gives x as a number or as an expression in y, by substituting it into the other equation.',
    alignments: ['A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  // "x = 12" alone is one look; "x = y" and "x = y + 3" need the substitution.
  strata: { balance: 'shape', values: () => KNOWN_VALUE_SHAPES.map((shape) => ({ shape })) },
  parameters: (c, stratum) => {
    const domains = {
      m: choiceDomain([-3, -2, -1, 2, 3, 4]),
      b: intDomain(-12, 12, { exclude: [0] }),
    };
    if (stratum?.shape === 'given') domains.x0 = intDomain(-9, 12, { exclude: [0] });
    if (stratum?.shape === 'offset') domains.shift = intDomain(-6, 6, { exclude: [0] });
    return domains;
  },
  derive: ({ shape, m, b, x0, shift }) => {
    // given:  x = x0;      y = m·x0 + b
    // equal:  x = y;       y = m·y + b      → y = b / (1 − m)
    // offset: x = y + s;   y = m(y + s) + b → y = (m·s + b) / (1 − m)
    if (shape === 'given') return { x: x0, y: m * x0 + b, s: 0 };
    const s = shape === 'offset' ? shift : 0;
    const numerator = m * s + b;
    const y = numerator / (1 - m);
    return { x: y + s, y, s };
  },
  rules: ({ x, y }) => {
    const issues = [];
    if (!Number.isInteger(x) || !Number.isInteger(y)) issues.push(FAMILY_ISSUE.NON_INTEGER_ANSWER);
    if (Math.abs(x) > 20 || Math.abs(y) > 40) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (y === 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  fingerprint: ({ shape, m, b, x0, s }) => fingerprintOf('systems.knownValue', [shape, m, b, shape === 'given' ? x0 : s]),
  answer: ({ x, y }) => {
    const value = { y: String(y), solution: `(${x}, ${y})` };
    return { kind: 'fields', value, display: value.solution };
  },
  tools: {
    multiAnswer: ({ shape, m, b, x0, s, x, y }, { authored }) => {
      const first = shape === 'given' ? `x = ${shown(x0)}` : `x = y${plus(s)}`;
      const second = `y = ${term(m, 'x')}${plus(b)}`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { first, second, system: `${first} and ${second}` },
          fallback: `Analyze the system of equations ${first} and ${second}. Substitute to determine the value of y, then write the solution of the system.`,
        }),
        answerFields: [
          { id: 'y', label: 'The value of y', answer: String(y), inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } },
          {
            id: 'solution',
            label: 'The solution of the system (x, y)',
            answer: `(${x}, ${y})`,
            answerFormat: 'orderedPair',
            inputProfile: 'orderedPair',
            requiredSymbols: [...PAIR_SYMBOLS],
            inputContract: { format: 'orderedPair', requiredSymbols: [...PAIR_SYMBOLS] },
          },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * systems.substitution v2 — the Systems Workspace, by substitution.
 *
 * v1 (questionFamiliesSystems.mjs) writes y = mx + k beside ax + by = c for
 * the plain `system` answer box and `multiAnswer`: the student types (x, y)
 * and nothing they did on the way is seen. v2 opens the Systems Workspace's
 * algebraic mode on a system built FOR substitution — one equation already
 * solved for a variable (or with a coefficient of 1 or −1, ready to isolate) —
 * and the workspace takes the student through it: isolate, substitute, solve
 * the one-variable equation in Step Algebra, back-substitute, and check the
 * point in BOTH original equations; or, when their substitution reaches a
 * statement with no variable (6 = 10, 6 = 6), read it as no solution or
 * infinitely many. v1 is untouched and its pins keep replaying.
 *
 * Construction, per case (the solved equation is y = m·x + k, or x = m·y + k):
 *
 *   one       the second equation a·x + b·y = c passes through a chosen whole
 *             point, and is not parallel to the first;
 *   none      the second equation is s × the first, rearranged, with a
 *             constant that is NOT s × k: parallel, distinct lines;
 *   infinite  the second equation is s × the first, rearranged: the same line.
 *
 * Then the displayed system is classified exactly (questionFamilyExact), and a
 * candidate is kept only if that reading is what the constructor meant.
 * ------------------------------------------------------------------------- */

export const SUBSTITUTION_CASE_CHOICES = Object.freeze(['one', 'none', 'infinite', 'mixed']);
export const SUBSTITUTION_FORM_CHOICES = Object.freeze(['solvedForY', 'solvedForX', 'unitCoefficient', 'mixed']);
const SUBSTITUTION_FORMS = Object.freeze(['solvedForY', 'solvedForX', 'unitCoefficient']);
const SUBSTITUTION_CASES = Object.freeze(['one', 'none', 'infinite']);
// The second equation of a special system is the first times one of these.
const SPECIAL_MULTIPLIERS = Object.freeze([-4, -3, -2, 2, 3, 4]);
const SUBSTITUTION_CONSTANT_LIMIT = 60;
const SUBSTITUTION_COEFFICIENT_LIMIT = 12;

/** "3x", "-x", "x" in the workspace's equation text (ASCII minus). */
const engineTerm = (coefficient, variable, leading) => {
  if (coefficient === 0) return '';
  const size = Math.abs(coefficient) === 1 ? variable : `${Math.abs(coefficient)}${variable}`;
  if (leading) return coefficient < 0 ? `-${size}` : size;
  return coefficient < 0 ? ` - ${size}` : ` + ${size}`;
};
const engineConstant = (value, leading) => {
  if (value === 0) return leading ? '0' : '';
  if (leading) return String(value);
  return value < 0 ? ` - ${Math.abs(value)}` : ` + ${value}`;
};

/** "y = 2x - 3", "x = -y + 4": an equation solved for one variable. */
const solvedText = (solvedVariable, otherVariable, m, k) => {
  const right = m === 0 ? engineConstant(k, true) : `${engineTerm(m, otherVariable, true)}${engineConstant(k, false)}`;
  return `${solvedVariable} = ${right}`;
};

/** "4x - 2y = 6": standard form, leading coefficient positive, lowest terms not forced. */
const standardText = (a, b, c) => {
  const sign = a < 0 || (a === 0 && b < 0) ? -1 : 1;
  const [x, y, constant] = [sign * a, sign * b, sign * c].map((value) => value + 0);
  const left = `${engineTerm(x, 'x', true)}${engineTerm(y, 'y', x === 0)}` || '0';
  return `${left} = ${constant}`;
};

const lowest = (a, b, c) => (gcd(gcd(a, b), c) || 1) === 1;

/**
 * The first equation's row a·x + b·y = c and its displayed text.
 *   solvedForY       y = m·x + k        row (−m, 1, k)
 *   solvedForX       x = m·y + k        row (1, −m, k)
 *   unitCoefficient  p·x ± y = r (or ±x + p·y = r when `flip`), standard form
 */
const firstEquation = ({ form, m, k, flip }) => {
  if (form === 'solvedForX') return { row: { a: 1, b: -m, c: k }, text: solvedText('x', 'y', m, k) };
  if (form === 'unitCoefficient') {
    // From y = m·x + k: −m·x + y = k; written with the unit coefficient on y
    // (or, flipped, on x from x = m·y + k).
    const row = flip ? { a: 1, b: -m, c: k } : { a: -m, b: 1, c: k };
    return { row, text: standardText(row.a, row.b, row.c) };
  }
  return { row: { a: -m, b: 1, c: k }, text: solvedText('y', 'x', m, k) };
};

const substitutionSystemKey = (rows) => {
  const classified = classifySubstitutionRows(rows);
  if (classified.case === 'none') return Object.freeze({ outcome: 'noSolution', classification: 'inconsistent', display: 'No solution' });
  if (classified.case === 'infinite') return Object.freeze({ outcome: 'infinite', classification: 'consistent-dependent', display: 'Infinitely many solutions' });
  if (classified.case !== 'one') return null;
  return Object.freeze({
    outcome: 'point',
    x: String(classified.x),
    y: String(classified.y),
    classification: 'consistent-independent',
    display: `(${classified.x}, ${classified.y})`,
  });
};

/**
 * An exact reading of the displayed rows, in integers: the determinant and
 * the augmented minors. Integer rows with a whole-number intersection only
 * (rules refuse anything else), so no rational arithmetic is needed.
 */
export const classifySubstitutionRows = ([first, second]) => {
  const det = first.a * second.b - second.a * first.b;
  if (det !== 0) {
    const xNumerator = first.c * second.b - second.c * first.b;
    const yNumerator = first.a * second.c - second.a * first.c;
    if (xNumerator % det !== 0 || yNumerator % det !== 0) return { case: 'one', x: xNumerator / det, y: yNumerator / det, whole: false };
    return { case: 'one', x: xNumerator / det + 0, y: yNumerator / det + 0, whole: true };
  }
  const minorX = first.c * second.b - second.c * first.b;
  const minorY = first.a * second.c - second.a * first.c;
  return { case: minorX === 0 && minorY === 0 ? 'infinite' : 'none' };
};

const formsFor = (form) => (form === 'mixed' ? [...SUBSTITUTION_FORMS] : [form]);
const casesForSubstitution = (solutionCase) => (solutionCase === 'mixed' ? [...SUBSTITUTION_CASES] : [solutionCase]);

export const substitutionWorkspaceFamily = defineQuestionFamily({
  id: 'systems.substitution',
  version: 2,
  title: 'System of linear equations by substitution (Systems Workspace: one, none or infinitely many)',
  skill: {
    objective: 'Solve a system of two linear equations by substitution when one equation is solved for a variable (or has a coefficient of 1 or −1), check the solution in both equations, and recognize a system with no solution or infinitely many solutions.',
    alignments: ['A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 3, dok: 2 },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    solutionCase: choiceKnob('one', SUBSTITUTION_CASE_CHOICES, { label: 'Solution case' }),
    form: choiceKnob('solvedForY', SUBSTITUTION_FORM_CHOICES, { label: 'How the first equation is written' }),
    solutionRange: rangeKnob([-8, 8], { limits: [-15, 15], label: 'Solution range' }),
    slopeRange: rangeKnob([-5, 5], { limits: [-9, 9], label: 'Coefficient of the solved equation' }),
    coefficientRange: rangeKnob([-6, 6], { limits: [-12, 12], label: 'Coefficient range of the other equation' }),
  },
  conceptConstraints: ['solutionCase', 'form'],
  strata: {
    balance: 'case',
    values: (c) => casesForSubstitution(c.solutionCase)
      .flatMap((solutionCase) => formsFor(c.form).map((form) => ({ case: solutionCase, form }))),
  },
  parameters: (c, stratum) => {
    if (!stratum) return {};
    const slope = intDomain(c.slopeRange[0], c.slopeRange[1], { exclude: [0] });
    const domains = { m: slope, flip: stratum.form === 'unitCoefficient' ? choiceDomain([false, true]) : choiceDomain([false]) };
    if (stratum.case === 'one') {
      const coordinate = intDomain(c.solutionRange[0], c.solutionRange[1]);
      const coefficient = intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] });
      return { ...domains, x0: coordinate, y0: coordinate, a2: coefficient, b2: coefficient };
    }
    return {
      ...domains,
      k: intDomain(-12, 12),
      s: choiceDomain(SPECIAL_MULTIPLIERS),
      shift: stratum.case === 'none' ? intDomain(-12, 12, { exclude: [0] }) : choiceDomain([0]),
    };
  },
  supportConstraints: {
    'reduce-complexity': { solutionRange: [-6, 6], slopeRange: [-3, 3], coefficientRange: [-4, 4] },
  },
  derive: ({ case: solutionCase, form, m, flip, x0, y0, a2, b2, k: kSpecial, s, shift }) => {
    // The solved equation's constant: through the chosen point for one
    // solution, drawn directly for a special system.
    const solvedForX = form === 'solvedForX' || (form === 'unitCoefficient' && flip);
    const k = solutionCase === 'one' ? (solvedForX ? x0 - m * y0 : y0 - m * x0) : kSpecial;
    const first = firstEquation({ form, m, k, flip });
    const second = solutionCase === 'one'
      ? { a: a2, b: b2, c: a2 * x0 + b2 * y0 }
      : { a: s * first.row.a, b: s * first.row.b, c: s * first.row.c + shift };
    return { first: first.row, firstText: first.text, second, point: solutionCase === 'one' ? { x: x0, y: y0 } : null };
  },
  rules: (values) => {
    const { case: solutionCase, first, second, point } = values;
    const verified = classifySubstitutionRows([first, second]);
    if (verified.case !== solutionCase) return [FAMILY_ISSUE.CASE_MISMATCH];
    if (solutionCase === 'one' && (!verified.whole || verified.x !== point.x || verified.y !== point.y)) return [FAMILY_ISSUE.CASE_MISMATCH];
    const issues = [];
    if (Math.abs(first.c) > 20) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (Math.abs(second.c) > SUBSTITUTION_CONSTANT_LIMIT) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if ([second.a, second.b].some((value) => Math.abs(value) > SUBSTITUTION_COEFFICIENT_LIMIT)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (solutionCase === 'one') {
      // In lowest terms, and not itself solved for a variable: the second
      // equation is the one the student substitutes INTO.
      if (!lowest(second.a, second.b, second.c)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
      if (point.x === 0 && point.y === 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    }
    if (solutionCase !== 'one' && !lowest(first.a, first.b, first.c)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    return issues;
  },
  // A system is a SET of equations: the same two in the other order are the
  // same question; how the first is written is part of the question.
  fingerprint: ({ form, firstText, second }) => fingerprintOf('systems.substitution@2', [form, firstText, standardText(second.a, second.b, second.c)]),
  answer: ({ first, second }) => {
    const key = substitutionSystemKey([first, second]);
    if (key.outcome !== 'point') return { kind: 'solutionSet', value: key.outcome, display: key.display };
    return { kind: 'orderedPair', value: [Number(key.x), Number(key.y)], exact: [key.x, key.y], display: key.display };
  },
  tools: {
    systemsWorkspace: ({ first, firstText, second }, { authored, constraints }) => {
      const secondText = standardText(second.a, second.b, second.c);
      const equations = [firstText, secondText];
      // The prompt shows each equation as math; the workspace reads the same text.
      const system = equations.map((text) => `$${text}$`).join(' and ');
      const special = constraints.solutionCase !== 'one';
      return {
        type: 'systemsWorkspace',
        mode: 'algebraic',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { system },
          fallback: special
            ? `Solve the system ${system} by substitution. Decide whether it has one solution, no solution, or infinitely many solutions.`
            : `Solve the system ${system} by substitution.`,
        }),
        studentActions: ['solveSystem'],
        variables: ['x', 'y'],
        equations,
        // A substitution family: substitution unless the slot lets the
        // student choose (only the mathematics is ever graded).
        method: ['substitution', 'elimination', 'studentChoice'].includes(authored.method) ? authored.method : 'substitution',
        requireVerification: authored.requireVerification !== false,
        askEfficiency: authored.askEfficiency === true,
        exactSolution: true,
        solutionKey: substitutionSystemKey([first, second]),
      };
    },
  },
  defaultTool: 'systemsWorkspace',
  instanceFields: ['solutionKey', 'equations', 'variables', 'exactSolution'],
  recovery: { eligible: true },
  capabilities: {
    targetTool: { tool: 'systemsWorkspace', mode: 'algebraic', methods: ['substitution', 'elimination', 'studentChoice'], defaultMethod: 'substitution' },
    solutionCases: [...SUBSTITUTION_CASE_CHOICES],
    solutionForms: ['integer'],
    coefficientForms: ['integer'],
    exactArithmetic: true,
    independentVerification: 'determinant and augmented minors of the displayed rows (classifySubstitutionRows)',
  },
});

export const SUBSTITUTION_FAMILIES = Object.freeze([knownValueFamily, substitutionWorkspaceFamily]);
