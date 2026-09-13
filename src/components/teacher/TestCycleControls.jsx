import React, { useCallback, useEffect, useState } from 'react';
import {
  assignTestCycleSessions,
  getTeacherTestCyclePlans,
  listTeacherTestCycleRecords,
  preflightTestCycleAssignment,
  teacherTestCycleAction,
} from '../../services/testCycleService.js';

/*
 * THE TEACHER'S VIEW OF A TEST CYCLE.
 *
 * Three jobs, in the order a teacher actually does them:
 *
 *   1. ASSIGN. One action opens a secure Test session for every eligible
 *      student in the class. Creating twenty-five sessions by hand is not a
 *      workflow, it is a reason the feature does not get used — and the
 *      per-student session is what makes each student's version individual.
 *
 *   2. WATCH. One row per student: the stage they are in, the original Test,
 *      the raw Retest, the cap, and the recorded grade. All five come from the
 *      canonical record, so this table and the student's Grade Center and
 *      Google Classroom cannot disagree.
 *
 *   3. OVERRIDE. Require or waive corrections, unlock or close a retest, reset
 *      a secure session. Each one is an explicit decision the server records.
 *
 * Presentational. Nothing here computes a grade or decides a stage.
 */

const cell = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #e3e6ea', textAlign: 'left' };
const button = (tone) => ({
  minHeight: 36, padding: '6px 11px', borderRadius: 7, fontWeight: 800, fontSize: 12, cursor: 'pointer',
  border: tone === 'primary' ? 0 : '1px solid #aeb8c6',
  background: tone === 'primary' ? '#1a73e8' : '#fff',
  color: tone === 'primary' ? '#fff' : '#3c4043',
});

const percent = (value) => (value === null || value === undefined ? '—' : `${value}%`);

