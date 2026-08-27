import { useEffect, useMemo, useState } from 'react';

import { describeAuthError, teacherAdmin } from '../../auth/authService.js';

const panel = {
  border: '1px solid #dadce0',
  borderRadius: 12,
  padding: '20px 22px',
  marginBottom: 18,
  background: '#fff',
};

const formatCount = (value) => Number(value || 0).toLocaleString();

const labelForCollection = (name) => ({
  assignments: 'Assignments',
  presence: 'Live presence',
  liveChallengeInvites: 'Live Challenge invites',
  liveChallengeRooms: 'Live Challenge rooms',
  liveChallengeTeacherActive: 'Live Challenge active pointers',
  liveChallengePrivate: 'Live Challenge private state',
  pathHistory: 'Path routing history',
  classroomLinks: 'Classroom publication links',
  classroomRosterLinks: 'Classroom roster links',
  classroomGradeSyncs: 'Classroom grade-sync records',
  studentCredentials: 'Student credentials',
  studentAliases: 'Student aliases',
  studentDirectory: 'Student directory links',
  classJoinCodes: 'Class join codes',
  authThrottle: 'Sign-in throttle state',
  oauthStates: 'Pending OAuth handshakes',
  activePathLocks: 'Active Path locks',
  weeklyPathGoalSnapshots: 'Weekly Path snapshots',
  pathSessions: 'Path sessions',
  pathSubmissions: 'Path submissions',
  masteryEvidenceApplications: 'Mastery evidence applications',
  modelingLabSubmissions: 'Modeling-lab submissions',
  examSessions: 'Exam sessions',
  examSubmissions: 'Exam submissions',
  examIntegrityEvents: 'Exam integrity events',
  studentMasteryProfiles: 'Student mastery profiles',
  studentRetentionSchedules: 'Student retention schedules',
}[name] || name);

const preservedLabel = (name) => ({
  classes: 'Classes and teacher-of-record assignments',
  settings: 'Schedules and platform settings',
  teacherDirectory: 'Teacher and root-admin access',
  teacherIntegrations: 'Teacher Google integration tokens/configuration',
  classroomCourseMappings: 'Teacher Classroom-to-MathMaster course mappings',
  adminControl: 'Server-only production lifecycle lock',
  adminAuditLog: 'Administrative audit history',
  pathQuestionBank: 'My Math Path question bank',
  pathCoverage: 'Path coverage/index data',
  examQuestionBank: 'Exam question bank',
  modelingLabDefinitions: 'Modeling-lab definitions',
}[name] || name);

