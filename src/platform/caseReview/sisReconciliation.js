/*
 * OFFICIAL GRADEBOOK RECONCILIATION — READ-ONLY.
 *
 * Compares an imported gradebook snapshot (one student's items, from
 * sisGradebookImport.js) with what MathMaster holds for the same student:
 *
 *   gradebook item → matching MathMaster part (an assignment, or one lesson
 *   section) → MathMaster's current grade contribution → the grade MathMaster
 *   last exported → whether it changed since → what differs.
 *
 * And in the other direction: MathMaster parts the gradebook does not show.
 *
 * Matching is by the item's title and its section words (Warm-Up, Classwork,
 * Practice, DOL / exit ticket), automatic only when one part is clearly the
 * best; the teacher confirms or overrides any match. A difference is
 * described, never explained: MathMaster cannot see why a gradebook holds the
 * number it holds.
 *
 * WHAT IS CONTRIBUTING TO THE OFFICIAL GRADE is answered only when the file
 * itself proves how its average is built: every scored item has a category,
 * every category has a weight, the file states the official average, and
 * one standard way of combining them — the mean of item percents within each
 * category, or points within each category, then categories by weight —
 * reproduces that average. Otherwise the report says exactly what is missing.
 * MathMaster never guesses a district's weighting.
 */

export const RECONCILIATION_STATUS = Object.freeze({
  MATCH: 'match',
  OFFICIAL_DIFFERS_FROM_EXPORT: 'official-differs-from-export',
  CHANGED_SINCE_EXPORT: 'changed-since-export',
  NOT_EXPORTED_SAME: 'not-exported-same',
  NOT_EXPORTED_DIFFERS: 'not-exported-differs',
  OFFICIAL_BLANK: 'official-blank',
  OFFICIAL_EXCUSED: 'official-excused',
  MATHMASTER_NO_GRADE: 'mathmaster-no-grade',
  UNMATCHED_SIS_ITEM: 'unmatched-sis-item',
});

const TOLERANCE = 0.5;
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const round1 = (value) => Math.round(value * 10) / 10;
const finite = (value) => (value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null));
const close = (a, b) => a !== null && b !== null && Math.abs(a - b) <= TOLERANCE;

// --- Matching -------------------------------------------------------------------------------

const SECTION_WORDS = Object.freeze([
  ['warmup', ['warm up', 'warmup', 'bell ringer', 'bellringer', 'do now']],
  ['classwork', ['classwork', 'class work', 'cw', 'notes', 'guided notes']],
  ['practice', ['independent practice', 'practice', 'ip', 'homework', 'hw']],
  ['dol', ['dol', 'exit ticket', 'exit slip', 'demonstration of learning']],
]);

const normalizeTitle = (value) => clean(value)
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[‐-―]/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const sectionOfTitle = (normalized) => {
  const padded = ` ${normalized} `;
  const found = SECTION_WORDS.find(([, words]) => words.some((word) => padded.includes(` ${word} `)));
  return found ? found[0] : null;
};

const stripSectionWords = (normalized) => {
  let text = ` ${normalized} `;
  SECTION_WORDS.forEach(([, words]) => words.forEach((word) => { text = text.split(` ${word} `).join(' '); }));
  return text.replace(/\s+/g, ' ').trim();
};

const tokens = (value) => new Set(value.split(' ').filter(Boolean));
const similarity = (left, right) => {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / new Set([...a, ...b]).size;
};

const partKey = (part) => `${clean(part.assignmentId)}|${clean(part.sectionKey)}`;

/**
 * One match (or null) per gradebook item. `confirmedMatches` maps an item name
 * to the teacher's choice: `{assignmentId, sectionKey}` or `{none: true}`.
 */
