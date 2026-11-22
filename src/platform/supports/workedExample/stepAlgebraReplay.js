/*
 * THE STEP ALGEBRA REPLAY (WE-C; docs/platform/WORKED_EXAMPLES.md sections 4
 * and 7).
 *
 * A worked example for a Step Algebra question plays as the tool's own moves:
 * the operation lands on both sides, the terms that cancel go, each side is
 * simplified, and the next equation is the one the student's board would
 * show. Nothing here writes a line of mathematics. Every line of a slide is
 * what the tool's engine returns for the move:
 *
 *   applyBalancedOperation       the operation on both sides, and what cancels
 *                                (functions/shared/algebra/algebraAstEngine.mjs,
 *                                the function the board's own "apply" calls);
 *   resolveEquationAfterMove     the equation once those terms are cancelled
 *                                (algebraSupportLevels.mjs);
 *   simplifyStudentExpression    each side as the board's Simplify leaves it;
 *   isSolvedEquation             whether the equation is solved.
 *
 * So a slide cannot show a line the engine would not produce, and a script
 * that does not reach its answer is REFUSED: replayStepAlgebra returns
 * { ok: false, error } and the example is not played (the question keeps its
 * family's text example). Pre-Flight and the compiler report the same refusal
 * as an error on a new assignment (stepAlgebraReplayErrors).
 *
 * Two sources of moves:
 *
 *   authored   `lessonSupports.examples[]` with `tool: "stepAlgebra"`,
 *              `sibling.equation` and `moves` ([{ op, operand, why }, …,
 *              { check: true }]);
 *   built in   stepAlgebraMovesFor(equation): the x-terms to one side, then
 *              the numbers to the other, then the coefficient, then the
 *              check. Only for an equation whose sides are already plain
 *              (ax + b, whole numbers): anything else keeps the family's text
 *              example, which works the distribution or the fractions in words.
 */
import {
  applyBalancedOperation,
  equationToLatex as engineEquationLatex,
  expressionToLatex as engineExpressionLatex,
  expressionsEquivalent,
  getEquationAnalysis,
  isSolvedEquation,
  parseEquationInput,
  simplifyExpression,
  simplifyStudentExpression,
  splitAdditiveTerms,
} from '../../../../functions/shared/algebra/algebraAstEngine.mjs';
import { DEFAULT_SUPPORT_LEVEL, resolveEquationAfterMove } from '../../../../functions/shared/algebra/algebraSupportLevels.mjs';
import { ParenthesisNode, parse } from '../../../../functions/shared/algebra/safeMath.mjs';

export const STEP_ALGEBRA_REPLAY_TOOL = 'stepAlgebra';
export const STEP_ALGEBRA_REPLAY_OPERATIONS = Object.freeze(['add', 'subtract', 'multiply', 'divide']);
export const REPLAY_BOARD = Object.freeze({ MOVE: 'move', CHECK: 'check' });

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const compact = (value) => String(value ?? '').replace(/[\s*]+/g, '');
const refused = (error) => ({ ok: false, error });
// The engine's LaTeX, with the padding it leaves at the ends taken off.
const expressionToLatex = (expression) => engineExpressionLatex(expression).trim();
const equationToLatex = (equation) => engineEquationLatex(equation).split('=').map((side) => side.trim()).join(' = ');

/** The tool the entry plays on: named, or told by a sibling equation with moves. */
export const isStepAlgebraReplayEntry = (entry) => isObject(entry)
  && Array.isArray(entry.moves)
  && (text(entry.tool) ? text(entry.tool) === STEP_ALGEBRA_REPLAY_TOOL : Boolean(text(entry.sibling?.equation)));

/* -------------------------------------------------------------- one move */

// A side as the board's Simplify leaves it. The engine's own form is kept
// only where it is the same value and is not a rounded decimal (x/3 stays
// x/3: 0.3333333333x is not a line a student should be shown).
const simplifiedSide = (side, variable) => {
  let simplified;
  try {
    simplified = simplifyStudentExpression(side, variable);
  } catch {
    return side;
  }
  if (!simplified || compact(simplified) === compact(side)) return side;
  if (/\.\d{5,}/.test(simplified)) return side;
  return expressionsEquivalent(simplified, side, variable) ? simplified : side;
};

