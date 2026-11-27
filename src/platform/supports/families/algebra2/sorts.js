/*
 * SORTS ON RADICALS (WE-I): the Algebra II sort generators for A2.7G. A sort
 * (`openSortBoard`) has categories and cards, not answer boxes; a generator
 * claims it from both, and its sibling is a worked sort: other cards, each
 * placed with its reason, then the groups.
 *
 *   realRoots     "the cube roots of −64": two, one or no real roots, from
 *                 the index (even or odd) and the sign of the radicand.
 *   likeRadicals  can it be combined with √5 once simplified: a multiple of
 *                 √5 after the largest perfect square comes out, or not
 *                 (another radicand, another index, a letter under the root).
 *
 * A sort's answer is where each card goes, which no answer field holds, so
 * the generator keeps it safe itself: no card of the sibling is a card of the
 * item, and the sibling's radicand is not the item's.
 */
import { MINUS, firstFitting, rootOf, signed, superscript, text } from './shared.js';

const list = (value) => (Array.isArray(value) ? value : []);
const labelsOf = (values) => list(values).map((value) => text(value?.label)).filter(Boolean);

/* ============================================================ realRoots */

const ORDINAL = Object.freeze({ square: 2, cube: 3, fourth: 4, fifth: 5, sixth: 6 });
const NAME = Object.freeze(Object.fromEntries(Object.entries(ORDINAL).map(([name, index]) => [index, name])));

export const REAL_ROOTS_WHY = Object.freeze({
  evenPositive: 'An even index and a positive radicand: a number and its opposite both work, because an even power makes a negative number positive. Two real roots.',
  odd: 'An odd index: exactly one real root, with the radicand’s sign, because an odd power keeps the sign.',
  zero: 'A radicand of zero: zero is the only number whose power is zero. Exactly one real root.',
  evenNegative: 'An even index and a negative radicand: no real number to an even power is negative. No real roots.',
});

const realRootsClaim = (question) => {
  const categories = labelsOf(question?.categories);
  if (categories.length !== 3 || !categories.some((label) => /^Two real roots$/i.test(label)) || !categories.some((label) => /one real root/i.test(label)) || !categories.some((label) => /^No real roots$/i.test(label))) return null;
  const cards = labelsOf(question?.items).map((label) => /^The (\w+) roots of ([−-]?\d+)$/.exec(label));
  if (!cards.length || cards.some((card) => !card || !ORDINAL[card[1]])) return null;
  return { cards: cards.map((card) => ({ index: ORDINAL[card[1]], radicand: Number(card[2].replace('−', '-')) })), labels: labelsOf(question?.items) };
};

// Cards of every kind; a sibling takes one of each kind and one more.
const REAL_ROOT_CARDS = Object.freeze([
  [4, 81], [2, 36], [6, 1], [2, 100], [4, 625],
  [3, 27], [5, -32], [3, -125], [5, 243], [3, 8],
  [2, -16], [4, -81], [6, -64], [2, -25],
  [2, 0], [3, 0], [5, 0],
]);
const kindOf = ([index, radicand]) => (radicand === 0 ? 'zero' : index % 2 === 1 ? 'odd' : radicand > 0 ? 'evenPositive' : 'evenNegative');
const realCard = ([index, radicand]) => {
  const label = `The ${NAME[index]} roots of ${signed(radicand)}`;
  const kind = kindOf([index, radicand]);
  const magnitude = Math.round(Math.abs(radicand) ** (1 / index));
  let show;
  if (kind === 'evenPositive') show = `${label}: ${magnitude}${superscript(index)} = ${radicand} and (${MINUS}${magnitude})${superscript(index)} = ${radicand}, so the roots are ±${magnitude}. Two real roots.`;
  else if (kind === 'odd') show = `${label}: ${radicand < 0 ? `(${signed(-magnitude)})` : magnitude}${superscript(index)} = ${signed(radicand)}, and no other real number works. Exactly one real root.`;
  else if (kind === 'zero') show = `${label}: only zero works. Exactly one real root.`;
  else show = `${label}: an even power is never negative, so no real number works. No real roots.`;
  const group = kind === 'evenPositive' ? 'Two real roots' : kind === 'evenNegative' ? 'No real roots' : 'Exactly one real root';
  const value = kind === 'evenPositive' ? `${rootOf(index, String(radicand))} = ${magnitude}` : kind === 'odd' ? `${rootOf(index, signed(radicand))} = ${signed(Math.sign(radicand) * magnitude)}` : null;
  return { label, group, value, step: { show, why: REAL_ROOTS_WHY[kind] } };
};

