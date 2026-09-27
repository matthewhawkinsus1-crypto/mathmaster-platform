import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Timestamp, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase.js';
import {
  LIVE_ACTIVITY, LIVE_FLAGS, LIVE_SEVERITY, QUESTION_STATE_CHARS, summarizeLiveClass,
} from '../../livePresence';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';
import StudentSpotlightView from './StudentSpotlightView.jsx';
import ClassPointsAwardDialog from './ClassPointsAwardDialog.jsx';
import ClassPointsHistoryPanel from './ClassPointsHistoryPanel.jsx';
import { classPointsBalanceFor, watchClassPointAccounts } from '../../platform/classPointsClient.js';
import DOLCountdown from '../student/DOLCountdown.jsx';
import { formatStudentName } from '../../platform/studentName';
import {
  assignmentIsForStudent,
  getDOLState,
  getWarmupState,
} from '../../assignmentLifecycle.js';
import { buildWalkthroughMonitor, WALKTHROUGH_STATUS } from '../../platform/teacher/walkthroughMonitor.js';
import { classworkModel, describeClassworkPace } from '../../platform/teacher/classworkModel.js';
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
  SPOTLIGHT_FRAME_COLLECTION,
  SPOTLIGHT_REQUEST_COLLECTION,
  SPOTLIGHT_REQUEST_TTL_MS,
  SPOTLIGHT_STATUS,
  publicStudentLabel,
  scheduleSpotlightExpiry,
} from '../../platform/liveSpotlight.js';
import { activeTeacherSpotlightQueries } from '../../platform/liveSpotlightQueries.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_STAGE,
  buildIntegrityReviewSignal,
  hasDismissedSignal,
  supportSessionKey,
} from '../../platform/teacher/studentSupportSignals.js';
import { buildNonInstructionalSet } from '../../platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../curriculum/calendars/schoolYear2026-2027.js';
import { classMeetsToday, buildReturnCheckInEvent, resolveReturnCheckIns } from '../../platform/attendance/returnCheckIn.js';

// The district instructional calendar does not change per class or per
// render, so it is built once at module load rather than recomputed on every
// tick — the same reason `formatStudentName`/`ATTENDANCE_LABEL` above are
// module-level constants.
const SCHOOL_NON_INSTRUCTIONAL_KEYS = buildNonInstructionalSet(schoolYearNonInstructionalRanges());

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

// Compact, teacher-only Class Points control shown on a student tile. The
// balance shown is always the authoritative account projection handed down
// from LiveClassMonitor's live subscription — it is never computed here by
// summing history, and a read failure shows "—" rather than inventing 0.
function ClassPointsMiniControl({ balance, unavailable, onAward }) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}
    >
      <span
        title={unavailable ? 'Class Points balance is unavailable right now' : `${balance} Class Points`}
        style={{ fontSize: 11.5, fontWeight: 900, color: '#7a4f00', background: '#fff4ce', border: '1px solid #f3d675', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}
      >
        ⭐ {unavailable ? '—' : balance} pts
      </span>
      {onAward && (
        <button type="button" onClick={onAward} style={{ ...smallButtonStyle, padding: '3px 7px', borderColor: '#7a4f00', background: '#fff', color: '#7a4f00' }}>+ Points</button>
      )}
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
  onAdjustPath = null,
  onRecommendPath = null,
  pathInterventionBusy = false,
  onSpotlight = null,
  classPoints = null,
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

      {classPoints && (
        <ClassPointsMiniControl
          balance={classPoints.balance}
          unavailable={classPoints.unavailable}
          onAward={classPoints.onAward ? () => classPoints.onAward(row) : null}
        />
      )}

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
      {onSpotlight && live?.assignmentId && (
        <button type="button" onClick={(event) => { event.stopPropagation(); onSpotlight(row); }} style={{ ...smallButtonStyle, marginTop: 8, borderColor: '#681da8', background: '#f8f0fc', color: '#681da8' }}>Ask to Present</button>
      )}
    </div>
  );
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

