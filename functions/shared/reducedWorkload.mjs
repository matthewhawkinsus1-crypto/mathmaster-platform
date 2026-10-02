// REDUCED NUMBER OF ITEMS — SAME TEKS, SAME RIGOR — APPLIED BY THE PLATFORM.
//
// The accommodation `reduced-item-count-same-rigor` (supportCatalog.mjs) used
// to be recorded only: a teacher documented that they had handed a student a
// shorter assignment. This module lets the versioned support profile carry a
// percentage (`params.itemReduction = { mode: 'percent', value: 25 }`) and
// turns it into a STUDENT-SPECIFIC REQUIRED-QUESTION PROJECTION — the same
// kind of projection a Practice Pass already is
// (src/assignmentLifecycle.js studentAssignmentIndicesWithPracticePass). The
// shared assignment is never touched, nothing is deleted, and `teacherExcluded`
// is never used: the student simply is not responsible for the omitted items,
// so they are neither shown, nor counted, nor ever "missing".
//
// It lives in functions/shared/ because the browser (navigation, completion,
// grades, teacher views) and the Cloud Functions (Classroom grade sync,
// classwork completion, DOL projection, Recovery) must reach the same answer
// from the same inputs. Pure: no Firestore, no clock (the caller passes `now`).
//
// THE PIPELINE (documented in docs/IEP_SUPPORT_EVIDENCE_DESIGN.md §10):
//
//   assignment content
//     → teacher inclusion (teacherExcluded, replacements)    current content
//     → REDUCTION PLAN, from that content alone               this module
//     → Practice Pass waiver (whole Practice section)        assignmentLifecycle
//     → answered work is kept (never dropped)                this module
//     = the student's required items
//
// The plan depends only on the content and the policy (never on a redemption
// or on answers), so a Practice Pass and the reduction COMMUTE: redeeming,
// undoing or re-redeeming a pass never reshuffles the student's other
// sections, and a section-level reader (the classwork completion rule, the DOL
// projection, Recovery) can compute its own section without knowing anything
// else about the student.
//
// HOW ITEMS ARE CHOSEN (same TEKS, same rigor — never "drop every fourth"):
//
//   cell     one coverage group inside one section: same section role and the
//            same primary TEKS (else skill/objective, else question family,
//            else question type). Every cell keeps at least one unit, so no
//            TEKS/skill a section assesses disappears from it.
//   unit     what is kept or omitted together: one question, or every question
//            sharing an authored `itemGroup` (a dependent sequence — Part C is
//            never kept while its Part B is omitted). A question that is one
//            record (a composed / multi-answer item) is always one unit.
//   anchor   a unit with `coreItem: true` is never omitted.
//
// Removals are allocated one at a time to the cell with the most redundancy
// left (D'Hondt: largest size / (removed + 1)), ties going to Practice, then
// Classwork, then Warm-Up, and assessment sections last. Inside a cell the
// next unit comes from the most-represented DOK/difficulty level (so a lone
// harder item is the last to go), spread across the cell's positions by a
// low-discrepancy order seeded by the assignment — never the last N items.
//
// ROUNDING (one rule, here, for every screen): the target removal is
//   round-half-down(applicable items × percent / 100)
// i.e. the nearest whole number of items, ties keeping the work. No unit is
// removed if it would overshoot the target, so the student never receives MORE
// reduction than the rounded target. Every section keeps at least one item. A
// one-question DOL stays one question.

import { isTestCycleAssignment } from './testCyclePolicy.mjs';

export const REDUCED_WORKLOAD_SUPPORT_ID = 'reduced-item-count-same-rigor';
export const REDUCED_WORKLOAD_ALGORITHM_VERSION = 1;
export const REDUCED_WORKLOAD_TIME_ZONE = 'America/Chicago';

export const ITEM_REDUCTION_MODE = Object.freeze({
  /** Recorded only (the meaning every pre-existing profile keeps). */
  NONE: 'none',
  /** MathMaster omits this percentage of applicable items automatically. */
  PERCENT: 'percent',
});

export const ITEM_REDUCTION_LIMITS = Object.freeze({
  minPercent: 10,
  maxPercent: 50,
  defaultPercent: 25,
});

/** Why the delivered reduction differs from the configured percentage. */
export const WORKLOAD_VARIANCE = Object.freeze({
  ROUNDING: 'rounding',
  TOO_FEW_ITEMS: 'too-few-items',
  COVERAGE: 'coverage',
  INDIVISIBLE_GROUP: 'indivisible-group',
  ANSWERED_BEFORE_REDUCTION: 'answered-before-reduction',
  PRACTICE_PASS: 'practice-pass',
  LIMITED_TO_ACTIVITIES: 'limited-to-activities',
  SECURE_ASSESSMENT: 'secure-assessment',
});