const realRootsDraw = (plan, seed) => {
  const taken = new Set(plan.cards.map((card) => `${card.index}:${card.radicand}`));
  const free = REAL_ROOT_CARDS.filter(([index, radicand]) => !taken.has(`${index}:${radicand}`));
  const byKind = ['evenPositive', 'odd', 'evenNegative', 'zero'].map((kind) => free.filter((card) => kindOf(card) === kind));
  if (byKind.some((cards) => !cards.length)) return null;
  const pickFrom = (cards, offset) => cards[((Number(seed) || 0) + offset) % cards.length];
  const chosen = [pickFrom(byKind[0], 0), pickFrom(byKind[1], 1), pickFrom(byKind[2], 2), pickFrom(byKind[3], 3), pickFrom(byKind[1], 4)];
  const unique = [...new Map(chosen.map((card) => [card.join(':'), card])).values()];
  const cards = unique.map(realCard);
  if (cards.some((card) => plan.labels.includes(card.label))) return null;
  const groups = ['Two real roots', 'Exactly one real root', 'No real roots'].map((group) => `${group}: ${cards.filter((card) => card.group === group).map((card) => card.label.replace(/^The /, 'the ')).join(', ')}`);
  return {
    prompt: `Sort each set of roots by how many real roots it has: ${cards.map((card) => card.label.replace(/^The /, 'the ')).join('; ')}.`,
    steps: [...cards.map((card) => card.step), { show: `The groups. ${groups.join('. ')}.`, why: 'Two things decide the number of real roots: whether the index is even or odd, and the sign of the radicand.' }],
    // Each root a card has, then the groups (in words).
    answer: [...cards.map((card) => card.value).filter(Boolean), ...groups].join('; '),
    problems: [],
  };
};

export const realRoots = Object.freeze({ id: 'realRoots', standards: ['A2.7G'], claim: realRootsClaim, draw: realRootsDraw });

/* ========================================================= likeRadicals */

export const LIKE_RADICALS_WHY = Object.freeze({
  simplify: 'Take the largest perfect-square factor out of the radicand first: like radicals can only be seen once each radical is simplified.',
  like: 'Like radicals have the same index and the same radicand, so they combine the way like terms do.',
  unlikeRadicand: 'Once simplified its radicand is another number, so it is not a like radical.',
  unlikeIndex: 'Its index is not two: a cube root and a square root are not like radicals, even with the same radicand.',
  unlikeLetter: 'A letter under the root makes another radicand, so it is not a like radical.',
});

const likeRadicalsClaim = (question) => {
  const categories = labelsOf(question?.categories);
  const match = categories.map((label) => /^Can(?:not)? be combined with √(\d+)$/.exec(label));
  if (categories.length !== 2 || match.some((entry) => !entry) || match[0][1] !== match[1][1]) return null;
  return { radicand: Number(match[0][1]), labels: labelsOf(question?.items) };
};

const SQUARE_FREE = Object.freeze([2, 3, 6, 7]);
const likeDraw = (plan, seed, ok) => firstFitting(SQUARE_FREE.filter((value) => value !== plan.radicand), seed, (n) => {
  const other = SQUARE_FREE.find((value) => value !== n && value !== plan.radicand);
  const cards = [
    { label: `4√${n}`, show: `4√${n} is already simplified, with radicand ${n}.`, why: LIKE_RADICALS_WHY.like, like: true },
    { label: `√${9 * n}`, show: `√${9 * n} = √(9 · ${n}) = 3√${n}.`, why: `${LIKE_RADICALS_WHY.simplify} ${LIKE_RADICALS_WHY.like}`, like: true },
    { label: `2√${16 * n}`, show: `2√${16 * n} = 2 · √(16 · ${n}) = 2 · 4√${n} = 8√${n}.`, why: `${LIKE_RADICALS_WHY.simplify} ${LIKE_RADICALS_WHY.like}`, like: true },
    { label: `√${4 * other}`, show: `√${4 * other} = √(4 · ${other}) = 2√${other}: radicand ${other}.`, why: `${LIKE_RADICALS_WHY.simplify} ${LIKE_RADICALS_WHY.unlikeRadicand}`, like: false },
    { label: `${rootOf(3, String(n))}`, show: `${rootOf(3, String(n))} is a cube root.`, why: LIKE_RADICALS_WHY.unlikeIndex, like: false },
    { label: `√(${n}y)`, show: `√(${n}y) has the radicand ${n}y.`, why: LIKE_RADICALS_WHY.unlikeLetter, like: false },
  ];
  if (cards.some((card) => plan.labels.includes(card.label))) return null;
  const likeGroup = cards.filter((card) => card.like).map((card) => card.label).join(', ');
  const unlikeGroup = cards.filter((card) => !card.like).map((card) => card.label).join(', ');
  return {
    prompt: `Sort each expression: once simplified, can it be combined with √${n}, or not? ${cards.map((card) => card.label).join(', ')}.`,
    steps: [...cards.map((card) => ({ show: card.show, why: card.why })), { show: `Can be combined with √${n}: ${likeGroup}. Cannot: ${unlikeGroup}.`, why: LIKE_RADICALS_WHY.like }],
    // Each card simplified, then the groups (in words).
    answer: [`√${9 * n} = 3√${n}`, `2√${16 * n} = 8√${n}`, `√${4 * other} = 2√${other}`, `can be combined with √${n}: ${likeGroup}`, `cannot: ${unlikeGroup}`].join('; '),
    problems: [],
  };
}, ok);

export const likeRadicals = Object.freeze({ id: 'likeRadicals', standards: ['A2.7G'], claim: likeRadicalsClaim, draw: likeDraw });

export const SORT_GENERATORS = Object.freeze([realRoots, likeRadicals]);