export default function PreproductionReset({ onResetComplete }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [lockConfirmation, setLockConfirmation] = useState('');
  const [lockAcknowledged, setLockAcknowledged] = useState(false);
  const [locking, setLocking] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await teacherAdmin.previewPreproductionReset();
      setPreview(next);
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreview();
  }, []);

  const confirmationRequired = preview?.confirmationRequired || 'RESET TEST DATA';
  const canReset = !loading
    && !resetting
    && preview?.resetLocked !== true
    && acknowledged
    && confirmation.trim() === confirmationRequired;
  const lockConfirmationRequired = preview?.lockConfirmationRequired || 'LOCK FOR PRODUCTION';
  const canLock = !loading
    && !locking
    && preview?.resetLocked !== true
    && lockAcknowledged
    && lockConfirmation.trim() === lockConfirmationRequired;

  const collectionRows = useMemo(
    () => Object.entries(preview?.collections || {})
      .filter(([, count]) => Number(count || 0) > 0)
      .sort((a, b) => labelForCollection(a[0]).localeCompare(labelForCollection(b[0]))),
    [preview],
  );

  const executeReset = async () => {
    if (!canReset) return;
    setResetting(true);
    setError('');
    setResult(null);
    try {
      const response = await teacherAdmin.resetPreproductionTestData(confirmation);
      setResult(response);
      setConfirmation('');
      setAcknowledged(false);
      await onResetComplete?.(response);
      await loadPreview();
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setResetting(false);
    }
  };

  const lockForProduction = async () => {
    if (!canLock) return;
    setLocking(true);
    setError('');
    try {
      await teacherAdmin.lockPreproductionResetForProduction(lockConfirmation);
      setLockConfirmation('');
      setLockAcknowledged(false);
      await loadPreview();
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setLocking(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Pre-production Reset</h2>
      <p style={{ maxWidth: 850, color: '#5f6368', lineHeight: 1.6 }}>
        Use this only while MathMaster is still running test data. It returns the school to a clean launch state by
        removing test students, assignments, responses, evidence, Path/exam sessions, live-game state, and MathMaster
        publication links. It deliberately keeps the platform configuration and instructional content listed below.
      </p>

      {preview?.resetLocked === true && (
        <section role="status" style={{ ...panel, borderColor: '#137333', background: '#e6f4ea', color: '#0d652d' }}>
          <h3 style={{ margin: '0 0 6px' }}>Production Lock Active</h3>
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            Bulk pre-production reset is disabled by the server. This app has no unlock action.
            {preview.resetLockedAt ? ` Locked ${new Date(preview.resetLockedAt).toLocaleString()}.` : ''}
          </p>
        </section>
      )}

      <section style={{ ...panel, borderColor: '#aecbfa', background: '#f8fbff' }}>
        <h3 style={{ margin: '0 0 8px', color: '#174ea6' }}>What stays</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 7 }}>
          {(preview?.preservedCollections || []).map((name) => (
            <div key={name} style={{ color: '#3c4043', fontSize: 13 }}>
              <span aria-hidden="true">✓</span> {preservedLabel(name)}
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...panel, borderColor: '#f1c6c2', background: '#fff8f7' }}>
        <h3 style={{ margin: '0 0 8px', color: '#a50e0e' }}>What will be permanently deleted</h3>
        {loading && <p style={{ color: '#5f6368' }}>Checking current test data…</p>}
        {!loading && preview && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginBottom: 14 }}>
              <div style={{ padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #ead1ce' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#7a3430', textTransform: 'uppercase' }}>Test students</div>
                <div style={{ fontSize: 25, fontWeight: 900, color: '#a50e0e' }}>{formatCount(preview.studentRosterRecords)}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #ead1ce' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#7a3430', textTransform: 'uppercase' }}>Student sign-ins</div>
                <div style={{ fontSize: 25, fontWeight: 900, color: '#a50e0e' }}>{formatCount(preview.studentAuthUsers)}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #ead1ce' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#7a3430', textTransform: 'uppercase' }}>Assignments</div>
                <div style={{ fontSize: 25, fontWeight: 900, color: '#a50e0e' }}>{formatCount(preview.assignments)}</div>
              </div>
            </div>

            {collectionRows.length > 0 && (
              <details style={{ marginBottom: 14 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#5f3633' }}>Show all test/runtime collections</summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 5, marginTop: 9 }}>
                  {collectionRows.map(([name, count]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: '#5f6368' }}>
                      <span>{labelForCollection(name)}</span><strong>{formatCount(count)}</strong>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fff4ce', border: '1px solid #f9ab00', color: '#5f4400', fontSize: 13, lineHeight: 1.5 }}>
              <strong>Google Classroom:</strong> this clears MathMaster&apos;s publication/sync records, but it does not delete coursework
              that was already posted inside Google Classroom. Remove any test Classroom posts there separately if needed.
            </div>
          </>
        )}
      </section>

      {error && (
        <div role="alert" style={{ ...panel, borderColor: '#d93025', background: '#fce8e6', color: '#a50e0e' }}>
          <strong>Reset could not continue.</strong> {error}
        </div>
      )}

      {result?.success && (
        <div role="status" style={{ ...panel, borderColor: '#137333', background: '#e6f4ea', color: '#0d652d' }}>
          <strong>Pre-production test data was reset.</strong>{' '}
          {formatCount(result.deletedAuthUsers)} student sign-in account{Number(result.deletedAuthUsers) === 1 ? '' : 's'} deleted.
          The aggregate reset receipt is stored in the admin audit log.
        </div>
      )}

      <section style={{ ...panel, borderColor: preview?.resetLocked ? '#dadce0' : '#d93025', opacity: preview?.resetLocked ? 0.72 : 1 }}>
        <h3 style={{ margin: '0 0 8px', color: preview?.resetLocked ? '#5f6368' : '#a50e0e' }}>
          {preview?.resetLocked ? 'Bulk reset is locked' : 'Confirm permanent reset'}
        </h3>
        <p style={{ margin: '0 0 12px', color: '#5f6368', lineHeight: 1.55 }}>
          This cannot be undone. To enable the button, acknowledge the deletion and type the exact phrase shown below.
        </p>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 13, color: '#3c4043', fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={preview?.resetLocked === true}
            onChange={(event) => setAcknowledged(event.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>I understand that all current student accounts/work and assignments are test data and will be permanently deleted.</span>
        </label>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 900, color: '#3c4043' }}>
          Type <code style={{ fontSize: 13 }}>{confirmationRequired}</code>
          <input
            value={confirmation}
            disabled={preview?.resetLocked === true}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck="false"
            placeholder={confirmationRequired}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 430,
              boxSizing: 'border-box',
              minHeight: 44,
              marginTop: 6,
              padding: '0 12px',
              border: '1px solid #c7cdd6',
              borderRadius: 8,
              fontSize: 15,
              fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={executeReset}
            disabled={!canReset}
            style={{
              minHeight: 44,
              padding: '0 16px',
              border: 0,
              borderRadius: 9,
              background: canReset ? '#d93025' : '#dadce0',
              color: canReset ? '#fff' : '#80868b',
              fontWeight: 900,
              cursor: canReset ? 'pointer' : 'not-allowed',
            }}
          >
            {resetting ? 'Resetting test data…' : 'Permanently Reset Test Data'}
          </button>
          <button
            type="button"
            onClick={loadPreview}
            disabled={loading || resetting}
            style={{ minHeight: 44, padding: '0 14px', border: '1px solid #c7cdd6', borderRadius: 9, background: '#fff', fontWeight: 800 }}
          >
            {loading ? 'Checking…' : 'Refresh Preview'}
          </button>
        </div>
      </section>

      <section style={{ ...panel, borderColor: preview?.resetLocked ? '#137333' : '#7b45a6', background: preview?.resetLocked ? '#f4fbf5' : '#fbf8ff' }}>
        <h3 style={{ margin: '0 0 8px', color: preview?.resetLocked ? '#0d652d' : '#6f2da8' }}>
          {preview?.resetLocked ? 'Reset locked for live production' : 'When real students go live'}
        </h3>
        {preview?.resetLocked ? (
          <p style={{ margin: 0, color: '#3c4043', lineHeight: 1.55 }}>
            The bulk reset has been permanently disabled inside MathMaster. There is deliberately no unlock button or callable.
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', color: '#5f6368', lineHeight: 1.55 }}>
              Before the first real student uses MathMaster, permanently disable this bulk reset. This does not delete anything;
              it changes the server lifecycle state so future reset attempts are refused.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 12, color: '#3c4043', fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={lockAcknowledged}
                onChange={(event) => setLockAcknowledged(event.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>I understand that MathMaster provides no in-app way to unlock the bulk reset after this action.</span>
            </label>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 900, color: '#3c4043' }}>
              Type <code style={{ fontSize: 13 }}>{lockConfirmationRequired}</code>
              <input
                value={lockConfirmation}
                onChange={(event) => setLockConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck="false"
                placeholder={lockConfirmationRequired}
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: 430,
                  boxSizing: 'border-box',
                  minHeight: 44,
                  marginTop: 6,
                  padding: '0 12px',
                  border: '1px solid #c7cdd6',
                  borderRadius: 8,
                  fontSize: 15,
                  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                }}
              />
            </label>
            <button
              type="button"
              onClick={lockForProduction}
              disabled={!canLock}
              style={{
                minHeight: 44,
                marginTop: 14,
                padding: '0 16px',
                border: 0,
                borderRadius: 9,
                background: canLock ? '#6f2da8' : '#dadce0',
                color: canLock ? '#fff' : '#80868b',
                fontWeight: 900,
                cursor: canLock ? 'pointer' : 'not-allowed',
              }}
            >
              {locking ? 'Locking…' : 'Lock Bulk Reset for Production'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
