import { useMemo, useState } from 'react';
import {
  CCMR_STATE, CCMR_STATE_LABEL, buildCcmrView,
} from '../../platform/teacher/ccmrReadiness.js';
import StudentNameLink from '../common/StudentNameLink.jsx';

/*
 * TWO COLUMNS, SIDE BY SIDE, NEVER AVERAGED.
 *
 * Course mastery is what a student can do when the question is asked the way
 * the course asks it. Transfer is what they can do when the same mathematics
 * turns up in a paragraph on an exam. A student can be strong at one and weak
 * at the other in either direction, and the students where those two disagree
 * are exactly the ones a single "college readiness" percentage erases.
 *
 * So there is no readiness score on this screen. Not because one could not be
 * computed, but because it would be the number that gets pasted into a campus
 * report and read as a fact about children, and it would be an average of two
 * things that mean different things.
 *
 * Course level is shown and never used. Honors enrollment is a scheduling fact.
 */

const STATE_TONE = {
  [CCMR_STATE.TRANSFERS]: { bg: '#eefaf1', fg: '#12633a', border: '#c3e8d1' },
  [CCMR_STATE.COURSE_ONLY]: { bg: '#fdf6e3', fg: '#854d0e', border: '#f0e0b4' },
  [CCMR_STATE.TRANSFER_AHEAD]: { bg: '#eef3fb', fg: '#174ea6', border: '#c9daf8' },
  [CCMR_STATE.BOTH_LOW]: { bg: '#fdf1ec', fg: '#9a3412', border: '#f6d4c4' },
  [CCMR_STATE.PROVISIONAL]: { bg: '#f8f9fa', fg: '#5f6368', border: '#e8eaed' },
  [CCMR_STATE.NO_EVIDENCE]: { bg: '#f8f9fa', fg: '#80868b', border: '#e8eaed' },
};

const FRAMEWORKS = [
  ['', 'All exam contexts'],
  ['digitalSAT', 'Digital SAT'],
  ['act', 'ACT'],
  ['tsia2', 'TSIA2'],
  ['asvab', 'ASVAB'],
];

const pctOrDash = (value) => (value == null ? '—' : `${Math.round(value * 100)}%`);

export default function CcmrDashboard({
  students = [],
  profilesByStudentId = {},
  courseLevelByStudentId = {},
  onOpenStudent = null,
}) {
  const [framework, setFramework] = useState('');

  const view = useMemo(() => buildCcmrView({
    students, profilesByStudentId, courseLevelByStudentId, framework: framework || null,
  }), [students, profilesByStudentId, courseLevelByStudentId, framework]);

  return (
    <section>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0 }}>Course knowledge and transfer</h3>
          <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: 13.5, maxWidth: '68ch', lineHeight: 1.5 }}>
            The left number is what a student can do when the question is asked the way this course asks it.
            The right is what they can do when the same mathematics turns up in exam phrasing. They are shown
            apart because the students where they disagree are the ones a single readiness score would hide.
          </p>
        </div>
        <label style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#5f6368' }}>
          Exam context
          <select
            value={framework}
            onChange={(event) => setFramework(event.target.value)}
            style={{ display: 'block', marginTop: 5, padding: '8px 10px', border: '1px solid #c7cdd6', borderRadius: 8, minWidth: 180 }}
          >
            {FRAMEWORKS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      {view.findings.length > 0 && (
        <div style={{ display: 'grid', gap: 10, margin: '16px 0 20px' }}>
          {view.findings.map((finding) => {
            const tone = STATE_TONE[finding.state];
            return (
              <div key={finding.state} style={{ padding: '12px 14px', borderRadius: 9, background: tone.bg, border: `1px solid ${tone.border}`, borderLeft: `3px solid ${tone.fg}` }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{finding.headline}</div>
                <p style={{ margin: '4px 0 8px', color: '#4d5b58', fontSize: 13, lineHeight: 1.5, maxWidth: '70ch' }}>{finding.detail}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {finding.students.map((row) => (
                    <StudentNameLink
                      key={row.studentId}
                      studentId={row.studentId}
                      studentName={row.studentName}
                      profile={profilesByStudentId[row.studentId]}
                      onOpen={onOpenStudent}
                      style={{ fontSize: 12.5, padding: '4px 8px', border: '1px solid #dadce0', borderRadius: 7, background: '#fff' }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #d8dde6', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
              <th style={{ padding: 11 }}>Student</th>
              <th style={{ padding: 11 }}>Enrolled</th>
              <th style={{ padding: 11, textAlign: 'right' }}>Course mastery</th>
              <th style={{ padding: 11, textAlign: 'right' }}>Transfer</th>
              <th style={{ padding: 11, textAlign: 'right' }}>Exam questions</th>
              <th style={{ padding: 11 }}>Reading</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const tone = STATE_TONE[row.state];
              return (
                <tr key={row.studentId} style={{ borderTop: '1px solid #eef0f2' }}>
                  <td style={{ padding: 11 }}>
                    <StudentNameLink
                      studentId={row.studentId}
                      studentName={row.studentName}
                      profile={profilesByStudentId[row.studentId]}
                      onOpen={onOpenStudent}
                    />
                  </td>
                  {/*
                    Shown so a counsellor can see the roster they are looking at.
                    It is never an input to anything above.
                  */}
                  <td style={{ padding: 11, color: '#5f6368' }}>
                    {row.courseLevel === 'honors' ? 'Honors' : 'Standard'}
                  </td>
                  <td style={{ padding: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                    {pctOrDash(row.courseMastery)}
                  </td>
                  <td style={{ padding: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                    {pctOrDash(row.transfer)}
                  </td>
                  <td style={{ padding: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#5f6368' }}>
                    {row.transferAttempts || '—'}
                  </td>
                  <td style={{ padding: 11 }}>
                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, fontSize: 11, fontWeight: 900 }}>
                      {CCMR_STATE_LABEL[row.state]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!view.rows.length && (
        <p style={{ color: '#5f6368', marginTop: 14 }}>No students in this class yet.</p>
      )}
    </section>
  );
}