/**
 * One operation on both sides, as the board resolves it: the equation with
 * the operation on it, the equation once the cancelling terms are gone, and
 * the simplified equation the next move starts from.
 */
const applyReplayMove = (equation, operation, operand) => {
  // The engine's answer for a move depends only on the equation and the move,
  // and writing the built-in moves plays each one before the replay does:
  // the last few are kept, so each is worked out once.
  const key = [equation.left, equation.right, equation.variable, equation.objective?.kind, operation, String(operand)].join('\u0001');
  if (playedMoves.has(key)) return playedMoves.get(key);
  const played = playReplayMove(equation, operation, operand);
  if (playedMoves.size >= PLAYED_MOVES_KEPT) playedMoves.delete(playedMoves.keys().next().value);
  playedMoves.set(key, played);
  return played;
};
const PLAYED_MOVES_KEPT = 128;
const playedMoves = new Map();
const playReplayMove = (equation, operation, operand) => {
  const move = applyBalancedOperation({ equationState: equation, operation, operand: String(operand) });
  if (move.preservesSolution === false) throw new Error('that move would change the solutions');
  // Multiplying or dividing by an expression with a letter in it holds only
  // where that expression is not zero. The live board shows that condition
  // beside the move; a slide has nowhere to show it yet, so the move is
  // refused instead of being played as if it had no condition.
  if (move.assumption) {
    throw new Error(`${operation === 'divide' ? 'dividing' : 'multiplying'} by ${move.operandExpression} is only valid where ${move.assumption}, and a replay cannot show that condition. Use a number, or add or subtract the term`);
  }
  const cancels = list(move.requiredCancellationSides);
  const cancelled = resolveEquationAfterMove(move, DEFAULT_SUPPORT_LEVEL, cancels);
  const next = {
    ...cancelled,
    left: simplifiedSide(cancelled.left, equation.variable),
    right: simplifiedSide(cancelled.right, equation.variable),
  };
  const cancelledLatex = equationToLatex(cancelled);
  const afterLatex = equationToLatex(next);
  return {
    next,
    operandLatex: expressionToLatex(move.operandExpression),
    label: `${move.operationLabel} $${expressionToLatex(move.operandExpression)}$ on both sides`,
    board: {
      kind: REPLAY_BOARD.MOVE,
      operation,
      before: equationToLatex(equation),
      applied: `${move.unsimplifiedLatex.left.trim()} = ${move.unsimplifiedLatex.right.trim()}`,
      cancels,
      // Shown only where cancelling is a line of its own: something cancelled,
      // and a side still had to be simplified after it.
      cancelled: cancels.length && compact(cancelledLatex) !== compact(afterLatex) ? cancelledLatex : '',
      after: afterLatex,
    },
  };
};

/* -------------------------------------------------------------- the check */

// The solved equation's value: the side that is not the variable.
const solvedValue = (equation) => {
  const variable = equation.variable;
  const side = compact(equation.left) === variable ? equation.right : compact(equation.right) === variable ? equation.left : null;
  if (side === null) return null;
  try {
    return simplifyExpression(side);
  } catch {
    return side;
  }
};

const substituted = (expression, variable, value) => parse(expression)
  .transform((node) => (node.isSymbolNode && node.name === variable ? new ParenthesisNode(parse(value)) : node))
  .toString({ parenthesis: 'keep', implicit: 'hide' });

const checkBoard = (first, variable, value) => {
  const left = substituted(first.left, variable, value);
  const right = substituted(first.right, variable, value);
  const leftValue = simplifyExpression(left);
  const rightValue = simplifyExpression(right);
  if (!expressionsEquivalent(leftValue, rightValue, variable)) return null;
  return {
    kind: REPLAY_BOARD.CHECK,
    before: equationToLatex(first),
    applied: `${expressionToLatex(left)} = ${expressionToLatex(right)}`,
    cancels: [],
    cancelled: '',
    after: `${expressionToLatex(leftValue)} = ${expressionToLatex(rightValue)}`,
    sideValue: expressionToLatex(leftValue),
  };
};

/* ------------------------------------------------------------- the replay */

const readEquation = (source) => {
  const equation = text(isObject(source) ? source.equation : source);
  if (!equation) return null;
  try {
    const variable = text(isObject(source) ? source.variable : '');
    return parseEquationInput(variable ? { equation, variable } : { equation });
  } catch {
    return null;
  }
};

