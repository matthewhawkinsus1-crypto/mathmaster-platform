import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MyMathPathDashboard from './MyMathPathDashboard.jsx';
import StudentLearningPath from './StudentLearningPath.jsx';
import CCMRHub from './CCMRHub.jsx';
import MyMathPathProductionContainer from './MyMathPathProductionContainer.jsx';
import StudentPracticeHistory from './StudentPracticeHistory.jsx';
import { fetchStudentMasteryState } from '../../services/masteryStateService.js';
import { fetchStudentEvidenceEvents } from '../../platform/history/evidencePersistence.js';
import { toCanonicalKey, toDisplayCode } from '../../utils/teksUtils.js';
import { curateStudentPanel } from '../../platform/path/studentPanel.js';
import { teksCodeFromSkillId } from '../../platform/path/skillGraph.js';
import { DEFAULT_MASTERY_COURSE_ID, getWheelTeksForCourse } from '../../platform/mastery/strandConfig.js';
import {
  buildStudentAssessmentContext, readCcmrGoals, writeCcmrGoals,
} from '../../platform/ccmr/studentAssessmentContext.js';

// The mastery-status priority list this used to be was a second, competing
// idea of what to recommend, sitting beside the path engine and able to
// disagree with it. Two answers to the same question is the divergence the
// adaptive brief warns about, so the engine is asked first and this remains
// only as the fallback for when it has nothing to say — no pacing set, or a
// course with no graph.
const chooseFallbackTeks = (profiles = {}, courseId = DEFAULT_MASTERY_COURSE_ID) => {
  const inCourse = new Set(getWheelTeksForCourse(courseId));
  const priority = ['Needs Attention', 'Developing', 'Not Enough Evidence', 'Secure', 'Mastered'];
  const entries = Object.entries(profiles).filter(([code]) => inCourse.has(toDisplayCode(code)));
  for (const status of priority) {
    const match = entries.find(([, profile]) => profile?.mastery?.status === status);
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
  return code || chooseFallbackTeks(profiles, courseId);
};

export const MyMathPathExperience = ({
  studentId, studentName, studentProfile = null, assignments = null,
  // A skill chosen from Recommended for You. Opening straight into practice on
  // it is the whole point of the panel — otherwise a student picks a skill and
  // is dropped on a mastery map to find it again.
  launchTeksCode = null,
  pathOptions = null,
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
  // The Teacher Path Simulator forces assessment evidence directly — "what
  // does this student's SAT wheel look like at 45%?" — so it supplies the
  // whole context rather than having one derived from a synthetic document.
  assessmentContextOverride = null,
  loading = false,
  error = null,
  historyError = null,
  onReload = null,
  onExit = null,
}) => {
  // The path is the default view. The mastery wheel is an overview of what has
  // been learned; the path is what to do next, which is the question a student
  // arrives with.
  const [activeTab, setActiveTab] = useState('path');
  const [sessionConfig, setSessionConfig] = useState(null);

  const recommendedTeks = useMemo(
    () => chooseRecommendedTeks({ profiles: masteryData.masteryProfilesByTEKS, pathOptions, courseId }),
    [masteryData.masteryProfilesByTEKS, pathOptions, courseId],
  );
  const availableTeks = useMemo(() => Object.keys(masteryData.masteryProfilesByTEKS).map(toDisplayCode), [masteryData.masteryProfilesByTEKS]);

  // CCMR. The components have existed since Batch 9; what was missing was any
  // route a student could take to reach them, and the evidence to fill them.
  const [goals, setGoals] = useState(() => readCcmrGoals(studentId));
  const assessmentContext = useMemo(() => (assessmentContextOverride || buildStudentAssessmentContext({
    student: studentRecord,
    assignments,
    goals,
    teacherPriorities: teacherAssessmentPriorities,
  })), [assessmentContextOverride, studentRecord, assignments, goals, teacherAssessmentPriorities]);
  const changeGoals = useCallback((next) => {
    setGoals(next);
    writeCcmrGoals(studentId, next);
  }, [studentId]);

  const startSession = (teksCode, options = {}) => {
    setSessionConfig({
      targetAlignmentKey: toCanonicalKey(teksCode),
      sessionKind: options.sessionKind || 'practice',
      requiredQuestions: options.requiredQuestions || (options.sessionKind === 'retentionProbe' ? 2 : 5),
    });
    setActiveTab('session');
  };

  // Launch once per target. Without the ref a return to the dashboard would
  // immediately bounce the student back into the session they just left.
  const launchedRef = useRef(null);
  useEffect(() => {
    if (!launchTeksCode || launchedRef.current === launchTeksCode) return;
    launchedRef.current = launchTeksCode;
    startSession(launchTeksCode);
  }, [launchTeksCode]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span aria-hidden="true">📐</span><strong>My Math Path</strong></div>
          <nav aria-label="My Math Path navigation" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {TABS.map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: '19px 8px 16px', border: 0, borderBottom: `3px solid ${activeTab === tab ? '#1a73e8' : 'transparent'}`, background: 'transparent', color: activeTab === tab ? '#174ea6' : '#5f6368', fontWeight: 900, cursor: 'pointer' }}>{label}</button>)}
            {onExit && <button type="button" onClick={onExit} style={{ marginLeft: '6px', padding: '8px 11px', border: '1px solid #bdc1c6', borderRadius: '7px', background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' }}>Assignments</button>}
          </nav>
        </header>
      )}

      {error && <div role="alert" style={{ maxWidth: '940px', margin: '16px auto', padding: '12px 14px', borderRadius: '8px', background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}
      {activeTab === 'path' && (
        <StudentLearningPath
          pathOptions={pathOptions}
          onChooseSkill={(card) => { const code = teksCodeFromSkillId(card.skillId); if (code) startSession(code); }}
          assessmentContext={assessmentContext}
          onPracticeAs={({ skillId, framework }) => {
            const code = teksCodeFromSkillId(skillId);
            if (code) startSession(code, { framework });
          }}
        />
      )}
      {activeTab === 'ccmr' && (
        <div style={{ maxWidth: '940px', margin: '0 auto', padding: '20px 16px 40px' }}>
          <CCMRHub
            pathOptions={pathOptions}
            assessmentEvidence={assessmentContext.assessmentEvidence}
            directIndex={assessmentContext.directIndex}
            goals={assessmentContext.goals}
            teacherPriorities={assessmentContext.teacherPriorities}
            onChangeGoals={changeGoals}
            onPractise={(item) => { const code = teksCodeFromSkillId(item.skillId); if (code) startSession(code, { framework: item.framework }); }}
            onReturnToCourse={() => setActiveTab('path')}
          />
        </div>
      )}
      {activeTab === 'dashboard' && <MyMathPathDashboard studentName={studentName || studentId || 'Student'} masteryProfilesByTEKS={masteryData.masteryProfilesByTEKS} retentionSchedulesByTEKS={masteryData.retentionSchedulesByTEKS} recommendedTeks={recommendedTeks} courseId={courseId} pathOptions={pathOptions} assessmentContext={assessmentContext} onPracticeAs={({ skillId, framework }) => { const code = teksCodeFromSkillId(skillId); if (code) startSession(code, { framework }); }} onStartSession={startSession} />}
      {activeTab === 'history' && <StudentPracticeHistory evidenceEvents={evidenceEvents} availableTeks={availableTeks} loading={loading} error={historyError} />}
      {activeTab === 'session' && sessionConfig && <MyMathPathProductionContainer {...sessionConfig} studentProfile={studentProfile} onReturnToDashboard={returnToDashboard} onSessionComplete={() => onReload?.()} />}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [masteryResult, historyResult] = await Promise.allSettled([
      fetchStudentMasteryState(studentId, { assignments }),
      fetchStudentEvidenceEvents(studentId),
    ]);
    if (masteryResult.status === 'fulfilled') setMasteryData(masteryResult.value);
    else setError(masteryResult.reason?.message || 'Mastery data is unavailable.');
    if (historyResult.status === 'fulfilled') { setEvidenceEvents(historyResult.value); setHistoryError(null); }
    else setHistoryError(historyResult.reason?.message || 'Practice history is temporarily unavailable.');
    setLoading(false);
  }, [studentId, assignments]);

  useEffect(() => { loadState(); }, [loadState]);

  return (
    <MyMathPathExperience
      {...props}
      masteryData={masteryData}
      evidenceEvents={evidenceEvents}
      loading={loading}
      error={error}
      historyError={historyError}
      onReload={loadState}
    />
  );
};

export default MyMathPathApp;
