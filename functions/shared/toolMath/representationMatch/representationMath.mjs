import { evaluateFunctionSpec, nearlyEqual, round } from '../shared/toolMath.mjs';
import {
  canonicalFromEquationText,
  canonicalFromPointSlope,
  canonicalFromSlopeIntercept,
  fractionToNumber,
  pointOnCanonicalLine,
  slopeOf,
  xInterceptOf,
  yInterceptOf,
  linesEquivalent as canonicalLinesEquivalent,
} from '../shared/linearEquations.mjs';

export const buildDefaultRepresentationSets = () => ([
  { id: 'linear', equation: 'y = 2x + 1', table: '(0,1), (1,3), (2,5)', context: 'Starts at 1 and increases by 2 each step.', graphSpec: { type: 'linear', a: 2, h: 0, k: 1 } },
  { id: 'quadratic', equation: 'y = x²', table: '(-2,4), (-1,1), (0,0), (1,1)', context: 'Symmetric growth from a minimum at the origin.', graphSpec: { type: 'quadratic', a: 1, h: 0, k: 0 } },
  { id: 'exponential', equation: 'y = 2ˣ', table: '(0,1), (1,2), (2,4), (3,8)', context: 'Doubles for each increase of 1 in x.', graphSpec: { type: 'exponential', a: 1, h: 0, k: 0, base: 2 } },
]);

export const scoreRepresentationMatch = (targetId, selections = {}, kinds = ['equation', 'table', 'context']) => {
  const checks = kinds.map((kind) => selections[kind] === targetId);
  return { checks, score: checks.filter(Boolean).length / Math.max(1, checks.length), isCorrect: checks.every(Boolean) };
};

export const mismatchedRepresentationKinds = (targetId, mixed = {}, kinds = ['equation', 'table', 'context']) =>
  kinds.filter((kind) => mixed[kind + 'Id'] != null && mixed[kind + 'Id'] !== targetId);

export const tableRowsForFunction = (spec = {}, xValues = [-2, -1, 0, 1, 2]) =>
  xValues.map((x) => [Number(x), round(evaluateFunctionSpec(spec, Number(x)), 6)]).filter(([, y]) => Number.isFinite(y));

export const findTableMismatchIndexes = (spec = {}, rows = [], tolerance = 1e-6) => rows.reduce((indexes, row, index) => {
  if (!Array.isArray(row) || row.length !== 2) return [...indexes, index];
  const x = Number(row[0]);
  const y = Number(row[1]);
  const expected = evaluateFunctionSpec(spec, x);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(expected) || !nearlyEqual(y, expected, tolerance)) return [...indexes, index];
  return indexes;
}, []);

export const representationById = (sets = [], id) => sets.find((item) => item.id === id) || null;

export const mixedRepresentationCards = (sets = [], mixed = {}, kinds = ['equation', 'table', 'context']) => kinds.map((kind) => {
  const sourceId = mixed[kind + 'Id'];
  const source = representationById(sets, sourceId);
  return { kind, sourceId, value: source?.[kind] ?? '' };
});

/*
 * WHAT EACH VIEW SHOWS, RESOLVED FROM THE QUESTION.
 *
 * RepresentationMatch.jsx renders from these and the shared grader
 * (functions/shared/serverGrading/tools/representationMatch.mjs) grades from
 * them, so the board the student sees and the board the server marks are one
 * board — including every fallback for a field the author left out.
 */
export const REPRESENTATION_MATCH_MODES = Object.freeze(['completeSet', 'findMismatch', 'tableAudit', 'graphMatch', 'linearConnections']);

/** The view the tool routes to: `mode`, or completeSet when it is missing. */
export const representationMatchMode = (question = {}) => question?.mode || 'completeSet';

/** The relationships on the board. linearConnections never falls back to the
 * demo sets — an authoring mistake there is an empty board, not a silently
 * wrong linear question. */
export const representationSetsFor = (question = {}) => {
  if (representationMatchMode(question) === 'linearConnections') return Array.isArray(question?.sets) ? question.sets : [];
  return Array.isArray(question?.sets) && question.sets.length ? question.sets : buildDefaultRepresentationSets();
};

export const representationTargetId = (question = {}, sets = representationSetsFor(question)) => question?.targetId || sets[0]?.id;

/** findMismatch's three source ids: authored, or the target's equation and
 * context with the first other set's table. */
