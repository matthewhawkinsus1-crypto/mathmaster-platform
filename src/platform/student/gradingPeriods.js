/*
 * MARKING PERIODS — AND WHY THEY ARE NOT `assignment.archived`.
 *
 * An archived assignment is one a teacher has put away: it disappears from the
 * default Library list, and putting work away is a filing decision. A marking
 * period is the opposite kind of fact — it is the reporting window the grade
 * belongs to, it is permanent, and a student must be able to read last
 * quarter's grades for as long as they are enrolled.
 *
 * Reusing `archived` for that would mean a teacher tidying their Library
 * silently rewrites grade history, and closing a marking period silently hides
 * a term of work from the student who earned it. So marking periods live here,
 * in their own concept, and nothing in this file reads or writes `archived`.
 *
 * TWO PLACES HOLD THE DATA, ON PURPOSE.
 *
 *   settings/gradingPeriods   the period list, and which one is current.
 *                             Teacher-owned, student-readable, and it holds
 *                             ONLY student-safe metadata: an id, a label, an
 *                             order, and whether the period is archived.
 *
 *   assignment.gradingPeriod  a tiny {id,label,order} stamp on the assignment
 *                             itself. Denormalized so an assignment keeps a
 *                             readable period name even if the settings
 *                             document is unavailable or the period was later
 *                             renamed away.
 *
 * The settings list wins whenever it knows the id, so renaming "Marking
 * Period 1" to "Quarter 1" renames it everywhere without a data migration. The
 * stamp is the fallback, never the authority.
 *
 * BACKWARD COMPATIBILITY IS THE DEFAULT PATH, NOT AN EDGE CASE.
 *
 * Every assignment in the live database predates this feature and carries no
 * `gradingPeriod`. Those assignments resolve into the CURRENT period — the one
 * the teacher has selected, or a synthetic "Current Marking Period" bucket when
 * no periods have been created at all. Nothing is migrated, nothing is hidden,
 * and a school that never opens the marking-period screen sees exactly one
 * group containing exactly what it saw before.
 *
 * `isFallback` on a resolution records that the assignment landed there by
 * default rather than by a teacher's choice, so the teacher screen can offer to
 * place it explicitly without guessing on the student's behalf.
 */

export const GRADING_PERIOD_SETTINGS_DOC = 'gradingPeriods';

// The bucket every un-stamped assignment falls into when no period has been
// marked current. Never archived: a default bucket that could be archived
// could hide every legacy assignment in the database at once.
export const FALLBACK_GRADING_PERIOD_ID = 'currentPeriod';
export const FALLBACK_GRADING_PERIOD_LABEL = 'Current Marking Period';

const clean = (value) => String(value ?? '').trim();

const cleanOrder = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * A period id safe to use as a Firestore field value and a React key.
 *
 * Teachers type labels, not identifiers, so "Marking Period 1" has to become
 * something stable. Derived once at creation and then never recomputed — a
 * renamed period keeps its id, which is what keeps already-stamped assignments
 * attached to it.
 */