export const TestCycleControls = ({ assignment, classId = null }) => {
  const assignmentId = assignment?.id || null;
  const [rows, setRows] = useState([]);
  const [preflight, setPreflight] = useState(null);
  const [plans, setPlans] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const [records, checks] = await Promise.all([
        listTeacherTestCycleRecords({ assignmentId }),
        preflightTestCycleAssignment({ assignmentId }),
      ]);
      setRows(records.rows || []);
      setPreflight(checks.preflight || null);
    } catch (error) {
      setMessage(error.message || 'The Test Cycle could not be loaded.');
    }
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);

  if (!assignmentId) return null;

  const run = async (work, successText) => {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setMessage(successText);
      await load();
    } catch (error) {
      setMessage(error.message || 'That action did not complete.');
    } finally {
      setBusy(false);
    }
  };

  const blocked = preflight?.blocked === true;

  return (
    <section style={{ padding: 18, border: '1px solid #dadce0', borderRadius: 12, background: '#fff' }}>
      <h2 style={{ marginTop: 0 }}>Test Cycle · {assignment.title}</h2>
      <p style={{ color: '#5f6368', lineHeight: 1.5, marginTop: 0 }}>
        Review → secure Test → Corrections → secure Retest, as one assignment and one Google Classroom
        grade item. A retest can raise the recorded grade to at most the policy cap; it can never lower it.
      </p>

      {/* Preflight is shown before the assign button, because a Test Cycle that
          cannot issue equivalent secure coverage must not reach a classroom. */}
      {preflight && (
        <div style={{ margin: '12px 0', padding: '11px 13px', borderRadius: 9, background: blocked ? '#fce8e6' : '#e6f4ea', border: `1px solid ${blocked ? '#f5b5ae' : '#a8dab5'}` }}>
          <strong style={{ fontSize: 13, color: blocked ? '#b3261e' : '#0d652d' }}>
            {blocked ? 'Cannot be assigned securely yet' : 'Secure preflight passed'}
          </strong>
          <ul style={{ margin: '7px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>
            {(preflight.checks || []).map((check) => (
              <li key={check.id} style={{ color: check.passed ? '#3c4043' : '#b3261e' }}>
                {check.passed ? '✓' : '✗'} {check.label}
              </li>
            ))}
          </ul>
          {(preflight.errors || []).map((error) => (
            <p key={error} style={{ margin: '6px 0 0', fontSize: 12.5, color: '#b3261e' }}>{error}</p>
          ))}
          {(preflight.warnings || []).map((warning) => (
            <p key={warning} style={{ margin: '6px 0 0', fontSize: 12.5, color: '#7a4f00' }}>{warning}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={busy || blocked}
        style={{ ...button('primary'), minHeight: 44, opacity: busy || blocked ? 0.5 : 1 }}
        onClick={() => run(
          () => assignTestCycleSessions({ assignmentId, classId }),
          'Secure Test sessions were opened for every eligible student.',
        )}
      >
        {busy ? 'Working…' : 'Open secure Test sessions for this class'}
      </button>

      {message && <p role="status" style={{ fontSize: 13, fontWeight: 700, color: '#174ea6' }}>{message}</p>}

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead>
            <tr>
              {['Student', 'Stage', 'Original Test', 'Retest raw', 'Retest capped', 'Recorded', 'Actions'].map((heading) => (
                <th key={heading} style={{ ...cell, fontSize: 11, textTransform: 'uppercase', color: '#5f6368' }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentId}>
                <td style={cell}>{row.studentId}</td>
                <td style={cell}>{row.statusLabel || row.stage || '—'}</td>
                <td style={cell}>{percent(row.originalTestGrade)}</td>
                <td style={cell}>{percent(row.rawRetestGrade)}</td>
                <td style={cell}>{percent(row.retestCappedContribution)}</td>
                <td style={{ ...cell, fontWeight: 900 }}>{percent(row.recordedGrade)}</td>
                <td style={cell}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {/*
                      Reset names its stage. One "Reset session" button had to
                      pick a default, and the default was the Test — so a
                      teacher resetting a student's Retest would instead have
                      force-submitted the Test and cleared its released score.
                      Which session is being thrown away is not something a
                      button should decide on a teacher's behalf.
                    */}
                    {[
                      ['waiveCorrections', 'Waive corrections', 'test'],
                      ['unlockRetest', 'Unlock retest', 'test'],
                      ['disableRetest', 'Close retest', 'test'],
                      ['requireCorrections', 'Require corrections', 'test'],
                      ['resetSecureSession', 'Reset Test session', 'test'],
                      ['resetSecureSession', 'Reset Retest session', 'retest'],
                    ].map(([action, label, stage]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={busy}
                        style={button()}
                        onClick={() => run(
                          () => teacherTestCycleAction({ assignmentId, studentId: row.studentId, action, stage }),
                          `${label} applied for ${row.studentId}.`,
                        )}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      style={button()}
                      onClick={async () => {
                        setPlans(await getTeacherTestCyclePlans({ assignmentId, studentId: row.studentId }));
                      }}
                    >
                      View plans
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td style={cell} colSpan={7}>No students have been assigned this Test Cycle yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* The generated plans, before or after unlock. "Why is this student
          answering three questions about A.5A?" needs an answer that is not
          "the algorithm decided". */}
      {plans && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: '#f8f9fa', border: '1px solid #e3e6ea' }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Generated plans · {plans.studentId}</h3>
          {plans.corrections ? (
            <>
              <h4 style={{ marginBottom: 4, fontSize: 13 }}>Corrections, mapped to the failed Test evidence</h4>
              {plans.corrections.targets.map((target) => (
                <div key={target.correctionId} style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 7 }}>
                  <strong>{target.label}</strong> · {target.diagnosisDetail}
                  <div style={{ color: '#5f6368' }}>
                    Missed {target.missed} of {target.attempted} · instances {(target.evidence || []).map((item) => item.questionInstanceId).filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
              ))}
            </>
          ) : <p style={{ fontSize: 12.5, color: '#5f6368' }}>No correction plan — this student did not fail the Test.</p>}
          {plans.retest ? (
            <>
              <h4 style={{ marginBottom: 4, fontSize: 13 }}>Retest targeting</h4>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
                {plans.retest.audit.questionCount} questions ({plans.retest.audit.targetedQuestionCount} targeted at weak
                skills, {plans.retest.audit.anchorQuestionCount} anchor coverage —{' '}
                {Math.round(plans.retest.audit.actualWeakShare * 100)}% / {Math.round(plans.retest.audit.actualAnchorShare * 100)}%),
                against {plans.retest.audit.originalQuestionCount} on the original Test.
              </p>
            </>
          ) : <p style={{ fontSize: 12.5, color: '#5f6368' }}>No retest plan has been generated yet.</p>}
        </div>
      )}
    </section>
  );
};

export default TestCycleControls;
