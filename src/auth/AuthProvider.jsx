import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import {
  consumeRedirectResult,
  describeAuthError,
  linkGoogleAccount,
  resolveSignedInRole,
  signInWithGoogle,
  signInWithPassword,
  signInWithStudentId,
  signOutSession,
  writeLoginHints,
} from './authService';

const AuthContext = createContext(null);

// status:
//   'loading'  – waiting on Firebase to say whether anyone is signed in
//   'signedOut'– nobody is signed in; show the login screen
//   'linking'  – signed in with Google, but not yet matched to a roster entry
//   'ready'    – `session` is populated and the app can render
const INITIAL_STATE = { status: 'loading', session: null, linkRequest: null };

function toSession(firebaseUser, claims) {
  return {
    uid: firebaseUser.uid,
    role: claims.role,
    studentId: claims.studentId || null,
    email: firebaseUser.email || claims.email || null,
    displayName: firebaseUser.displayName || claims.studentId || firebaseUser.email || 'MathMaster user',
    photoURL: firebaseUser.photoURL || null,
    classPeriod: null,
  };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Guards the role-resolution round trip so a token refresh cannot start a
  // second one for the same user while the first is still in flight.
  const resolvingRef = useRef(null);

  const applyFirebaseUser = useCallback(async (firebaseUser) => {
    if (!firebaseUser) {
      resolvingRef.current = null;
      setState({ status: 'signedOut', session: null, linkRequest: null });
      return;
    }

    if (resolvingRef.current === firebaseUser.uid) return;
    resolvingRef.current = firebaseUser.uid;

    try {
      let { claims } = await firebaseUser.getIdTokenResult();

      // A student signing in with ID + PIN already carries claims from the
      // custom token. Anyone arriving through Google or a password needs the
      // server to decide what they are.
      if (!claims.role) {
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

      writeLoginHints({ role: claims.role });
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
