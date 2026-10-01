/*
 * DETERMINISTIC RANKING FOR LIVE CHALLENGE.
 *
 * One ranking implementation serves every place a Live Challenge orders
 * players: the live leaderboard, a round's placement, the final standings and
 * any reward rule that asks "who finished first". Before this module each of
 * those sorted on its own, and the leaderboard broke an exact tie by alias —
 * so two students with identical work received different ranks, the one whose
 * name sorted first always won, and a browser's locale could reorder names.
 *
 * THE RULES, STATED ONCE.
 *
 *   A ranking is a list of METRICS, each with a direction. Players are
 *   compared metric by metric; the first metric that differs decides.
 *
 *   Players equal on EVERY metric are tied and share a rank (standard
 *   competition ranking: 1, 2, 2, 4). A tie is never broken by name, device,
 *   arrival order or chance — nothing that is not performance may decide a
 *   place.
 *
 *   Tied players still need a stable ORDER on a screen. That order uses the
 *   display key and then the participant id, compared by code point (never
 *   localeCompare, which differs between browsers). It affects `position`,
 *   never `rank`.
 *
 *   A missing or non-numeric metric is the worst possible value for its
 *   direction, so absent work can never outrank present work.
 *
 * This module is pure and has no Firebase or browser dependency, so Cloud
 * Functions, the teacher projector and the student device rank identically.
 */

export const RANK_DIRECTION = Object.freeze({
  HIGHER_IS_BETTER: 'desc',
  LOWER_IS_BETTER: 'asc',
});

const DIRECTIONS = new Set(Object.values(RANK_DIRECTION));

export class RankingSpecError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RankingSpecError';
  }
}

// Specs that already passed validation, so a sort does not re-validate on every
// comparison.
const NORMALIZED_SPECS = new WeakSet();

/**
 * Validate a ranking spec. A spec is data, so a mode can declare its ranking
 * without writing a comparator — and so the declaration can be tested.
 */
export const normalizeRankingSpec = (spec = {}) => {
  if (spec && NORMALIZED_SPECS.has(spec)) return spec;
  const metrics = Array.isArray(spec?.metrics) ? spec.metrics : [];
  if (!metrics.length) throw new RankingSpecError('A ranking needs at least one metric.');
  const seen = new Set();
  const normalized = metrics.map((metric) => {
    const key = String(metric?.key || '').trim();
    if (!key) throw new RankingSpecError('Every ranking metric needs a key.');
    if (seen.has(key)) throw new RankingSpecError(`Ranking metric "${key}" appears twice.`);
    seen.add(key);
    const direction = String(metric?.direction || '');
    if (!DIRECTIONS.has(direction)) {
      throw new RankingSpecError(`Ranking metric "${key}" needs a direction of "desc" or "asc".`);
    }
    return Object.freeze({ key, direction });
  });
  const result = Object.freeze({
    id: String(spec?.id || 'ranking'),
    metrics: Object.freeze(normalized),
  });
  NORMALIZED_SPECS.add(result);
  return result;
};

/** A metric read from `entry.metrics` when present there, else from the entry itself. */
export const metricOf = (entry, key) => {
  const metrics = entry?.metrics;
  if (metrics && typeof metrics === 'object' && Object.prototype.hasOwnProperty.call(metrics, key)) {
    return metrics[key];
  }
  return entry?.[key];
};

const comparableMetric = (value, direction) => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  // Absent work is the worst value in either direction.
  return direction === RANK_DIRECTION.HIGHER_IS_BETTER ? -Infinity : Infinity;
};

/**
 * Performance comparison only. Returns a negative number when `left` ranks
 * ahead of `right`, positive when behind, and 0 when the two are tied on every
 * metric. Ties are real results here, never an accident to be broken.
 */
