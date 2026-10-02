/*
 * Shared grader for the `representationMatch` registry tool — run by the browser tool for
 * feedback, by QuestionEngine for the recorded verdict, and by the server as
 * the authority. See ../toolGraderDefinition.mjs for the contract.
 *
 * Extracted check-for-check from RepresentationMatch.jsx, reading the question
 * through the same resolvers the screen renders from (representationMath.mjs):
 * the demo-set, targetId, mixedSet, table-function and default-row fallbacks,
 * the 0.01 table tolerance, the "exactly one mismatch" rules, the 1 / 0.6 / 0
 * linear findMismatch score, and the pair-agreement score of the linear sort.
 *
 * Two deliberate corrections:
 *   - tableAudit: a blank row choice is unanswered. The screen compared
 *     `Number(badRow)`, and Number(null) === 0, so a blank choice matched an
 *     authored bad row 0. (The screen disabled Check for a blank row, so only
 *     a tampered or deadline-held response could reach it.)
 *   - linearConnections group: scoreLinearConnectionGrouping now scales pair
 *     agreement by the share of cards placed, so an untouched board scores 0
 *     instead of the ~0.5 an unplaced card's "kept apart" pairs earned.
 *     "Check groups" is never disabled, so this changes the recorded partial
 *     credit of a partly sorted board; a fully sorted board scores as before.
 *
 * Each pick is read the way its control stores it (a button keeps the set's
 * id as authored, a <select> always holds a string), so a response can never
 * answer anything the screen could not.
 */
import declaration from '../declarations/representationMatch.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import {
  LINEAR_EQUATION_KINDS,
  buildLinearConnectionCards,
  findTableMismatchIndexes,
  linearConnectionsCardKinds,
  linearConnectionsTask,
  linearMismatchSetFor,
  mismatchedRepresentationKinds,
  representationMixedSet,
  representationSetsFor,
  representationTargetId,
  scoreLinearConnectionGrouping,
  scoreLinearMismatchSelection,
  scoreRepresentationMatch,
  tableAuditFunction,
  tableAuditRows,
} from '../../toolMath/representationMatch/representationMath.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
// A tapped card or button stores the set's own id (a string, or an authored
// numeric id); anything else is no selection. Compared with `===`, as the
// screen does.
const selection = (value) => (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? value : '');
// A <select> always stores the option's value as a STRING, so only a string
// is something the screen could have submitted — a numeric value is never a
// choice the student made, even where an authored id is numeric.
const optionChoice = (value) => (typeof value === 'string' ? value : '');
const chosen = (value) => value !== '';
const shown = (value) => (value === '' ? '' : String(value));

// The equation is a row of buttons (the set id as authored); table and context
// are <select>s.
const COMPLETE_SET_KINDS = [
  ['equation', 'Equation', selection],
  ['table', 'Table', optionChoice],
  ['context', 'Context', optionChoice],
];

const completeSet = (question, work) => {
  const sets = representationSetsFor(question);
  const targetId = representationTargetId(question, sets);
  const selections = Object.fromEntries(COMPLETE_SET_KINDS.map(([kind, , read]) => [kind, read(work[kind])]));
  const result = scoreRepresentationMatch(targetId, selections, COMPLETE_SET_KINDS.map(([kind]) => kind));
  return gradedResult({
    isCorrect: result.isCorrect,
    score: result.score,
    parts: COMPLETE_SET_KINDS.map(([kind, label], index) => ({
      id: kind,
      label,
      isComplete: chosen(selections[kind]),
      isCorrect: result.checks[index],
      response: shown(selections[kind]),
    })),
  });
};

const findMismatch = (question, work) => {
  const sets = representationSetsFor(question);
  const targetId = representationTargetId(question, sets);
  const expected = mismatchedRepresentationKinds(targetId, representationMixedSet(question, sets, targetId));
  const choice = typeof work.mismatchKind === 'string' ? work.mismatchKind : '';
  const ok = expected.length === 1 && choice === expected[0];
  return gradedResult({
    isCorrect: ok,
    score: ok ? 1 : 0,
    parts: [{ id: 'mismatch', label: 'Card that does not belong', isComplete: chosen(choice), isCorrect: ok, response: choice }],
  });
};

