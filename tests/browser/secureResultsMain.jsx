// The results screens, mounted the way the app mounts them, against the
// stubbed callables in secureResults*Stub.js. Driven by secureResults.mjs.
//
//   ?scene=review&session=course-test|sat-practice|unreleased
//   ?scene=card&stage=review|test|testInProgress|corrections|retest|retestAfterPass|retestClosed|passed|complete
//   ?scene=teacher
//   &theme=dark  (the app keys dark mode to <html data-theme="dark">)
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/theme/tokens.css';
import '../../src/index.css';
import '../../src/App.css';
import SecureExamReview from '../../src/components/assessment/SecureExamReview.jsx';
import TestCycleCard from '../../src/components/student/TestCycleCard.jsx';
import TeacherSecureExamDashboard from '../../src/components/assessment/TeacherSecureExamDashboard.jsx';
import { practiceSkillLaunch } from '../../src/platform/assessment/practiceSkillLaunch.js';

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') || 'review';
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
window.__practised = [];
window.__launches = [];
window.__backs = 0;
window.__exits = 0;
// What App.jsx does with the destination (practiceSkillLaunch, the same
// module), recorded instead of performed.
const onPracticeSkill = (target) => { window.__practised.push(target); window.__launches.push(practiceSkillLaunch(target)); };

const Review = () => {
  const [open, setOpen] = useState(true);
  if (!open) return <p data-harness-left-review="">Left the results screen.</p>;
  return <SecureExamReview examSessionId={params.get('session') || 'course-test'} onBack={() => { window.__backs += 1; setOpen(false); }} onPracticeSkill={onPracticeSkill} />;
};

const Card = () => (
  <main style={{ padding: '24px 16px', maxWidth: 880, margin: '0 auto', boxSizing: 'border-box' }}>
    <TestCycleCard
      assignmentId="harness-assignment"
      studentId="harness-student"
      studentProfile={null}
      onOpenReview={() => { window.__reviewOpened = true; }}
      onExit={() => { window.__exits += 1; }}
      onPracticeSkill={onPracticeSkill}
    />
  </main>
);

const STUDENTS = [
  { id: 'stu-1', firstName: 'Avery', lastName: 'Lopez', classPeriod: '2nd' },
  { id: 'stu-2', firstName: 'Jordan', lastName: 'Kim', classPeriod: '4th' },
];

const Teacher = () => (
  <main style={{ padding: '24px 16px', maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box', background: 'var(--mm-surface)', minHeight: '100vh' }}>
    <TeacherSecureExamDashboard students={STUDENTS} />
  </main>
);

const Scene = scene === 'card' ? Card : scene === 'teacher' ? Teacher : Review;
createRoot(document.getElementById('root')).render(<div style={{ background: 'var(--mm-page-bg)', minHeight: '100vh' }}><Scene /></div>);
