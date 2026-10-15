/*
 * WHICH GOOGLE CLASSROOM TOPIC A POST LANDS IN.
 *
 * Classroom's Classwork page is organised by topic ("module section"), and
 * every MathMaster post used to land in a topic named after the assignment's
 * library folder — "Module 2 • Topic 2". That groups a unit well, but a
 * student looking for "the assignment from Tuesday" has to open every module.
 * A teacher can now choose to name topics by week instead:
 *
 *   module      Module 2 • Topic 2                       (the folder; unchanged default)
 *   week        Week of Oct 12
 *   weekModule  Week of Oct 12 • Module 2 • Topic 2
 *
 * THE WEEK IS THE WEEK STUDENTS FIRST SEE THE POST: a scheduled release
 * (`releaseAt`) when there is one, otherwise the moment it is published. That
 * is the week a student remembers doing the work, and it never changes after
 * posting — a due date can move, and a topic picked from it would leave the
 * post filed under the wrong week (the Classroom patch MathMaster uses cannot
 * move a post between topics).
 *
 * Weeks start on Monday, as the weekly Math Path week does
 * (functions/shared/weeklyPathGrade.mjs weekKeyFor), and are read in the
 * teacher's own time zone — this runs in the teacher's browser, and a Sunday
 * 11 pm release is Sunday to the class, whatever UTC says. Classroom shows the
 * newest topic first, so the current week sits at the top of Classwork.
 *
 * The choice is a per-browser preference (localStorage): it changes only the
 * topic NAME sent with a publish, which the teacher can still edit by hand in
 * Classroom Manager. Nothing about grading, the publication record or
 * duplicate protection reads it.
 */

export const CLASSROOM_TOPIC_STYLES = Object.freeze(['module', 'week', 'weekModule']);
export const DEFAULT_CLASSROOM_TOPIC_STYLE = 'module';
export const CLASSROOM_TOPIC_STYLE_STORAGE_KEY = 'mathmaster:classroomTopicStyle';

export const CLASSROOM_TOPIC_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'module', label: 'By module (from the library folder)' }),
  Object.freeze({ id: 'week', label: 'By week — “Week of Oct 12”' }),
  Object.freeze({ id: 'weekModule', label: 'By week and module — “Week of Oct 12 • Module 2 • Topic 2”' }),
]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clean = (value) => String(value ?? '').trim();

export const normalizeClassroomTopicStyle = (value) => (
  CLASSROOM_TOPIC_STYLES.includes(value) ? value : DEFAULT_CLASSROOM_TOPIC_STYLE
);

/** A date from the shapes assignments carry: ISO string, millis, Date, Firestore Timestamp. */
export const classroomDateValue = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value?.toDate === 'function') return classroomDateValue(value.toDate());
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** Local midnight on the Monday (by default) that starts `date`'s week. */
export const classroomWeekStart = (date, { weekStartsOn = 1 } = {}) => {
  const day = classroomDateValue(date);
  if (!day) return null;
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7));
  return start;
};

/** "Week of Oct 12" for any moment in that week. */
export const weekOfTopicLabel = (date, options = {}) => {
  const start = classroomWeekStart(date, options);
  return start ? `Week of ${MONTHS[start.getMonth()]} ${start.getDate()}` : '';
};

/** The moment students first see the post: its scheduled release, else now. */
export const classroomPostWeekDate = (assignment = {}, now = new Date()) => (
  classroomDateValue(assignment?.releaseAt) || classroomDateValue(now) || new Date()
);

/**
 * The topic name to publish with.
 *
 *   moduleTopic  the folder-derived name the teacher would otherwise get
 *                (classroomPackage.topic.name, or suggestClassroomTopic)
 */
export const classroomTopicNameFor = ({ style, moduleTopic = '', assignment = {}, now = new Date() } = {}) => {
  const resolved = normalizeClassroomTopicStyle(style);
  const module = clean(moduleTopic);
  if (resolved === 'module') return module;
  const week = weekOfTopicLabel(classroomPostWeekDate(assignment, now));
  if (resolved === 'week') return week;
  return module ? `${week} • ${module}` : week;
};

const storage = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const readClassroomTopicStyle = () => {
  try {
    return normalizeClassroomTopicStyle(storage()?.getItem(CLASSROOM_TOPIC_STYLE_STORAGE_KEY));
  } catch {
    return DEFAULT_CLASSROOM_TOPIC_STYLE;
  }
};

export const saveClassroomTopicStyle = (style) => {
  try {
    storage()?.setItem(CLASSROOM_TOPIC_STYLE_STORAGE_KEY, normalizeClassroomTopicStyle(style));
  } catch {
    // A blocked or full storage only loses the remembered choice.
  }
};

/**
 * The topic an automatic publish uses: the assignment's own folder topic,
 * renamed by the teacher's saved style. With no folder topic and the module
 * style there is no topic, exactly as before.
 */
export const automaticClassroomTopicName = (assignment = {}, { style = readClassroomTopicStyle(), now = new Date() } = {}) => (
  classroomTopicNameFor({ style, moduleTopic: assignment?.classroomPackage?.topic?.name, assignment, now })
);