// The row the student tapped, or null when none is chosen.
const rowChoice = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const tableAudit = (question, work) => {
  const spec = tableAuditFunction(question);
  const expected = findTableMismatchIndexes(spec, tableAuditRows(question, spec), Number(question.tolerance ?? 0.01));
  const row = rowChoice(work.rowIndex);
  const ok = expected.length === 1 && row !== null && row === expected[0];
  return gradedResult({
    isCorrect: ok,
    score: ok ? 1 : 0,
    parts: [{ id: 'row', label: 'Row that breaks the rule', isComplete: row !== null, isCorrect: ok, response: row === null ? '' : `Row ${row + 1}` }],
  });
};

const graphMatch = (question, work) => {
  const sets = representationSetsFor(question);
  const targetId = representationTargetId(question, sets);
  const graphId = selection(work.graphId);
  const ok = graphId === targetId;
  return gradedResult({
    isCorrect: ok,
    score: ok ? 1 : 0,
    parts: [{ id: 'graph', label: 'Matching graph', isComplete: chosen(graphId), isCorrect: ok, response: shown(graphId) }],
  });
};

/*
 * The student's placements, back as the { [cardId]: slot } map the screen
 * holds. A slot is one of the group buttons the screen offers (0 … sets − 1);
 * any other value is no placement.
 */
const readAssignments = (placements, slotCount) => {
  const assignments = {};
  (Array.isArray(placements) ? placements : []).forEach((placement) => {
    if (!isObject(placement) || typeof placement.cardId !== 'string') return;
    const slot = placement.slot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount) return;
    assignments[placement.cardId] = slot;
  });
  return assignments;
};

const linearGroup = (question, work) => {
  const sets = representationSetsFor(question);
  // The deck as the screen builds it. The screen also shuffles it (seeded,
  // for display only); pair scoring does not depend on order.
  const cards = buildLinearConnectionCards(sets, linearConnectionsCardKinds(question));
  const result = scoreLinearConnectionGrouping(cards, readAssignments(work.assignments, sets.length));
  return gradedResult({
    isComplete: result.fullyAssigned,
    isCorrect: result.isCorrect,
    score: result.score,
    parts: [{
      id: 'pairings',
      label: 'Card pairings correct',
      isComplete: result.fullyAssigned,
      isCorrect: result.isCorrect,
      credit: result.score,
      // The tally the screen's feedback reads: "<n> of <total>".
      response: `${result.correctPairs} of ${result.totalPairs}`,
    }],
  });
};

const linearMismatch = (question, work) => {
  const sets = representationSetsFor(question);
  const mismatchSet = linearMismatchSetFor(question, sets);
  const cards = mismatchSet ? buildLinearConnectionCards([mismatchSet], LINEAR_EQUATION_KINDS) : [];
  const selectedId = typeof work.selectedId === 'string' ? work.selectedId : '';
  const result = scoreLinearMismatchSelection(cards, selectedId);
  const correctionOptions = question.correctionOptions || [];
  const asksCorrection = Boolean(correctionOptions.length);
  const correctionChoice = optionChoice(work.correctionChoice); // a <select>
  const correctionSatisfied = !asksCorrection || correctionChoice === question.correctionAnswerId;
  const isCorrect = result.ok && correctionSatisfied;
  return gradedResult({
    isComplete: chosen(selectedId) && (!asksCorrection || chosen(correctionChoice)),
    isCorrect,
    score: isCorrect ? 1 : result.ok ? 0.6 : 0,
    parts: [
      { id: 'mismatch', label: 'Mismatched card', isComplete: chosen(selectedId), isCorrect: result.ok, response: selectedId },
      ...(asksCorrection
        ? [{ id: 'correction', label: 'Correction', isComplete: chosen(correctionChoice), isCorrect: correctionSatisfied, response: shown(correctionChoice) }]
        : []),
    ],
  });
};

export default bindToolGrader(declaration, 'representationMatch', {
  completeSet,
  findMismatch,
  tableAudit,
  graphMatch,
  linearConnections: (question, work) => (linearConnectionsTask(question) === 'findMismatch'
    ? linearMismatch(question, work)
    : linearGroup(question, work)),
});
