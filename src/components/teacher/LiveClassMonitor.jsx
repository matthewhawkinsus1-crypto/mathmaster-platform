import { useMemo, useState } from 'react';
import {
  LIVE_FLAGS, LIVE_SEVERITY, QUESTION_STATE_CHARS, summarizeLiveClass,
} from '../../livePresence';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';
import { studentsInClass } from '../../../functions/shared/classModel.mjs';
import { suggestMovesForClass } from '../../platform/teacher/liveCoaching.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_STAGE,
  buildIntegrityReviewSignal,
} from '../../platform/teacher/studentSupportSignals.js';

// A tile per student, sorted so whoever needs the teacher is first. The
// "thumbnail" is a reconstruction of the student's screen state, not a
// screenshot — see the note at the top of livePresence.js.

const SEVERITY_STYLE = {
  [LIVE_SEVERITY.ALERT]: { border: '#d93025', background: '#fff5f4', chip: '#d93025' },
  [LIVE_SEVERITY.WATCH]: { border: '#f9ab00', background: '#fffbf0', chip: '#a56800' },
  [LIVE_SEVERITY.OK]: { border: '#dfe3e7', background: '#fff', chip: '#188038' },
};

const FLAG_LABEL = {
  [LIVE_FLAGS.OFFLINE]: 'Offline',
  [LIVE_FLAGS.NOT_STARTED]: 'Not started',
  [LIVE_FLAGS.IDLE]: 'Idle',
  [LIVE_FLAGS.BEHIND_PACE]: 'Behind pace',
  [LIVE_FLAGS.STRUGGLING]: 'Low accuracy',
  [LIVE_FLAGS.STUCK]: 'Stuck',
};

// A glyph per representation so the teacher can see at a glance whether the
// student is on a graph, a table or a number line without reading anything.
const REPRESENTATION_GLYPH = {
  graph: '📈', table: '▦', numberLine: '↔', mapping: '⇉',
  orderedPairs: '⁙', symbolic: '𝑥', interactive: '✥', text: '¶',
};

const STATE_COLOR = {
  [QUESTION_STATE_CHARS.CORRECT]: '#188038',
  [QUESTION_STATE_CHARS.INCORRECT]: '#d93025',
  [QUESTION_STATE_CHARS.ATTEMPTED]: '#f9ab00',
  [QUESTION_STATE_CHARS.UNTOUCHED]: '#dadce0',
};

function ProgressStrip({ questionStates, questionIndex }) {
  const states = String(questionStates || '');
  if (!states) return null;
  return (
    <div style={{ display: 'flex', gap: '2px', marginTop: '8px' }} aria-hidden="true">
      {[...states].map((character, index) => (
        <span
          key={index}
          style={{
            flex: 1,
            height: index === questionIndex ? '10px' : '6px',
            alignSelf: 'center',
            borderRadius: '2px',
            background: STATE_COLOR[character] || STATE_COLOR['.'],
            outline: index === questionIndex ? '2px solid #1a73e8' : 'none',
          }}
        />
      ))}
    </div>
  );
}

