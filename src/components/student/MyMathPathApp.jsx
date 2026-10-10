import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MyMathPathDashboard from './MyMathPathDashboard.jsx';
import StudentLearningPath from './StudentLearningPath.jsx';
import CCMRHub from './CCMRHub.jsx';
import MyMathPathProductionContainer from './MyMathPathProductionContainer.jsx';
import StudentPracticeHistory from './StudentPracticeHistory.jsx';
import WeeklyPathGoalPanel from './WeeklyPathGoalPanel.jsx';
import MyMathPathProgress from './MyMathPathProgress.jsx';
import StudentGlobalNav, { STUDENT_DESTINATION } from './StudentGlobalNav.jsx';
import { fetchStudentMasteryState } from '../../services/masteryStateService.js';
import { buildUnifiedMasteryProfiles } from '../../platform/mastery/unifiedMastery.js';
import { fetchMyMathPathSkillProgress } from '../../services/pathSessionService.js';
import { fetchStudentEvidenceEvents } from '../../platform/history/evidencePersistence.js';
import { toCanonicalKey, toDisplayCode } from '../../utils/teksUtils.js';
import { fetchPathCoverage } from '../../platform/path/pathCoverageService.js';
import {
  frameworkCoverageKnown,
  isFrameworkSkillLaunchable,
  isSkillLaunchable,
} from '../../../functions/shared/pathCoverage.mjs';
import { curateStudentPanel } from '../../platform/path/studentPanel.js';
import { teksCodeFromSkillId, teksSkillId } from '../../platform/path/skillGraph.js';
import { statusForSkill } from '../../platform/path/pathMap.js';
import { buildStudentLearningProfile } from '../../platform/profile/studentLearningProfile.js';
import { buildWeeklyPathPlan } from '../../platform/path/weeklyPathPlan.js';
import { buildWeeklyGoal, evaluateWeeklyGoalProgress, matchWeeklyGoalCompletions, weeklyPlanClassInputs } from '../../platform/path/weeklyPathGoal.js';
import { fetchMyWeeklyPathCompletions, fetchMyWeeklyPathHistory, fetchTeacherWeeklyPathCompletions, resolveWeeklyPathGoalSnapshot } from '../../platform/path/pathStore.js';
import { collectWeeklyPathSessions } from '../../../functions/shared/weeklyPathCompletion.mjs';
import { describeWeeklySessionEnd, sessionLaunchKey } from '../../platform/path/pathSessionEnd.js';
import { buildWeeklyPathHistory } from '../../../functions/shared/weeklyPathHistory.mjs';
import { fetchStudentMasteryHistory } from '../../platform/mastery/masteryHistoryStore.js';
import { PRACTICE_HISTORY_EVENT_LIMIT } from '../../platform/mastery/practiceHistoryPresentation.js';
import { STATUS } from '../../platform/path/recommendationEngine.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import { applyWeeklySlotChoices, mergeWeeklyGoalSnapshot, resolveWeeklySlotChoices, weeklyLaunchSession } from '../../platform/path/weeklyPathChoice.js';
import { pathCardLaunchOptions, weeklySessionLaunchOptions } from '../../platform/path/pathSessionLaunch.js';
import { evaluateStudentRetentionSchedule } from '../../platform/retention/retentionScheduler.js';
import { DEFAULT_MASTERY_COURSE_ID, getWheelTeksForCourse } from '../../platform/mastery/strandConfig.js';
import { buildStudentAssessmentContext } from '../../platform/ccmr/studentAssessmentContext.js';
import {
  ccmrPlanFrameworks, ccmrPlanSaveRequest, ccmrPlanWithGoals, ccmrPlanWithTest, decideLegacyCcmrMigration,
} from '../../platform/ccmr/ccmrPlan.js';
import {
  clearLegacyCcmrGoals, readLegacyCcmrGoals, saveMyCcmrPlan, subscribeStudentCcmrPlan,
} from '../../platform/ccmr/ccmrPlanStore.js';
import { FRAMEWORK_LABELS, getSkillCrosswalk } from '../../platform/ccmr/assessmentCrosswalk.js';
import {
  mathPathRouteKey,
  readMathPathRouteState,
  writeMathPathRouteState,
} from '../../platform/student/browserHistory.js';

// The mastery-status priority list this used to be was a second, competing
// idea of what to recommend, sitting beside the path engine and able to
// disagree with it. Two answers to the same question is the divergence the
// adaptive brief warns about, so the engine is asked first and this remains
// only as the fallback for when it has nothing to say — no pacing set, or a
// course with no graph.
const chooseFallbackTeks = (profiles = {}, courseId = DEFAULT_MASTERY_COURSE_ID, pathOptions = null) => {
  const inCourse = new Set(getWheelTeksForCourse(courseId));
  const priority = ['Needs Attention', 'Developing', 'Not Enough Evidence', 'Secure', 'Mastered'];
  const entries = Object.entries(profiles).filter(([code]) => inCourse.has(toDisplayCode(code)));
  // The fallback ranks by mastery status alone, which knows nothing about
  // prerequisites or pacing. Without this cross-check it could headline a skill
  // the engine has LOCKED or put beyond the class horizon — a second
  // recommender contradicting the first, which is exactly what the one-engine
  // rule forbids. The engine keeps the veto.
  const engineAllows = (code) => {
    if (!pathOptions) return true;
    const status = statusForSkill(pathOptions, teksSkillId(code));
    return !status || ![STATUS.LOCKED, STATUS.FUTURE].includes(status);
  };
  for (const status of priority) {
    const match = entries.find(([code, profile]) => (
      profile?.mastery?.status === status && engineAllows(toDisplayCode(code))
    ));
    if (match) return toDisplayCode(match[0]);
  }
  // No standard of this course has any evidence yet. A hardcoded 'A.5A' here
  // told an Algebra II student to practise an Algebra I standard, so this now
  // returns nothing and the screen says it has no suggestion.
  return null;
};

const TABS = [
  ['path', 'Path'],
  ['dashboard', 'Mastery Overview'],
  ['progress', 'My Progress'],
  ['ccmr', 'CCMR'],
  ['history', 'Practice History'],
];

const chooseRecommendedTeks = ({ profiles, pathOptions, courseId }) => {
  const panel = pathOptions ? curateStudentPanel(pathOptions) : null;
  const engineChoice = panel?.best?.skillId || panel?.strengthen?.skillId || null;
  const code = engineChoice ? teksCodeFromSkillId(engineChoice) : null;
  return code || chooseFallbackTeks(profiles, courseId, pathOptions);
};

