import React, { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../../ui/primitives';
import GradeSectionBreakdown from './GradeSectionBreakdown.jsx';
import TestCycleGradeBreakdown from './TestCycleGradeBreakdown.jsx';
import StudentGlobalNav, { STUDENT_DESTINATION } from './StudentGlobalNav.jsx';
import BuildStamp from './BuildStamp.jsx';
import { GRADE_STATUS, applyTodayToGradeActions, describeGradeMath, missingGradeWarning } from '../../platform/student/studentGradeCenterModel.js';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import { formatDateTime, studentDueText } from '../../assignmentLifecycle';
import { CLOSED_WORK, SEE_RESULTS, firstExitTicketMention } from '../../platform/student/studentWords.js';

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
  [GRADE_STATUS.GRADED]: { bg: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  [GRADE_STATUS.COMPLETED]: { bg: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  [GRADE_STATUS.IN_PROGRESS]: { bg: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  [GRADE_STATUS.PENDING_GRADE]: { bg: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  [GRADE_STATUS.LATE]: { bg: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' },
  [GRADE_STATUS.MISSING]: { bg: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' },
  [GRADE_STATUS.PRACTICE_ONLY]: { bg: 'var(--mm-primary-subtle)', color: 'var(--mm-accent-text)' },
  [GRADE_STATUS.EXCUSED]: { bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  [GRADE_STATUS.REOPENED]: { bg: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' },
  [GRADE_STATUS.LOCKED]: { bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  [GRADE_STATUS.NOT_STARTED]: { bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
};

const actionButton = (primary) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 16px', borderRadius: 10,
  fontWeight: 900, fontSize: 'calc(14 * var(--mm-px))', cursor: 'pointer', flex: '1 1 auto',
  border: primary ? 0 : '2px solid var(--mm-border)',
  background: primary ? '#174ea6' : 'var(--mm-surface)',
  color: primary ? '#fff' : 'var(--mm-text)',
});

/**
 * The one number at the top, and the three counts that stop it being read as
 * the whole story.
 *
 * "No graded work yet" is printed in words rather than as 0%, for the same
 * reason the rows never invent a zero.
 */
function PeriodSummary({ courseLabel, periodLabel, summary, hidden, onToggleHidden, onShowMissing = null }) {
  const missingWarning = missingGradeWarning(summary);
  const chipStyle = { padding: '6px 10px', borderRadius: 999 };
  return (
    <section
      aria-label="Current marking period grade"
      style={{
        background: 'var(--mm-surface)', borderRadius: 14, border: '1px solid var(--mm-border)',
        padding: '18px 18px 16px', marginBottom: 18, textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-text-muted)', overflowWrap: 'anywhere' }}>
            {[courseLabel, periodLabel].filter(Boolean).join(' — ') || 'MathMaster'}
          </div>
          <div style={{ marginTop: 6, fontSize: 'clamp(calc(30 * var(--mm-px)), calc(9vw * var(--mm-text-scale, 1)), calc(44 * var(--mm-px)))', fontWeight: 1000, lineHeight: 1.05, color: 'var(--mm-primary-text)' }}>
            {hidden ? '•••' : summary.score === null ? 'No graded work yet' : `${summary.score}%`}
          </div>
          <div style={{ marginTop: 4, fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Current MathMaster grade</div>
          {/* D4 / NAV-2: the number leaves missing work out, and Classroom may
              post it as 0 — so the caveat sits under the number, not in a
              folded panel. Shown with the grade hidden too: it is a count. */}
          {missingWarning && (
            <p data-missing-warning style={{ margin: '8px 0 0', fontSize: 'calc(14 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-error-text)', overflowWrap: 'anywhere' }}>
              {missingWarning.text}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleHidden}
          style={{
            appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
            minHeight: MIN_TOUCH_TARGET_PX, minWidth: MIN_TOUCH_TARGET_PX,
            padding: '8px 12px', borderRadius: 10, border: '2px solid var(--mm-border)',
            background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 900, cursor: 'pointer',
          }}
        >
          {/* The emoji is decoration: the name is "Hide grade" / "Show grade",
              never "see-no-evil monkey Hide grade". The label already says
              what pressing does, so there is no aria-pressed: "Show grade,
              pressed" contradicts itself. */}
          <span aria-hidden="true">{hidden ? '👁' : '🙈'}</span>
          {hidden ? ' Show grade' : ' Hide grade'}
        </button>
      </div>

      <ul
        style={{
          listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex',
          flexWrap: 'wrap', gap: 8, fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text)',
        }}
      >
        <li style={{ ...chipStyle, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }}>{summary.graded} graded</li>
        {/* Red only when something IS missing: "0 missing" is good news and
            reads as neutral (job H). When something is missing the chip is a
            button that opens this period and moves to the first missing row
            (NAV-2). */}
        {missingWarning && onShowMissing ? (
          <li data-missing-count={summary.missing} style={{ display: 'flex' }}>
            <button
              type="button"
              data-show-missing
              aria-label={missingWarning.actionLabel}
              onClick={() => onShowMissing()}
              style={{
                ...chipStyle, appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 900,
                minHeight: MIN_TOUCH_TARGET_PX, border: '2px solid var(--mm-error-text)', cursor: 'pointer',
                background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', textDecoration: 'underline',
              }}
            >
              {summary.missing} missing <span aria-hidden="true">→</span>
            </button>
          </li>
        ) : (
          <li data-missing-count={summary.missing} style={{ ...chipStyle, ...(summary.missing > 0 ? { background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' } : { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' }) }}>{summary.missing} missing</li>
        )}
        <li style={{ ...chipStyle, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{summary.pending} pending</li>
      </ul>

      {!hidden && <GradeMath summary={summary} />}
    </section>
  );
}

/*
 * "HOW THIS GRADE IS FIGURED."
 *
 * Every number here is the summary's own (describeGradeMath reads
 * summarizeGradeEntries' earned/possible points and counts): the percent it
 * prints IS the big number above, so the explanation can never disagree with
 * the grade it explains. Hidden with the grade, because it is the grade.
 */
function GradeMath({ summary }) {
  const [open, setOpen] = useState(false);
  const math = describeGradeMath(summary);
  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="grade-math-body"
        onClick={() => setOpen((current) => !current)}
        style={{
          appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
          minHeight: MIN_TOUCH_TARGET_PX, padding: '8px 12px', borderRadius: 10,
          border: '2px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)',
          fontWeight: 900, fontSize: 'calc(14 * var(--mm-px))', cursor: 'pointer', textAlign: 'left', overflowWrap: 'anywhere',
        }}
      >
        <span aria-hidden="true" style={{ display: 'inline-block', marginRight: 8, transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        How this grade is figured
      </button>
      {open && (
        <div id="grade-math-body" data-grade-math style={{ marginTop: 10, fontSize: 'calc(14 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text)', overflowWrap: 'anywhere' }}>
          <p style={{ margin: 0, fontWeight: 800 }}>{math.headline}</p>
          {math.lines.map((line) => (
            <p key={line} style={{ margin: '6px 0 0' }}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/*
 * "WAYS TO RAISE YOUR GRADE."
 *
 * The list is built by buildWaysToRaise (platform/student/waysToRaiseModel.js)
 * and arrives as a prop; this only draws it. Each row is one button that hands
 * the way back to App, which opens the screen that enforces the rule.
 * Not wired (undefined) renders nothing; an empty list says so kindly.
 */
function WaysToRaise({ ways, onWayAction }) {
  if (!Array.isArray(ways)) return null;
  return (
    <section
      aria-labelledby="ways-to-raise-heading"
      style={{
        background: 'var(--mm-surface)', borderRadius: 14, border: '1px solid var(--mm-border)',
        padding: '14px 16px', marginBottom: 18, textAlign: 'left',
      }}
    >
      <h2 id="ways-to-raise-heading" style={{ margin: 0, fontSize: 'calc(16 * var(--mm-px))', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
        Ways to raise your grade{ways.length ? ` (${ways.length})` : ''}
      </h2>
      {ways.length === 0 ? (
        <p style={{ margin: '8px 0 0', fontSize: 'calc(14 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
          You're all caught up — nothing to make up right now.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {ways.map((way) => {
            const rowStyle = {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
              width: '100%', minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--mm-border)',
              borderLeft: `4px solid ${way.urgency === 'high' ? 'var(--mm-warning-text)' : 'var(--mm-primary-text)'}`,
              background: way.urgency === 'high' ? 'var(--mm-warning-soft)' : 'var(--mm-surface-sunken)',
              color: 'var(--mm-text)', textAlign: 'left', boxSizing: 'border-box',
            };
            const text = <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 'calc(14 * var(--mm-px))', fontWeight: 700, overflowWrap: 'anywhere' }}>{way.text}</span>;
            return (
              <li key={way.id || `${way.kind}:${way.assignmentId}`} style={{ minWidth: 0 }}>
                {/*
                  Open overall, nothing workable this minute (a locked section,
                  a Warm-Up/DOL outside its window): no button to press, so a
                  tap can never land on a screen with nothing to do. The text
                  already carries the wait line.
                */}
                {way.action === 'none' ? (
                  <div data-way-kind={way.kind} data-way-waiting style={rowStyle}>{text}</div>
                ) : (
                  <button
                    type="button"
                    data-way-kind={way.kind}
                    onClick={() => onWayAction?.(way)}
                    style={{ appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit', cursor: 'pointer', ...rowStyle }}
                  >
                    {text}
                    <span style={{ fontSize: 'calc(13 * var(--mm-px))', fontWeight: 900, color: 'var(--mm-primary-text)', whiteSpace: 'nowrap' }}>{way.actionLabel} →</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GradeRow({ entry, hidden, onOpenResult, onPractice, onStart, today = null, headingLevel = 3, spellExitTicket = false }) {
  const Title = `h${headingLevel}`;
  const titleId = `grade-row-${String(entry.assignmentId || '').replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const tone = TONE[entry.status] || TONE[GRADE_STATUS.NOT_STARTED];
  // Which buttons this row offers was decided by the model
  // (resolveGradeRowActions, narrowed by the one "Today" rule when App passes
  // the dashboard's entry); the row only draws them.
  const actions = applyTodayToGradeActions(entry.actions || {}, today);
  const pressStart = () => {
    if (actions.start?.opensResult) onOpenResult?.(entry.assignmentId);
    else if (Number.isInteger(actions.start?.questionIndex)) onStart?.(entry.assignmentId, actions.start.questionIndex);
    else onStart?.(entry.assignmentId);
  };

  return (
    <article
      // Focus target for "N missing →" (NAV-2): focusing the row reads its title.
      tabIndex={-1}
      aria-labelledby={titleId}
      data-grade-status={entry.status}
      style={{
        background: 'var(--mm-surface)', borderRadius: 12, border: '1px solid var(--mm-border)',
        padding: 16, marginBottom: 12, textAlign: 'left', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <Title id={titleId} style={{ margin: 0, fontSize: 'calc(16 * var(--mm-px))', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{entry.title}</Title>
          <div style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
            {studentDueText(entry.dueAt)}
            {entry.frozen ? ` · Closed ${formatDateTime(entry.lateDueAt)}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <div style={{ fontSize: 'clamp(calc(18 * var(--mm-px)), calc(6vw * var(--mm-text-scale, 1)), calc(24 * var(--mm-px)))', fontWeight: 1000, color: 'var(--mm-text-strong)' }}>
            {/*
              A status word where a percentage would be a lie. `displayGrade` is
              null for anything the model refused to count, so this branch can
              never print 0% for pending or missing work.
            */}
            {hidden ? '••' : entry.displayGrade === null ? '—' : `${entry.displayGrade}%`}
          </div>
          <span style={{ display: 'inline-block', marginTop: 4, padding: '4px 9px', borderRadius: 999, fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, textTransform: 'uppercase', background: tone.bg, color: tone.color }}>
            {entry.statusLabel}
          </span>
        </div>
      </div>

      {actions.waitText && (
        <p data-wait-line style={{ margin: '10px 0 0', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text)' }}>{actions.waitText}</p>
      )}

      {/*
        An assignment-level teacher grade (an integrity zero): the fixed reason
        label only, from the model — never the teacher's note or name.
      */}
      {entry.teacherGradeText && (
        <p data-teacher-grade style={{ margin: '10px 0 0', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, fontWeight: 800, color: 'var(--mm-text)' }}>{entry.teacherGradeText}</p>
      )}

      {entry.exclusionText && (
        <p style={{ margin: '10px 0 0', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text-muted)' }}>{entry.exclusionText}</p>
      )}

      <GradeSectionBreakdown sections={entry.sections} shares={entry.sectionShares} hidden={hidden} compact spellExitTicket={spellExitTicket} />
      <TestCycleGradeBreakdown entry={entry} hidden={hidden} compact />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {actions.start && (
          <button type="button" style={actionButton(true)} onClick={pressStart}>
            {actions.start.label}
          </button>
        )}
        {actions.viewResults && (
          <button type="button" style={actionButton(!actions.start)} onClick={() => onOpenResult?.(entry.assignmentId)}>
            {SEE_RESULTS}
          </button>
        )}
        {actions.practiceNoCredit && (
          // Voluntary work on a closed assignment. Never called "Practice":
          // in student copy that word means only the lesson's Practice section.
          <button type="button" style={actionButton(false)} onClick={() => onPractice?.(entry.assignmentId)}>
            {CLOSED_WORK.tryAgain}
          </button>
        )}
      </div>
    </article>
  );
}

/*
 * A marking period. Its header is a disclosure button INSIDE a heading
 * (NAV-15), so a screen reader's heading list finds every period. `revealMissing`
 * counts presses of the summary's "N missing →": each opens the group and moves
 * focus to its first missing row (NAV-2).
 */
function PeriodGroup({ group, hidden, onOpenResult, onPractice, onStart, todayByAssignment = null, headingLevel = 2, revealMissing = 0, exitTicketSpelledOutOn = null }) {
  const [open, setOpen] = useState(group.defaultOpen === true);
  const bodyRef = useRef(null);
  const focusMissing = useRef(false);
  useEffect(() => {
    if (!revealMissing) return;
    focusMissing.current = true;
    setOpen(true);
  }, [revealMissing]);
  useEffect(() => {
    if (!open || !focusMissing.current) return;
    focusMissing.current = false;
    const row = bodyRef.current?.querySelector(`[data-grade-status="${GRADE_STATUS.MISSING}"]`);
    if (!row) return;
    row.focus({ preventScroll: true });
    try { row.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { row.scrollIntoView(); }
  }, [open, revealMissing]);
  if (!group.entries.length) return null;

  const Heading = `h${headingLevel}`;
  const bodyId = `grade-period-${group.period.id}`;
  return (
    <section aria-labelledby={`${bodyId}-heading`} style={{ marginBottom: 18 }}>
      <Heading style={{ margin: 0, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit', color: 'inherit' }}>
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
        <span aria-hidden="true" style={{ color: 'var(--mm-primary-text)', fontSize: 'calc(13 * var(--mm-px))', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span style={{ fontWeight: 900, fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
          {group.period.label}
        </span>
        <span style={{ fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' }}>
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
          <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)' }}>CLOSED</span>
        )}
      </button>
      </Heading>
      {open && (
        <div id={bodyId} ref={bodyRef}>
          {group.entries.map((entry) => (
            <GradeRow
              key={entry.assignmentId}
              entry={entry}
              hidden={hidden}
              onOpenResult={onOpenResult}
              onPractice={onPractice}
              onStart={onStart}
              today={todayByAssignment?.[entry.assignmentId] || null}
              headingLevel={Math.min(6, headingLevel + 1)}
              spellExitTicket={entry.assignmentId === exitTicketSpelledOutOn}
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
  onOpenResult = null,
  onPractice = null,
  // Start / Continue on open, unfinished work: App's startAssignment, which
  // lands on the first unfinished open question (or the Test Cycle card).
  onStart = null,
  // OPTIONAL { [assignmentId]: dashboard entry } (buildStudentDashboardModel
  // allEntries). With it, Start/Continue follows the one "Today" rule: only on
  // work that can be done now, landing on the question Home would choose, and
  // a Recovery opens the result page. Without it, the rows behave as before.
  todayByAssignment = null,
  // The "Ways to raise your grade" list from buildWaysToRaise, and the handler
  // for one of its rows. Undefined list: the section is not drawn.
  waysToRaise = undefined,
  onWayAction = null,
  // The read-only "What changed" panel, rendered right after the summary.
  whatChangedPanel = null,
  // The shared student destinations, Home among them. Grades used to offer
  // only a "← Home" control, which made it a cul-de-sac: a student checking a grade and then
  // wanting the assignment behind it had to go up to Home and back down.
  onNavigate = null,
  onLogout = null,
}) {
  const [hidden, setHidden] = useState(false);
  const [missingRequest, setMissingRequest] = useState(0);
  const { periodGroups = [], currentPeriod, currentSummary, pastPeriodGroups = [], courseLabel } = gradeCenter || {};
  const currentGroup = periodGroups.find((group) => group.period.isCurrent) || null;
  // D9: "Exit ticket (DOL)" once on Grades — on the first row, in screen order,
  // whose breakdown shows an exit ticket; "Exit ticket" on every other.
  const exitTicketSpelledOutOn = (() => {
    const ordered = [...(currentGroup?.entries || []), ...pastPeriodGroups.flatMap((group) => group.entries || [])];
    const index = firstExitTicketMention(ordered, (entry) => Number(entry?.sections?.dol?.total) > 0);
    return index >= 0 ? ordered[index].assignmentId : null;
  })();

  return (
    <div
      className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{
        fontFamily: '"Segoe UI", sans-serif',
        background: supportPresentation.highContrast ? 'var(--mm-surface)' : 'var(--mm-surface-control)',
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
          {/* One way back (NAV-20): the nav above has Home on every size;
              a second "← Home" under it said the same thing twice. */}
          <h1 style={{ margin: 0, fontSize: 'clamp(calc(20 * var(--mm-px)), calc(6vw * var(--mm-text-scale, 1)), calc(26 * var(--mm-px)))', color: 'var(--mm-primary-text)' }}>My Grades</h1>
        </header>

        <PeriodSummary
          courseLabel={courseLabel}
          periodLabel={currentPeriod?.label || ''}
          summary={currentSummary || { score: null, graded: 0, missing: 0, pending: 0, excused: 0, closed: 0, inProgress: [], notCountedOther: 0 }}
          hidden={hidden}
          onToggleHidden={() => setHidden((current) => !current)}
          onShowMissing={currentGroup ? () => setMissingRequest((count) => count + 1) : null}
        />

        {whatChangedPanel || null}

        <WaysToRaise ways={waysToRaise} onWayAction={onWayAction} />

        {currentGroup && (
          <PeriodGroup group={currentGroup} exitTicketSpelledOutOn={exitTicketSpelledOutOn} hidden={hidden} onOpenResult={onOpenResult} onPractice={onPractice} onStart={onStart} todayByAssignment={todayByAssignment} headingLevel={2} revealMissing={missingRequest} />
        )}

        {pastPeriodGroups.length > 0 && (
          <>
            <h2 style={{ margin: '22px 0 6px', fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text)' }}>Past Marking Periods</h2>
            {pastPeriodGroups.map((group) => (
              <PeriodGroup
                key={group.period.id}
                group={group}
                exitTicketSpelledOutOn={exitTicketSpelledOutOn}
                hidden={hidden}
                onOpenResult={onOpenResult}
                onPractice={onPractice}
                onStart={onStart}
                todayByAssignment={todayByAssignment}
                headingLevel={3}
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
