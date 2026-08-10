import React, { useMemo, useState } from 'react';
import MyMathPathWheel from './MyMathPathWheel.jsx';
import SkillDetailCardModal from './SkillDetailCardModal.jsx';
import RetentionQuickCheckBanner from './RetentionQuickCheckBanner.jsx';
import { evaluateStudentRetentionSchedule } from '../../platform/retention/retentionScheduler.js';
import { DEFAULT_MASTERY_COURSE_ID, masteryCourseLabel } from '../../platform/mastery/strandConfig.js';

export const MyMathPathDashboard = ({
  studentName = 'Student',
  masteryProfilesByTEKS = {},
  retentionSchedulesByTEKS = {},
  // No default recommendation. A hardcoded 'A.5A' told every Algebra II
  // student to practise an Algebra I standard whenever the engine had nothing
  // to say; saying nothing is the honest answer.
  recommendedTeks = null,
  courseId = DEFAULT_MASTERY_COURSE_ID,
  pathOptions = null,
  assessmentContext = null,
  onPracticeAs = null,
  onStartSession,
}) => {
  const [selectedTeks, setSelectedTeks] = useState(null);
  const retentionReport = useMemo(
    () => evaluateStudentRetentionSchedule(masteryProfilesByTEKS, retentionSchedulesByTEKS),
    [masteryProfilesByTEKS, retentionSchedulesByTEKS],
  );
  const activeFocusTeks = retentionReport.pendingProbes[0]?.teksCode || recommendedTeks;
  const activeProfile = activeFocusTeks ? masteryProfilesByTEKS[activeFocusTeks] : null;
  const courseLabel = masteryCourseLabel(courseId);

  return (
    <section style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 18px 42px' }}>
      <header style={{ marginBottom: '20px', textAlign: 'left' }}>
        <h1 style={{ margin: 0, fontSize: '28px', color: '#202124' }}>Welcome back, {studentName}!</h1>
        <p style={{ margin: '5px 0 0', color: '#5f6368' }}>Track Texas {courseLabel} mastery and build long-term retention.</p>
      </header>

      <RetentionQuickCheckBanner pendingProbes={retentionReport.pendingProbes} onLaunchQuickCheck={onStartSession} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '22px', alignItems: 'center' }}>
        <div style={{ minWidth: 0, padding: '18px', border: '1px solid #dadce0', borderRadius: '12px', background: '#fff' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#3c4043', textAlign: 'left' }}>TEKS Mastery Map</h2>
          <MyMathPathWheel masteryProfilesByTEKS={masteryProfilesByTEKS} onSelectTEKS={setSelectedTeks} courseId={courseId} />
        </div>

        <div style={{ display: 'grid', gap: '13px' }}>
          <div style={{ padding: '22px', border: '1px solid #c5d5ef', borderRadius: '12px', background: '#f8fbff', textAlign: 'left' }}>
            <div style={{ color: '#174ea6', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{retentionReport.hasPendingProbes ? 'Priority verification focus' : 'Recommended next focus'}</div>
            {activeFocusTeks ? (
              <>
                <h2 style={{ margin: '7px 0 5px', color: '#202124' }}>TEKS {activeFocusTeks}</h2>
                <p style={{ margin: '0 0 16px', color: '#5f6368', fontSize: '14px' }}>{activeProfile?.recommendation?.reason || 'Build independent accuracy and a broader range of evidence.'}</p>
                <button type="button" onClick={() => onStartSession?.(activeFocusTeks, { sessionKind: 'practice', requiredQuestions: 5 })} style={{ width: '100%', padding: '11px 15px', border: 0, borderRadius: '7px', background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Start quick practice · 5 questions</button>
              </>
            ) : (
              <p style={{ margin: '7px 0 0', color: '#5f6368', fontSize: '14px' }}>
                Choose any part of the wheel to practise. Your Path will suggest a focus once your class position is set.
              </p>
            )}
          </div>
          <div style={{ padding: '15px', border: '1px solid #dadce0', borderRadius: '9px', background: '#fff', textAlign: 'left', fontSize: '12px', lineHeight: 1.7 }}>
            <strong>Status guide</strong><br />🟢 Mastered · 🟢 Secure · 🟡 Developing · 🔴 Needs Attention · ⚪ Not Enough Evidence
          </div>
        </div>
      </div>

      {selectedTeks && (
        <SkillDetailCardModal
          teksCode={selectedTeks}
          masteryProfile={masteryProfilesByTEKS[selectedTeks]}
          pathOptions={pathOptions}
          assessmentContext={assessmentContext}
          onPracticeAs={onPracticeAs}
          onClose={() => setSelectedTeks(null)}
          onStartPractice={(code, options) => { setSelectedTeks(null); onStartSession?.(code, options); }}
        />
      )}
    </section>
  );
};

export default MyMathPathDashboard;