export const WORKLOAD_VARIANCE_LABEL = Object.freeze({
  rounding: 'Items are whole: the exact percentage was not a whole number of items, so it was rounded to the nearest item (ties keep the work).',
  'too-few-items': 'Too few items to reduce without removing the work itself.',
  coverage: 'Removing more would have dropped a TEKS/skill or a core item from a section.',
  'indivisible-group': 'A linked group of questions must stay together and was larger than what was left to remove.',
  'answered-before-reduction': 'Work the student had already answered is always kept.',
  'practice-pass': 'A Practice Pass waived Practice, where part of the reduction was planned.',
  'limited-to-activities': 'The support applies only to some activities in this assignment.',
  'secure-assessment': 'Secure Test Cycle assessments are delivered as published; MathMaster does not reduce them.',
});

/** What happened when the platform tried to apply the support to one assignment. */
export const WORKLOAD_STATUS = Object.freeze({
  /** The student has no automatic reduction in effect for this assignment. */
  NONE: 'none',
  /** Configured as a recorded-only (manual / legacy) support. */
  MANUAL: 'manual',
  /** Automatic, but nothing could be removed (tiny assignment, coverage). */
  NOT_APPLICABLE: 'not-applicable',
  /** Automatic, and at least one item was omitted. */
  APPLIED: 'applied',
});

const ROLE_PRIORITY = Object.freeze({ practice: 0, classwork: 1, warmup: 2, quiz: 3, test: 4, dol: 5 });
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const GOLDEN = 0.6180339887498949;

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** FNV-1a, 32 bit. Deterministic everywhere (browser and Node). */
const hash32 = (text) => {
  let h = 0x811c9dc5;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};
const hex8 = (value) => value.toString(16).padStart(8, '0');

// --- The profile parameter ------------------------------------------------------

/**
 * `{ mode, value }`, validated in one place. Anything that is not an explicit,
 * in-range percentage is `none` — "recorded only" — which is the meaning a
 * bare `reduced-item-count-same-rigor` has always had. A legacy profile can
 * therefore never start losing questions because this build shipped.
 */
export const normalizeItemReduction = (raw) => {
  if (!isObject(raw)) return { mode: ITEM_REDUCTION_MODE.NONE, value: 0 };
  const mode = clean(raw.mode).toLowerCase();
  const value = Number(raw.value);
  if (
    mode === ITEM_REDUCTION_MODE.PERCENT
    && Number.isInteger(value)
    && value >= ITEM_REDUCTION_LIMITS.minPercent
    && value <= ITEM_REDUCTION_LIMITS.maxPercent
  ) {
    return { mode: ITEM_REDUCTION_MODE.PERCENT, value };
  }
  return { mode: ITEM_REDUCTION_MODE.NONE, value: 0 };
};

/** The editor's error for an automatic choice that is out of range, or null. */
export const itemReductionInputError = (raw) => {
  if (!isObject(raw) || clean(raw.mode).toLowerCase() !== ITEM_REDUCTION_MODE.PERCENT) return null;
  return normalizeItemReduction(raw).mode === ITEM_REDUCTION_MODE.PERCENT
    ? null
    : `Reduced number of items: choose a whole-number percentage from ${ITEM_REDUCTION_LIMITS.minPercent} to ${ITEM_REDUCTION_LIMITS.maxPercent}.`;
};

export const describeItemReduction = (raw) => {
  const reduction = normalizeItemReduction(raw);
  return reduction.mode === ITEM_REDUCTION_MODE.PERCENT
    ? `MathMaster assigns ${reduction.value}% fewer items, keeping every TEKS and the same rigor`
    : 'Recorded by staff (MathMaster does not choose the items)';
};

// --- Which revision governs an assignment -------------------------------------------

const ZONED_DATE = new Map();
const zonedDateKey = (ms, timeZone = REDUCED_WORKLOAD_TIME_ZONE) => {
  let formatter = ZONED_DATE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    ZONED_DATE.set(timeZone, formatter);
  }
  return formatter.format(new Date(ms));
};

/**
 * Milliseconds for an assignment date field. A bare `YYYY-MM-DD` is read as
 * that school day (its date key is what matters here), anything else as an
 * instant. Kept local so this module stays dependency-free for the server.
 */
