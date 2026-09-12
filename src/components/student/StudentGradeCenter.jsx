import React, { useState } from 'react';
import { EmptyState } from '../../ui/primitives';
import GradeSectionBreakdown from './GradeSectionBreakdown.jsx';
import StudentGlobalNav, { STUDENT_DESTINATION } from './StudentGlobalNav.jsx';
import BuildStamp from './BuildStamp.jsx';
import { GRADE_STATUS } from '../../platform/student/studentGradeCenterModel.js';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import { formatDateTime } from '../../assignmentLifecycle';

/*
 * THE STUDENT GRADE CENTER.
 *
 * Presentational only. Every number on this screen arrived as a prop from
 * buildStudentGradeCenter(), which read it from the same splitGrade() the
 * teacher gradebook and Google Classroom passback read. Nothing here adds,
 * averages, rounds or infers a grade — if it did, this screen would eventually
 * disagree with the teacher's, and the student would be the one to discover it.
 *
 * WHAT THE LAYOUT IS FOR.
 *
 * A phone is the common case, so: one column at 390px, no fixed width anywhere,
 * grids that collapse with auto-fit, and every control at least 44px tall. A
 * student checking their grade between classes is doing it one-handed.
 */

const TONE = {
  [GRADE_STATUS.GRADED]: { bg: '#e6f4ea', color: '#12633a' },
  [GRADE_STATUS.COMPLETED]: { bg: '#e6f4ea', color: '#12633a' },
  [GRADE_STATUS.IN_PROGRESS]: { bg: '#e8f0fe', color: '#174ea6' },
  [GRADE_STATUS.PENDING_GRADE]: { bg: '#e8f0fe', color: '#174ea6' },
  [GRADE_STATUS.LATE]: { bg: '#fff4ce', color: '#7a4f00' },
  [GRADE_STATUS.MISSING]: { bg: '#fce8e6', color: '#a50e0e' },
  [GRADE_STATUS.PRACTICE_ONLY]: { bg: '#f5f3ff', color: '#5b21b6' },
  [GRADE_STATUS.EXCUSED]: { bg: '#f1f3f4', color: '#3c4043' },
  [GRADE_STATUS.REOPENED]: { bg: '#fff4ce', color: '#7a4f00' },
  [GRADE_STATUS.LOCKED]: { bg: '#f1f3f4', color: '#3c4043' },
  [GRADE_STATUS.NOT_STARTED]: { bg: '#f1f3f4', color: '#3c4043' },
};

const actionButton = (primary) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 16px', borderRadius: 10,
  fontWeight: 900, fontSize: 14, cursor: 'pointer', flex: '1 1 auto',
  border: primary ? 0 : '2px solid #c9ced6',
  background: primary ? '#174ea6' : '#fff',
  color: primary ? '#fff' : '#3c4043',
});

/**
 * The one number at the top, and the three counts that stop it being read as
 * the whole story.
 *
 * "No graded work yet" is printed in words rather than as 0%, for the same
 * reason the rows never invent a zero.
 */
function PeriodSummary({ courseLabel, periodLabel, summary, hidden, onToggleHidden }) {
  return (
    <section
      aria-label="Current marking period grade"
      style={{
        background: '#fff', borderRadius: 14, border: '1px solid #d8dde6',
        padding: '18px 18px 16px', marginBottom: 18, textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5f6368', overflowWrap: 'anywhere' }}>
            {[courseLabel, periodLabel].filter(Boolean).join(' — ') || 'MathMaster'}
          </div>
          <div style={{ marginTop: 6, fontSize: 'clamp(30px, 9vw, 44px)', fontWeight: 1000, lineHeight: 1.05, color: '#174ea6' }}>
            {hidden ? '•••' : summary.score === null ? 'No graded work yet' : `${summary.score}%`}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: '#5f6368' }}>Current MathMaster grade</div>
        </div>
        <button
          type="button"
          onClick={onToggleHidden}
          aria-pressed={hidden}
          style={{
            appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
            minHeight: MIN_TOUCH_TARGET_PX, minWidth: MIN_TOUCH_TARGET_PX,
            padding: '8px 12px', borderRadius: 10, border: '2px solid #c9ced6',
            background: '#fff', color: '#3c4043', fontWeight: 900, cursor: 'pointer',
          }}
        >
          {hidden ? '👁 Show grade' : '🙈 Hide grade'}
        </button>
      </div>

      <ul
        style={{
          listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex',
          flexWrap: 'wrap', gap: 8, fontSize: 13, fontWeight: 800, color: '#3c4043',
        }}
      >
        <li style={{ padding: '6px 10px', borderRadius: 999, background: '#e6f4ea', color: '#12633a' }}>{summary.graded} graded</li>
        <li style={{ padding: '6px 10px', borderRadius: 999, background: '#fce8e6', color: '#a50e0e' }}>{summary.missing} missing</li>
        <li style={{ padding: '6px 10px', borderRadius: 999, background: '#e8f0fe', color: '#174ea6' }}>{summary.pending} pending</li>
      </ul>
    </section>
  );
}

