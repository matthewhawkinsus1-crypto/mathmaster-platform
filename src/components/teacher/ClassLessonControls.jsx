import { useState } from 'react';
import DOLCountdown from '../student/DOLCountdown.jsx';
import { formatLessonDay, nextClassDateKey } from '../../platform/teacher/classLessonControls.js';
import { formatDateTime } from '../../assignmentLifecycle.js';
import './teacherWorkspace.css';

/*
 * TODAY FIRST. EVERYTHING ELSE ONE CLICK AWAY, NEVER GONE.
 *
 * The one renderer for a class's Warm-Up, Classwork, Practice and DOL controls
 * (Home, the class page, and the Assignment Hub all use it). It takes the
 * grouped projection from platform/teacher/classLessonControls.js and shows:
 *
 *   - today's lessons, open, with every control;
 *   - "Still open this week" and "Earlier lessons" folded away — still able to
 *     open a Warm-Up or DOL today for a reused lesson, just not in the way.
 *
 * Each section row says what the automatic schedule is, what is actually true
 * now, and whether a teacher override is in force, so a teacher can tell at a
 * glance whether MathMaster or they are driving.
 */

const TIMER_CHOICES = [3, 5, 7, 10, 15, 20];

function ControlRow({ row, lesson, classContext, classKey, handlers, busy, schedule, nowValue, classLabel }) {
  const { assignment } = lesson;
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState(() => nextClassDateKey({ schedule, classPeriod: classContext.classPeriod, fromValue: nowValue }) || '');
  const warmupKey = `${assignment.id}:${classKey}`;
  const sectionKey = `${assignment.id}:${classKey}:${row.kind}`;
  const dolKey = `${assignment.id}:${classKey}`;
  const isBusy = (row.kind === 'warmup' && busy.warmup === warmupKey)
    || ((row.kind === 'classwork' || row.kind === 'practice') && busy.section === sectionKey)
    || (row.kind === 'dol' && (busy.dolUnlock === dolKey || busy.dolGrant === dolKey || busy.dolControl === dolKey));

  const run = (action) => {
    if (row.kind === 'warmup') {
      if (action.id === 'timer') handlers.onToggleWarmup?.(assignment, classContext, { action: 'timer', autoCloseMinutes: timerMinutes });
      else handlers.onToggleWarmup?.(assignment, classContext, { action: action.id });
      return;
    }
    if (row.kind === 'classwork' || row.kind === 'practice') {
      handlers.onToggleSectionAccess?.(assignment, classContext, row.kind);
      return;
    }
    if (action.id === 'open') handlers.onUnlockDOL?.(assignment, classContext);
    else if (action.id === 'grant') handlers.onGrantDOLAttempt?.(assignment, classContext);
    else if (action.id === 'move') setMoving(true);
    else handlers.onDolControl?.(assignment, classContext, { action: action.id, minutes: action.minutes });
  };

  return (
    <div className="tw-control" data-live={row.status === 'active' ? 'true' : 'false'} data-override={row.override ? 'true' : 'false'} data-section={row.kind}>
      <div style={{ minWidth: 0 }}>
        <div className="tw-row" style={{ gap: 7 }}>
          <span className="tw-pill" data-tone={row.status === 'active' || row.status === 'open' ? 'success' : 'neutral'}>{row.label}</span>
          <span className="tw-control__title">{row.headline}</span>
          {row.countdownEndsAt && <span className="tw-countdown"><DOLCountdown endsAt={row.countdownEndsAt} /> left</span>}
        </div>
        <div className="tw-control__meta">
          {row.schedule}
          {row.overrides.length > 0 && <> · <strong style={{ color: 'var(--mm-warning-text)' }}>{row.overrides.join(' · ')}</strong></>}
        </div>
      </div>
      <div className="tw-control__actions">
        {row.actions.map((action) => (
          action.timer ? (
            <span key={action.id} className="tw-row" style={{ gap: 4 }}>
              <label className="tw-sr-only" htmlFor={`timer-${warmupKey}`}>Warm-Up timer minutes</label>
              <select id={`timer-${warmupKey}`} className="tw-select" value={timerMinutes} disabled={isBusy} onChange={(event) => setTimerMinutes(Number(event.target.value))}>
                {TIMER_CHOICES.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </select>
              <button type="button" className="tw-btn tw-btn--sm" disabled={isBusy} onClick={() => run(action)}>{action.label.replace('…', '')} {timerMinutes} min</button>
            </span>
          ) : (
            <button
              key={`${action.id}-${action.minutes || ''}`}
              type="button"
              className={`tw-btn tw-btn--sm${action.tone === 'primary' ? ' tw-btn--primary' : action.tone === 'danger' ? ' tw-btn--danger' : ''}`}
              disabled={isBusy}
              onClick={() => run(action)}
            >
              {isBusy && action.tone === 'primary' ? 'Saving…' : action.label}
            </button>
          )
        ))}
      </div>
      {moving && (
        <div className="tw-control__schedule tw-row" style={{ gap: 8 }}>
          <label className="tw-row tw-small tw-strong" style={{ gap: 6 }}>
            Move this class&apos;s DOL to
            <input className="tw-input" type="date" value={moveTo} onChange={(event) => setMoveTo(event.target.value)} />
          </label>
          <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" disabled={!moveTo || isBusy} onClick={() => { handlers.onDolControl?.(assignment, classContext, { action: 'move', toDateKey: moveTo }); setMoving(false); }}>
            Move DOL
          </button>
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => setMoving(false)}>Cancel</button>
          <span className="tw-small tw-muted">Only {classLabel || 'this class'} changes. Nothing is closed or graded; the original day is kept so you can move it back.</span>
        </div>
      )}
    </div>
  );
}

