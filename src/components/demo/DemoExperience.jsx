import { useMemo, useState } from 'react';
import QuestionEngine from '../../QuestionEngine.jsx';
import PathSessionPlayer from '../student/PathSessionPlayer.jsx';
import { emptyQuestionRecord, getQuestionCardState, normalizeQuestionRecord, recordQuestionAttempt } from '../../attemptPolicy.js';
import { getAssignmentLifecycle, formatDateTime } from '../../assignmentLifecycle.js';
import { createDemoSeed, loadDemoSeed, resetDemoSeed, saveDemoSeed } from '../../demo/demoExperienceData.js';

const card = { border: '1px solid #dde3ea', borderRadius: 12, padding: 16, background: '#fff' };
const pill = (background, color) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 999, background, color, fontSize: 11, fontWeight: 900 });
const button = { padding: '9px 13px', border: '1px solid #c7cdd6', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' };
const primaryButton = { ...button, border: 0, background: '#1a73e8', color: '#fff' };

const readinessStyle = (status) => status === 'advanced'
  ? pill('#e6f4ea', '#137333')
  : status === 'developing' ? pill('#fff4ce', '#7a4f00') : pill('#e8f0fe', '#174ea6');

const titleCase = (value) => value === 'onTrack' ? 'On Track' : String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
const assignmentById = (assignments, id) => assignments.find((assignment) => assignment.id === id);

function DemoAssignmentPlayer({ student, assignment, assignmentState, onBack, onUpdate }) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [tracker, setTracker] = useState(() => Object.fromEntries((assignment.questions || []).map((_, index) => [index, emptyQuestionRecord()])));
  const [scratchpads, setScratchpads] = useState({});
  const lifecycle = getAssignmentLifecycle(assignment, Date.now());
  const alreadyCompleted = assignmentState?.score !== null && assignmentState?.score !== undefined
    && ['Completed', 'Graded', 'Feedback Released'].includes(assignmentState?.status);
  const practiceOnly = lifecycle.isClosed || alreadyCompleted;
  const questions = assignment.questions || [];
  const record = normalizeQuestionRecord(tracker[questionIndex]);
  const historicalResponses = assignmentState?.historicalResponses || {};
  const historicalCorrect = Object.values(historicalResponses).filter((entry) => entry.isCorrect).length;

  const handleGrade = async (isCorrect, questionDetails, parts, supportUsage, responseKey, attemptMetadata = {}) => {
    const outcome = recordQuestionAttempt({
      record: tracker[questionIndex],
      isCorrect,
      questionDetails,
      parts,
      supportUsage,
      responseKey,
      partialCreditPercent: attemptMetadata.partialCreditPercent,
      maximumAttempts: 3,
    });
    const nextTracker = { ...tracker, [questionIndex]: outcome.record };
    setTracker(nextTracker);
    if (!practiceOnly) {
      const terminalCount = questions.filter((_, index) => ['correct', 'expired'].includes(normalizeQuestionRecord(nextTracker[index]).status)).length;
      const correctCount = questions.filter((_, index) => normalizeQuestionRecord(nextTracker[index]).status === 'correct').length;
      const history = Object.fromEntries(questions.map((question, index) => {
        const questionRecord = normalizeQuestionRecord(nextTracker[index]);
        return [question.questionId || String(index), {
          questionIndex: index,
          isCorrect: questionRecord.status === 'correct',
          response: questionRecord.lastResponseKey || '',
          recordedAt: questionRecord.lastAttemptAt || null,
        }];
      }).filter(([, entry]) => entry.response));
      onUpdate(assignment.id, {
        status: terminalCount === questions.length ? 'Completed' : 'In Progress',
        score: terminalCount ? Math.round((correctCount / questions.length) * 100) : null,
        historicalResponses: history,
      });
    }
    return outcome.result;
  };

  const currentState = getQuestionCardState(record);
  return (
    <div style={{ textAlign: 'left' }}>
      <button type="button" onClick={onBack} style={{ ...button, border: 0, paddingLeft: 0, color: '#1a73e8' }}>← Back to {student.name}&apos;s assignments</button>
      <div style={{ ...card, marginTop: 10, marginBottom: 14, background: practiceOnly ? '#f8f9fa' : '#f8fbff', borderColor: practiceOnly ? '#9aa0a6' : '#aecbfa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div><span style={pill(practiceOnly ? '#3c4043' : '#174ea6', '#fff')}>{practiceOnly ? 'PRACTICE MODE' : 'LIVE DEMO ASSIGNMENT'}</span><h2 style={{ margin: '7px 0 4px' }}>{assignment.title}</h2><div style={{ color: '#5f6368' }}>TEKS {assignment.teks} · {assignment.type} · {questions.length} live questions</div></div>
          <div style={{ textAlign: 'right', color: '#5f6368', fontSize: 12 }}>Due {formatDateTime(assignment.dueAt)}<br />Final grading cutoff {formatDateTime(assignment.lateDueAt)}</div>
        </div>
        {practiceOnly ? <p style={{ marginBottom: 0, color: '#3c4043', lineHeight: 1.55 }}><strong>No credit and no tracking.</strong> This session is held only in memory while this screen is open. It does not change the seeded grade, mastery, path recommendations, teacher analytics, or any server data.</p> : <p style={{ marginBottom: 0, color: '#174ea6' }}><strong>Demo credit is active.</strong> Responses update only this synthetic demo student in browser storage—never production data.</p>}
      </div>

      {Object.keys(historicalResponses).length > 0 && (
        <details style={{ ...card, marginBottom: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Seeded historical result: {assignmentState.score}% · {historicalCorrect}/{questions.length} correct</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 8, marginTop: 12 }}>
            {questions.map((question, index) => {
              const seeded = historicalResponses[question.questionId];
              return <div key={question.questionId} style={{ padding: 9, borderRadius: 8, background: seeded?.isCorrect ? '#e6f4ea' : '#fce8e6', color: seeded?.isCorrect ? '#137333' : '#a50e0e' }}><strong>Question {index + 1}</strong><div style={{ fontSize: 11, marginTop: 3 }}>{seeded?.isCorrect ? 'Correct' : 'Missed'} · response {seeded?.response || '—'}</div></div>;
            })}
          </div>
        </details>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
        {questions.map((question, index) => {
          const state = getQuestionCardState(tracker[index]);
          return <button type="button" key={question.questionId} onClick={() => setQuestionIndex(index)} style={{ ...button, border: questionIndex === index ? '3px solid #1a73e8' : '1px solid #dadce0', background: state.background, color: state.color }}><strong>Question {index + 1}</strong><div style={{ fontSize: 10, marginTop: 3 }}>{state.label}</div></button>;
        })}
      </div>

      <section style={{ ...card, padding: 10, minHeight: 480 }}>
        <QuestionEngine
          key={`${assignment.id}-${questionIndex}-${record.variantIndex}`}
          question={questions[questionIndex]}
          questionRecord={tracker[questionIndex]}
          generationKey={`demo|${student.id}|${assignment.id}|${questionIndex}`}
          onGrade={handleGrade}
          onLoadScratchpad={async () => scratchpads[questionIndex] || null}
          onSaveScratchpad={async (dataUrl, metadata) => setScratchpads((current) => ({ ...current, [questionIndex]: { dataUrl, metadata } }))}
          maximumAttempts={3}
          activityRole="practice"
          assignmentLocked={false}
          feedbackReleased
          draftKey={practiceOnly ? null : `mathmaster-demo:${student.id}:${assignment.id}:${questionIndex}`}
          assignmentId={assignment.id}
          executionScope="demo"
        />
      </section>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
        <button type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))} style={{ ...button, opacity: questionIndex === 0 ? 0.45 : 1 }}>← Previous</button>
        <div style={{ color: currentState.color, fontWeight: 900, alignSelf: 'center' }}>{currentState.label}</div>
        <button type="button" disabled={questionIndex >= questions.length - 1} onClick={() => setQuestionIndex((value) => Math.min(questions.length - 1, value + 1))} style={{ ...primaryButton, opacity: questionIndex >= questions.length - 1 ? 0.45 : 1 }}>Next →</button>
      </div>
    </div>
  );
}

function DemoMathPathSession({ student, onBack, onUpdate }) {
  const saved = student.mathPath.demoSession || {};
  const questions = student.mathPath.questions || [];
  const [index, setIndex] = useState(Math.min(Number(saved.index) || 0, Math.max(0, questions.length - 1)));
  const [attempts, setAttempts] = useState(Number(saved.attempts) || 0);
  const [completed, setCompleted] = useState(Number(saved.completed) || 0);
  const [correct, setCorrect] = useState(Number(saved.correct) || 0);
  const [grading, setGrading] = useState(null);
  const current = questions[index];
  const finished = completed >= questions.length && questions.length > 0;
  const session = { sessionKind: 'practice', requiredQuestions: questions.length, target: { alignmentKey: student.mathPath.current }, summary: { completedQuestions: completed, correctQuestions: correct, independentSuccesses: correct } };

  const persist = (patch) => onUpdate({ demoSession: { index, attempts, completed, correct, ...patch } });
  const submit = async (payload) => {
    const response = String(Object.values(payload?.responses || {})[0] ?? '').trim();
    const isCorrect = response === String(current.answerKey);
    const attemptNumber = attempts + 1;
    const finalized = isCorrect || attemptNumber >= 3;
    const result = { isCorrect, attemptNumber, attemptsRemaining: Math.max(0, 3 - attemptNumber), questionFinalized: finalized };
    setGrading(result);
    if (!finalized) {
      setAttempts(attemptNumber);
      persist({ attempts: attemptNumber });
      return;
    }
    const nextCompleted = completed + 1;
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextIndex = Math.min(index + 1, Math.max(0, questions.length - 1));
    setCompleted(nextCompleted);
    setCorrect(nextCorrect);
    setAttempts(0);
    persist({ index: nextIndex, attempts: 0, completed: nextCompleted, correct: nextCorrect });
    if (nextCompleted < questions.length) {
      setIndex(nextIndex);
      setGrading(null);
    }
  };

  if (!questions.length) return <section style={card}><button type="button" onClick={onBack} style={button}>← Back</button><p>No demo path questions are configured.</p></section>;
  if (finished) return <section style={{ ...card, textAlign: 'center', maxWidth: 620, margin: '0 auto' }}><span style={pill('#e6f4ea', '#137333')}>CLIENT-ONLY DEMO PATH</span><h2>Path session complete</h2><p>{correct} of {questions.length} questions were completed correctly. No server request, mastery evidence, or recommendation write was created.</p><button type="button" onClick={onBack} style={primaryButton}>Return to My Math Path</button></section>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><button type="button" onClick={onBack} style={{ ...button, border: 0, color: '#1a73e8' }}>← Back to My Math Path</button><span style={pill('#f3e8fd', '#7627a6')}>LIVE · CLIENT ONLY · NO SERVER DATA</span></div>
      <PathSessionPlayer
        key={current.questionInstanceId}
        session={session}
        questionInstance={{ ...current, attemptsUsed: attempts }}
        lastGradingResult={grading}
        isSubmitting={false}
        studentProfile={student.supportLabel?.includes('504') ? { inclusionStatus: true, accommodations: ['extra-time'] } : {}}
        onSubmitAnswer={submit}
      />
    </div>
  );
}

