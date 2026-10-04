import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import {
  consumeRedirectResult,
  describeAuthError,
  hasExpiredTemporaryClassroomStudentSession,
  linkGoogleAccount,
  promoteTemporaryClassroomStudentSession,
  readRememberDevice,
  resolveSignedInRole,
  signInWithGoogle,
  signInWithPassword,
  signInWithStudentId,
  signOutSession,
  writeLoginHints,
} from './authService';
import { shouldPromoteClassroomStudentSession } from './classroomSession.js';
import { clearAccountTabStorage } from './accountTabStorage.js';
import { acceptStudentName } from '../platform/studentName.js';

const AuthContext = createContext(null);

// status:
//   'loading'  – waiting on Firebase to say whether anyone is signed in
//   'signedOut'– nobody is signed in; show the login screen
//   'linking'  – signed in with Google, but not yet matched to a roster entry
//   'ready'    – `session` is populated and the app can render
const INITIAL_STATE = { status: 'loading', session: null, linkRequest: null };

// A student's session name is a NAME or nothing. A passcode session carries no
// Auth displayName, and the id it used to fall back to became the student's
// greeting; App.jsx resolves the student's name from the roster record instead
// (resolveStudentDisplayName), so null here simply means "ask the roster".
const sessionDisplayName = (firebaseUser, claims) => {
  if (claims.role === 'student') {
    return acceptStudentName(firebaseUser.displayName, { studentId: claims.studentId }) || null;
  }
  return firebaseUser.displayName || firebaseUser.email || 'MathMaster user';
};

function toSession(firebaseUser, claims) {
  return {
    uid: firebaseUser.uid,
    role: claims.role,
    studentId: claims.studentId || null,
    email: firebaseUser.email || claims.email || null,
    displayName: sessionDisplayName(firebaseUser, claims),
    photoURL: firebaseUser.photoURL || null,
    classPeriod: null,
    accessLevel: claims.rootAdmin === true ? 'rootAdmin' : claims.role,
    isRootAdmin: claims.rootAdmin === true && claims.admin === true,
    assignmentRepairer: claims.assignmentRepairer === true,
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Guards the role-resolution round trip so a token refresh cannot start a
  // second one for the same user while the first is still in flight.
  const resolvingRef = useRef(null);
  // The account the current session belongs to.
  const sessionUidRef = useRef(null);

  const applyFirebaseUser = useCallback(async (firebaseUser) => {
    if (!firebaseUser) {
      resolvingRef.current = null;
      sessionUidRef.current = null;
      // However the session ended (here, in another tab, or by expiry), no
      // account's tab drafts outlive it (accountTabStorage.js).
      clearAccountTabStorage();
      setState({ status: 'signedOut', session: null, linkRequest: null });
      return;
    }

    // A DIFFERENT account replaced the signed-in one with no signed-out moment
    // between (another tab signed someone else in on this shared device).
    // The previous account's session ends now, not when the new account's
    // claims finish resolving: until then the app renders a loading screen,
    // never the previous account's.
    if (sessionUidRef.current && sessionUidRef.current !== firebaseUser.uid) {
      sessionUidRef.current = null;
      resolvingRef.current = null;
      clearAccountTabStorage();
      setState({ status: 'loading', session: null, linkRequest: null });
    }

    // A temporary Classroom lease uses local Firebase persistence only so a
    // second coursework link can open in another tab without another login.
    // Enforce the lease before trusting the persisted Firebase user. Explicit
    // "Keep me signed in" sessions never carry this temporary expiry marker.
    if (hasExpiredTemporaryClassroomStudentSession()) {
      resolvingRef.current = null;
      await signOutSession();
      setState({ status: 'signedOut', session: null, linkRequest: null });
      return;
    }

    if (resolvingRef.current === firebaseUser.uid) return;
    resolvingRef.current = firebaseUser.uid;

    try {
      let { claims } = await firebaseUser.getIdTokenResult();

      // Student custom tokens already carry their identity. Teachers are
      // intentionally re-resolved on session startup so an existing teacher
      // token can receive a newly deployed root-admin claim and revoked staff
      // access is never trusted merely because an older token says teacher.
      if (!claims.role || claims.role === 'teacher') {
        const resolution = await resolveSignedInRole();
        if (resolution.needsLink) {
          setState({
            status: 'linking',
            session: null,
            linkRequest: { email: resolution.email || firebaseUser.email || null },
          });
          return;
        }
        ({ claims } = await firebaseUser.getIdTokenResult(true));
      }

      if (!claims.role) {
        // The server resolved a role but the refreshed token does not show it
        // yet. Signing out is safer than rendering a dashboard with no role.
        await signOutSession();
        setError('Your account is not set up for MathMaster yet. Ask your teacher to add you.');
        return;
      }

      if (shouldPromoteClassroomStudentSession({
        role: claims.role,
        search: typeof window !== 'undefined' ? window.location.search : '',
        rememberDevice: readRememberDevice(),
      })) {
        await promoteTemporaryClassroomStudentSession();
      }

      writeLoginHints({ role: claims.role });
      sessionUidRef.current = firebaseUser.uid;
      setState({ status: 'ready', session: toSession(firebaseUser, claims), linkRequest: null });
    } catch (caught) {
      console.error('Could not establish the MathMaster session:', caught);
      resolvingRef.current = null;
      setError(describeAuthError(caught));
      await signOutSession().catch(() => {});
      setState({ status: 'signedOut', session: null, linkRequest: null });
    }
  }, []);

  useEffect(() => {
    // Surfaces errors from the redirect fallback; the auth listener below is
    // what actually reacts to a successful one.
    consumeRedirectResult();
    return onAuthStateChanged(auth, applyFirebaseUser);
  }, [applyFirebaseUser]);

  /** Wraps a sign-in attempt with the shared busy flag and error surface. */
  const attempt = useCallback(async (action) => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      setError(describeAuthError(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Credentials were accepted, but resolving the role is another round trip.
   * Moving to 'loading' now keeps the login form from flashing back up in the
   * gap between the two.
   */
  const attemptSignIn = useCallback(
    (action) =>
      attempt(async () => {
        const result = await action();
        setState((current) => (current.status === 'ready' ? current : { ...current, status: 'loading' }));
        return result;
      }),
    [attempt],
  );

  const value = useMemo(
    () => ({
      status: state.status,
      session: state.session,
      linkRequest: state.linkRequest,
      error,
      busy,
      clearError: () => setError(null),

      // The redirect fallback navigates away instead of returning a user, so it
      // opts out of the 'loading' hand-off that the other two rely on.
      signInWithGoogle: (options) =>
        attempt(async () => {
          const result = await signInWithGoogle(options);
          if (!result.viaRedirect) {
            setState((current) => (current.status === 'ready' ? current : { ...current, status: 'loading' }));
          }
          return result;
        }),
      signInWithPassword: (options) => attemptSignIn(() => signInWithPassword(options)),
      signInWithStudentId: (options) => attemptSignIn(() => signInWithStudentId(options)),

      linkAccount: (options) =>
        attempt(async () => {
          const result = await linkGoogleAccount(options);
          // Claims changed server-side; force a refresh so the app sees them.
          resolvingRef.current = null;
          await auth.currentUser?.getIdToken(true);
          await applyFirebaseUser(auth.currentUser);
          return result;
        }),

      signOut: async () => {
        resolvingRef.current = null;
        setError(null);
        await signOutSession();
      },
    }),
    [state, error, busy, attempt, attemptSignIn, applyFirebaseUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an <AuthProvider>.');
  return context;
}