export const representationMixedSet = (question = {}, sets = representationSetsFor(question), targetId = representationTargetId(question, sets)) => {
  if (question?.mixedSet) return question.mixedSet;
  const fallbackMismatchId = sets.find((item) => item?.id !== targetId)?.id || targetId;
  return { equationId: targetId, tableId: fallbackMismatchId, contextId: targetId };
};

export const tableAuditFunction = (question = {}) => question?.function || { type: 'quadratic', a: 1, h: 0, k: 0 };

/** tableAudit's rows. Stored Path rows are Firestore-safe `{ cells: [...] }`
 * maps; authored and preview content uses plain arrays. Without authored rows
 * the table samples x = -2..2 and corrupts the middle row by +2. */
export const tableAuditRows = (question = {}, spec = tableAuditFunction(question)) => {
  if (Array.isArray(question?.rows) && question.rows.length) {
    return question.rows.map((row) => (Array.isArray(row) ? row : (Array.isArray(row?.cells) ? row.cells : [])));
  }
  const rows = tableRowsForFunction(spec, [-2, -1, 0, 1, 2]);
  return rows.map((row, index) => (index === Math.min(2, rows.length - 1) ? [row[0], row[1] + 2] : row));
};

// --- linearConnections ------------------------------------------------
//
// Every card kind a linearConnections set may expose. "graph" and the four
// numeric kinds are read as-is; the three equation kinds are free text in
// whatever surface form the author chose ("y=-2x+5", "y-1=-2(x-2)",
// "2x+y=5") because canonicalFromEquationText resolves any of them to the
// same line without needing to know which form it is looking at.
export const LINEAR_CARD_KINDS = ['slopeIntercept', 'factoredLinear', 'pointSlope', 'standard', 'graph', 'slope', 'point', 'xIntercept', 'yIntercept', 'context', 'table'];

// The equation forms a findMismatch task compares.
export const LINEAR_EQUATION_KINDS = ['slopeIntercept', 'factoredLinear', 'pointSlope', 'standard'];

/** linearConnections' task: findMismatch when authored, otherwise group. */
export const linearConnectionsTask = (question = {}) => (question?.task === 'findMismatch' ? 'findMismatch' : 'group');

/** The card kinds a group deck draws from: authored `cardKinds`, or all. */
export const linearConnectionsCardKinds = (question = {}) => (
  Array.isArray(question?.cardKinds) && question.cardKinds.length ? question.cardKinds : LINEAR_CARD_KINDS
);

/** The set a findMismatch task is built from (`mismatchSetId`), or null. */
export const linearMismatchSetFor = (question = {}, sets = []) => sets.find((set) => set?.id === question?.mismatchSetId) || null;

/**
 * A card placement map ({ [cardId]: slot }) as plain student work: one
 * { cardId, slot } per placed card, in card-id order, so the same board is
 * always the same bytes and no card id has to fit an object-key limit.
 */
export const linearPlacementsFromAssignments = (assignments = {}) => Object.keys(assignments || {})
  .filter((cardId) => assignments[cardId] != null)
  .sort()
  .map((cardId) => ({ cardId, slot: assignments[cardId] }));

/*
 * A TABLE CARD (student UX pass, R-9).
 *
 * A compact, read-only x/y table is the representation a warm-up most wants
 * and the card sort could not show. It is opt-in: `table` joins the card kinds,
 * but a set only produces a table card when it authors one, so no existing
 * assignment changes.
 *
 * Authored as rows, in any of the shapes the platform already accepts:
 *   table: [{ x: 0, y: 3 }, { x: 1, y: 5 }]        Firestore-safe, preferred
 *   table: [[0, 3], [1, 5]]                          preview / raw JSON
 *   table: { points: [[0, 3], [1, 5]] }               `points` is repaired to
 *                                                     {x, y} on import
 *   table: '(0, 3), (1, 5), (2, 7)'                  text
 *   table: { xValues: [-1, 0, 1, 2] }                y computed from the
 *                                                     set's own line
 * Two to six rows with distinct x. Validated against the set's line like every
 * other card (inconsistentLinearCardKinds).
 */
const MAX_TABLE_ROWS = 6;

const pairOf = (row) => {
  if (Array.isArray(row) && row.length === 2) return [Number(row[0]), Number(row[1])];
  if (row && typeof row === 'object' && 'x' in row && 'y' in row) return [Number(row.x), Number(row.y)];
  if (row && typeof row === 'object' && Array.isArray(row.cells) && row.cells.length === 2) return [Number(row.cells[0]), Number(row.cells[1])];
  return null;
};