function DemoStudentView({ student, classInfo, assignments, onBack, onAssignmentUpdate, onPathUpdate, initialAssignmentId = null, initialTab = 'today' }) {
  const [tab, setTab] = useState(initialTab);
  const [activeAssignmentId, setActiveAssignmentId] = useState(initialAssignmentId);
  const [pathSessionOpen, setPathSessionOpen] = useState(false);
  const studentAssignments = assignments.filter((assignment) => student.assignments?.[assignment.id]);
  const activeAssignment = assignmentById(assignments, activeAssignmentId);

  if (activeAssignment) return <DemoAssignmentPlayer student={student} assignment={activeAssignment} assignmentState={student.assignments[activeAssignment.id]} onBack={() => setActiveAssignmentId(null)} onUpdate={(assignmentId, patch) => onAssignmentUpdate(student.id, assignmentId, patch)} />;
  if (pathSessionOpen) return <DemoMathPathSession student={student} onBack={() => setPathSessionOpen(false)} onUpdate={(patch) => onPathUpdate(student.id, patch)} />;

  const currentWaiting = studentAssignments.find((assignment) => {
    const state = student.assignments[assignment.id];
    const lifecycle = getAssignmentLifecycle(assignment, Date.now());
    return !lifecycle.isClosed && state?.score == null;
  });

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <div><button type="button" onClick={onBack} style={{ border: 0, background: 'transparent', color: '#1a73e8', fontWeight: 800, padding: 0, cursor: 'pointer' }}>← Demo Teacher Account</button><h2 style={{ margin: '7px 0 2px' }}>{student.name}</h2><div style={{ color: '#5f6368' }}>{classInfo?.name} · {student.purpose}</div></div>
        <span style={pill('#f3e8fd', '#7627a6')}>VIEW AS DEMO STUDENT</span>
      </div>
      <nav aria-label="Demo student sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {['today', 'assignments', 'path', 'progress', 'readiness'].map((key) => <button key={key} type="button" onClick={() => setTab(key)} style={{ ...button, borderColor: tab === key ? '#1a73e8' : '#dadce0', background: tab === key ? '#e8f0fe' : '#fff', color: tab === key ? '#174ea6' : '#3c4043' }}>{key === 'path' ? 'My Math Path' : key === 'readiness' ? 'CCMR Readiness' : titleCase(key)}</button>)}
      </nav>

      {tab === 'today' && <div style={{ display: 'grid', gap: 14 }}>
        {student.isFreshAccount && <section style={{ ...card, background: '#e6f4ea', borderColor: '#81c995' }}><strong style={{ color: '#137333' }}>Fresh student account</strong><h3 style={{ margin: '6px 0' }}>No prior grades or mastery evidence</h3><p style={{ marginBottom: 0 }}>This is the clean first-login experience. The student has one current assignment waiting and a starting diagnostic in My Math Path.</p></section>}
        {currentWaiting && <section style={{ ...card, background: '#fff8e1', borderColor: '#f9ab00' }}><div style={{ color: '#7a4f00', fontSize: 11, fontWeight: 900 }}>CURRENT ASSIGNMENT WAITING</div><h3 style={{ margin: '6px 0' }}>{currentWaiting.title}</h3><p style={{ color: '#5f6368' }}>Due {formatDateTime(currentWaiting.dueAt)}</p><button type="button" onClick={() => setActiveAssignmentId(currentWaiting.id)} style={primaryButton}>Start live assignment</button></section>}
        <section style={{ ...card, background: '#f8fbff', borderColor: '#aecbfa' }}><div style={{ color: '#174ea6', fontSize: 11, fontWeight: 900 }}>RECOMMENDED NEXT</div><h3 style={{ margin: '6px 0' }}>{student.mathPath.current}</h3><p style={{ margin: '0 0 12px', color: '#5f6368' }}>{student.mathPath.recommendation}</p><button type="button" onClick={() => { setTab('path'); setPathSessionOpen(true); }} style={primaryButton}>Open live My Math Path</button></section>
      </div>}

      {tab === 'assignments' && <div style={{ display: 'grid', gap: 9 }}>{studentAssignments.map((assignment) => {
        const state = student.assignments[assignment.id];
        const lifecycle = getAssignmentLifecycle(assignment, Date.now());
        return <article key={assignment.id} style={{ ...card, padding: '13px 15px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><strong>{assignment.title}</strong><div style={{ color: '#5f6368', fontSize: 12, marginTop: 3 }}>{assignment.type} · TEKS {assignment.teks} · {assignment.questions.length} questions</div><div style={{ marginTop: 4 }}><span style={pill(lifecycle.isClosed ? '#f1f3f4' : '#e6f4ea', lifecycle.isClosed ? '#3c4043' : '#137333')}>{lifecycle.isClosed ? 'Practice after deadline' : 'Live / current'}</span></div></div><div style={{ textAlign: 'right' }}><span style={pill('#f1f3f4', '#3c4043')}>{state.status}</span><div style={{ margin: '4px 0 8px', fontWeight: 900 }}>{state.score == null ? '—' : `${state.score}%`}</div><button type="button" onClick={() => setActiveAssignmentId(assignment.id)} style={lifecycle.isClosed || state.score != null ? button : primaryButton}>{lifecycle.isClosed || state.score != null ? 'Open Practice' : 'Start Assignment'}</button></div></article>;
      })}</div>}

      {tab === 'path' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}><section style={{ ...card, background: '#f8fbff' }}><div style={{ color: '#174ea6', fontSize: 11, fontWeight: 900 }}>CURRENT PATH</div><h3>{student.mathPath.current}</h3><p style={{ color: '#5f6368' }}>{student.mathPath.recommendation}</p><strong>Next: {student.mathPath.next}</strong><div style={{ marginTop: 16 }}><button type="button" onClick={() => setPathSessionOpen(true)} style={primaryButton}>{student.mathPath.demoSession?.completed ? 'Continue live path' : 'Start live path'}</button></div><p style={{ color: '#7627a6', fontSize: 12 }}>Demo path sessions run entirely in this browser and never call the production My Math Path server.</p></section><section style={card}><h3 style={{ marginTop: 0 }}>Path history</h3>{student.mathPath.history.length ? student.mathPath.history.map((entry) => <div key={entry} style={{ padding: '9px 0', borderBottom: '1px solid #eef0f2' }}>{entry}</div>) : <p style={{ color: '#5f6368' }}>No path history yet. This is a fresh student account.</p>}</section></div>}

      {tab === 'progress' && <section style={card}><h3 style={{ marginTop: 0 }}>Domain readiness</h3><p style={{ color: '#5f6368' }}>Readiness is evidence-driven by domain; it does not change the student&apos;s course placement.</p>{Object.keys(student.domainReadiness).length ? <div style={{ display: 'grid', gap: 9 }}>{Object.entries(student.domainReadiness).map(([domain, status]) => <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #eef0f2' }}><strong>{domain}</strong><span style={readinessStyle(status)}>{titleCase(status)}</span></div>)}</div> : <div style={{ padding: 16, borderRadius: 9, background: '#f1f3f4', color: '#5f6368' }}>No mastery evidence yet.</div>}</section>}
      {tab === 'readiness' && <section style={card}><h3 style={{ marginTop: 0 }}>College & career readiness</h3><p style={{ color: '#5f6368' }}>Synthetic preparation indices for demonstration only.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>{[['SAT', student.readiness.sat], ['ACT', student.readiness.act], ['TSIA2', student.readiness.tsia2]].map(([label, score]) => <div key={label} style={{ padding: 14, background: '#f8f9fa', borderRadius: 9 }}><div style={{ fontSize: 12, color: '#5f6368', fontWeight: 800 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 900 }}>{score}</div></div>)}</div><div style={{ marginTop: 12, color: '#5f6368' }}>Evidence confidence: <strong>{student.readiness.confidence}</strong></div></section>}
    </div>
  );
}

const PRESENTATION_STEPS = [
  { title: '1. Demo teacher account', body: 'Start with a real synthetic teacher identity, four classes, live assignments, student records, and Math Path state.' },
  { title: '2. Live assignment engine', body: 'Open the blank student and complete the current assignment. Historical students can reopen expired work in no-credit Practice Mode.' },
  { title: '3. Live My Math Path', body: 'Open a populated student path and answer questions. The entire session stays client-only and never touches production path services.' },
  { title: '4. Differentiation story', body: 'Compare Morgan (advanced readiness in Standard), Taylor (Honors), and Riley (Honors with a developing Systems domain).' },
];

export default function DemoExperience() {
  const [demoState, setDemoState] = useState(() => loadDemoSeed());
  const [studentId, setStudentId] = useState(null);
  const [studentInitialAssignment, setStudentInitialAssignment] = useState(null);
  const [studentInitialTab, setStudentInitialTab] = useState('today');
  const [selectedClass, setSelectedClass] = useState('all');
  const [teacherSection, setTeacherSection] = useState('overview');
  const [presentationStep, setPresentationStep] = useState(null);
  const student = demoState.students.find((entry) => entry.id === studentId) || null;
  const classById = useMemo(() => Object.fromEntries(demoState.classes.map((entry) => [entry.id, entry])), [demoState.classes]);
  const visibleStudents = selectedClass === 'all' ? demoState.students : demoState.students.filter((entry) => entry.classId === selectedClass);

  const commit = (next) => { setDemoState(next); saveDemoSeed(next); };
  const updateStudentAssignment = (targetStudentId, assignmentId, patch) => commit({ ...demoState, students: demoState.students.map((entry) => entry.id !== targetStudentId ? entry : { ...entry, assignments: { ...entry.assignments, [assignmentId]: { ...entry.assignments?.[assignmentId], ...patch } } }) });
  const updateStudentPath = (targetStudentId, patch) => commit({ ...demoState, students: demoState.students.map((entry) => entry.id !== targetStudentId ? entry : { ...entry, mathPath: { ...entry.mathPath, ...patch } }) });
  const openStudent = (id, { assignmentId = null, tab = 'today' } = {}) => { setStudentId(id); setStudentInitialAssignment(assignmentId); setStudentInitialTab(tab); };
  const returnToTeacher = () => { setStudentId(null); setStudentInitialAssignment(null); setStudentInitialTab('today'); };
  const reset = () => { const next = resetDemoSeed(); setDemoState(next); returnToTeacher(); setPresentationStep(null); };

  if (student) return <div style={{ textAlign: 'left' }}><div role="status" style={{ marginBottom: 18, padding: '11px 14px', border: '2px solid #7627a6', borderRadius: 10, background: '#f8f0fc', color: '#5d1d82', fontWeight: 900 }}>DEMO MODE — Synthetic account. Production records will not be changed.</div><DemoStudentView key={`${student.id}-${studentInitialAssignment || studentInitialTab}`} student={student} classInfo={classById[student.classId]} assignments={demoState.assignments} onBack={returnToTeacher} onAssignmentUpdate={updateStudentAssignment} onPathUpdate={updateStudentPath} initialAssignmentId={studentInitialAssignment} initialTab={studentInitialTab} /></div>;

  const activeAssignments = demoState.assignments.filter((assignment) => !getAssignmentLifecycle(assignment, Date.now()).isClosed);
  const seededResults = demoState.students.reduce((count, entry) => count + Object.values(entry.assignments || {}).filter((state) => state.score != null).length, 0);

  return (
    <div style={{ textAlign: 'left' }}>
      <div role="status" style={{ marginBottom: 18, padding: '11px 14px', border: '2px solid #7627a6', borderRadius: 10, background: '#f8f0fc', color: '#5d1d82', fontWeight: 900 }}>DEMO MODE — Everything below is synthetic and isolated from production student data.</div>
      <section style={{ ...card, marginBottom: 18, background: '#202124', color: '#fff', border: 0 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}><div><div style={{ color: '#c6dafc', fontSize: 11, fontWeight: 900 }}>DEMO TEACHER ACCOUNT</div><h2 style={{ margin: '5px 0 2px' }}>{demoState.teacher.name}</h2><div style={{ color: '#dadce0' }}>{demoState.teacher.email} · 4 demo classes</div></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={() => setPresentationStep((value) => value == null ? 0 : null)} style={{ ...button, borderColor: '#c7a9ea', background: '#f8f0fc', color: '#6f2da8' }}>{presentationStep == null ? 'Start Guided Presentation' : 'Exit Guided Presentation'}</button><button type="button" onClick={reset} style={{ ...button, borderColor: '#f28b82', color: '#b3261e' }}>Reset Demo Classroom</button></div></div></section>

      {presentationStep != null && <section style={{ ...card, marginBottom: 18, border: '3px solid #9334e6', background: '#fbf7ff' }}><div style={{ color: '#7627a6', fontSize: 11, fontWeight: 900 }}>GUIDED PRESENTATION · {presentationStep + 1} OF {PRESENTATION_STEPS.length}</div><h2 style={{ margin: '6px 0' }}>{PRESENTATION_STEPS[presentationStep].title}</h2><p style={{ color: '#5f6368', lineHeight: 1.55 }}>{PRESENTATION_STEPS[presentationStep].body}</p>{presentationStep === 1 && <button type="button" onClick={() => openStudent('fresh', { assignmentId: 'equations-classwork', tab: 'assignments' })} style={primaryButton}>Open blank student&apos;s live assignment</button>}{presentationStep === 2 && <button type="button" onClick={() => openStudent('alex', { tab: 'path' })} style={primaryButton}>Open Alex&apos;s live My Math Path</button>}{presentationStep === 3 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{['morgan', 'taylor', 'riley'].map((id) => <button type="button" key={id} onClick={() => openStudent(id, { tab: 'progress' })} style={button}>View {demoState.students.find((entry) => entry.id === id)?.name}</button>)}</div>}<div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}><button type="button" disabled={presentationStep === 0} onClick={() => setPresentationStep((value) => Math.max(0, value - 1))} style={{ ...button, opacity: presentationStep === 0 ? 0.45 : 1 }}>← Previous</button><button type="button" disabled={presentationStep === PRESENTATION_STEPS.length - 1} onClick={() => setPresentationStep((value) => Math.min(PRESENTATION_STEPS.length - 1, value + 1))} style={{ ...primaryButton, opacity: presentationStep === PRESENTATION_STEPS.length - 1 ? 0.45 : 1 }}>Next →</button></div></section>}

      <nav aria-label="Demo teacher account sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>{[['overview', 'Overview'], ['students', 'Students'], ['assignments', 'Assignments'], ['paths', 'Student Paths']].map(([key, label]) => <button key={key} type="button" onClick={() => setTeacherSection(key)} style={{ ...button, background: teacherSection === key ? '#e8f0fe' : '#fff', color: teacherSection === key ? '#174ea6' : '#3c4043', borderColor: teacherSection === key ? '#1a73e8' : '#c7cdd6' }}>{label}</button>)}</nav>

      {teacherSection === 'overview' && <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 18 }}>{[[demoState.students.length, 'Demo students'], [demoState.assignments.length, 'Live JSON assignments'], [activeAssignments.length, 'Current assignments'], [seededResults, 'Seeded results backed by answers']].map(([value, label]) => <div key={label} style={card}><div style={{ fontSize: 28, fontWeight: 1000, color: '#174ea6' }}>{value}</div><div style={{ color: '#5f6368', fontSize: 12 }}>{label}</div></div>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>{demoState.classes.map((classItem) => <button key={classItem.id} type="button" onClick={() => { setSelectedClass((value) => value === classItem.id ? 'all' : classItem.id); setTeacherSection('students'); }} style={{ ...card, textAlign: 'left', cursor: 'pointer' }}><strong>{classItem.name}</strong><div style={{ marginTop: 8, color: '#5f6368', fontSize: 12 }}>{classItem.courseLevel === 'honors' ? 'Honors rigor contract' : 'Standard course'} · {demoState.students.filter((entry) => entry.classId === classItem.id).length} students</div></button>)}</div></>}

      {teacherSection === 'students' && <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Demo students</h3>{selectedClass !== 'all' && <button type="button" onClick={() => setSelectedClass('all')} style={button}>Show all classes</button>}</div><div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ background: '#f8f9fa' }}><th style={{ textAlign: 'left', padding: 10 }}>Student</th><th style={{ textAlign: 'left' }}>Course</th><th>Mastery</th><th style={{ textAlign: 'left' }}>Path</th><th></th></tr></thead><tbody>{visibleStudents.map((entry) => <tr key={entry.id} style={{ borderBottom: '1px solid #eef0f2' }}><td style={{ padding: 10 }}><strong>{entry.name}</strong><div style={{ color: '#5f6368', fontSize: 11 }}>{entry.purpose}</div></td><td style={{ fontSize: 12 }}>{classById[entry.classId]?.name}</td><td style={{ textAlign: 'center', fontWeight: 900 }}>{entry.overallMastery == null ? '—' : `${entry.overallMastery}%`}</td><td style={{ fontSize: 12 }}>{entry.mathPath.current}</td><td style={{ textAlign: 'right' }}><button type="button" onClick={() => openStudent(entry.id)} style={primaryButton}>View as Student</button></td></tr>)}</tbody></table></div></section>}

      {teacherSection === 'assignments' && <section style={card}><h3 style={{ marginTop: 0 }}>Prebuilt live assignment JSON</h3><p style={{ color: '#5f6368' }}>Every card below has a real question set. Open a student to run the same QuestionEngine used by the platform.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 9 }}>{demoState.assignments.map((assignment) => { const lifecycle = getAssignmentLifecycle(assignment, Date.now()); return <div key={assignment.id} style={{ padding: 12, border: '1px solid #eef0f2', borderRadius: 9 }}><strong>{assignment.title}</strong><div style={{ marginTop: 4, color: '#5f6368', fontSize: 12 }}>{assignment.type} · {assignment.questions.length} questions · TEKS {assignment.teks}</div><div style={{ marginTop: 6 }}><span style={pill(lifecycle.isClosed ? '#f1f3f4' : '#e6f4ea', lifecycle.isClosed ? '#3c4043' : '#137333')}>{lifecycle.isClosed ? 'Practice after deadline' : 'Current'}</span></div></div>; })}</div></section>}

      {teacherSection === 'paths' && <section style={card}><h3 style={{ marginTop: 0 }}>Live student paths</h3><p style={{ color: '#5f6368' }}>Each path has five interactive questions. The demo runner never imports the production path-session service and never sends path attempts to the server.</p><div style={{ display: 'grid', gap: 9 }}>{demoState.students.map((entry) => <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #eef0f2', padding: '10px 0' }}><div><strong>{entry.name}</strong><div style={{ color: '#5f6368', fontSize: 12 }}>{entry.mathPath.current} · {entry.mathPath.questions.length} live questions</div></div><button type="button" onClick={() => openStudent(entry.id, { tab: 'path' })} style={button}>Open Path</button></div>)}</div></section>}
    </div>
  );
}

export const freshDemoStateForTests = () => createDemoSeed();
