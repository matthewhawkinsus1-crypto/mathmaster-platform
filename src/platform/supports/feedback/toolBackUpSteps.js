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
 * move, in this problem's names (A and B, Nov and Dec, s, m and l).
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
    const SUB = '₀₁₂₃₄₅₆₇₈₉';
    const sub = (value) => String(value).replace(/\d/g, (digit) => SUB[Number(digit)]);
    const name = text(question.matrix) || Object.keys(isObject(question.matrices) ? question.matrices : {})[0] || 'A';
    if (target) {
      const element = `${name.toLowerCase()}${sub(target.row)}${sub(target.col)}`;
      return step(`In the name ${element}, which does the first number give?`, 'The row', 'The column');
    }
    return step(`Matrix ${name}'s dimensions are written as…`, 'rows × columns', 'columns × rows');
  }
  if (mode === 'operate') {
    const pair = operands(question);
    if (!pair) return null;
    const { left, right } = pair;
    if (text(question.operation) === 'add') {
      return step(`To add ${left} and ${right}, which numbers do you combine?`, 'The numbers in the same position', `Each row of ${left} with each column of ${right}`);
    }
    if (question.judgeInverse === true) {
      return step(`${left} and ${right} are inverses when ${left} · ${right} is…`, 'the identity matrix', 'a matrix of zeros');
    }
    if (question.askDefined !== false) {
      return step(`To decide whether ${left} · ${right} can be found, which two numbers do you compare?`, `The columns of ${left} and the rows of ${right}`, `The rows of ${left} and the rows of ${right}`);
    }
    return step(`Row 1, column 1 of ${left} · ${right} comes from which two?`, `Row 1 of ${left} and column 1 of ${right}`, `Column 1 of ${left} and row 1 of ${right}`);
  }
  if (mode === 'equation') {
    // A variable on the right of "=", or a number alone on the left: the
    // equation must be rearranged before its numbers go in A and B.
    const notStandard = list(question.equations).some((equation) => {
      const [leftSide, rightSide, extra] = text(equation).split('=');
      return extra === undefined && rightSide !== undefined && (/[a-z]/i.test(rightSide) || !/[a-z]/i.test(leftSide));
    });
    if (notStandard || isObject(question.startFrom)) {
      return step('Before an equation’s numbers go in A and B, how must it be written?', 'Every variable on the left, the constant on the right', 'Exactly as it is given');
    }
    return step('In A · X = B, what goes in A?', 'The coefficients of the variables', 'The constants');
  }
  if (mode === 'solve') {
    const meanings = isObject(question.variableMeanings) ? Object.keys(question.variableMeanings) : [];
    if (question.showEquations === false && meanings.length >= 2) {
      const count = meanings.length;
      return step(`The situation has ${numberWord(count)} unknowns (${joined(meanings.map((key) => text(question.variableMeanings[key]) || key))}). How many equations do you write?`, capitalized(numberWord(count)), capitalized(numberWord(count - 1)));
    }
    if (question.justifySingular === true) {
      return step('X = A⁻¹ · B works only when A…', 'has an inverse', 'has a zero in it');
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

const BY_TYPE = Object.freeze({
  matrixLab: matrixLabStep,
  systemsWorkspace: systemsWorkspaceStep,
});

export const toolBackUpStep = (question) => {
  const build = BY_TYPE[text(question?.type)];
  return build ? ordered(question, build(question)) : null;
};

export default toolBackUpStep;
