import { useMemo, useState } from 'react';
import {
  LIVE_FLAGS, LIVE_SEVERITY, QUESTION_STATE_CHARS, summarizeLiveClass,
} from '../../livePresence';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';
import DOLCountdown from '../student/DOLCountdown.jsx';
import {
  assignmentIsForStudent,
  getDOLState,
  getIncludedQuestionIndices,
  getWarmupState,
} from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from '../../platform/policies/activityPolicies.js';
import { buildWalkthroughMonitor, WALKTHROUGH_STATUS } from '../../platform/teacher/walkthroughMonitor.js';
import {
  LIVE_ATTENDANCE_MARK,
  attendanceByStudentForDay,
  attendanceIsAbsent,
  buildLiveAttendanceEvent,
  localAttendanceDateKey,
  normalizeLiveAttendance,
} from '../../platform/teacher/liveAttendance.js';
import { studentsInClass } from '../../../functions/shared/classModel.mjs';
import { suggestMovesForClass } from '../../platform/teacher/liveCoaching.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_STAGE,
  buildIntegrityReviewSignal,
  hasDismissedSignal,
  supportSessionKey,
} from '../../platform/teacher/studentSupportSignals.js';

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

const WALKTHROUGH_STYLE = {
  [WALKTHROUGH_STATUS.NEEDS_CHECK]: { border: '#d93025', background: '#fff5f4', color: '#b3261e', label: 'Needs Check' },
  [WALKTHROUGH_STATUS.ON_QUESTION]: { border: '#1a73e8', background: '#eef4ff', color: '#174ea6', label: 'On This Question' },
  [WALKTHROUGH_STATUS.AHEAD]: { border: '#188038', background: '#e6f4ea', color: '#137333', label: 'Ahead' },
  [WALKTHROUGH_STATUS.DONE]: { border: '#188038', background: '#e6f4ea', color: '#137333', label: 'Completed' },
  [WALKTHROUGH_STATUS.ELSEWHERE]: { border: '#9aa0a6', background: '#f8f9fa', color: '#5f6368', label: 'Elsewhere' },
};

const ATTENDANCE_LABEL = {
  [LIVE_ATTENDANCE_MARK.PRESENT]: 'Present',
  [LIVE_ATTENDANCE_MARK.LATE]: 'Late',
  [LIVE_ATTENDANCE_MARK.ABSENT]: 'Absent',
  excused: 'Absent',
  unexcused: 'Absent',
};

function ProgressStrip({ questionStates, questionIndex }) {
  const states = String(questionStates || '');
  if (!states) return null;
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 8 }} aria-hidden="true">
      {[...states].map((character, index) => (
        <span
          key={index}
          style={{
            flex: 1,
            height: index === questionIndex ? 10 : 6,
            alignSelf: 'center',
            borderRadius: 2,
            background: STATE_COLOR[character] || STATE_COLOR['.'],
            outline: index === questionIndex ? '2px solid #1a73e8' : 'none',
          }}
        />
      ))}
    </div>
  );
}

const smallButtonStyle = { padding: '5px 8px', borderRadius: 7, border: '1px solid #9aa0a6', background: '#fff', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' };
const controlStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: 14 };

