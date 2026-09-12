import { BUCKET } from '../../studentDashboardModel.js';
import { findGradeCenterEntry } from './studentGradeCenterModel.js';
import { normalizeGradingPeriodSettings } from './gradingPeriods.js';

/*
 * THE ASSIGNMENTS CENTER — WHERE IS ALL MY WORK?
 *
 * Home answers "what should I do now?" and answers it by hiding things: the
 * Resume card's assignment, anything with a live DOL or Warm-Up, and finished
 * work folded into a collapsed group. Every one of those omissions is right for
 * a screen whose job is to pick the next action.
 *
 * They are all wrong for a student trying to find the investigation they
 * finished three weeks ago. That student was scrolling past six active cards
 * and giving up, which is the actual reported problem: "I can't find my older
 * work." So this is a separate surface with the opposite bias — nothing hidden,
 * everything findable, and search that reaches work no tab is currently showing.
 *
 * IT COMPUTES NOTHING ABOUT A GRADE OR A DEADLINE.
 *
 * Both halves arrive already built and are merged by assignment id:
 *
 *   dashboard.allEntries   lifecycle, bucket, progress, prerequisite locks
 *                          — buildStudentDashboardModel, same pass as Home
 *   gradeCenter.entries    status, released grade, section scores, marking
 *                          period — buildStudentGradeCenter, the canonical
 *                          grade source from the Grade Center work
 *
 * There is no third grade calculation here, and no second lifecycle rule. If a
 * number on this screen ever disagrees with Home or with Grades, it came from
 * one of those two models and not from this file.
 */

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

export const ASSIGNMENT_CATEGORY = Object.freeze({
  ACTIVE: 'active',
  UPCOMING: 'upcoming',
  COMPLETED: 'completed',
  PRACTICE: 'practice',
});

export const ASSIGNMENT_CATEGORY_ORDER = Object.freeze([
  ASSIGNMENT_CATEGORY.ACTIVE,
  ASSIGNMENT_CATEGORY.UPCOMING,
  ASSIGNMENT_CATEGORY.COMPLETED,
  ASSIGNMENT_CATEGORY.PRACTICE,
]);

export const ASSIGNMENT_CATEGORY_LABEL = Object.freeze({
  [ASSIGNMENT_CATEGORY.ACTIVE]: 'Active',
  [ASSIGNMENT_CATEGORY.UPCOMING]: 'Upcoming',
  [ASSIGNMENT_CATEGORY.COMPLETED]: 'Completed',
  [ASSIGNMENT_CATEGORY.PRACTICE]: 'Practice',
});

export const ASSIGNMENT_CATEGORY_HINT = Object.freeze({
  [ASSIGNMENT_CATEGORY.ACTIVE]: 'Started, due today, or past due — all still open and still counting.',
  [ASSIGNMENT_CATEGORY.UPCOMING]: 'Assigned and due later, or not open to you yet.',
  [ASSIGNMENT_CATEGORY.COMPLETED]: 'Work you finished, and closed work with a recorded result.',
  [ASSIGNMENT_CATEGORY.PRACTICE]: 'Past the final deadline. You can still practise these; they no longer change your grade.',
});

// The marking-period filter's "show me everything" option. Not a real period —
// a student looking for old work should not have to guess which term it was in.
export const ALL_PERIODS_ID = '__all__';

/*
 * WHICH TAB AN ASSIGNMENT LIVES IN.
 *
 * Read off the dashboard model's bucket, which is where the lifecycle rules
 * already live, with ONE deliberate addition: a closed assignment appears under
 * Practice as well as wherever its bucket puts it.
 *
 * That overlap is intentional and is the only non-partition in the screen.
 * "Completed" is the record of what a student did; "Practice" is a list of what
 * they can still work on. A closed assignment is honestly both, and forcing it
 * into one tab would mean either a finished assignment vanishing from Completed
 * or a practisable one being unreachable from Practice. The counts stay honest
 * because each tab counts what it actually shows.
 */
