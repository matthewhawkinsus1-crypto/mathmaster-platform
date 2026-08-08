import { useMemo, useState } from 'react';
import { createDemoSeed, loadDemoSeed, resetDemoSeed, saveDemoSeed } from '../../demo/demoExperienceData.js';

const card = {
  border: '1px solid #dde3ea',
  borderRadius: 12,
  padding: 16,
  background: '#fff',
};

const pill = (background, color) => ({
  display: 'inline-block', padding: '3px 8px', borderRadius: 999, background, color, fontSize: 11, fontWeight: 900,
});

const readinessStyle = (status) => status === 'advanced'
  ? pill('#e6f4ea', '#137333')
  : status === 'developing'
    ? pill('#fff4ce', '#7a4f00')
    : pill('#e8f0fe', '#174ea6');

const titleCase = (value) => value === 'onTrack' ? 'On Track' : value.charAt(0).toUpperCase() + value.slice(1);

function DemoStudentView({ student, classInfo, assignments, onBack, onUpdate }) {
  const [tab, setTab] = useState('today');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const studentAssignments = assignments.filter((assignment) => student.assignments?.[assignment.id]);

  const recordDemoAnswer = () => {
    const correct = String(answer).trim() === '12';
    setFeedback(correct ? 'Correct — demo evidence recorded only in the synthetic workspace.' : 'Not yet. Try solving 3x + 4 = 40.');
    if (correct) onUpdate(student.id, 'equations-classwork', { status: 'Completed', score: 100, demoAttempted: true });
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <button type="button" onClick={onBack} style={{ border: 0, background: 'transparent', color: '#1a73e8', fontWeight: 800, padding: 0, cursor: 'pointer' }}>← Demo Teacher</button>
          <h2 style={{ margin: '7px 0 2px' }}>{student.name}</h2>
          <div style={{ color: '#5f6368' }}>{classInfo?.name} · {student.purpose}</div>
        </div>
        <span style={pill('#f3e8fd', '#7627a6')}>VIEW AS DEMO STUDENT</span>
      </div>

      <nav aria-label="Demo student sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {[
          ['today', 'Today'], ['assignments', 'Assignments'], ['path', 'My Math Path'], ['progress', 'Progress'], ['readiness', 'CCMR Readiness'],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={{ padding: '9px 13px', borderRadius: 8, border: tab === key ? '1px solid #1a73e8' : '1px solid #dadce0', background: tab === key ? '#e8f0fe' : '#fff', color: tab === key ? '#174ea6' : '#3c4043', fontWeight: 800, cursor: 'pointer' }}>{label}</button>
        ))}
      </nav>

      {tab === 'today' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <section style={{ ...card, background: '#f8fbff', borderColor: '#aecbfa' }}>
            <div style={{ color: '#174ea6', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Recommended next</div>
            <h3 style={{ margin: '6px 0' }}>{student.mathPath.current}</h3>
            <p style={{ margin: 0, color: '#5f6368' }}>{student.mathPath.recommendation}</p>
          </section>
          <section style={card}>
            <h3 style={{ marginTop: 0 }}>Try a real demo interaction</h3>
            <p>Solve <strong>3x + 4 = 40</strong>. This answer is stored only in the isolated demo workspace.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={answer} onChange={(event) => { setAnswer(event.target.value); setFeedback(null); }} inputMode="numeric" aria-label="Demo equation answer" placeholder="x = ?" style={{ padding: '10px 12px', border: '1px solid #bdc7d6', borderRadius: 8, fontSize: 16 }} />
              <button type="button" onClick={recordDemoAnswer} style={{ padding: '10px 15px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900 }}>Check demo answer</button>
            </div>
            {feedback && <p role="status" style={{ marginBottom: 0, color: feedback.startsWith('Correct') ? '#137333' : '#b06000', fontWeight: 800 }}>{feedback}</p>}
          </section>
        </div>
      )}

      {tab === 'assignments' && (
        <div style={{ display: 'grid', gap: 9 }}>
          {studentAssignments.map((assignment) => {
            const state = student.assignments[assignment.id];
            return <article key={assignment.id} style={{ ...card, padding: '13px 15px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><strong>{assignment.title}</strong><div style={{ color: '#5f6368', fontSize: 12, marginTop: 3 }}>{assignment.type} · TEKS {assignment.teks}</div></div><div style={{ textAlign: 'right' }}><span style={pill('#f1f3f4', '#3c4043')}>{state.status}</span><div style={{ marginTop: 4, fontWeight: 900 }}>{state.score == null ? '—' : `${state.score}%`}</div></div></article>;
          })}
        </div>
      )}

      {tab === 'path' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <section style={{ ...card, background: '#f8fbff' }}><div style={{ color: '#174ea6', fontSize: 11, fontWeight: 900 }}>CURRENT PATH</div><h3>{student.mathPath.current}</h3><p style={{ color: '#5f6368' }}>{student.mathPath.recommendation}</p><strong>Next: {student.mathPath.next}</strong></section>
          <section style={card}><h3 style={{ marginTop: 0 }}>Path history</h3>{student.mathPath.history.map((entry) => <div key={entry} style={{ padding: '9px 0', borderBottom: '1px solid #eef0f2' }}>{entry}</div>)}</section>
        </div>
      )}

      {tab === 'progress' && (
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Domain readiness</h3>
          <p style={{ color: '#5f6368' }}>Readiness is evidence-driven by domain; it does not change the student&apos;s course placement.</p>
          <div style={{ display: 'grid', gap: 9 }}>{Object.entries(student.domainReadiness).map(([domain, status]) => <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #eef0f2' }}><strong>{domain}</strong><span style={readinessStyle(status)}>{titleCase(status)}</span></div>)}</div>
        </section>
      )}

      {tab === 'readiness' && (
        <section style={card}><h3 style={{ marginTop: 0 }}>College & career readiness</h3><p style={{ color: '#5f6368' }}>Synthetic preparation indices for demonstration only.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>{[['SAT', student.readiness.sat], ['ACT', student.readiness.act], ['TSIA2', student.readiness.tsia2]].map(([label, score]) => <div key={label} style={{ padding: 14, background: '#f8f9fa', borderRadius: 9 }}><div style={{ fontSize: 12, color: '#5f6368', fontWeight: 800 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 900 }}>{score}</div></div>)}</div><div style={{ marginTop: 12, color: '#5f6368' }}>Evidence confidence: <strong>{student.readiness.confidence}</strong></div></section>
      )}
    </div>
  );
}

export default function DemoExperience() {
  const [demoState, setDemoState] = useState(() => loadDemoSeed());
  const [studentId, setStudentId] = useState(null);
  const [selectedClass, setSelectedClass] = useState('all');
  const [presentationMode, setPresentationMode] = useState(false);
  const student = demoState.students.find((entry) => entry.id === studentId) || null;
  const classById = useMemo(() => Object.fromEntries(demoState.classes.map((entry) => [entry.id, entry])), [demoState.classes]);
  const visibleStudents = selectedClass === 'all' ? demoState.students : demoState.students.filter((entry) => entry.classId === selectedClass);

  const updateStudentAssignment = (targetStudentId, assignmentId, patch) => {
    setDemoState((current) => saveDemoSeed({
      ...current,
      students: current.students.map((entry) => entry.id !== targetStudentId ? entry : {
        ...entry,
        assignments: { ...entry.assignments, [assignmentId]: { ...entry.assignments?.[assignmentId], ...patch } },
      }),
    }));
  };

  const reset = () => {
    const next = resetDemoSeed();
    setDemoState(next);
    setStudentId(null);
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <div role="status" style={{ marginBottom: 18, padding: '11px 14px', border: '2px solid #7627a6', borderRadius: 10, background: '#f8f0fc', color: '#5d1d82', fontWeight: 900 }}>
        DEMO MODE — Synthetic students and data. Production records will not be changed.
      </div>

      {student ? (
        <DemoStudentView student={student} classInfo={classById[student.classId]} assignments={demoState.assignments} onBack={() => setStudentId(null)} onUpdate={updateStudentAssignment} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
            <div><h2 style={{ margin: 0 }}>Showcase Classroom</h2><p style={{ margin: '5px 0 0', color: '#5f6368' }}>A populated MathMaster classroom after several weeks of realistic use.</p></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={() => setPresentationMode((value) => !value)} style={{ padding: '9px 12px', border: '1px solid #1a73e8', borderRadius: 8, background: presentationMode ? '#e8f0fe' : '#fff', color: '#174ea6', fontWeight: 800 }}>{presentationMode ? 'Exit Presentation Mode' : 'Presentation Mode'}</button><button type="button" onClick={reset} style={{ padding: '9px 12px', border: '1px solid #d93025', borderRadius: 8, background: '#fff', color: '#b3261e', fontWeight: 800 }}>Reset Demo Classroom</button></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 20 }}>
            {demoState.classes.map((classItem) => <button key={classItem.id} type="button" onClick={() => setSelectedClass((value) => value === classItem.id ? 'all' : classItem.id)} style={{ ...card, textAlign: 'left', cursor: 'pointer', borderColor: selectedClass === classItem.id ? '#1a73e8' : '#dde3ea', background: selectedClass === classItem.id ? '#f5f9ff' : '#fff' }}><strong>{classItem.name}</strong><div style={{ marginTop: 8, color: '#5f6368', fontSize: 12 }}>{classItem.courseLevel === 'honors' ? 'Honors rigor contract' : 'Standard course'} · {demoState.students.filter((entry) => entry.classId === classItem.id).length} demo students</div></button>)}
          </div>

          <section style={{ ...card, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Demo students</h3>{selectedClass !== 'all' && <button type="button" onClick={() => setSelectedClass('all')} style={{ border: 0, background: 'transparent', color: '#1a73e8', fontWeight: 800 }}>Show all classes</button>}</div>
            <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ background: '#f8f9fa' }}><th style={{ textAlign: 'left', padding: 10 }}>Student</th><th style={{ textAlign: 'left' }}>Course</th><th>Mastery</th><th style={{ textAlign: 'left' }}>Path</th><th></th></tr></thead><tbody>{visibleStudents.map((entry) => <tr key={entry.id} style={{ borderBottom: '1px solid #eef0f2' }}><td style={{ padding: 10 }}><strong>{entry.name}</strong><div style={{ color: '#5f6368', fontSize: 11 }}>{entry.purpose}</div></td><td style={{ fontSize: 12 }}>{classById[entry.classId]?.name}</td><td style={{ textAlign: 'center', fontWeight: 900 }}>{entry.overallMastery}%</td><td style={{ fontSize: 12 }}>{entry.mathPath.current}</td><td style={{ textAlign: 'right' }}><button type="button" onClick={() => setStudentId(entry.id)} style={{ padding: '8px 11px', border: 0, borderRadius: 7, background: '#1a73e8', color: '#fff', fontWeight: 800 }}>View as Student</button></td></tr>)}</tbody></table></div>
          </section>

          {!presentationMode && <section style={card}><h3 style={{ marginTop: 0 }}>Prebuilt assignment history</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 9 }}>{demoState.assignments.map((assignment) => <div key={assignment.id} style={{ padding: 12, border: '1px solid #eef0f2', borderRadius: 9 }}><strong>{assignment.title}</strong><div style={{ marginTop: 4, color: '#5f6368', fontSize: 12 }}>{assignment.type} · {assignment.status} · TEKS {assignment.teks}{assignment.honorsOnly ? ' · Honors only' : ''}</div></div>)}</div></section>}
        </>
      )}
    </div>
  );
}

export const freshDemoStateForTests = () => createDemoSeed();
