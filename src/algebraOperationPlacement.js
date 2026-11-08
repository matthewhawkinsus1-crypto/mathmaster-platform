import { spokenMathValue } from './tools/shared/spokenMathValue.js';

export const BALANCE_SIDES = ['left', 'right'];

export const otherBalanceSide = (side) => (side === 'left' ? 'right' : 'left');

/*
 * WHERE ON A SIDE, FROM THE KEYBOARD (student-a11y-3).
 *
 * A pointer chooses where on a side the operation it places goes: an added or
 * subtracted term before, under or after one of the side's terms (the point it
 * taps or drops on, StepByStepAlgebraCore's resolveAdditivePlacementFromPoint),
 * a factor in front of the whole side or after it (the half it taps), a divisor
 * under the whole side. Enter on a side had one place only, the one a tap that
 * says nothing gets: a term at the side's end, a factor in front of it.
 *
 * These are the places a pointer can choose, in reading order, so the arrow
 * keys on a focused side step through them. Enter with no arrow pressed still
 * uses the place it always used (keyboardPlacementStart): the end for a term,
 * in front for a factor. A spot between two terms is offered once, as "after"
 * the first: "before" the second is the same place in the equation. `words` is
 * what the side's name says about the place.
 */
const termWords = (term, index) => {
  const sign = Number(term?.sign) < 0 ? -1 : 1;
  // A substituted group is stored as the unit product 1(…) and drawn as (…);
  // the engine spaces a power out ("3 x ^ 2"), which math speech reads as "squared" only closed up.
  const magnitude = String(term?.magnitudeText ?? term?.text ?? '').replace(/^1 \* (\(.*\))$/, '$1').replace(/\s*\^\s*/g, '^');
  const said = spokenMathValue(magnitude) || 'the term';
  if (sign > 0) return said;
  return index === 0 ? `negative ${said}` : `minus ${said}`;
};

export const keyboardPlacementSlots = ({ operation, terms = [] } = {}) => {
  if (operation === 'divide') return [{ position: 'below', words: 'under the whole side' }];
  if (operation === 'multiply') {
    return [
      { position: 'side', words: 'in front of the whole side' },
      { position: 'after', words: 'after the whole side' },
    ];
  }
  const list = Array.isArray(terms) ? terms : [];
  if (!list.length) return [{ position: { kind: 'end', termIndex: 0 }, words: 'at the end' }];
  const slots = [{ position: { kind: 'before', termIndex: 0 }, words: `before ${termWords(list[0], 0)}` }];
  list.forEach((term, termIndex) => {
    slots.push({ position: { kind: 'under', termIndex }, words: `under ${termWords(term, termIndex)}` });
    slots.push(termIndex === list.length - 1
      ? { position: { kind: 'end', termIndex }, words: 'at the end' }
      : { position: { kind: 'after', termIndex }, words: `after ${termWords(term, termIndex)}` });
  });
  return slots;
};

/** The place Enter uses before an arrow is pressed: the one a keyboard always had. */
export const keyboardPlacementStart = (slots = []) => {
  const end = slots.findIndex((slot) => slot?.position?.kind === 'end');
  return end >= 0 ? end : 0;
};

/**
 * The place a key moves to from `index` (of `count`), or null for a key that
 * does not move it. Left goes back and Right on, in reading order, and Home and
 * End go to the first and the last; the ends do not wrap round. Up and Down are
 * left to the page, which they scroll.
 */
export const moveKeyboardPlacement = ({ key, index = 0, count = 0 } = {}) => {
  const total = Math.max(0, Math.floor(Number(count)) || 0);
  if (!total) return null;
  const from = Math.max(0, Math.min(total - 1, Math.floor(Number(index)) || 0));
  if (key === 'ArrowLeft') return Math.max(0, from - 1);
  if (key === 'ArrowRight') return Math.min(total - 1, from + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  return null;
};

/**
 * A side's name while an operation is in hand. The place is said once the
 * arrow keys have chosen one (`place`, a slot's words); before that the name is
 * the one a side has always had, ending "on the left side" as the visible
 * "left side" label does.
 */
export const placementSideName = ({ operationWords, side, place = null }) => (
  `Place ${operationWords}${place ? ` ${place}` : ''} on the ${side} side`
);

export const stageOperationPlacement = ({ placedSides = [], side }) => {
  const current = BALANCE_SIDES.filter((candidate) => placedSides.includes(candidate));
  if (!BALANCE_SIDES.includes(side)) {
    return {
      placedSides: current,
      accepted: false,
      duplicate: false,
      ready: current.length === 2,
      missingSide: current.length === 1 ? otherBalanceSide(current[0]) : null,
    };
  }

  if (current.includes(side)) {
    return {
      placedSides: current,
      accepted: false,
      duplicate: true,
      ready: current.length === 2,
      missingSide: current.length === 1 ? otherBalanceSide(current[0]) : null,
    };
  }

  const next = [...current, side];
  return {
    placedSides: next,
    accepted: true,
    duplicate: false,
    ready: next.length === 2,
    missingSide: next.length === 1 ? otherBalanceSide(side) : null,
  };
};