const instantOf = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = clean(value);
  if (DATE_KEY.test(text)) return Date.parse(`${text}T18:00:00Z`);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * The school date whose profile governs this assignment's workload: the class
 * due date, else the release date, else today — the same anchor the support
 * evidence report uses for "the profile in effect for this assignment"
 * (src/platform/supportEvidence/evidenceAggregation.js
 * governingProfileForAssignment). A later profile revision therefore never
 * changes the required items — and so the grade — of work that was already
 * due under an earlier revision.
 */
export const workloadAnchorDateKey = (assignment = {}, { nowValue = Date.now(), timeZone = REDUCED_WORKLOAD_TIME_ZONE } = {}) => {
  const anchor = instantOf(assignment?.dueAt ?? assignment?.dueDate)
    ?? instantOf(assignment?.releaseAt ?? assignment?.releaseDate)
    ?? Number(nowValue);
  return zonedDateKey(Number.isFinite(anchor) ? anchor : Date.now(), timeZone);
};

const latestOnOrBefore = (entries, dateKey) => {
  let best = null;
  list(entries).forEach((entry) => {
    if (!isObject(entry)) return;
    const start = DATE_KEY.test(clean(entry.effectiveStart)) ? entry.effectiveStart : '';
    if (start && dateKey && start > dateKey) return;
    if (!best) { best = entry; return; }
    const bestStart = DATE_KEY.test(clean(best.effectiveStart)) ? best.effectiveStart : '';
    if (start > bestStart || (start === bestStart && Number(entry.revision) > Number(best.revision))) best = entry;
  });
  return best;
};

/**
 * The history the projection keeps so a past assignment is always resolved
 * under the revision that governed it (supportProfileModel.mjs
 * buildSupportProjection writes it): one compact row per revision.
 */
export const itemReductionHistoryRow = (revision = {}) => {
  const entry = list(revision?.accommodations).find((item) => item?.id === REDUCED_WORKLOAD_SUPPORT_ID) || null;
  const reduction = normalizeItemReduction(entry?.params?.itemReduction);
  return {
    revisionId: clean(revision?.revisionId || revision?.id) || null,
    revision: Number(revision?.revision) || 0,
    effectiveStart: DATE_KEY.test(clean(revision?.effectiveStart)) ? revision.effectiveStart : null,
    status: clean(revision?.status) === 'inactive' ? 'inactive' : 'active',
    configured: Boolean(entry),
    percent: reduction.mode === ITEM_REDUCTION_MODE.PERCENT ? reduction.value : 0,
    appliesTo: list(entry?.appliesTo).map((role) => clean(role).toLowerCase()).filter(Boolean),
  };
};

/**
 * The reduction in effect for one assignment, from the student's
 * `grades/{id}.profile` (the pinned projection, or its normalized view, which
 * passes `supportPlan` through).
 *
 * Returns `{ status: 'none' | 'manual' | 'automatic', percent, appliesTo,
 * revisionId, anchorDateKey }`. A legacy flat profile can only ever be
 * `manual`: automatic reduction exists only in a versioned revision a teacher
 * saved with a percentage.
 */
export const resolveItemReductionPolicy = ({ profile = null, assignment = null, nowValue = Date.now() } = {}) => {
  const anchorDateKey = workloadAnchorDateKey(assignment || {}, { nowValue });
  const none = { status: 'none', percent: 0, appliesTo: [], revisionId: null, anchorDateKey };
  if (!isObject(profile)) return none;
  const plan = isObject(profile.supportPlan) ? profile.supportPlan : null;
  const history = list(plan?.itemReductionHistory);
  let row = null;
  if (history.length) {
    row = latestOnOrBefore(history, anchorDateKey);
  } else if (list(plan?.windows).length) {
    const window = latestOnOrBefore(plan.windows, anchorDateKey);
    row = window ? itemReductionHistoryRow(window) : null;
  } else {
    const ids = list(profile.accommodations).map((id) => (typeof id === 'string' ? id : id?.id));
    return ids.includes(REDUCED_WORKLOAD_SUPPORT_ID) ? { ...none, status: 'manual' } : none;
  }
  if (!row || row.status === 'inactive' || !row.configured) return { ...none, revisionId: row?.revisionId || null };
  const percent = Number(row.percent);
  if (!(Number.isInteger(percent) && percent >= ITEM_REDUCTION_LIMITS.minPercent && percent <= ITEM_REDUCTION_LIMITS.maxPercent)) {
    return { ...none, status: 'manual', revisionId: row.revisionId || null };
  }
  return {
    status: 'automatic',
    percent,
    appliesTo: list(row.appliesTo),
    revisionId: row.revisionId || null,
    anchorDateKey,
  };
};

