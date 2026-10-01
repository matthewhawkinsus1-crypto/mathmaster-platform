// Harness for tests/browser/errorRecovery.mjs. The real boundaries, around a
// lazy component whose chunk "no longer exists" (the loader rejects with
// Chrome's own message), and around a component with an ordinary bug.
import { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import AppErrorBoundary from '../../src/components/common/AppErrorBoundary.jsx';
import QuestionModuleBoundary from '../../src/QuestionModuleBoundary.jsx';
import { installClientDiagnostics } from '../../src/platform/runtime/clientDiagnostics.js';
import { installMathMasterTheme } from '../../src/theme/mathMasterTheme.js';

installMathMasterTheme();
installClientDiagnostics(window);

const staleChunk = () => Promise.reject(new TypeError(
  'Failed to fetch dynamically imported module: https://mathmaster-aleks.web.app/assets/SystemsWorkspace-OLDHASH.js',
));
const StaleTool = lazy(staleChunk);
const StaleScreen = lazy(staleChunk);
function Buggy() {
  throw new TypeError("Cannot read properties of undefined (reading 'map')");
}

const scene = new URLSearchParams(window.location.search).get('scene');

function Harness() {
  if (scene === 'question-chunk') {
    return (
      <QuestionModuleBoundary questionType="systemsWorkspace" resetKey="q1">
        <Suspense fallback={<p>Opening…</p>}><StaleTool /></Suspense>
      </QuestionModuleBoundary>
    );
  }
  if (scene === 'app-chunk') {
    return (
      <AppErrorBoundary>
        <Suspense fallback={<p>Opening…</p>}><StaleScreen /></Suspense>
      </AppErrorBoundary>
    );
  }
  return (
    <AppErrorBoundary>
      <Buggy />
    </AppErrorBoundary>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
