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
export default function SignInAccess({ signedInEmail }) {
  const [access, setAccess] = useState({ students: [], teachers: [], bootstrapTeachers: [] });
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [search, setSearch] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accessResult, codeResult] = await Promise.all([
        teacherAdmin.listSignInAccess(),
        teacherAdmin.listClassJoinCodes(),
      ]);
      setAccess({
        students: accessResult.students || [],
        teachers: accessResult.teachers || [],
        bootstrapTeachers: accessResult.bootstrapTeachers || [],
      });
      setCodes(codeResult.codes || []);
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Sign-in Access</h2>
      <p style={{ color: '#5f6368', maxWidth: '80ch', lineHeight: 1.6 }}>
        Students sign in with a school Google account, or with their student ID and a PIN they choose once using the
        class code below. Nobody can reach a roster, a grade or another student&apos;s work without signing in.
      </p>

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
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={card}>
        <h3 style={{ margin: '0 0 6px' }}>Teacher access</h3>
        <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: '14px', lineHeight: 1.55 }}>
          Anyone listed here gets the instructor dashboard when they sign in with that Google account — the full
          roster, every grade and every student&apos;s work. Add colleagues deliberately.
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
            <p style={{ color: '#5f6368', margin: 0 }}>No teachers have been added in-app yet.</p>
          )}
          {access.teachers.map((teacher) => {
            const isSelf = signedInEmail && teacher.email === signedInEmail.toLowerCase();
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
                  border: '1px solid #e0e4ea',
                  borderRadius: '10px',
                }}
              >
                <span style={{ wordBreak: 'break-word' }}>
                  {teacher.email}
                  {isSelf && <span style={{ ...pill('#e8f0fe', '#174ea6'), marginLeft: '9px' }}>You</span>}
                  {!teacher.active && <span style={{ ...pill('#f1f3f4', '#3c4043'), marginLeft: '9px' }}>Revoked</span>}
                </span>
                <button
                  type="button"
                  style={{ ...quietButton, opacity: busy ? 0.6 : 1 }}
                  // Revoking your own access would lock you out of this page.
                  disabled={busy || isSelf}
                  title={isSelf ? 'You cannot change your own access here' : undefined}
                  onClick={() =>
                    runAction(
                      `teacher:${teacher.email}`,
                      () => teacherAdmin.setTeacherAccess(teacher.email, !teacher.active),
                      teacher.active ? `${teacher.email} can no longer sign in as a teacher.` : `${teacher.email} can sign in as a teacher again.`,
                    )
                  }
                >
                  {busy ? 'Working…' : teacher.active ? 'Revoke' : 'Restore'}
                </button>
              </div>
            );
          })}
        </div>

        {access.bootstrapTeachers.length > 0 && (
          <p style={{ margin: '16px 0 0', color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>
            Always authorized from deployment configuration (<code>INITIAL_TEACHER_EMAILS</code>):{' '}
            <strong>{access.bootstrapTeachers.join(', ')}</strong>. Remove them there once real teacher accounts exist.
          </p>
        )}
      </section>
    </div>
  );
}