// --- The content, as items ------------------------------------------------------------

/**
 * The current content of a V5 assignment, flattened in storage order: every
 * question the teacher has not excluded. Storage indices match
 * src/platform/assignments/currentContentProjection.js and
 * functions/lib/assignmentRuntime.js (both flatten sections → questions).
 */
export const workloadItemsFromAssignment = (assignment = {}) => {
  const items = [];
  let storageIndex = 0;
  list(assignment?.sections).forEach((section) => {
    list(section?.questions).forEach((question) => {
      if (question?.teacherExcluded !== true) {
        items.push({
          storageIndex,
          role: clean(question?.activityRole || section?.role).toLowerCase() || 'practice',
          question,
        });
      }
      storageIndex += 1;
    });
  });
  return items;
};

// --- Coverage ------------------------------------------------------------------------

const TEKS_CODE = /^[A-Z0-9]{1,4}\.\d{1,2}[A-Z]?$/i;
const teksCodesOf = (question = {}) => {
  // The shapes questionMetadata.mjs normalizeQuestionStandards reads, without
  // its registry lookup (the server must not load the TEKS registry for this).
  const raw = [];
  const push = (value) => {
    if (Array.isArray(value)) value.forEach(push);
    else if (typeof value === 'string' || typeof value === 'number') raw.push(String(value));
    else if (isObject(value)) push(value.code || value.teks || value.standard);
  };
  if (Array.isArray(question.alignmentKeys) && !question.standards && !question.teks) {
    push(question.alignmentKeys.map((key) => clean(key).replace(/^texas:/i, '')));
  } else if (Array.isArray(question.alignments) && !question.standards && !question.teks) {
    question.alignments
      .filter((entry) => entry && clean(entry.framework || 'teks') === 'teks' && clean(entry.role || 'primary') === 'primary')
      .forEach((entry) => push(entry.code));
  } else {
    const source = question.standards ?? question;
    if (Array.isArray(source)) push(source);
    else if (isObject(source)) {
      push(source.primary ?? source.primaryTEKS ?? source.teks ?? source.codes ?? source.primaryStandard ?? source.standard ?? []);
    }
  }
  return [...new Set(raw.map((code) => clean(code).replace(/^TEKS\s*/i, '').toUpperCase()).filter((code) => TEKS_CODE.test(code)))].sort();
};

/**
 * What a question assesses, as precisely as its metadata allows: primary TEKS,
 * else an authored skill/objective, else its question family, else its tool
 * type. Missing metadata never collapses a section into one group silently
 * dropping a kind of task: different tools stay different groups.
 */
export const workloadCoverageKey = (question = {}) => {
  const teks = teksCodesOf(question);
  if (teks.length) return `teks:${teks.join('+')}`;
  const skill = clean(question.skillId || question.skill || question.objectiveId || question.objective || question.learningTargetId);
  if (skill) return `skill:${skill.toLowerCase()}`;
  const family = clean(question?.questionFamily?.id || question?.questionFamily?.familyId);
  if (family) return `family:${family}`;
  return `type:${clean(question.type || question.toolId || question.questionType || 'item').toLowerCase()}`;
};

/** DOK first, then the instructional difficulty band: a sortable rigor level. */
const rigorLevelOf = (question = {}) => {
  const dok = Number(question?.complexity?.level ?? question?.complexity?.dok ?? question?.standards?.dok ?? question?.dok);
  const band = Number(question?.difficulty?.generatorBand ?? question?.difficulty?.band ?? question?.difficultyBand ?? question?.generatorBand);
  return (Number.isInteger(dok) && dok >= 1 && dok <= 4 ? dok : 0) * 10 + (Number.isInteger(band) && band >= 1 && band <= 5 ? band : 3);
};

// --- The plan --------------------------------------------------------------------------

/** Nearest whole number of items, ties toward keeping the work. */
export const targetRemovalCount = (applicableCount, percent) => {
  const n = Math.max(0, Math.trunc(Number(applicableCount) || 0));
  const p = Math.max(0, Math.trunc(Number(percent) || 0));
  return Math.max(0, Math.ceil((n * p - 50) / 100));
};

const spreadOrder = (units, seed) => units
  .map((unit, rank) => ({ unit, key: ((rank + 1) * GOLDEN + seed) % 1 }))
  .sort((a, b) => a.key - b.key || a.unit.firstIndex - b.unit.firstIndex)
  .map((entry) => entry.unit);

