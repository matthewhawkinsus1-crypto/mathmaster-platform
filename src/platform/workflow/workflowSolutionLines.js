/*
 * WHAT A CLOSED REVIEW SAYS A CHOICE STEP'S OR A SORT'S ANSWER IS.
 *
 * The review's step list (SolutionReview.jsx, buildWorkflowSolution) printed
 * a choice step's key as its id ("a") and a sort's key as "[object Object]"
 * (Algebra I M2 T2 L3's slope sorts and line choices, read under their worked
 * steps). A choice is named by the words the student read; a sort lists each
 * figure or card, named as the screen names it ("Card 1", FB16), with the
 * category it belongs in. Closed review only: these state the answers.
 */
import { figureLabel, figureNoun, matchCategories, matchItems } from './figureMatch.js';

const text = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The words of the keyed choice; the key itself when no choice carries it. */
export const choiceAnswerLine = (stage, value) => {
  const key = text(value);
  if (!key) return '';
  const choices = Array.isArray(stage?.choices) ? stage.choices : [];
  const keyed = choices.find((choice) => (isObject(choice) ? text(choice.id) : text(choice)) === key);
  if (!isObject(keyed)) return key;
  return text(keyed.label ?? keyed.text ?? keyed.value) || key;
};

/** One line per keyed figure: "Card 1 ((2 × 3) · (3 × 4)): Defined — the product is 2 × 4". */
export const figureMatchAnswerLines = (stage, rule) => {
  const key = isObject(rule?.match) ? rule.match : null;
  if (!key) return [];
  const noun = figureNoun(stage);
  const categories = new Map(matchCategories(stage).map((category) => [text(category.id), text(category.label) || text(category.id)]));
  return matchItems(stage).flatMap((item, index) => {
    const answer = text(key[text(item.id)]);
    if (!answer) return [];
    const shown = text(item.text);
    return [`${figureLabel(index, noun)}${shown ? ` (${shown})` : ''}: ${categories.get(answer) || answer}`];
  });
};

/** A sort whose cards show only text is titled as one (FB16): "Match each card to a category". */
export const stageReviewLabel = (stage, label) => (
  stage?.kind === 'figureMatch' && figureNoun(stage) === 'Card' ? String(label ?? '').replace(/\bfigure(s?)\b/g, 'card$1') : label
);
