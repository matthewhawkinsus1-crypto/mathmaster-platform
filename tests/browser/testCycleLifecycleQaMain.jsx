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
import { doc, onSnapshot } from 'firebase/firestore';
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
  useEffect(() => onSnapshot(doc(db, 'assignments', assignmentId), (snapshot) => setAssignment(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)), []);
  if (!assignment) return <p role="status">Loading assignment…</p>;
  return (
    <main style={{ padding: 16, boxSizing: 'border-box', background: 'var(--mm-surface-sunken)', minHeight: '100vh' }}>
      <TestCycleControls assignment={assignment} classId={params.get('classId')} students={[]} onPreview={(target) => setPreviewing(target)} />
      {previewing && <TestCyclePreview assignment={previewing} onClose={() => setPreviewing(null)} onPreviewReview={() => { window.__qa.reviewOpened += 1; }} />}
    </main>
  );
};

createRoot(document.getElementById('root')).render(view === 'teacher' ? <Teacher /> : <Student />);