/**
 * The order a cell gives up its units, ignoring any budget: always from the
 * rigor level with the most units still kept (ties: the lower level), spread
 * across positions. Anchors are never listed. The "every cell keeps at least
 * one unit" rule is enforced where units are actually removed (a linked group
 * that is too big to remove must not stop a single item behind it).
 */
const cellRemovalSequence = (cell, seedKey) => {
  const removable = cell.units.filter((unit) => !unit.anchor);
  if (!removable.length) return [];
  const byLevel = new Map();
  removable.forEach((unit) => byLevel.set(unit.level, [...(byLevel.get(unit.level) || []), unit]));
  const queues = new Map([...byLevel.entries()].map(([level, units]) => [
    level,
    spreadOrder(units, hash32(`${seedKey}|${cell.key}|${level}`) / 4294967296),
  ]));
  const remaining = new Map();
  cell.units.forEach((unit) => remaining.set(unit.level, (remaining.get(unit.level) || 0) + 1));
  const sequence = [];
  while (sequence.length < removable.length) {
    let chosen = null;
    queues.forEach((queue, level) => {
      if (!queue.length) return;
      if (chosen === null
        || remaining.get(level) > remaining.get(chosen)
        || (remaining.get(level) === remaining.get(chosen) && level < chosen)) chosen = level;
    });
    if (chosen === null) break;
    const unit = queues.get(chosen).shift();
    remaining.set(chosen, remaining.get(chosen) - 1);
    sequence.push(unit);
  }
  return sequence;
};

const appliesToRole = (appliesTo, role) => !list(appliesTo).length || list(appliesTo).includes(role);

/**
 * THE REDUCTION PLAN for one assignment's current content and one policy.
 *
 * `items` — `[{ storageIndex, role, question }]` (workloadItemsFromAssignment).
 * `seedKey` — the assignment id: every student with the same percentage on
 * the same assignment gets the same items, which keeps whole-class review
 * coherent; different assignments omit different positions.
 *
 * Deterministic: the same content and policy give the same plan on every
 * device, in the browser and on the server.
 */
