import { useMemo, useState } from 'react';
import {
  LIVE_FLAGS, LIVE_SEVERITY, QUESTION_STATE_CHARS, summarizeLiveClass,
} from '../../livePresence';

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

function StudentTile({ row, onOpenStudent }) {
  const style = SEVERITY_STYLE[row.severity] || SEVERITY_STYLE[LIVE_SEVERITY.OK];
  const live = row.live;
  const glyph = REPRESENTATION_GLYPH[live?.representation] || REPRESENTATION_GLYPH.text;

  return (
    <button
      type="button"
      onClick={() => onOpenStudent?.(row.id)}
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        border: `2px solid ${style.border}`,
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
        </div>
      )}
    </button>
  );
}

export default function LiveClassMonitor({
  students = [],
  assignments = [],
  classPeriods = [],
  initialClassPeriod = 'all',
  nowValue = Date.now(),
  onOpenStudent = null,
}) {
  // Opens on whichever period is in session; the teacher can widen it from
  // there. Deliberately not re-synced when the period changes mid-view, so a
  // bell does not yank the grid out from under whoever is reading it.
  const [classPeriod, setClassPeriod] = useState(initialClassPeriod || 'all');
  const [assignmentId, setAssignmentId] = useState('all');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const roster = useMemo(() => students.filter((student) => (
    classPeriod === 'all' || (student?.classPeriod || student?.profile?.classPeriod) === classPeriod
  )), [students, classPeriod]);

  const { rows, classStats, counts } = useMemo(() => summarizeLiveClass(roster, {
    nowValue,
    assignmentId: assignmentId === 'all' ? null : assignmentId,
  }), [roster, nowValue, assignmentId]);

  const visibleRows = onlyFlagged ? rows.filter((row) => row.severity === LIVE_SEVERITY.ALERT) : rows;

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
          <select value={classPeriod} onChange={(event) => setClassPeriod(event.target.value)} style={selectStyle} aria-label="Class period">
            <option value="all">All periods</option>
            {classPeriods.map((period) => <option key={period} value={period}>{period}</option>)}
          </select>
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
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div style={{ padding: '20px', border: '1px dashed #dadce0', borderRadius: '12px', color: '#5f6368', fontSize: '14px' }}>
          {rows.length === 0
            ? 'No students in this period yet. Tiles appear as soon as students open an assignment.'
            : 'Nobody needs attention right now.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
          {visibleRows.map((row) => (
            <StudentTile key={row.id} row={row} onOpenStudent={onOpenStudent} />
          ))}
        </div>
      )}
    </section>
  );
}
