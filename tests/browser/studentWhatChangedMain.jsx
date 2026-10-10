// "What changed" and the one Log Out, in a real browser.
//
// The list is built by the REAL buildWhatChanged over synthetic assignments,
// grade overrides, Test Cycle projections and controls, so the harness cannot
// measure rows the product would never produce. The identity bar is the real
// StudentIdentityBar with a logoutRisk from the real describeLogoutRisk, above
// the real StudentGlobalNav, so "only one Log Out on the page" is measured on
// the same pair of components every student screen draws.
//
// HOW TO RUN: see tests/browser/studentWhatChanged.mjs.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import StudentIdentityBar from '../../src/components/student/StudentIdentityBar.jsx';
import StudentGlobalNav, { STUDENT_DESTINATION } from '../../src/components/student/StudentGlobalNav.jsx';
import WhatChangedList from '../../src/components/student/WhatChangedList.jsx';
import { buildWhatChanged } from '../../src/platform/student/whatChangedModel.js';
import { describeLogoutRisk } from '../../src/platform/student/logoutGuard.js';
import { describeSaveStatus } from '../../src/platform/student/saveStatusModel.js';

const NOW = Date.parse('2026-10-07T15:00:00Z');
const HOUR = 3600000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();
const CLASS_ID = 'class-alg1-a';
const base = (id, title, extra = {}) => ({ id, title, assignedClassIds: [CLASS_ID], dueAt: '2026-10-20', lateDueAt: '2026-10-22', createdAt: iso(NOW - 40 * DAY), ...extra });

const assignments = [
  base('l1', 'Unit 3 Lesson 4 — Interval Notation and Piecewise Functions With a Long Title', { feedbackReleased: true, feedbackReleasedAt: iso(NOW - 2 * HOUR) }),
  base('l2', 'Unit 3 Lesson 5 — Slope', { createdAt: iso(NOW - 5 * HOUR) }),
  base('l3', 'Unit 2 Lesson 9 — Systems'),
  base('l4', 'Unit 2 Lesson 7 — Inequalities'),
  base('l5', 'Unit 2 Lesson 3 — Graphing'),
  base('t1', 'Unit 2 Test', { assessmentPolicy: { mode: 'testCycle' } }),
  base('t2', 'Unit 1 Test', { assessmentPolicy: { mode: 'testCycle' } }),
  base('other', 'Another class only', { assignedClassIds: ['class-other'], createdAt: iso(NOW - HOUR) }),
];
const actor = { uid: 'teacher-uid', email: 'teacher@school.example', name: 'Ms Teacher' };

const items = buildWhatChanged({
  studentId: 'stu-1', classId: CLASS_ID, classPeriod: '3', assignments, nowValue: NOW, seenAt: NOW - 3 * HOUR,
  testCycleGrades: {
    t1: { stage: 'retest', retestState: 'assigned', recordedGrade: 58, stageChangedAt: NOW - HOUR },
    t2: { stage: 'complete', recordedGrade: 91, stageChangedAt: NOW - 4 * DAY },
  },
  teacherGradeOverridesByAssignment: {
    l3: { 2: { active: true, score: 100, updatedAt: iso(NOW - 30 * 60000), note: 'SECRET-NOTE', actor } },
    l4: {
      0: { active: true, score: 0, source: 'teacher-section-zero', incidentId: 'i1', sectionRole: 'dol', reason: 'Prohibited cellphone use', note: 'SECRET-NOTE', actor, at: iso(NOW - 6 * HOUR) },
      __sectionIntegrity_dol: { active: true, incidentId: 'i1', sectionRole: 'dol' },
    },
  },
  controlsByAssignmentId: {
    l5: { lateDueAt: '2026-10-30', extension: { grantedAt: NOW - 26 * HOUR } },
    l4: { reopened: true },
  },
});
window.__mmWhatChangedItems = items;

function Harness() {
  const [risk, setRisk] = useState(() => describeLogoutRisk({ outboxDepth: 2, pendingGradeCount: 1, persistenceStatus: 'offline' }));
  const [log, setLog] = useState([]);
  const record = (entry) => setLog((previous) => [...previous, entry]);
  const save = describeSaveStatus({ persistenceStatus: 'offline', outboxDepth: 2, pendingGradeCount: 1, online: false });
  return (
    <div style={{ minHeight: '100vh', background: 'var(--mm-bg, #f5f7fb)', color: 'var(--mm-text)', fontFamily: '"Segoe UI", sans-serif' }}>
      <StudentIdentityBar
        student={{ firstName: 'Avery', lastName: 'Example', classPeriod: '3' }}
        classPointsBalance={120}
        onLogout={() => record('logout')}
        logoutRisk={risk}
      />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '16px', boxSizing: 'border-box', display: 'grid', gap: 14 }}>
        <StudentGlobalNav current={STUDENT_DESTINATION.HOME} onNavigate={(d) => record(`nav:${d}`)} onLogout={() => record('nav-logout')} />
        <p role="status" data-save-tone={save.tone} style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 13 }}>{save.text}</p>
        <WhatChangedList items={items} onOpenAssignment={(id) => record(`open:${id}`)} onMarkSeen={() => record('seen')} />
        <WhatChangedList items={[]} compact onMarkSeen={() => record('seen-empty')} />
        <div data-harness-empty-full><WhatChangedList items={[]} /></div>
        <button type="button" data-harness="clear-risk" onClick={() => setRisk(null)} style={{ minHeight: 44 }}>(harness) queue drained</button>
        <output data-harness="log">{log.join('|')}</output>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