export const planReducedWorkload = ({ items = [], percent = 0, appliesTo = [], seedKey = '' } = {}) => {
  const value = Math.trunc(Number(percent) || 0);
  const roles = list(appliesTo).map((role) => clean(role).toLowerCase()).filter(Boolean);
  const all = list(items).filter((item) => Number.isInteger(item?.storageIndex) && item.storageIndex >= 0);
  const applicable = all.filter((item) => appliesToRole(roles, clean(item.role).toLowerCase()));

  // Units: one question, or an authored dependent group within one section.
  const unitsByKey = new Map();
  applicable.forEach((item) => {
    const role = clean(item.role).toLowerCase();
    const group = clean(item.question?.itemGroup);
    const key = group ? `${role}|group:${group}` : `${role}|index:${item.storageIndex}`;
    const unit = unitsByKey.get(key) || {
      key, role, indices: [], anchor: false, firstIndex: item.storageIndex, coverageKey: null, level: 0,
    };
    unit.indices.push(item.storageIndex);
    unit.anchor = unit.anchor || item.question?.coreItem === true;
    unit.firstIndex = Math.min(unit.firstIndex, item.storageIndex);
    // A group is covered by what its first question assesses, and is as
    // demanding as its most demanding question.
    if (unit.coverageKey === null) unit.coverageKey = workloadCoverageKey(item.question || {});
    unit.level = Math.max(unit.level, rigorLevelOf(item.question || {}));
    unitsByKey.set(key, unit);
  });
  const units = [...unitsByKey.values()].map((unit) => ({ ...unit, indices: unit.indices.sort((a, b) => a - b), size: unit.indices.length }));

  const cellsByKey = new Map();
  units.forEach((unit) => {
    const key = `${unit.role}|${unit.coverageKey}`;
    const cell = cellsByKey.get(key) || { key, role: unit.role, units: [], itemCount: 0, firstIndex: unit.firstIndex };
    cell.units.push(unit);
    cell.itemCount += unit.size;
    cell.firstIndex = Math.min(cell.firstIndex, unit.firstIndex);
    cellsByKey.set(key, cell);
  });
  const cells = [...cellsByKey.values()]
    .map((cell) => ({ ...cell, units: cell.units.sort((a, b) => a.firstIndex - b.firstIndex) }))
    .sort((a, b) => a.firstIndex - b.firstIndex);
  cells.forEach((cell) => { cell.sequence = cellRemovalSequence(cell, clean(seedKey)); });

  const applicableCount = applicable.length;
  const exactRemoval = (applicableCount * value) / 100;
  const targetRemoval = value > 0 ? targetRemovalCount(applicableCount, value) : 0;

  // D'Hondt across cells: the most redundant cell gives up the next unit.
  // A cell always keeps at least one unit (anchors count as kept).
  const removedUnits = new Set();
  const removedItemsByCell = new Map(cells.map((cell) => [cell.key, 0]));
  const removedUnitsByCell = new Map(cells.map((cell) => [cell.key, 0]));
  const mayRemoveFrom = (cell) => cell.units.length - removedUnitsByCell.get(cell.key) > 1;
  let removedCount = 0;
  for (;;) {
    let best = null;
    cells.forEach((cell) => {
      if (!mayRemoveFrom(cell)) return;
      const next = cell.sequence.find((unit) => !removedUnits.has(unit.key) && unit.size <= targetRemoval - removedCount);
      if (!next) return;
      const quotient = cell.itemCount / (removedItemsByCell.get(cell.key) + 1);
      const priority = ROLE_PRIORITY[cell.role] ?? 2;
      if (!best
        || quotient > best.quotient
        || (quotient === best.quotient && priority < best.priority)
        || (quotient === best.quotient && priority === best.priority && cell.firstIndex < best.cell.firstIndex)) {
        best = { cell, next, quotient, priority };
      }
    });
    if (!best) break;
    removedUnits.add(best.next.key);
    removedItemsByCell.set(best.cell.key, removedItemsByCell.get(best.cell.key) + best.next.size);
    removedUnitsByCell.set(best.cell.key, removedUnitsByCell.get(best.cell.key) + 1);
    removedCount += best.next.size;
  }
  const removed = units.filter((unit) => removedUnits.has(unit.key)).flatMap((unit) => unit.indices).sort((a, b) => a - b);

  const variance = [];
  if (value > 0 && applicableCount > 0) {
    if (targetRemoval === 0 && exactRemoval > 0) variance.push(WORKLOAD_VARIANCE.TOO_FEW_ITEMS);
    else if (targetRemoval !== exactRemoval) variance.push(WORKLOAD_VARIANCE.ROUNDING);
    if (removedCount < targetRemoval) {
      // Stopped short. If some cell could still give up a unit under the
      // coverage rule, only size stopped it: a linked group too large for what
      // was left. Otherwise coverage (or core items) stopped it.
      const sizeBlocked = cells.some((cell) => mayRemoveFrom(cell) && cell.sequence.some((unit) => !removedUnits.has(unit.key)));
      variance.push(sizeBlocked ? WORKLOAD_VARIANCE.INDIVISIBLE_GROUP : WORKLOAD_VARIANCE.COVERAGE);
    }
  }
  if (roles.length && applicable.length < all.length) variance.push(WORKLOAD_VARIANCE.LIMITED_TO_ACTIVITIES);

  const fingerprint = hex8(hash32(JSON.stringify([
    REDUCED_WORKLOAD_ALGORITHM_VERSION, value, roles, clean(seedKey),
    all.map((item) => {
      const unit = units.find((entry) => entry.indices.includes(item.storageIndex));
      return [item.storageIndex, clean(item.question?.questionId), clean(item.role).toLowerCase(), unit?.key || '-', unit?.coverageKey || '-', unit?.anchor ? 1 : 0, unit?.level || 0];
    }),
  ])));

  return {
    algorithmVersion: REDUCED_WORKLOAD_ALGORITHM_VERSION,
    percent: value,
    appliesTo: roles,
    seedKey: clean(seedKey),
    itemCount: all.length,
    applicableCount,
    exactRemoval,
    targetRemoval,
    removedCount,
    removed,
    variance,
    fingerprint,
    // Kept for the student layer: which unit an index belongs to, and each
    // cell's full removal order (answered work is kept; see below).
    units: units.map((unit) => ({ key: unit.key, indices: unit.indices, anchor: unit.anchor, cellKey: `${unit.role}|${unit.coverageKey}` })),
    cells: cells.map((cell) => ({
      key: cell.key,
      role: cell.role,
      coverageKey: cell.key.slice(cell.role.length + 1),
      itemCount: cell.itemCount,
      sequence: cell.sequence.map((unit) => unit.key),
    })),
  };
};

