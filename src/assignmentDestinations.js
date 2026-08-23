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
  const ids = Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds : [];
  const periods = Array.isArray(assignment?.assignedClassPeriods) ? assignment.assignedClassPeriods : [];
  return ids.length === 0 && periods.length === 0;
};

/**
 * Is this a save-to-library action or a create-and-assign action?
 * One predicate, so the button label, the validation and the write path cannot
 * disagree about which one is happening.
 */
export const resolveCreationMode = ({ assignedClassIds = [], assignedClassPeriods = [] } = {}) => (
  (Array.isArray(assignedClassIds) ? assignedClassIds : []).length === 0
    && (Array.isArray(assignedClassPeriods) ? assignedClassPeriods : []).length === 0
    ? 'library'
    : 'assign'
);

export const CREATION_MODE_LABELS = Object.freeze({
  library: { action: 'Save to Library', hint: 'No classes selected. The assignment is saved unassigned, with no due date.' },
  assign: { action: 'Create & Assign', hint: 'Students receive this, so a due date is required.' },
});

/**
 * Group the selected periods by course and rigor. One group means one document;
 * several means a rigor split.
 *
 * Returns [] for a library save, which is the correct answer rather than an
 * error: there are no destinations because nobody has been given it yet.
 */
export const buildDestinationGroups = ({ assignedClassPeriods = [], courseProfiles = {} } = {}) => {
  const periods = Array.isArray(assignedClassPeriods) ? assignedClassPeriods : [];
  const groups = periods.reduce((accumulator, period) => {
    const profile = courseProfiles?.[period] || { course: 'algebra1', courseLevel: 'standard' };
    const course = profile.course || 'algebra1';
    const courseLevel = profile.courseLevel === 'honors' ? 'honors' : 'standard';
    const key = `${course}:${courseLevel}`;
    if (!accumulator[key]) accumulator[key] = { key, course, courseLevel, periods: [] };
    accumulator[key].periods.push(period);
    return accumulator;
  }, {});
  return Object.values(groups);
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