export const linearTableRows = (value, set = {}) => {
  if (value == null) return null;
  let rows = null;
  if (typeof value === 'string') {
    rows = [...value.matchAll(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g)].map((match) => [Number(match[1]), Number(match[2])]);
  } else if (Array.isArray(value)) {
    rows = value.map(pairOf);
  } else if (typeof value === 'object' && Array.isArray(value.points)) {
    rows = value.points.map(pairOf);
  } else if (typeof value === 'object' && Array.isArray(value.rows)) {
    rows = value.rows.map(pairOf);
  } else if (typeof value === 'object' && Array.isArray(value.xValues)) {
    // eslint-disable-next-line no-use-before-define -- hoisted function declaration below
    const line = canonicalLineForSet({ ...set, table: undefined });
    if (!line || line.vertical) return null;
    const m = fractionToNumber(slopeOf(line));
    const b = fractionToNumber(yInterceptOf(line));
    if (!Number.isFinite(m) || !Number.isFinite(b)) return null;
    rows = value.xValues.map((x) => [Number(x), round(m * Number(x) + b, 6)]);
  }
  if (!rows || rows.length < 2 || rows.length > MAX_TABLE_ROWS) return null;
  if (rows.some((row) => !row || !row.every(Number.isFinite))) return null;
  if (new Set(rows.map(([x]) => x)).size !== rows.length) return null;
  return rows;
};

const linearCardValue = (set = {}, kind) => {
  if (kind === 'graph') return set.graphSpec ?? null;
  if (kind === 'table') return linearTableRows(set.table, set);
  return set[kind];
};

const hasLinearCardValue = (value, kind = null) => (
  kind === 'table' ? Array.isArray(value) && value.length >= 2
    : Array.isArray(value) ? value.length === 2 && value.every((entry) => Number.isFinite(Number(entry)))
      : typeof value === 'number' ? Number.isFinite(value)
        : typeof value === 'object' ? Boolean(value)
          : value != null && String(value).trim() !== ''
);

/*
 * WHAT THE GROUPS ARE CALLED.
 *
 * "Line A / Line B" is right when the task is two lines and wrong when it is
 * two situations — PR #397's second warm-up asked students to sort cards "into
 * the situation it describes" under buttons that said Line A and Line B. The
 * noun follows the authored task: `groupNoun` when the author gives one,
 * "Situation" when every set carries a context card, "Line" otherwise. A set
 * may also name its own group (`label`, e.g. "Maya's savings").
 */
export const linearGroupNoun = (question = {}, sets = []) => {
  const authored = String(question.groupNoun || '').trim();
  if (authored) return authored.charAt(0).toUpperCase() + authored.slice(1);
  const hasContexts = sets.length > 0 && sets.every((set) => String(set?.context || '').trim());
  return hasContexts ? 'Situation' : 'Line';
};

export const linearGroupLabels = (question = {}, sets = []) => {
  const noun = linearGroupNoun(question, sets);
  return sets.map((set, index) => {
    const own = String(set?.label || '').trim();
    return own || `${noun} ${String.fromCharCode(65 + index)}`;
  });
};

const pointText = (value) => (Array.isArray(value) ? `(${value[0]}, ${value[1]})` : String(value ?? ''));

/**
 * The words a screen reader hears for a card: its kind AND what it says.
 * The card buttons carried only "Slope-intercept equation card, currently
 * Unassigned" — every equation sounded identical and the task was impossible
 * without sight. A graph is described by two lattice points it passes through
 * inside the authored window, which is what a sighted student reads off it.
 */
