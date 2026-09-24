/*
 * SHARED STATE PRIMITIVES FOR STEP ALGEBRA'S STRUCTURE TOOLS.
 *
 * Factor, Split fraction, Cancel factors, Simplify arithmetic and Arrange terms
 * are all the same kind of thing: a short run of student decisions made on the
 * committed equation, which changes nothing until the student commits it. Each
 * tool's state is a plain JSON object so the existing question draft can
 * persist it, and each decision pushes the previous state onto that object's
 * own `undoStack`, so Universal Undo backs out exactly one decision — the last
 * prime factor chosen, the last denominator placed — instead of the whole tool.
 *
 * Every tool state records the equation it was opened on (`equationKey`). A
 * restored draft whose equation no longer matches is discarded rather than
 * replayed against different mathematics.
 */
import { parse } from 'mathjs';
import { expressionsEquivalent, splitAdditiveTerms } from './algebraAstEngine.js';

export const STRUCTURE_TOOL_UNDO_LIMIT = 40;

export const equationKey = (equation) => `${String(equation?.left ?? '')} = ${String(equation?.right ?? '')}`;

const withoutStack = (state) => {
  if (!state) return state;
  const { undoStack: _undoStack, lastActionKey: _lastActionKey, ...rest } = state;
  return rest;
};

/**
 * Record `next` as a new decision on top of `state`. A `coalesceKey` merges a
 * run of the same edit (every keystroke in one answer box) into one Undo step.
 */
export const pushTransient = (state, next, { coalesceKey = null } = {}) => {
  const previousStack = Array.isArray(state?.undoStack) ? state.undoStack : [];
  const coalescing = coalesceKey && state?.lastActionKey === coalesceKey;
  const undoStack = coalescing
    ? previousStack
    : [...previousStack, withoutStack(state)].slice(-STRUCTURE_TOOL_UNDO_LIMIT);
  return { ...next, undoStack, lastActionKey: coalesceKey || null };
};

/** Back out one decision. Null means the tool had nothing left and closes. */
export const undoTransient = (state) => {
  const stack = Array.isArray(state?.undoStack) ? state.undoStack : [];
  if (!stack.length) return null;
  const previous = stack[stack.length - 1];
  return { ...previous, undoStack: stack.slice(0, -1), lastActionKey: null };
};

// --- Signed additive items -------------------------------------------------------

/** A side as { sign, magnitude } items, straight from the engine's term split. */
export const sideItems = (expression) => (splitAdditiveTerms(expression) || []).map((term) => ({
  sign: term.sign < 0 ? -1 : 1,
  magnitude: String(term.magnitudeText || '').trim(),
}));

const unwrap = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};

const needsGrouping = (magnitude) => {
  try {
    const node = unwrap(parse(String(magnitude)));
    if (node?.type === 'OperatorNode' && ['add', 'subtract'].includes(node.fn) && node.args?.length === 2) return true;
    if (node?.type === 'OperatorNode' && node.fn === 'unaryMinus') return true;
    if (node?.type === 'ConstantNode' && typeof node.value === 'number' && node.value < 0) return true;
    return false;
  } catch {
    return true;
  }
};

const isQuotient = (magnitude) => {
  try {
    const node = unwrap(parse(String(magnitude)));
    return node?.type === 'OperatorNode' && node.fn === 'divide';
  } catch {
    return false;
  }
};

/** MathJS text for signed items, grouping any magnitude that needs it. */
export const serializeItems = (items = []) => {
  const text = items
    .filter((item) => String(item?.magnitude ?? '').trim())
    .map((item, index) => {
      const raw = String(item.magnitude).trim();
      const magnitude = needsGrouping(raw) ? `(${raw})` : raw;
      // A leading negative fraction is written with its sign in front, -5x/2,
      // not folded into the numerator as (-5x)/2.
      if (index === 0) return item.sign < 0 ? `-${isQuotient(raw) ? `(${raw})` : magnitude}` : magnitude;
      return `${item.sign < 0 ? '-' : '+'} ${magnitude}`;
    })
    .join(' ');
  return text || '0';
};

/**
 * Replace side items and prove the result is the same mathematics. Returns the
 * new side text, or null when the rebuild would not parse or would not be
 * equivalent — the caller then leaves the student's work untouched.
 */
export const rebuildSideSafely = (beforeExpression, items, variable = 'x') => {
  const after = serializeItems(items);
  try {
    parse(after);
  } catch {
    return null;
  }
  return expressionsEquivalent(beforeExpression, after, variable) ? after : null;
};

export const SIDE_LABEL = { left: 'left', right: 'right' };