export const categoryForBucket = (bucket) => {
  if (bucket === BUCKET.COMPLETED) return ASSIGNMENT_CATEGORY.COMPLETED;
  if (bucket === BUCKET.PRACTICE) return ASSIGNMENT_CATEGORY.PRACTICE;
  if (bucket === BUCKET.COMING_UP) return ASSIGNMENT_CATEGORY.UPCOMING;
  return ASSIGNMENT_CATEGORY.ACTIVE;
};

export const categoriesForRow = ({ bucket, practiceAvailable }) => {
  const primary = categoryForBucket(bucket);
  const categories = [primary];
  if (practiceAvailable && primary !== ASSIGNMENT_CATEGORY.PRACTICE) {
    categories.push(ASSIGNMENT_CATEGORY.PRACTICE);
  }
  return categories;
};

/**
 * Does this title match what the student typed?
 *
 * Deliberately forgiving: case-insensitive, and every whitespace-separated term
 * must appear somewhere. A student hunting for old work half-remembers the
 * title — "domain range" has to find "Functions & Domain/Range".
 */
export const matchesAssignmentSearch = (row, query) => {
  const terms = clean(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [
    row?.title,
    row?.gradingPeriod?.label,
    row?.statusLabel,
  ].map((value) => clean(value).toLowerCase()).join(' ');
  return terms.every((term) => haystack.includes(term));
};

/**
 * What this assignment offers a student right now.
 *
 * Every flag is read from lifecycle/grade state that already exists; none of it
 * re-decides whether an assignment is open.
 */
const resolveActions = ({ entry, gradeEntry }) => {
  const lifecycle = entry.lifecycle || {};
  const attempted = Number(gradeEntry?.overall?.attempted) || Number(entry.questionsAttempted) || 0;
  const practiceAvailable = lifecycle.isPracticeOnly === true;

  return {
    practiceAvailable,
    // Locked work offers nothing to open; saying so is better than a button
    // that explains itself only after it is pressed.
    canContinue: !practiceAvailable && entry.disabled !== true,
    continueLabel: attempted > 0 ? 'Continue' : 'Start',
    // The result screen is worth offering whenever there is something recorded
    // to look at, or the assignment is closed and its result is the record.
    canViewResults: attempted > 0 || practiceAvailable,
    canPractice: practiceAvailable,
  };
};

/**
 * One row: what the student sees for one assignment.
 *
 * `entry` is the dashboard model's entry, `gradeEntry` the Grade Center's. Both
 * are kept on the row so a caller can reach anything either model computed
 * without this function having to forward every field by hand.
 */
export const buildAssignmentRow = ({ entry, gradeEntry }) => {
  const assignment = entry.assignment || {};
  const actions = resolveActions({ entry, gradeEntry });
  return {
    assignmentId: assignment.id,
    title: assignment.title || 'MathMaster assignment',
    dueAt: assignment.dueAt || assignment.dueDate || null,
    lateDueAt: assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate || null,
    lifecycle: entry.lifecycle,
    bucket: entry.bucket,
    categories: categoriesForRow({ bucket: entry.bucket, practiceAvailable: actions.practiceAvailable }),
    questionsTotal: entry.questionsTotal,
    questionsDone: entry.questionsDone,
    questionsAttempted: entry.questionsAttempted,
    disabled: entry.disabled === true,
    // Status, grade and section scores come from the Grade Center entry and are
    // never recomputed. A closed assignment with no grade entry (removed from
    // the roster, say) still renders — it simply has no status word to show.
    status: gradeEntry?.status || null,
    statusLabel: gradeEntry?.statusLabel || null,
    displayGrade: gradeEntry?.displayGrade ?? null,
    sections: gradeEntry?.sections || null,
    frozen: gradeEntry?.frozen === true,
    gradingPeriod: gradeEntry?.gradingPeriod || null,
    ...actions,
    entry,
    gradeEntry: gradeEntry || null,
  };
};

const byMostRecentDue = (a, b) => String(b.dueAt || '').localeCompare(String(a.dueAt || ''));

/**
 * Everything the Assignments Center renders.
 *
 * `search` and `periodId` are the student's current filter choices, passed in
 * rather than held here, so the component owns its input state and this stays
 * pure and testable.
 */
export const buildStudentAssignmentsCenter = ({
  dashboard = null,
  gradeCenter = null,
  gradingPeriodSettings = null,
  search = '',
  periodId = null,
  category = ASSIGNMENT_CATEGORY.ACTIVE,
} = {}) => {
  const settings = normalizeGradingPeriodSettings(gradingPeriodSettings || {});
  const rows = list(dashboard?.allEntries)
    .map((entry) => buildAssignmentRow({
      entry,
      gradeEntry: findGradeCenterEntry(gradeCenter, entry?.assignment?.id),
    }))
    .sort(byMostRecentDue);

  // Marking periods come from the Grade Center's own grouping, so the filter
  // offers exactly the periods the Grade Center would show — including archived
  // ones, which stay selectable because a closed term is where old work is.
  const periodOptions = list(gradeCenter?.periodGroups).map((group) => ({
    id: group.period.id,
    label: group.period.label,
    archived: group.period.archived === true,
    isCurrent: group.period.isCurrent === true,
    count: rows.filter((row) => row.gradingPeriod?.id === group.period.id).length,
  }));

  const currentPeriodId = gradeCenter?.currentPeriod?.id
    || periodOptions.find((option) => option.isCurrent)?.id
    || null;
  const requestedPeriodId = clean(periodId);
  const knownPeriod = requestedPeriodId === ALL_PERIODS_ID
    || periodOptions.some((option) => option.id === requestedPeriodId);
  // Current marking period by default, as the brief asks — but a period that no
  // longer exists must not silently empty the screen.
  const activePeriodId = knownPeriod ? requestedPeriodId : (currentPeriodId || ALL_PERIODS_ID);

  const inActivePeriod = (row) => (
    activePeriodId === ALL_PERIODS_ID || row.gradingPeriod?.id === activePeriodId
  );

  const periodRows = rows.filter(inActivePeriod);
  const categories = ASSIGNMENT_CATEGORY_ORDER.map((id) => ({
    id,
    label: ASSIGNMENT_CATEGORY_LABEL[id],
    hint: ASSIGNMENT_CATEGORY_HINT[id],
    entries: periodRows.filter((row) => row.categories.includes(id)),
  })).map((group) => ({ ...group, count: group.entries.length }));

  const requestedCategory = clean(category);
  const activeCategory = ASSIGNMENT_CATEGORY_ORDER.includes(requestedCategory)
    ? requestedCategory
    : ASSIGNMENT_CATEGORY.ACTIVE;

  /*
   * SEARCH IGNORES THE TABS AND THE PERIOD FILTER, ON PURPOSE.
   *
   * A student searching for a finished assignment is almost never already
   * standing in the tab and term that contains it — if they were, they would
   * have seen it. Scoping search to the current view is how a search box
   * truthfully reports "no results" for something the student is looking at the
   * app to find.
   */
  const searchQuery = clean(search);
  const isSearching = searchQuery.length > 0;
  const searchResults = isSearching
    ? rows.filter((row) => matchesAssignmentSearch(row, searchQuery))
    : null;

  return {
    rows,
    periodOptions,
    currentPeriodId,
    activePeriodId,
    categories,
    activeCategory,
    searchQuery,
    isSearching,
    searchResults,
    // What the screen actually lists, so the component never re-derives it.
    visibleEntries: isSearching
      ? searchResults
      : (categories.find((group) => group.id === activeCategory)?.entries || []),
    settings,
    // A complete count for the header, independent of every filter — it is the
    // sentence that tells a student nothing is being hidden from them.
    totalCount: rows.length,
  };
};

export default buildStudentAssignmentsCenter;
