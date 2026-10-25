/*
 * MATRICES AND SYSTEMS WITH MATRICES (A2.3B) — Recovery for the Algebra II
 * lesson "Solving Systems with Matrices".
 *
 * Six platform families, one per Warm-Up and DOL question of the lesson, each
 * able to RECOGNIZE that static question (Recovery V2, recoveryContent.mjs) so
 * a student who needs a second try gets fresh, equivalent, server-graded
 * versions of it:
 *
 *   matrices.arrayRecordTotals     Warm-Up: two arrays of card sales (rows are
 *                                  card values, columns card types); the same
 *                                  information as sentences, two totals in
 *                                  dollars over both months, and the type that
 *                                  sold the fewest. multiAnswer.
 *   matrices.addition              Warm-Up: add the two arrays. matrixLab,
 *                                  operate (add).
 *   numbers.multiplicativeInverse  Warm-Up: the inverse of a whole number and
 *                                  of a fraction, the product of a number and
 *                                  its inverse, and the number with no
 *                                  inverse. multiAnswer.
 *   matrices.multiplication        DOL: is P · Q defined, its size, and every
 *                                  entry (a 2 × 3 times a 3 × 2). matrixLab,
 *                                  operate.
 *   matrices.solveSystem3x3        DOL: three equations in x, y and z, two of
 *                                  them not in standard form yet; write A · X
 *                                  = B and solve it. matrixLab, solve.
 *   matrices.singularSystem3x3     DOL: a system whose third row is a multiple
 *                                  of another; write A · X = B, classify it
 *                                  and say why A has no inverse. matrixLab,
 *                                  solve (justifySingular).
 *
 * A SEED, NOT A PARAMETER PER ENTRY. A matrix has six to twelve entries; one
 * parameter each would make a parameter space far wider than the engine
 * permutes (questionFamilyEngine.mjs, 2^30). So most of these families draw
 * their entries from a seeded stream (`seed` and `salt`), and `derive` keeps any entries
 * it is handed — which is how `recognize` reads a lesson's own matrices back
 * as an instance. A fingerprint names the entries, never the seed, so two
 * seeds that happen to draw the same matrices are the same question.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt. Recovery builds its versions from the
 * original's identity only (recoverySourceQuestion), so the lesson's own
 * hints, which quote its numbers, never reach a Recovery version.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports no tool mathematics (the Matrix Lab model reads these questions).
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
  intDomain,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

// FNV-1a and mulberry32: a reproducible stream per family and seed.
const hash32 = (value) => {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};
const streamFor = (familyId, seed) => {
  let state = hash32(`${familyId}|${seed}`) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (values) => values[Math.floor(next() * values.length)],
  };
};

// Two seed parameters: one domain holds at most a few hundred values
// (questionFamilyContract.mjs), so a pair makes about 160,000 draws.
const SEED_RANGE = 400;
const seedDomains = () => ({ seed: intDomain(0, SEED_RANGE - 1), salt: intDomain(0, SEED_RANGE - 1) });

// What a static question of these shapes carries that an instance writes
// anew: removed from an authored slot before the merge, so a slot made from
// the lesson's own question never keeps its matrices, equations or keys.
const MATRIX_LAB_INSTANCE_FIELDS = Object.freeze([
  'matrices', 'matrix', 'left', 'right', 'operation', 'resultName', 'equations', 'justifySingular', 'askDefined',
  'judgeInverse', 'askInverse', 'showEquations', 'variableMeanings', 'startFrom', 'targets', 'fillResult', 'showExpansion',
]);
const MULTI_ANSWER_INSTANCE_FIELDS = Object.freeze(['answerFields', 'responses', 'matrices', 'matrixLayout']);

/*
 * A matrix's rows as an assignment stores them: `{ cells: [...] }` per row
 * (Firestore holds no array of arrays; the V5 import writes this form, and
 * the Matrix Lab reads both). Families compute with plain rows and write
 * stored rows.
 */
const storedRows = (rows) => rows.map((cells) => ({ cells: [...cells] }));
const rowCells = (row) => (Array.isArray(row) ? row : (isObject(row) && Array.isArray(row.cells) ? row.cells : null));
/** A matrix as numbers, or null when it is not rows×cols of integers. */
const integerRows = (value, rows, cols) => {
  const source = isObject(value) && Array.isArray(value.rows) ? value.rows : value;
  if (!Array.isArray(source) || source.length !== rows) return null;
  const read = source.map((row) => {
    const cells = rowCells(row);
    return cells && cells.length === cols ? cells.map(Number) : null;
  });
  return read.every((row) => row && row.every(Number.isInteger)) ? read : null;
};
const matrixPair = (question) => {
  const matrices = isObject(question?.matrices) ? question.matrices : {};
  const names = Object.keys(matrices);
  const left = names.includes(clean(question?.left)) ? clean(question.left) : names[0];
  const right = names.includes(clean(question?.right)) ? clean(question.right) : names[1];
  return left && right && left !== right ? { left, right, leftMatrix: matrices[left], rightMatrix: matrices[right] } : null;
};
const multiply = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
const add = (a, b) => a.map((row, i) => row.map((value, j) => value + b[i][j]));
const flat = (rows) => rows.flat();

