const canonicalSet = (values = []) => [...new Set(values.map(String))].sort();

const canonicalPartition = (groups = []) => groups
  .map((group) => canonicalSet(group?.itemIds || group?.items || []))
  .filter((items) => items.length)
  .sort((a, b) => a.join('|').localeCompare(b.join('|')));

export const partitionsEqual = (left = [], right = []) => {
  const a = canonicalPartition(left);
  const b = canonicalPartition(right);
  return a.length === b.length && a.every((group, index) => (
    group.length === b[index].length && group.every((id, itemIndex) => id === b[index][itemIndex])
  ));
};

const pairKey = (a, b) => [String(a), String(b)].sort().join('::');

const pairMapForPartition = (itemIds = [], groups = []) => {
  const membership = new Map();
  groups.forEach((group, groupIndex) => {
    (group?.itemIds || group?.items || []).forEach((itemId) => membership.set(String(itemId), groupIndex));
  });
  const map = new Map();
  for (let i = 0; i < itemIds.length; i += 1) {
    for (let j = i + 1; j < itemIds.length; j += 1) {
      const left = String(itemIds[i]);
      const right = String(itemIds[j]);
      map.set(pairKey(left, right), membership.has(left) && membership.has(right) && membership.get(left) === membership.get(right));
    }
  }
  return map;
};

export const scorePartitionAgainstScheme = ({ itemIds = [], responseGroups = [], schemeGroups = [] }) => {
  const ids = canonicalSet(itemIds);
  if (!ids.length) return { score: 0, exact: false };
  const responseAssigned = canonicalSet(responseGroups.flatMap((group) => group?.itemIds || []));
  const allAssigned = ids.length === responseAssigned.length && ids.every((id, index) => id === responseAssigned[index]);
  const exact = allAssigned && partitionsEqual(responseGroups, schemeGroups);
  if (ids.length <= 1) return { score: exact ? 1 : 0, exact };
  const expectedPairs = pairMapForPartition(ids, schemeGroups);
  const responsePairs = pairMapForPartition(ids, responseGroups);
  let matches = 0;
  let total = 0;
  expectedPairs.forEach((expected, key) => {
    total += 1;
    if (responsePairs.get(key) === expected) matches += 1;
  });
  const pairScore = total ? matches / total : 0;
  // Incomplete work cannot score as if the unassigned cards were deliberately
  // separated. Assignment completeness is part of the mathematical response.
  const completion = responseAssigned.length / ids.length;
  return { score: Math.max(0, Math.min(1, pairScore * completion)), exact };
};

export const scoreOpenSort = ({ items = [], responseGroups = [], validSchemes = [] }) => {
  const itemIds = items.map((item) => String(item.id));
  if (!validSchemes.length) return { isCorrect: false, score: 0, matchedSchemeId: null, best: null };
  const candidates = validSchemes.map((scheme) => ({
    scheme,
    ...scorePartitionAgainstScheme({ itemIds, responseGroups, schemeGroups: scheme.groups || [] }),
  })).sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
  const best = candidates[0];
  return {
    isCorrect: Boolean(best?.exact),
    score: best?.exact ? 1 : Number(best?.score || 0),
    matchedSchemeId: best?.exact ? best.scheme?.id || null : null,
    best,
  };
};


const categoryMap = (groups = []) => new Map(
  groups.map((group, index) => [
    String(group?.id || group?.categoryId || `group-${index + 1}`),
    canonicalSet(group?.itemIds || group?.items || []),
  ]),
);

export const scoreControlledSort = ({ items = [], responseGroups = [], validSchemes = [] }) => {
  const itemIds = canonicalSet(items.map((item) => String(item?.id || '')).filter(Boolean));
  if (!itemIds.length || !validSchemes.length) {
    return { isCorrect: false, score: 0, matchedSchemeId: null, best: null };
  }
  const response = categoryMap(responseGroups);
  const assigned = canonicalSet(responseGroups.flatMap((group) => group?.itemIds || group?.items || []));
  const completion = itemIds.length ? assigned.length / itemIds.length : 0;

  const candidates = validSchemes.map((scheme) => {
    const expected = categoryMap(scheme?.groups || []);
    const categoryIds = [...expected.keys()];
    const comparable = categoryIds.length > 0 && categoryIds.every((id) => response.has(id));
    let correctItems = 0;
    let expectedItems = 0;
    categoryIds.forEach((id) => {
      const wanted = expected.get(id) || [];
      const actual = response.get(id) || [];
      expectedItems += wanted.length;
      wanted.forEach((itemId) => { if (actual.includes(itemId)) correctItems += 1; });
    });
    const score = expectedItems ? (correctItems / expectedItems) * completion : 0;
    const exact = comparable
      && assigned.length === itemIds.length
      && categoryIds.every((id) => {
        const wanted = expected.get(id) || [];
        const actual = response.get(id) || [];
        return wanted.length === actual.length && wanted.every((itemId, index) => itemId === actual[index]);
      });
    return { scheme, exact, score: exact ? 1 : Math.max(0, Math.min(1, score)) };
  }).sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);

  const best = candidates[0];
  return {
    isCorrect: Boolean(best?.exact),
    score: best?.exact ? 1 : Number(best?.score || 0),
    matchedSchemeId: best?.exact ? best.scheme?.id || null : null,
    best,
  };
};