export const gradingPeriodIdFromLabel = (label, { taken = [] } = {}) => {
  const base = clean(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'period';
  const used = new Set(taken.map(clean).filter(Boolean));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export const normalizeGradingPeriod = (raw = {}, index = 0) => {
  const id = clean(raw?.id);
  if (!id) return null;
  return {
    id,
    label: clean(raw?.label) || id,
    order: cleanOrder(raw?.order, index + 1),
    // Archiving a PERIOD closes it for new work and collapses it on the
    // student's screen. It never hides the grades inside it.
    archived: raw?.archived === true,
  };
};

/**
 * The stored settings document, made safe to render.
 *
 * A missing document, a partial write, or a `currentPeriodId` pointing at a
 * deleted period all have to produce a usable screen rather than an exception,
 * because the student Grade Center renders from this on every load.
 */
export const normalizeGradingPeriodSettings = (raw = {}) => {
  const periods = (Array.isArray(raw?.periods) ? raw.periods : [])
    .map((period, index) => normalizeGradingPeriod(period, index))
    .filter(Boolean);

  const deduped = [];
  const seen = new Set();
  periods.forEach((period) => {
    if (seen.has(period.id)) return;
    seen.add(period.id);
    deduped.push(period);
  });
  deduped.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  const requestedCurrent = clean(raw?.currentPeriodId);
  const currentExists = deduped.some((period) => period.id === requestedCurrent);
  // A current period that was deleted, or one that was archived, must not stay
  // current: new work would be filed into a closed window.
  const liveCurrent = currentExists && !deduped.find((period) => period.id === requestedCurrent).archived
    ? requestedCurrent
    : (deduped.filter((period) => !period.archived).slice(-1)[0]?.id || null);

  return {
    periods: deduped,
    currentPeriodId: liveCurrent,
    updatedAt: clean(raw?.updatedAt) || null,
  };
};

/**
 * The synthetic bucket legacy assignments live in when no period is current.
 *
 * Ordered above every real period so "current" sorts first without depending on
 * what numbers a teacher chose.
 */
export const fallbackGradingPeriod = (settings = null) => ({
  id: FALLBACK_GRADING_PERIOD_ID,
  label: FALLBACK_GRADING_PERIOD_LABEL,
  order: Math.max(0, ...(settings?.periods || []).map((period) => period.order)) + 1,
  archived: false,
});

/**
 * The id stamped on an assignment, or null.
 *
 * Deliberately the only place that reads `assignment.gradingPeriod`, and
 * deliberately never reads `assignment.archived`.
 */
export const assignmentGradingPeriodId = (assignment = null) => (
  clean(assignment?.gradingPeriod?.id) || null
);

/**
 * Which marking period an assignment's grade belongs to.
 *
 * Order of authority:
 *   1. the configured period whose id the assignment carries
 *   2. the assignment's own stamp, for a period the settings no longer list
 *   3. the current period — this is the backward-compatible path every
 *      existing assignment takes, and it is why this feature needs no migration
 */
export const resolveAssignmentGradingPeriod = (assignment = null, rawSettings = null) => {
  const settings = rawSettings && Array.isArray(rawSettings.periods)
    ? rawSettings
    : normalizeGradingPeriodSettings(rawSettings || {});
  const stampedId = assignmentGradingPeriodId(assignment);

  if (stampedId) {
    const configured = settings.periods.find((period) => period.id === stampedId);
    if (configured) {
      return { ...configured, isFallback: false, isCurrent: configured.id === settings.currentPeriodId };
    }
    const stamped = normalizeGradingPeriod(assignment.gradingPeriod, settings.periods.length);
    if (stamped) {
      return { ...stamped, isFallback: false, isCurrent: stamped.id === settings.currentPeriodId };
    }
  }

  const current = settings.currentPeriodId
    ? settings.periods.find((period) => period.id === settings.currentPeriodId)
    : null;
  const period = current || fallbackGradingPeriod(settings);
  return { ...period, isFallback: true, isCurrent: true };
};

/**
 * The write a teacher's "move to marking period" action applies.
 *
 * `null` clears the stamp and returns the assignment to the default current
 * bucket rather than deleting it from every list — an unstamped assignment is
 * always visible, which is the whole point of the fallback.
 */
export const gradingPeriodAssignmentPatch = (period = null) => {
  const normalized = period ? normalizeGradingPeriod(period, 0) : null;
  if (!normalized) return { gradingPeriod: null };
  return {
    gradingPeriod: {
      id: normalized.id,
      label: normalized.label,
      order: normalized.order,
    },
  };
};

/**
 * Assignments grouped into the periods a student reads them in.
 *
 * Current first and open, everything else after it and collapsed. Archived
 * periods sort last but are still returned with all of their assignments: a
 * closed marking period is a period you cannot add work to, not one whose
 * grades vanish.
 */
export const groupAssignmentsByGradingPeriod = (assignments = [], rawSettings = null) => {
  const settings = normalizeGradingPeriodSettings(rawSettings || {});
  const groups = new Map();

  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const period = resolveAssignmentGradingPeriod(assignment, settings);
    if (!groups.has(period.id)) {
      groups.set(period.id, { period, assignments: [] });
    }
    groups.get(period.id).assignments.push(assignment);
  });

  return [...groups.values()].sort((a, b) => {
    if (a.period.isCurrent !== b.period.isCurrent) return a.period.isCurrent ? -1 : 1;
    if (a.period.archived !== b.period.archived) return a.period.archived ? 1 : -1;
    return b.period.order - a.period.order || a.period.label.localeCompare(b.period.label);
  });
};

export default {
  GRADING_PERIOD_SETTINGS_DOC,
  FALLBACK_GRADING_PERIOD_ID,
  assignmentGradingPeriodId,
  groupAssignmentsByGradingPeriod,
  gradingPeriodAssignmentPatch,
  normalizeGradingPeriodSettings,
  resolveAssignmentGradingPeriod,
};