function StudentTile({
  row,
  onOpenStudent,
  profile = null,
  suggestion = null,
  roomMode = false,
  integritySignal = null,
  onSupportAction = null,
  onAdjustPath = null,
  onRecommendPath = null,
  pathInterventionBusy = false,
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
        textAlign: 'left', padding: roomMode ? '18px 20px' : '12px 14px',
        fontSize: roomMode ? 17 : 'inherit', border: `${roomMode ? 3 : 2}px solid ${style.border}`,
        borderRadius: 12, background: style.background, cursor: onOpenStudent ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
      }}
      aria-label={`${row.name}: ${row.headline}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: style.chip, whiteSpace: 'nowrap' }}>{row.headline}</span>
      </div>

      <div style={{ marginTop: 5 }}>
        <StudentPerformanceBadge profile={profile} size="small" showEngagement={false} studentName={row.name} />
      </div>

      {live?.assignmentId ? (
        <>
          <div style={{ fontSize: 12, color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span aria-hidden="true" style={{ marginRight: 6 }}>{glyph}</span>
            {String(live.activityRole || 'activity').toUpperCase()} Q{Number(live.sectionQuestionIndex ?? live.questionIndex ?? 0) + 1} · {live.questionLabel || live.assignmentTitle || 'Working'}
          </div>
          <ProgressStrip questionStates={live.questionStates} questionIndex={live.questionIndex} />
          <div style={{ fontSize: 11, color: '#80868b', marginTop: 6 }}>
            {row.counts.answered} of {live.questionCount || row.counts.answered} answered
            {row.counts.accuracy !== null && ` · ${row.counts.accuracy}% correct`}
            {live.currentAttempts > 0 && ` · ${live.currentAttempts} attempt${live.currentAttempts === 1 ? '' : 's'} here`}
            {live.currentTeksCode && ` · TEKS ${live.currentTeksCode}`}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: '#5f6368' }}>No assignment open</div>
      )}

      {suggestion && (
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.72)' }}>
          <div style={{ fontWeight: 800, fontSize: roomMode ? 15 : 12.5, color: '#202124', lineHeight: 1.35 }}>{suggestion.headline}</div>
          {!roomMode && (
            <>
              <div style={{ marginTop: 3, fontSize: 11.5, color: '#5f6368', lineHeight: 1.45 }}>{suggestion.why}</div>
              {onSupportAction && (
                <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.TEACHER_INTERVENTION, SUPPORT_EVENT_STAGE.ACTION_TAKEN, null, { coachingSuggestion: suggestion })} style={{ marginTop: 6, padding: '5px 8px', borderRadius: 7, border: '1px solid #188038', background: '#e6f4ea', color: '#137333', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}>
                  Use this move
                </button>
              )}
            </>
          )}
        </div>
      )}

      {(row.flags.length > 0 || integritySignal) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {row.flags.map((flag) => (
            <span key={flag} style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: '#fff', border: `1px solid ${style.border}`, color: style.chip }}>
              {FLAG_LABEL[flag] || flag}
            </span>
          ))}
          {integritySignal && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#fff4ce', border: '1px solid #d9a400', color: '#6b4c00' }}>Integrity review</span>}
        </div>
      )}

      {onSupportAction && (row.flags.length > 0 || integritySignal) && !roomMode && (
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={{ marginTop: 9, paddingTop: 8, borderTop: '1px solid rgba(95,99,104,.18)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.WATCH_PRACTICE, SUPPORT_EVENT_STAGE.ACTION_TAKEN)} style={smallButtonStyle}>Watch Practice</button>
          {onRecommendPath && live?.currentTeksCode && (
            <button type="button" disabled={pathInterventionBusy} onClick={() => onRecommendPath(live.currentTeksCode)} title="Put this TEKS at the front of this student's personal My Math Path recommendations for 48 hours. Normal prerequisites still apply." style={{ ...smallButtonStyle, borderColor: '#188038', background: pathInterventionBusy ? '#eef0f2' : '#e6f4ea', color: '#137333', cursor: pathInterventionBusy ? 'wait' : 'pointer' }}>
              {pathInterventionBusy ? 'Updating Path…' : `Recommend ${live.currentTeksCode} in Path`}
            </button>
          )}
          {onAdjustPath && <button type="button" onClick={onAdjustPath} style={{ ...smallButtonStyle, borderColor: '#1a73e8', background: '#eef4ff', color: '#174ea6' }}>Adjust Path</button>}
          <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.SMALL_GROUP, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED)} style={smallButtonStyle}>Small-group candidate</button>
          {(row.flags.includes(LIVE_FLAGS.IDLE) || row.flags.includes(LIVE_FLAGS.BEHIND_PACE)) && (
            <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.OFF_TASK_CONCERN, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED)} style={{ ...smallButtonStyle, borderColor: '#b06000', background: '#fff8df', color: '#6a4900' }}>Confirm off-task</button>
          )}
          <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED)} style={smallButtonStyle}>Parent follow-up</button>
          {integritySignal && (
            <>
              <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.INTEGRITY_REVIEW, SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED, integritySignal)} style={{ ...smallButtonStyle, borderColor: '#d9a400', background: '#fff4ce', color: '#6b4c00' }}>Log integrity review</button>
              <button type="button" onClick={() => onSupportAction(SUPPORT_EVENT_KIND.SIGNAL_DISMISSED, SUPPORT_EVENT_STAGE.DISMISSED, integritySignal)} style={smallButtonStyle}>Dismiss pattern</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function classworkModel(assignment) {
  if (!assignment) return { questions: [], progressPositions: [] };
  const questions = getStoredAssignmentQuestions(assignment);
  const included = getIncludedQuestionIndices(assignment);
  const entries = included
    .map((questionIndex, progressPosition) => ({ questionIndex, progressPosition, question: questions[questionIndex] }))
    .filter(({ question }) => resolveQuestionActivityRole({ question, assignment }) === 'classwork');
  return {
    questions: entries.map(({ question, questionIndex }) => ({ question, questionIndex })),
    progressPositions: entries.map(({ progressPosition }) => progressPosition),
  };
}

function withClassworkStates(roster, selectedAssignment, progressPositions) {
  if (!selectedAssignment) return roster;
  return roster.map((student) => {
    const live = student?.liveStatus;
    if (!live || String(live.assignmentId || '') !== String(selectedAssignment.id || '')) return student;
    const progress = String(live.questionStates || '');
    const classworkQuestionStates = progressPositions.map((position) => progress[position] || '.').join('');
    return { ...student, liveStatus: { ...live, classworkQuestionStates } };
  });
}

function WalkthroughCard({ row, onChecked, onOpenStudent }) {
  const style = WALKTHROUGH_STYLE[row.status] || WALKTHROUGH_STYLE[WALKTHROUGH_STATUS.ELSEWHERE];
  const attendanceMark = normalizeLiveAttendance(row.attendance).mark;
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, border: `2px solid ${style.border}`, background: style.background, display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong style={{ color: '#202124' }}>{row.name}</strong>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {attendanceMark === LIVE_ATTENDANCE_MARK.LATE && <span style={{ fontSize: 10.5, fontWeight: 900, color: '#7a4f00', background: '#fff4ce', borderRadius: 999, padding: '2px 6px' }}>Late arrival</span>}
          <span style={{ fontSize: 11, fontWeight: 900, color: style.color }}>{style.label}</span>
        </div>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: style.color }}>{row.reason}</div>
      {row.live?.assignmentId && (
        <div style={{ fontSize: 11.5, color: '#5f6368' }}>
          {String(row.live.activityRole || 'activity').toUpperCase()} Q{Number(row.live.sectionQuestionIndex ?? 0) + 1}
          {row.live.currentAttempts > 0 && ` · ${row.live.currentAttempts} attempt${row.live.currentAttempts === 1 ? '' : 's'}`}
          {row.offline ? ' · connection inactive' : row.inactive ? ' · no recent app activity' : ' · active'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {onOpenStudent && <button type="button" onClick={() => onOpenStudent(row.id)} style={smallButtonStyle}>View work</button>}
        {row.status === WALKTHROUGH_STATUS.NEEDS_CHECK && !row.checked && (
          <button type="button" onClick={() => onChecked(row.id)} style={{ ...smallButtonStyle, borderColor: '#188038', background: '#e6f4ea', color: '#137333' }}>Checked</button>
        )}
      </div>
    </div>
  );
}

function AttendancePanel({ roster, attendanceByStudentId, onMark, busyStudentId = null }) {
  const sorted = [...roster].sort((a, b) => String(a?.displayName || a?.name || a?.id || '').localeCompare(String(b?.displayName || b?.name || b?.id || '')));
  return (
    <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '1px solid #c9ced6', background: '#f8f9fa' }}>
      <div style={{ fontWeight: 900, color: '#202124' }}>Today&apos;s Live Attendance</div>
      <div style={{ marginTop: 3, marginBottom: 10, fontSize: 12, color: '#5f6368' }}>
        Absent students are removed from live monitoring for today only. Mark Present or Late if a student arrives; their saved assignment work is never changed.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 7 }}>
        {sorted.map((student) => {
          const id = String(student?.id || student?.studentId || '');
          const name = student?.displayName || student?.name || student?.studentName || id;
          const mark = normalizeLiveAttendance(attendanceByStudentId[id]).mark || LIVE_ATTENDANCE_MARK.PRESENT;
          const busy = busyStudentId === id;
          return (
            <div key={id} style={{ background: '#fff', border: '1px solid #e0e3e7', borderRadius: 9, padding: '8px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 12.5 }}>{name}</strong>
                <div style={{ fontSize: 10.5, color: attendanceIsAbsent(mark) ? '#b3261e' : mark === LIVE_ATTENDANCE_MARK.LATE ? '#7a4f00' : '#137333', fontWeight: 900 }}>{ATTENDANCE_LABEL[mark] || 'Present'}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  [LIVE_ATTENDANCE_MARK.PRESENT, 'Present'],
                  [LIVE_ATTENDANCE_MARK.LATE, 'Late'],
                  [LIVE_ATTENDANCE_MARK.ABSENT, 'Absent'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    onClick={() => onMark(student, value)}
                    aria-pressed={mark === value || (value === LIVE_ATTENDANCE_MARK.ABSENT && attendanceIsAbsent(mark))}
                    style={{ ...smallButtonStyle, padding: '4px 6px', background: mark === value || (value === LIVE_ATTENDANCE_MARK.ABSENT && attendanceIsAbsent(mark)) ? '#e8f0fe' : '#fff', borderColor: mark === value || (value === LIVE_ATTENDANCE_MARK.ABSENT && attendanceIsAbsent(mark)) ? '#1a73e8' : '#dadce0', opacity: busy ? 0.55 : 1 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LiveClassMonitor({
  students = [],
  assignments = [],
  timerAssignments = null,
  classPeriods = [],
  initialClassPeriod = 'all',
  nowValue = Date.now(),
  onOpenStudent = null,
  learningProfilesByStudentId = {},
  activeClassId = null,
  classes = [],
  classSchedule = null,
  supportEvents = [],
  onRecordSupportEvent = null,
  onRecommendPersonalPath = null,
  pathInterventionBusyStudentId = null,
  onOpenWeeklyPath = null,
  attendanceByStudentId = {},
}) {
  const [classPeriod, setClassPeriod] = useState(initialClassPeriod || 'all');
  const [assignmentId, setAssignmentId] = useState('all');
  const [mode, setMode] = useState('room');
  const [roomMode, setRoomMode] = useState(false);
  const [teacherQuestionIndex, setTeacherQuestionIndex] = useState(0);
  const [walkthroughFilter, setWalkthroughFilter] = useState('needsCheck');
  const [checkedStudentIds, setCheckedStudentIds] = useState([]);
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceOverrides, setAttendanceOverrides] = useState({});
  const [attendanceBusyStudentId, setAttendanceBusyStudentId] = useState(null);

  const roster = useMemo(() => {
    if (activeClassId) return studentsInClass({ students, classes, classId: activeClassId });
    return students.filter((student) => classPeriod === 'all' || (student?.classPeriod || student?.profile?.classPeriod) === classPeriod);
  }, [students, classes, activeClassId, classPeriod]);

  const selectedAssignment = useMemo(() => assignments.find((assignment) => String(assignment.id) === String(assignmentId)) || null, [assignments, assignmentId]);
  const selectedClasswork = useMemo(() => classworkModel(selectedAssignment), [selectedAssignment]);
  const attendanceDateKey = useMemo(() => localAttendanceDateKey(nowValue), [nowValue]);
  const activeClassRecord = useMemo(() => (
    activeClassId ? classes.find((entry) => String(entry?.classId || '') === String(activeClassId)) || null : null
  ), [activeClassId, classes]);
  const attendanceClassPeriod = activeClassRecord?.period || (classPeriod !== 'all' ? classPeriod : null);

  const eventAttendance = useMemo(() => attendanceByStudentForDay({
    supportEvents,
    classId: activeClassId || null,
    classPeriod: activeClassId ? null : attendanceClassPeriod,
    dateKey: attendanceDateKey,
  }), [supportEvents, activeClassId, attendanceClassPeriod, attendanceDateKey]);

  const effectiveAttendance = useMemo(() => {
    const result = {};
    roster.forEach((student) => {
      const id = String(student?.id || student?.studentId || '');
      if (!id) return;
      const embedded = student?.attendanceToday || student?.currentAttendance || null;
      if (embedded) result[id] = embedded;
    });
    Object.assign(result, attendanceByStudentId || {}, eventAttendance, attendanceOverrides);
    return result;
  }, [attendanceByStudentId, attendanceOverrides, eventAttendance, roster]);

  const monitoredRoster = useMemo(() => roster.filter((student) => {
    const id = String(student?.id || student?.studentId || '');
    return !attendanceIsAbsent(effectiveAttendance[id]);
  }), [roster, effectiveAttendance]);

  const walkthroughRoster = useMemo(() => withClassworkStates(monitoredRoster, selectedAssignment, selectedClasswork.progressPositions), [monitoredRoster, selectedAssignment, selectedClasswork]);

  const walkthrough = useMemo(() => buildWalkthroughMonitor({
    students: walkthroughRoster,
    assignmentId: selectedAssignment?.id || null,
    teacherQuestionIndex,
    checkedStudentIds,
    attendanceByStudentId: effectiveAttendance,
    nowValue,
  }), [walkthroughRoster, selectedAssignment, teacherQuestionIndex, checkedStudentIds, effectiveAttendance, nowValue]);

  const { rows, classStats, counts } = useMemo(() => summarizeLiveClass(monitoredRoster, {
    nowValue,
    assignmentId: assignmentId === 'all' ? null : assignmentId,
  }), [monitoredRoster, nowValue, assignmentId]);

  const absentCount = Math.max(0, roster.length - monitoredRoster.length);
  const visibleRows = mode === 'attention' ? rows.filter((row) => row.severity !== LIVE_SEVERITY.OK) : rows;

  const timerContext = useMemo(() => {
    if (activeClassId) {
      const classRecord = classes.find((entry) => String(entry?.classId || '') === String(activeClassId)) || null;
      return classRecord?.period ? { classId: activeClassId, classPeriod: classRecord.period } : null;
    }
    return classPeriod !== 'all' ? { classId: null, classPeriod } : null;
  }, [activeClassId, classes, classPeriod]);

  const activeSectionTimers = useMemo(() => {
    if (!timerContext || !classSchedule) return [];
    const sourceAssignments = Array.isArray(timerAssignments) ? timerAssignments : assignments;
    return sourceAssignments
      .filter((assignment) => assignmentIsForStudent(assignment, timerContext))
      .flatMap((assignment) => {
        const warmup = getWarmupState({ assignment, schedule: classSchedule, ...timerContext, nowValue });
        const dol = getDOLState({ assignment, schedule: classSchedule, ...timerContext, nowValue });
        const timers = [];
        if (warmup.status === 'active' && warmup.endsAt) timers.push({ kind: 'Warm-Up', assignment, endsAt: warmup.endsAt, remaining: warmup.millisecondsRemaining });
        if (dol.status === 'active' && dol.endsAt) timers.push({ kind: 'DOL', assignment, endsAt: dol.endsAt, remaining: dol.millisecondsRemaining });
        return timers;
      })
      .sort((left, right) => Number(left.remaining || 0) - Number(right.remaining || 0));
  }, [assignments, timerAssignments, classSchedule, timerContext, nowValue]);

  const suggestions = useMemo(() => suggestMovesForClass({ rows: visibleRows, profilesByStudentId: learningProfilesByStudentId }), [visibleRows, learningProfilesByStudentId]);
  const integrityByStudentId = useMemo(() => Object.fromEntries(
    visibleRows
      .filter((row) => !hasDismissedSignal({
        supportEvents,
        studentId: row.id,
        assignmentId: row.live?.assignmentId || null,
        sessionKey: supportSessionKey({ studentId: row.id, assignmentId: row.live?.assignmentId, startedAt: row.live?.startedAt }),
        afterMs: Number(row.live?.startedAt) || 0,
      }))
      .map((row) => [row.id, buildIntegrityReviewSignal({ row, profile: learningProfilesByStudentId[row.id] || null })])
      .filter(([, signal]) => Boolean(signal)),
  ), [visibleRows, learningProfilesByStudentId, supportEvents]);

  const handleAttendanceMark = async (student, mark) => {
    if (!onRecordSupportEvent) return;
    const id = String(student?.id || student?.studentId || '');
    if (!id) return;
    const previous = attendanceOverrides[id];
    const arrivedAt = mark === LIVE_ATTENDANCE_MARK.ABSENT ? null : Number(nowValue);
    setAttendanceOverrides((current) => ({ ...current, [id]: { mark, arrivedAt, markedAt: Number(nowValue) } }));
    setAttendanceBusyStudentId(id);
    try {
      await onRecordSupportEvent(buildLiveAttendanceEvent({
        student,
        mark,
        classId: activeClassId || null,
        classPeriod: attendanceClassPeriod,
        nowValue,
        dateKey: attendanceDateKey,
      }));
    } catch (error) {
      setAttendanceOverrides((current) => {
        const next = { ...current };
        if (previous === undefined) delete next[id];
        else next[id] = previous;
        return next;
      });
      console.error('Could not update live attendance:', error);
    } finally {
      setAttendanceBusyStudentId(null);
    }
  };

  const handleSupportAction = (row, kind, stage, integritySignal = null, extra = {}) => {
    if (!onRecordSupportEvent) return;
    const live = row.live || {};
    const coachingSuggestion = extra?.coachingSuggestion || null;
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
      ...(coachingSuggestion ? { coachingMove: coachingSuggestion.move, coachingHeadline: coachingSuggestion.headline, coachingWhy: coachingSuggestion.why } : {}),
      ...(integritySignal?.evidence || {}),
    };
    const summary = coachingSuggestion
      ? `Teacher used the live coaching move: ${coachingSuggestion.headline}`
      : kind === SUPPORT_EVENT_KIND.SIGNAL_DISMISSED ? 'Teacher reviewed and dismissed the unusual-response signal.'
      : kind === SUPPORT_EVENT_KIND.INTEGRITY_REVIEW ? 'Teacher marked the unusual response pattern for integrity review. This is not a cheating finding.'
      : kind === SUPPORT_EVENT_KIND.OFF_TASK_CONCERN ? 'Teacher confirmed an off-task/productivity concern after reviewing the live signal.'
      : kind === SUPPORT_EVENT_KIND.WATCH_PRACTICE ? 'Teacher added the student to the live Watch Practice list.'
      : kind === SUPPORT_EVENT_KIND.SMALL_GROUP ? 'Teacher added the student as a small-group candidate.'
      : 'Teacher added the student to Parent Follow-Up for review.';

    onRecordSupportEvent({
      kind, stage, studentId: row.id, studentName: row.name,
      classId: activeClassId || live.classId || null,
      classPeriod: row.classPeriod || live.classPeriod || null,
      assignmentId: live.assignmentId || null,
      assignmentTitle: live.assignmentTitle || null,
      sessionKey: supportSessionKey({ studentId: row.id, assignmentId: live.assignmentId, startedAt: live.startedAt }),
      source: 'liveMonitor', confidence: integritySignal?.confidence || null, summary, evidence,
    });
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    if (nextMode === 'walkthrough' && assignmentId === 'all' && assignments.length) {
      setAssignmentId(assignments[0].id);
      setTeacherQuestionIndex(0);
      setCheckedStudentIds([]);
    }
  };

  const changeAssignment = (nextId) => {
    setAssignmentId(nextId);
    setTeacherQuestionIndex(0);
    setCheckedStudentIds([]);
  };

  const currentQuestion = selectedClasswork.questions[teacherQuestionIndex]?.question || null;
  const bottleneck = walkthrough.bottlenecks.find((entry) => entry.count >= 3) || null;
  const walkRows = walkthroughFilter === 'needsCheck' ? walkthrough.needsCheck
    : walkthroughFilter === 'onQuestion' ? walkthrough.onQuestion
    : walkthroughFilter === 'aheadDone' ? walkthrough.aheadDone
    : walkthrough.all;

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: '#202124' }}>Live Class</h2>
        <span style={{ fontSize: 13, color: '#5f6368' }}>
          {counts.online} of {counts.total} present students working
          {absentCount > 0 && <span> · {absentCount} absent</span>}
          {counts.needsAttention > 0 && <strong style={{ color: '#d93025' }}> · {counts.needsAttention} need a look</strong>}
          {classStats.meanAccuracy !== null && ` · class average ${classStats.meanAccuracy}%`}
        </span>
      </div>

      <div role="tablist" aria-label="Live monitoring mode" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          ['room', 'Room'],
          ['walkthrough', `Walkthrough${walkthrough.counts.needsCheck ? ` · ${walkthrough.counts.needsCheck}` : ''}`],
          ['attention', `Attention${counts.needsAttention ? ` · ${counts.needsAttention}` : ''}`],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => switchMode(id)} style={{ ...controlStyle, cursor: 'pointer', fontWeight: 900, background: mode === id ? '#e8f0fe' : '#fff', borderColor: mode === id ? '#1a73e8' : '#dadce0', color: mode === id ? '#174ea6' : '#3c4043' }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        {!activeClassId && (
          <select value={classPeriod} onChange={(event) => setClassPeriod(event.target.value)} style={controlStyle} aria-label="Class period">
            <option value="all">All periods</option>
            {classPeriods.map((period) => <option key={period} value={period}>{period}</option>)}
          </select>
        )}
        <select value={assignmentId} onChange={(event) => changeAssignment(event.target.value)} style={controlStyle} aria-label="Assignment">
          <option value="all">Any assignment</option>
          {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title || 'Untitled'}</option>)}
        </select>
        {mode === 'room' && <button type="button" onClick={() => setRoomMode((current) => !current)} aria-pressed={roomMode} style={{ ...controlStyle, cursor: 'pointer', fontWeight: 700, background: roomMode ? '#e8f0fe' : '#fff', borderColor: roomMode ? '#1a73e8' : '#dadce0', color: roomMode ? '#174ea6' : '#202124' }}>Large room tiles</button>}
        <button type="button" onClick={() => setShowAttendance((current) => !current)} aria-expanded={showAttendance} style={{ ...controlStyle, cursor: 'pointer', fontWeight: 800, background: showAttendance ? '#fff4ce' : '#fff', borderColor: showAttendance ? '#d9a400' : '#dadce0', color: showAttendance ? '#6b4c00' : '#202124' }}>
          Attendance{absentCount > 0 ? ` · ${absentCount} absent` : ''}
        </button>
      </div>

      {showAttendance && (
        <AttendancePanel
          roster={roster}
          attendanceByStudentId={effectiveAttendance}
          onMark={handleAttendanceMark}
          busyStudentId={attendanceBusyStudentId}
        />
      )}

      {activeSectionTimers.length > 0 && (
        <div aria-label="Active class timers" style={{ margin: '-2px 0 14px', padding: '10px 12px', borderRadius: 10, border: '1px solid #d8dde6', background: '#f8faff', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12, color: '#3c4043', marginRight: 2 }}>ACTIVE TIMERS</strong>
          {activeSectionTimers.map(({ kind, assignment, endsAt }) => {
            const isDol = kind === 'DOL';
            return <span key={`${assignment.id}:${kind}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 9px', borderRadius: 999, background: isDol ? '#f3e8fd' : '#fff4ce', color: isDol ? '#681da8' : '#7a4f00', fontSize: 12, fontWeight: 900, border: `1px solid ${isDol ? '#caa8f2' : '#f9c74f'}` }} title={assignment.title || kind}>{kind} · <DOLCountdown endsAt={endsAt} /></span>;
          })}
        </div>
      )}

      {mode === 'walkthrough' ? (
        !selectedAssignment ? (
          <div style={{ padding: 20, border: '1px dashed #dadce0', borderRadius: 12, color: '#5f6368' }}>Choose the classwork assignment you are walking through.</div>
        ) : selectedClasswork.questions.length === 0 ? (
          <div style={{ padding: 20, border: '1px dashed #dadce0', borderRadius: 12, color: '#5f6368' }}>This assignment has no Classwork questions to walk through.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: '1px solid #c5d5ef', background: '#f8fbff', borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#174ea6' }}>Teacher is on Classwork Q{teacherQuestionIndex + 1} of {selectedClasswork.questions.length}</strong>
                  <div style={{ marginTop: 4, maxWidth: 760, color: '#3c4043', fontSize: 13, lineHeight: 1.45 }}>{String(currentQuestion?.prompt || currentQuestion?.question || 'Current classwork question').slice(0, 220)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" disabled={teacherQuestionIndex === 0} onClick={() => setTeacherQuestionIndex((value) => Math.max(0, value - 1))} style={smallButtonStyle}>← Previous</button>
                  <button type="button" disabled={teacherQuestionIndex >= selectedClasswork.questions.length - 1} onClick={() => setTeacherQuestionIndex((value) => Math.min(selectedClasswork.questions.length - 1, value + 1))} style={{ ...smallButtonStyle, borderColor: '#1a73e8', background: '#e8f0fe', color: '#174ea6' }}>Next →</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', fontSize: 12, fontWeight: 800 }}>
                <span>{walkthrough.counts.present} present students monitored</span>
                <span style={{ color: '#b3261e' }}>· {walkthrough.counts.needsCheck} need check</span>
                <span style={{ color: '#174ea6' }}>· {walkthrough.counts.onQuestion} here</span>
                <span style={{ color: '#137333' }}>· {walkthrough.counts.aheadDone} ahead/done</span>
                {walkthrough.counts.helpRequests > 0 && <span style={{ color: '#681da8' }}>· {walkthrough.counts.helpRequests} asked for help</span>}
              </div>
            </div>

            {walkthrough.visitNext && (
              <div style={{ padding: '12px 14px', borderRadius: 12, border: '2px solid #d93025', background: '#fff5f4', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div><strong style={{ color: '#b3261e' }}>Visit Next → {walkthrough.visitNext.name}</strong><div style={{ marginTop: 3, fontSize: 12, color: '#5f6368' }}>{walkthrough.visitNext.reason}</div></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {onOpenStudent && <button type="button" onClick={() => onOpenStudent(walkthrough.visitNext.id)} style={smallButtonStyle}>View work</button>}
                  <button type="button" onClick={() => setCheckedStudentIds((ids) => ids.includes(walkthrough.visitNext.id) ? ids : [...ids, walkthrough.visitNext.id])} style={{ ...smallButtonStyle, borderColor: '#188038', background: '#e6f4ea', color: '#137333' }}>Checked</button>
                </div>
              </div>
            )}

            {bottleneck && (
              <div style={{ padding: '9px 12px', borderRadius: 10, background: '#fff4ce', border: '1px solid #f9c74f', color: '#6a4900', fontSize: 12.5 }}>
                <strong>Possible class bottleneck:</strong> {bottleneck.count} students are currently on Classwork Q{bottleneck.questionIndex + 1}. Consider a quick whole-class clarification or small group.
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                ['needsCheck', `Needs Check (${walkthrough.needsCheck.length})`],
                ['onQuestion', `On This Question (${walkthrough.onQuestion.length})`],
                ['aheadDone', `Ahead / Done (${walkthrough.aheadDone.length})`],
                ['all', `All (${walkthrough.all.length})`],
              ].map(([id, label]) => <button key={id} type="button" onClick={() => setWalkthroughFilter(id)} style={{ ...smallButtonStyle, background: walkthroughFilter === id ? '#e8f0fe' : '#fff', borderColor: walkthroughFilter === id ? '#1a73e8' : '#dadce0', color: walkthroughFilter === id ? '#174ea6' : '#3c4043' }}>{label}</button>)}
              {checkedStudentIds.length > 0 && <button type="button" onClick={() => setCheckedStudentIds([])} style={{ ...smallButtonStyle, marginLeft: 'auto' }}>Reset checks ({checkedStudentIds.length})</button>}
            </div>

            {walkRows.length === 0 ? (
              <div style={{ padding: 18, border: '1px dashed #dadce0', borderRadius: 12, color: '#5f6368' }}>Nobody is in this group right now.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                {walkRows.map((row) => <WalkthroughCard key={row.id} row={row} onChecked={(studentId) => setCheckedStudentIds((ids) => ids.includes(studentId) ? ids : [...ids, studentId])} onOpenStudent={onOpenStudent} />)}
              </div>
            )}
          </div>
        )
      ) : visibleRows.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed #dadce0', borderRadius: 12, color: '#5f6368', fontSize: 14 }}>
          {rows.length === 0 ? (absentCount === roster.length && roster.length ? 'All students in this class are marked absent for today.' : 'No present students in this period have an assignment open yet.') : 'Nobody needs attention right now.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${roomMode ? 330 : 230}px, 1fr))`, gap: roomMode ? 16 : 12 }}>
          {visibleRows.map((row) => (
            <StudentTile
              key={row.id}
              row={row}
              onOpenStudent={onOpenStudent}
              profile={learningProfilesByStudentId[row.id] || null}
              suggestion={suggestions[row.id] || null}
              roomMode={roomMode && mode === 'room'}
              integritySignal={integrityByStudentId[row.id] || null}
              onSupportAction={(kind, stage, signal, extra) => handleSupportAction(row, kind, stage, signal, extra)}
              onRecommendPath={onRecommendPersonalPath ? (teksCode) => onRecommendPersonalPath({ studentId: row.id, studentName: row.name, teksCode, classId: activeClassId || row.live?.classId || null, classPeriod: row.classPeriod || row.live?.classPeriod || null, assignmentId: row.live?.assignmentId || null, assignmentTitle: row.live?.assignmentTitle || null }) : null}
              pathInterventionBusy={pathInterventionBusyStudentId === row.id}
              onAdjustPath={onOpenWeeklyPath ? () => onOpenWeeklyPath(row.id) : null}
            />
          ))}
        </div>
      )}
    </section>
  );
}