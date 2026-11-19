/*
 * A TEACHER'S VIEW OF MY MATH PATH: EACH STUDENT'S COURSE LEVEL AND LEARNING PROFILE, THE WEEK'S ROSTER AND GOALS, AND THE WEEK'S PROGRESS, LIVE.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitTeacherLiveData.test.mjs holds the two sides to the same names in the same order). App owns the state these fill. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useMemo } from 'react';
import { assignmentIsForStudent } from '../../assignmentLifecycle';
import { TEXAS_MATH_ACTIVE_COURSES, getTexasStandardsForCourse } from '../../texasStandards.js';
import { collectStudentEvidence } from '../../masteryEngine.js';
import { buildStudentPathOptions } from '../../platform/path/studentPathOptions.js';
import { compareStudentsByName, formatStudentName } from '../../platform/studentName';
import { evidenceRowsToEvents } from '../../platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from '../../platform/profile/studentLearningProfile.js';
import { adaptLegacyMasteryToPhase5 } from '../../platform/profile/legacyMasteryAdapter.js';
import {
  fetchTeacherWeeklyPathCompletions, overridesForClassContext, storedPacingForClassContext,
  storedWeeklyGoalForClassContext,
} from '../../platform/path/pathStore.js';
import { buildWeeklyPathPlan } from '../../platform/path/weeklyPathPlan.js';
import { buildWeeklyGoal, weekKeyFor, weekStartsOnFor, weeklyPlanClassInputs } from '../../platform/path/weeklyPathGoal.js';
import { resolveStudentCourseContext, studentsInClass } from '../../../functions/shared/classModel.mjs';

export function useTeacherLearningPaths(
  user, teacherPreviewRuntimeActive, teacherTab, classes, activeClass, assignments, allStudents,
  teacherStudentDataMode, teacherKit, pacingByClass, skillOverrides, weeklyGoalsByClass,
  setWeeklyPathCompletionsByStudent, setWeeklyPathGoalSnapshotsByStudent, weeklyPathGoalSnapshotsByStudent,
  setWeeklyPathTruncated, setWeeklyPathProgressLoadedFor, setWeeklyPathProgressLoading, now, courseProfiles,
  teacherMasteryProfilesByStudentId, classesById,
) {
  // Course level per student, resolved through the shared class resolver. Passed
  // to the CCMR screen for DISPLAY only — enrollment says which room a student
  // sits in, not what they can do.
  const courseLevelByStudentId = useMemo(() => Object.fromEntries(allStudents.map((student) => [
    student.id,
    resolveStudentCourseContext({ student, classesById, courseProfiles }).courseLevel,
  ])), [allStudents, classesById, courseProfiles]);

  // The standards a teacher might type a code for. Both active courses, because
  // a teacher searching "A2.4F" should find it without first switching course.
  const searchableStandards = useMemo(() => (
    TEXAS_MATH_ACTIVE_COURSES.flatMap((course) => getTexasStandardsForCourse(course.id))
  ), []);

  const teacherLearningProfiles = useMemo(() => {
    if (teacherStudentDataMode !== 'full') return {};
    if (!allStudents.length) return {};
    return Object.fromEntries(allStudents.map((student) => {
      const rows = collectStudentEvidence({ student, assignments });
      const { events } = evidenceRowsToEvents(rows);
      const legacyProfile = teacherMasteryProfilesByStudentId[student.id] || null;
      return [student.id, buildStudentLearningProfile({
        // The class is authoritative. A period-keyed course lookup answers with
        // whichever class was written last when two share a period, so one of
        // those two classes' students get profiled against the wrong course.
        courseId: resolveStudentCourseContext({ student, classesById, courseProfiles }).courseId,
        evidenceEvents: events,
        // Without per-TEKS mastery, course mastery is null and the performance
        // projection reads "Establishing Baseline" forever, however much work
        // the student has done. The legacy summaries already carry it.
        masteryProfilesByTeks: legacyProfile
          ? adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows: rows })
          : {},
      })];
    }));
  }, [allStudents, assignments, courseProfiles, classesById, teacherMasteryProfilesByStudentId, teacherStudentDataMode]);

  // The students in the class the Weekly Path screen is looking at.
  const teacherWeeklyRoster = useMemo(() => {
    if (!['weeklyPath', 'grades'].includes(teacherTab)) return [];
    const activeId = activeClass.classId || classes[0]?.classId || null;
    if (!activeId) return [];
    return studentsInClass({ students: allStudents, classes, classId: activeId })
      .map((student) => ({ ...student, name: formatStudentName(student) }))
      // Named students by last, first, id; students with no name on file last.
      .sort(compareStudentsByName);
  }, [allStudents, classes, activeClass.classId, teacherTab]);

  const teacherWeeklyGoalsByStudent = useMemo(() => {
    if (!['weeklyPath', 'grades'].includes(teacherTab)) return {};
    const activeId = activeClass.classId || classes[0]?.classId || null;
    const classRecord = classes.find((entry) => entry.classId === activeId) || null;
    if (!classRecord) return {};
    const honors = String(classRecord.courseLevel || '').toLowerCase() === 'honors';
    const courseId = classRecord.course || courseProfiles?.[classRecord.period]?.course || 'algebra1';
    const config = storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: activeId,
      classPeriod: classRecord.period,
    }) || {};
    const pacing = storedPacingForClassContext(pacingByClass, {
      classId: activeId,
      classPeriod: classRecord.period,
    });
    const teacherOverrides = overridesForClassContext(skillOverrides, {
      classId: activeId,
      classPeriod: classRecord.period,
    });

    return Object.fromEntries(teacherWeeklyRoster.map((student) => {
      const studentAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: student.classId || classRecord.classId, classPeriod: student.classPeriod || classRecord.period }));
      const pathOptions = buildStudentPathOptions({
        student,
        assignments: studentAssignments,
        courseId,
        pacing,
        teacherOverrides,
        nowValue: now,
      });
      const plan = buildWeeklyPathPlan({
        options: pathOptions,
        courseId,
        profile: teacherLearningProfiles[student.id] || null,
        ...weeklyPlanClassInputs({ config, honors }),
        now,
      });
      const proposedGoal = buildWeeklyGoal({
        plan,
        config,
        honors,
        studentId: student.id,
        courseId,
        now,
      });
      const frozen = weeklyPathGoalSnapshotsByStudent[student.id] || null;
      const goal = frozen ? {
        ...proposedGoal,
        ...frozen,
        settings: proposedGoal.settings,
        profile: proposedGoal.profile,
        suppressed: proposedGoal.suppressed,
      } : { ...proposedGoal, assignmentState: 'proposed' };
      return [student.id, goal];
    }));
  }, [activeClass.classId, classes, courseProfiles, weeklyGoalsByClass, pacingByClass, skillOverrides, teacherWeeklyRoster, assignments, teacherLearningProfiles, weeklyPathGoalSnapshotsByStudent, now, teacherTab]);

  // This week's Path completion for the class the screen shows, kept fresh
  // while a teacher is on it, by the teacher kit (app/teacher/
  // weeklyPathProgress.js; when to ask: platform/path/
  // weeklyPathProgressRefresh.js): never for a class no screen shows, not
  // again for an entry within the minute of the answer the screen holds,
  // nothing while the page is hidden, and asked again a minute after it was
  // last asked.
  const weeklyPathProgress = useMemo(() => (teacherKit ? teacherKit.createWeeklyPathProgressRefresh() : null), [teacherKit]);
  useEffect(() => () => weeklyPathProgress?.forget(), [weeklyPathProgress, user?.uid]);
  useEffect(() => {
    if (user?.role !== 'teacher' || teacherPreviewRuntimeActive || !weeklyPathProgress) return undefined;
    return teacherKit.followWeeklyPathProgress(weeklyPathProgress, {
      uid: user.uid,
      teacherTab,
      activeClassId: activeClass.classId,
      classes,
      weeklyGoalsByClass,
      path: { completions: fetchTeacherWeeklyPathCompletions, weeklyGoalFor: storedWeeklyGoalForClassContext, weekKeyFor, weekStartsOnFor },
      set: {
        completions: setWeeklyPathCompletionsByStudent,
        goals: setWeeklyPathGoalSnapshotsByStudent,
        truncated: setWeeklyPathTruncated,
        loadedFor: setWeeklyPathProgressLoadedFor,
        loading: setWeeklyPathProgressLoading,
      },
    });
  }, [user?.role, user?.uid, teacherTab, activeClass.classId, classes, weeklyGoalsByClass, teacherPreviewRuntimeActive, weeklyPathProgress, teacherKit]);
  return [
    courseLevelByStudentId, searchableStandards, teacherLearningProfiles, teacherWeeklyRoster,
    teacherWeeklyGoalsByStudent,
  ];
}
