/*
 * THE REWRITE MENU (student push Q).
 *
 * Rewrite changes a part's SHAPE without computing anything: Factor, Split
 * fraction, Cancel factors (common algebraic factors) and Arrange terms. Each
 * entry is still contextual — offered only when the committed equation has
 * the structure it acts on (algebraStructureTools.js detects it) — and opening
 * one opens the existing structure tool, with its own undo record.
 *
 * Computing (numbers multiplied, like terms combined, a numeric fraction
 * reduced) is Simplify, not Rewrite, so a fraction with no letters in it is
 * never offered under Cancel factors: Simplify reduces it.
 */
import { splitAdditiveTerms } from '../../../algebraAstEngine.js';
import { parse } from '../../math/mathjs.js';
import { ARRANGE_TOOL } from '../../../algebraArrangeTermsModel.js';
import { FACTOR_TOOL } from '../../../algebraFactoringModel.js';
import { REDUCE_TOOL } from '../../../algebraFractionReductionModel.js';
import { SPLIT_TOOL } from '../../../algebraFractionSplitModel.js';
import { detectStructureTools } from '../../../algebraStructureTools.js';

export const REWRITE_MENU_KINDS = Object.freeze([FACTOR_TOOL, SPLIT_TOOL, REDUCE_TOOL, ARRANGE_TOOL]);

export const REWRITE_MENU_LABELS = Object.freeze({
  [FACTOR_TOOL]: 'Factor',
  [SPLIT_TOOL]: 'Split fraction',
  [REDUCE_TOOL]: 'Cancel factors',
  [ARRANGE_TOOL]: 'Arrange terms',
});

export const REWRITE_MENU_TITLES = Object.freeze({
  [FACTOR_TOOL]: 'Choose terms, write them as primes, and pull out a factor they share',
  [SPLIT_TOOL]: 'Give each numerator term its own copy of the denominator',
  [REDUCE_TOOL]: 'Write a fraction as prime factors and cancel matching pairs',
  [ARRANGE_TOOL]: 'Change the order of the terms on one side',
});

const termHasLetters = (equation, side, sideTermIndex) => {
  const term = (splitAdditiveTerms(equation?.[side]) || [])[sideTermIndex];
  if (!term) return false;
  try {
    return parse(String(term.magnitudeText)).filter((node) => node.isSymbolNode && !['e', 'pi'].includes(node.name)).length > 0;
  } catch {
    return false;
  }
};

/**
 * What the Rewrite menu offers on this equation: { factor: [...], split: [...],
 * reduce: [...], arrange: [...] }, each the detector's entries. `allowArrange`
 * is false outside a line objective, where reordering is not a step the target
 * needs and would only crowd ordinary solving.
 */
export const rewriteMenuOptions = (equation, { excludeSides = [], allowArrange = true } = {}) => {
  const detected = detectStructureTools(equation, { excludeSides });
  return {
    [FACTOR_TOOL]: detected[FACTOR_TOOL] || [],
    [SPLIT_TOOL]: detected[SPLIT_TOOL] || [],
    [REDUCE_TOOL]: (detected[REDUCE_TOOL] || []).filter((entry) => termHasLetters(equation, entry.side, entry.sideTermIndex)),
    [ARRANGE_TOOL]: allowArrange ? (detected[ARRANGE_TOOL] || []) : [],
  };
};

export const rewriteMenuEntries = (options, openKind = null) => REWRITE_MENU_KINDS
  .filter((kind) => kind === openKind || (options?.[kind] || []).length > 0)
  .map((kind) => ({ kind, label: REWRITE_MENU_LABELS[kind], title: REWRITE_MENU_TITLES[kind] }));
