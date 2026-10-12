// The Test Cycle lifecycle QA page — the REAL student and teacher components,
// talking to the REAL Cloud Functions through the bridge (see
// emulator/testCycleBridgeServices.js), reading the emulator with the client
// SDK. Driven by tests/browser/testCycleLifecycleQa.mjs.
//
//   ?view=student&as=student&studentId=…&assignmentId=…
//   ?view=teacher&as=teacher&email=…&assignmentId=…
//   &theme=dark  (the app keys dark mode to <html data-theme="dark">)
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase.js';
import '../../src/theme/tokens.css';
import '../../src/index.css';
// App.jsx loads this stylesheet for every student surface, the secure exam's
// Rich Tools included (the engine's task card, workspace and toolbar).
import '../../src/App.css';
import TestCycleCard from '../../src/components/student/TestCycleCard.jsx';
import TestCycleControls from '../../src/components/teacher/TestCycleControls.jsx';
import TestCyclePreview from '../../src/components/teacher/TestCyclePreview.jsx';
import { buildTestCycleCardRefreshKey } from '../../src/platform/student/testCycleDiscovery.js';

const params = new URLSearchParams(window.location.search);
const view = params.get('view') || 'student';
const assignmentId = params.get('assignmentId');
const studentId = params.get('studentId');
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
window.__qa = { reviewOpened: 0 };

const Student = () => {
  const [gradeDoc, setGradeDoc] = useState(null);
  useEffect(() => onSnapshot(doc(db, 'grades', studentId), (snapshot) => setGradeDoc(snapshot.data() || null)), []);
  // The same key App.jsx computes from the live grade document.
  const refreshKey = useMemo(() => buildTestCycleCardRefreshKey({
    projection: gradeDoc?.testCycleGrades?.[assignmentId],
    reviewRecords: gradeDoc?.gradesByAssignment?.[assignmentId],
  }), [gradeDoc]);
  return (
    <main style={{ padding: '24px 16px', maxWidth: 880, margin: '0 auto', boxSizing: 'border-box' }}>
      <TestCycleCard
        assignmentId={assignmentId}
        studentId={studentId}
        refreshKey={refreshKey}
        onOpenReview={() => { window.__qa.reviewOpened += 1; }}
        onExit={() => {}}
      />
    </main>
  );
};

const Teacher = () => {
  const [assignment, setAssignment] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  // `roster=1` (the Secure Test workflow QA) gives the panel the teacher's
  // classes and students, as the teacher workspace does, so it can offer
  // classes and students to add. The lifecycle QA runs without them.
  const withRoster = params.get('roster') === '1';
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  useEffect(() => onSnapshot(doc(db, 'assignments', assignmentId), (snapshot) => setAssignment(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)), []);
  useEffect(() => {
    if (!withRoster) return undefined;
    const stopClasses = onSnapshot(collection(db, 'classes'), (snapshot) => setClasses(snapshot.docs.map((entry) => ({ classId: entry.id, ...entry.data() }))));
    const stopStudents = onSnapshot(collection(db, 'grades'), (snapshot) => setStudents(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
    return () => { stopClasses(); stopStudents(); };
  }, [withRoster]);
  if (!assignment) return <p role="status">{params.get('deleted') === '1' ? 'This Test no longer exists.' : 'Loading assignment…'}</p>;
  return (
    <main style={{ padding: 16, boxSizing: 'border-box', background: 'var(--mm-surface-sunken)', minHeight: '100vh' }}>
      <TestCycleControls assignment={assignment} classId={params.get('classId')} students={students} classes={classes} teacherEmail={params.get('email') || ''} onPreview={(target) => setPreviewing(target)} />
      {previewing && <TestCyclePreview assignment={previewing} onClose={() => setPreviewing(null)} onPreviewReview={() => { window.__qa.reviewOpened += 1; }} />}
    </main>
  );
};

createRoot(document.getElementById('root')).render(view === 'teacher' ? <Teacher /> : <Student />);