export const matchSisItems = ({ items = [], parts = [], confirmedMatches = {} } = {}) => {
  const partList = list(parts);
  const taken = new Set();
  const results = list(items).map((item) => ({ itemName: clean(item.name), item, match: null }));

  // The teacher's own choices first; they also take their parts off the table.
  results.forEach((result) => {
    const choice = confirmedMatches?.[result.itemName];
    if (!choice) return;
    if (choice.none) { result.match = null; result.confirmedNone = true; return; }
    const part = partList.find((entry) => clean(entry.assignmentId) === clean(choice.assignmentId) && clean(entry.sectionKey) === clean(choice.sectionKey));
    if (part) {
      result.match = { assignmentId: part.assignmentId, sectionKey: clean(part.sectionKey), label: part.label, method: 'teacher-confirmed', score: 1 };
      taken.add(partKey(part));
    }
  });

  // Then automatic matches, best first, each part used once.
  const candidates = [];
  results.forEach((result, index) => {
    if (result.match || result.confirmedNone || confirmedMatches?.[result.itemName]) return;
    const normalized = normalizeTitle(result.itemName);
    const section = sectionOfTitle(normalized);
    const base = stripSectionWords(normalized);
    const scored = partList
      .filter((part) => (section ? clean(part.sectionKey) === section : !clean(part.sectionKey)))
      .map((part) => {
        const title = normalizeTitle(part.title);
        const exact = base === title;
        return { part, score: exact ? 1 : similarity(base, title), exact };
      })
      .filter((entry) => entry.score >= 0.75)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return;
    if (scored[1] && scored[0].score - scored[1].score < 0.15) return; // ambiguous: the teacher chooses
    candidates.push({ index, ...scored[0] });
  });
  candidates.sort((a, b) => b.score - a.score).forEach((candidate) => {
    const key = partKey(candidate.part);
    if (taken.has(key)) return;
    taken.add(key);
    results[candidate.index].match = {
      assignmentId: candidate.part.assignmentId,
      sectionKey: clean(candidate.part.sectionKey),
      label: candidate.part.label,
      method: candidate.exact ? 'exact-title' : 'similar-title',
      score: Math.round(candidate.score * 100) / 100,
    };
  });
  return results;
};

// --- Reconciliation -------------------------------------------------------------------------

const STATUS_LABEL = Object.freeze({
  match: 'The gradebook matches what MathMaster exported, and MathMaster\'s grade has not changed since.',
  'official-differs-from-export': 'The gradebook score differs from the score MathMaster last exported for this item.',
  'changed-since-export': 'The gradebook matches the last export; MathMaster\'s grade has changed since that export.',
  'not-exported-same': 'MathMaster has no export record for this item; the gradebook score equals MathMaster\'s current grade.',
  'not-exported-differs': 'MathMaster has no export record for this item; the gradebook score differs from MathMaster\'s current grade.',
  'official-blank': 'The gradebook shows no score (or a mark such as "M") for this item; MathMaster holds a grade.',
  'official-excused': 'The gradebook marks this item excused.',
  'mathmaster-no-grade': 'The gradebook holds a score; MathMaster has no grade contribution for this part yet.',
  'unmatched-sis-item': 'No MathMaster assignment is matched to this gradebook item (it may be work outside MathMaster).',
});

const statusFor = ({ item, part }) => {
  if (!part) return RECONCILIATION_STATUS.UNMATCHED_SIS_ITEM;
  const official = finite(item.score);
  const current = finite(part.currentGrade);
  const exportedGrade = finite(part.exportStatus?.exportedGrade);
  if (item.excused) return RECONCILIATION_STATUS.OFFICIAL_EXCUSED;
  if (official === null) return RECONCILIATION_STATUS.OFFICIAL_BLANK;
  if (current === null && exportedGrade === null) return RECONCILIATION_STATUS.MATHMASTER_NO_GRADE;
  if (exportedGrade !== null) {
    if (!close(official, exportedGrade)) return RECONCILIATION_STATUS.OFFICIAL_DIFFERS_FROM_EXPORT;
    return part.exportStatus?.state === 'changed-since-export' || (current !== null && !close(current, exportedGrade))
      ? RECONCILIATION_STATUS.CHANGED_SINCE_EXPORT
      : RECONCILIATION_STATUS.MATCH;
  }
  return close(official, current) ? RECONCILIATION_STATUS.NOT_EXPORTED_SAME : RECONCILIATION_STATUS.NOT_EXPORTED_DIFFERS;
};

