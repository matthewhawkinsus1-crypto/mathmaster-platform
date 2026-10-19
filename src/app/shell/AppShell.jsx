/*
 * THE APP SHELL: SIGN-IN FIRST, THE APP WHEN THERE IS SOMEONE TO SHOW IT TO.
 *
 * main.jsx used to import App.jsx statically, so the sign-in screen waited for
 * every screen in MathMaster — the teacher workspace, the tools, the graders —
 * about 1.4 MB compressed. The shell renders the sign-in and "finishing sign
 * in" states itself (SessionGate) and loads App only once an account is
 * signed in. App is prefetched as soon as the sign-in screen has painted, so
 * signing in is not slower; and once loaded, App stays mounted for the rest of
 * the page's life, so everything after the first sign-in (Log Out, the next
 * student on a shared Chromebook, another account signing in over this one)
 * behaves exactly as before — App's own SessionGate takes over.
 *
 * The address the page opened at is untouched until App reads it
 * (app/routes/urlArrival.js), so a deep link still waits through sign-in.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import SessionGate from './SessionGate.jsx';
import { pageTitleFor, useDocumentTitle } from '../../components/common/pageChrome.jsx';
import { useClassroomLaunchPreview } from './useClassroomLaunchPreview.js';

export const loadApp = () => import('../../App.jsx');
const App = lazy(loadApp);

const accountPresent = (status) => status === 'ready';

export default function AppShell() {
  const auth = useAuth();
  const [appWanted, setAppWanted] = useState(() => accountPresent(auth.status));
  const launchAssignment = useClassroomLaunchPreview(!appWanted);
  // WCAG 2.4.2 before App exists: the sign-in screen names itself (App's own
  // pageTitleFor call takes over once it is loaded).
  useDocumentTitle(appWanted ? null : pageTitleFor({ signedIn: false }));

  useEffect(() => {
    if (accountPresent(auth.status)) setAppWanted(true);
  }, [auth.status]);

  // The likely next chunk: fetch App while the student is typing their
  // sign-in, so Home does not wait on it afterwards.
  useEffect(() => {
    if (appWanted) return undefined;
    const prefetch = () => { loadApp().catch(() => { /* retried by the real load */ }); };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(prefetch, 300);
    return () => window.clearTimeout(timer);
  }, [appWanted]);

  const gate = (
    <SessionGate
      authStatus={auth.status}
      hydrationError={null}
      hydrating={false}
      launchAssignment={launchAssignment}
      onSignOut={() => auth.signOut()}
    />
  );
  if (!appWanted) return gate;
  return (
    <Suspense fallback={<SessionGate authStatus="loading" hydrationError={null} hydrating launchAssignment={null} onSignOut={() => auth.signOut()} />}>
      <App />
    </Suspense>
  );
}