export const compareByMetrics = (left, right, spec) => {
  const { metrics } = normalizeRankingSpec(spec);
  for (const { key, direction } of metrics) {
    const a = comparableMetric(metricOf(left, key), direction);
    const b = comparableMetric(metricOf(right, key), direction);
    if (a === b) continue;
    if (direction === RANK_DIRECTION.HIGHER_IS_BETTER) return a > b ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
};

const codePointCompare = (left, right) => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const displayKeyOf = (entry) => String(entry?.displayName ?? entry?.alias ?? '');
const participantKeyOf = (entry) => String(entry?.participantId ?? entry?.playerKey ?? entry?.studentId ?? '');

/** Stable on-screen order inside a tie. Never used to decide a rank. */
export const compareForDisplay = (left, right) => (
  codePointCompare(displayKeyOf(left).toLowerCase(), displayKeyOf(right).toLowerCase())
  || codePointCompare(displayKeyOf(left), displayKeyOf(right))
  || codePointCompare(participantKeyOf(left), participantKeyOf(right))
);

/**
 * Rank entries by a spec.
 *
 * Returns new objects carrying `rank` (shared by ties), `position` (1..n, the
 * stable display order) and `tied` (whether anyone else holds the same rank).
 * The input is never mutated, and the output is identical for any input order.
 */
export const rankEntries = (entries = [], spec) => {
  const normalized = normalizeRankingSpec(spec);
  const rows = (Array.isArray(entries) ? entries : []).filter((entry) => entry && typeof entry === 'object');
  const sorted = [...rows].sort((left, right) => (
    compareByMetrics(left, right, normalized) || compareForDisplay(left, right)
  ));

  const ranks = [];
  sorted.forEach((entry, index) => {
    const sharesPrevious = index > 0 && compareByMetrics(sorted[index - 1], entry, normalized) === 0;
    ranks.push(sharesPrevious ? ranks[index - 1] : index + 1);
  });
  const groupSize = new Map();
  ranks.forEach((rank) => groupSize.set(rank, (groupSize.get(rank) || 0) + 1));

  return sorted.map((entry, index) => ({
    ...entry,
    rank: ranks[index],
    position: index + 1,
    tied: groupSize.get(ranks[index]) > 1,
  }));
};

/*
 * PLACEMENT POINTS.
 *
 * A placement strategy converts a round's rank into a bounded number of match
 * points, so one runaway round cannot decide a whole match. The default table
 * is the twelve-place racing table (15, 12, 10, ... 1). Tied players share the
 * points of the rank they share, which is the natural reading of "we tied for
 * second".
 */
export const DEFAULT_PLACEMENT_POINTS = Object.freeze([15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
export const MAX_PLACEMENT_TABLE_LENGTH = 40;
export const MAX_PLACEMENT_POINTS = 100;

export const normalizePlacementTable = (table) => {
  if (!Array.isArray(table) || !table.length || table.length > MAX_PLACEMENT_TABLE_LENGTH) {
    return DEFAULT_PLACEMENT_POINTS;
  }
  const values = table.map((value) => Number(value));
  const valid = values.every((value, index) => Number.isInteger(value)
    && value >= 0
    && value <= MAX_PLACEMENT_POINTS
    && (index === 0 || value <= values[index - 1]));
  return valid ? Object.freeze(values) : DEFAULT_PLACEMENT_POINTS;
};

/** Points for a rank. Ranks outside the table earn `beyondTablePoints`. */
export const placementPoints = (rank, { table = DEFAULT_PLACEMENT_POINTS, beyondTablePoints = 0 } = {}) => {
  const place = Number(rank);
  if (!Number.isInteger(place) || place < 1) return 0;
  const normalizedTable = normalizePlacementTable(table);
  if (place <= normalizedTable.length) return normalizedTable[place - 1];
  const beyond = Number(beyondTablePoints);
  return Number.isInteger(beyond) && beyond >= 0 ? Math.min(beyond, MAX_PLACEMENT_POINTS) : 0;
};
