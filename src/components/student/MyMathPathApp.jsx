import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MyMathPathDashboard from './MyMathPathDashboard.jsx';
import MyMathPathProductionContainer from './MyMathPathProductionContainer.jsx';
import StudentPracticeHistory from './StudentPracticeHistory.jsx';
import { fetchStudentMasteryState } from '../../services/masteryStateService.js';
import { fetchStudentEvidenceEvents } from '../../platform/history/evidencePersistence.js';
import { toCanonicalKey, toDisplayCode } from '../../utils/teksUtils.js';
import { curateStudentPanel } from '../../platform/path/studentPanel.js';
import { teksCodeFromSkillId } from '../../platform/path/skillGraph.js';
import { DEFAULT_MASTERY_COURSE_ID, getWheelTeksForCourse } from '../../platform/mastery/strandConfig.js';

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

const chooseRecommendedTeks = ({ profiles, pathOptions, courseId }) => {
  const panel = pathOptions ? curateStudentPanel(pathOptions) : null;
  const engineChoice = panel?.best?.skillId || panel?.strengthen?.skillId || null;
  const code = engineChoice ? teksCodeFromSkillId(engineChoice) : null;
  return code || chooseFallbackTeks(profiles, courseId);
};

export const MyMathPathApp = ({
  studentId, studentName, studentProfile = null, assignments = null,
  // A skill chosen from Recommended for You. Opening straight into practice on
  // it is the whole point of the panel — otherwise a student picks a skill and
  // is dropped on a mastery map to find it again.
  launchTeksCode = null,
  pathOptions = null,
  // The course this student is enrolled in. It drives the mastery wheel and
  // every fallback, so an Algebra II student never meets Algebra I content.
  courseId = DEFAULT_MASTERY_COURSE_ID,
  onExit = null,
}) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sessionConfig, setSessionConfig] = useState(null);
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

  const recommendedTeks = useMemo(
    () => chooseRecommendedTeks({ profiles: masteryData.masteryProfilesByTEKS, pathOptions, courseId }),
    [masteryData.masteryProfilesByTEKS, pathOptions, courseId],
  );
  const availableTeks = useMemo(() => Object.keys(masteryData.masteryProfilesByTEKS).map(toDisplayCode), [masteryData.masteryProfilesByTEKS]);

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
    setActiveTab('dashboard');
    loadState();
  };

  if (loading && !Object.keys(masteryData.masteryProfilesByTEKS).length) return <div style={{ padding: '60px', textAlign: 'center', color: '#174ea6' }}>Loading My Math Path…</div>;

  return (
    <div style={{ minHeight: '100%', background: '#f8f9fa' }}>
      {activeTab !== 'session' && (
        <header style={{ minHeight: '60px', padding: '0 20px', borderBottom: '1px solid #dadce0', background: '#fff', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span aria-hidden="true">📐</span><strong>My Math Path</strong></div>
          <nav aria-label="My Math Path navigation" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {['dashboard', 'history'].map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: '19px 8px 16px', border: 0, borderBottom: `3px solid ${activeTab === tab ? '#1a73e8' : 'transparent'}`, background: 'transparent', color: activeTab === tab ? '#174ea6' : '#5f6368', fontWeight: 900, cursor: 'pointer' }}>{tab === 'dashboard' ? 'Mastery Map' : 'Practice History'}</button>)}
            {onExit && <button type="button" onClick={onExit} style={{ marginLeft: '6px', padding: '8px 11px', border: '1px solid #bdc1c6', borderRadius: '7px', background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' }}>Assignments</button>}
          </nav>
        </header>
      )}

      {error && <div role="alert" style={{ maxWidth: '940px', margin: '16px auto', padding: '12px 14px', borderRadius: '8px', background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}
      {activeTab === 'dashboard' && <MyMathPathDashboard studentName={studentName || studentId || 'Student'} masteryProfilesByTEKS={masteryData.masteryProfilesByTEKS} retentionSchedulesByTEKS={masteryData.retentionSchedulesByTEKS} recommendedTeks={recommendedTeks} courseId={courseId} onStartSession={startSession} />}
      {activeTab === 'history' && <StudentPracticeHistory evidenceEvents={evidenceEvents} availableTeks={availableTeks} loading={loading} error={historyError} />}
      {activeTab === 'session' && sessionConfig && <MyMathPathProductionContainer {...sessionConfig} studentProfile={studentProfile} onReturnToDashboard={returnToDashboard} onSessionComplete={() => loadState()} />}
    </div>
  );
};

export default MyMathPathApp;
