import React, { useMemo, useState } from 'react';
import {
  CCMR_EXPECTATION, FRAMEWORK, SELECTION_MODE, SELECTION_MODE_LABEL, WEEKLY_GOAL,
  buildTeacherWeeklyView, normalizeWeeklyGoalConfig,
} from '../../platform/path/weeklyPathGoal.js';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';

// The teacher's weekly Path controls, and the class table beside them.
//
// THE DESIGN CONSTRAINT THAT SHAPES THIS SCREEN. A teacher has five sections
// and a hundred and fifty students. Any control surface that requires them to
// make a decision per student will not be used, and an unused control is worse
// than no control because it implies a level of oversight that is not
// happening. So every field here has a working default, autonomous selection is
// the default mode, and the screen is legitimately ignorable.
//
// What it is NOT is a place to assign individual sequences. That is the
// engine's job, and a teacher who wants to override one student does it with a
// pin, which the engine honours by seating it before it chooses anything.

const panel = { border: '1px solid #dadce0', borderRadius: 12, background: '#fff', padding: 16, marginBottom: 16 };
const heading = { margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#174ea6' };
const note = { color: '#5f6368', fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' };
const control = {
  minHeight: 44, fontSize: 15, padding: '9px 10px', border: '1px solid #c9ced6',
  borderRadius: 8, boxSizing: 'border-box', background: '#fff', color: '#202124',
};
const chipButton = (active) => ({
  minHeight: 40, padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${active ? '#1a73e8' : '#c5d5ef'}`,
  background: active ? '#e8f0fe' : '#fff',
  color: active ? '#174ea6' : '#3c4043', fontWeight: 800, fontSize: 13,
  fontFamily: 'inherit', appearance: 'none',
});

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FRAMEWORK_LABEL = {
  [FRAMEWORK.AUTO]: 'Auto',
  [FRAMEWORK.DIGITAL_SAT]: 'Digital SAT',
  [FRAMEWORK.ACT]: 'ACT',
  [FRAMEWORK.TSIA2]: 'TSIA2',
  [FRAMEWORK.ASVAB]: 'ASVAB',
};

const CCMR_LABEL = {
  [CCMR_EXPECTATION.NONE]: 'None',
  [CCMR_EXPECTATION.RECOMMENDED]: 'Recommended',
  [CCMR_EXPECTATION.REQUIRED]: 'Required',
};

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#3c4043' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: '#5f6368', lineHeight: 1.5 }}>{hint}</span>}
    </label>
  );
}

export default function WeeklyPathControls({
  classes = [],
  selectedClassId = null,
  goalsByClass = {},
  studentsInClass = [],
  goalsByStudentId = {},
  completionsByStudentId = {},
  learningProfilesByStudentId = {},
  onSelectClass = null,
  onChange = null,
  onOpenStudent = null,
  saving = false,
  now = Date.now(),
}) {
  const [dirty, setDirty] = useState(null);

  const activeClass = classes.find((entry) => entry.classId === selectedClassId) || classes[0] || null;
  const honors = String(activeClass?.courseLevel || '').toLowerCase() === 'honors';
  const stored = goalsByClass?.[activeClass?.classId] || null;
  const config = useMemo(
    () => normalizeWeeklyGoalConfig(dirty || stored || {}, { honors }),
    [dirty, stored, honors],
  );

  const update = (patch) => {
    const next = normalizeWeeklyGoalConfig({ ...config, ...patch }, { honors });
    setDirty(next);
    onChange?.(activeClass?.classId, next);
  };

  const rows = useMemo(() => buildTeacherWeeklyView(
    studentsInClass.map((student) => ({
      studentId: student.id,
      studentName: student.name || student.id,
      goal: goalsByStudentId[student.id]
        // A student whose plan has not been built yet still needs a row, so the
        // teacher sees "not started" rather than a student who has vanished.
        || { goalSessions: config.sessions, profile: learningProfilesByStudentId[student.id] || null },
      completions: completionsByStudentId[student.id] || [],
    })),
    { now },
  ), [studentsInClass, goalsByStudentId, completionsByStudentId, learningProfilesByStudentId, config.sessions, now]);

  if (!activeClass) {
    return (
      <section style={panel}>
        <h3 style={heading}>Weekly Path</h3>
        <p style={note}>Create a class first. Weekly goals are set per class, because one section&apos;s week is not another&apos;s.</p>
      </section>
    );
  }

  return (
    <div style={{ textAlign: 'left' }}>
      <section style={panel}>
        <h3 style={heading}>Weekly Path goal</h3>
        <p style={note}>
          Students have a weekly Path without this screen. Change something here only when this
          section needs it — the defaults are {WEEKLY_GOAL.REGULAR_DEFAULT} sessions a week for a
          regular course and {WEEKLY_GOAL.HONORS_DEFAULT} for Honors, with MathMaster choosing the
          standards from each student&apos;s own evidence.
        </p>

        {classes.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <Field label="Class">
              <select
                value={activeClass.classId}
                onChange={(event) => { setDirty(null); onSelectClass?.(event.target.value); }}
                style={{ ...control, width: 'min(360px, 100%)' }}
              >
                {classes.map((entry) => (
                  <option key={entry.classId} value={entry.classId}>
                    {entry.name || entry.classId}{entry.courseLevel === 'honors' ? ' · Honors' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          <Field
            label="Sessions per week"
            hint="A commitment about the student's time. It is not a number of standards — a standard is never used up."
          >
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {Array.from(
                { length: WEEKLY_GOAL.MAXIMUM - WEEKLY_GOAL.MINIMUM + 1 },
                (_, index) => WEEKLY_GOAL.MINIMUM + index,
              ).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => update({ sessions: count })}
                  style={chipButton(config.sessions === count)}
                  aria-pressed={config.sessions === count}
                >
                  {count}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Due day" hint="The goal is due at the end of this day. Later work still counts toward mastery.">
            <select
              value={config.dueDayOfWeek}
              onChange={(event) => update({ dueDayOfWeek: Number(event.target.value) })}
              style={control}
            >
              {DAY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
          </Field>

          <Field
            label="Who selects the standards"
            hint={SELECTION_MODE_LABEL[config.selectionMode]}
          >
            <select
              value={config.selectionMode}
              onChange={(event) => update({ selectionMode: event.target.value })}
              style={control}
            >
              {Object.values(SELECTION_MODE).map((mode) => (
                <option key={mode} value={mode}>{SELECTION_MODE_LABEL[mode]}</option>
              ))}
            </select>
          </Field>

          <Field
            label="College &amp; career readiness"
            hint={config.ccmrExpectation === CCMR_EXPECTATION.REQUIRED
              ? 'If no transfer work is justified by the evidence in a given week, MathMaster reports the shortfall rather than inventing a session.'
              : 'Exam-style practice appears when a student knows the mathematics in class but not in the exam’s format.'}
          >
            <select
              value={config.ccmrExpectation}
              onChange={(event) => update({ ccmrExpectation: event.target.value })}
              style={control}
            >
              {Object.values(CCMR_EXPECTATION).map((value) => (
                <option key={value} value={value}>{CCMR_LABEL[value]}</option>
              ))}
            </select>
          </Field>

          {config.ccmrExpectation !== CCMR_EXPECTATION.NONE && (
            <Field label="Framework" hint="Auto follows each student's own stated goal.">
              <select
                value={config.framework}
                onChange={(event) => update({ framework: event.target.value })}
                style={control}
              >
                {Object.values(FRAMEWORK).map((value) => (
                  <option key={value} value={value}>{FRAMEWORK_LABEL[value]}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, color: '#3c4043' }}>
            <input
              type="checkbox"
              checked={config.interventionMode}
              onChange={(event) => update({ interventionMode: event.target.checked })}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Intervention mode</strong>
              <span style={{ display: 'block', color: '#5f6368', fontSize: 12, lineHeight: 1.55 }}>
                {/* Normally at most half a week may be below-course work. This
                    is the deliberate, teacher-owned exception — and it is a
                    checkbox rather than something the engine decides, because
                    "this student needs a term of foundations" is a
                    professional judgement, not an inference from a score. */}
                Allows a full week of below-course foundation work for this section. Off by default:
                a below-level student still needs contact with the course every week.
              </span>
            </span>
          </label>
        </div>

        {saving && <div style={{ marginTop: 12, fontSize: 12.5, color: '#5f6368' }}>Saving…</div>}
      </section>

      <section style={panel}>
        <h3 style={heading}>This week</h3>
        <p style={note}>
          Completion and academic profile are separate columns on purpose. A student can be
          above level and still not doing the work, and a student can be doing every session
          and still need help — collapsing the two into one number hides both facts.
        </p>

        {!rows.length ? (
          <p style={note}>No students in this class yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ textAlign: 'left', padding: 10 }}>Student</th>
                  <th style={{ textAlign: 'right', padding: 10 }}>Goal</th>
                  <th style={{ textAlign: 'right', padding: 10 }}>Complete</th>
                  <th style={{ textAlign: 'left', padding: 10 }}>Academic profile</th>
                  <th style={{ textAlign: 'left', padding: 10 }}>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.studentId} style={{ borderTop: '1px solid #eef0f2' }}>
                    <td style={{ padding: 10, fontWeight: 800 }}>
                      {onOpenStudent ? (
                        <button
                          type="button"
                          onClick={() => onOpenStudent(row.studentId)}
                          style={{ appearance: 'none', border: 0, background: 'transparent', padding: 0, color: '#174ea6', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 }}
                        >
                          {row.studentName}
                        </button>
                      ) : row.studentName}
                    </td>
                    <td style={{ padding: 10, textAlign: 'right' }}>{row.goal}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 900, color: row.overdue ? '#9a3412' : '#202124' }}>
                      {row.complete}
                    </td>
                    <td style={{ padding: 10 }}>
                      <StudentPerformanceBadge
                        profile={learningProfilesByStudentId[row.studentId]}
                        size="small"
                        showEngagement={false}
                        studentName={row.studentName}
                        onClick={onOpenStudent ? () => onOpenStudent(row.studentId) : null}
                      />
                    </td>
                    <td style={{ padding: 10, color: row.overdue ? '#9a3412' : '#3c4043' }}>
                      {row.overdue ? 'Needs Follow-Up' : row.engagement}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