/* ---------------------------------------------------------------------------
 * The card-sales context the Warm-Up shares (arrayRecordTotals, addition).
 * ------------------------------------------------------------------------- */

const CARD_VALUE_SETS = Object.freeze(['20/25/50', '10/25/50', '15/25/40', '20/30/50', '10/20/50', '25/40/60']);
const CARD_TYPES = Object.freeze(['Gas', 'Grocery']);
const cardValuesOf = (values) => clean(values).split('/').map(Number);
const cardRowLabels = (cardValues) => cardValues.map((value) => `$${value} cards`);
const salesMatrices = (cardValues, first, second) => ({
  Nov: { rows: storedRows(first), rowLabels: cardRowLabels(cardValues), colLabels: [...CARD_TYPES], caption: 'November' },
  Dec: { rows: storedRows(second), rowLabels: cardRowLabels(cardValues), colLabels: [...CARD_TYPES], caption: 'December' },
});
// Two months of counts: the first month a little smaller, as a season builds.
const drawSales = (familyId, seed) => {
  const stream = streamFor(familyId, seed);
  const month = (low, high) => [0, 1, 2].map(() => [stream.int(low, high), stream.int(Math.floor(low / 2), Math.floor(high / 2))]);
  return { first: month(80, 600), second: month(90, 900), stream };
};
/** "$20", "$25", "$50" read back from "$20 cards" row labels. */
const readCardValues = (matrix) => {
  const labels = list(matrix?.rowLabels).map((label) => /^\$(\d+)\s+cards$/i.exec(clean(label)));
  return labels.length === 3 && labels.every(Boolean) ? labels.map((match) => Number(match[1])) : null;
};
const readTypes = (matrix) => list(matrix?.colLabels).map((label) => clean(label).toLowerCase());

/* ---------------------------------------------------------------------------
 * matrices.arrayRecordTotals
 * ------------------------------------------------------------------------- */

const SAME_ANSWER = 'Yes — the same numbers, organized in rows and columns';
const SAME_OPTIONS = Object.freeze([SAME_ANSWER, 'No — the arrays leave out the grocery cards', 'No — the arrays only show December']);
const cardName = (cardValues, row, col) => `$${cardValues[row]} ${CARD_TYPES[col].toLowerCase()} cards`;
const totalLabel = (cardValues, cell) => `Total money collected selling ${cardName(cardValues, cell.row, cell.col)} (both months), in dollars`;

const recordAnswers = ({ cardValues, first, second, asked }) => {
  const sums = [0, 1, 2].flatMap((row) => [0, 1].map((col) => ({ row, col, total: first[row][col] + second[row][col] })));
  const fewest = [...sums].sort((a, b) => a.total - b.total)[0];
  return {
    same: SAME_ANSWER,
    totalA: String(cardValues[asked[0].row] * (first[asked[0].row][asked[0].col] + second[asked[0].row][asked[0].col])),
    totalB: String(cardValues[asked[1].row] * (first[asked[1].row][asked[1].col] + second[asked[1].row][asked[1].col])),
    least: cardName(cardValues, fewest.row, fewest.col),
    sums,
  };
};

