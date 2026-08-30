import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MyMathPathDashboard from './MyMathPathDashboard.jsx';
import StudentLearningPath from './StudentLearningPath.jsx';
import CCMRHub from './CCMRHub.jsx';
import MyMathPathProductionContainer from './MyMathPathProductionContainer.jsx';
import StudentPracticeHistory from './StudentPracticeHistory.jsx';
import WeeklyPathGoalPanel from './WeeklyPathGoalPanel.jsx';
import { fetchStudentMasteryState } from '../../services/masteryStateService.js';
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
import { CCMR_EXPECTATION, buildWeeklyGoal, deriveCompletionsFromEvidence, evaluateWeeklyGoalProgress, matchWeeklyGoalCompletions, normalizeWeeklyGoalConfig } from '../../platform/path/weeklyPathGoal.js';
import { resolveWeeklyPathGoalSnapshot } from '../../platform/path/pathStore.js';
import { STATUS } from '../../platform/path/recommendationEngine.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import { DEFAULT_MASTERY_COURSE_ID, getWheelTeksForCourse } from '../../platform/mastery/strandConfig.js';
import {
  buildStudentAssessmentContext, readCcmrGoals, writeCcmrGoals,
} from '../../platform/ccmr/studentAssessmentContext.js';
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
  evidenceEvents = [],
  skillProgressByTEKS = {},
  // The Teacher Path Simulator forces assessment evidence directly — "what
  // does this student's SAT wheel look like at 45%?" — so it supplies the
  // whole context rather than having one derived from a synthetic document.
  assessmentContextOverride = null,
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
}) => {
  // The live student opens on Path. A teacher inspecting an actual student can
  // choose Mastery Overview first, but the same component stays the source of truth.
  const [activeTab, setActiveTab] = useState(() => initialTab);
  const [sessionConfig, setSessionConfig] = useState(null);

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

  const weeklyPlan = useMemo(() => (pathOptions ? buildWeeklyPathPlan({
    options: pathOptions,
    courseId,
    profile: learningProfile,
    masteryProfilesByTeks: masteryData.masteryProfilesByTEKS,
    retentionSchedules: masteryData.retentionSchedulesByTEKS,
    evidenceEvents,
    // The PLAN must be built to the same length the GOAL will ask for.
    // Building four and then asking for six leaves two empty cards.
    sessions: normalizeWeeklyGoalConfig(weeklyGoalConfig || {}, { honors }).sessions,
    honors,
    interventionMode: Boolean(weeklyGoalConfig?.interventionMode),
    allowTransfer: normalizeWeeklyGoalConfig(weeklyGoalConfig || {}, { honors }).ccmrExpectation !== CCMR_EXPECTATION.NONE,
    pinnedSkills: weeklyGoalConfig?.pinnedSkills || [],
    coverage,
  }) : null), [pathOptions, courseId, learningProfile, masteryData, evidenceEvents, honors, weeklyGoalConfig, coverage]);

  const proposedWeeklyGoal = useMemo(() => (weeklyPlan ? buildWeeklyGoal({
    plan: weeklyPlan, config: weeklyGoalConfig || {}, honors, studentId, courseId,
  }) : null), [weeklyPlan, weeklyGoalConfig, honors, studentId, courseId]);
  const [assignedWeeklyGoal, setAssignedWeeklyGoal] = useState(null);

  useEffect(() => {
    if (!proposedWeeklyGoal) { setAssignedWeeklyGoal(null); return undefined; }
    // The simulator owns its synthetic runtime and never touches production
    // student callables. Live students freeze the proposal on the server once.
    if (sessionProvider) {
      setAssignedWeeklyGoal({ ...proposedWeeklyGoal, assignmentState: 'simulation' });
      return undefined;
    }
    let cancelled = false;
    setAssignedWeeklyGoal(null);
    resolveWeeklyPathGoalSnapshot(proposedWeeklyGoal)
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        setAssignedWeeklyGoal({
          ...proposedWeeklyGoal,
          ...snapshot,
          settings: proposedWeeklyGoal.settings,
          profile: proposedWeeklyGoal.profile,
          suppressed: proposedWeeklyGoal.suppressed,
        });
      })
      .catch((caught) => {
        if (!cancelled) console.error('Could not freeze Weekly Path goal:', caught);
      });
    return () => { cancelled = true; };
  }, [proposedWeeklyGoal, sessionProvider]);

  const weeklyGoal = assignedWeeklyGoal || (proposedWeeklyGoal ? { ...proposedWeeklyGoal, assignmentState: 'proposed' } : null);

  const weeklyCompletions = useMemo(
    () => deriveCompletionsFromEvidence({ evidenceEvents, weekKey: weeklyGoal?.weekKey }),
    [evidenceEvents, weeklyGoal],
  );
  const weeklyProgress = useMemo(
    () => (weeklyGoal ? evaluateWeeklyGoalProgress({ goal: weeklyGoal, completions: weeklyCompletions }) : null),
    [weeklyGoal, weeklyCompletions],
  );
  // Exact one-to-one slot matching. Two weekly rows may intentionally use the
  // same TEKS, so a set of worked standards would incorrectly mark both done.
  const completedSlots = useMemo(() => (weeklyGoal
    ? matchWeeklyGoalCompletions({ goal: weeklyGoal, completions: weeklyCompletions }).matched.map((entry) => entry.matchedSlot)
    : []), [weeklyGoal, weeklyCompletions]);

  // CCMR. The components have existed since Batch 9; what was missing was any
  // route a student could take to reach them, and the evidence to fill them.
  const [goals, setGoals] = useState(() => readCcmrGoals(studentId));
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
  const changeGoals = useCallback((next) => {
    if (readOnly) {
      setCoverageNotice(teacherReadOnlyNotice);
      return;
    }
    setGoals(next);
    writeCcmrGoals(studentId, next);
  }, [studentId, readOnly]);

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
    setSessionConfig({
      targetAlignmentKey: toCanonicalKey(teksCode),
      sessionKind: options.sessionKind || 'practice',
      requiredQuestions: options.requiredQuestions || (options.sessionKind === 'retentionProbe' ? 2 : 5),
      assessmentFramework: requestedFramework,
      weekKey: options.weekKey || null,
      weeklySlotKey: options.weeklySlotKey || null,
      weeklySlot: options.weeklySlot || null,
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
    const code = session?.teksCode || teksCodeFromSkillId(session?.skillId);
    if (!code) return;
    startSession(code, {
      weekKey: weeklyGoal?.weekKey || null,
      weeklySlotKey: session?.weeklySlotKey || null,
      weeklySlot: session?.slot || null,
      intendedDok: session?.dok ?? null,
      intendedDifficultyBand: session?.difficultyBand ?? null,
      weeklyPurpose: session?.purpose || null,
      framework: session?.context && session.context !== 'course' ? session.context : null,
    });
  };

  const weeklyFreeChoiceLocked = Boolean(weeklyGoal && weeklyProgress && weeklyProgress.remaining > 0);
  const weeklyFreeChoiceMessage = weeklyFreeChoiceLocked
    ? `${weeklyProgress.completed} of ${weeklyProgress.required} weekly sessions complete. Finish ${weeklyProgress.remaining} more ${weeklyProgress.remaining === 1 ? 'session' : 'sessions'} above to unlock free-choice paths.`
    : null;

  const returnToDashboard = () => {
    setSessionConfig(null);
    setActiveTab('path');
    onReload?.();
  };

  if (loading && !Object.keys(masteryData.masteryProfilesByTEKS).length) return <div style={{ padding: '60px', textAlign: 'center', color: '#174ea6' }}>Loading My Math Path…</div>;

  return (
    <div style={{ minHeight: '100%', background: '#f8f9fa' }}>
      {activeTab !== 'session' && (
        <header style={{ minHeight: '60px', padding: '0 20px', borderBottom: '1px solid #dadce0', background: '#fff', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}><span aria-hidden="true">📐</span><strong>{readOnly ? `${studentName || studentId || 'Student'} · My Math Path` : 'My Math Path'}</strong>{readOnly && <span style={{ padding: '3px 7px', borderRadius: 999, background: '#fef7e0', color: '#7a4f00', fontSize: 10, fontWeight: 900 }}>TEACHER · READ ONLY</span>}</div>
          <nav aria-label="My Math Path navigation" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {visibleTabs.map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: '19px 8px 16px', border: 0, borderBottom: `3px solid ${activeTab === tab ? '#1a73e8' : 'transparent'}`, background: 'transparent', color: activeTab === tab ? '#174ea6' : '#5f6368', fontWeight: 900, cursor: 'pointer' }}>{label}</button>)}
            {onExit && <button type="button" onClick={onExit} style={{ marginLeft: '6px', padding: '8px 11px', border: '1px solid #bdc1c6', borderRadius: '7px', background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' }}>{readOnly ? 'Back to student' : 'Assignments'}</button>}
          </nav>
        </header>
      )}

      {error && <div role="alert" style={{ maxWidth: '940px', margin: '16px auto', padding: '12px 14px', borderRadius: '8px', background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}
      {/* A standard with no practice content says so plainly instead of opening
          a session that dies on the first question. */}
      {coverageNotice && (
        <div role="status" style={{ maxWidth: '940px', margin: '16px auto', padding: '12px 14px', borderRadius: '8px', background: '#fef7e0', color: '#7a4f00', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{coverageNotice}</span>
          <button type="button" onClick={() => setCoverageNotice(null)} style={{ minHeight: 34, padding: '0 12px', border: '1px solid #d9b64a', borderRadius: 7, background: '#fff', color: '#7a4f00', fontWeight: 800, cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}
      {activeTab === 'path' && (
        <>
          {weeklyGoal && (
            <div style={{ maxWidth: '940px', margin: '0 auto', padding: '20px 16px 0' }}>
              <WeeklyPathGoalPanel
                goal={weeklyGoal}
                progress={weeklyProgress}
                completedSlots={completedSlots}
                onStartSession={startWeeklySession}
              />
            </div>
          )}
          <StudentLearningPath
            pathOptions={pathOptions}
            skillProgressByTEKS={skillProgressByTEKS}
            // Availability is checked BEFORE the card is drawn, not after the
            // student clicks it. `startSession` still fails closed on top of
            // this; a student should simply never reach that path.
            isCovered={coverageLoaded
              ? (skillId) => isSkillLaunchable(coverage, teksCodeFromSkillId(skillId))
              : null}
            freeChoiceLocked={weeklyFreeChoiceLocked}
            freeChoiceMessage={weeklyFreeChoiceMessage}
            onChooseSkill={(card) => { const code = teksCodeFromSkillId(card.skillId); if (code) startSession(code); }}
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
            teacherPriorities={assessmentContext.teacherPriorities}
            onChangeGoals={changeGoals}
            onPractise={(item) => { const code = teksCodeFromSkillId(item.skillId); if (code) startSession(code, { framework: item.framework }); }}
            onReturnToCourse={() => setActiveTab('path')}
            readOnly={readOnly}
          />
        </div>
      )}
      {activeTab === 'dashboard' && <MyMathPathDashboard studentName={studentName || studentId || 'Student'} masteryProfilesByTEKS={masteryData.masteryProfilesByTEKS} retentionSchedulesByTEKS={masteryData.retentionSchedulesByTEKS} skillProgressByTEKS={skillProgressByTEKS} recommendedTeks={recommendedTeks} courseId={courseId} pathOptions={pathOptions} assessmentContext={assessmentContextWithCoverage} weeklyGoal={weeklyGoal} weeklyProgress={weeklyProgress} completedSlots={completedSlots} onPracticeAs={({ skillId, framework }) => { const code = teksCodeFromSkillId(skillId); if (code) startSession(code, { framework }); }} onStartSession={startSession} onStartWeeklySession={startWeeklySession} onOpenPath={() => setActiveTab('path')} />}
      {activeTab === 'history' && <StudentPracticeHistory evidenceEvents={evidenceEvents} availableTeks={availableTeks} loading={loading} error={historyError} />}
      {activeTab === 'session' && sessionConfig && <MyMathPathProductionContainer {...sessionConfig} studentProfile={studentProfile} sessionProvider={sessionProvider} onSimulationController={onSimulationController} onSimulationEvent={onSimulationEvent} onReturnToDashboard={returnToDashboard} onSessionComplete={() => onReload?.()} />}
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
      fetchStudentEvidenceEvents(studentId),
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

  return (
    <MyMathPathExperience
      {...props}
      masteryData={masteryData}
      evidenceEvents={evidenceEvents}
      skillProgressByTEKS={skillProgressByTEKS}
      loading={loading}
      error={error}
      historyError={historyError}
      onReload={loadState}
    />
  );
};

export default MyMathPathApp;