/** Every gradebook item against MathMaster, and every MathMaster part the gradebook lacks. */
export const reconcileGradebook = ({ snapshot = {}, parts = [], confirmedMatches = {} } = {}) => {
  const partList = list(parts);
  const matches = matchSisItems({ items: snapshot.items, parts: partList, confirmedMatches });
  const rows = matches.map(({ itemName, item, match }) => {
    const part = match ? partList.find((entry) => partKey(entry) === `${clean(match.assignmentId)}|${clean(match.sectionKey)}`) : null;
    const status = statusFor({ item, part });
    const official = finite(item.score);
    const current = part ? finite(part.currentGrade) : null;
    return {
      itemName,
      category: item.category || null,
      officialScore: official,
      officialScoreText: clean(item.scoreText),
      officialKind: item.scoreKind || null,
      pointsPossible: finite(item.pointsPossible),
      weight: finite(item.weight),
      dueDate: item.dueDate || null,
      excused: item.excused === true,
      match,
      mathMasterScore: current,
      exportedScore: part ? finite(part.exportStatus?.exportedGrade) : null,
      exportState: part?.exportStatus?.state || null,
      exportLabel: part?.exportStatus?.label || '',
      changedSinceExport: part?.exportStatus?.state === 'changed-since-export',
      status,
      statusLabel: STATUS_LABEL[status],
      difference: official !== null && current !== null ? round1(official - current) : null,
    };
  });
  const matchedKeys = new Set(rows.filter((row) => row.match).map((row) => `${clean(row.match.assignmentId)}|${clean(row.match.sectionKey)}`));
  const missingFromSis = partList
    .filter((part) => !matchedKeys.has(partKey(part)))
    .map((part) => ({
      assignmentId: part.assignmentId,
      sectionKey: clean(part.sectionKey),
      label: part.label,
      mathMasterScore: finite(part.currentGrade),
      exportState: part.exportStatus?.state || null,
      exportLabel: part.exportStatus?.label || '',
      note: finite(part.currentGrade) === null ? 'No MathMaster grade contribution yet.' : 'No gradebook item in this file is matched to this MathMaster work.',
    }));
  const count = (status) => rows.filter((row) => row.status === status).length;
  return {
    rows,
    missingFromSis,
    counts: {
      items: rows.length,
      matched: rows.filter((row) => row.match).length,
      agree: count(RECONCILIATION_STATUS.MATCH) + count(RECONCILIATION_STATUS.NOT_EXPORTED_SAME),
      differ: count(RECONCILIATION_STATUS.OFFICIAL_DIFFERS_FROM_EXPORT) + count(RECONCILIATION_STATUS.NOT_EXPORTED_DIFFERS),
      changedSinceExport: count(RECONCILIATION_STATUS.CHANGED_SINCE_EXPORT),
      unmatchedSisItems: count(RECONCILIATION_STATUS.UNMATCHED_SIS_ITEM),
      missingFromSis: missingFromSis.length,
    },
    note: 'Read-only comparison. Importing a gradebook snapshot changes no grade in MathMaster or in the gradebook.',
  };
};

// --- What is contributing to the official grade ------------------------------------------------

const scoredItems = (items) => list(items).filter((item) => !item.excused && finite(item.score) !== null);

const METHODS = Object.freeze({
  MEAN: 'category-mean-of-item-percents',
  POINTS: 'category-points',
});

const categoryAverages = (items, method) => {
  const byCategory = new Map();
  items.forEach((item) => {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  });
  const result = new Map();
  for (const [name, members] of byCategory) {
    if (method === METHODS.MEAN) {
      result.set(name, { average: members.reduce((sum, item) => sum + Number(item.score), 0) / members.length, members, shares: members.map(() => 1 / members.length) });
    } else {
      const possible = members.reduce((sum, item) => sum + Number(item.pointsPossible), 0);
      if (!(possible > 0)) return null;
      const earned = members.reduce((sum, item) => sum + (Number(item.score) / 100) * Number(item.pointsPossible), 0);
      result.set(name, { average: (earned / possible) * 100, members, shares: members.map((item) => Number(item.pointsPossible) / possible) });
    }
  }
  return result;
};

const insufficient = (status, explanation) => ({
  sufficient: false, status, explanation, method: null, reconstructedAverage: null, officialAverage: null, categories: [], items: [], rankedByImpact: [],
});

const NO_GUESS = 'MathMaster will not guess the district\'s weighting.';

/**
 * Contribution of each category and item to the OFFICIAL average — only when
 * the file's own numbers reproduce the file's own average.
 */
