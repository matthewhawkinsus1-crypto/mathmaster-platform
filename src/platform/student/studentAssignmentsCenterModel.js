import { BUCKET } from '../../studentDashboardModel.js';
import { studentDueDates } from '../../assignmentLifecycle.js';
import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { findGradeCenterEntry } from './studentGradeCenterModel.js';
import { normalizeGradingPeriodSettings } from './gradingPeriods.js';
import { TRY_AGAIN_LABEL } from './studentResultNextStep.js';

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
  /*
   * The id stays 'practice' (routes, saved tabs and tests key on it), but the
   * WORD is not "Practice": in student copy "Practice" means only the lesson's
   * Practice section. Closed work is something a student can try again for no
   * credit, and the tab says exactly that.
   */
  [ASSIGNMENT_CATEGORY.PRACTICE]: 'Closed — try again',
});

export const ASSIGNMENT_CATEGORY_HINT = Object.freeze({
  [ASSIGNMENT_CATEGORY.ACTIVE]: 'Started, due today, or past due — all still open and still counting.',
  [ASSIGNMENT_CATEGORY.UPCOMING]: 'Assigned and due later, or not open to you yet.',
  [ASSIGNMENT_CATEGORY.COMPLETED]: 'Work you finished, and closed work with a recorded result.',
  [ASSIGNMENT_CATEGORY.PRACTICE]: 'Past the final deadline. You can try these again; they no longer change your grade.',
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

// The no-credit retry of closed work is TRY_AGAIN_LABEL (one wording, shared
// with the result page). Never "Practice" — that word belongs to the lesson's
// Practice section.
export { TRY_AGAIN_LABEL };
export const RECOVERY_LABEL = 'Open Recovery';

/**
 * What this assignment offers a student right now.
 *
 * THE ONE "TODAY" RULE DECIDES, NOT THIS FILE.
 *
 * The dashboard entry already says whether the button would land on work the
 * student can do this minute (`actionable`), where it lands
 * (`nextQuestionIndex`), whether the remaining work is a Recovery taken from
 * the result page (`action: 'recovery'`), what a waiting lesson is waiting for
 * (`waitText`), and whether the work is finished or excused. A row that
 * re-derived any of those from `entry.disabled` or the lifecycle offered
 * "Start" on a lesson whose only open part was locked — the student pressed it
 * and landed on "Nothing open right now".
 */
export const resolveActions = ({ entry = {}, gradeEntry = null } = {}) => {
  const lifecycle = entry.lifecycle || {};
  const attempted = Number(gradeEntry?.overall?.attempted) || Number(entry.questionsAttempted) || 0;
  const closed = lifecycle.isPracticeOnly === true;
  const excused = entry.excused === true || gradeEntry?.status === 'excused';
  const finished = entry.finished === true;
  const actionable = entry.actionable === true && !excused && !closed;
  const recovery = actionable && entry.action === 'recovery';
  const canContinue = actionable && !recovery;
  // Waiting: unfinished, still open, and nothing in it can be done this
  // minute. The row says what it is waiting for instead of offering a button.
  const waiting = !finished && !excused && !closed && !actionable;

  return {
    excused,
    finished,
    // "Closed — try again": past the final deadline. Excused work is not
    // offered as a retry; it asks nothing of the student.
    practiceAvailable: closed && !excused,
    canContinue,
    continueLabel: attempted > 0 ? 'Continue' : 'Start',
    // Start/Continue lands here — the first unfinished question open now.
    continueQuestionIndex: canContinue && Number.isInteger(entry.nextQuestionIndex) ? entry.nextQuestionIndex : null,
    // A Recovery lives on the result page, so its button opens the result.
    canRecover: recovery,
    recoveryLabel: RECOVERY_LABEL,
    waitText: waiting ? (entry.waitText || null) : null,
    // Results are worth offering only when there is something recorded to
    // look at: evidence, a closed record, an excusal, or a finished lesson.
    // A not-started open row has nothing to show yet. The Recovery button
    // already opens the result page, so it is not offered twice.
    canViewResults: !recovery && (attempted > 0 || closed || excused || finished),
    canPractice: closed && !excused,
    practiceLabel: TRY_AGAIN_LABEL,
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
  /*
   * A Test Cycle is ONE row here, never four.
   *
   * Review, Test, Corrections and Retest are stages of this one assignment, so
   * the Assignments Center shows one card and the card asks the server which
   * stage the student may enter. Reading the flag off the stored assessment
   * policy — rather than inferring it from section roles — is what stops a
   * plain assignment that happens to contain a review section from being
   * treated as an assessment package.
   */
  const testCycle = isTestCycleAssignment(assignment);
  return {
    assignmentId: assignment.id,
    isTestCycle: testCycle,
    title: assignment.title || 'MathMaster assignment',
    // Read off the dashboard's lifecycle for this student, never the class
    // fields: an individualized due date or attendance extension is the date
    // this student actually has.
    ...studentDueDates(assignment, entry.lifecycle),
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
    status: gradeEntry?.status || (actions.excused ? 'excused' : null),
    statusLabel: gradeEntry?.statusLabel || (actions.excused ? 'Excused' : null),
    displayGrade: gradeEntry?.displayGrade ?? null,
    sections: gradeEntry?.sections || null,
    frozen: gradeEntry?.frozen === true,
    gradingPeriod: gradeEntry?.gradingPeriod || null,
    ...actions,
    // The stage machine owns what a Test Cycle offers, so the ordinary
    // Continue/Practice affordances are suppressed rather than competing
    // with it. Results stay reachable: a recorded grade is a recorded grade.
    //
    // The row says WHERE the student is in the cycle — "Test ready",
    // "Corrections · 1 of 3", "Test submitted" — from the server-written
    // projection, instead of a grade status that read "Not Started" in the
    // middle of a Test and "Graded" while corrections were still owed. The
    // button names the step; past the final date it is still offered, because
    // a secure Test is never practice.
    ...(testCycle ? {
      canContinue: entry.testCycle ? entry.testCycle.key !== 'opensLater' : actions.canContinue,
      canPractice: false,
      canRecover: false,
      waitText: null,
      // The card asks the server which stage is open; no question index.
      continueQuestionIndex: null,
      continueLabel: entry.testCycle?.actionLabel || 'Open assessment',
      ...(entry.testCycle ? {
        statusLabel: entry.testCycle.label,
        status: {
          complete: 'completed', pending: 'pendingGrade', inProgress: 'inProgress', locked: 'locked', notStarted: 'notStarted',
        }[entry.testCycle.tone] || 'notStarted',
        testCycleDetail: entry.testCycle.detail,
        testCycleKey: entry.testCycle.key,
      } : {}),
    } : {}),
    entry,
    gradeEntry: gradeEntry || null,
  };
};

const dueTime = (row) => {
  const time = Date.parse(row?.dueAt || '');
  return Number.isFinite(time) ? time : null;
};
// Rows with no due date sort last in either direction.
const byDue = (direction) => (a, b) => {
  const left = dueTime(a);
  const right = dueTime(b);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction * (left - right);
};
const byMostRecentDue = byDue(-1);
const bySoonestDue = byDue(1);

/*
 * EACH TAB IS ORDERED FOR WHAT A STUDENT DOES WITH IT.
 *
 * Upcoming is a to-do list: soonest due first, or the thing due tomorrow sits
 * under the thing due next month. Active puts late work first (it is open,
 * still counts, and gets worse every day), then soonest due. Completed and
 * Closed are records a student searches backwards through: most recent first.
 */
export const sortRowsForCategory = (categoryId, rows = []) => {
  const sorted = [...list(rows)];
  if (categoryId === ASSIGNMENT_CATEGORY.UPCOMING) return sorted.sort(bySoonestDue);
  if (categoryId === ASSIGNMENT_CATEGORY.ACTIVE) {
    return sorted.sort((a, b) => {
      const lateA = a?.lifecycle?.isLate === true ? 0 : 1;
      const lateB = b?.lifecycle?.isLate === true ? 0 : 1;
      return (lateA - lateB) || bySoonestDue(a, b);
    });
  }
  return sorted.sort(byMostRecentDue);
};

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
    entries: sortRowsForCategory(id, periodRows.filter((row) => row.categories.includes(id))),
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
