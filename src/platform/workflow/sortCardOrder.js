/*
 * A SORT'S CARDS IN A STABLE SHUFFLED ORDER (P-2).
 *
 * Choices are shown in a stable shuffled order (choiceOptions.js
 * stableShuffleChoices): the same for every load of a question, never the
 * authored one. A sort's cards were drawn as authored, and authors write them
 * category by category: Algebra I M3 T1 L3 PR 12 listed x < −4, x < −4,
 * x ≤ −4, x ≤ −4, … in the category list's own order, and four of the seven
 * sorts in that walkthrough (2026-11-06) ran through their categories, so a
 * student could sort by position without simplifying anything.
 *
 * So an authored sort's cards take the same kind of order: seeded by the
 * question and the step, so a reload, another Chromebook and a classmate see
 * the same order, and the cards are still named by where they sit ("Card 1"
 * is the first card on the screen, figureMatch.mjs). The order is set once, on
 * the question QuestionEngine prepares, so everything that names a card by
 * position (the board, the cards it says to move, the closed review, a
 * support family's worked steps) names the same card. A review built from
 * another copy of the question (Review My Work) orders it the same way; a
 * stage already ordered says so (`cardOrder`), so ordering twice changes
 * nothing.
 *
 * Two kinds of sort keep their order:
 *   - a family's instance, which deals its own order (the graph-recognition
 *     sorts order theirs by their numbers);
 *   - a sort whose own wording names its cards by number ("Card 1 (5) …",
 *     "Figure 3 has slope …"): its author wrote the order into the question,
 *     and a shuffle would make those words point at other cards.
 * Grading reads cards by id, so the order never changes a verdict.
 */
import { choiceSeed, stableShuffleChoices } from '../interaction/choiceOptions.js';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const NAMES_A_CARD_BY_NUMBER = /\b(?:figure|card)s?\s+\d/i;

const isSort = (stage) => isObject(stage) && stage.kind === 'figureMatch' && Array.isArray(stage.items) && stage.items.length > 1;

/** Does the question's own wording, outside the cards themselves, name a card by its number? */
export const sortOrderNamedByNumber = (question) => {
  if (!isObject(question)) return false;
  let wording = '';
  try {
    wording = JSON.stringify(question, function omitCards(key, value) {
      return key === 'items' && isSort(this) ? undefined : value;
    });
  } catch {
    return true;
  }
  return NAMES_A_CARD_BY_NUMBER.test(wording || '');
};

export const SHUFFLED_CARD_ORDER = 'shuffled';
const toShuffle = (stage) => isSort(stage) && stage.cardOrder !== SHUFFLED_CARD_ORDER;

/** The question with each authored sort's cards in their stable shuffled order (the same object when nothing moves). */
export const withShuffledSortCards = (question) => {
  if (!isObject(question) || !Array.isArray(question.workflow) || !question.workflow.some(toShuffle)) return question;
  if (question.familyDelivery || isObject(question.questionFamily)) return question;
  if (sortOrderNamedByNumber(question)) return question;
  const owner = question.questionId || question.id || question.prompt || '';
  const workflow = question.workflow.map((stage) => (toShuffle(stage)
    ? { ...stage, items: stableShuffleChoices(stage.items, choiceSeed(owner, stage.id || 'sort', 'sort-cards')), cardOrder: SHUFFLED_CARD_ORDER }
    : stage));
  return { ...question, workflow };
};
