import { useCallback, useEffect, useState } from 'react';
import Dialog from '../../ui/Dialog.jsx';
import { describeAuthError, teacherAdmin } from '../../auth/authService.js';
import { recoveryReadinessLabel } from '../../platform/recovery/recoveryReadinessCopy.js';

/*
 * PREPARE RECOVERY — THE DRY RUN A TEACHER APPROVES.
 *
 * For an assignment students already have: the server plans Recovery versions
 * for its static Warm-Up and DOL questions (previewRecoveryContentUpgrade),
 * certifies each one with the full graders, and returns a report of exactly
 * what would change — and of everything that will not. Nothing is written
 * until the teacher approves; the approval is bound to the report's plan hash,
 * and the server re-plans inside its transaction and refuses if anything
 * moved (commitRecoveryContentUpgrade). Applying it twice changes nothing.
 *
 * What it writes is one field beside the questions (recoveryContent) and one
 * audit event: no question, student record, grade, due date, class
 * assignment or Classroom post — the report says so in so many words.
 */

const SECTION_NAME = Object.freeze({ warmup: 'Warm-Up', dol: 'DOL' });

function upgradeError(error, fallback) {
  const errorCode = String(error?.code || '').trim();
  const reason = String(error?.details?.reason || '').trim();
  return {
    message: describeAuthError(error) || fallback,
    errorCode,
    reason,
    planChanged: reason === 'recovery-upgrade-plan-changed',
  };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function studentRecordsSentence(records = {}) {
  const students = Number(records.students) || 0;
  if (!students) return 'No student has a record for this assignment yet.';
  const parts = [
    `${Number(records.withAnyWork) || 0} with saved work`,
    `${Number(records.withDolWork) || 0} with DOL answers`,
    `${Number(records.withCompletedDol) || 0} who finished the DOL`,
  ];
  if (records.withRecoveryRecords) parts.push(`${records.withRecoveryRecords} with a Recovery already under way`);
  return `${plural(students, 'student record')} (${parts.join(', ')}). None of them is written.`;
}

function changeDetail(change) {
  const facts = [];
  if (Number.isFinite(change.freshVersions)) facts.push(`${change.freshVersions} fresh versions`);
  if (change.excludedFromAssignment) facts.push(`never a problem already in this assignment (${change.excludedFromAssignment} set aside)`);
  if (change.standards?.length) facts.push(`same TEKS (${change.standards.join(', ')})`);
  if (change.rigor?.dok) facts.push(`same DOK ${change.rigor.dok}`);
  facts.push('the same tool, graded by MathMaster');
  return facts.join(' · ');
}

export default function RecoveryUpgradeModal({ assignment, onClose, onUpgraded }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [refreshWarning, setRefreshWarning] = useState('');

  const loadPreview = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    teacherAdmin.previewRecoveryContentUpgrade({ assignmentId: assignment.id })
      .then((response) => { if (active) setPreview(response); })
      .catch((previewError) => {
        if (active) setError(upgradeError(previewError, 'MathMaster could not prepare this Recovery preview. Nothing was changed.'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assignment.id]);

  useEffect(() => loadPreview(), [loadPreview]);

  const report = preview?.report || null;
  const canApprove = Boolean(report?.changed && preview?.planHash && !result && !committing && !loading);

  const approve = async () => {
    if (!canApprove) return;
    setCommitting(true);
    setError(null);
    try {
      const response = await teacherAdmin.commitRecoveryContentUpgrade({
        assignmentId: assignment.id,
        expectedPlanHash: preview.planHash,
      });
      setResult(response);
      try {
        await onUpgraded?.(response);
      } catch {
        // The server commit succeeded; a dashboard refresh problem is not a
        // failed upgrade.
        setRefreshWarning('Recovery was added, but the dashboard could not refresh every panel. Press Done, then refresh the page.');
      }
    } catch (commitError) {
      setError(upgradeError(commitError, 'MathMaster refused the Recovery upgrade. Nothing was changed.'));
    } finally {
      setCommitting(false);
    }
  };

  const readinessRows = report ? Object.entries(report.readiness || {}).filter(([, entry]) => entry.before !== 'notPresent') : [];

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !committing) onClose?.();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(32,33,36,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <Dialog
        as="section"
        onClose={onClose}
        closeOnEscape={!committing}
        aria-labelledby="recovery-upgrade-title"
        data-recovery-upgrade-modal={assignment.id}
        style={{ width: 'min(820px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--mm-surface)', color: 'var(--mm-text)', borderRadius: 14, padding: 22, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="recovery-upgrade-title" style={{ margin: 0 }}>Prepare Recovery</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--mm-text-muted)', overflowWrap: 'anywhere' }}>{assignment.title}</p>
          </div>
          <button type="button" disabled={committing} onClick={onClose} style={{ minHeight: 40 }}>
            {result ? 'Done' : 'Close'}
          </button>
        </div>

        <p style={{ margin: '14px 0 0', lineHeight: 1.5 }}>
          MathMaster prepares fresh, equivalent Recovery versions for this assignment&apos;s Warm-Up and DOL questions, so a student who needs a second try gets new, server-graded questions on the same skills. Nothing changes until you approve.
        </p>

        {loading && <p role="status">Checking the questions, the Recovery versions and the student records…</p>}

        {error && (
          <div role="alert" style={{ marginTop: 14, padding: 12, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', borderRadius: 8, lineHeight: 1.45 }}>
            <strong>{error.planChanged ? 'The assignment changed after this preview.' : 'Nothing was changed.'}</strong> {error.message}
            {error.errorCode && <div style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))' }}>Error code: {error.errorCode}{error.reason ? ` · ${error.reason}` : ''}</div>}
            {(error.planChanged || !preview) && !loading && (
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={loadPreview} style={{ minHeight: 40 }}>Check again</button>
              </div>
            )}
          </div>
        )}

        {result && (
          <div role="status" data-recovery-upgrade-result="true" style={{ marginTop: 14, padding: 12, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', borderRadius: 8, lineHeight: 1.45 }}>
            <strong>{result.alreadyCurrent ? 'Recovery was already prepared.' : 'Recovery added.'}</strong>{' '}
            {result.alreadyCurrent
              ? 'Nothing needed to change.'
              : `Recovery version ${result.recoveryContentVersion} is saved beside the questions. No question, student record, grade, due date or Classroom post changed.`}
            {refreshWarning && <div style={{ marginTop: 6 }}>{refreshWarning}</div>}
          </div>
        )}

        {report && !loading && (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            {readinessRows.length > 0 && (
              <section aria-label="Recovery readiness" style={{ padding: 12, borderRadius: 10, background: 'var(--mm-surface-sunken)' }}>
                <strong>Recovery readiness</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.55 }}>
                  {readinessRows.map(([section, entry]) => (
                    <li key={section} data-recovery-upgrade-readiness={section}>
                      {SECTION_NAME[section]} Recovery: {recoveryReadinessLabel(entry.before).text}
                      {entry.after !== entry.before && <> → <strong>{recoveryReadinessLabel(entry.after).text}</strong> after you approve</>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.changes?.length > 0 && (
              <section aria-label="What this adds" data-recovery-upgrade-changes="true" style={{ padding: 12, borderRadius: 10, border: '1px solid var(--mm-info-border)', background: 'var(--mm-info-bg)' }}>
                <strong style={{ color: 'var(--mm-info-text)' }}>What this adds</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
                  {report.changes.map((change) => (
                    <li key={change.questionId} style={{ marginBottom: 6 }}>
                      <strong>{change.label}</strong>
                      {change.describes ? <> ({change.describes})</> : null}: {change.action === 'replace' ? 'its Recovery is refreshed to match the question as it stands' : 'Recovery versions are added'} — {change.family?.title || 'a checked Question Family'}.
                      <div style={{ fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{changeDetail(change)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.notReady?.length > 0 && (
              <section aria-label="Still not ready" style={{ padding: 12, borderRadius: 10, border: '1px solid var(--mm-warning-border-soft)', background: 'var(--mm-warning-bg)' }}>
                <strong style={{ color: 'var(--mm-warning-text)' }}>Still not ready</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
                  {report.notReady.map((row) => (
                    <li key={row.questionId || row.label}>
                      <strong>{row.label}</strong>: {row.issues?.[0]?.message || 'No checked Recovery family recognizes it yet.'}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="What stays exactly the same" data-recovery-upgrade-untouched="true" style={{ padding: 12, borderRadius: 10, border: '1px solid var(--mm-border)' }}>
              <strong>What stays exactly the same</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
                {(report.untouched?.statements || []).map((statement) => <li key={statement}>{statement}</li>)}
                <li>{studentRecordsSentence(report.untouched?.studentRecords)}</li>
              </ul>
            </section>

            {!report.changed && !result && (
              <div role="status" style={{ padding: 12, borderRadius: 8, background: 'var(--mm-surface-sunken)' }}>
                {report.fullyReadyAfter
                  ? 'Recovery is already prepared for this assignment. There is nothing to approve.'
                  : 'There is nothing MathMaster can add right now. The questions listed under "Still not ready" need a Question Family before they can be recovered.'}
              </div>
            )}

            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Technical record</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                {(report.writes || []).map((write) => <li key={write}>Writes {write}</li>)}
                <li>Recovery version {report.recoveryContent?.versionBefore ?? 0} → {report.recoveryContent?.versionAfter ?? 0}</li>
                <li>{report.untouched?.questionCount ?? 0} questions, each with an unchanged content signature</li>
                {report.migrationId && <li>Prepared migration: {report.migrationId}</li>}
                <li>Plan: {preview.planHash}</li>
              </ul>
            </details>
          </div>
        )}

        <div style={{ position: 'sticky', bottom: -22, margin: '18px -22px -22px', padding: '12px 22px', borderTop: '1px solid var(--mm-border)', background: 'var(--mm-surface)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          {result ? (
            <button type="button" onClick={onClose} style={{ minHeight: 44, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 900 }}>Done</button>
          ) : (
            <>
              <button type="button" disabled={committing} onClick={onClose} style={{ minHeight: 44 }}>Cancel</button>
              {report?.changed && (
                <button
                  type="button"
                  data-recovery-upgrade-approve="true"
                  disabled={!canApprove}
                  onClick={approve}
                  style={{ minHeight: 44, background: canApprove ? 'var(--mm-primary)' : 'var(--mm-surface-sunken)', color: canApprove ? 'var(--mm-on-primary)' : 'var(--mm-text-muted)', border: 0, borderRadius: 8, padding: '10px 16px', fontWeight: 900 }}
                >
                  {committing ? 'Adding Recovery…' : 'Approve and Add Recovery'}
                </button>
              )}
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