function LessonCard({ lesson, classContext, classKey, handlers, busy, schedule, nowValue, onOpenAssignment, classLabel }) {
  const { assignment, lifecycle } = lesson;
  const { rows } = lesson;
  return (
    <article className="tw-card" style={{ padding: '12px 14px' }} data-lesson-group={lesson.group}>
      <div className="tw-row" style={{ justifyContent: 'space-between', marginBottom: rows.length ? 8 : 0 }}>
        <div style={{ minWidth: 0 }}>
          {onOpenAssignment
            ? <button type="button" className="tw-link" style={{ fontSize: 15 }} onClick={() => onOpenAssignment(assignment.id, classContext.classId)}>{assignment.title}</button>
            : <strong style={{ color: 'var(--mm-text-strong)' }}>{assignment.title}</strong>}
          <div className="tw-small tw-muted">
            {lifecycle.isScheduled ? `Opens ${formatDateTime(assignment.releaseAt || assignment.releaseDate)}` : lifecycle.isLate ? `Late window until ${formatDateTime(assignment.lateDueAt || assignment.lateDueDate)}` : lifecycle.isClosed ? 'Closed — practice only' : `Due ${formatDateTime(assignment.dueAt || assignment.dueDate)}`}
          </div>
        </div>
        {onOpenAssignment && <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => onOpenAssignment(assignment.id, classContext.classId)}>Details</button>}
      </div>
      <div className="tw-stack" style={{ gap: 6 }}>
        {rows.map((row) => (
          <ControlRow
            key={row.kind}
            row={row}
            lesson={lesson}
            classContext={classContext}
            classKey={classKey}
            handlers={handlers}
            busy={busy}
            schedule={schedule}
            nowValue={nowValue}
            classLabel={classLabel}
          />
        ))}
      </div>
    </article>
  );
}

/** One assignment's section controls for one class, without the lesson card (the Assignment Hub). */
export function AssignmentLessonRows({ lesson, classContext, classLabel = '', schedule, nowValue = Date.now(), handlers = {}, busy = {} }) {
  if (!lesson || !classContext) return null;
  const classKey = classContext.classId || classContext.classPeriod;
  if (!lesson.rows.length) {
    return <div className="tw-card tw-card--muted tw-small">This assignment has no timed Warm-Up, DOL, or lockable Classwork/Practice for {classLabel || 'this class'} right now.</div>;
  }
  return (
    <div className="tw-stack" style={{ gap: 6 }}>
      {lesson.rows.map((row) => (
        <ControlRow key={row.kind} row={row} lesson={lesson} classContext={classContext} classKey={classKey} handlers={handlers} busy={busy} schedule={schedule} nowValue={nowValue} classLabel={classLabel} />
      ))}
    </div>
  );
}

export default function ClassLessonControls({
  lessons,
  classContext,
  classLabel = '',
  schedule,
  nowValue = Date.now(),
  handlers = {},
  busy = {},
  onOpenAssignment = null,
  heading = null,
  showOpen = true,
  showEarlier = true,
  emptyText = null,
}) {
  if (!lessons || !classContext) return null;
  const classKey = classContext.classId || classContext.classPeriod;
  const common = { classContext, classKey, handlers, busy, schedule, nowValue, onOpenAssignment, classLabel };
  const openCount = showOpen ? lessons.open.length : 0;
  const earlierCount = showEarlier ? lessons.earlier.length : 0;
  return (
    <section className="tw-stack" style={{ gap: 10 }} aria-label={`Lesson controls for ${classLabel || 'this class'}`}>
      {heading}
      {lessons.today.length === 0 ? (
        <div className="tw-card tw-card--muted tw-small">
          {emptyText || `No Warm-Up or DOL is scheduled today for ${classLabel || 'this class'}.`}
          {(openCount + earlierCount) > 0 && ' Open one from the lessons below if your plans changed.'}
        </div>
      ) : lessons.today.map((lesson) => <LessonCard key={lesson.assignment.id} lesson={lesson} {...common} />)}
      {openCount > 0 && (
        <details className="tw-disclosure">
          <summary>Still open this week <span className="tw-pill">{openCount}</span></summary>
          <div className="tw-disclosure__body tw-stack" style={{ gap: 8 }}>
            {lessons.open.map((lesson) => <LessonCard key={lesson.assignment.id} lesson={lesson} {...common} />)}
          </div>
        </details>
      )}
      {earlierCount > 0 && (
        <details className="tw-disclosure">
          <summary>Earlier lessons <span className="tw-pill">{earlierCount}</span><span className="tw-small tw-muted" style={{ fontWeight: 600 }}>open a Warm-Up or DOL again for today</span></summary>
          <div className="tw-disclosure__body tw-stack" style={{ gap: 8 }}>
            {lessons.earlier.map((lesson) => <LessonCard key={lesson.assignment.id} lesson={lesson} {...common} />)}
          </div>
        </details>
      )}
    </section>
  );
}

export { formatLessonDay };