export const arrayRecordTotalsFamily = defineQuestionFamily({
  id: 'matrices.arrayRecordTotals',
  version: 1,
  title: 'Read two arrays of data: totals over both and the smallest',
  skill: {
    objective: 'Read data organized in matrices (rows and columns with labels) to find totals across two matrices and compare entries.',
    alignments: ['A2.3B'],
    strand: 'matrices',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    ...seedDomains(),
    values: choiceDomain([...CARD_VALUE_SETS]),
  }),
  derive: ({ seed, salt, values, first, second, asked }) => {
    const cardValues = cardValuesOf(values);
    if (first && second && asked) return { cardValues, first, second, asked };
    const drawn = drawSales('matrices.arrayRecordTotals', `${seed}.${salt}`);
    // One grocery total and one gas total, on different rows.
    const groceryRow = drawn.stream.int(0, 2);
    const gasRow = (groceryRow + drawn.stream.int(1, 2)) % 3;
    return { cardValues, first: drawn.first, second: drawn.second, asked: [{ row: groceryRow, col: 1 }, { row: gasRow, col: 0 }] };
  },
  rules: (values) => {
    const issues = [];
    const { sums } = recordAnswers(values);
    const sorted = [...sums].sort((a, b) => a.total - b.total);
    // The fewest is one card type, by a margin a student can see.
    if (sorted[1].total - sorted[0].total < 10) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    return issues;
  },
  fingerprint: ({ cardValues, first, second, asked }) => fingerprintOf('matrices.arrayRecordTotals', [
    cardValues.join('/'), ...flat(first), ...flat(second), ...asked.flatMap(({ row, col }) => [row, col]),
  ]),
  answer: (values) => {
    const { same, totalA, totalB, least } = recordAnswers(values);
    return { kind: 'fields', value: { same, totalA, totalB, least }, display: `${totalA}; ${totalB}; ${least}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { cardValues, first, second, asked } = values;
      const answers = recordAnswers(values);
      const fewestFirst = [...answers.sums].sort((a, b) => a.total - b.total);
      const leastOptions = rotate(fewestFirst.slice(0, 4).map(({ row, col }) => cardName(cardValues, row, col)), flat(first)[0]);
      const valuesText = `$${cardValues[0]}, $${cardValues[1]}, and $${cardValues[2]}`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { cards: valuesText },
          fallback: `The lacrosse team sold ${valuesText} gas cards and grocery cards in November and December. Mr. Lopez wrote the sales in sentences. Ms. Tanaka recorded them as the two arrays below: rows are the card values, columns are the card type.`,
        }),
        matrices: salesMatrices(cardValues, first, second),
        matrixLayout: ['Nov', '+', 'Dec'],
        answerFields: [
          {
            id: 'same',
            label: `Mr. Lopez wrote: “In November the team sold ${first[0][0]} gas cards for $${cardValues[0]}, ${first[1][0]} gas cards for $${cardValues[1]}, and ${first[2][0]} gas cards for $${cardValues[2]} …” Does Ms. Tanaka's record give the same information as his sentences?`,
            type: 'choice',
            options: [...SAME_OPTIONS],
            answer: answers.same,
            inputProfile: 'choice',
          },
          { id: 'totalA', label: totalLabel(cardValues, asked[0]), answer: answers.totalA, inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } },
          { id: 'totalB', label: totalLabel(cardValues, asked[1]), answer: answers.totalB, inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } },
          {
            id: 'least',
            label: 'Over both months, which of the 6 types of cards sold the fewest cards?',
            type: 'choice',
            options: leastOptions,
            answer: answers.least,
            inputProfile: 'choice',
          },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...MULTI_ANSWER_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const matrices = isObject(question?.matrices) ? Object.values(question.matrices) : [];
    if (matrices.length !== 2) return null;
    const [firstMatrix, secondMatrix] = matrices;
    const first = integerRows(firstMatrix, 3, 2);
    const second = integerRows(secondMatrix, 3, 2);
    const cardValues = readCardValues(firstMatrix);
    if (!first || !second || !cardValues || JSON.stringify(readCardValues(secondMatrix)) !== JSON.stringify(cardValues)) return null;
    if (readTypes(firstMatrix).join('/') !== 'gas/grocery') return null;
    const fields = list(question?.answerFields);
    const totals = fields
      .map((field) => ({ field, match: /^Total money collected selling \$(\d+) (gas|grocery) cards \(both months\), in dollars$/i.exec(clean(field?.label)) }))
      .filter(({ match }) => match);
    const same = fields.find((field) => clean(field?.answer) === SAME_ANSWER);
    const least = fields.find((field) => /fewest cards/i.test(clean(field?.label)));
    if (totals.length !== 2 || !same || !least) return null;
    const asked = totals.map(({ match }) => ({ row: cardValues.indexOf(Number(match[1])), col: match[2].toLowerCase() === 'gas' ? 0 : 1 }));
    if (asked.some(({ row }) => row < 0)) return null;
    const params = { values: cardValues.join('/'), first, second, asked };
    // The keys it carries are this family's own: the same mathematics.
    const answers = recordAnswers({ cardValues, first, second, asked });
    if (Number(totals[0].field.answer) !== Number(answers.totalA) || Number(totals[1].field.answer) !== Number(answers.totalB)) return null;
    if (clean(least.answer) !== answers.least) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * matrices.addition
 * ------------------------------------------------------------------------- */

