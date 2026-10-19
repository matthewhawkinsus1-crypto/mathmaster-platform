import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../../src/firebase.js';
import '../../src/index.css';
import { ToastProvider } from '../../src/ui/Toast.jsx';
import StudentRewardsCenter from '../../src/components/student/rewards/StudentRewardsCenter.jsx';
import ClassRewardCatalogEditor from '../../src/components/rewards/ClassRewardCatalogEditor.jsx';
import ClassRewardRequestsPanel from '../../src/components/rewards/ClassRewardRequestsPanel.jsx';
import { subscribeToStudentRewardInventory, usePracticePass } from '../../src/platform/rewards/rewardsClient.js';
import { subscribeToPracticePassRedemptions, subscribeToStudentClassPoints } from '../../src/platform/classPointsClient.js';
import { buildRewardWallet } from '../../src/platform/rewards/rewardWallet.js';

/*
 * The class reward screens, wired the way App.jsx wires them, against the
 * Firestore emulator. Driven by tests/browser/classRewardsQa.mjs.
 *
 *   ?view=student&student=ID&class=ID           My Rewards (the shelf opens its own listeners)
 *   ?view=teacher&class=ID&teacher=EMAIL         the catalog editor + pending requests
 */
const params = new URLSearchParams(window.location.search);
const view = params.get('view') || 'student';
const studentId = params.get('student');
const classId = params.get('class');

function StudentView() {
  const [data, setData] = useState({ grants: [], redemptions: [], account: null, transactions: [], unavailable: false });
  useEffect(() => {
    const merge = (patch) => setData((current) => ({ ...current, ...patch }));
    const stops = [
      subscribeToStudentRewardInventory({ db, studentId, classId, onGrants: (grants) => merge({ grants }), onError: () => {} }),
      subscribeToPracticePassRedemptions({ db, studentId, classId, onRedemptions: (_, redemptions = []) => merge({ redemptions }), onError: () => {} }),
      subscribeToStudentClassPoints({ db, studentId, classId, onAccount: (account) => merge({ account }), onHistory: (transactions) => merge({ transactions }), onError: () => merge({ unavailable: true }) }),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);
  const now = Date.now();
  const wallet = useMemo(() => buildRewardWallet({ grants: data.grants, redemptions: data.redemptions, account: data.account, nowMs: now }), [data.grants, data.redemptions, data.account, now]);
  return (
    <StudentRewardsCenter
      // Exactly what App.jsx passes: {...studentRecord, ...user}, so role, id
      // and classId are present and the screen opens its own class-reward
      // listeners.
      student={{ role: 'student', id: studentId, classId, displayName: 'Ava Martinez', classPeriod: 'Period 3' }}
      wallet={wallet}
      classPoints={{ account: data.account, transactions: data.transactions, announcements: [], unavailable: data.unavailable }}
      redemptions={data.redemptions}
      eligibleAssignments={[]}
      onUsePracticePass={usePracticePass}
      loadHistory={async () => []}
      onNavigate={() => {}}
      onLogout={() => {}}
      nowMs={now}
    />
  );
}

function TeacherView() {
  return (
    <div className="rw-page">
      <div className="rw-page__inner">
        <ClassRewardRequestsPanel classId={classId} teacherEmail={params.get('teacher')} studentNames={{ 'qa-ava': 'Ava Martinez', 'qa-ben': 'Ben Ortiz' }} />
        <ClassRewardCatalogEditor classId={classId} className="Algebra I — Period 3" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    {view === 'teacher' ? <TeacherView /> : <StudentView />}
  </ToastProvider>,
);
