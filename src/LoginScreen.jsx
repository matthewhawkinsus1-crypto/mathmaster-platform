import { useEffect, useRef, useState } from 'react';
import './LoginScreen.css';
import { useAuth } from './auth/AuthProvider';
import { isSetupRequired, readLoginHints, readRememberDevice, sendTeacherPasswordReset } from './auth/authService';

const GoogleMark = () => (
  <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z" />
    <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C7.8 41 15.3 46 24 46z" />
    <path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.2 2 20.5 2 24s.8 6.8 2.3 9.8l7.4-5.7z" />
    <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.3 2 7.8 7 4.3 14.2l7.4 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" />
  </svg>
);

const BRAND_POINTS = [
  'One sign-in for assignments, practice, DOL and your scratchpad work',
  'Your work follows you from a Chromebook to a phone and back',
  'Teachers get the roster, grades and Google Classroom sync in one place',
];

/**
 * The single entry point into MathMaster.
 *
 * Two audiences with different constraints share this screen. Students are on
 * shared hardware, often typing on a phone, and need to get in within a couple
 * of seconds; teachers need an account that is genuinely theirs. So the screen
 * offers Google for both, and falls back to a student ID + PIN for students
 * without a school Google account and to email + password for teachers.
 */
export default function LoginScreen({ launchAssignment }) {
  const auth = useAuth();
  const hints = useRef(readLoginHints()).current;

  const [role, setRole] = useState(hints.role === 'teacher' ? 'teacher' : 'student');
  const [remember, setRemember] = useState(() => readRememberDevice());

  const [studentId, setStudentId] = useState(hints.studentId || '');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [classCode, setClassCode] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [revealPasscode, setRevealPasscode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [notice, setNotice] = useState(null);
  const [localError, setLocalError] = useState(null);

  const linking = auth.status === 'linking';
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkClassCode, setLinkClassCode] = useState('');

  const classCodeRef = useRef(null);
  const errorMessage = localError || auth.error;

  // The class-code field appears mid-flow, so move focus to it rather than
  // leaving the student to hunt for what changed.
  useEffect(() => {
    if (setupMode) classCodeRef.current?.focus();
  }, [setupMode]);

  const switchRole = (nextRole) => {
    setRole(nextRole);
    setLocalError(null);
    setNotice(null);
    auth.clearError();
  };

  const resetMessages = () => {
    setLocalError(null);
    setNotice(null);
    auth.clearError();
  };

  const handleGoogle = async () => {
    resetMessages();
    await auth.signInWithGoogle({ remember }).catch(() => {});
  };

  const handleStudentSubmit = async (event) => {
    event.preventDefault();
    resetMessages();

    if (setupMode && passcode !== confirmPasscode) {
      setLocalError('The two PINs do not match. Type the same one twice.');
      return;
    }

    try {
      await auth.signInWithStudentId({
        studentId,
        passcode,
        classCode: setupMode ? classCode : undefined,
        remember,
      });
    } catch (error) {
      if (isSetupRequired(error)) {
        // Not a failure the student caused — reveal setup and keep their input.
        setSetupMode(true);
        setConfirmPasscode('');
        auth.clearError();
        setNotice(
          error.message
            || 'First time here? Enter the class code from your teacher and choose a PIN.',
        );
      }
    }
  };

  const handleTeacherSubmit = async (event) => {
    event.preventDefault();
    resetMessages();
    await auth.signInWithPassword({ email, password, remember }).catch(() => {});
  };

  const handleResetPassword = async () => {
    resetMessages();
    if (!email.trim()) {
      setLocalError('Enter your email address first, then choose Reset password.');
      return;
    }
    try {
      await sendTeacherPasswordReset(email);
      setNotice(`If ${email.trim()} has an account, a password reset email is on its way.`);
    } catch {
      // Deliberately the same message either way: whether an address has an
      // account is not something an unauthenticated visitor should learn.
      setNotice(`If ${email.trim()} has an account, a password reset email is on its way.`);
    }
  };

  const handleLinkSubmit = async (event) => {
    event.preventDefault();
    resetMessages();
    await auth.linkAccount({ studentId: linkStudentId, classCode: linkClassCode }).catch(() => {});
  };

  const rememberToggle = (
    <label className="mm-login__remember">
      <input
        type="checkbox"
        checked={remember}
        onChange={(event) => setRemember(event.target.checked)}
      />
      <span>
        <strong>Keep me signed in on this device</strong>
        Leave this off on a shared or school computer.
      </span>
    </label>
  );

  const renderStudentForm = () => (
    <>
      <button type="button" className="mm-login__google" onClick={handleGoogle} disabled={auth.busy}>
        <GoogleMark />
        Continue with Google
      </button>
      <p className="mm-login__help" style={{ marginTop: '9px' }}>Fastest option if your school gave you a Google account.</p>

      <div className="mm-login__divider">or use your student ID</div>

      <form onSubmit={handleStudentSubmit} noValidate>
        <label className="mm-login__field">
          <span className="mm-login__label">Student ID</span>
          <input
            className="mm-login__input"
            type="text"
            name="studentId"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder="e.g. S1042"
            autoComplete="username"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            enterKeyHint="next"
            required
          />
        </label>

        {setupMode && (
          <label className="mm-login__field">
            <span className="mm-login__label">Class code</span>
            <input
              ref={classCodeRef}
              className="mm-login__input"
              type="text"
              name="classCode"
              value={classCode}
              onChange={(event) => setClassCode(event.target.value.toUpperCase())}
              placeholder="e.g. K7M4QP"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              enterKeyHint="next"
              required
            />
            <p className="mm-login__help">Your teacher shows this code in class. You only need it once.</p>
          </label>
        )}

        <label className="mm-login__field">
          <span className="mm-login__label">{setupMode ? 'Choose a PIN' : 'PIN'}</span>
          <span className="mm-login__input-wrap">
            <input
              className="mm-login__input mm-login__pin"
              type={revealPasscode ? 'text' : 'password'}
              name="passcode"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="••••"
              inputMode="numeric"
              pattern="\d{4,8}"
              autoComplete={setupMode ? 'new-password' : 'current-password'}
              enterKeyHint={setupMode ? 'next' : 'go'}
              required
            />
            <button
              type="button"
              className="mm-login__reveal"
              onClick={() => setRevealPasscode((current) => !current)}
              aria-pressed={revealPasscode}
            >
              {revealPasscode ? 'Hide' : 'Show'}
            </button>
          </span>
          {setupMode && <p className="mm-login__help">4 to 8 digits. Avoid 1234 or four of the same digit.</p>}
        </label>

        {setupMode && (
          <label className="mm-login__field">
            <span className="mm-login__label">Type your PIN again</span>
            <input
              className="mm-login__input mm-login__pin"
              type={revealPasscode ? 'text' : 'password'}
              name="confirmPasscode"
              value={confirmPasscode}
              onChange={(event) => setConfirmPasscode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="••••"
              inputMode="numeric"
              autoComplete="new-password"
              enterKeyHint="go"
              required
            />
          </label>
        )}

        {rememberToggle}

        <button type="submit" className="mm-login__submit" disabled={auth.busy}>
          {auth.busy ? 'Signing in…' : setupMode ? 'Set my PIN and sign in' : 'Sign in'}
        </button>
      </form>

      <div className="mm-login__footer-actions">
        {!setupMode ? (
          <button type="button" className="mm-login__link" onClick={() => { resetMessages(); setSetupMode(true); }}>
            First time here?
          </button>
        ) : (
          <button
            type="button"
            className="mm-login__link"
            onClick={() => { resetMessages(); setSetupMode(false); setConfirmPasscode(''); setClassCode(''); }}
          >
            I already have a PIN
          </button>
        )}
        <span className="mm-login__help">Forgot your PIN? Ask your teacher to reset it.</span>
      </div>
    </>
  );

  const renderTeacherForm = () => (
    <>
      <button type="button" className="mm-login__google" onClick={handleGoogle} disabled={auth.busy}>
        <GoogleMark />
        Continue with Google
      </button>
      <p className="mm-login__help" style={{ marginTop: '10px' }}>
        Use the same Google account you connect to Google Classroom.
      </p>

      {!showPasswordForm ? (
        <div className="mm-login__footer-actions">
          <button type="button" className="mm-login__link" onClick={() => { resetMessages(); setShowPasswordForm(true); }}>
            Use email and password instead
          </button>
        </div>
      ) : (
        <>
          <div className="mm-login__divider">or</div>
          <form onSubmit={handleTeacherSubmit} noValidate>
            <label className="mm-login__field">
              <span className="mm-login__label">Email</span>
              <input
                className="mm-login__input"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@school.org"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                enterKeyHint="next"
                required
              />
            </label>

            <label className="mm-login__field">
              <span className="mm-login__label">Password</span>
              <input
                className="mm-login__input"
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                enterKeyHint="go"
                required
              />
            </label>

            {rememberToggle}

            <button type="submit" className="mm-login__submit" disabled={auth.busy}>
              {auth.busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mm-login__footer-actions">
            <button type="button" className="mm-login__link" onClick={handleResetPassword}>
              Reset password
            </button>
            <button type="button" className="mm-login__link" onClick={() => { resetMessages(); setShowPasswordForm(false); }}>
              Back to Google
            </button>
          </div>
        </>
      )}
    </>
  );

  /**
   * Shown when someone finishes a Google sign-in that we cannot match to a
   * roster entry. Rather than dead-ending them, we ask for the one thing that
   * proves which class they belong to.
   */
  const renderLinkForm = () => (
    <>
      <p className="mm-login__hint">
        You are signed in as <strong>{auth.linkRequest?.email || 'your Google account'}</strong>, but that account is
        not connected to a MathMaster student yet. Connect it once and you can use the Google button from now on.
      </p>

      <form onSubmit={handleLinkSubmit} noValidate>
        <label className="mm-login__field">
          <span className="mm-login__label">Student ID</span>
          <input
            className="mm-login__input"
            type="text"
            value={linkStudentId}
            onChange={(event) => setLinkStudentId(event.target.value)}
            placeholder="e.g. S1042"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            enterKeyHint="next"
            required
          />
        </label>

        <label className="mm-login__field">
          <span className="mm-login__label">Class code</span>
          <input
            className="mm-login__input"
            type="text"
            value={linkClassCode}
            onChange={(event) => setLinkClassCode(event.target.value.toUpperCase())}
            placeholder="e.g. K7M4QP"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            enterKeyHint="go"
            required
          />
          <p className="mm-login__help">Ask your teacher for the code for your class period.</p>
        </label>

        <button type="submit" className="mm-login__submit" disabled={auth.busy}>
          {auth.busy ? 'Connecting…' : 'Connect my account'}
        </button>
      </form>

      <div className="mm-login__footer-actions">
        <button type="button" className="mm-login__link" onClick={() => auth.signOut()}>
          Sign in as someone else
        </button>
        <span className="mm-login__help">Teachers: ask the MathMaster administrator to authorize your email.</span>
      </div>
    </>
  );

  return (
    <div className="mm-login">
      <aside className="mm-login__brand">
        <div className="mm-login__wordmark">
          <span className="mm-login__mark" aria-hidden="true">∑</span>
          MathMaster
        </div>
        <div>
          <h1 className="mm-login__headline">Sign in and pick up exactly where you left off.</h1>
          <p className="mm-login__subhead">
            Algebra practice, guided notes, interactive graphing and daily DOL checks — on whatever device is in front
            of you.
          </p>
        </div>
        <ul className="mm-login__points">
          {BRAND_POINTS.map((point) => (
            <li key={point}>
              <span className="mm-login__tick" aria-hidden="true">✓</span>
              {point}
            </li>
          ))}
        </ul>
      </aside>

      <main className="mm-login__panel">
        <div className="mm-login__card">
          <div className="mm-login__compact-brand">
            <span className="mm-login__mark" aria-hidden="true">∑</span>
            MathMaster
          </div>

          {linking ? (
            <h2 className="mm-login__title">Connect your account</h2>
          ) : (
            <>
              <h2 className="mm-login__title">Welcome back</h2>
              <p className="mm-login__hint">Choose how you are signing in today.</p>
              <div className="mm-login__roles" role="group" aria-label="Sign in as">
                <button
                  type="button"
                  className="mm-login__role"
                  aria-pressed={role === 'student'}
                  onClick={() => switchRole('student')}
                >
                  I&apos;m a student
                </button>
                <button
                  type="button"
                  className="mm-login__role"
                  aria-pressed={role === 'teacher'}
                  onClick={() => switchRole('teacher')}
                >
                  I&apos;m a teacher
                </button>
              </div>
            </>
          )}

          {launchAssignment && !linking && (
            <div className="mm-login__alert mm-login__alert--info">
              <span aria-hidden="true">📌</span>
              <span>
                From Google Classroom: <strong>{launchAssignment.title}</strong>
                {launchAssignment.dueAt && <> · due {new Date(launchAssignment.dueAt).toLocaleDateString()}</>}
                <br />
                Sign in and it opens automatically.
              </span>
            </div>
          )}

          {/* Assertive so a screen reader announces a failed attempt immediately. */}
          <div aria-live="assertive" aria-atomic="true">
            {errorMessage && (
              <div className="mm-login__alert mm-login__alert--error" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <div aria-live="polite" aria-atomic="true">
            {notice && !errorMessage && (
              <div className="mm-login__alert mm-login__alert--notice">
                <span aria-hidden="true">ℹ️</span>
                <span>{notice}</span>
              </div>
            )}
          </div>

          {linking ? renderLinkForm() : role === 'student' ? renderStudentForm() : renderTeacherForm()}
        </div>
      </main>
    </div>
  );
}