function WalkthroughCard({ row, onChecked, onOpenStudent, classPoints = null }) {
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
      {classPoints && (
        <ClassPointsMiniControl
          balance={classPoints.balance}
          unavailable={classPoints.unavailable}
          onAward={classPoints.onAward ? () => classPoints.onAward(row) : null}
        />
      )}
      <div style={{ fontSize: 12.5, fontWeight: 800, color: style.color }}>{row.reason}</div>
      {row.live?.assignmentId && (
        <div style={{ fontSize: 11.5, color: '#5f6368' }}>
          {String(row.live.activityRole || 'activity').toUpperCase()} Q{Number(row.live.sectionQuestionIndex ?? 0) + 1}
          {row.live.currentAttempts > 0 && ` · ${row.live.currentAttempts} attempt${row.live.currentAttempts === 1 ? '' : 's'}`}
          {' · '}{({
            [LIVE_ACTIVITY.WORKING]: 'Working',
            [LIVE_ACTIVITY.VIEWING]: 'Viewing',
            [LIVE_ACTIVITY.RECENT]: 'Recently active',
            [LIVE_ACTIVITY.AWAY]: 'Away',
            [LIVE_ACTIVITY.DISCONNECTED]: 'Disconnected',
            [LIVE_ACTIVITY.NOT_STARTED]: 'Not started',
          })[row.activityState] || 'Viewing'}
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

// Phase 2 of Classroom Live: teach the actual assignment from the existing
// student-preview runtime, and let the teacher's real position there become
// the room's pace reference. This panel only ever shows lessons assigned to
// the active class and never a library assignment the class was not given.
function LiveTeachingPanel({
  activeClassId,
  teachableAssignments,
  liveTeachingActive,
  liveTeachingAssignmentId,
  teachingAssignmentTitle,
  classworkPositionLabel,
  onTeach,
  onResume,
  onEndTeaching,
}) {
  const [choiceId, setChoiceId] = useState('');

  if (!activeClassId) {
    return (
      <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '1px dashed #c9ced6', color: '#5f6368', fontSize: 12.5 }}>
        Choose an active class above to teach a lesson live.
      </div>
    );
  }

  if (liveTeachingActive) {
    return (
      <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '2px solid #188038', background: '#e6f4ea', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#137333' }}>Teaching: {teachingAssignmentTitle || 'Untitled'}</div>
          <div style={{ marginTop: 2, fontSize: 12.5, color: '#1c4a2e' }}>Teacher exemplar: {classworkPositionLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={onResume} style={{ ...smallButtonStyle, borderColor: '#188038', background: '#fff', color: '#137333' }}>Resume Teaching</button>
          <button type="button" onClick={() => onTeach(liveTeachingAssignmentId, { forceRestart: true, classId: activeClassId })} style={smallButtonStyle}>Restart Fresh</button>
          <button type="button" onClick={onEndTeaching} style={{ ...smallButtonStyle, borderColor: '#d93025', background: '#fff', color: '#b3261e' }}>End Teaching</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '1px solid #c5d5ef', background: '#f8fbff', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontWeight: 900, color: '#174ea6' }}>Live Teaching</div>
      {teachableAssignments.length === 0 ? (
        <span style={{ fontSize: 12.5, color: '#5f6368' }}>No lessons are assigned to this class yet.</span>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={choiceId} onChange={(event) => setChoiceId(event.target.value)} style={controlStyle} aria-label="Lesson to teach">
            <option value="">Choose a lesson…</option>
            {teachableAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title || 'Untitled'}</option>)}
          </select>
          <button
            type="button"
            disabled={!choiceId}
            onClick={() => onTeach(choiceId, { classId: activeClassId })}
            style={{ ...smallButtonStyle, borderColor: '#1a73e8', background: choiceId ? '#e8f0fe' : '#f1f3f4', color: '#174ea6', cursor: choiceId ? 'pointer' : 'not-allowed' }}
          >
            Teach This Lesson
          </button>
        </div>
      )}
    </div>
  );
}

