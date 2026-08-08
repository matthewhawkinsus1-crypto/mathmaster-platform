import { useCallback, useEffect, useMemo, useState } from 'react';
import { CLASS_PERIODS } from './assignmentLifecycle';
import { describeAuthError, teacherAdmin } from './auth/authService';

const card = {
  border: '1px solid #d8dde6',
  borderRadius: '12px',
  padding: '20px 22px',
  marginBottom: '20px',
  textAlign: 'left',
  background: '#fff',
};

const primaryButton = {
  minHeight: '42px',
  padding: '0 16px',
  border: 0,
  borderRadius: '9px',
  background: '#1a73e8',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const quietButton = {
  minHeight: '38px',
  padding: '0 13px',
  border: '1px solid #c7cdd6',
  borderRadius: '8px',
  background: '#fff',
  color: '#3c4043',
  fontWeight: 700,
  cursor: 'pointer',
};

const dangerButton = {
  ...quietButton,
  border: '1px solid #d93025',
  color: '#b3261e',
  background: '#fff',
};

const inputStyle = {
  minHeight: '42px',
  padding: '0 12px',
  border: '1px solid #c7cdd6',
  borderRadius: '8px',
  fontSize: '15px',
  minWidth: 0,
};

const pill = (background, color) => ({
  display: 'inline-block',
  padding: '3px 9px',
  borderRadius: '999px',
  background,
  color,
  fontSize: '11px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

/**
 * Everything a teacher needs to get a class signed in, in one tab.
 *
 * Class join codes are the only thing standing between a student and their
 * account on day one, and a forgotten PIN is the single most common support
 * request, so both are one click away here.
 */
export default function SignInAccess({ signedInEmail, isRootAdmin = false }) {
  const [access, setAccess] = useState({ students: [], teachers: [], bootstrapTeachers: [], authority: {} });
  const [codes, setCodes] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [search, setSearch] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accessResult, codeResult, auditResult] = await Promise.all([
        teacherAdmin.listSignInAccess(),
        teacherAdmin.listClassJoinCodes(),
        isRootAdmin ? teacherAdmin.listAdminAuditLog(40) : Promise.resolve({ events: [] }),
      ]);
      setAccess({
        students: accessResult.students || [],
        teachers: accessResult.teachers || [],
        bootstrapTeachers: accessResult.bootstrapTeachers || [],
        authority: accessResult.authority || {},
      });
      setCodes(codeResult.codes || []);
      setAuditEvents(auditResult.events || []);
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setLoading(false);
    }
  }, [isRootAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Runs one admin call with a shared busy key, message and refresh. */
  const runAction = async (key, action, successMessage) => {
    setPendingAction(key);
    setError(null);
    setStatus(null);
    try {
      const result = await action();
      setStatus(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      await refresh();
      return result;
    } catch (caught) {
      setError(describeAuthError(caught));
      return null;
    } finally {
      setPendingAction(null);
    }
  };

  const codeByPeriod = useMemo(() => {
    const map = {};
    codes.forEach((entry) => {
      map[entry.classPeriod] = entry.code;
    });
    return map;
  }, [codes]);

  const filteredStudents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return access.students;
    return access.students.filter(
      (student) =>
        student.studentId.toLowerCase().includes(needle)
        || (student.linkedEmail || '').toLowerCase().includes(needle)
        || (student.classPeriod || '').toLowerCase().includes(needle),
    );
  }, [access.students, search]);

  const needingSetup = access.students.filter((student) => !student.hasPasscode).length;
  const rootAuthorityConfirmed = isRootAdmin && access.authority?.isRootAdmin === true;

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteConfirmation('');
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    const expected = `DELETE ${deleteTarget.studentId}`;
    if (deleteConfirmation.trim() !== expected) return;
    const result = await runAction(
      `delete:${deleteTarget.studentId}`,
      () => teacherAdmin.permanentlyDeleteStudent(deleteTarget.studentId, deleteConfirmation.trim()),
      (value) => `${deleteTarget.studentId} and its MathMaster data were permanently deleted. Receipt: ${value.receipt}.`,
    );
    if (result) closeDeleteDialog();
  };

  const formatAuditAction = (action) => ({
    teacher_access_granted: 'Granted teacher access',
    teacher_access_revoked: 'Revoked teacher access',
    student_permanently_deleted: 'Permanently deleted student',
  }[action] || String(action || 'Administrative action').replaceAll('_', ' '));

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{rootAuthorityConfirmed ? 'Administration & Sign-in Access' : 'Sign-in Access'}</h2>
      <p style={{ color: '#5f6368', maxWidth: '80ch', lineHeight: 1.6 }}>
        Students sign in with a school Google account, or with their student ID and a PIN they choose once using the
        class code below. Nobody can reach a roster, a grade or another student&apos;s work without signing in.
      </p>

      {rootAuthorityConfirmed && (
        <section style={{ ...card, border: '2px solid #7b1fa2', background: '#fbf5ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ ...pill('#7b1fa2', '#fff'), marginBottom: '8px' }}>Root administrator</div>
              <h3 style={{ margin: '0 0 6px', color: '#4a126b' }}>{signedInEmail}</h3>
              <p style={{ margin: 0, color: '#5f3b6b', lineHeight: 1.55, fontSize: '14px' }}>
                Full teacher authority plus staff access management, permanent student/data deletion, and administrative audit history.
              </p>
            </div>
            <span style={{ ...pill('#e6f4ea', '#137333'), fontSize: '12px' }}>Server verified</span>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" style={{ ...card, background: '#fce8e6', borderColor: '#d93025', color: '#a50e0e' }}>
          <strong>Could not complete that.</strong> {error}
        </div>
      )}
      {status && !error && (
        <div role="status" style={{ ...card, background: '#e6f4ea', borderColor: '#137333', color: '#0d652d' }}>
          {status}
        </div>
      )}

      <section style={card}>
        <h3 style={{ margin: '0 0 6px' }}>Class join codes</h3>
        <p style={{ margin: '0 0 16px', color: '#5f6368', fontSize: '14px', lineHeight: 1.55 }}>
          Show a period&apos;s code on the board on day one. A student needs it once — to set their PIN or to connect a
          Google account. Rotating a code never signs anyone out; it only stops new claims with the old one.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
          {CLASS_PERIODS.map((period) => {
            const code = codeByPeriod[period];
            const busy = pendingAction === `code:${period}`;
            return (
              <div key={period} style={{ border: '1px solid #e0e4ea', borderRadius: '10px', padding: '13px 15px', background: '#f8f9fa' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {period}
                </div>
                <div
                  style={{
                    margin: '7px 0 11px',
                    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                    fontSize: '25px',
                    fontWeight: 900,
                    letterSpacing: '0.12em',
                    color: code ? '#174ea6' : '#9aa0a6',
                  }}
                >
                  {code || 'none yet'}
                </div>
                <button
                  type="button"
                  style={{ ...quietButton, opacity: busy ? 0.6 : 1 }}
                  disabled={busy}
                  onClick={() =>
                    runAction(
                      `code:${period}`,
                      () => teacherAdmin.issueClassJoinCode(period),
                      (result) => `${period} join code is now ${result.code}.`,
                    )
                  }
                >
                  {busy ? 'Working…' : code ? 'Generate new code' : 'Create code'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <h3 style={{ margin: 0 }}>Student sign-in</h3>
          <button type="button" style={quietButton} onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: '14px' }}>
          {loading
            ? 'Loading roster…'
            : `${access.students.length} student${access.students.length === 1 ? '' : 's'} on the roster · ${needingSetup} still to set a PIN`}
        </p>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by student ID, email or class period"
          aria-label="Search students"
          style={{ ...inputStyle, width: '100%', maxWidth: '420px', marginBottom: '14px' }}
        />

        {!loading && filteredStudents.length === 0 && (
          <p style={{ color: '#5f6368' }}>No students match that search.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {filteredStudents.map((student) => {
            const resetting = pendingAction === `reset:${student.studentId}`;
            const unlinking = pendingAction === `unlink:${student.studentId}`;
            const deleting = pendingAction === `delete:${student.studentId}`;
            return (
              <div
                key={student.studentId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '14px',
                  flexWrap: 'wrap',
                  padding: '12px 15px',
                  border: '1px solid #e0e4ea',
                  borderRadius: '10px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: '16px' }}>{student.studentId}</strong>
                  <div style={{ color: '#5f6368', fontSize: '13px', marginTop: '3px', wordBreak: 'break-word' }}>
                    {student.classPeriod}
                    {student.linkedEmail && <> · {student.linkedEmail}</>}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
                  {student.resetRequired ? (
                    <span style={pill('#fff4ce', '#7a4f00')}>PIN reset pending</span>
                  ) : student.hasPasscode ? (
                    <span style={pill('#e6f4ea', '#137333')}>PIN set</span>
                  ) : (
                    <span style={pill('#f1f3f4', '#3c4043')}>No PIN yet</span>
                  )}
                  {student.linkedEmail && <span style={pill('#e8f0fe', '#174ea6')}>Google linked</span>}

                  <button
                    type="button"
                    style={{ ...quietButton, opacity: resetting ? 0.6 : 1 }}
                    disabled={resetting || !student.hasPasscode}
                    title={student.hasPasscode ? 'Clear this PIN so the student chooses a new one' : 'This student has no PIN to reset'}
                    onClick={() =>
                      runAction(
                        `reset:${student.studentId}`,
                        () => teacherAdmin.resetStudentPasscode(student.studentId),
                        `${student.studentId} can now set a new PIN with the class code.`,
                      )
                    }
                  >
                    {resetting ? 'Resetting…' : 'Reset PIN'}
                  </button>

                  {student.linkedEmail && (
                    <button
                      type="button"
                      style={{ ...quietButton, opacity: unlinking ? 0.6 : 1 }}
                      disabled={unlinking}
                      title="Disconnect the Google account from this student"
                      onClick={() =>
                        runAction(
                          `unlink:${student.studentId}`,
                          () => teacherAdmin.unlinkStudentAccount(student.studentId),
                          `${student.studentId} is no longer linked to a Google account.`,
                        )
                      }
                    >
                      {unlinking ? 'Unlinking…' : 'Unlink Google'}
                    </button>
                  )}

                  {rootAuthorityConfirmed && (
                    <button
                      type="button"
                      style={{ ...dangerButton, opacity: deleting ? 0.6 : 1 }}
                      disabled={deleting}
                      title="Permanently delete this student account and all MathMaster data"
                      onClick={() => {
                        setDeleteTarget(student);
                        setDeleteConfirmation('');
                        setError(null);
                        setStatus(null);
                      }}
                    >
                      {deleting ? 'Deleting…' : 'Permanently delete…'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {rootAuthorityConfirmed ? (
        <>
          <section style={card}>
            <h3 style={{ margin: '0 0 6px' }}>Teacher account access</h3>
            <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: '14px', lineHeight: 1.55 }}>
              Only the root administrator can grant, revoke, or restore teacher authority. Authorized teachers receive the instructor dashboard and student instructional data, but they cannot create other teachers or permanently delete student accounts.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!teacherEmail.trim()) return;
                runAction(
                  'teacher:add',
                  () => teacherAdmin.setTeacherAccess(teacherEmail.trim(), true),
                  (result) => `${result.email} can now sign in as a teacher.`,
                ).then((result) => {
                  if (result) setTeacherEmail('');
                });
              }}
              style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}
            >
              <input
                type="email"
                value={teacherEmail}
                onChange={(event) => setTeacherEmail(event.target.value)}
                placeholder="colleague@school.org"
                aria-label="Teacher email to grant access"
                style={{ ...inputStyle, flex: '1 1 260px' }}
              />
              <button type="submit" style={{ ...primaryButton, opacity: pendingAction === 'teacher:add' ? 0.6 : 1 }} disabled={pendingAction === 'teacher:add'}>
                {pendingAction === 'teacher:add' ? 'Adding…' : 'Grant teacher access'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {access.teachers.length === 0 && !loading && (
                <p style={{ color: '#5f6368', margin: 0 }}>No teacher accounts are recorded yet.</p>
              )}
              {access.teachers.map((teacher) => {
                const isSelf = signedInEmail && teacher.email === signedInEmail.toLowerCase();
                const isRoot = teacher.accessLevel === 'rootAdmin';
                const busy = pendingAction === `teacher:${teacher.email}`;
                return (
                  <div
                    key={teacher.email}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                      padding: '11px 15px',
                      border: isRoot ? '1px solid #b980d1' : '1px solid #e0e4ea',
                      borderRadius: '10px',
                      background: isRoot ? '#fbf5ff' : '#fff',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <span style={{ wordBreak: 'break-word', fontWeight: 800 }}>{teacher.email}</span>
                      {isSelf && <span style={{ ...pill('#e8f0fe', '#174ea6'), marginLeft: '9px' }}>You</span>}
                      {isRoot && <span style={{ ...pill('#7b1fa2', '#fff'), marginLeft: '9px' }}>Root admin</span>}
                      {!teacher.active && <span style={{ ...pill('#f1f3f4', '#3c4043'), marginLeft: '9px' }}>Revoked</span>}
                      <div style={{ marginTop: '5px', color: '#5f6368', fontSize: '12px' }}>
                        {teacher.hasSignedIn ? 'Account has signed in' : 'Authorized · first sign-in pending'}
                        {teacher.lastSignInAt && ` · Last sign-in ${new Date(teacher.lastSignInAt).toLocaleString()}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{ ...quietButton, opacity: busy || isRoot ? 0.6 : 1 }}
                      disabled={busy || isRoot}
                      title={isRoot ? 'Root administrator authority is permanent' : undefined}
                      onClick={() =>
                        runAction(
                          `teacher:${teacher.email}`,
                          () => teacherAdmin.setTeacherAccess(teacher.email, !teacher.active),
                          teacher.active ? `${teacher.email} can no longer sign in as a teacher.` : `${teacher.email} can sign in as a teacher again.`,
                        )
                      }
                    >
                      {isRoot ? 'Protected' : busy ? 'Working…' : teacher.active ? 'Revoke' : 'Restore'}
                    </button>
                  </div>
                );
              })}
            </div>

            {access.bootstrapTeachers.length > 0 && (
              <p style={{ margin: '16px 0 0', color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>
                Deployment bootstrap teacher list: <strong>{access.bootstrapTeachers.join(', ')}</strong>. The root administrator no longer depends on this environment setting; ordinary staff should be managed here.
              </p>
            )}
          </section>

          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: '0 0 6px' }}>Administrative audit history</h3>
                <p style={{ margin: 0, color: '#5f6368', fontSize: '14px' }}>Recent teacher-access and permanent-deletion actions recorded by the server.</p>
              </div>
              <button type="button" style={quietButton} onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {!loading && auditEvents.length === 0 && <p style={{ margin: 0, color: '#5f6368' }}>No administrative actions have been recorded yet.</p>}
              {auditEvents.map((event) => (
                <div key={event.id} style={{ padding: '10px 12px', border: '1px solid #e0e4ea', borderRadius: '8px', fontSize: '13px' }}>
                  <strong>{formatAuditAction(event.action)}</strong>
                  {event.target && <> · {event.target}</>}
                  <div style={{ color: '#5f6368', marginTop: '3px' }}>
                    {event.actorEmail || 'administrator'}{event.createdAt ? ` · ${new Date(event.createdAt).toLocaleString()}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section style={{ ...card, background: '#f8f9fa' }}>
          <h3 style={{ margin: '0 0 6px' }}>Account administration</h3>
          <p style={{ margin: 0, color: '#5f6368', fontSize: '14px', lineHeight: 1.55 }}>
            You can manage student sign-in support above. Teacher access and permanent student-account deletion are restricted to the MathMaster root administrator.
          </p>
        </section>
      )}

      {deleteTarget && rootAuthorityConfirmed && (
        <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDeleteDialog()} style={{ position: 'fixed', inset: 0, zIndex: 15000, background: 'rgba(32,33,36,.72)', display: 'grid', placeItems: 'center', padding: '24px' }}>
          <section role="dialog" aria-modal="true" aria-labelledby="permanent-delete-title" style={{ width: 'min(620px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: '24px', borderRadius: '14px', background: '#fff', boxShadow: '0 24px 70px rgba(0,0,0,.35)', textAlign: 'left' }}>
            <div style={{ ...pill('#d93025', '#fff'), marginBottom: '10px' }}>Permanent action</div>
            <h2 id="permanent-delete-title" style={{ margin: '0 0 10px', color: '#a50e0e' }}>Delete {deleteTarget.studentId} and all MathMaster data?</h2>
            <p style={{ color: '#5f6368', lineHeight: 1.55 }}>
              This cannot be undone. The server will remove the student&apos;s sign-in identity and linked Google identity in this Firebase project, grades and saved work, immutable evidence, mastery and retention history, My Math Path sessions, modeling-lab and secure-exam records, and internal Google Classroom linkage/passback records.
            </p>
            <p style={{ color: '#3c4043', lineHeight: 1.55 }}>
              To confirm, type <strong style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>DELETE {deleteTarget.studentId}</strong> exactly.
            </p>
            <input
              autoFocus
              type="text"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              aria-label={`Type DELETE ${deleteTarget.studentId} to confirm`}
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button type="button" style={quietButton} onClick={closeDeleteDialog} disabled={pendingAction === `delete:${deleteTarget.studentId}`}>Cancel</button>
              <button
                type="button"
                style={{ ...dangerButton, background: deleteConfirmation.trim() === `DELETE ${deleteTarget.studentId}` ? '#d93025' : '#f1f3f4', color: deleteConfirmation.trim() === `DELETE ${deleteTarget.studentId}` ? '#fff' : '#9aa0a6', opacity: pendingAction === `delete:${deleteTarget.studentId}` ? 0.65 : 1 }}
                disabled={deleteConfirmation.trim() !== `DELETE ${deleteTarget.studentId}` || pendingAction === `delete:${deleteTarget.studentId}`}
                onClick={confirmPermanentDelete}
              >
                {pendingAction === `delete:${deleteTarget.studentId}` ? 'Permanently deleting…' : 'Permanently delete student'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
