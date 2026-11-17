/*
 * THIS WEEK'S PATH COMPLETION ON A TEACHER'S SCREEN (teacher kit).
 *
 * App's own effect did this, in every student's first load: which class the
 * screen shows, that class's week, the callable, and what the screen holds
 * once it answers. Only a teacher's screens run it, so it loads with the
 * teacher kit (./teacherKit.js). When to ask (the minute, the page's
 * visibility, the answer the screen already holds) is the refresh's:
 * platform/path/weeklyPathProgressRefresh.js.
 *
 * App hands it its own Path client (`path`: the callable's client, a class's
 * stored weekly settings, the week key) rather than this module importing
 * them: shared with the kit, those modules were split into more files of the
 * student's first load, which grew it by more than this removes.
 */
import { weeklyPathProgressClassId } from '../../platform/path/weeklyPathProgressRefresh.js';

/**
 * One screen's weekly Path completion, kept by `refresh` (one per page). The
 * screen is App's teacher tab, its chosen class and the teacher's classes;
 * `path` is { completions, weeklyGoalFor, weekKeyFor } (platform/path/
 * pathStore.js fetchTeacherWeeklyPathCompletions and
 * storedWeeklyGoalForClassContext, weeklyPathGoal.js weekKeyFor); `set` is
 * App's state: completions, goals, truncated, loadedFor, loading. Returns
 * stop(), or nothing when the screen shows no class's completion.
 */
export const followWeeklyPathProgress = (refresh, { uid, teacherTab, activeClassId = null, classes = [], weeklyGoalsByClass, path, set }) => {
  // Home needs this as much as the Weekly Path tab does: the needs-attention
  // queue reports who is behind, and reporting that from data that has not
  // loaded yet would tell a teacher the whole class is behind every time they
  // open the page.
  if (!['weeklyPath', 'home', 'grades'].includes(teacherTab)) return undefined;
  // A teacher with no class at all holds nothing.
  if (!activeClassId && !classes[0]?.classId) {
    set.completions({});
    set.goals({});
    set.loadedFor(null);
    return undefined;
  }
  // Home or Grades with no class chosen shows no class's completion.
  const classId = weeklyPathProgressClassId({ teacherTab, activeClassId, classes });
  if (!classId) return undefined;
  const classRecord = classes.find((entry) => entry.classId === classId) || null;
  const config = path.weeklyGoalFor(weeklyGoalsByClass, {
    classId,
    classPeriod: classRecord?.period || '',
  }) || {};
  const weekStartsOn = config.weekStartsOn || 1;
  return refresh.watch({
    id: `${uid}|${classId}`,
    // The week as of each call, not App's UI clock: Monday's rollover is right
    // without tying a Cloud Function call to the display tick.
    period: () => path.weekKeyFor(Date.now(), weekStartsOn),
    fetch: (weekKey) => path.completions({ classId, weekKey }),
    apply: (result) => {
      set.completions(result?.byStudentId || {});
      set.goals(result?.goalsByStudentId || {});
      set.truncated(result?.truncated === true);
      set.loadedFor(classId);
    },
    fail: (error) => {
      console.error('Could not load Weekly Path progress:', error);
      // A failed read is NOT zero completions. Leaving `loadedFor` unset keeps
      // every completion alert out of the queue rather than announcing that
      // nobody did any work.
      set.completions({});
      set.goals({});
      set.truncated(false);
      set.loadedFor(null);
    },
    loading: set.loading,
  });
};