function AttendancePanel({ roster, attendanceByStudentId, onMark, busyStudentId = null }) {
  const attendanceName = (student) => formatStudentName(student, { lastFirst: false, fallbackToId: false });
  const sorted = [...roster].sort((a, b) => attendanceName(a).localeCompare(attendanceName(b)));
  return (
    <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '1px solid #c9ced6', background: '#f8f9fa' }}>
      <div style={{ fontWeight: 900, color: '#202124' }}>Today&apos;s Live Attendance</div>
      <div style={{ marginTop: 3, marginBottom: 10, fontSize: 12, color: '#5f6368' }}>
        Absent students are removed from live monitoring for today only. Mark Present or Late if a student arrives; their saved assignment work is never changed.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 7 }}>
        {sorted.map((student) => {
          const id = String(student?.id || student?.studentId || '');
          const name = formatStudentName(student, { lastFirst: false, fallbackToId: false }) || 'Student';
          const mark = normalizeLiveAttendance(attendanceByStudentId[id]).mark || LIVE_ATTENDANCE_MARK.PRESENT;
          const busy = busyStudentId === id;
          return (
            <div key={id} style={{ background: '#fff', border: '1px solid #e0e3e7', borderRadius: 9, padding: '8px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 12.5 }}>{name}</strong>
                {id && <div style={{ marginTop: 1, fontSize: 10, color: '#80868b' }}>ID {id}</div>}
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

// A prominent-but-compact "welcome back" banner. It lives here, not behind a
// settings toggle, because the whole point is that a teacher taking
// attendance sees it at the moment the student is standing in front of them.
function ReturnCheckInPanel({ candidates, onCheckIn, onCheckInAll, onOpenStudent, busyKey }) {
  const open = candidates.filter((candidate) => candidate.status === 'open');
  if (!open.length) return null;

  return (
    <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '2px solid #1a73e8', background: '#eef6ff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontWeight: 900, color: '#174ea6' }}>Welcome back · {open.length} returning today</div>
        {open.length > 1 && <button type="button" onClick={onCheckInAll} style={{ ...smallButtonStyle, borderColor: '#1a73e8', background: '#fff', color: '#174ea6' }}>Check in all</button>}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {open.map((candidate) => {
          const missedLabel = candidate.missedWork.length
            ? candidate.missedWork.map((entry) => entry.title).join(', ')
            : 'No MathMaster lesson/assignment linked to this meeting';
          const extensionLabel = candidate.extensions[0]
            ? `Extension through ${candidate.extensions[0].dateKey}`
            : null;
          const busy = busyKey === candidate.key;
          return (
            <div key={candidate.key} style={{ background: '#fff', border: '1px solid #c5d5ef', borderRadius: 9, padding: '9px 11px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <strong style={{ fontSize: 13 }}>{candidate.studentName} is back today</strong>
                <div style={{ fontSize: 11.5, color: '#5f6368', marginTop: 2 }}>
                  {candidate.meetingsMissed > 1 ? `Back after ${candidate.meetingsMissed} missed class meetings` : 'Absent last class'}
                  {' · '}Missed: {missedLabel}
                  {candidate.missedWork.length > 0 && ` · ${candidate.missedWork.length} assignment${candidate.missedWork.length === 1 ? '' : 's'} affected`}
                  {extensionLabel && ` · ${extensionLabel}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {onOpenStudent && candidate.missedWork.length > 0 && (
                  <button type="button" onClick={() => onOpenStudent(candidate.studentId)} style={smallButtonStyle}>View Missed Work</button>
                )}
                {onOpenStudent && extensionLabel && (
                  <button type="button" onClick={() => onOpenStudent(candidate.studentId)} style={smallButtonStyle}>Review Extension</button>
                )}
                <button type="button" disabled={busy} onClick={() => onCheckIn(candidate)} style={{ ...smallButtonStyle, borderColor: '#188038', background: '#e6f4ea', color: '#137333', opacity: busy ? 0.6 : 1 }}>
                  {busy ? 'Checking in…' : 'Check In'}
                </button>
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
  teacherUid = '',
  teacherEmail = '',
  teacherLabel = 'Your teacher',
  liveTeachingSession = null,
  onTeachAssignment = null,
  onResumeTeaching = null,
  onEndLiveTeaching = null,
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
  const [returnCheckInBusyKey, setReturnCheckInBusyKey] = useState(null);

  const [spotlightRequests, setSpotlightRequests] = useState([]);
  const [spotlightFrame, setSpotlightFrame] = useState(null);
  const [spotlightMessage, setSpotlightMessage] = useState('');
  const [spotlightClock, setSpotlightClock] = useState(() => Date.now());

  // Class Points: a live projection of the authoritative classPointAccounts
  // balances for THIS class, scoped by the same authorizedTeacherEmails +
  // classId shape the Firestore rules and index already use (see
  // classPointsClient.js). A read failure never breaks Live Classroom — it
  // just marks balances unavailable rather than throwing.
  const [classPointBalances, setClassPointBalances] = useState({});
  const [classPointsUnavailable, setClassPointsUnavailable] = useState(false);
  const [showClassPoints, setShowClassPoints] = useState(false);
  const [awardDialogStudent, setAwardDialogStudent] = useState(null);

  useEffect(() => {
    setClassPointBalances({});
    setClassPointsUnavailable(false);
    if (!teacherEmail || !activeClassId) return undefined;
    return watchClassPointAccounts(
      db,
      { teacherEmail, classId: activeClassId },
      (balances) => { setClassPointsUnavailable(false); setClassPointBalances(balances); },
      () => setClassPointsUnavailable(true),
    );
  }, [teacherEmail, activeClassId]);

  const spotlightStudentIds = useMemo(() => {
    if (!activeClassId) return [];
    return [...new Set(studentsInClass({ students, classes, classId: activeClassId })
      .map((student) => String(student?.id || student?.studentId || '').trim())
      .filter(Boolean))];
  }, [students, classes, activeClassId]);

  useEffect(() => {
    setSpotlightRequests([]);
    setSpotlightFrame(null);
    if (!teacherEmail || !activeClassId || spotlightStudentIds.length === 0) return undefined;

    const requestsByQuery = new Map();
    const unsubscribers = activeTeacherSpotlightQueries(db, {
      teacherEmail, classId: activeClassId, studentIds: spotlightStudentIds,
    }).map((spotlightQuery, index) => onSnapshot(
      spotlightQuery,
      (snapshot) => {
        requestsByQuery.set(index, snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        const merged = new Map(
          [...requestsByQuery.values()].flat().map((entry) => [entry.id, entry]),
        );
        setSpotlightClock(Date.now());
        setSpotlightRequests([...merged.values()]);
      },
      () => setSpotlightMessage('Spotlight connection is unavailable. Student work is unaffected.'),
    ));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [teacherEmail, activeClassId, spotlightStudentIds]);

  const activeSpotlight = useMemo(() => spotlightRequests
    .filter((entry) => [SPOTLIGHT_STATUS.REQUESTED, SPOTLIGHT_STATUS.ACCEPTED].includes(entry.status))
    .filter((entry) => entry.classId === activeClassId)
    .filter((entry) => (entry.expiresAt?.toMillis?.() || 0) > spotlightClock)
    .sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0))[0] || null, [spotlightRequests, activeClassId, spotlightClock]);

  useEffect(() => {
    if (!activeSpotlight) return undefined;
    return scheduleSpotlightExpiry({
      request: activeSpotlight,
      onExpire: () => {
        setSpotlightFrame(null);
        setSpotlightClock(activeSpotlight.expiresAt?.toMillis?.() || Date.now());
      },
    });
  }, [activeSpotlight?.id, activeSpotlight?.expiresAt]);

  useEffect(() => {
    setSpotlightFrame(null);
    if (activeSpotlight?.status !== SPOTLIGHT_STATUS.ACCEPTED) return undefined;
    return onSnapshot(doc(db, SPOTLIGHT_FRAME_COLLECTION, activeSpotlight.id), (snapshot) => {
      setSpotlightFrame(snapshot.exists() ? snapshot.data() : null);
    }, () => setSpotlightMessage('Spotlight connection is unavailable. Student work is unaffected.'));
  }, [activeSpotlight?.id, activeSpotlight?.status]);

  const requestSpotlight = async (row) => {
    if (!row.live?.assignmentId) {
      setSpotlightMessage('Student must have a MathMaster assignment open to present.');
      return;
    }
    if (!activeClassId || !teacherEmail || !teacherUid) {
      setSpotlightMessage('Choose an authoritative class before requesting Spotlight.');
      return;
    }
    const requestRef = doc(collection(db, SPOTLIGHT_REQUEST_COLLECTION));
    const student = roster.find((entry) => String(entry.id || entry.studentId) === String(row.id)) || row;
    try {
      await setDoc(requestRef, {
        schemaVersion: 1, requestId: requestRef.id, classId: activeClassId,
        studentId: row.id, studentLabel: publicStudentLabel(student),
        teacherUid, teacherEmail,
        teacherLabel: String(teacherLabel || 'Your teacher').slice(0, 80),
        status: SPOTLIGHT_STATUS.REQUESTED, assignmentId: row.live.assignmentId,
        questionIndex: Number(row.live?.questionIndex) || 0,
        requestedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + SPOTLIGHT_REQUEST_TTL_MS),
      });
      setSpotlightMessage('Request sent. Nothing is visible until the student chooses Present Now.');
    } catch {
      setSpotlightMessage('Could not send the Spotlight request. Student work remains private.');
    }
  };

  const stopSpotlight = async () => {
    if (!activeSpotlight) return;
    try {
      await deleteDoc(doc(db, SPOTLIGHT_FRAME_COLLECTION, activeSpotlight.id)).catch(() => {});
      await updateDoc(doc(db, SPOTLIGHT_REQUEST_COLLECTION, activeSpotlight.id), { status: SPOTLIGHT_STATUS.STOPPED, stoppedAt: serverTimestamp(), stoppedBy: 'teacher' });
      setSpotlightFrame(null);
    } catch {
      setSpotlightMessage('Could not stop Spotlight yet. The short-lived session will expire automatically.');
    }
  };

  const roster = useMemo(() => {
    if (activeClassId) return studentsInClass({ students, classes, classId: activeClassId });
    return students.filter((student) => classPeriod === 'all' || (student?.classPeriod || student?.profile?.classPeriod) === classPeriod);
  }, [students, classes, activeClassId, classPeriod]);

  // A lesson only ever appears here when it is actually assigned to the
  // active class — the same membership check the assignment lifecycle uses
  // everywhere else, so a library item that merely exists never shows up.
  const teachableAssignments = useMemo(() => {
    if (!activeClassId) return [];
    return assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: activeClassId }));
  }, [assignments, activeClassId]);

  // Pace must follow the teacher's REAL exemplar position while Live
  // Teaching is active for this class, not a disconnected manual counter.
  const liveTeachingActiveForClass = Boolean(liveTeachingSession?.active)
    && String(liveTeachingSession.classId || '') === String(activeClassId || '');

  const displayAssignmentId = liveTeachingActiveForClass ? liveTeachingSession.assignmentId : assignmentId;
  const selectedAssignment = useMemo(() => assignments.find((assignment) => String(assignment.id) === String(displayAssignmentId)) || null, [assignments, displayAssignmentId]);
  const selectedClasswork = useMemo(() => classworkModel(selectedAssignment), [selectedAssignment]);

  // A Live Teaching session has NO Classwork pace until the teacher actually
  // reaches Classwork. Do not let the legacy manual counter silently become
  // the room's pace reference during an opening Warm-Up.
  const liveTeachingPaceReady = !liveTeachingActiveForClass
    || Number.isInteger(liveTeachingSession?.classworkQuestionPosition);
  const effectiveTeacherQuestionIndex = liveTeachingActiveForClass
    ? (Number.isInteger(liveTeachingSession?.classworkQuestionPosition)
      ? liveTeachingSession.classworkQuestionPosition
      : null)
    : teacherQuestionIndex;

  // Jump the room into Walkthrough, once per session (a fresh start or a
  // restart), so the exemplar the teacher just opened is what the room sees.
  // After that a teacher is free to switch to Room/Attention without being
  // fought back into Walkthrough on every render.
  const liveTeachingSessionKey = liveTeachingActiveForClass
    ? `${liveTeachingSession.classId}:${liveTeachingSession.assignmentId}:${liveTeachingSession.startedAt}`
    : null;
  const seenLiveTeachingSessionKey = useRef(null);
  useEffect(() => {
    if (liveTeachingSessionKey && liveTeachingSessionKey !== seenLiveTeachingSessionKey.current) {
      setMode('walkthrough');
      setCheckedStudentIds([]);
    }
    seenLiveTeachingSessionKey.current = liveTeachingSessionKey;
  }, [liveTeachingSessionKey]);
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

  // Missed-instruction linking must be able to see a lesson that has since
  // CLOSED — a student back after two missed meetings needs to see what
  // those meetings covered even though the assignment's deadline has passed.
  // `assignments` here is already filtered to "currently open"; `timerAssignments`
  // is the unfiltered list (see activeSectionTimers below for the same pattern).
  const returnCheckInSourceAssignments = Array.isArray(timerAssignments) ? timerAssignments : assignments;

  const todayClassMeets = useMemo(() => (
    Boolean(attendanceClassPeriod) && classMeetsToday({
      schedule: classSchedule, classPeriod: attendanceClassPeriod, dateKey: attendanceDateKey, nonInstructionalKeys: SCHOOL_NON_INSTRUCTIONAL_KEYS,
    })
  ), [classSchedule, attendanceClassPeriod, attendanceDateKey]);

  const returnCheckIns = useMemo(() => {
    if (!todayClassMeets) return [];
    return resolveReturnCheckIns({
      roster,
      supportEvents,
      assignments: returnCheckInSourceAssignments,
      classId: activeClassId || null,
      classPeriod: attendanceClassPeriod,
      schedule: classSchedule,
      nonInstructionalKeys: SCHOOL_NON_INSTRUCTIONAL_KEYS,
      todayDateKey: attendanceDateKey,
    });
  }, [todayClassMeets, roster, supportEvents, returnCheckInSourceAssignments, activeClassId, attendanceClassPeriod, classSchedule, attendanceDateKey]);

  const handleReturnCheckIn = async (candidate, { dismissed = false } = {}) => {
    if (!onRecordSupportEvent) return;
    setReturnCheckInBusyKey(candidate.key);
    try {
      await onRecordSupportEvent(buildReturnCheckInEvent({ candidate, actorEmail: teacherEmail, nowValue, dismissed }));
    } catch (error) {
      console.error('Could not record the return check-in:', error);
    } finally {
      setReturnCheckInBusyKey(null);
    }
  };

  // Sequential rather than Promise.all: each write reuses the same
  // optimistic busy-key state handleReturnCheckIn manages one at a time.
  const handleCheckInAllReturns = async () => {
    const open = returnCheckIns.filter((candidate) => candidate.status === 'open');
    await open.reduce((chain, candidate) => chain.then(() => handleReturnCheckIn(candidate)), Promise.resolve());
  };

  const monitoredRoster = useMemo(() => roster.filter((student) => {
    const id = String(student?.id || student?.studentId || '');
    return !attendanceIsAbsent(effectiveAttendance[id]);
  }), [roster, effectiveAttendance]);

  const walkthroughRoster = useMemo(() => withClassworkStates(monitoredRoster, selectedAssignment, selectedClasswork.progressPositions), [monitoredRoster, selectedAssignment, selectedClasswork]);

  const walkthrough = useMemo(() => {
    if (!liveTeachingPaceReady) {
      return {
        all: [],
        needsCheck: [],
        onQuestion: [],
        aheadDone: [],
        elsewhere: [],
        visitNext: null,
        bottlenecks: [],
        counts: { present: 0, needsCheck: 0, onQuestion: 0, aheadDone: 0, helpRequests: 0 },
      };
    }
    return buildWalkthroughMonitor({
      students: walkthroughRoster,
      assignmentId: selectedAssignment?.id || null,
      teacherQuestionIndex: effectiveTeacherQuestionIndex,
      checkedStudentIds,
      attendanceByStudentId: effectiveAttendance,
      nowValue,
    });
  }, [walkthroughRoster, selectedAssignment, effectiveTeacherQuestionIndex, liveTeachingPaceReady, checkedStudentIds, effectiveAttendance, nowValue]);

  const { rows, classStats, counts } = useMemo(() => summarizeLiveClass(monitoredRoster, {
    nowValue,
    assignmentId: displayAssignmentId === 'all' ? null : displayAssignmentId,
  }), [monitoredRoster, nowValue, displayAssignmentId]);

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

  // Class Points only appears against an authoritative active class — the
  // same scope the account/history subscriptions above are keyed to — never
  // against the legacy period-only view where no classId exists to award or
  // read against.
  const classPointsForRow = (row) => (activeClassId ? {
    balance: classPointsBalanceFor(classPointBalances, row.id),
    unavailable: classPointsUnavailable,
    onAward: (studentRow) => setAwardDialogStudent({ id: studentRow.id, name: studentRow.name }),
  } : null);

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

  const currentQuestion = liveTeachingPaceReady
    ? selectedClasswork.questions[effectiveTeacherQuestionIndex]?.question || null
    : null;
  const bottleneck = walkthrough.bottlenecks.find((entry) => entry.count >= 3) || null;
  const walkRows = walkthroughFilter === 'needsCheck' ? walkthrough.needsCheck
    : walkthroughFilter === 'onQuestion' ? walkthrough.onQuestion
    : walkthroughFilter === 'aheadDone' ? walkthrough.aheadDone
    : walkthrough.all;

  return (
    <section style={{ marginBottom: 28 }}>
      {activeSpotlight?.status === SPOTLIGHT_STATUS.ACCEPTED && <StudentSpotlightView request={activeSpotlight} frame={spotlightFrame} onStop={stopSpotlight} />}
      {activeSpotlight?.status === SPOTLIGHT_STATUS.REQUESTED && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 9, background: '#f8f0fc', color: '#4a126b' }}>Waiting for {activeSpotlight.studentLabel || 'the student'} to choose <strong>Present Now</strong>. No work is visible.</div>}
      {spotlightMessage && <div role="status" style={{ marginBottom: 10, fontSize: 12, color: '#5f6368' }}>{spotlightMessage}</div>}
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

      <LiveTeachingPanel
        activeClassId={activeClassId}
        teachableAssignments={teachableAssignments}
        liveTeachingActive={liveTeachingActiveForClass}
        liveTeachingAssignmentId={liveTeachingSession?.assignmentId || null}
        teachingAssignmentTitle={selectedAssignment?.title}
        classworkPositionLabel={liveTeachingActiveForClass ? describeClassworkPace({ assignment: selectedAssignment, classworkQuestionPosition: liveTeachingSession?.classworkQuestionPosition ?? null }) : ''}
        onTeach={onTeachAssignment}
        onResume={onResumeTeaching}
        onEndTeaching={onEndLiveTeaching}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        {!activeClassId && (
          <select value={classPeriod} onChange={(event) => setClassPeriod(event.target.value)} style={controlStyle} aria-label="Class period">
            <option value="all">All periods</option>
            {classPeriods.map((period) => <option key={period} value={period}>{period}</option>)}
          </select>
        )}
        <select
          value={displayAssignmentId}
          disabled={liveTeachingActiveForClass}
          onChange={(event) => changeAssignment(event.target.value)}
          style={{ ...controlStyle, opacity: liveTeachingActiveForClass ? 0.7 : 1 }}
          aria-label="Assignment"
          title={liveTeachingActiveForClass ? 'Following the Live Teaching exemplar assignment' : undefined}
        >
          <option value="all">Any assignment</option>
          {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title || 'Untitled'}</option>)}
        </select>
        {mode === 'room' && <button type="button" onClick={() => setRoomMode((current) => !current)} aria-pressed={roomMode} style={{ ...controlStyle, cursor: 'pointer', fontWeight: 700, background: roomMode ? '#e8f0fe' : '#fff', borderColor: roomMode ? '#1a73e8' : '#dadce0', color: roomMode ? '#174ea6' : '#202124' }}>Large room tiles</button>}
        <button type="button" onClick={() => setShowAttendance((current) => !current)} aria-expanded={showAttendance} style={{ ...controlStyle, cursor: 'pointer', fontWeight: 800, background: showAttendance ? '#fff4ce' : '#fff', borderColor: showAttendance ? '#d9a400' : '#dadce0', color: showAttendance ? '#6b4c00' : '#202124' }}>
          Attendance{absentCount > 0 ? ` · ${absentCount} absent` : ''}
        </button>
        {activeClassId && (
          <button type="button" onClick={() => setShowClassPoints((current) => !current)} aria-expanded={showClassPoints} style={{ ...controlStyle, cursor: 'pointer', fontWeight: 800, background: showClassPoints ? '#fff4ce' : '#fff', borderColor: showClassPoints ? '#d9a400' : '#dadce0', color: showClassPoints ? '#6b4c00' : '#202124' }}>
            ⭐ Class Points
          </button>
        )}
      </div>

      <ReturnCheckInPanel
        candidates={returnCheckIns}
        onCheckIn={handleReturnCheckIn}
        onCheckInAll={handleCheckInAllReturns}
        onOpenStudent={onOpenStudent}
        busyKey={returnCheckInBusyKey}
      />

      {showAttendance && (
        <AttendancePanel
          roster={roster}
          attendanceByStudentId={effectiveAttendance}
          onMark={handleAttendanceMark}
          busyStudentId={attendanceBusyStudentId}
        />
      )}

      {showClassPoints && activeClassId && (
        <ClassPointsHistoryPanel classId={activeClassId} teacherEmail={teacherEmail} roster={roster} />
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
        ) : liveTeachingActiveForClass && !liveTeachingPaceReady ? (
          <div style={{ padding: 20, border: '1px dashed #c5d5ef', borderRadius: 12, background: '#f8fbff', color: '#3c4043' }}>
            <strong style={{ color: '#174ea6' }}>Classwork pace has not started yet.</strong>
            <div style={{ marginTop: 5, fontSize: 13 }}>
              The teacher exemplar is currently in {String(liveTeachingSession?.activityRole || 'another section').replace(/^./, (letter) => letter.toUpperCase())}. Pace monitoring will begin when the teacher enters the first Classwork question.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: '1px solid #c5d5ef', background: '#f8fbff', borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#174ea6' }}>Teacher is on Classwork Q{effectiveTeacherQuestionIndex + 1} of {selectedClasswork.questions.length}</strong>
                  <div style={{ marginTop: 4, maxWidth: 760, color: '#3c4043', fontSize: 13, lineHeight: 1.45 }}>{String(currentQuestion?.prompt || currentQuestion?.question || 'Current classwork question').slice(0, 220)}</div>
                </div>
                {liveTeachingActiveForClass ? (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#137333', background: '#e6f4ea', padding: '5px 9px', borderRadius: 999 }}>Following the live teaching exemplar</span>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" disabled={teacherQuestionIndex === 0} onClick={() => setTeacherQuestionIndex((value) => Math.max(0, value - 1))} style={smallButtonStyle}>← Previous</button>
                    <button type="button" disabled={teacherQuestionIndex >= selectedClasswork.questions.length - 1} onClick={() => setTeacherQuestionIndex((value) => Math.min(selectedClasswork.questions.length - 1, value + 1))} style={{ ...smallButtonStyle, borderColor: '#1a73e8', background: '#e8f0fe', color: '#174ea6' }}>Next →</button>
                  </div>
                )}
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
                {walkRows.map((row) => <WalkthroughCard key={row.id} row={row} onChecked={(studentId) => setCheckedStudentIds((ids) => ids.includes(studentId) ? ids : [...ids, studentId])} onOpenStudent={onOpenStudent} classPoints={classPointsForRow(row)} />)}
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
              onSpotlight={activeClassId && !activeSpotlight ? requestSpotlight : null}
              classPoints={classPointsForRow(row)}
            />
          ))}
        </div>
      )}

      {awardDialogStudent && activeClassId && (
        <ClassPointsAwardDialog
          student={awardDialogStudent}
          classId={activeClassId}
          teacherEmail={teacherEmail}
          onClose={() => setAwardDialogStudent(null)}
        />
      )}
    </section>
  );
}
