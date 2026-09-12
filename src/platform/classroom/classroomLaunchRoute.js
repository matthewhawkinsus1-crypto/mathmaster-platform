import {
  getAssignmentLifecycle,
  getIncludedQuestionIndices,
} from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from '../policies/activityPolicies.js';

const CLASSROOM_SECTION_KEYS = Object.freeze([
  'whole',
  'warmup',
  'classwork',
  'practice',
  'dol',
]);

const SECTION_LABELS = Object.freeze({
  whole: 'Whole assignment',
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
});

const clean = (value) => String(value ?? '').trim();

export function parseClassroomLaunchSearch(search = '') {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const assignmentId = clean(params.get('launch'));
  if (!assignmentId) return null;

  const rawSection = clean(params.get('classroomSection')).toLowerCase();
  const sectionKey = rawSection || 'whole';
  if (!CLASSROOM_SECTION_KEYS.includes(sectionKey)) {
    throw new TypeError(`Unsupported Classroom section: ${rawSection || '(empty)'}`);
  }

  return {
    assignmentId,
    courseId: clean(params.get('classroomCourse')) || null,
    publicationId: clean(params.get('classroomPublication')) || null,
    sectionKey,
    isSectionLaunch: sectionKey !== 'whole',
  };
}

export function classroomLaunchTarget({
  assignment,
  launch,
  nowValue = Date.now(),
} = {}) {
  if (!launch?.assignmentId) {
    throw new TypeError('Classroom launch assignmentId is required.');
  }
  const assignmentId = clean(assignment?.id);
  if (!assignmentId || assignmentId !== clean(launch.assignmentId)) {
    throw new TypeError('Classroom launch assignment does not match the loaded assignment.');
  }

  const sectionKey = clean(launch.sectionKey || 'whole').toLowerCase();
  if (!CLASSROOM_SECTION_KEYS.includes(sectionKey)) {
    throw new TypeError(`Unsupported Classroom section: ${sectionKey || '(empty)'}`);
  }

  const questions = getStoredAssignmentQuestions(assignment);
  const included = getIncludedQuestionIndices(assignment);
  const questionIndices = sectionKey === 'whole'
    ? included
    : included.filter((index) => (
      resolveQuestionActivityRole({ question: questions[index], assignment }) === sectionKey
    ));

  if (!questionIndices.length) {
    const label = SECTION_LABELS[sectionKey] || sectionKey;
    throw new TypeError(`This Classroom link has no included ${label} questions.`);
  }

  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
  const originIsSectionLaunch = sectionKey !== 'whole';

  /*
   * A CLOSED CLASSROOM LINK IS A RESULT LINK, WHATEVER IT POSTED.
   *
   * Google Classroom posts outlive the deadline. A student who taps one in
   * November for work that closed in September used to land on the work screen
   * with every control disabled — a dead end with their grade nowhere on it,
   * and no way back into MathMaster except the browser's Back button.
   *
   * The decision is the deadline, not the shape of the post. Split section
   * links already behaved this way; whole-assignment links were the gap, and a
   * whole-assignment link is the ordinary case.
   */
  const showFrozenReportFirst = lifecycle.isPracticeOnly;

  return {
    assignmentId,
    courseId: launch.courseId || null,
    publicationId: launch.publicationId || null,
    sectionKey,
    sectionLabel: SECTION_LABELS[sectionKey],
    originIsSectionLaunch,
    // App.jsx historically uses this flag to decide whether startAssignment()
    // should hard-filter the workspace to one section. During normal live work
    // a Classroom section link is only an entrance into the requested section;
    // students must still be able to move through the rest of the assignment
    // under the ordinary lifecycle/timer locks. Once the assignment is frozen,
    // the report's explicit “Practice this section” action remains section-only.
    // A frozen WHOLE-assignment link stays whole: there is no section to
    // confine practice to, so it must not inherit a section filter.
    isSectionLaunch: Boolean(showFrozenReportFirst && originIsSectionLaunch),
    questionIndices,
    questionIndex: questionIndices[0],
    lifecycleStatus: lifecycle.status,
    showFrozenReportFirst,
    practiceAvailable: showFrozenReportFirst,
  };
}

export { CLASSROOM_SECTION_KEYS };
