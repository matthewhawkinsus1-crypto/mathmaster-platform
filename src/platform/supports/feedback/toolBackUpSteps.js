/*
 * "LET'S BACK UP" FOR A TOOL, READ FROM THE TOOL'S OWN STRUCTURE (the owner,
 * 2026-10-20; student pass 3, W7-5 decision 1).
 *
 *   toolBackUpStep(question) → { prompt, options: [right, wrong], correct } | null
 *
 * HELP-19 stopped showing the generic "should you revise the specific parts
 * identified in the feedback? Yes / No" step, which left Matrix Lab and the
 * three-variable Systems Workspace with no step at all (no question family
 * reads them). Their items are structured: a Matrix Lab item says whether it
 * locates an element, adds, multiplies or checks an inverse, writes A · X = B
 * or solves it; a Systems Workspace item names its mode, its variables and its
 * method. So the step is built from that structure, about THIS problem's first
 * move.
 *
 * The same for the four tools #509 left without one (FB01; the owner,
 * 2026-10-20, W7 decision 15): Transformations Lab items whose prompt gives
 * the transformation in words, figure-match sorts (by what their categories
 * sort), graph-choice previews (by the form of their choices) and
 * Representation Match's linear connections.
 *
 * IN WORDS THE SPANISH PACK CAN CARRY. Translate must cover every step the
 * platform writes (readAloudAndTranslate.test.mjs). Its templates hold
 * mathematics in slots, but a matrix's name is not reliably mathematics to
 * it ("A" reads as the article, "Nov" as a word), so a Matrix Lab step says
 * "two matrices" and "the first", not the names. A system's variables
 * (x, y and z; s, m and l) and A · X = B are always slots: they stay.
 *
 * NEVER THE ANSWER. Each step asks for a rule or a first move that is true
 * whatever this problem's answer is: which numbers to combine, what the
 * identity matrix means, how many equations three unknowns need. None of them
 * says whether a product is defined, whether two matrices ARE inverses, how
 * many solutions a system has, or any value.
 *
 * Which choice comes first is fixed per problem but not always the right one
 * (as the families order theirs), and a wrong pick leaves only the other.
 */

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
/** FNV-1a: the same problem always shows its two choices in the same order. */
const hashString = (value) => {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};
const step = (prompt, right, wrong) => ({ prompt: `Let’s back up. ${prompt}`, right, wrong });
const ordered = (question, built) => {
  if (!built || built.right === built.wrong) return null;
  const seed = text(question?.questionId) || text(question?.id) || text(question?.prompt) || built.prompt;
  const options = hashString(`${seed}|${built.prompt}`) % 2 === 0 ? [built.right, built.wrong] : [built.wrong, built.right];
  return { prompt: built.prompt, options, correct: built.right };
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
const numberWord = (count) => NUMBER_WORDS[count] || String(count);
const capitalized = (value) => value.charAt(0).toUpperCase() + value.slice(1);
/** "x, y and z" */
const joined = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/* ------------------------------------------------------------- Matrix Lab */

const MATRIX_LAB_MODES = new Set(['locate', 'operate', 'equation', 'solve', 'completeSystem']);

/** The two matrices an operate item combines, by the names the item shows. */
const operands = (question) => {
  const names = Object.keys(isObject(question.matrices) ? question.matrices : {});
  const left = names.includes(text(question.left)) ? text(question.left) : names[0] || null;
  const right = names.includes(text(question.right)) ? text(question.right) : names[1] || null;
  return left && right && left !== right ? { left, right } : null;
};

const matrixLabStep = (question) => {
  const mode = MATRIX_LAB_MODES.has(text(question.mode)) ? text(question.mode) : null;
  if (mode === 'locate') {
    // Its own first element, written the way the item writes it (a₃₄).
    const target = list(question.targets).find((entry) => Number.isInteger(Number(entry?.row)) && Number.isInteger(Number(entry?.col)));
    if (target) return step('When you name an element of a matrix, which comes first?', 'Its row', 'Its column');
    return step('A matrix’s dimensions are written as…', 'rows × columns', 'columns × rows');
  }
  if (mode === 'operate') {
    if (!operands(question)) return null;
    if (text(question.operation) === 'add') {
      return step('To add two matrices, which numbers do you combine?', 'The numbers in the same position', 'Each row of the first with each column of the second');
    }
    if (question.judgeInverse === true) {
      return step('Two matrices are inverses when their product is…', 'the identity matrix', 'a matrix of zeros');
    }
    if (question.askDefined !== false) {
      return step('To decide whether a product of two matrices can be found, which two numbers do you compare?', 'The columns of the first and the rows of the second', 'The rows of the first and the rows of the second');
    }
    return step('The first entry of a product comes from which two?', 'The first row of the first matrix and the first column of the second', 'The first column of the first matrix and the first row of the second');
  }
  if (mode === 'equation') {
    // A variable on the right of "=", or a number alone on the left: the
    // equation must be rearranged before its numbers go in A and B.
    const notStandard = list(question.equations).some((equation) => {
      const [leftSide, rightSide, extra] = text(equation).split('=');
      return extra === undefined && rightSide !== undefined && (/[a-z]/i.test(rightSide) || !/[a-z]/i.test(leftSide));
    });
    if (notStandard || isObject(question.startFrom)) {
      return step('Before an equation’s numbers go in the matrices, how must it be written?', 'Every variable on the left, the constant on the right', 'Exactly as it is given');
    }
    return step('In A · X = B, what goes in A?', 'The coefficients of the variables', 'The constants');
  }
  if (mode === 'solve') {
    const meanings = isObject(question.variableMeanings) ? Object.keys(question.variableMeanings) : [];
    if (question.showEquations === false && meanings.length >= 2 && meanings.length <= 4) {
      const count = meanings.length;
      return step(`The situation has ${numberWord(count)} unknowns. How many equations do you write?`, capitalized(numberWord(count)), capitalized(numberWord(count - 1)));
    }
    if (question.justifySingular === true) {
      return step('Solving with an inverse works only when the coefficient matrix…', 'has an inverse', 'has a zero in it');
    }
    return step('To solve A · X = B, which product gives X?', 'A⁻¹ · B', 'B · A⁻¹');
  }
  if (mode === 'completeSystem') {
    return step('Start the new equation from…', 'a multiple of a given equation', 'new coefficients of your own');
  }
  return null;
};

/* ------------------------------------------------- Systems Workspace (3D) */

/*
 * Only the modes the systems family does not read (src/platform/supports/
 * families/systems.js owns two equations in two variables): the 3D planes
 * model, and an algebraic system of three equations in three variables.
 */
const systemsWorkspaceStep = (question) => {
  const mode = text(question.mode);
  const variables = list(question.variables).map(text).filter(Boolean);
  const equations = list(question.equations).map(text).filter(Boolean);
  if (mode === 'spatial') {
    return step(`Each equation in ${joined(variables.length ? variables : ['x', 'y', 'z'])} is what shape in space?`, 'A plane', 'A line');
  }
  if (mode === 'algebraic' && variables.length === 3 && equations.length === 3) {
    const names = joined(variables);
    if (text(question.method) === 'substitution') {
      return step(`To solve for ${names} by substitution, what do you write first?`, 'One equation solved for one variable', 'The sum of two equations');
    }
    return step(`With three equations in ${names}, what is the first goal?`, 'Eliminate the same variable from two pairs of equations', 'Find all three values from one equation');
  }
  return null;
};

/* ---------------------------------------------------- Transformations Lab */

/*
 * The plot and point-map modes move points by a transformation the prompt
 * gives in words ("translate LEFT 3", "change the OUTPUT values by a factor
 * of 2"); the transformations family reads only a stated equation, so these
 * had no step (FB01; the owner, 2026-10-20, W7 decision 15). The lab's own
 * spec says which parts move: the step asks which coordinate that changes, or
 * the order a y-coordinate goes through. Describe asks what to compare. None
 * names an image point, a parameter's value or a describe verdict.
 */
const numberOr = (value, fallback) => (value === undefined || value === null || value === '' ? fallback : Number(value));

const transformationsLabStep = (question) => {
  const mode = text(question.mode);
  if (mode === 'describe') {
    return step('To find how far the graph moved up or down, which coordinates do you compare?', 'The y-coordinates of a point and its image', 'The x-coordinates of a point and its image');
  }
  if (mode !== 'plotTransform' && mode !== 'pointMap') return null;
  const spec = isObject(question.function) ? question.function : isObject(question.target) ? question.target : null;
  if (!spec) return null;
  const [a, b, h, k] = [numberOr(spec.a, 1), numberOr(spec.b, 1), numberOr(spec.h, 0), numberOr(spec.k, 0)];
  if (![a, b, h, k].every(Number.isFinite) || a === 0 || b === 0) return null;
  if (a !== 1 && k !== 0) {
    return step('The outputs are multiplied by a factor and shifted. What do you do to a point’s y-coordinate first?', 'Multiply it by the factor', 'Add the shift');
  }
  if (h !== 0) return step('Moving a graph left or right changes which coordinate of each point?', 'The x-coordinate', 'The y-coordinate');
  if (k !== 0) return step('Moving a graph up or down changes which coordinate of each point?', 'The y-coordinate', 'The x-coordinate');
  if (a !== 1) return step('Changing the outputs by a factor changes which coordinate of each point?', 'The y-coordinate', 'The x-coordinate');
  if (b !== 1) return step('Changing the inputs by a factor changes which coordinate of each point?', 'The x-coordinate', 'The y-coordinate');
  return null;
};

/* ------------------------------------------------------------ Figure match */

/*
 * A sort's categories say what it sorts by, and the step is the rule a
 * student needs before placing the first card. Each rule is true of every
 * card: none names a card or the category it belongs in. A sort whose
 * categories are none of these gets no step.
 */
const sortRule = (labels, ids) => {
  const has = (word) => labels.some((label) => label.includes(word));
  const named = (word) => labels.includes(word) || ids.includes(word);
  if (['monomial', 'binomial', 'trinomial'].some(named)) {
    return step('Monomial, binomial and trinomial name a polynomial by its number of…', 'terms', 'variables');
  }
  if (['always', 'sometimes', 'never'].every((word) => labels.some((label) => label.startsWith(word)))) {
    return step('To sort a statement as sometimes true, what do you need?', 'An example where it is true and one where it is false', 'One example where it is true');
  }
  if (has('defined') && has('×')) {
    return step('To decide whether a product of two matrices can be found, which two numbers do you compare?', 'The columns of the first and the rows of the second', 'The rows of the first and the rows of the second');
  }
  if (has('perpendicular') && has('parallel')) return step('Perpendicular lines have slopes that are…', 'negative reciprocals', 'equal');
  if (has('not a function')) return step('A relation is not a function when…', 'one input has two different outputs', 'two inputs have the same output');
  if (has('growth') && has('decay')) return step('Read from left to right, an exponential growth graph…', 'rises', 'falls');
  if (['linear', 'quadratic', 'exponential'].filter(named).length >= 2) {
    return step('What tells a linear graph apart from the others?', 'It is a straight line', 'It crosses the y-axis');
  }
  if (has('no solution') && has('infinite')) {
    return step('After you simplify both sides, what do you compare first?', 'The variable terms on the two sides', 'The constant terms on the two sides');
  }
  // Transformations of f. Not "which change moves the graph up?": for f(x) = x
  // a shift inside f is also a vertical shift, and the lesson teaches it.
  if (labels.length >= 2 && labels.every((label) => label.includes('f('))) {
    return step('What does a number added outside the function change?', 'The outputs', 'The inputs');
  }
  return null;
};

const figureMatchStep = (question) => {
  const sort = list(question.workflow).find((stage) => text(stage?.kind) === 'figureMatch');
  const categories = list(sort?.categories).filter(isObject);
  if (categories.length < 2) return null;
  return sortRule(categories.map((category) => text(category.label).toLowerCase()), categories.map((category) => text(category.id).toLowerCase()));
};

/* ---------------------------------------------------- Graph-choice preview */

/*
 * One choice among a few, each drawn on the graph when picked. The choices'
 * own form says what is being chosen: a horizontal or vertical line, a
 * vertex, a line perpendicular or parallel to another.
 */
const LINE_THROUGH_AXIS = /^[xy]\s*=\s*[−-]?\d+(?:\.\d+)?$/;
const ORDERED_PAIR = /^\(\s*[−-]?\d+(?:\.\d+)?\s*,\s*[−-]?\d+(?:\.\d+)?\s*\)$/;

const graphChoicePreviewStep = (question) => {
  const choice = list(question.workflow).find((stage) => text(stage?.kind) === 'multipleChoice' && isObject(stage?.previewOnGraph));
  const labels = list(choice?.choices).map((entry) => text(isObject(entry) ? entry.label : entry));
  if (labels.length < 2 || labels.some((label) => !label)) return null;
  const asked = `${text(choice.prompt)} ${text(question.prompt)}`.toLowerCase();
  if (labels.every((label) => LINE_THROUGH_AXIS.test(label))) {
    return step('On a horizontal line, which coordinate is the same at every point?', 'The y-coordinate', 'The x-coordinate');
  }
  if (labels.every((label) => ORDERED_PAIR.test(label)) && asked.includes('vertex')) {
    return step('On a parabola, where is the vertex?', 'Where the graph turns around', 'Where the graph crosses the y-axis');
  }
  if (labels.every((label) => /^y\s*=/.test(label))) {
    if (asked.includes('perpendicular')) return step('Perpendicular lines have slopes that are…', 'negative reciprocals', 'equal');
    if (asked.includes('parallel')) return step('Parallel lines have slopes that are…', 'equal', 'negative reciprocals');
  }
  return null;
};

/* ------------------------------------------------------ Representation Match */

/* Linear connections: sort cards by the line they describe, or find the one card that disagrees. */
const representationMatchStep = (question) => {
  if (text(question.mode) !== 'linearConnections') return null;
  if (text(question.task) === 'findMismatch') {
    return step('To find the card that does not belong, what do you find first?', 'The line most of the cards describe', 'The card with the largest numbers');
  }
  if (list(question.sets).length < 2) return null;
  return step('When do two cards show the same line?', 'When they have the same slope and the same y-intercept', 'When they have the same slope');
};

const BY_TYPE = Object.freeze({
  matrixLab: matrixLabStep,
  systemsWorkspace: systemsWorkspaceStep,
  transformationsLab: transformationsLabStep,
  figureMatch: figureMatchStep,
  graphChoicePreview: graphChoicePreviewStep,
  representationMatch: representationMatchStep,
});

export const toolBackUpStep = (question) => {
  const build = BY_TYPE[text(question?.type)];
  return build ? ordered(question, build(question)) : null;
};

export default toolBackUpStep;
