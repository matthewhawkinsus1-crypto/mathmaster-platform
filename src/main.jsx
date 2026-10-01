import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { ToastProvider } from './ui/Toast.jsx';
import BuildFreshnessNotice from './components/common/BuildFreshnessNotice.jsx';
import AppErrorBoundary from './components/common/AppErrorBoundary.jsx';
import { installClientDiagnostics } from './platform/runtime/clientDiagnostics.js';
import { getMathMasterBuildInfo } from './platform/runtime/buildInfo.js';
import { installPerformanceDiagnostics, startPerformanceSpan } from './platform/performance/performanceTelemetry.js';
import { installMathMasterTheme } from './theme/mathMasterTheme.js';

installMathMasterTheme();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The MathMaster root element was not found in index.html.');
}

// Support/debugging can now distinguish "the code is fixed" from "this browser
// is still running an older Firebase Hosting build" without asking a teacher to
// inspect bundles or guess which deployment they received.
if (typeof window !== 'undefined') {
  window.__MATHMASTER_BUILD__ = getMathMasterBuildInfo();
  installPerformanceDiagnostics(window);
  // Failures nothing else caught are kept (scrubbed, on this device only) so an
  // error panel can offer them to a teacher — clientDiagnostics.js.
  installClientDiagnostics(window);
}

const startupSpan = startPerformanceSpan('initial_app_usable_ms', { flow: 'startup' });

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      {/* Outside AuthProvider so sign-in problems can surface as toasts too. */}
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<main style={{ padding: 24 }}>Opening MathMaster…</main>}>
            <App />
          </Suspense>
          {/* Tells a long-open tab (or the retired Vercel copy) that it is not
              running the build Hosting serves. Never reloads on its own. */}
          <BuildFreshnessNotice />
        </AuthProvider>
      </ToastProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

requestAnimationFrame(() => requestAnimationFrame(() => startupSpan.finish({ status: 'usable' })));