function GradeRow({ entry, hidden, onOpenResult, onPractice }) {
  const tone = TONE[entry.status] || TONE[GRADE_STATUS.NOT_STARTED];

  return (
    <article
      style={{
        background: '#fff', borderRadius: 12, border: '1px solid #d8dde6',
        padding: 16, marginBottom: 12, textAlign: 'left', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#202124', overflowWrap: 'anywhere' }}>{entry.title}</h3>
          <div style={{ marginTop: 4, fontSize: 12, color: '#5f6368' }}>
            Due {formatDateTime(entry.dueAt)}
            {entry.frozen ? ` · Closed ${formatDateTime(entry.lateDueAt)}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <div style={{ fontSize: 'clamp(18px, 6vw, 24px)', fontWeight: 1000, color: '#202124' }}>
            {/*
              A status word where a percentage would be a lie. `displayGrade` is
              null for anything the model refused to count, so this branch can
              never print 0% for pending or missing work.
            */}
            {hidden ? '••' : entry.displayGrade === null ? '—' : `${entry.displayGrade}%`}
          </div>
          <span style={{ display: 'inline-block', marginTop: 4, padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', background: tone.bg, color: tone.color }}>
            {entry.statusLabel}
          </span>
        </div>
      </div>

      {entry.exclusionText && (
        <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.5, color: '#5f6368' }}>{entry.exclusionText}</p>
      )}

      <GradeSectionBreakdown sections={entry.sections} hidden={hidden} compact />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button type="button" style={actionButton(true)} onClick={() => onOpenResult?.(entry.assignmentId)}>
          View Results
        </button>
        {entry.practiceAvailable && (
          <button type="button" style={actionButton(false)} onClick={() => onPractice?.(entry.assignmentId)}>
            Practice
          </button>
        )}
      </div>
    </article>
  );
}

function PeriodGroup({ group, hidden, onOpenResult, onPractice }) {
  const [open, setOpen] = useState(group.defaultOpen === true);
  if (!group.entries.length) return null;

  const bodyId = `grade-period-${group.period.id}`;
  return (
    <section aria-labelledby={`${bodyId}-heading`} style={{ marginBottom: 18 }}>
      <button
        type="button"
        id={`${bodyId}-heading`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{
          appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          minHeight: MIN_TOUCH_TARGET_PX, padding: '8px 2px', border: 0,
          background: 'transparent', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span aria-hidden="true" style={{ color: '#174ea6', fontSize: 13, transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span style={{ fontWeight: 900, fontSize: 15, color: '#202124', overflowWrap: 'anywhere' }}>
          {group.period.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#5f6368' }}>
          {hidden ? '••' : group.summary.score === null ? 'No grade yet' : `${group.summary.score}%`}
          {' · '}
          {group.entries.length} assignment{group.entries.length === 1 ? '' : 's'}
        </span>
        {/*
          An archived marking period is closed to new work. It is NOT hidden:
          the grades inside it stay readable for as long as the student is
          enrolled, which is the whole reason this is not assignment.archived.
        */}
        {group.period.archived && (
          <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: '#f1f3f4', color: '#5f6368' }}>CLOSED</span>
        )}
      </button>
      {open && (
        <div id={bodyId}>
          {group.entries.map((entry) => (
            <GradeRow
              key={entry.assignmentId}
              entry={entry}
              hidden={hidden}
              onOpenResult={onOpenResult}
              onPractice={onPractice}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function StudentGradeCenter({
  gradeCenter,
  supportPresentation = {},
  onBackToHome = null,
  onOpenResult = null,
  onPractice = null,
  // The shared student destinations. Grades used to offer one "← Home"
  // control, which made it a cul-de-sac: a student checking a grade and then
  // wanting the assignment behind it had to go up to Home and back down.
  onNavigate = null,
  onLogout = null,
}) {
  const [hidden, setHidden] = useState(false);
  const { periodGroups = [], currentPeriod, currentSummary, pastPeriodGroups = [], courseLabel } = gradeCenter || {};
  const currentGroup = periodGroups.find((group) => group.period.isCurrent) || null;

  return (
    <div
      className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{
        fontFamily: '"Segoe UI", sans-serif',
        background: supportPresentation.highContrast ? '#fff' : '#f0f2f5',
        minHeight: '100vh', padding: '20px 14px 48px',
        fontSize: supportPresentation.largeText ? '120%' : undefined,
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <StudentGlobalNav
          current={STUDENT_DESTINATION.GRADES}
          onNavigate={onNavigate}
          onLogout={onLogout}
          style={{ marginBottom: 16 }}
        />

        <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => onBackToHome?.()}
            style={{
              appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
              minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 15px', borderRadius: 10,
              border: '2px solid #c9ced6', background: '#fff', color: '#3c4043',
              fontWeight: 900, cursor: 'pointer',
            }}
          >
            ← Home
          </button>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 6vw, 26px)', color: '#174ea6' }}>My Grades</h1>
        </header>

        <PeriodSummary
          courseLabel={courseLabel}
          periodLabel={currentPeriod?.label || ''}
          summary={currentSummary || { score: null, graded: 0, missing: 0, pending: 0 }}
          hidden={hidden}
          onToggleHidden={() => setHidden((current) => !current)}
        />

        {currentGroup && (
          <PeriodGroup group={currentGroup} hidden={hidden} onOpenResult={onOpenResult} onPractice={onPractice} />
        )}

        {pastPeriodGroups.length > 0 && (
          <>
            <h2 style={{ margin: '22px 0 6px', fontSize: 15, color: '#3c4043' }}>Past Marking Periods</h2>
            {pastPeriodGroups.map((group) => (
              <PeriodGroup
                key={group.period.id}
                group={group}
                hidden={hidden}
                onOpenResult={onOpenResult}
                onPractice={onPractice}
              />
            ))}
          </>
        )}

        {!periodGroups.length && (
          <EmptyState
            icon="📊"
            title="No grades yet"
            message="Nothing has been assigned to your class yet. Anything your teacher publishes shows up here with its grade as soon as you start it."
          />
        )}

        <BuildStamp />
      </div>
    </div>
  );
}