/*
 * WHAT THE BOARD ASKS FOR, AND WHEN THE STUDENT HAS FINISHED IT.
 *
 * OpenSortBoard.jsx gates its Check button on `openSortProgress(...).ready`,
 * and the shared grader (functions/shared/serverGrading/tools/openSortBoard.mjs)
 * reports the same `ready` as the response's completeness — one definition, so
 * a deadline only auto-submits a sort the student could have checked.
 */
export const openSortSettings = (question = {}) => {
  const controlled = question?.mode === 'controlled';
  const categories = controlled && Array.isArray(question.categories)
    ? question.categories.filter((category) => category?.id && category?.label)
    : [];
  const minGroups = controlled ? categories.length : Math.max(2, Number(question?.minGroups || 2));
  const maxGroups = controlled ? categories.length : Math.max(minGroups, Number(question?.maxGroups || 5));
  return {
    controlled,
    categories,
    minGroups,
    maxGroups,
    rationaleMinLength: Math.max(0, Number(question?.rationaleMinLength ?? 12)),
    requireRationale: controlled ? false : question?.requireRationale !== false,
    requireGroupNames: controlled ? false : question?.requireGroupNames !== false,
  };
};

/*
 * THE PLACEMENTS A BOARD CAN HOLD.
 *
 * A placement is one of the question's cards in exactly one group: the board
 * offers only the question's cards, and placing a card removes it from every
 * other group. Anything else — an id that is not a card on this board (a
 * tampered response, or a saved board from before the teacher removed a card)
 * or a card claimed by several groups — is not a placement, and the scorers
 * above would otherwise credit it: an invented id counts towards "the share of
 * cards placed", and a card in every bin satisfies every category at once.
 * A card claimed by more than one group is therefore unplaced. Groups keep
 * their order, names and explanations.
 */
export const boardPlacements = ({ items = [], groups = [] }) => {
  const onBoard = new Set(items.map((item) => String(item?.id)));
  const own = groups.map((group) => [...new Set(group.itemIds.map(String))].filter((id) => onBoard.has(id)));
  const claims = new Map();
  own.forEach((ids) => ids.forEach((id) => claims.set(id, (claims.get(id) || 0) + 1)));
  return groups.map((group, index) => ({ ...group, itemIds: own[index].filter((id) => claims.get(id) === 1) }));
};

/**
 * `groups`: [{ name, rationale, itemIds }] with string fields, as the board
 * holds them. Returns the cards still to place, whether each requirement the
 * Check button waits for is met, and the board's real placements
 * (`placedGroups`, see boardPlacements) — what the scorers grade.
 */
export const openSortProgress = ({ settings, items = [], groups = [] }) => {
  const placedGroups = boardPlacements({ items, groups });
  const assignedIds = new Set(placedGroups.flatMap((group) => group.itemIds));
  const unassigned = items.filter((item) => !assignedIds.has(String(item.id)));
  const usedGroups = placedGroups.filter((group) => group.itemIds.length);
  const rationaleComplete = !settings.requireRationale
    || usedGroups.every((group) => group.rationale.trim().length >= settings.rationaleMinLength);
  const namesComplete = !settings.requireGroupNames || usedGroups.every((group) => group.name.trim().length >= 2);
  const ready = settings.controlled
    ? unassigned.length === 0
    : unassigned.length === 0 && usedGroups.length >= settings.minGroups && namesComplete && rationaleComplete;
  return { unassigned, usedGroups, placedGroups, namesComplete, rationaleComplete, ready };
};

export const validateSortQuestion = (question = {}) => {
  const errors = [];
  const items = Array.isArray(question.items) ? question.items : [];
  if (items.length < 3) errors.push('openSortBoard requires at least three items.');
  const ids = items.map((item) => String(item?.id || ''));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.push('Every sort item needs a unique id.');
  const schemes = Array.isArray(question.validSchemes) ? question.validSchemes : [];
  if (!schemes.length) errors.push('openSortBoard requires at least one validSchemes entry so the open sort can be self-graded.');
  schemes.forEach((scheme, schemeIndex) => {
    const groups = Array.isArray(scheme?.groups) ? scheme.groups : [];
    if (groups.length < 2) errors.push(`validSchemes[${schemeIndex}] needs at least two groups.`);
    const assigned = groups.flatMap((group) => group?.itemIds || []).map(String);
    if (canonicalSet(assigned).join('|') !== canonicalSet(ids).join('|')) errors.push(`validSchemes[${schemeIndex}] must place every item exactly once.`);
    if (assigned.length !== new Set(assigned).size) errors.push(`validSchemes[${schemeIndex}] places at least one item in more than one group.`);
  });

  if (question.mode === 'controlled') {
    const categories = Array.isArray(question.categories) ? question.categories : [];
    if (categories.length < 2) errors.push('controlled sort requires at least two authored categories.');
    const categoryIds = categories.map((category) => String(category?.id || ''));
    if (categoryIds.some((id) => !id) || new Set(categoryIds).size !== categoryIds.length) {
      errors.push('Every controlled sort category needs a unique id.');
    }
    if (categories.some((category) => !String(category?.label || '').trim())) {
      errors.push('Every controlled sort category needs a student-visible label.');
    }
    schemes.forEach((scheme, schemeIndex) => {
      const groups = Array.isArray(scheme?.groups) ? scheme.groups : [];
      const groupIds = groups.map((group) => String(group?.id || group?.categoryId || ''));
      if (canonicalSet(groupIds).join('|') !== canonicalSet(categoryIds).join('|')) {
        errors.push(`validSchemes[${schemeIndex}] must use the same category ids as controlled sort categories.`);
      }
    });
  }
  return errors;
};
