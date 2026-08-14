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
  return errors;
};