// Plans are recomputed for every student on every grade screen; the content
// rarely changes between calls. Cache by assignment object and policy.
const PLAN_CACHE = new WeakMap();
export const cachedReducedWorkloadPlan = ({ assignment, percent, appliesTo = [] }) => {
  const policyKey = `${percent}|${list(appliesTo).join(',')}|${clean(assignment?.id)}`;
  if (assignment && typeof assignment === 'object') {
    const byPolicy = PLAN_CACHE.get(assignment);
    if (byPolicy?.has(policyKey)) return byPolicy.get(policyKey);
  }
  const plan = planReducedWorkload({
    items: workloadItemsFromAssignment(assignment || {}),
    percent,
    appliesTo,
    seedKey: clean(assignment?.id),
  });
  if (assignment && typeof assignment === 'object') {
    const byPolicy = PLAN_CACHE.get(assignment) || new Map();
    byPolicy.set(policyKey, plan);
    PLAN_CACHE.set(assignment, byPolicy);
  }
  return plan;
};

// --- One student ---------------------------------------------------------------------------

// "Answered" exactly as the grade reads it (gradeEvidence.js splitGrade:
// normalizeQuestionRecord(record).status !== 'unattempted'), including the
// legacy string records.
const answeredOf = (tracker) => {
  const answered = new Set();
  if (!isObject(tracker)) return answered;
  Object.entries(tracker).forEach(([index, record]) => {
    const status = typeof record === 'string' ? clean(record) : clean(isObject(record) ? record.status : '');
    if (status && status !== 'unattempted' && Number.isInteger(Number(index))) answered.add(Number(index));
  });
  return answered;
};

/**
 * The student's required items: `baseIndices` (current content after teacher
 * inclusion and any Practice Pass) minus what the plan omits — except that an
 * item the student has already answered is NEVER dropped. When answered work
 * sits among the omitted items (the support was switched on mid-assignment,
 * the percentage changed, or the teacher revised the content), the same cell
 * gives up its next unanswered units instead, so the student still gets the
 * reduction where it is possible.
 *
 * Stable by construction: answering a required item never changes the set
 * (the compensating units are always the first unanswered ones in the cell's
 * fixed order, and a required item is never one of them).
 */
// Order is the caller's: a teacher's replacement question is shown where the
// question it replaced stood, so the base order is filtered, never re-sorted.
const orderedUnique = (indices) => [...new Set(list(indices).map(Number).filter(Number.isInteger))];

export const projectStudentWorkload = ({ plan, baseIndices = [], tracker = null } = {}) => {
  const base = orderedUnique(baseIndices);
  if (!plan || !plan.percent) {
    return { indices: base, omitted: [], keptAnswered: [], compensated: [] };
  }
  const baseSet = new Set(base);
  const answered = answeredOf(tracker);
  const unitByIndex = new Map();
  plan.units.forEach((unit) => unit.indices.forEach((index) => unitByIndex.set(index, unit)));
  const unitByKey = new Map(plan.units.map((unit) => [unit.key, unit]));
  const removedSet = new Set(plan.removed);
  const removedUnitKeys = new Set(plan.units.filter((unit) => unit.indices.some((index) => removedSet.has(index))).map((unit) => unit.key));
  const unitAnswered = (unit) => unit.indices.some((index) => answered.has(index));

  const omittedUnits = new Set();
  const keptAnswered = [];
  const compensated = [];
  plan.cells.forEach((cell) => {
    const removedInCell = cell.sequence.filter((key) => removedUnitKeys.has(key));
    const pinned = removedInCell.filter((key) => unitAnswered(unitByKey.get(key)));
    removedInCell.filter((key) => !pinned.includes(key)).forEach((key) => omittedUnits.add(key));
    let owed = pinned.reduce((sum, key) => sum + unitByKey.get(key).indices.length, 0);
    pinned.forEach((key) => keptAnswered.push(...unitByKey.get(key).indices));
    if (!owed) return;
    for (const key of cell.sequence) {
      if (owed <= 0) break;
      if (removedUnitKeys.has(key)) continue;
      const unit = unitByKey.get(key);
      if (unitAnswered(unit) || unit.indices.length > owed) continue;
      omittedUnits.add(key);
      compensated.push(...unit.indices);
      owed -= unit.indices.length;
    }
  });
  const omitted = base.filter((index) => {
    const unit = unitByIndex.get(index);
    return unit && omittedUnits.has(unit.key);
  });
  const omittedSet = new Set(omitted);
  return {
    indices: base.filter((index) => !omittedSet.has(index)),
    omitted: [...omitted].sort((a, b) => a - b),
    keptAnswered: keptAnswered.filter((index) => baseSet.has(index)).sort((a, b) => a - b),
    compensated: compensated.filter((index) => baseSet.has(index)).sort((a, b) => a - b),
  };
};