export const MyMathPathExperience = ({
  studentId, studentName, studentProfile = null, assignments = null,
  // A skill chosen from Recommended for You. Opening straight into practice on
  // it is the whole point of the panel — otherwise a student picks a skill and
  // is dropped on a mastery map to find it again.
  launchTeksCode = null,
  pathOptions = null,
  // The teacher's weekly goal settings for this student's class. Null means
  // nothing was configured, which is a working state, not a missing one.
  weeklyGoalConfig = null,
  // The course this student is enrolled in. It drives the mastery wheel and
  // every fallback, so an Algebra II student never meets Algebra I content.
  courseId = DEFAULT_MASTERY_COURSE_ID,
  // What the student's own record says, so CCMR evidence is read from the same
  // facts the course path is built from.
  studentRecord = null,
  teacherAssessmentPriorities = [],
  // Data, supplied by whoever owns it. The live container reads Firestore; the
  // Teacher Path Simulator hands over a synthetic learner. Neither this
  // component nor anything below it can tell the difference, which is the
  // point — a simulator that renders a copy of the student experience is
  // simulating the copy.
  masteryData = { masteryProfilesByTEKS: {}, retentionSchedulesByTEKS: {} },
  // The live server mastery document (App.jsx's subscription). The session end
  // screen reads it to show the skills a session moved once the trigger lands.
  serverMasteryProfiles = null,
  evidenceEvents = [],
  skillProgressByTEKS = {},
  // The Teacher Path Simulator forces assessment evidence directly — "what
  // does this student's SAT wheel look like at 45%?" — so it supplies the
  // whole context rather than having one derived from a synthetic document.
  assessmentContextOverride = null,
  // The student's CCMR plan ("I'm preparing for…" and an optional test date),
  // as data. The live container reads studentCcmrPlans and saves through the
  // setMyCcmrPlan callable; the simulator hands over a synthetic plan and keeps
  // its saves in memory. `ccmrPlanLoaded` means the plan is known, and only
  // then may it be edited. `ccmrPlanSettled` holds the weekly plan back until
  // the student's own plan is known (or plainly unavailable), so a week is
  // not frozen without it.
  ccmrPlan = null,
  ccmrPlanLoaded = true,
  ccmrPlanSettled = true,
  ccmrPlanError = null,
  onSaveCcmrPlan = null,
  // Injected by the Teacher Path Simulator so a practice session runs against
  // the synthetic learner. Absent for a real student, who gets the live
  // secure service.
  sessionProvider = null,
  coverageOverride = null,
  onSimulationController = null,
  onSimulationEvent = null,
  readOnly = false,
  initialTab = 'path',
  loading = false,
  error = null,
  historyError = null,
  onReload = null,
  onExit = null,
  // The shared student destinations. Before this existed, the top-right control
  // was labelled "Assignments" and called onExit — which returned the student to
  // HOME, not to their assignments. A button that names one place and goes to
  // another is worse than no button: the student learns not to trust the nav.
  onNavigate = null,
}) => {
  // The live student opens on Path. A teacher inspecting an actual student can
  // choose Mastery Overview first, but the same component stays the source of truth.
  const [activeTab, setActiveTab] = useState(() => initialTab);
  const [sessionConfig, setSessionConfig] = useState(null);
  // Which alternative the student put in each slot, keyed by the slot's frozen
  // key. Deliberately session-scoped: a swap is a decision about what to work on
  // right now, not a setting worth persisting. Once the swapped session is
  // opened, the server's record of it carries the choice across reloads
  // (resolveWeeklySlotChoices below).
  const [weeklyChoices, setWeeklyChoices] = useState({});

  // Keep My Math Path's own tabs/session in the browser history too. App.jsx
  // owns the outer student surface (Assignments, My Math Path, Exams); this
  // component owns the levels INSIDE My Math Path. Together they make the
  // browser Back button behave like the in-platform Back controls instead of
  // jumping to the site that opened MathMaster.
  const mathPathBrowserHistoryReadyRef = useRef(false);
  const mathPathBrowserRoute = useMemo(() => ({
    tab: activeTab,
    sessionConfig: activeTab === 'session' ? sessionConfig : null,
  }), [activeTab, sessionConfig]);

  useEffect(() => {
    if (readOnly) return;

    const current = readMathPathRouteState(window.history.state);
    const currentKey = current ? mathPathRouteKey(current) : null;
    const targetKey = mathPathRouteKey(mathPathBrowserRoute);

    if (!mathPathBrowserHistoryReadyRef.current) {
      mathPathBrowserHistoryReadyRef.current = true;
      if (currentKey !== targetKey) {
        // The outer App has already created (or is about to create) the My Math
        // Path entry. Augment that entry rather than adding a visually
        // identical extra Back step on initial mount.
        writeMathPathRouteState(mathPathBrowserRoute, { replace: true });
      }
      return;
    }

    if (currentKey !== targetKey) {
      writeMathPathRouteState(mathPathBrowserRoute);
    }
  }, [mathPathBrowserRoute, readOnly]);

  useEffect(() => {
    if (readOnly) return undefined;

    const restoreMathPathHistory = (event) => {
      const route = readMathPathRouteState(event.state);
      if (!route) return;

      if (route.tab === 'session' && route.sessionConfig) {
        setSessionConfig(route.sessionConfig);
        setActiveTab('session');
        return;
      }

      setSessionConfig(null);
      setActiveTab(route.tab || 'path');
    };

    window.addEventListener('popstate', restoreMathPathHistory);
    return () => window.removeEventListener('popstate', restoreMathPathHistory);
  }, [readOnly]);

  const teacherReadOnlyNotice = 'Teacher view is read-only. Use Path Simulator to test questions or routing without changing this student.';
  // Teachers inspecting a real student now get the same CCMR evidence and
  // official-standard explorer the student sees. The hub itself is read-only,
  // so teachers can search and inspect without changing goals or launching work.
  const visibleTabs = TABS;

  const recommendedTeks = useMemo(
    () => chooseRecommendedTeks({ profiles: masteryData.masteryProfilesByTEKS, pathOptions, courseId }),
    [masteryData.masteryProfilesByTEKS, pathOptions, courseId],
  );
  const availableTeks = useMemo(() => Object.keys(masteryData.masteryProfilesByTEKS).map(toDisplayCode), [masteryData.masteryProfilesByTEKS]);

  // THIS WEEK.
  //
  // Everything below is derived from data this component already fetches — the
  // per-TEKS mastery, the retention schedules, the evidence events and the path
  // options. No new reads, and no second engine: the teacher's roster view runs
  // the identical functions over the identical inputs, which is what stops a
  // teacher from seeing a recommendation the student never received.
  const learningProfile = useMemo(() => buildStudentLearningProfile({
    courseId,
    masteryProfilesByTeks: masteryData.masteryProfilesByTEKS,
    evidenceEvents,
    retentionSchedules: masteryData.retentionSchedulesByTEKS,
  }), [courseId, masteryData.masteryProfilesByTEKS, masteryData.retentionSchedulesByTEKS, evidenceEvents]);

  // ONE RETENTION REPORT. The Overview banner, its focus card and the Path
  // map's "Quick retention check" section all list the scheduler's pending
  // checks from this one evaluation, so they cannot disagree about what is due.
  // It is recomputed when a finished check reloads the schedules.
  const retentionReport = useMemo(
    () => evaluateStudentRetentionSchedule(masteryData.masteryProfilesByTEKS, masteryData.retentionSchedulesByTEKS),
    [masteryData.masteryProfilesByTEKS, masteryData.retentionSchedulesByTEKS],
  );

  const honors = String(studentProfile?.courseLevel || '').toLowerCase() === 'honors';

  // Load the secure-bank coverage BEFORE building this week's plan. Assessment
  // transfer slots must never be frozen for a TEKS/framework pair the active
  // bank cannot issue.
  const [coverage, setCoverage] = useState(() => coverageOverride || null);
  const [coverageLoaded, setCoverageLoaded] = useState(() => Boolean(coverageOverride));
  useEffect(() => {
    if (coverageOverride) {
      setCoverage(coverageOverride);
      setCoverageLoaded(true);
      return undefined;
    }
    let cancelled = false;
    setCoverageLoaded(false);
    fetchPathCoverage(courseId).then((index) => {
      if (cancelled) return;
      setCoverage(index);
      setCoverageLoaded(true);
    });
    return () => { cancelled = true; };
  }, [courseId, coverageOverride]);

  // The student's saved plan feeds the week, so the week waits for it: a goal
  // proposed before the plan loaded would be frozen without it for seven days.
  const weeklyPlan = useMemo(() => (pathOptions && ccmrPlanSettled ? buildWeeklyPathPlan({
    options: pathOptions,
    courseId,
    profile: learningProfile,
    masteryProfilesByTeks: masteryData.masteryProfilesByTEKS,
    retentionSchedules: masteryData.retentionSchedulesByTEKS,
    evidenceEvents,
    // The PLAN must be built to the same length the GOAL will ask for.
    // Building four and then asking for six leaves two empty cards. The
    // class's settings reach the planner through the helper the teacher's
    // screens use, so their preview is this week. "Auto" follows the
    // student's own goals and test date; a framework the teacher picked wins.
    // Either way it only chooses the FORMAT of transfer slots the evidence
    // and the teacher's expectation already allow.
    ...weeklyPlanClassInputs({ config: weeklyGoalConfig || {}, honors }),
    coverage,
    ccmrPlan,
  }) : null), [pathOptions, ccmrPlanSettled, courseId, learningProfile, masteryData, evidenceEvents, honors, weeklyGoalConfig, coverage, ccmrPlan]);

  const proposedWeeklyGoal = useMemo(() => (weeklyPlan ? buildWeeklyGoal({
    plan: weeklyPlan, config: weeklyGoalConfig || {}, honors, studentId, courseId,
  }) : null), [weeklyPlan, weeklyGoalConfig, honors, studentId, courseId]);
  const [assignedWeeklyGoal, setAssignedWeeklyGoal] = useState(null);
  const frozenWeeklySnapshotRef = useRef(null);

  useEffect(() => {
    if (!proposedWeeklyGoal) { setAssignedWeeklyGoal(null); return undefined; }
    // The simulator owns its synthetic runtime and never touches production
    // student callables. Live students freeze the proposal on the server once;
    // the simulator's runtime freezes it by the same rule
    // (weeklyPathSlotAuthority.mjs), so its swaps are the swaps a student gets.
    if (sessionProvider) {
      let simulatedSnapshot = null;
      try {
        simulatedSnapshot = typeof sessionProvider.freezeWeeklyPathGoal === 'function'
          ? sessionProvider.freezeWeeklyPathGoal(proposedWeeklyGoal)
          : null;
      } catch (caught) {
        console.error('Could not freeze the simulated Weekly Path goal:', caught);
      }
      setAssignedWeeklyGoal(simulatedSnapshot
        ? mergeWeeklyGoalSnapshot({ proposed: proposedWeeklyGoal, snapshot: simulatedSnapshot, assignmentState: 'simulation' })
        : { ...proposedWeeklyGoal, assignmentState: 'simulation' });
      return undefined;
    }
    // The server freezes a week exactly once, so its snapshot is reused for
    // the rest of that week. The proposal is rebuilt whenever the live mastery
    // profile moves (after every answer); asking the server again each time
    // only cost a callable and flashed the unfrozen proposal in between.
    const frozen = frozenWeeklySnapshotRef.current;
    if (frozen && frozen.weekKey === proposedWeeklyGoal.weekKey) {
      setAssignedWeeklyGoal(mergeWeeklyGoalSnapshot({ proposed: proposedWeeklyGoal, snapshot: frozen.snapshot }));
      return undefined;
    }
    let cancelled = false;
    setAssignedWeeklyGoal(null);
    resolveWeeklyPathGoalSnapshot(proposedWeeklyGoal)
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        frozenWeeklySnapshotRef.current = { weekKey: snapshot.weekKey || proposedWeeklyGoal.weekKey, snapshot };
        // Swaps come from the frozen week only — what the server agreed to,
        // and none at all for a week frozen before swaps existed.
        setAssignedWeeklyGoal(mergeWeeklyGoalSnapshot({ proposed: proposedWeeklyGoal, snapshot }));
      })
      .catch((caught) => {
        if (!cancelled) console.error('Could not freeze Weekly Path goal:', caught);
      });
    return () => { cancelled = true; };
  }, [proposedWeeklyGoal, sessionProvider]);

  // Until the week is frozen it offers no swaps: the server has agreed to none.
  const unfrozenWeeklyGoal = useMemo(() => mergeWeeklyGoalSnapshot({ proposed: proposedWeeklyGoal }), [proposedWeeklyGoal]);
  const weeklyGoal = assignedWeeklyGoal || unfrozenWeeklyGoal;

  // ONE COMPLETION TRUTH. A slot is done when its Path session is COMPLETED on
  // the server — the rule the teacher's table and the Classroom publisher use
  // (functions/shared/weeklyPathCompletion.mjs). Counting a session with one
  // finalized answer as done showed a student a 🎉 and a "Grade so far" that
  // Classroom would never receive. A half-finished session is `inProgress` and
  // keeps its Resume button. Null while loading: no grade card rather than a
  // wrong one.
  //
  // `status` says whether these facts are SETTLED: 'loading' from the moment a
  // (re)load starts, 'ready' once it answers, 'failed' if it cannot. Until they
  // are settled the panel cannot know which slots already have an open session
  // — after a reload it shows each slot's recommendation, not the swap the
  // student opened — so weekly launches wait for 'ready' (startWeeklySession,
  // and WeeklyPathGoalPanel's `factsStatus`). The server resumes a slot's open
  // session whatever the launch names; this keeps the card from offering a
  // Start it cannot honestly describe.
  const [weeklySessionFacts, setWeeklySessionFacts] = useState({ weekKey: null, completions: null, inProgress: [], status: 'loading' });
  const [weeklyRefreshKey, setWeeklyRefreshKey] = useState(0);
  const weeklyGoalWeekKey = weeklyGoal?.weekKey || null;
  useEffect(() => {
    if (!weeklyGoalWeekKey) return undefined;
    let cancelled = false;
    setWeeklySessionFacts((current) => (current.status === 'loading' ? current : { ...current, status: 'loading' }));
    const load = sessionProvider
      // The simulator's runtime holds session documents of the production
      // shape; the same collector counts them.
      ? Promise.resolve(collectWeeklyPathSessions({ sessions: sessionProvider.listPathSessions?.() || [], weekKey: weeklyGoalWeekKey }))
      : readOnly
        // A teacher inspecting a student reads the teacher callable, which uses
        // the same completion rule.
        ? fetchTeacherWeeklyPathCompletions({ classId: studentRecord?.classId || studentProfile?.classId || null, weekKey: weeklyGoalWeekKey })
          .then((result) => ({ completions: result.byStudentId?.[studentId] || [], inProgress: [] }))
        : fetchMyWeeklyPathCompletions({ weekKey: weeklyGoalWeekKey });
    load
      .then((facts) => {
        if (!cancelled) setWeeklySessionFacts({ weekKey: weeklyGoalWeekKey, completions: facts.completions || [], inProgress: facts.inProgress || [], status: 'ready' });
      })
      .catch((caught) => {
        console.error('Could not load weekly Path completions:', caught);
        if (!cancelled) setWeeklySessionFacts({ weekKey: weeklyGoalWeekKey, completions: null, inProgress: [], status: 'failed' });
      });
    return () => { cancelled = true; };
  }, [weeklyGoalWeekKey, sessionProvider, readOnly, studentId, studentRecord?.classId, studentProfile?.classId, weeklyRefreshKey, evidenceEvents]);
  const weeklyCompletions = weeklySessionFacts.weekKey === weeklyGoalWeekKey ? weeklySessionFacts.completions : null;
  const weeklyInProgress = weeklySessionFacts.weekKey === weeklyGoalWeekKey ? weeklySessionFacts.inProgress : [];
  const weeklyFactsStatus = weeklySessionFacts.weekKey === weeklyGoalWeekKey ? weeklySessionFacts.status : 'loading';
  const retryWeeklyFacts = useCallback(() => setWeeklyRefreshKey((value) => value + 1), []);
  const weeklyProgress = useMemo(
    () => (weeklyGoal && weeklyCompletions ? evaluateWeeklyGoalProgress({ goal: weeklyGoal, completions: weeklyCompletions }) : null),
    [weeklyGoal, weeklyCompletions],
  );
  // Exact one-to-one slot matching. Two weekly rows may intentionally use the
  // same TEKS, so a set of worked standards would incorrectly mark both done.
  // A swapped session keeps its slot key, so it fills its own slot here too.
  const weeklyMatchedCompletions = useMemo(() => (weeklyGoal && weeklyCompletions
    ? matchWeeklyGoalCompletions({ goal: weeklyGoal, completions: weeklyCompletions }).matched
    : []), [weeklyGoal, weeklyCompletions]);
  const completedSlots = useMemo(
    () => weeklyMatchedCompletions.map((entry) => entry.matchedSlot),
    [weeklyMatchedCompletions],
  );

  // A swap option the secure bank cannot issue is not offered: the launch
  // would only fail on a coverage notice. Unknown until coverage has loaded,
  // and `startSession` still fails closed on its own.
  const weeklyAlternativeLaunchable = useCallback((teksCode, context) => {
    const framework = context && context !== 'course' ? context : null;
    return framework
      ? frameworkCoverageKnown(coverage, framework) && isFrameworkSkillLaunchable(coverage, teksCode, framework)
      : isSkillLaunchable(coverage, teksCode);
  }, [coverage]);

  // The week as the student acts on it. A slot they already opened or
  // finished takes its choice from that server session, so Resume reopens a
  // swapped session after a reload rather than starting the recommendation as
  // a second one; otherwise this tab's click stands.
  const weeklyGoalWithChoices = useMemo(() => {
    if (!weeklyGoal?.sessions?.length) return weeklyGoal;
    const choices = resolveWeeklySlotChoices({
      goal: weeklyGoal,
      choices: weeklyChoices,
      inProgress: weeklyInProgress,
      completions: weeklyCompletions,
    });
    return applyWeeklySlotChoices({
      goal: weeklyGoal,
      choices,
      isLaunchable: coverageLoaded ? weeklyAlternativeLaunchable : null,
    });
  }, [weeklyGoal, weeklyChoices, weeklyInProgress, weeklyCompletions, coverageLoaded, weeklyAlternativeLaunchable]);

  // The session that just finished, so its end screen can offer the next
  // weekly session (or say the week is done) from the week WITH it counted.
  const [finishedSession, setFinishedSession] = useState(null);
  const weeklySessionEnd = useMemo(() => describeWeeklySessionEnd({
    goal: weeklyGoalWithChoices, completions: weeklyCompletions, inProgress: weeklyInProgress, finishedSession,
  }), [weeklyGoalWithChoices, weeklyCompletions, weeklyInProgress, finishedSession]);

  // MY PROGRESS. Each surface hands over what it can actually read. The live
  // student reads their own snapshots and the weekly-history callable; a
  // teacher inspecting read-only can read the snapshots (an authorized teacher,
  // by the rules) but not call a student-only callable; the simulator has no
  // mastery trigger, and grades its synthetic week with the callable's own
  // builder over its production-shaped sessions.
  const loadMasteryHistory = useMemo(() => {
    if (sessionProvider) return null;
    if (!readOnly) return () => fetchStudentMasteryHistory(studentId);
    // A teacher's read of a history that does not exist yet is refused by the
    // rules (they test the document's own authorized list), which would look
    // exactly like an outage for every student until their first new answer.
    // Before a first snapshot there is nothing to show either way.
    return () => fetchStudentMasteryHistory(studentId).catch((caught) => {
      if (caught?.code === 'permission-denied') return null;
      throw caught;
    });
  }, [sessionProvider, readOnly, studentId]);
  const loadWeeklyHistory = useMemo(() => {
    if (sessionProvider) {
      return () => buildWeeklyPathHistory({
        goalsByWeekKey: assignedWeeklyGoal?.weekKey ? { [assignedWeeklyGoal.weekKey]: assignedWeeklyGoal } : {},
        sessions: sessionProvider.listPathSessions?.() || [],
        now: Date.now(),
      });
    }
    return readOnly ? null : fetchMyWeeklyPathHistory;
  }, [sessionProvider, readOnly, assignedWeeklyGoal]);


  // CCMR. The components have existed since Batch 9; what was missing was any
  // route a student could take to reach them, and the evidence to fill them.
  //
  // The goals are the student's saved plan, supplied as data. While a save is
  // in flight the screen shows what the student just chose (`pendingCcmrPlan`);
  // when every save has settled it shows the server's copy again, so a failed
  // save visibly undoes itself instead of pretending to have worked.
  const [pendingCcmrPlan, setPendingCcmrPlan] = useState(null);
  const [ccmrPlanSaveState, setCcmrPlanSaveState] = useState({ state: 'idle', message: null });
  const ccmrSavesInFlight = useRef(0);
  const visibleCcmrPlan = pendingCcmrPlan || ccmrPlan;
  const goals = useMemo(() => ccmrPlanFrameworks(visibleCcmrPlan), [visibleCcmrPlan]);
  const [coverageNotice, setCoverageNotice] = useState(null);
  const assessmentContext = useMemo(() => (assessmentContextOverride || buildStudentAssessmentContext({
    student: studentRecord,
    assignments,
    goals,
    teacherPriorities: teacherAssessmentPriorities,
    evidenceEvents,
  })), [assessmentContextOverride, studentRecord, assignments, goals, teacherAssessmentPriorities, evidenceEvents]);
  const assessmentContextWithCoverage = useMemo(() => ({
    ...(assessmentContext || {}),
    coverage,
  }), [assessmentContext, coverage]);
  const saveCcmrPlan = useCallback((next) => {
    if (readOnly || !onSaveCcmrPlan) {
      setCoverageNotice(teacherReadOnlyNotice);
      return;
    }
    setPendingCcmrPlan(next);
    setCcmrPlanSaveState({ state: 'saving', message: null });
    ccmrSavesInFlight.current += 1;
    Promise.resolve()
      .then(() => onSaveCcmrPlan(ccmrPlanSaveRequest(next, { now: Date.now() })))
      .then(() => {
        if (ccmrSavesInFlight.current === 1) setCcmrPlanSaveState({ state: 'saved', message: null });
      })
      .catch((caught) => {
        console.error('Could not save the CCMR plan:', caught);
        setCcmrPlanSaveState({
          state: 'error',
          message: String(caught?.code || '').endsWith('invalid-argument') && caught?.message
            ? caught.message
            : 'Your plan could not be saved. Check your connection and try again.',
        });
      })
      .finally(() => {
        ccmrSavesInFlight.current -= 1;
        if (ccmrSavesInFlight.current === 0) setPendingCcmrPlan(null);
      });
  }, [readOnly, onSaveCcmrPlan]);
  const changeGoals = useCallback((next) => {
    if (readOnly) {
      setCoverageNotice(teacherReadOnlyNotice);
      return;
    }
    saveCcmrPlan(ccmrPlanWithGoals(visibleCcmrPlan, next));
  }, [readOnly, saveCcmrPlan, visibleCcmrPlan]);
  const changeTest = useCallback((test) => {
    if (readOnly) {
      setCoverageNotice(teacherReadOnlyNotice);
      return;
    }
    saveCcmrPlan(ccmrPlanWithTest(visibleCcmrPlan, test));
  }, [readOnly, saveCcmrPlan, visibleCcmrPlan]);
  const ccmrPlanStatus = useMemo(() => ({
    loaded: ccmrPlanLoaded,
    error: ccmrPlanError,
    // Editing waits for the saved plan: a save built on a plan that never
    // loaded would overwrite the student's real one.
    editable: !readOnly && Boolean(onSaveCcmrPlan) && ccmrPlanLoaded && !ccmrPlanError,
    ...ccmrPlanSaveState,
  }), [ccmrPlanLoaded, ccmrPlanError, readOnly, onSaveCcmrPlan, ccmrPlanSaveState]);

  const startSession = (teksCode, options = {}) => {
    if (readOnly) {
      setCoverageNotice(teacherReadOnlyNotice);
      return;
    }

    const skillName = studentLabelForTeks(teksCode) || 'That skill';
    const requestedFramework = options.framework && options.framework !== 'course'
      ? options.framework
      : null;

    if (requestedFramework) {
      const frameworkLabel = FRAMEWORK_LABELS[requestedFramework] || requestedFramework;
      if (!frameworkCoverageKnown(coverage, requestedFramework)) {
        setCoverageNotice(
          coverageLoaded
            ? `MathMaster has not rebuilt ${frameworkLabel} publication coverage on this deployment. Ask your teacher to refresh Path content coverage.`
            : `MathMaster is still checking which ${frameworkLabel} practice is published. Try again in a moment.`,
        );
        return;
      }
      if (!isFrameworkSkillLaunchable(coverage, teksCode, requestedFramework)) {
        const mapped = Boolean(getSkillCrosswalk(teksCode).frameworks?.[requestedFramework]);
        setCoverageNotice(
          mapped
            ? `${frameworkLabel} practice is not available for ${skillName}. Choose another open path; your teacher can see this publication mismatch in Path content coverage.`
            : `${skillName} is not part of ${frameworkLabel} math practice.`,
        );
        return;
      }
    } else if (!isSkillLaunchable(coverage, teksCode)) {
      setCoverageNotice(
        coverageLoaded
          ? `${skillName} does not have enough published course practice to start a full session. Everything else on your path is still open.`
          : 'MathMaster is still checking which course practice is ready. Try again in a moment.',
      );
      return;
    }

    setCoverageNotice(null);
    setFinishedSession(null);
    setSessionConfig({
      targetAlignmentKey: toCanonicalKey(teksCode),
      sessionKind: options.sessionKind || 'practice',
      requiredQuestions: options.requiredQuestions || (options.sessionKind === 'retentionProbe' ? 2 : 5),
      assessmentFramework: requestedFramework,
      coursePracticeIntent: !requestedFramework && options.coursePracticeIntent === 'challenge' ? 'challenge' : null,
      weekKey: options.weekKey || null,
      weeklySlotKey: options.weeklySlotKey || null,
      weeklySlot: options.weeklySlot || null,
      // The alternative the student swapped into this slot, if any. The server
      // authorizes the launch by the frozen slot; this only names the option.
      chosenSkillId: options.weeklySlotKey ? (options.chosenSkillId || null) : null,
      intendedDok: options.intendedDok ?? null,
      intendedDifficultyBand: options.intendedDifficultyBand ?? null,
      weeklyPurpose: options.weeklyPurpose || null,
      weeklyGoalRequired: options.weeklySlotKey
        ? (weeklyProgress?.required ?? weeklyGoal?.goalSessions ?? null)
        : null,
      completesWeeklyGoal: Boolean(
        options.weeklySlotKey
        && weeklyProgress?.remaining === 1
        && !completedSlots.includes(Number(options.weeklySlot)),
      ),
    });
    setActiveTab('session');
  };

  // Launch once per target, but only AFTER secure coverage has loaded.
  // Recommended-for-You used to set the ref before coverage arrived. The first
  // attempt therefore failed closed as "still checking", and the ref then
  // prevented the exact skill the student chose from ever retrying. The result
  // was seventeen different recommendation buttons that all behaved like the
  // same generic "open My Math Path" button.
  const launchedRef = useRef(null);
  useEffect(() => {
    if (!launchTeksCode || launchedRef.current === launchTeksCode || !coverageLoaded) return;
    launchedRef.current = launchTeksCode;
    startSession(launchTeksCode);
  }, [launchTeksCode, coverageLoaded, coverage]);

  const startWeeklySession = (session) => {
    // Not until this week's sessions are known: before then a card may show
    // the recommendation for a slot whose swap is already open.
    if (weeklyFactsStatus !== 'ready') {
      setCoverageNotice(weeklyFactsStatus === 'failed'
        ? 'MathMaster could not check which weekly sessions you have already started. Use Try again on your weekly Path, then start it.'
        : 'MathMaster is still checking this week’s sessions. Try again in a moment.');
      return;
    }
    // The session arrives with the student's swap already applied, and a swap
    // keeps the slot's frozen key, so the completion still fills its own slot.
    // Its context, DOK and band are the slot's (chooseWeeklyAlternative), and
    // a Retention slot launches a retention check: only that moves the
    // retention schedule, so practice there could never clear the slot. A slot
    // already opened is resumed on the standard it was opened with.
    const chosen = weeklyLaunchSession({ session, inProgress: weeklyInProgress });
    const code = chosen?.teksCode || teksCodeFromSkillId(chosen?.skillId);
    if (!code) return;
    startSession(code, weeklySessionLaunchOptions(chosen, { weekKey: weeklyGoal?.weekKey || null }));
  };

  const chooseWeeklySlotAlternative = (session, alternativeSkillId) => {
    const key = session?.weeklySlotKey;
    if (!key) return;
    setWeeklyChoices((current) => {
      const next = { ...current };
      if (alternativeSkillId) next[key] = alternativeSkillId;
      else delete next[key];
      return next;
    });
  };

  // Free practice used to be locked until the weekly target was met, which made
  // the whole Path read as compliance: a student who wanted to work on something
  // else was told to finish their assigned work first. The week is still the
  // requirement and still says so — but a student who wants to practise more is
  // never the person a learning platform should be turning away.
  const weeklyFreeChoiceLocked = false;
  const weeklyFreeChoiceMessage = weeklyGoal && weeklyProgress && weeklyProgress.remaining > 0
    ? `Open whenever you want. Your ${weeklyProgress.required} weekly sessions above are what counts toward this week — ${weeklyProgress.remaining} still to go.`
    : null;

  const returnToDashboard = () => {
    setFinishedSession(null);
    setSessionConfig(null);
    setActiveTab('path');
    setWeeklyRefreshKey((value) => value + 1);
    onReload?.();
  };

  if (loading && !Object.keys(masteryData.masteryProfilesByTEKS).length) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--mm-primary-text)' }}>Loading My Math Path…</div>;

  return (
    <div style={{ minHeight: '100%', background: 'var(--mm-surface-sunken)' }}>
      {activeTab !== 'session' && (
        <header style={{ minHeight: '60px', padding: '0 20px', borderBottom: '1px solid var(--mm-border)', background: 'var(--mm-surface)', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}><span aria-hidden="true">📐</span><strong>{readOnly ? `${studentName || 'Student'} · My Math Path` : 'My Math Path'}</strong>{readOnly && <span style={{ padding: '3px 7px', borderRadius: 999, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', fontSize: 10, fontWeight: 900 }}>TEACHER · READ ONLY</span>}</div>
          {/*
            TWO LEVELS, AND THEY ARE DIFFERENT KINDS OF THING.
            The global row moves between MathMaster's five destinations; the tab
            row below it moves between views INSIDE My Math Path. Mixing them
            into one row is what allowed an "Assignments" control to sit beside
            "Practice History" and quietly mean "leave".
            A teacher inspecting a student read-only gets neither: they are
            inside the teacher shell and have their own way back.
          */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 0 }}>
            {!readOnly && onNavigate && (
              <StudentGlobalNav
                current={STUDENT_DESTINATION.MATH_PATH}
                onNavigate={onNavigate}
                showLogout={false}
                dense
                label="MathMaster navigation"
                style={{ justifyContent: 'flex-end', padding: '8px 0 0' }}
              />
            )}
            <nav aria-label="My Math Path navigation" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {visibleTabs.map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ minHeight: 44, padding: '12px 8px 10px', border: 0, borderBottom: `3px solid ${activeTab === tab ? '#1a73e8' : 'transparent'}`, background: 'transparent', color: activeTab === tab ? 'var(--mm-primary-text)' : 'var(--mm-text-muted)', fontWeight: 900, cursor: 'pointer' }}>{label}</button>)}
              {onExit && <button type="button" onClick={onExit} style={{ marginLeft: '6px', minHeight: 44, padding: '8px 11px', border: '1px solid var(--mm-border)', borderRadius: '7px', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer' }}>{readOnly ? 'Back to student' : 'Home'}</button>}
            </nav>
          </div>
        </header>
      )}

      {error && <div role="alert" style={{ maxWidth: '940px', margin: '16px auto', padding: '12px 14px', borderRadius: '8px', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' }}>{error}</div>}
      {/* A standard with no practice content says so plainly instead of opening
          a session that dies on the first question. */}
      {coverageNotice && (
        <div role="status" style={{ maxWidth: '940px', margin: '16px auto', padding: '12px 14px', borderRadius: '8px', background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{coverageNotice}</span>
          <button type="button" onClick={() => setCoverageNotice(null)} style={{ minHeight: 34, padding: '0 12px', border: '1px solid #d9b64a', borderRadius: 7, background: 'var(--mm-surface)', color: 'var(--mm-warning-text)', fontWeight: 800, cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}
      {activeTab === 'path' && (
        <>
          {weeklyGoal && (
            <div style={{ maxWidth: '940px', margin: '0 auto', padding: '20px 16px 0' }}>
              <WeeklyPathGoalPanel
                goal={weeklyGoalWithChoices}
                progress={weeklyProgress}
                completions={weeklyCompletions}
                completedSlots={completedSlots}
                inProgress={weeklyInProgress}
                factsStatus={weeklyFactsStatus}
                onRetryFacts={retryWeeklyFacts}
                onStartSession={startWeeklySession}
                onChooseAlternative={chooseWeeklySlotAlternative}
              />
            </div>
          )}
          <StudentLearningPath
            pathOptions={pathOptions}
            skillProgressByTEKS={skillProgressByTEKS}
            masteryProfilesByTEKS={masteryData.masteryProfilesByTEKS}
            // Availability is checked BEFORE the card is drawn, not after the
            // student clicks it. `startSession` still fails closed on top of
            // this; a student should simply never reach that path.
            isCovered={coverageLoaded
              ? (skillId) => isSkillLaunchable(coverage, teksCodeFromSkillId(skillId))
              : null}
            freeChoiceLocked={weeklyFreeChoiceLocked}
            freeChoiceMessage={weeklyFreeChoiceMessage}
            // The scheduler's pending checks fill "Quick retention check"; a
            // card there launches the check itself (pathCardLaunchOptions).
            retentionDue={retentionReport.pendingProbes}
            onChooseSkill={(card) => { const code = teksCodeFromSkillId(card.skillId); if (code) startSession(code, pathCardLaunchOptions(card)); }}
            assessmentContext={assessmentContextWithCoverage}
            onPracticeAs={({ skillId, framework }) => {
              const code = teksCodeFromSkillId(skillId);
              if (code) startSession(code, { framework });
            }}
          />
        </>
      )}
      {activeTab === 'ccmr' && (
        <div style={{ maxWidth: '940px', margin: '0 auto', padding: '20px 16px 40px' }}>
          <CCMRHub
            pathOptions={pathOptions}
            assessmentEvidence={assessmentContext.assessmentEvidence}
            directIndex={assessmentContext.directIndex}
            coverage={coverage}
            goals={assessmentContext.goals}
            plan={visibleCcmrPlan}
            planStatus={ccmrPlanStatus}
            teacherPriorities={assessmentContext.teacherPriorities}
            onChangeGoals={changeGoals}
            onChangeTest={changeTest}
            onPractise={(item) => { const code = teksCodeFromSkillId(item.skillId); if (code) startSession(code, { framework: item.framework }); }}
            onReturnToCourse={() => setActiveTab('path')}
            readOnly={readOnly}
          />
        </div>
      )}
      {activeTab === 'dashboard' && <MyMathPathDashboard studentName={studentName || 'Student'} masteryProfilesByTEKS={masteryData.masteryProfilesByTEKS} retentionSchedulesByTEKS={masteryData.retentionSchedulesByTEKS} retentionReport={retentionReport} skillProgressByTEKS={skillProgressByTEKS} recommendedTeks={recommendedTeks} courseId={courseId} pathOptions={pathOptions} assessmentContext={assessmentContextWithCoverage} weeklyGoal={weeklyGoalWithChoices} weeklyProgress={weeklyProgress} weeklyCompletions={weeklyCompletions} completedSlots={completedSlots} weeklyInProgress={weeklyInProgress} onPracticeAs={({ skillId, framework }) => { const code = teksCodeFromSkillId(skillId); if (code) startSession(code, { framework }); }} onStartSession={startSession} onStartWeeklySession={startWeeklySession} onOpenPath={() => setActiveTab('path')} />}
      {activeTab === 'progress' && (
        <MyMathPathProgress
          loadMasteryHistory={loadMasteryHistory}
          loadWeeklyHistory={loadWeeklyHistory}
          masteryUnavailableMessage={sessionProvider
            ? 'The simulator keeps no weekly mastery snapshots. A real student sees their growth here.'
            : undefined}
          weeklyUnavailableMessage={readOnly
            ? 'The student sees their past weekly goals and grades here. Past weekly grades go to Google Classroom when publishing is on.'
            : undefined}
          onOpenPath={readOnly ? null : () => setActiveTab('path')}
        />
      )}
      {activeTab === 'history' && <StudentPracticeHistory evidenceEvents={evidenceEvents} availableTeks={availableTeks} loading={loading} error={historyError} eventLimit={PRACTICE_HISTORY_EVENT_LIMIT} />}
      {/* Keyed per launch: "Start session N of M" from the end screen opens a
          fresh container instead of carrying the last review into it. */}
      {activeTab === 'session' && sessionConfig && <MyMathPathProductionContainer
        key={sessionLaunchKey(sessionConfig)}
        {...sessionConfig} studentProfile={studentProfile} sessionProvider={sessionProvider} onSimulationController={onSimulationController} onSimulationEvent={onSimulationEvent} onReturnToDashboard={returnToDashboard}
        masteryProfilesByTEKS={masteryData.masteryProfilesByTEKS}
        liveServerMasteryProfiles={sessionProvider ? null : serverMasteryProfiles}
        weeklySessionEnd={weeklySessionEnd}
        onStartNextWeeklySession={readOnly ? null : startWeeklySession}
        onSessionComplete={(finished) => { setFinishedSession(finished || null); setWeeklyRefreshKey((value) => value + 1); onReload?.(); }}
      />}
    </div>
  );
};


// The live container: it owns the fetching and nothing else.
//
// Splitting this out is what lets the Teacher Path Simulator render the real
// experience against a synthetic learner without writing simulation records
// into a real student's Firestore documents.
export const MyMathPathApp = (props) => {
  const { studentId, assignments } = props;
  const [masteryData, setMasteryData] = useState({ masteryProfilesByTEKS: {}, retentionSchedulesByTEKS: {} });
  const [evidenceEvents, setEvidenceEvents] = useState([]);
  const [skillProgressByTEKS, setSkillProgressByTEKS] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [masteryResult, historyResult, passProgressResult] = await Promise.allSettled([
      fetchStudentMasteryState(studentId, { assignments }),
      // The same limit Practice History states ("your 300 most recent answers").
      fetchStudentEvidenceEvents(studentId, { maxEvents: PRACTICE_HISTORY_EVENT_LIMIT }),
      fetchMyMathPathSkillProgress(),
    ]);
    if (masteryResult.status === 'fulfilled') setMasteryData(masteryResult.value);
    else setError(masteryResult.reason?.message || 'Mastery data is unavailable.');
    if (historyResult.status === 'fulfilled') { setEvidenceEvents(historyResult.value); setHistoryError(null); }
    else setHistoryError(historyResult.reason?.message || 'Practice history is temporarily unavailable.');
    if (passProgressResult.status === 'fulfilled') {
      setSkillProgressByTEKS(passProgressResult.value?.byTeksCode || {});
    } else {
      // Pass badges are an enhancement, never a gate to the learning path.
      setSkillProgressByTEKS({});
      console.warn('Could not load Path pass progress:', passProgressResult.reason);
    }
    setLoading(false);
  }, [studentId, assignments]);

  useEffect(() => { loadState(); }, [loadState]);

  // LIVE MASTERY. App.jsx subscribes to the student's server mastery profile,
  // which the background trigger rewrites a moment after each answer, and its
  // Path options already read it. The wheel, the map's mastery chips and the
  // retention report re-derive from the same live profile here, through the
  // same builder, instead of waiting for the next reload — otherwise a skill
  // could read Mastered on the map and Secure on the wheel until then.
  const liveServerMasteryProfiles = props.serverMasteryProfiles || null;
  const liveMasteryData = useMemo(() => {
    if (!liveServerMasteryProfiles || !masteryData.fallbackInputs) return masteryData;
    return {
      ...masteryData,
      masteryProfilesByTEKS: buildUnifiedMasteryProfiles({
        ...masteryData.fallbackInputs,
        serverProfiles: liveServerMasteryProfiles,
        retentionSchedulesByTEKS: masteryData.retentionSchedulesByTEKS,
      }),
    };
  }, [masteryData, liveServerMasteryProfiles]);

  // THE CCMR PLAN, from the server. Read live for the student and for a
  // teacher's read-only view alike — the teacher sees the student's plan, not
  // whatever their own browser happens to hold.
  const readOnly = Boolean(props.readOnly);
  const [ccmrPlanState, setCcmrPlanState] = useState({ studentId: null, plan: null, loaded: false, exists: false, fromCache: true, error: null });
  useEffect(() => {
    setCcmrPlanState({ studentId, plan: null, loaded: false, exists: false, fromCache: true, error: null });
    return subscribeStudentCcmrPlan({
      studentId,
      onChange: ({ plan, exists, fromCache }) => setCcmrPlanState({ studentId, plan, loaded: true, exists, fromCache, error: null }),
      onError: (caught) => {
        console.error('Could not load the CCMR plan:', caught);
        setCcmrPlanState((current) => ({
          ...current,
          studentId,
          loaded: true,
          error: readOnly ? 'This student’s CCMR plan could not be loaded.' : 'Your CCMR plan could not be loaded. Reload to try again.',
        }));
      },
    });
  }, [studentId, readOnly]);

  // One save at a time, in the order the student made them, so the plan the
  // server ends up with is the last one the student chose.
  const ccmrSaveQueue = useRef(Promise.resolve());
  const saveCcmrPlan = useCallback((request) => {
    const run = ccmrSaveQueue.current.catch(() => {}).then(() => saveMyCcmrPlan(request));
    ccmrSaveQueue.current = run;
    return run.then((plan) => {
      setCcmrPlanState((current) => (current.studentId === studentId ? { ...current, plan, exists: Boolean(plan) } : current));
      return plan;
    });
  }, [studentId]);

  // ONE-TIME MOVE OUT OF BROWSER STORAGE. A student who chose goals before
  // they were saved to their account keeps them: once the server confirms it
  // has no plan, this browser's old copy is saved, once, and then forgotten.
  const ccmrMigrationAttempted = useRef(null);
  useEffect(() => {
    if (ccmrPlanState.studentId !== studentId || ccmrPlanState.error) return;
    const decision = decideLegacyCcmrMigration({
      readOnly,
      loaded: ccmrPlanState.loaded,
      exists: ccmrPlanState.exists,
      fromCache: ccmrPlanState.fromCache,
      legacyGoals: readLegacyCcmrGoals(studentId),
      attempted: ccmrMigrationAttempted.current === studentId,
    });
    if (decision.action === 'clear') clearLegacyCcmrGoals(studentId);
    if (decision.action !== 'migrate') return;
    ccmrMigrationAttempted.current = studentId;
    saveCcmrPlan(decision.request)
      .then(() => clearLegacyCcmrGoals(studentId))
      .catch((caught) => console.warn('Could not move saved CCMR goals to this account yet:', caught));
  }, [studentId, readOnly, ccmrPlanState, saveCcmrPlan]);

  const ccmrPlanCurrent = ccmrPlanState.studentId === studentId;
  // "No plan" from the offline cache is not an answer — the server may hold
  // one — so the week waits for the server. It stops waiting after a few
  // seconds, so an offline Chromebook still shows its week.
  const [ccmrPlanWaitExpired, setCcmrPlanWaitExpired] = useState(false);
  useEffect(() => {
    setCcmrPlanWaitExpired(false);
    const timer = setTimeout(() => setCcmrPlanWaitExpired(true), 8000);
    return () => clearTimeout(timer);
  }, [studentId]);
  // Known: the server (or a cached copy of a real plan) has answered. Only a
  // known plan may be edited — a save built on a guess would overwrite a plan
  // the student saved on another device.
  const ccmrPlanKnown = ccmrPlanCurrent && ccmrPlanState.loaded && !ccmrPlanState.error
    && (ccmrPlanState.exists || !ccmrPlanState.fromCache);
  const ccmrPlanSettled = ccmrPlanCurrent && (ccmrPlanKnown || Boolean(ccmrPlanState.error) || ccmrPlanWaitExpired);

  return (
    <MyMathPathExperience
      {...props}
      masteryData={liveMasteryData}
      evidenceEvents={evidenceEvents}
      skillProgressByTEKS={skillProgressByTEKS}
      loading={loading}
      error={error}
      historyError={historyError}
      onReload={loadState}
      ccmrPlan={ccmrPlanCurrent ? ccmrPlanState.plan : null}
      ccmrPlanLoaded={ccmrPlanKnown}
      ccmrPlanSettled={ccmrPlanSettled}
      ccmrPlanError={ccmrPlanCurrent ? ccmrPlanState.error : null}
      onSaveCcmrPlan={readOnly ? null : saveCcmrPlan}
    />
  );
};

export default MyMathPathApp;