export const matrixAdditionFamily = defineQuestionFamily({
  id: 'matrices.addition',
  version: 1,
  title: 'Add two matrices of data',
  skill: {
    objective: 'Add two matrices of the same dimensions by adding the entries in matching positions, and state the dimensions of the sum.',
    alignments: ['A2.3B'],
    strand: 'matrices',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    ...seedDomains(),
    values: choiceDomain([...CARD_VALUE_SETS]),
  }),
  derive: ({ seed, salt, values, first, second }) => {
    const cardValues = cardValuesOf(values);
    if (first && second) return { cardValues, first, second, sum: add(first, second) };
    const drawn = drawSales('matrices.addition', `${seed}.${salt}`);
    return { cardValues, first: drawn.first, second: drawn.second, sum: add(drawn.first, drawn.second) };
  },
  rules: () => [],
  fingerprint: ({ first, second }) => fingerprintOf('matrices.addition', [...flat(first), ...flat(second)]),
  answer: ({ sum }) => ({
    kind: 'matrixOperate',
    value: { defined: true, rows: sum.length, cols: sum[0].length, entries: sum },
    display: `[${sum.map((row) => row.join(' ')).join('; ')}]`,
  }),
  tools: {
    matrixLab: ({ cardValues, first, second }, { authored }) => ({
      type: 'matrixLab',
      mode: 'operate',
      operation: 'add',
      matrices: salesMatrices(cardValues, first, second),
      left: 'Nov',
      right: 'Dec',
      resultName: 'Total',
      prompt: composeFamilyPrompt({
        authored: authored?.prompt,
        fallback: `The lacrosse team recorded its $${cardValues[0]}, $${cardValues[1]}, and $${cardValues[2]} gas and grocery card sales for November and December in the two arrays below. Add them: write one array that shows the total number of each card sold over both months.`,
      }),
    }),
  },
  defaultTool: 'matrixLab',
  instanceFields: [...MATRIX_LAB_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'matrixLab' || clean(question?.mode) !== 'operate' || clean(question?.operation) !== 'add') return null;
    const pair = matrixPair(question);
    const first = integerRows(pair?.leftMatrix, 3, 2);
    const second = integerRows(pair?.rightMatrix, 3, 2);
    const cardValues = readCardValues(pair?.leftMatrix);
    if (!first || !second || !cardValues) return null;
    return { params: { values: cardValues.join('/'), first, second }, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * numbers.multiplicativeInverse
 * ------------------------------------------------------------------------- */

const signedText = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));
const fractionDisplay = (num, den) => `${num < 0 ? MINUS : ''}${Math.abs(num)}/${den}`;
const fractionKey = (num, den) => `${num < 0 ? '-' : ''}${Math.abs(num)}/${den}`;
const NO_INVERSE_OPTIONS = Object.freeze(['0', '1', `${MINUS}1`, '1/2']);

const inverseAnswers = ({ whole, sign, num, den }) => ({
  invWhole: fractionKey(Math.sign(whole), Math.abs(whole)),
  invFrac: fractionKey(sign * den, num),
  product: '1',
  none: '0',
});