/**
 * Run a script of moves through the board's engine.
 *
 *   replayStepAlgebra({ sibling: { equation }, moves })
 *     → { ok: true, prompt, steps: [{ show, why, board }], answer, moveCount }
 *     | { ok: false, error }
 *
 * `show` is the slide in one sentence (what Read aloud and Translate are
 * given, and what the same-answer guard reads); `board` is the same move as
 * the lines the board shows. `moveCount` counts the operations, not the check.
 * `fadeLimit` is how many steps come before the solving move (the one whose
 * line reads x = value): the most a faded example may show.
 */
export const replayStepAlgebra = ({ sibling = null, equation: equationText = '', moves = [] } = {}) => {
  const first = readEquation(sibling || equationText);
  if (!first) return refused('the sibling equation cannot be read. Write it as text with one equals sign, for example { "equation": "5x + 3 = 2x - 9" }.');
  const variable = first.variable;
  const script = list(moves);
  if (!script.length) return refused('it has no moves to play.');

  let equation = first;
  let checked = false;
  let fadeLimit = null;
  const steps = [];
  for (let index = 0; index < script.length; index += 1) {
    const move = script[index];
    const at = `moves[${index}]`;
    if (!isObject(move)) return refused(`${at} is not a move.`);
    const why = text(move.why);
    if (move.check !== undefined && move.op === undefined) {
      if (!isSolvedEquation(equation)) {
        return refused(`${at} checks the answer, but the equation is not solved there: it reads ${equationToLatex(equation)}.`);
      }
      const value = solvedValue(equation);
      let board = null;
      try {
        board = value === null ? null : checkBoard(first, variable, value);
      } catch {
        board = null;
      }
      if (!board) return refused(`${at} checks the answer, but ${variable} = ${value} does not make the two sides of the first equation equal.`);
      const valueLatex = expressionToLatex(value);
      steps.push({
        show: `Check: put $${variable} = ${valueLatex}$ into $${board.before}$. Both sides equal $${board.sideValue}$.`,
        why,
        board: { ...board, label: `Check $${variable} = ${valueLatex}$ in the first equation` },
      });
      checked = true;
      continue;
    }
    const operation = text(move.op);
    if (!STEP_ALGEBRA_REPLAY_OPERATIONS.includes(operation)) {
      return refused(`${at}.op "${operation}" is not a Step Algebra move. Use ${STEP_ALGEBRA_REPLAY_OPERATIONS.join(', ')}.`);
    }
    if (move.operand === undefined || move.operand === null || text(String(move.operand)) === '') {
      return refused(`${at} needs an operand: what to ${operation}, for example "2x" or 3.`);
    }
    if (checked) return refused(`${at} comes after the check. The check is the last move.`);
    if (isSolvedEquation(equation)) return refused(`${at} comes after the equation is solved: it already reads ${equationToLatex(equation)}.`);
    let applied;
    try {
      applied = applyReplayMove(equation, operation, move.operand);
    } catch (error) {
      return refused(`${at} cannot be played on ${equationToLatex(equation)}: ${text(error?.message).replace(/\.$/, '') || 'the board refuses it'}.`);
    }
    steps.push({
      show: `${applied.label}: $${applied.board.after}$.`,
      why,
      board: { ...applied.board, label: applied.label },
    });
    equation = applied.next;
    if (fadeLimit === null && isSolvedEquation(equation)) fadeLimit = steps.length - 1;
  }

  if (!isSolvedEquation(equation)) {
    return refused(`its moves end at ${equationToLatex(equation)}, which is not solved for ${variable}. Add the moves that finish it.`);
  }
  const value = solvedValue(equation);
  if (value === null) return refused(`its moves end at ${equationToLatex(equation)}, which does not give ${variable} a value.`);
  return {
    ok: true,
    prompt: `Solve $${equationToLatex(first)}$ for $${variable}$.`,
    steps,
    answer: `$${variable} = ${expressionToLatex(value)}$`,
    moveCount: steps.filter((step) => step.board.kind === REPLAY_BOARD.MOVE).length,
    fadeLimit: fadeLimit ?? 0,
  };
};

/* ----------------------------------------------------- the built-in moves */

