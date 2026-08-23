import React, { useMemo, useState } from 'react';
import MyMathPathWheel from './MyMathPathWheel.jsx';
import SkillDetailCardModal from './SkillDetailCardModal.jsx';
import RetentionQuickCheckBanner from './RetentionQuickCheckBanner.jsx';
import { evaluateStudentRetentionSchedule } from '../../platform/retention/retentionScheduler.js';
import { DEFAULT_MASTERY_COURSE_ID, masteryCourseLabel } from '../../platform/mastery/strandConfig.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import { curateStudentPanel } from '../../platform/path/studentPanel.js';
import { teksCodeFromSkillId } from '../../platform/path/skillGraph.js';
import WeeklyPathGoalPanel from './WeeklyPathGoalPanel.jsx';

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
  // This week's goal, from the engine. Absent for a student whose path options
  // have not resolved yet, in which case the wheel and the rest of the
  // dashboard still render — the week is an addition, never a gate.
  weeklyGoal = null,
  weeklyProgress = null,
  completedSlots = [],
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
  // One engine, one explanation: if the panel picked this skill, show the
  // panel's own sentence rather than inventing a second one here.
  const focusReason = useMemo(() => {
    if (!pathOptions || !activeFocusTeks) return null;
    const panel = curateStudentPanel(pathOptions);
    const card = [panel.best, panel.strengthen, panel.challenge, ...(panel.choices || [])]
      .filter(Boolean)
      .find((entry) => teksCodeFromSkillId(entry.skillId) === activeFocusTeks);
    return card?.reason || null;
  }, [pathOptions, activeFocusTeks]);
  const courseLabel = masteryCourseLabel(courseId);

  return (
    <section style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 18px 42px' }}>
      <header style={{ marginBottom: '20px', textAlign: 'left' }}>
        <h1 style={{ margin: 0, fontSize: '28px', color: '#202124' }}>Welcome back, {studentName}!</h1>
        <p style={{ margin: '5px 0 0', color: '#5f6368' }}>Your {courseLabel} skills, and what to work on next.</p>
      </header>

      <RetentionQuickCheckBanner pendingProbes={retentionReport.pendingProbes} onLaunchQuickCheck={onStartSession} />

      {/* THE WEEK COMES FIRST. A student opening MathMaster asks one question —
          what should I do now — and the skills map, useful as it is, answers a
          different one. It sits directly under the retention banner, above the
          map, because that is the order the student's own attention runs in. */}
      {weeklyGoal && (
        <div style={{ margin: '0 0 22px' }}>
          <WeeklyPathGoalPanel
            goal={weeklyGoal}
            progress={weeklyProgress}
            completedSlots={completedSlots}
            onStartSession={(session) => {
              const code = session?.teksCode || teksCodeFromSkillId(session?.skillId);
              if (code) onStartSession?.(code, {
                weekKey: weeklyGoal?.weekKey || null,
                weeklySlotKey: session?.weeklySlotKey || null,
                weeklySlot: session?.slot || null,
                framework: session?.context && session.context !== 'course' ? session.context : null,
              });
            }}
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '22px', alignItems: 'center' }}>
        <div style={{ minWidth: 0, padding: '18px', border: '1px solid #dadce0', borderRadius: '12px', background: '#fff' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: '#3c4043', textAlign: 'left' }}>Your skills map</h2>
          <MyMathPathWheel masteryProfilesByTEKS={masteryProfilesByTEKS} onSelectTEKS={setSelectedTeks} courseId={courseId} />
        </div>

        <div style={{ display: 'grid', gap: '13px' }}>
          <div style={{ padding: '22px', border: '1px solid #c5d5ef', borderRadius: '12px', background: '#f8fbff', textAlign: 'left' }}>
            <div style={{ color: '#174ea6', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{retentionReport.hasPendingProbes ? 'Priority verification focus' : 'Recommended next focus'}</div>
            {activeFocusTeks ? (
              <>
                <h2 style={{ margin: '7px 0 5px', color: '#202124' }}>{studentLabelForTeks(activeFocusTeks)}</h2>
                {/* The sentence comes from the engine that chose the skill, or
                    from the retention scheduler that overrode it. A hand-written
                    fallback here would be a second voice explaining a decision
                    it did not make. */}
                <p style={{ margin: '0 0 16px', color: '#5f6368', fontSize: '14px' }}>
                  {retentionReport.hasPendingProbes
                    ? 'You learned this a while ago. A couple of questions is enough to check it has stayed with you.'
                    : activeProfile?.recommendation?.reason
                      || focusReason
                      || 'Practice here builds the evidence your path is waiting on.'}
                </p>
                <button type="button" onClick={() => onStartSession?.(activeFocusTeks, { sessionKind: 'practice', requiredQuestions: 5 })} style={{ width: '100%', padding: '11px 15px', border: 0, borderRadius: '7px', background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Start quick practice · 5 questions</button>
              </>
            ) : (
              <p style={{ margin: '7px 0 0', color: '#5f6368', fontSize: '14px' }}>
                Choose any part of the wheel to practise. Your Path will suggest a focus once your class position is set.
              </p>
            )}
          </div>
          <div style={{ padding: '15px', border: '1px solid #dadce0', borderRadius: '9px', background: '#fff', textAlign: 'left', fontSize: '12px', lineHeight: 1.7 }}>
            {/* The legend used the same green glyph for two different states
                and named a fourth state ("Needs work") that never appears —
                the wheel says "Needs Attention". */}
            <strong>What the colours mean</strong><br />🟢 Mastered · 🔵 Secure · 🟡 Developing · 🔴 Needs Attention · ⚪ Not practised yet
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