function StudentTile({
  row,
  onOpenStudent,
  profile = null,
  suggestion = null,
  roomMode = false,
  integritySignal = null,
  onSupportAction = null,
}) {
  const style = SEVERITY_STYLE[row.severity] || SEVERITY_STYLE[LIVE_SEVERITY.OK];
  const live = row.live;
  const glyph = REPRESENTATION_GLYPH[live?.representation] || REPRESENTATION_GLYPH.text;

  return (
    <div
      role={onOpenStudent ? 'button' : undefined}
      tabIndex={onOpenStudent ? 0 : undefined}
      onClick={() => onOpenStudent?.(row.id)}
      onKeyDown={(event) => {
        if (onOpenStudent && (event.key === 'Enter' || event.key === ' ')) onOpenStudent(row.id);
      }}
      style={{
        textAlign: 'left',
        padding: roomMode ? '18px 20px' : '12px 14px',
        fontSize: roomMode ? 17 : 'inherit',
        border: `${roomMode ? 3 : 2}px solid ${style.border}`,
        borderRadius: '12px',
        background: style.background,
        cursor: onOpenStudent ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: 0,
      }}
      aria-label={`${row.name}: ${row.headline}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontWeight: 700, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.name}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: style.chip, whiteSpace: 'nowrap' }}>
          {row.headline}
        </span>
      </div>

      {/*
        TWO DIFFERENT FACTS, SIDE BY SIDE ON PURPOSE.
        The tile's colour is LIVE state — what is happening in the room in the
        next thirty seconds. The badge is the ACADEMIC profile, built from a
        term of evidence. A student can be stuck on this question and Above
        Level, and a teacher walking the room needs both: the first tells them
        where to go next, the second tells them what to say when they get there.
        This screen used to show only the first, which is how "stuck right now"
        quietly became a teacher's mental model of a child.
      */}
      <div style={{ marginTop: 5 }}>
        <StudentPerformanceBadge profile={profile} size="small" showEngagement={false} studentName={row.name} />
      </div>

      {live?.assignmentId ? (
        <>
          <div style={{ fontSize: '12px', color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span aria-hidden="true" style={{ marginRight: '6px' }}>{glyph}</span>
            {String(live.activityRole || 'activity').toUpperCase()} Q{Number(live.sectionQuestionIndex ?? live.questionIndex ?? 0) + 1} · {live.questionLabel || live.assignmentTitle || 'Working'}
          </div>
          <ProgressStrip questionStates={live.questionStates} questionIndex={live.questionIndex} />
          <div style={{ fontSize: '11px', color: '#80868b', marginTop: '6px' }}>
            {row.counts.answered} of {live.questionCount || row.counts.answered} answered
            {row.counts.accuracy !== null && ` · ${row.counts.accuracy}% correct`}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '12px', color: '#5f6368' }}>No assignment open</div>
      )}

      {/*
        WHAT TO SAY WHEN YOU GET HERE. Only on tiles that need it — a coaching
        line under every student is a coaching line a teacher stops reading. It
        never contains mathematics; see the rule at the top of liveCoaching.js.
      */}
      {suggestion && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.72)' }}>
          <div style={{ fontWeight: 800, fontSize: roomMode ? 15 : 12.5, color: '#202124', lineHeight: 1.35 }}>
            {suggestion.headline}
          </div>
          {!roomMode && (
            <div style={{ marginTop: 3, fontSize: 11.5, color: '#5f6368', lineHeight: 1.45 }}>{suggestion.why}</div>
          )}
        </div>
      )}

      {row.flags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
          {row.flags.map((flag) => (
            <span
              key={flag}
              style={{
                fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '999px',
                background: '#fff', border: `1px solid ${style.border}`, color: style.chip,
              }}
            >
              {FLAG_LABEL[flag] || flag}
            </span>
          ))}
          {integritySignal && (
            <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#fff4ce', border: '1px solid #d9a400', color: '#6b4c00' }}>
              Integrity review
            </span>
          )}
        </div>
      )}

      {onSupportAction && (row.flags.length > 0 || integritySignal) && !roomMode && (
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          style={{ marginTop: 9, paddingTop: 8, borderTop: '1px solid rgba(95,99,104,.18)', display: 'flex', flexWrap: 'wrap', gap: 6 }}
        >
          <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.WATCH_PRACTICE, SUPPORT_EVENT_STAGE.ACTION_TAKEN)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #9aa0a6', background: '#fff', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>
            Watch Practice
          </button>
          <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.SMALL_GROUP, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #9aa0a6', background: '#fff', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>
            Small-group candidate
          </button>
          {(row.flags.includes(LIVE_FLAGS.IDLE) || row.flags.includes(LIVE_FLAGS.BEHIND_PACE)) && (
            <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.OFF_TASK_CONCERN, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #b06000', background: '#fff8df', color: '#6a4900', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>
              Confirm off-task
            </button>
          )}
          <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #9aa0a6', background: '#fff', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>
            Parent follow-up
          </button>
          {integritySignal && (
            <>
              <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.INTEGRITY_REVIEW, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED, integritySignal)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #d9a400', background: '#fff4ce', color: '#6b4c00', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}>
                Log integrity review
              </button>
              <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.SIGNAL_DISMISSED, SUPPORT_EVENT_STAGE.DISMISSED, integritySignal)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #dadce0', background: '#fff', color: '#5f6368', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>
                Dismiss pattern
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveClassMonitor({
  students = [],
  assignments = [],
  classPeriods = [],
  initialClassPeriod = 'all',
  nowValue = Date.now(),
  onOpenStudent = null,
  // The SAME profiles the roster and the gradebook render. This screen used to
  // have no academic signal at all, so its live severity was the only thing a
  // teacher saw about a student while standing next to them.
  learningProfilesByStudentId = {},
  // Authoritative class boundary. Filtering by period alone merged two classes
  // that happen to share a period label into one live grid.
  activeClassId = null,
  classes = [],
  onRecordSupportEvent = null,
}) {
  // Opens on whichever period is in session; the teacher can widen it from
  // there. Deliberately not re-synced when the period changes mid-view, so a
  // bell does not yank the grid out from under whoever is reading it.
  const [classPeriod, setClassPeriod] = useState(initialClassPeriod || 'all');
  const [assignmentId, setAssignmentId] = useState('all');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  // FOR A TEACHER WALKING AROUND A ROOM, not one sitting at a desk. Larger
  // tiles, fewer per row, and the reasoning line dropped — because a screen
  // read at arm's length while moving is a different screen from one read at
  // reading distance, and trying to be both is how it becomes neither.
  const [roomMode, setRoomMode] = useState(false);

  const roster = useMemo(() => {
    // classId first. The period dropdown remains for a school whose records
    // predate class identities, and for the deliberate "all" view.
    if (activeClassId) {
      return studentsInClass({ students, classes, classId: activeClassId });
    }
    return students.filter((student) => (
      classPeriod === 'all' || (student?.classPeriod || student?.profile?.classPeriod) === classPeriod
    ));
  }, [students, classes, activeClassId, classPeriod]);

  const { rows, classStats, counts } = useMemo(() => summarizeLiveClass(roster, {
    nowValue,
    assignmentId: assignmentId === 'all' ? null : assignmentId,
  }), [roster, nowValue, assignmentId]);

  const visibleRows = onlyFlagged ? rows.filter((row) => row.severity === LIVE_SEVERITY.ALERT) : rows;

  const suggestions = useMemo(
    () => suggestMovesForClass({ rows: visibleRows, profilesByStudentId: learningProfilesByStudentId }),
    [visibleRows, learningProfilesByStudentId],
  );

  const integrityByStudentId = useMemo(() => Object.fromEntries(
    visibleRows
      .map((row) => [row.id, buildIntegrityReviewSignal({
        row,
        profile: learningProfilesByStudentId[row.id] || null,
      })])
      .filter(([, signal]) => Boolean(signal)),
  ), [visibleRows, learningProfilesByStudentId]);

  const handleSupportAction = (row, kind, stage, integritySignal = null) => {
    if (!onRecordSupportEvent) return;
    const live = row.live || {};
    const evidence = {
      flags: row.flags,
      severity: row.severity,
      answered: row.counts?.answered ?? 0,
      accuracy: row.counts?.accuracy,
      idleMs: row.idleMs,
      currentAttempts: live.currentAttempts,
      focusLossCount: live.focusLossCount,
      rapidCorrectCount: live.rapidCorrectCount,
      rapidDeepCorrectCount: live.rapidDeepCorrectCount,
      timedIndependentCorrectCount: live.timedIndependentCorrectCount,
      sessionActiveSeconds: live.sessionActiveSeconds,
      ...(integritySignal?.evidence || {}),
    };
    const summary = kind === SUPPORT_EVENT_KIND.SIGNAL_DISMISSED
      ? 'Teacher reviewed and dismissed the unusual-response signal.'
      : kind === SUPPORT_EVENT_KIND.INTEGRITY_REVIEW
        ? 'Teacher marked the unusual response pattern for integrity review. This is not a cheating finding.'
        : kind === SUPPORT_EVENT_KIND.OFF_TASK_CONCERN
          ? 'Teacher confirmed an off-task/productivity concern after reviewing the live signal.'
          : kind === SUPPORT_EVENT_KIND.WATCH_PRACTICE
            ? 'Teacher added the student to the live Watch Practice list.'
            : kind === SUPPORT_EVENT_KIND.SMALL_GROUP
              ? 'Teacher added the student as a small-group candidate.'
              : 'Teacher added the student to Parent Follow-Up for review.';

    onRecordSupportEvent({
      kind,
      stage,
      studentId: row.id,
      studentName: row.name,
      classId: activeClassId || live.classId || null,
      classPeriod: row.classPeriod || live.classPeriod || null,
      assignmentId: live.assignmentId || null,
      assignmentTitle: live.assignmentTitle || null,
      sessionKey: live.assignmentId && live.startedAt ? `${live.assignmentId}:${live.startedAt}` : null,
      source: 'liveMonitor',
      confidence: integritySignal?.confidence || null,
      summary,
      evidence,
    });
  };

  const selectStyle = {
    padding: '8px 10px', borderRadius: '8px', border: '1px solid #dadce0',
    background: '#fff', color: '#202124', fontSize: '14px',
  };

  return (
    <section style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#202124' }}>Live Class</h2>
        <span style={{ fontSize: '13px', color: '#5f6368' }}>
          {counts.online} of {counts.total} working
          {counts.needsAttention > 0 && (
            <strong style={{ color: '#d93025' }}> · {counts.needsAttention} need a look</strong>
          )}
          {classStats.meanAccuracy !== null && ` · class average ${classStats.meanAccuracy}%`}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {/*
            Hidden once the workspace has an authoritative class. Two selectors
            for the same idea is how a teacher ends up looking at Period 3 in
            one place and Period 5 in another.
          */}
          {!activeClassId && (
            <select value={classPeriod} onChange={(event) => setClassPeriod(event.target.value)} style={selectStyle} aria-label="Class period">
              <option value="all">All periods</option>
              {classPeriods.map((period) => <option key={period} value={period}>{period}</option>)}
            </select>
          )}
          <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} style={selectStyle} aria-label="Assignment">
            <option value="all">Any assignment</option>
            {assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>{assignment.title || 'Untitled'}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOnlyFlagged((current) => !current)}
            style={{
              ...selectStyle, cursor: 'pointer', fontWeight: 700,
              background: onlyFlagged ? '#fce8e6' : '#fff',
              borderColor: onlyFlagged ? '#d93025' : '#dadce0',
              color: onlyFlagged ? '#c5221f' : '#202124',
            }}
            aria-pressed={onlyFlagged}
          >
            Needs attention only
          </button>
          <button
            type="button"
            onClick={() => setRoomMode((current) => !current)}
            aria-pressed={roomMode}
            title="Larger tiles for reading while moving around the room"
            style={{
              ...selectStyle, cursor: 'pointer', fontWeight: 700,
              background: roomMode ? '#e8f0fe' : '#fff',
              borderColor: roomMode ? '#1a73e8' : '#dadce0',
              color: roomMode ? '#174ea6' : '#202124',
            }}
          >
            Room view
          </button>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div style={{ padding: '20px', border: '1px dashed #dadce0', borderRadius: '12px', color: '#5f6368', fontSize: '14px' }}>
          {rows.length === 0
            ? 'No students in this period yet. Tiles appear as soon as students open an assignment.'
            : 'Nobody needs attention right now.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${roomMode ? 330 : 230}px, 1fr))`, gap: roomMode ? '16px' : '12px' }}>
          {visibleRows.map((row) => (
            <StudentTile
              key={row.id}
              row={row}
              onOpenStudent={onOpenStudent}
              profile={learningProfilesByStudentId[row.id] || null}
              suggestion={suggestions[row.id] || null}
              roomMode={roomMode}
              integritySignal={integrityByStudentId[row.id] || null}
              onSupportAction={(kind, stage, signal) => handleSupportAction(row, kind, stage, signal)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