export const analyzeOfficialContribution = (snapshot = {}) => {
  const official = finite(snapshot.officialAverage);
  const items = scoredItems(snapshot.items);
  if (!items.length) return insufficient('no-items', 'The imported file has no scored items for this student.');
  if (official === null) {
    return insufficient('no-official-average', `The imported file does not include the official cycle average, so MathMaster cannot check how the gradebook combines these items. The items are listed and compared with MathMaster, but no official average is reconstructed. ${NO_GUESS}`);
  }
  if (items.some((item) => !clean(item.category))) {
    return insufficient('missing-categories', `The imported file does not include a category for every scored item, so it does not contain enough information to reconstruct the official average (${official}). ${NO_GUESS}`);
  }
  const weights = new Map(list(snapshot.categories).map((category) => [category.name, finite(category.weight)]));
  const usedCategories = [...new Set(items.map((item) => item.category))];
  const missingWeights = usedCategories.filter((name) => !(weights.get(name) > 0));
  if (missingWeights.length) {
    return insufficient('missing-weights', `The imported file does not contain a weight for ${missingWeights.length === usedCategories.length ? 'its categories' : `the categor${missingWeights.length === 1 ? 'y' : 'ies'} ${missingWeights.join(', ')}`}, so it does not contain enough information to reconstruct the official average (${official}). ${NO_GUESS}`);
  }

  const attempts = [METHODS.MEAN];
  if (items.every((item) => finite(item.pointsPossible) > 0)) attempts.push(METHODS.POINTS);
  const computed = attempts.map((method) => {
    const averages = categoryAverages(items, method);
    if (!averages) return null;
    const totalWeight = usedCategories.reduce((sum, name) => sum + weights.get(name), 0);
    const average = usedCategories.reduce((sum, name) => sum + weights.get(name) * averages.get(name).average, 0) / totalWeight;
    return { method, averages, totalWeight, average };
  }).filter(Boolean);
  const reproducing = computed.filter((entry) => close(entry.average, official) || Math.round(entry.average) === official);
  if (!reproducing.length) {
    const tried = computed.map((entry) => `${round1(entry.average)} (${entry.method === METHODS.MEAN ? 'averaging item percentages within each category' : 'adding points within each category'})`).join(' and ');
    return insufficient('not-reproduced', `Using the file's categories and weights, MathMaster computes ${tried}, but the file's official average is ${official}. The gradebook combines these items in a way this file does not show — for example a dropped score, a different weight, or items not in the file. ${NO_GUESS}`);
  }
  const chosen = reproducing[0];
  const categories = usedCategories.map((name) => {
    const entry = chosen.averages.get(name);
    const share = weights.get(name) / chosen.totalWeight;
    return {
      name,
      weight: weights.get(name),
      weightShare: round1(share * 100),
      average: round1(entry.average),
      itemCount: entry.members.length,
      contributionPoints: round1(share * entry.average),
      pointsBelowFull: round1(share * (100 - entry.average)),
    };
  });
  const contributionItems = usedCategories.flatMap((name) => {
    const entry = chosen.averages.get(name);
    const share = weights.get(name) / chosen.totalWeight;
    return entry.members.map((item, index) => ({
      name: clean(item.name),
      category: name,
      score: Number(item.score),
      shareOfCategory: round1(entry.shares[index] * 100),
      cyclePoints: round1(share * Number(item.score) * entry.shares[index]),
      pointsBelowFull: round1(share * (100 - Number(item.score)) * entry.shares[index]),
    }));
  });
  return {
    sufficient: true,
    status: 'reconstructed',
    explanation: `The file's categories and weights reproduce its official average (${official}) by ${chosen.method === METHODS.MEAN ? 'averaging item percentages within each category' : 'adding points within each category'} and weighting the categories. Each item's share below is computed that way.${reproducing.length > 1 ? ' Both standard methods reproduce the average; the first is shown.' : ''}`,
    method: chosen.method,
    reconstructedAverage: round1(chosen.average),
    officialAverage: official,
    categories,
    items: contributionItems,
    rankedByImpact: [...contributionItems].sort((a, b) => b.pointsBelowFull - a.pointsBelowFull),
  };
};

export default reconcileGradebook;