const whole = (value) => Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-9;
const zero = (value) => Math.abs(value) < 1e-9;
// A side the built-in moves start from: at most a variable term and a number,
// with nothing to distribute and no fraction to clear.
const plainSide = (side) => {
  try {
    return !/[()/^]/.test(side) && splitAdditiveTerms(side).length <= 2;
  } catch {
    return false;
  }
};

export const REPLAY_WHY = Object.freeze({
  variables: 'Collect the variable terms on one side.',
  constants: 'Collect the numbers on the other side.',
  coefficient: 'Undo the multiplication, so the variable stands alone.',
  check: 'Put the value back into the first equation: both sides must match.',
});

/**
 * The moves the platform plays for an equation with no authored script:
 * variables on both sides first, then the numbers, then the coefficient, then
 * the check. Null where the equation is not a plain whole-number linear
 * equation with one solution (its family's text example covers it).
 */
export const stepAlgebraMovesFor = (source) => {
  const first = readEquation(source);
  if (!first) return null;
  const variable = first.variable;
  if (!plainSide(first.left) || !plainSide(first.right)) return null;
  const moves = [];
  let equation = first;
  for (let guard = 0; guard < 6 && !isSolvedEquation(equation); guard += 1) {
    let analysis;
    try {
      analysis = getEquationAnalysis(equation);
    } catch {
      return null;
    }
    if (!analysis?.numericLinear || analysis.hasUniqueSolution === false) return null;
    const { left, right } = analysis;
    if (![left.coefficient, left.constant, right.coefficient, right.constant].every(whole)) return null;
    let move = null;
    if (!zero(left.coefficient) && !zero(right.coefficient)) {
      const size = Math.abs(Math.round(right.coefficient));
      move = { op: right.coefficient > 0 ? 'subtract' : 'add', operand: `${size === 1 ? '' : size}${variable}`, why: REPLAY_WHY.variables };
    } else {
      const side = zero(left.coefficient) ? right : left;
      if (!zero(side.constant)) {
        move = { op: side.constant > 0 ? 'subtract' : 'add', operand: String(Math.abs(Math.round(side.constant))), why: REPLAY_WHY.constants };
      } else if (!zero(side.coefficient - 1)) {
        move = { op: 'divide', operand: String(Math.round(side.coefficient)), why: REPLAY_WHY.coefficient };
      }
    }
    if (!move) return null;
    try {
      equation = applyReplayMove(equation, move.op, move.operand).next;
    } catch {
      return null;
    }
    moves.push(move);
  }
  if (!moves.length || !isSolvedEquation(equation)) return null;
  return [...moves, { check: true, why: REPLAY_WHY.check }];
};

/* ------------------------------------------------- Pre-Flight's refusal */

/** How many steps a `fade` asks to show: `handOverAfter`, or the steps before `fromStep`. Zero for none. */
export const replayHandOver = (fade) => {
  if (!isObject(fade)) return 0;
  if (Number.isInteger(fade.handOverAfter)) return Math.max(0, fade.handOverAfter);
  return Number.isInteger(fade.fromStep) ? Math.max(0, fade.fromStep - 1) : 0;
};

/**
 * The errors Pre-Flight and the compiler raise for a lesson's Step Algebra
 * replays: an authored script the board's engine cannot play to its answer.
 * An assignment with no such example returns none.
 */
export const stepAlgebraReplayErrors = (input = {}) => {
  const examples = list(input?.lessonSupports?.examples);
  const errors = [];
  examples.forEach((entry, index) => {
    if (!isStepAlgebraReplayEntry(entry)) return;
    const replay = replayStepAlgebra({ sibling: entry.sibling, moves: entry.moves });
    if (!replay.ok) {
      errors.push(`lessonSupports.examples[${index}] is a Step Algebra replay the tool cannot play: ${replay.error} A replay is checked by the tool's own engine, so its moves must reach the answer.`);
      return;
    }
    const handOver = replayHandOver(entry.fade);
    if (handOver > replay.fadeLimit) {
      errors.push(`lessonSupports.examples[${index}].fade would show the solved equation: move ${replay.fadeLimit + 1} is the one that leaves the variable alone, and a faded example stops before it. ${replay.fadeLimit >= 1 ? `Use handOverAfter of ${replay.fadeLimit} or less.` : 'This replay has one move, so it has nothing to fade: take the fade out.'}`);
    }
  });
  return errors;
};
