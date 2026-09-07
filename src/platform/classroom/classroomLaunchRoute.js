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
  const showFrozenReportFirst = Boolean(launch.isSectionLaunch && lifecycle.isPracticeOnly);

  return {
    assignmentId,
    courseId: launch.courseId || null,
    publicationId: launch.publicationId || null,
    sectionKey,
    sectionLabel: SECTION_LABELS[sectionKey],
    isSectionLaunch: sectionKey !== 'whole',
    questionIndices,
    questionIndex: questionIndices[0],
    lifecycleStatus: lifecycle.status,
    showFrozenReportFirst,
    practiceAvailable: showFrozenReportFirst,
  };
}

export { CLASSROOM_SECTION_KEYS };
