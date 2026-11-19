/*
 * WHAT A TEACHER'S ANALYTICS AND STUDENT PROFILE DRAWER READ: THE STUDENTS IN VIEW, THE WEEK'S PATH, WHO NEEDS ATTENTION, AND ONE STUDENT'S PROFILE, HISTORY AND PLAN.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitTeacherLiveData.test.mjs holds the two sides to the same names in the same order). App owns the state these fill. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { assignmentIsForStudent } from '../../assignmentLifecycle';
import { normalizeStudentProfile } from '../../studentSupport';
import { buildStudentMasteryProfile, collectStudentEvidence } from '../../masteryEngine.js';
import { buildStudentPathOptions } from '../../platform/path/studentPathOptions.js';
import { CLASS_SCOPED_TABS } from '../screenScopes.js';
import { formatStudentName } from '../../platform/studentName';
import { evidenceRowsToEvents } from '../../platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from '../../platform/profile/studentLearningProfile.js';
import { adaptLegacyMasteryToPhase5 } from '../../platform/profile/legacyMasteryAdapter.js';
import { overridesForClassContext, storedPacingForClassContext, storedWeeklyGoalForClassContext } from '../../platform/path/pathStore.js';
import { buildWeeklyPathPlan } from '../../platform/path/weeklyPathPlan.js';
import { buildTeacherWeeklyView, dueAtFor, weekKeyFor, weekStartsOnFor, weeklyPlanClassInputs } from '../../platform/path/weeklyPathGoal.js';
import { resolveStudentCourseContext, studentsInClass, unplaceableStudents } from '../../../functions/shared/classModel.mjs';

export function useTeacherAnalytics(
  user, teacherTab, classes, activeClass, setActiveClass, assignments, allStudents, teacherRosterSummaries,
  profileDrawerStudentDetail, setProfileDrawerStudentDetail, studentSupportEvents, teacherKit,
  studentSessionSummaries, pacingByClass, skillOverrides, weeklyGoalsByClass, weeklyPathCompletionsByStudent,
  profileDrawerStudentId, profileSupportHistory, setProfileSupportHistory, weeklyPathTruncated, setQuickSearchOpen,
  weeklyPathProgressLoadedFor, now, courseProfiles, classesById, teacherLearningProfiles, teacherWeeklyRoster,
  teacherWeeklyGoalsByStudent, setGradebookFilter,
) {
  // Students in the class the teacher is working in.
  //
  // Membership follows `classId`. A student whose record predates the class
  // migration has no classId at all, so they are matched on the period the
  // class publishes — which is a compatibility path, not the rule, and it is
  // why an unmigrated student can still appear in exactly one roster.
  const studentsInActiveClass = useMemo(() => studentsInClass({
    students: allStudents,
    classes,
    classId: activeClass.classId,
    // Only when a class is actually selected. With no class chosen the roster is
    // every student, and passing a stale period here would silently filter it.
    classPeriod: activeClass.classId ? activeClass.classPeriod : null,
  }), [allStudents, classes, activeClass.classId, activeClass.classPeriod]);

  // Analytics names students by displayName; build those copies once per roster
  // change, not on every App render.
  const teacherAnalyticsStudents = useMemo(() => (
    teacherTab === 'analytics'
      ? (activeClass.classId ? studentsInActiveClass : allStudents)
        .map((student) => ({ ...student, displayName: formatStudentName(student) }))
      : []
  ), [teacherTab, activeClass.classId, studentsInActiveClass, allStudents]);

  // THE NEEDS-ATTENTION QUEUE.
  //
  // Assembled here rather than inside Teacher Home because every input already
  // lives at this level and none of it should be recomputed per screen. The
  // engine itself is pure and lives in `platform/teacher/needsAttention.js`, so
  // what counts as worth interrupting a teacher about is testable and is not
  // buried in a component.
  //
  // Weekly-path completion is read for ONE class at a time — it is a Cloud
  // Function call per class, and firing five of them to render a landing page
  // would be a poor trade. So with a class selected the queue includes weekly
  // completion; with "All classes" selected it covers academic and system
  // findings across everyone and the panel says the weekly half is missing.
  // The queue is a statement about the week, not about this second. Keying it
  // to the start of the day keeps a thirty-second display tick from rebuilding
  // it — and from making a "3 items" badge flicker while a teacher reads it.
  // The week the Path grade belongs to, and whether it has finished. Both are
  // read by the gradebook panel; the second gates Classroom review, because a
  // student who finishes on Sunday should not be graded on Wednesday's work.
  const weeklyPathWeekKey = useMemo(() => {
    const record = classesById[activeClass.classId] || null;
    const config = storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: activeClass.classId, classPeriod: record?.period || '',
    }) || {};
    return weekKeyFor(now, weekStartsOnFor(config));
  }, [classesById, activeClass.classId, weeklyGoalsByClass, Math.floor(now / 3_600_000)]);

  const weeklyPathWeekComplete = useMemo(() => {
    const record = classesById[activeClass.classId] || null;
    const config = storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: activeClass.classId, classPeriod: record?.period || '',
    }) || {};
    return now > dueAtFor(now, {
      weekStartsOn: weekStartsOnFor(config),
      dueDayOfWeek: config.dueDayOfWeek ?? 0,
    });
  }, [classesById, activeClass.classId, weeklyGoalsByClass, Math.floor(now / 3_600_000)]);

  const queueDayStart = useMemo(() => new Date(now).setHours(0, 0, 0, 0), [Math.floor(now / 3_600_000)]);

  const needsAttentionQueue = useMemo(() => {
    if (!teacherKit || !['home', 'classesWorkspace'].includes(teacherTab)) return [];
    const scoped = activeClass.classId ? studentsInActiveClass : allStudents;
    const weeklyLoaded = Boolean(activeClass.classId) && weeklyPathProgressLoadedFor === activeClass.classId;
    const weeklyByStudentId = !weeklyLoaded ? {} : Object.fromEntries(buildTeacherWeeklyView(
      teacherWeeklyRoster.map((student) => ({
        studentId: student.id,
        studentName: formatStudentName(student, { lastFirst: false }),
        goal: teacherWeeklyGoalsByStudent[student.id] || null,
        completions: weeklyPathCompletionsByStudent[student.id] || [],
      })).filter((entry) => entry.goal),
      { now: queueDayStart },
    ).map((row) => [row.studentId, row]));

    const classSizes = Object.fromEntries(classes.map((entry) => [
      entry.classId,
      studentsInClass({ students: allStudents, classes, classId: entry.classId }).length,
    ]));

    // How far through the week we are, so nobody is told on Monday morning that
    // a student has not finished the week's work. The week runs Monday to Sunday
    // and closes at midnight Sunday night, so Monday is 0 and Sunday is 1 — the
    // weekend is still working time, not a week already gone.
    const day = new Date(queueDayStart).getDay();
    const weekFraction = Math.min(1, Math.max(0, ((day + 6) % 7) / 6));

    return teacherKit.buildNeedsAttentionQueue({
      students: scoped.map((student) => ({ ...student, displayName: formatStudentName(student) })),
      profilesByStudentId: teacherLearningProfiles,
      weeklyByStudentId,
      classSizes,
      unplaceable: unplaceableStudents({ students: allStudents, classes })
        .map((student) => ({ ...student, displayName: formatStudentName(student) })),
      weeklyProgressTruncated: weeklyPathTruncated,
      classCount: classes.filter((entry) => entry?.status !== 'archived').length,
      weekFraction,
      supportEvents: studentSupportEvents,
      now: queueDayStart,
    });
  }, [
    activeClass.classId, studentsInActiveClass, allStudents, classes,
    teacherLearningProfiles, teacherWeeklyRoster, teacherWeeklyGoalsByStudent,
    weeklyPathCompletionsByStudent, weeklyPathTruncated, weeklyPathProgressLoadedFor, queueDayStart, studentSupportEvents,
    teacherTab, teacherKit,
  ]);

  const profileDrawerRosterStudent = useMemo(
    () => allStudents.find((student) => student.id === profileDrawerStudentId)
      || teacherRosterSummaries.find((student) => student.id === profileDrawerStudentId)
      || null,
    [allStudents, teacherRosterSummaries, profileDrawerStudentId],
  );

  const profileDrawerStudent = profileDrawerStudentDetail?.id === profileDrawerStudentId
    ? profileDrawerStudentDetail
    : profileDrawerRosterStudent;

  useEffect(() => {
    if (user?.role !== 'teacher' || !profileDrawerStudentId) {
      setProfileDrawerStudentDetail(null);
      return undefined;
    }
    const current = allStudents.find((student) => student.id === profileDrawerStudentId);
    if (current?.gradesByAssignment !== undefined) {
      setProfileDrawerStudentDetail(current);
      return undefined;
    }

    let active = true;
    setProfileDrawerStudentDetail(null);
    getDoc(doc(db, 'grades', profileDrawerStudentId))
      .then((snapshot) => {
        if (!active || !snapshot.exists()) return;
        const data = snapshot.data() || {};
        setProfileDrawerStudentDetail({
          id: snapshot.id,
          ...data,
          profile: normalizeStudentProfile(data.profile || data),
        });
      })
      .catch((error) => {
        if (active) console.error('Could not load student profile detail:', error);
      });
    return () => { active = false; };
  }, [user?.role, profileDrawerStudentId, allStudents]);

  const profileDrawerLearningProfile = useMemo(() => {
    if (!profileDrawerStudent) return null;
    const globalProfile = teacherLearningProfiles[profileDrawerStudent.id] || null;
    if (globalProfile) return globalProfile;
    if (profileDrawerStudent.gradesByAssignment === undefined) return null;

    const rows = collectStudentEvidence({ student: profileDrawerStudent, assignments });
    const { events } = evidenceRowsToEvents(rows);
    const legacyProfile = buildStudentMasteryProfile({ student: profileDrawerStudent, assignments });
    return buildStudentLearningProfile({
      courseId: resolveStudentCourseContext({ student: profileDrawerStudent, classesById, courseProfiles }).courseId,
      evidenceEvents: events,
      masteryProfilesByTeks: adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows: rows }),
    });
  }, [profileDrawerStudent, teacherLearningProfiles, assignments, classesById, courseProfiles]);

  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email || !profileDrawerStudentId) {
      setProfileSupportHistory({ studentId: null, events: [], summaries: [] });
      return undefined;
    }

    if (!teacherKit) return undefined;
    let active = true;
    setProfileSupportHistory({ studentId: profileDrawerStudentId, events: [], summaries: [] });
    teacherKit.fetchStudentSupportHistory({
      db,
      teacherEmail: user.email,
      studentId: profileDrawerStudentId,
    }).then((history) => {
      if (!active) return;
      setProfileSupportHistory({
        studentId: profileDrawerStudentId,
        events: history.events || [],
        summaries: history.summaries || [],
      });
    }).catch((error) => {
      if (!active) return;
      console.error('Could not load full student support history:', error);
      // Recent globally subscribed records remain available below even if this
      // focused historical read fails.
      setProfileSupportHistory({ studentId: profileDrawerStudentId, events: [], summaries: [] });
    });

    return () => { active = false; };
  }, [user?.role, user?.email, profileDrawerStudentId, teacherKit]);

  const profileDrawerSupportEvents = useMemo(() => {
    if (!profileDrawerStudentId) return [];
    const merged = new Map();
    [
      ...(profileSupportHistory.studentId === profileDrawerStudentId ? profileSupportHistory.events : []),
      ...studentSupportEvents.filter((event) => event.studentId === profileDrawerStudentId),
    ].forEach((event) => {
      const key = event.id || `${event.signalKey || ''}:${event.createdAt || ''}`;
      merged.set(key, event);
    });
    return [...merged.values()].sort((a, b) => (
      Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
    ));
  }, [profileDrawerStudentId, profileSupportHistory, studentSupportEvents]);

  const profileDrawerSessionSummaries = useMemo(() => {
    if (!profileDrawerStudentId) return [];
    const merged = new Map();
    [
      ...(profileSupportHistory.studentId === profileDrawerStudentId ? profileSupportHistory.summaries : []),
      ...studentSessionSummaries.filter((summary) => summary.studentId === profileDrawerStudentId),
    ].forEach((summary) => merged.set(summary.id || summary.sessionKey, summary));
    return [...merged.values()].sort((a, b) => Number(b.endedAt || 0) - Number(a.endedAt || 0));
  }, [profileDrawerStudentId, profileSupportHistory, studentSessionSummaries]);

  // The plan shown in the drawer is the SAME plan the student's own screen is
  // built from. If the two ever disagree, a teacher is being shown a
  // recommendation the student never received, which is worse than showing none.
  const profileDrawerPlan = useMemo(() => {
    if (!profileDrawerStudent) return null;
    const context = resolveStudentCourseContext({ student: profileDrawerStudent, classesById, courseProfiles });
    const studentAssignments = assignments.filter((assignment) => (
      assignmentIsForStudent(assignment, { classId: profileDrawerStudent.classId || null, classPeriod: profileDrawerStudent.classPeriod })
    ));
    const options = buildStudentPathOptions({
      student: profileDrawerStudent,
      assignments: studentAssignments,
      courseId: context.courseId,
      pacing: storedPacingForClassContext(pacingByClass, {
        classId: profileDrawerStudent.classId, classPeriod: profileDrawerStudent.classPeriod,
      }),
      teacherOverrides: overridesForClassContext(skillOverrides, {
        classId: profileDrawerStudent.classId, classPeriod: profileDrawerStudent.classPeriod,
      }),
    });
    return buildWeeklyPathPlan({
      options,
      courseId: context.courseId,
      profile: profileDrawerLearningProfile,
      ...weeklyPlanClassInputs({
        config: storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
          classId: profileDrawerStudent.classId, classPeriod: profileDrawerStudent.classPeriod,
        }) || {},
        honors: context.courseLevel === 'honors',
      }),
    });
  }, [profileDrawerStudent, classesById, courseProfiles, assignments, pacingByClass, skillOverrides, profileDrawerLearningProfile, weeklyGoalsByClass]);

  // A view that cannot answer anything across five classes gets one chosen for
  // it rather than being left on an option its own bar does not offer. Weekly
  // goals and pacing are settings that belong to one class; there is no
  // meaningful average of them.
  useEffect(() => {
    const scope = CLASS_SCOPED_TABS[teacherTab];
    if (!scope || scope.allowAllClasses !== false || activeClass.classId) return;
    const first = classes.find((entry) => entry?.status !== 'archived') || null;
    if (first) setActiveClass({ classId: first.classId, classPeriod: first.period || null });
  }, [teacherTab, activeClass.classId, classes]);

  // Cmd/Ctrl-K from anywhere in the teacher workspace. Bound at this level
  // rather than on a screen, because the whole value of the palette is that it
  // works from wherever the teacher already is.
  useEffect(() => {
    if (user?.role !== 'teacher') return undefined;
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        setQuickSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user?.role]);

  // The Gradebook follows the class bar.
  //
  // Guarded on an actual difference rather than on the id alone: navigating
  // into one student's gradebook sets BOTH the filter (with that student) and
  // the workspace class, and an unguarded effect would then fire and throw the
  // student away — sending the teacher back to the class list they just left.
  useEffect(() => {
    const desired = activeClass.classId || '';
    setGradebookFilter((current) => (current.classId === desired ? current : {
      classId: desired,
      classPeriod: activeClass.classPeriod || '',
      // The assignment and the student belonged to the previous class. Carrying
      // either across would show one class's work under another class's name.
      assignmentId: null,
      student: null,
    }));
  }, [activeClass.classId, activeClass.classPeriod]);
  return [
    studentsInActiveClass, teacherAnalyticsStudents, weeklyPathWeekKey, weeklyPathWeekComplete, needsAttentionQueue,
    profileDrawerStudent, profileDrawerLearningProfile, profileDrawerSupportEvents, profileDrawerSessionSummaries,
    profileDrawerPlan,
  ];
}