const tenthsOfPercent = (removed, original) => (original > 0 ? Math.round((removed / original) * 1000) : 0);

/**
 * EVERYTHING ABOUT ONE STUDENT'S WORKLOAD ON ONE ASSIGNMENT, in one call.
 *
 * `baseIndices` — the student's required indices before the reduction
 * (current content, teacher inclusion, Practice Pass). `practiceWaived` — the
 * indices a Practice Pass removed, so the summary can say where the variance
 * came from. Never throws: a malformed profile or assignment is "none".
 *
 * `summary` is the compact, factual record the evidence and the teacher views
 * show: target, original, assigned, actual, and why they differ.
 */
export const resolveStudentWorkload = ({
  assignment = null,
  profile = null,
  baseIndices = null,
  tracker = null,
  practiceWaived = [],
  nowValue = Date.now(),
} = {}) => {
  const base = Array.isArray(baseIndices)
    ? orderedUnique(baseIndices)
    : workloadItemsFromAssignment(assignment || {}).map((item) => item.storageIndex);
  const policy = resolveItemReductionPolicy({ profile, assignment, nowValue });
  const unchanged = (status) => ({
    status,
    indices: base,
    omitted: [],
    policy,
    plan: null,
    summary: status === WORKLOAD_STATUS.NONE ? null : {
      status,
      targetPercent: policy.percent || 0,
      originalCount: base.length,
      assignedCount: base.length,
      actualPercentTenths: 0,
      variance: [],
      revisionId: policy.revisionId || null,
    },
  });
  if (policy.status === 'none') return unchanged(WORKLOAD_STATUS.NONE);
  if (policy.status === 'manual') return unchanged(WORKLOAD_STATUS.MANUAL);
  // A secure Test Cycle has its own server-authoritative delivery and grade
  // (testCycleGrades); it is never reshaped per student here. Said plainly,
  // not silently skipped.
  if (assignment?.secure === true || isTestCycleAssignment(assignment)) {
    const result = unchanged(WORKLOAD_STATUS.NOT_APPLICABLE);
    result.summary.variance = [WORKLOAD_VARIANCE.SECURE_ASSESSMENT];
    return result;
  }

  const plan = cachedReducedWorkloadPlan({ assignment, percent: policy.percent, appliesTo: policy.appliesTo });
  const projection = projectStudentWorkload({ plan, baseIndices: base, tracker });
  const removedFromBase = base.length - projection.indices.length;
  const variance = [...plan.variance];
  const waived = new Set(list(practiceWaived).map(Number));
  if (waived.size && plan.removed.some((index) => waived.has(index))) variance.push(WORKLOAD_VARIANCE.PRACTICE_PASS);
  if (projection.keptAnswered.length > projection.compensated.length) variance.push(WORKLOAD_VARIANCE.ANSWERED_BEFORE_REDUCTION);
  const status = removedFromBase > 0 ? WORKLOAD_STATUS.APPLIED : WORKLOAD_STATUS.NOT_APPLICABLE;
  return {
    status,
    indices: projection.indices,
    omitted: projection.omitted,
    keptAnswered: projection.keptAnswered,
    policy,
    plan,
    summary: {
      status,
      targetPercent: policy.percent,
      originalCount: base.length,
      assignedCount: projection.indices.length,
      actualPercentTenths: tenthsOfPercent(removedFromBase, base.length),
      variance: [...new Set(variance)],
      revisionId: policy.revisionId || null,
      contentFingerprint: plan.fingerprint,
      algorithmVersion: plan.algorithmVersion,
      omittedIndices: projection.omitted,
    },
  };
};

/** "25%" / "33.3%" from tenths of a percent. */
export const formatPercentTenths = (tenths) => {
  const value = Math.max(0, Number(tenths) || 0) / 10;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
};

/** One teacher-facing sentence for a workload summary. Never claims more than was delivered. */
export const describeWorkloadSummary = (summary) => {
  if (!summary) return '';
  if (summary.status === WORKLOAD_STATUS.MANUAL) return 'Fewer items, same rigor: recorded by staff (not chosen by MathMaster).';
  const head = `${summary.assignedCount} of ${summary.originalCount} items assigned`;
  if (summary.status === WORKLOAD_STATUS.NOT_APPLICABLE) {
    return `${head} — no reduction possible (target ${summary.targetPercent}%).`;
  }
  return `${head} — ${formatPercentTenths(summary.actualPercentTenths)} fewer (target ${summary.targetPercent}%).`;
};

export default resolveStudentWorkload;
