// Where an assignment actually lands, and in how many pieces.
//
// WHY THIS IS ITS OWN FILE. A teacher can now save an assignment to the library
// with no classes and no due date, and assign it later. That means the
// course/rigor split — the thing that decides whether one bundle becomes one
// assignment document or a Standard variant plus an Honors variant — has to run
// in two places: at first creation, and again when a library item is assigned.
//
// Two copies of that algorithm is the failure this file prevents. If they ever
// disagreed, a library item assigned to a mixed Standard/Honors set would
// produce differently-shaped documents from the same bundle created directly,
// and student records keyed by question index would attach to the wrong
// questions. The logic is pure and lives here; both callers use it.
//
// Deliberately NOT here: anything that touches Firestore. This file decides
// what should be written, never writes it.

export const LIBRARY = Object.freeze({
  // An assignment that exists but has not been given to anyone.
  status: 'library',
  label: 'Not assigned',
});

export const isLibraryAssignment = (assignment) => {
  const ids = Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds.filter(Boolean) : [];
  return ids.length === 0;
};

/**
 * Is this a save-to-library action or a create-and-assign action?
 * One predicate, so the button label, the validation and the write path cannot
 * disagree about which one is happening.
 */
export const resolveCreationMode = ({ assignedClassIds = [] } = {}) => (
  (Array.isArray(assignedClassIds) ? assignedClassIds.filter(Boolean) : []).length === 0
    ? 'library'
    : 'assign'
);

export const CREATION_MODE_LABELS = Object.freeze({
  library: { action: 'Save to Library', hint: 'No classes selected. The assignment is saved unassigned, with no due date.' },
  assign: { action: 'Create & Assign', hint: 'Students receive this, so a due date is required.' },
});

/**
 * Group selected class entities by course and rigor. Class IDs define audience;
 * the derived period list is carried only for bell-schedule timing/display.
 *
 * Returns [] for a library save. If a selected class ID no longer resolves to
 * an active class, fail closed rather than silently dropping part of the audience.
 */
export const buildDestinationGroups = ({ assignedClassIds = [], classes = [] } = {}) => {
  const ids = [...new Set((Array.isArray(assignedClassIds) ? assignedClassIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (!ids.length) return [];

  const activeClasses = (Array.isArray(classes) ? classes : [])
    .filter((entry) => entry?.classId && entry?.status !== 'archived');
  const byId = Object.fromEntries(activeClasses.map((entry) => [String(entry.classId), entry]));
  const missing = ids.filter((id) => !byId[id]);
  if (missing.length) {
    throw new Error('One or more selected MathMaster classes no longer exist or are archived. Refresh the class list and choose the classes again.');
  }

  const groups = ids.reduce((accumulator, classId) => {
    const classRecord = byId[classId];
    const course = classRecord.course || 'algebra1';
    const courseLevel = classRecord.courseLevel === 'honors' ? 'honors' : 'standard';
    const key = `${course}:${courseLevel}`;
    if (!accumulator[key]) {
      accumulator[key] = { key, course, courseLevel, classIds: [], periods: [], classNames: [] };
    }
    accumulator[key].classIds.push(classId);
    if (classRecord.period) accumulator[key].periods.push(classRecord.period);
    accumulator[key].classNames.push(classRecord.name || classRecord.period || classId);
    return accumulator;
  }, {});

  return Object.values(groups).map((group) => ({
    ...group,
    classIds: [...new Set(group.classIds)],
    periods: [...new Set(group.periods)],
    classNames: [...new Set(group.classNames)],
  }));
};

/**
 * The assignmentKey a destination writes under. A split has to qualify the key
 * per destination or the two variants collide; a single destination keeps the
 * author's key exactly as written.
 */
export const destinationAssignmentKey = ({ assignmentKey, destination, destinationCount }) => {
  if (!assignmentKey) return null;
  return destinationCount > 1 ? `${assignmentKey}:${destination.course}:${destination.courseLevel}` : assignmentKey;
};

/**
 * The date fields for a creation, given the mode.
 *
 * A library assignment carries null dates rather than invented ones. This is
 * the rule that makes "Not assigned" honest: a placeholder due date would show
 * up in every smart view and every student-facing countdown as though it meant
 * something.
 */
export const resolveAssignmentDates = ({ mode, dueValue, lateDueValue, releaseValue }) => {
  if (mode === 'library') {
    return { dueAt: null, lateDueAt: null, dueDate: null, releaseAt: null };
  }

  if (!dueValue) throw new Error('Set a due date before assigning this to students.');
  const due = new Date(dueValue);
  if (Number.isNaN(due.getTime())) throw new Error('The due date is not a valid date/time.');

  // A late window is now optional. Without one, work after the due date is
  // practice rather than a second graded chance, which is the policy the
  // lifecycle already implements — it just used to be mandatory to state it.
  let lateDueAt = null;
  if (lateDueValue) {
    const late = new Date(lateDueValue);
    if (Number.isNaN(late.getTime())) throw new Error('The late due date is not a valid date/time.');
    if (late <= due) throw new Error('The late due date must be later than the regular due date.');
    lateDueAt = late.toISOString();
  }

  let releaseAt = null;
  if (releaseValue) {
    const release = new Date(releaseValue);
    if (Number.isNaN(release.getTime())) throw new Error('The assignment releaseAt value is not a valid date/time.');
    if (release >= due) throw new Error('The release time must be before the due date, or students will never see it open.');
    releaseAt = release.toISOString();
  }

  return { dueAt: due.toISOString(), lateDueAt, dueDate: due.toISOString(), releaseAt };
};

/**
 * Guard for anything that reaches outside MathMaster. An unassigned assignment
 * has no audience and no due date, so there is nothing coherent to post.
 */
export const assertPublishable = (assignment) => {
  if (isLibraryAssignment(assignment)) {
    throw new Error('This assignment is not assigned to any class yet. Assign it to a class before posting it to Google Classroom.');
  }
  if (!assignment?.dueAt) {
    throw new Error('This assignment has no due date. Set one before posting it to Google Classroom.');
  }
  return true;
};

export const canPublishToClassroom = (assignment) => {
  try {
    return assertPublishable(assignment);
  } catch {
    return false;
  }
};
