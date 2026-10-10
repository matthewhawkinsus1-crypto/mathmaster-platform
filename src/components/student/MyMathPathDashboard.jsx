import React, { useMemo, useState } from 'react';
import MyMathPathWheel from './MyMathPathWheel.jsx';
import SkillDetailCardModal from './SkillDetailCardModal.jsx';
import RetentionQuickCheckBanner from './RetentionQuickCheckBanner.jsx';
import { evaluateStudentRetentionSchedule } from '../../platform/retention/retentionScheduler.js';
import { DEFAULT_MASTERY_COURSE_ID, MASTERY_STATUS_COLORS, masteryCourseLabel } from '../../platform/mastery/strandConfig.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import { curateStudentPanel } from '../../platform/path/studentPanel.js';
import { teksCodeFromSkillId } from '../../platform/path/skillGraph.js';
import { overviewFocus } from '../../platform/path/pathSessionLaunch.js';
import { RETENTION_REASON } from '../../platform/path/pathMap.js';
import WeeklyPathGoalPanel from './WeeklyPathGoalPanel.jsx';

export const MyMathPathDashboard = ({
  studentName = 'Student',
  masteryProfilesByTEKS = {},
  retentionSchedulesByTEKS = {},
  // The one retention evaluation My Math Path made for every screen. Computed
  // here from the same inputs when a caller does not supply it.
  retentionReport = null,
  skillProgressByTEKS = {},
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
  weeklyCompletions = null,
  completedSlots = [],
  weeklyInProgress = [],
  onPracticeAs = null,
  onStartSession,
  onStartWeeklySession = null,
  onOpenPath = null,
}) => {
  const [selectedTeks, setSelectedTeks] = useState(null);
  const report = useMemo(
    () => retentionReport || evaluateStudentRetentionSchedule(masteryProfilesByTEKS, retentionSchedulesByTEKS),
    [retentionReport, masteryProfilesByTEKS, retentionSchedulesByTEKS],
  );
  // What the focus card names and what its button starts. A due retention
  // check takes the focus, and then the button starts THAT check — it used to
  // start five questions of practice, which could never clear it.
  const focus = useMemo(
    () => overviewFocus({ pendingProbes: report.pendingProbes, recommendedTeks }),
    [report.pendingProbes, recommendedTeks],
  );
  const activeFocusTeks = focus?.teksCode || null;
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
        <h1 style={{ margin: 0, fontSize: '28px', lineHeight: 1.2, color: 'var(--mm-text-strong)' }}>Welcome back, {studentName}!</h1>
        <p style={{ margin: '5px 0 0', color: 'var(--mm-text-muted)' }}>Your {courseLabel} skills, and what to work on next.</p>
      </header>

      <RetentionQuickCheckBanner pendingProbes={report.pendingProbes} onLaunchQuickCheck={onStartSession} />

      {/* THE WEEK COMES FIRST. A student opening MathMaster asks one question —
          what should I do now — and the skills map, useful as it is, answers a
          different one. It sits directly under the retention banner, above the
          map, because that is the order the student's own attention runs in. */}
      {weeklyGoal && (
        <div style={{ margin: '0 0 22px' }}>
          <WeeklyPathGoalPanel
            goal={weeklyGoal}
            progress={weeklyProgress}
            completions={weeklyCompletions}
            completedSlots={completedSlots}
            inProgress={weeklyInProgress}
            onStartSession={onStartWeeklySession}
            compact
          />
          {onOpenPath && (
            <button
              type="button"
              onClick={onOpenPath}
              style={{ marginTop: 9, minHeight: 44, padding: '9px 14px', border: '1px solid var(--mm-tint-border)', borderRadius: 9, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 850, cursor: 'pointer' }}
            >
              View and continue this week&apos;s Path
            </button>
          )}
        </div>
      )}

      {/* Top-aligned: the wheel's topic list can open long, and a centred
          focus card would drift down the page with it. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '22px', alignItems: 'start' }}>
        <div style={{ minWidth: 0, padding: '18px', border: '1px solid var(--mm-border)', borderRadius: '12px', background: 'var(--mm-surface)' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '18px', color: 'var(--mm-text)', textAlign: 'left' }}>Your skills map</h2>
          <MyMathPathWheel masteryProfilesByTEKS={masteryProfilesByTEKS} skillProgressByTEKS={skillProgressByTEKS} onSelectTEKS={setSelectedTeks} courseId={courseId} />
        </div>

        <div style={{ display: 'grid', gap: '13px' }}>
          <div style={{ padding: '22px', border: '1px solid var(--mm-tint-border)', borderRadius: '12px', background: 'var(--mm-surface-tint)', textAlign: 'left' }}>
            <div style={{ color: 'var(--mm-primary-text)', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{focus?.isRetentionCheck ? 'Priority verification focus' : 'Recommended next focus'}</div>
            {focus ? (
              <>
                <h2 style={{ margin: '7px 0 5px', color: 'var(--mm-text-strong)' }}>{studentLabelForTeks(activeFocusTeks)}</h2>
                {/* The sentence comes from the engine that chose the skill, or
                    from the retention scheduler that overrode it — the same
                    sentence the Path map's retention card uses. A hand-written
                    fallback here would be a second voice explaining a decision
                    it did not make. */}
                <p style={{ margin: '0 0 16px', color: 'var(--mm-text-muted)', fontSize: '14px' }}>
                  {focus.isRetentionCheck
                    ? (focus.concern ? RETENTION_REASON.concern : RETENTION_REASON.due)
                    : activeProfile?.recommendation?.reason
                      || focusReason
                      || 'Practice here builds the evidence your path is waiting on.'}
                </p>
                <button type="button" onClick={() => onStartSession?.(focus.teksCode, focus.launch)} style={{ width: '100%', minHeight: 44, padding: '11px 15px', border: 0, borderRadius: '7px', background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{focus.buttonLabel}</button>
              </>
            ) : (
              <p style={{ margin: '7px 0 0', color: 'var(--mm-text-muted)', fontSize: '14px' }}>
                Choose any part of the wheel to practise. Your Path will suggest a focus once your class position is set.
              </p>
            )}
          </div>
          <div style={{ padding: '15px', border: '1px solid var(--mm-border)', borderRadius: '9px', background: 'var(--mm-surface)', textAlign: 'left', fontSize: '12px', lineHeight: 1.7 }}>
            {/* The legend used the same green glyph for two different states
                and named a fourth state ("Needs work") that never appears —
                the wheel says "Needs Attention". It then drew Secure as a blue
                circle beside a wheel that paints Secure light green: the key
                is now drawn from the wheel's own colours and the shared
                rule's own words. */}
            <strong>What the colours mean</strong>
            <ul data-mastery-key style={{ listStyle: 'none', margin: '4px 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
              {Object.entries(MASTERY_STATUS_COLORS).map(([status, color]) => (
                <li key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 999, background: color, border: '1px solid var(--mm-border-strong)' }} />
                  {status}
                </li>
              ))}
            </ul>
            <span style={{ color: 'var(--mm-success-text)', fontWeight: 900 }}>●</span> practice round done · <span style={{ color: 'var(--mm-accent-text)', fontWeight: 900 }}>●</span> Level 3 (stretch) round done · numbers around the wheel are the topics listed under it
          </div>
        </div>
      </div>

      {selectedTeks && (
        <SkillDetailCardModal
          teksCode={selectedTeks}
          masteryProfile={masteryProfilesByTEKS[selectedTeks]}
          pathPassProgress={skillProgressByTEKS[selectedTeks] || null}
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
