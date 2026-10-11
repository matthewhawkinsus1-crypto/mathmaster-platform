/*
 * WHAT THE APP SHOWS UNTIL AN ACCOUNT HAS LOADED.
 *
 * Moved out of App.jsx unchanged (the App shell split, student push G). App
 * renders this whenever the screen does not belong to the account signed in
 * now — signed out, a sign-in being linked, an account still loading, or one
 * that could not load — so not one frame of a previous account's screens
 * shows. While this is up, the address the page opened at waits
 * (app/routes/urlArrival.js) and opens once the account has loaded.
 */
import LoginScreen from '../../LoginScreen.jsx';

export default function SessionGate({ authStatus, hydrationError, hydrating, launchAssignment, onSignOut }) {
  if (authStatus === 'signedOut' || authStatus === 'linking') return <LoginScreen launchAssignment={launchAssignment} />;
  if (hydrationError) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--mm-surface-sunken)' }}>
        <section style={{ width: 'min(560px, 100%)', padding: '24px', borderRadius: '12px', border: '1px solid var(--mm-error-border-soft)', background: 'var(--mm-surface)', textAlign: 'center' }}>
          <h1 style={{ marginTop: 0, color: 'var(--mm-error-text)' }}>MathMaster could not load your account</h1>
          <p style={{ color: 'var(--mm-text-muted)' }}>{hydrationError}</p>
          <button type="button" onClick={onSignOut} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', background: '#174ea6', color: '#fff', fontWeight: 900 }}>Return to sign in</button>
        </section>
      </main>
    );
  }
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--mm-primary-text)', background: 'var(--mm-surface-sunken)' }}>{hydrating ? 'Loading your MathMaster workspace…' : 'Finishing sign in…'}</div>;
}
