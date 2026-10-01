import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../src/firebase.js';
import '../../src/index.css';
import { ToastProvider, useToast } from '../../src/ui/Toast.jsx';
import StudentRewardsCenter from '../../src/components/student/rewards/StudentRewardsCenter.jsx';
import RewardsSummaryCard from '../../src/components/student/rewards/RewardsSummaryCard.jsx';
import ChallengeRewardsEarned from '../../src/components/student/rewards/ChallengeRewardsEarned.jsx';
import StudentRewardsPanel, { useStudentRewards } from '../../src/components/teacher/rewards/StudentRewardsPanel.jsx';
import ChallengeRewardSettings from '../../src/components/liveChallenge/ChallengeRewardSettings.jsx';
import {
  loadStudentRewardHistory,
  subscribeToStudentRewardInventory,
  usePracticePass,
} from '../../src/platform/rewards/rewardsClient.js';
import {
  subscribeToPracticePassRedemptions,
  subscribeToStudentClassPoints,
} from '../../src/platform/classPointsClient.js';
import { practicePassEligibleAssignments } from '../../src/platform/rewards/practicePassClientEligibility.js';
import { buildRewardWallet } from '../../src/platform/rewards/rewardWallet.js';
import { useRewardCelebrations } from '../../src/platform/rewards/useRewardCelebrations.js';
import { DEFAULT_CHALLENGE_REWARD_CHOICE } from '../../src/platform/rewards/challengeRewardPolicy.js';

/*
 * The rewards screens, wired the way App.jsx wires them, against the Firestore
 * emulator. Driven by tests/browser/rewardsQa.mjs.
 *
 *   ?view=student&student=ID&class=ID    My Rewards (+ the Home summary card)
 *   ?view=challenge&student=ID&class=ID&room=ROOM   a finished match's rewards card
 *   ?view=teacher&student=ID&class=ID&teacher=EMAIL  the teacher's rewards panel
 *   ?view=create                          the Live Challenge reward choice
 */
const params = new URLSearchParams(window.location.search);
const view = params.get('view') || 'student';
const studentId = params.get('student');
const classId = params.get('class');

function useStudentData() {
  const [state, setState] = useState({ grants: null, redemptionsByAssignment: {}, redemptions: [], account: null, transactions: [], unavailable: false, assignments: [], tracker: {} });
  useEffect(() => {
    const merge = (patch) => setState((current) => ({ ...current, ...patch }));
    const stops = [
      subscribeToStudentRewardInventory({ db, studentId, classId, onGrants: (grants) => merge({ grants }), onError: () => merge({ inventoryUnavailable: true }) }),
      subscribeToPracticePassRedemptions({ db, studentId, classId, onRedemptions: (redemptionsByAssignment, redemptions = []) => merge({ redemptionsByAssignment, redemptions }), onError: () => {} }),
      subscribeToStudentClassPoints({ db, studentId, classId, onAccount: (account) => merge({ account }), onHistory: (transactions) => merge({ transactions }), onError: () => merge({ unavailable: true }) }),
      onSnapshot(query(collection(db, 'assignments'), where('assignedClassIds', 'array-contains', classId)), (snapshot) => merge({ assignments: snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })) })),
      onSnapshot(doc(db, 'grades', studentId), (snapshot) => merge({ tracker: snapshot.data()?.gradesByAssignment || {} })),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);
  return state;
}

function StudentView() {
  const data = useStudentData();
  const { toastSuccess } = useToast();
  const now = Date.now();
  // The same hook App.jsx uses.
  const { newIds } = useRewardCelebrations({ studentId, grants: data.grants, onCelebrate: (message) => toastSuccess(message) });
  const wallet = useMemo(() => buildRewardWallet({ grants: data.grants || [], redemptions: data.redemptions, account: data.account, nowMs: now }), [data.grants, data.redemptions, data.account, now]);
  const eligible = practicePassEligibleAssignments({
    assignments: data.assignments, classId, tracker: data.tracker, redemptionsByAssignment: data.redemptionsByAssignment, nowValue: now, studentId,
  });
  const classPoints = { account: data.account, transactions: data.transactions, announcements: [], unavailable: data.unavailable };
  if (view === 'challenge') {
    return (
      <div style={{ background: '#0b1f33', minHeight: '100vh', padding: 16 }}>
        <ChallengeRewardsEarned roomId={params.get('room')} grants={data.grants || []} transactions={data.transactions} onOpenRewards={() => {}} />
      </div>
    );
  }
  return (
    <>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '16px 16px 0' }} data-qa="home-summary">
        <RewardsSummaryCard wallet={wallet} hasNew={newIds.size > 0} onOpen={() => {}} />
      </div>
      <StudentRewardsCenter
        student={{ displayName: 'Ava Martinez', classPeriod: 'Period 3' }}
        wallet={wallet}
        classPoints={classPoints}
        inventoryUnavailable={Boolean(data.inventoryUnavailable)}
        redemptions={data.redemptions}
        eligibleAssignments={eligible}
        onUsePracticePass={usePracticePass}
        loadHistory={() => loadStudentRewardHistory({ db, studentId, classId })}
        newGrantIds={newIds}
        onNavigate={() => {}}
        onLogout={() => {}}
        nowMs={now}
      />
    </>
  );
}

function TeacherView() {
  const rewards = useStudentRewards({ studentId, classId, enabled: true });
  return (
    <div className="rw-page">
      <div className="rw-page__inner">
        <section className="rw-card">
          <h2>Ava Martinez · Rewards</h2>
          <StudentRewardsPanel studentId={studentId} classId={classId} studentName="Ava" rewards={rewards} />
        </section>
      </div>
    </div>
  );
}

function CreateView() {
  const [choice, setChoice] = useState({ ...DEFAULT_CHALLENGE_REWARD_CHOICE, passPlaces: 3 });
  return <div style={{ padding: 16, maxWidth: 820 }}><ChallengeRewardSettings choice={choice} onChange={setChoice} /></div>;
}

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    {view === 'teacher' ? <TeacherView /> : view === 'create' ? <CreateView /> : <StudentView />}
  </ToastProvider>,
);
