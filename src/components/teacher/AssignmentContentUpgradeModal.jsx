import { useEffect, useMemo, useState } from 'react';
import { describeAuthError, teacherAdmin } from '../../auth/authService.js';

const LABELS = {
  unchanged: 'Unchanged',
  safeResponseControl: 'Safe response controls',
  gradingExpansion: 'More forgiving grading',
  clarificationOnly: 'Clarification only',
  fundamental: 'Fundamental correction',
};

function upgradeError(error, fallback) {
  const message = describeAuthError(error) || fallback;
  const errorCode = String(error?.code || '').trim();
  const reason = String(error?.details?.reason || '').trim();
  return {
    message,
    errorCode,
    detail: reason && reason !== errorCode ? reason : '',
  };
}

export default function AssignmentContentUpgradeModal({
  assignment,
  targetAssignment,
  onClose,
  onUpgraded,
}) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [fundamentalChoices, setFundamentalChoices] = useState({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSuccess('');
    teacherAdmin.previewAssignmentContentUpgrade({
      assignmentId: assignment.id,
      targetAssignmentId: targetAssignment.id,
    }).then((result) => {
      if (!active) return;
      setPreview(result);
      if (result?.alreadyCurrent) {
        setSuccess(result.message || `Content V${result.toVersion} is already applied to this assignment.`);
      }
    }).catch((previewError) => {
      if (active) {
        setError(upgradeError(
          previewError,
          'MathMaster could not preview this content upgrade.',
        ));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [assignment.id, targetAssignment.id]);

  const fundamentalChanges = useMemo(
    () => (preview?.changes || []).filter((change) => change.classification === 'fundamental'),
    [preview],
  );

  const ready = Boolean(
    preview
    && !preview.alreadyCurrent
    && !success
    && fundamentalChanges.every((change) => (
      ['retire-only', 'retire-and-replace'].includes(fundamentalChoices[change.questionId])
    )),
  );

  const commit = async () => {
    if (!ready || committing || success) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await teacherAdmin.commitAssignmentContentUpgrade({
        assignmentId: assignment.id,
        targetAssignmentId: targetAssignment.id,
        expectedAssignmentRevision: preview.liveAssignmentRevision,
        expectedTargetRevision: preview.targetAssignmentRevision,
        expectedPlanHash: preview.planHash,
        fundamentalChoices,
      });

      const version = Number(result?.contentVersion || preview.toVersion || 2);
      setSuccess(
        result?.alreadyUpgraded
          ? `Content V${version} was already saved on this assigned copy. No second upgrade was created.`
          : `Upgrade complete. Content V${version} is saved on this assigned copy. Student work and Classroom links were preserved.`,
      );

      try {
        await onUpgraded?.(result);
      } catch (refreshError) {
        // The server commit already succeeded. A dashboard refresh problem must
        // never be presented as though the assignment save failed.
        setError({
          message: 'The Content V2 save succeeded, but the dashboard could not refresh every panel. Press Done, then refresh the page.',
          errorCode: String(refreshError?.code || '').trim(),
          detail: '',
        });
      }
    } catch (commitError) {
      setError(upgradeError(
        commitError,
        'MathMaster refused the live content upgrade. Nothing was changed.',
      ));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !committing && !success) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        background: 'rgba(32,33,36,.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade assignment content"
        style={{
          width: 'min(900px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Upgrade to Content V{targetAssignment.contentLineage?.version || '?'}</h2>
            <p style={{ margin: '7px 0 0', color: '#5f6368' }}>{assignment.title}</p>
          </div>
          <button type="button" disabled={committing} onClick={onClose}>
            {success ? 'Done' : 'Close'}
          </button>
        </div>

        {loading && <p>Checking the live assignment and student records…</p>}

        {!preview && error && (
          <div role="alert" style={{ marginTop: 16, padding: 12, background: '#fce8e6', color: '#b3261e', borderRadius: 8 }}>
            <strong>Preview failed.</strong> {error.message}
            {error.errorCode && <div style={{ marginTop: 5, fontSize: 12 }}>Error code: {error.errorCode}</div>}
            {error.detail && <div style={{ marginTop: 3, fontSize: 12 }}>Reason: {error.detail}</div>}
          </div>
        )}

        {preview && !preview.alreadyCurrent && (
          <>
            <div style={{ marginTop: 18, padding: 14, background: '#f8f9fa', borderRadius: 10 }}>
              <strong>Content V{preview.fromVersion} → Content V{preview.toVersion}</strong>
              <div style={{ marginTop: 6 }}>
                {preview.affectedStudentCount} student record{preview.affectedStudentCount === 1 ? '' : 's'} already exist for this assigned copy.
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(preview.counts || {}).map(([key, count]) => (
                  <span key={key} style={{ padding: '4px 8px', borderRadius: 999, background: '#e8f0fe', fontSize: 12, fontWeight: 800 }}>
                    {LABELS[key] || key}: {count}
                  </span>
                ))}
              </div>
            </div>

            <p style={{ color: '#3c4043', lineHeight: 1.5 }}>
              MathMaster will keep this assignment’s existing link, classes, due dates, attempts, and Classroom posts. More-forgiving grading may raise previously saved credit, but this upgrade cannot lower earned credit.
            </p>

            <div style={{ display: 'grid', gap: 10 }}>
              {(preview.changes || []).filter((change) => change.classification !== 'unchanged').map((change) => (
                <article key={change.questionId} style={{ border: '1px solid #dadce0', borderRadius: 9, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{change.questionId}</strong>
                    <span>{LABELS[change.classification] || change.classification}</span>
                  </div>
                  {change.beforePrompt && <p style={{ marginBottom: 4 }}><strong>Before:</strong> {change.beforePrompt}</p>}
                  {change.afterPrompt && <p style={{ marginTop: 4 }}><strong>V{preview.toVersion}:</strong> {change.afterPrompt}</p>}
                  {change.reason && <p style={{ color: '#5f6368' }}>{change.reason}</p>}
                  {change.classification === 'fundamental' && (
                    <label style={{ display: 'block', fontWeight: 800 }}>
                      How should this flawed historical question be handled?
                      <select
                        value={fundamentalChoices[change.questionId] || ''}
                        disabled={committing || Boolean(success)}
                        onChange={(event) => setFundamentalChoices((current) => ({
                          ...current,
                          [change.questionId]: event.target.value,
                        }))}
                        style={{ display: 'block', width: '100%', marginTop: 7, padding: 9 }}
                      >
                        <option value="">Choose action…</option>
                        <option value="retire-only">Retire flawed question only</option>
                        <option value="retire-and-replace">Retire + add corrected replacement</option>
                      </select>
                    </label>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        <div
          style={{
            position: 'sticky',
            bottom: -24,
            margin: '20px -24px -24px',
            padding: '14px 24px',
            borderTop: '1px solid #dadce0',
            background: '#fff',
            boxShadow: '0 -6px 18px rgba(60,64,67,.08)',
          }}
        >
          {success && (
            <div role="status" style={{ marginBottom: 10, padding: 12, background: '#e6f4ea', color: '#137333', borderRadius: 8 }}>
              <strong>Upgrade complete.</strong> {success}
            </div>
          )}
          {preview && error && (
            <div role="alert" style={{ marginBottom: 10, padding: 12, background: '#fce8e6', color: '#b3261e', borderRadius: 8 }}>
              <strong>{success ? 'Refresh warning.' : 'Upgrade failed.'}</strong> {error.message}
              {error.errorCode && <div style={{ marginTop: 5, fontSize: 12 }}>Error code: {error.errorCode}</div>}
              {error.detail && <div style={{ marginTop: 3, fontSize: 12 }}>Reason: {error.detail}</div>}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            {success ? (
              <button
                type="button"
                onClick={onClose}
                style={{ background: '#188038', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 900 }}
              >
                Done
              </button>
            ) : (
              <>
                <button type="button" disabled={committing} onClick={onClose}>Cancel</button>
                {preview && !preview.alreadyCurrent && (
                  <button
                    type="button"
                    disabled={!ready || committing}
                    onClick={commit}
                    style={{
                      background: ready ? '#188038' : '#dadce0',
                      color: ready ? '#fff' : '#5f6368',
                      border: 0,
                      borderRadius: 8,
                      padding: '10px 16px',
                      fontWeight: 900,
                    }}
                  >
                    {committing ? 'Saving Content V2…' : `Upgrade and Save Content V${preview.toVersion}`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