export const describeLinearCard = (card, { bounds = null } = {}) => {
  if (!card) return '';
  if (card.kind === 'graph') {
    const spec = card.value || {};
    const xMin = Math.ceil(Number(bounds?.xMin ?? -8));
    const xMax = Math.floor(Number(bounds?.xMax ?? 8));
    const yMin = Number(bounds?.yMin ?? -8);
    const yMax = Number(bounds?.yMax ?? 8);
    // Nearest the y-axis first: the points a student reads off first.
    const order = [];
    for (let step = 0; step <= Math.max(Math.abs(xMin), Math.abs(xMax)); step += 1) order.push(step, -step);
    const lattice = [];
    for (const x of order) {
      if (lattice.length >= 2) break;
      if (x < xMin || x > xMax) continue;
      const y = evaluateFunctionSpec(spec, x);
      const label = `(${x}, ${round(y, 9)})`;
      if (Number.isFinite(y) && Number.isInteger(round(y, 9)) && y >= yMin && y <= yMax && !lattice.includes(label)) lattice.push(label);
    }
    return lattice.length === 2 ? `a line through ${lattice[0]} and ${lattice[1]}` : 'a straight line';
  }
  if (card.kind === 'table') {
    return `x and y values ${(card.value || []).map(([x, y]) => `${x}, ${y}`).join('; ')}`;
  }
  if (card.kind === 'slope') return `m = ${card.value}`;
  if (['point', 'xIntercept', 'yIntercept'].includes(card.kind)) return pointText(card.value);
  return String(card.value ?? '');
};

/** The canonical line a linearConnections set describes, preferring whichever
 * explicit field can determine it — an equation string, then slope+point,
 * then a linear graphSpec. Used for authoring validation and for detecting an
 * intentionally mismatched card, never for scoring the plain grouping task
 * (there, the authored set membership itself is the ground truth). */
export function canonicalLineForSet(set = {}) {
  if (set.slopeIntercept) { const line = canonicalFromEquationText(set.slopeIntercept); if (line) return line; }
  if (set.factoredLinear) { const line = canonicalFromEquationText(set.factoredLinear); if (line) return line; }
  if (set.standard) { const line = canonicalFromEquationText(set.standard); if (line) return line; }
  if (set.pointSlope) { const line = canonicalFromEquationText(set.pointSlope); if (line) return line; }
  if (Number.isFinite(Number(set.slope)) && Array.isArray(set.point)) {
    const line = canonicalFromPointSlope(set.point, Number(set.slope));
    if (line) return line;
  }
  if (set.graphSpec?.type === 'linear') {
    const a = Number(set.graphSpec.a ?? 1);
    const h = Number(set.graphSpec.h ?? 0);
    const k = Number(set.graphSpec.k ?? 0);
    if ([a, h, k].every(Number.isFinite)) return canonicalFromSlopeIntercept(a, k - a * h);
  }
  // Last: two explicit table rows determine the line too. (A computed table,
  // `{ xValues }`, needs a line from elsewhere and cannot supply one.)
  if (set.table != null && !Array.isArray(set.table?.xValues)) {
    const rows = linearTableRows(set.table, set);
    if (rows && rows[1][0] !== rows[0][0]) {
      const slope = (rows[1][1] - rows[0][1]) / (rows[1][0] - rows[0][0]);
      const line = canonicalFromPointSlope(rows[0], slope);
      if (line) return line;
    }
  }
  return null;
}

/** Validate every mathematical card against a chosen canonical line. */
export const inconsistentLinearCardKinds = (set = {}, line = canonicalLineForSet(set)) => {
  if (!line) return [];
  const inconsistent = [];
  ['slopeIntercept', 'factoredLinear', 'pointSlope', 'standard'].forEach((kind) => {
    if (hasLinearCardValue(set[kind]) && !canonicalLinesEquivalent(canonicalFromEquationText(set[kind]), line)) inconsistent.push(kind);
  });
  if (hasLinearCardValue(set.graphSpec)) {
    const graphLine = set.graphSpec?.type === 'linear'
      ? canonicalFromSlopeIntercept(Number(set.graphSpec.a ?? 1), Number(set.graphSpec.k ?? 0) - Number(set.graphSpec.a ?? 1) * Number(set.graphSpec.h ?? 0))
      : null;
    if (!canonicalLinesEquivalent(graphLine, line)) inconsistent.push('graph');
  }
  if (hasLinearCardValue(set.slope) && (line.vertical || Math.abs(Number(set.slope) - fractionToNumber(slopeOf(line))) > 1e-6)) inconsistent.push('slope');
  if (hasLinearCardValue(set.point) && !pointOnCanonicalLine(line, set.point)) inconsistent.push('point');
  if (set.table != null) {
    const rows = linearTableRows(set.table, set);
    if (!rows || rows.some((row) => !pointOnCanonicalLine(line, row))) inconsistent.push('table');
  }
  const checkIntercept = (kind, actual, expected) => {
    if (!hasLinearCardValue(actual)) return;
    const coordinate = Array.isArray(actual) ? Number(actual[kind === 'xIntercept' ? 0 : 1]) : Number(actual);
    if (!expected || !Number.isFinite(coordinate) || Math.abs(coordinate - fractionToNumber(expected)) > 1e-6) inconsistent.push(kind);
  };
  checkIntercept('xIntercept', set.xIntercept, xInterceptOf(line));
  checkIntercept('yIntercept', set.yIntercept, yInterceptOf(line));
  return inconsistent;
};