export const multiplicativeInverseFamily = defineQuestionFamily({
  id: 'numbers.multiplicativeInverse',
  version: 1,
  title: 'The multiplicative inverse of a number',
  skill: {
    objective: 'Find the multiplicative inverse of a nonzero whole number and of a fraction, recognize that a number times its inverse is the multiplicative identity 1, and that 0 has no inverse — the idea behind an inverse matrix.',
    alignments: ['A2.3B'],
    strand: 'matrices',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    whole: intDomain(-12, 12, { exclude: [-1, 0, 1] }),
    sign: choiceDomain([-1, 1]),
    num: intDomain(2, 9),
    den: intDomain(2, 9),
  }),
  derive: () => ({}),
  rules: ({ whole, num, den }) => {
    const issues = [];
    // A fraction in lowest terms that is not a whole number, and not the
    // reciprocal of the whole number asked first.
    if (gcd(num, den) !== 1 || num === den) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    if (num === 1 && den === Math.abs(whole)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    return issues;
  },
  fingerprint: ({ whole, sign, num, den }) => fingerprintOf('numbers.multiplicativeInverse', [whole, sign * num, den]),
  answer: (values) => {
    const value = inverseAnswers(values);
    return { kind: 'fields', value, display: `${value.invWhole}; ${value.invFrac}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { whole, sign, num, den } = values;
      const answers = inverseAnswers(values);
      const fraction = fractionDisplay(sign * num, den);
      const fractionAnswer = { inputProfile: 'number', answerFormat: 'number', requiredSymbols: ['a⁄b'], inputContract: { format: 'number', requiredSymbols: ['a⁄b'] } };
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'For any real number n ≠ 0, the multiplicative inverse of n is 1/n, because n · (1/n) = 1. The number 1 is the multiplicative identity.',
        }),
        answerFields: [
          { id: 'invWhole', label: `The multiplicative inverse of ${signedText(whole)}`, answer: answers.invWhole, ...fractionAnswer },
          { id: 'invFrac', label: `The multiplicative inverse of ${fraction}`, answer: answers.invFrac, ...fractionAnswer },
          { id: 'product', label: `(${fraction}) · (its inverse) =`, answer: answers.product, inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } },
          {
            id: 'none',
            label: 'Which real number has no multiplicative inverse?',
            type: 'choice',
            options: rotate([...NO_INVERSE_OPTIONS], whole + num),
            answer: answers.none,
            inputProfile: 'choice',
          },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...MULTI_ANSWER_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = list(question?.answerFields);
    const inverses = fields
      .map((field) => /^The multiplicative inverse of ([−-]?)(\d+)(?:\/(\d+))?$/.exec(clean(field?.label)))
      .filter(Boolean);
    const none = fields.find((field) => /has no multiplicative inverse/i.test(clean(field?.label)));
    const wholeMatch = inverses.find((match) => !match[3]);
    const fractionMatch = inverses.find((match) => match[3]);
    if (inverses.length !== 2 || !wholeMatch || !fractionMatch || !none || clean(none.answer) !== '0') return null;
    const whole = (wholeMatch[1] ? -1 : 1) * Number(wholeMatch[2]);
    const params = {
      whole,
      sign: fractionMatch[1] ? -1 : 1,
      num: Number(fractionMatch[2]),
      den: Number(fractionMatch[3]),
    };
    if (Math.abs(whole) < 2 || params.num < 1 || params.den < 2) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * matrices.multiplication
 * ------------------------------------------------------------------------- */

const PRODUCT_NAMES = Object.freeze({ 'P/Q': ['P', 'Q'], 'A/B': ['A', 'B'], 'M/N': ['M', 'N'], 'R/S': ['R', 'S'] });

export const matrixMultiplicationFamily = defineQuestionFamily({
  id: 'matrices.multiplication',
  version: 1,
  title: 'Is a matrix product defined? Its size and its entries',
  skill: {
    objective: 'Decide whether the product of two matrices is defined from their dimensions, state the dimensions of the product, and compute every entry (row by column).',
    alignments: ['A2.3B'],
    strand: 'matrices',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {
    names: choiceKnob('P/Q', Object.keys(PRODUCT_NAMES), { label: 'Matrix names' }),
  },
  parameters: () => seedDomains(),
  derive: ({ seed, salt, left, right }) => {
    if (left && right) return { left, right, product: multiply(left, right) };
    const stream = streamFor('matrices.multiplication', `${seed}.${salt}`);
    const draw = (rows, cols) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => stream.int(-3, 5)));
    const drawnLeft = draw(2, 3);
    const drawnRight = draw(3, 2);
    return { left: drawnLeft, right: drawnRight, product: multiply(drawnLeft, drawnRight) };
  },
  rules: ({ left, right, product }) => {
    const issues = [];
    const zeroRow = (rows) => rows.some((row) => row.every((value) => value === 0));
    const zeroColumn = (rows) => rows[0].some((_, j) => rows.every((row) => row[j] === 0));
    if (zeroRow(left) || zeroColumn(left) || zeroRow(right) || zeroColumn(right)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // Signs to keep track of, as the lesson's own P and Q have.
    if ([...flat(left), ...flat(right)].filter((value) => value < 0).length < 2) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (flat(product).some((value) => Math.abs(value) > 40)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  // The names are presentation.
  fingerprint: ({ left, right }) => fingerprintOf('matrices.multiplication', [...flat(left), ...flat(right)]),
  answer: ({ product }) => ({
    kind: 'matrixOperate',
    value: { defined: true, rows: product.length, cols: product[0].length, entries: product },
    display: `[${product.map((row) => row.join(' ')).join('; ')}]`,
  }),
  tools: {
    matrixLab: ({ left, right }, { constraints: c, authored }) => {
      const [leftName, rightName] = PRODUCT_NAMES[c.names] || PRODUCT_NAMES['P/Q'];
      return {
        type: 'matrixLab',
        mode: 'operate',
        operation: 'multiply',
        matrices: { [leftName]: { rows: storedRows(left) }, [rightName]: { rows: storedRows(right) } },
        left: leftName,
        right: rightName,
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { product: `${leftName} · ${rightName}` },
          fallback: `Decide whether ${leftName} · ${rightName} is defined. If it is, give its dimensions and compute it.`,
        }),
      };
    },
  },
  defaultTool: 'matrixLab',
  instanceFields: [...MATRIX_LAB_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'matrixLab' || clean(question?.mode) !== 'operate') return null;
    if (clean(question?.operation) === 'add' || question?.judgeInverse === true) return null;
    const pair = matrixPair(question);
    const left = integerRows(pair?.leftMatrix, 2, 3);
    const right = integerRows(pair?.rightMatrix, 3, 2);
    if (!left || !right) return null;
    const names = Object.entries(PRODUCT_NAMES).find(([, [l, r]]) => l === pair.left && r === pair.right);
    return { params: { left, right }, constraints: names ? { names: names[0] } : {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * Systems of three equations: text both ways.
 * ------------------------------------------------------------------------- */

const VARIABLES = Object.freeze(['x', 'y', 'z']);
/** "3x", "-y", "2z" as the Matrix Lab reads a term; '' for a zero coefficient. */
const termText = (coefficient, variable) => {
  if (coefficient === 0) return '';
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${coefficient}${variable}`;
};
/** Terms joined: "x - 2y + 3z", "4 + z". Every part is a signed term or number. */
const joinTerms = (parts) => parts
  .filter((part) => part !== '' && part !== null)
  .map((part, index) => {
    const text = String(part);
    if (index === 0) return text;
    return text.startsWith('-') ? `- ${text.slice(1)}` : `+ ${text}`;
  })
  .join(' ') || '0';
const standardEquation = (row, constant) => `${joinTerms(row.map((coefficient, k) => termText(coefficient, VARIABLES[k])))} = ${constant}`;

/** One side of a linear equation in x, y, z: coefficients and a constant, or null. */
const readLinearSide = (side) => {
  const text = clean(side).replace(/[−–]/g, '-').replace(/\s+/g, '');
  if (!text) return null;
  const result = { x: 0, y: 0, z: 0, constant: 0 };
  const pattern = /([+-]?)(\d*)([xyz]?)/g;
  let consumed = 0;
  let match;
  while ((match = pattern.exec(text)) && match[0] !== '') {
    if (match.index !== consumed) return null;
    consumed += match[0].length;
    const [, sign, digits, variable] = match;
    if (!variable && !digits) return null;
    const magnitude = digits ? Number(digits) : 1;
    const value = sign === '-' ? -magnitude : magnitude;
    if (variable) result[variable] += value; else result.constant += value;
  }
  return consumed === text.length ? result : null;
};
/** "3x - y = 4 + z" → { row: [3, -1, -1], constant: 4 }, or null. */
export const readLinearEquation3 = (equation) => {
  const sides = clean(equation).split('=');
  if (sides.length !== 2) return null;
  const left = readLinearSide(sides[0]);
  const right = readLinearSide(sides[1]);
  if (!left || !right) return null;
  return { row: VARIABLES.map((v) => left[v] - right[v]), constant: right.constant - left.constant };
};
const readSystem3 = (question) => {
  const equations = list(question?.equations).map(readLinearEquation3);
  if (equations.length !== 3 || equations.some((entry) => !entry)) return null;
  return { A: equations.map((entry) => entry.row), B: equations.map((entry) => entry.constant) };
};
const determinant3 = (m) => (
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
);
/** A · X = B by Cramer's rule, when the solution is whole numbers (a recognized lesson's own system); else null. */
const wholeSolution = (A, B) => {
  const det = determinant3(A);
  if (det === 0) return null;
  const solution = [0, 1, 2].map((k) => determinant3(A.map((row, i) => row.map((value, j) => (j === k ? B[i] : value)))) / det);
  return solution.every(Number.isInteger) ? solution : null;
};
/** Two rows are multiples of each other: the factor k with a = k·b, or null. */
const rowFactor = (a, b) => {
  const k = b.find((value) => value !== 0);
  if (k === undefined) return null;
  const index = b.indexOf(k);
  const factor = a[index] / k;
  return a.every((value, j) => Math.abs(value - factor * b[j]) < 1e-9) && factor !== 0 ? factor : null;
};
const rowsIndependent = (A) => [[0, 1], [0, 2], [1, 2]].every(([i, j]) => rowFactor(A[i], A[j]) === null);
/** An equation in lowest terms: its coefficients and constant share no factor (as the lesson writes them). */
const inLowestTerms = (row, constant) => [...row, constant].reduce((g, value) => gcd(g, Math.abs(value)), 0) === 1;

/* ---------------------------------------------------------------------------
 * matrices.solveSystem3x3
 * ------------------------------------------------------------------------- */

/*
 * Two of the three equations are written with a variable term on the right,
 * the way the lesson's own DOL is ("3x − y = 4 + z", "2x + 3z = y + 14"): the
 * student puts every equation in standard form before A and B are written.
 * `moves` says, for equations 2 and 3, which variable term moved and whether
 * it is written before or after the constant. `tidyZero` (version 2) leaves a
 * zero constant out.
 */
const movedEquation = (row, constant, variableIndex, termFirst, { tidyZero = false } = {}) => {
  const leftTerms = row.map((coefficient, k) => (k === variableIndex ? '' : termText(coefficient, VARIABLES[k])));
  const moved = termText(-row[variableIndex], VARIABLES[variableIndex]);
  const written = tidyZero && constant === 0 ? [] : [String(constant)];
  const right = termFirst ? joinTerms([moved, ...written]) : joinTerms([...written, moved]);
  return `${joinTerms(leftTerms)} = ${right}`;
};

const systemText = ({ A, B, moves }, options = {}) => A.map((row, i) => {
  const move = moves[i];
  return move ? movedEquation(row, B[i], move.variable, move.termFirst, options) : standardEquation(row, B[i]);
});

const solveSystem3x3Spec = {
  id: 'matrices.solveSystem3x3',
  version: 1,
  title: 'Solve a system of three equations with matrices',
  skill: {
    objective: 'Write a system of three linear equations in three variables (some not yet in standard form) as a matrix equation A · X = B, and solve it with technology, X = A⁻¹ · B.',
    alignments: ['A2.3B'],
    strand: 'matrices',
  },
  difficulty: { band: 3, dok: 3 },
  constraints: {},
  parameters: () => seedDomains(),
  derive: ({ seed, salt, A, B, moves, solution }) => {
    if (A && B && moves) return { A, B, moves, solution: solution || wholeSolution(A, B) };
    const stream = streamFor('matrices.solveSystem3x3', `${seed}.${salt}`);
    const drawnSolution = VARIABLES.map(() => stream.int(-4, 5));
    const drawnA = [0, 1, 2].map(() => VARIABLES.map(() => stream.int(-3, 3)));
    const drawnB = drawnA.map((row) => row.reduce((sum, value, k) => sum + value * drawnSolution[k], 0));
    // Equations 2 and 3 each move one of their variable terms to the right.
    const drawnMoves = [null, ...[1, 2].map((i) => {
      const present = VARIABLES.map((_, k) => k).filter((k) => drawnA[i][k] !== 0);
      return { variable: present.length ? stream.pick(present) : 0, termFirst: stream.int(0, 1) === 1 };
    })];
    return { A: drawnA, B: drawnB, moves: drawnMoves, solution: drawnSolution };
  },
  rules: ({ A, B, moves }) => {
    const issues = [];
    if (determinant3(A) === 0 || !rowsIndependent(A)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    // Every equation uses at least two variables, and the first has all three.
    if (A.some((row) => row.filter((value) => value !== 0).length < 2) || A[0].some((value) => value === 0)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (B.some((value) => Math.abs(value) > 30)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (A.some((row, i) => !inLowestTerms(row, B[i]))) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // A moved term must exist and leave a variable on the left.
    if ([1, 2].some((i) => !moves[i] || A[i][moves[i].variable] === 0)) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    return issues;
  },
  // Where a term is written is presentation; the system is A and B.
  fingerprint: ({ A, B }) => fingerprintOf('matrices.solveSystem3x3', [...flat(A), ...B]),
  answer: ({ A, B, solution }) => ({
    kind: 'matrixSolve',
    value: { A, B, classification: 'one', values: solution },
    display: `(${solution.join(', ')})`,
  }),
  tools: {
    matrixLab: (values, { authored }) => ({
      type: 'matrixLab',
      mode: 'solve',
      equations: systemText(values),
      prompt: composeFamilyPrompt({
        authored: authored?.prompt,
        fallback: 'Write the system as a matrix equation and solve it using technology with matrices.',
      }),
    }),
  },
  defaultTool: 'matrixLab',
  instanceFields: [...MATRIX_LAB_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'matrixLab' || clean(question?.mode) !== 'solve' || question?.justifySingular === true) return null;
    if (question?.showEquations === false || isObject(question?.variableMeanings)) return null;
    const system = readSystem3(question);
    if (!system || determinant3(system.A) === 0) return null;
    // The moves read back from the text: a variable written on the right.
    const moves = list(question.equations).map((equation) => {
      const [, right] = clean(equation).split('=');
      const variable = VARIABLES.findIndex((v) => readLinearSide(right)?.[v]);
      return variable >= 0 ? { variable, termFirst: /^[+-]?\s*\d*\s*[xyz]/.test(clean(right).replace(/[−–]/g, '-')) } : null;
    });
    return { params: { A: system.A, B: system.B, moves }, constraints: {} };
  },
  recovery: { eligible: true },
};

export const solveSystem3x3Family = defineQuestionFamily(solveSystem3x3Spec);

/*
 * VERSION 2 DOES NOT WRITE A ZERO CONSTANT (CT03 / E2-10, D-78). Version 1
 * writes "= −3z + 0" (or "= 0 − 3z") when a moved equation's constant is 0: in
 * 4,612 of the 60,694 valid draws on a 400 × 400 seed grid (7.6%; the audit's
 * smaller sample said about 4%). The system is the same and still right, but it
 * reads as a slip. Version 1 is frozen. A delivered question pins its version, an
 * unpinned reference still means version 1, and so a student who started keeps
 * the text they were given; a slot gets "= −3z" only when its JSON pins version
 * 2. Everything but the Matrix Lab's equation text is version 1's own: the same
 * draws, A, B, answer and fingerprint.
 */
export const solveSystem3x3FamilyV2 = defineQuestionFamily({
  ...solveSystem3x3Spec,
  version: 2,
  tools: {
    matrixLab: (values, context) => ({
      ...solveSystem3x3Spec.tools.matrixLab(values, context),
      equations: systemText(values, { tidyZero: true }),
    }),
  },
});

/* ---------------------------------------------------------------------------
 * matrices.singularSystem3x3
 * ------------------------------------------------------------------------- */

const SINGULAR_FACTORS = Object.freeze([-3, -2, 2, 3]);

export const singularSystem3x3Family = defineQuestionFamily({
  id: 'matrices.singularSystem3x3',
  version: 1,
  title: 'A system whose coefficient matrix has no inverse',
  skill: {
    objective: 'Write a system of three equations as A · X = B, recognize from technology and from the rows that A has no inverse (one row is a multiple of another), and decide whether the system has no solution or infinitely many from what the constants do.',
    alignments: ['A2.3B'],
    strand: 'matrices',
  },
  difficulty: { band: 3, dok: 3 },
  constraints: {
    singularCase: choiceKnob('none', ['none', 'many'], { label: 'The system has' }),
  },
  conceptConstraints: ['singularCase'],
  constraintPolicy: 'strict',
  parameters: () => seedDomains(),
  derive: ({ seed, salt, A, B, multiple }, c) => {
    if (A && B && multiple) return { A, B, multiple };
    const stream = streamFor('matrices.singularSystem3x3', `${seed}.${salt}`);
    const rowA = VARIABLES.map(() => stream.int(-4, 4));
    const rowB = VARIABLES.map(() => stream.int(-4, 4));
    const constants = [stream.int(-9, 9), stream.int(-9, 9)];
    const other = stream.int(0, 1);
    const factor = stream.pick(SINGULAR_FACTORS);
    const base = other === 0 ? rowA : rowB;
    // `|| 0`: a multiple of 0 is 0, never -0 (stored and compared as entries).
    const followed = factor * constants[other] || 0;
    const shift = stream.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);
    const third = c?.singularCase === 'many' ? followed : followed + shift;
    return {
      A: [rowA, rowB, base.map((value) => factor * value || 0)],
      B: [constants[0], constants[1], third],
      multiple: { row: 3, otherRow: other + 1, factor },
    };
  },
  rules: ({ A, B, multiple }, c) => {
    const issues = [];
    if (A[0].filter((value) => value !== 0).length < 3 || A[1].filter((value) => value !== 0).length < 2) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (rowFactor(A[0], A[1]) !== null) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    // The two given rows in lowest terms, so the multiple is the only one.
    if (!inLowestTerms(A[0], B[0]) || !inLowestTerms(A[1], B[1])) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (B.some((value) => Math.abs(value) > 40)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    // The case the slot asks is the case the constants make.
    const follows = B[multiple.row - 1] === multiple.factor * B[multiple.otherRow - 1];
    if ((c?.singularCase === 'many') !== follows) issues.push(FAMILY_ISSUE.CASE_MISMATCH);
    return issues;
  },
  fingerprint: ({ A, B }) => fingerprintOf('matrices.singularSystem3x3', [...flat(A), ...B]),
  answer: ({ A, B, multiple }, c) => {
    const classification = c?.singularCase === 'many' ? 'many' : 'none';
    return {
      kind: 'matrixSolve',
      value: {
        A,
        B,
        classification,
        singularReason: { row: multiple.row, otherRow: multiple.otherRow, factor: multiple.factor, constant: classification === 'many' ? 'follows' : 'breaks' },
      },
      display: classification === 'many' ? 'Infinitely many solutions' : 'No solution',
    };
  },
  tools: {
    matrixLab: ({ A, B }, { authored }) => ({
      type: 'matrixLab',
      mode: 'solve',
      equations: A.map((row, i) => standardEquation(row, B[i])),
      justifySingular: true,
      prompt: composeFamilyPrompt({
        authored: authored?.prompt,
        fallback: 'Write the matrix equation and use technology. Then classify the system.',
      }),
    }),
  },
  defaultTool: 'matrixLab',
  instanceFields: [...MATRIX_LAB_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'matrixLab' || clean(question?.mode) !== 'solve' || question?.justifySingular !== true) return null;
    const system = readSystem3(question);
    if (!system) return null;
    // Every row that is a multiple of an earlier one, and what its constant
    // does. The system's case is ALL of them (RC11, Codex on #511): when every
    // row is a multiple of the first, the first pair can keep its constants
    // while another breaks them, and that system has no solution. The pair
    // named is one that shows the case: a breaking pair for "none".
    const pairs = [[2, 0], [2, 1], [1, 0]].flatMap(([row, otherRow]) => {
      const factor = rowFactor(system.A[row], system.A[otherRow]);
      if (factor === null || !Number.isInteger(factor)) return [];
      return [{ row, otherRow, factor, follows: system.B[row] === factor * system.B[otherRow] }];
    });
    if (!pairs.length) return null;
    const shown = pairs.find((pair) => !pair.follows) || pairs[0];
    return {
      params: { A: system.A, B: system.B, multiple: { row: shown.row + 1, otherRow: shown.otherRow + 1, factor: shown.factor } },
      constraints: { singularCase: shown.follows ? 'many' : 'none' },
    };
  },
  recovery: { eligible: true },
});

export const MATRIX_FAMILIES = Object.freeze([
  arrayRecordTotalsFamily,
  matrixAdditionFamily,
  multiplicativeInverseFamily,
  matrixMultiplicationFamily,
  solveSystem3x3Family,
  solveSystem3x3FamilyV2,
  singularSystem3x3Family,
]);
