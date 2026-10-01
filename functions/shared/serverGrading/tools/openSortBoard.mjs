/*
 * Shared grader for the `openSortBoard` registry tool — run by the browser tool for
 * feedback, by QuestionEngine for the recorded verdict, and by the server as
 * the authority. See ../toolGraderDefinition.mjs for the contract.
 *
 * Extracted check-for-check from OpenSortBoard.jsx: the same partition scoring
 * (scoreOpenSort / scoreControlledSort), the same defaults for an unauthored
 * minGroups / rationaleMinLength / requireRationale / requireGroupNames
 * (openSortSettings), the same verdict (an exact partition AND every used
 * group named and explained) and the same score (1 for an exact partition,
 * otherwise pair or item agreement scaled by the share of cards placed).
 * Group names and explanations are required, not judged: those two parts are
 * reported ungraded, as the board always has. Completeness is the board's own
 * Check gate (openSortProgress().ready).
 *
 * One correction, reachable only through a tampered response or a board saved
 * before the teacher removed a card: only the question's cards, each in
 * exactly one group, are placements (boardPlacements). Invented ids used to
 * count towards the share of cards placed, and a card left in every bin
 * satisfied every category at once.
 */
import declaration from '../declarations/openSortBoard.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import {
  openSortProgress,
  openSortSettings,
  scoreControlledSort,
  scoreOpenSort,
} from '../../toolMath/openSortBoard/openSortMath.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const textField = (value) => (typeof value === 'string' ? value : '');
const idOf = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

/*
 * The student's groups, read defensively: a tampered field becomes the empty
 * value the board starts from instead of crashing the grader. Realistic work
 * (every field a string, every itemIds an array of item ids) passes through
 * unchanged. Which ids are real placements — the question's cards, each in
 * exactly one group — is the board's own rule (openSortProgress →
 * boardPlacements), so the Check gate and the score read the same placements.
 */
const readGroups = (work) => (Array.isArray(work.groups) ? work.groups : [])
  .filter(isObject)
  .map((group) => ({
    id: idOf(group.id),
    name: textField(group.name),
    rationale: textField(group.rationale),
    itemIds: Array.isArray(group.itemIds) ? group.itemIds.map(idOf).filter(Boolean) : [],
  }));

const gradeSort = (question, work, scoreSort) => {
  const settings = openSortSettings(question);
  const items = Array.isArray(question.items) ? question.items : [];
  const validSchemes = Array.isArray(question.validSchemes) ? question.validSchemes : [];
  const progress = openSortProgress({ settings, items, groups: readGroups(work) });
  // Only real placements are scored: an id that is not a card on this board,
  // or a card claimed by several groups, would otherwise earn credit
  // (boardPlacements).
  const result = scoreSort({ items, responseGroups: progress.placedGroups, validSchemes });
  const used = progress.usedGroups;
  return gradedResult({
    isComplete: progress.ready,
    isCorrect: result.isCorrect && progress.namesComplete && progress.rationaleComplete,
    score: result.isCorrect ? 1 : result.score,
    parts: [
      {
        id: 'partition',
        label: 'Mathematical grouping',
        isComplete: progress.unassigned.length === 0,
        isCorrect: result.isCorrect,
        credit: result.isCorrect ? 1 : result.score,
        response: used.map((group) => group.itemIds.join(', ')).join(' | '),
      },
      {
        id: 'names',
        label: 'Group names',
        isComplete: progress.namesComplete,
        isCorrect: progress.namesComplete,
        graded: false,
        response: used.map((group) => group.name.trim()).join(' | '),
      },
      {
        id: 'rationale',
        label: 'Group explanations',
        isComplete: progress.rationaleComplete,
        isCorrect: progress.rationaleComplete,
        graded: false,
      },
    ],
  });
};

export default bindToolGrader(declaration, 'openSortBoard', {
  open: (question, work) => gradeSort(question, work, scoreOpenSort),
  controlled: (question, work) => gradeSort(question, work, scoreControlledSort),
});