/** Build the shuffleable card deck for the "group the representations" task:
 * one card per (set, kind) pair that the set actually supplies. */
export const buildLinearConnectionCards = (sets = [], kinds = LINEAR_CARD_KINDS) => {
  const cards = [];
  sets.forEach((set) => {
    kinds.forEach((kind) => {
      const value = linearCardValue(set, kind);
      if (!hasLinearCardValue(value, kind)) return;
      cards.push({ id: `${set.id}:${kind}`, setId: set.id, kind, value });
    });
  });
  return cards;
};

// A small deterministic PRNG so the card order is stable for a given question
// (same seed every render/reload) without persisting the shuffled order.
export const shuffleLinearConnectionCards = (cards, seed = 1) => {
  const shuffled = [...cards];
  let state = Number(seed) || 1;
  const nextRandom = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Scores a student's card -> slot assignment by comparing the PARTITION it
 * induces to the partition induced by each card's true source set, rather
 * than comparing slot labels directly — "Line A" and "Line B" are the
 * student's own labels and may not land in the same order the sets were
 * authored in, and this should not matter.
 */
export const scoreLinearConnectionGrouping = (cards, assignments = {}) => {
  let correctPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      totalPairs += 1;
      const sameActual = cards[i].setId === cards[j].setId;
      const sameAssigned = assignments[cards[i].id] != null && assignments[cards[i].id] === assignments[cards[j].id];
      if (sameActual === sameAssigned) correctPairs += 1;
    }
  }
  const assignedCards = cards.filter((card) => assignments[card.id] != null).length;
  const fullyAssigned = cards.length > 0 && assignedCards === cards.length;
  const pairScore = totalPairs ? correctPairs / totalPairs : 0;
  // An unplaced card is "apart" from every other card, so pair agreement alone
  // credited an untouched board for every cross-relationship pair (a blank
  // two-line deck of 14 cards scored 48/91 = 0.53). As in the open sort
  // (openSortMath scorePartitionAgainstScheme), credit is scaled by the share
  // of cards actually placed; a fully placed board scores exactly as before.
  const completion = cards.length ? assignedCards / cards.length : 0;
  return {
    score: pairScore * completion,
    pairScore,
    isCorrect: fullyAssigned && correctPairs === totalPairs,
    fullyAssigned,
    assignedCards,
    correctPairs,
    totalPairs,
  };
};

/**
 * Finds the card(s) that do not match the majority canonical line among a set
 * of cards nominally describing the same line — the error-analysis task. The
 * mismatch is DERIVED by canonicalizing and comparing every card, never
 * looked up from an authored "this one is wrong" flag, so a bad rewrite is
 * caught the same way a student's own bad rewrite would be.
 */
export const findLinearMismatch = (cards = []) => {
  const canonical = cards.map((card) => canonicalFromEquationText(card.value));
  const groups = [];
  canonical.forEach((line, index) => {
    if (!line) return;
    const group = groups.find((candidate) => canonicalLinesEquivalent(candidate.line, line));
    if (group) group.indexes.push(index); else groups.push({ line, indexes: [index] });
  });
  groups.sort((a, b) => b.indexes.length - a.indexes.length);
  const candidate = groups[0] || null;
  const majority = candidate && candidate.indexes.length > cards.length / 2 ? candidate : null;
  const mismatchIndexes = cards.map((_, index) => index).filter((index) => !majority?.indexes.includes(index));
  return { mismatchIndexes, majorityLine: majority?.line || null, mismatchIds: mismatchIndexes.map((index) => cards[index].id) };
};

export const scoreLinearMismatchSelection = (cards, selectedId) => {
  const { mismatchIds } = findLinearMismatch(cards);
  const ok = mismatchIds.length === 1 && selectedId === mismatchIds[0];
  return { ok, expectedId: mismatchIds.length === 1 ? mismatchIds[0] : null, mismatchIds };
};
