// Harness for tests/browser/moduleRecoveryLock.mjs (student pass 3, Batch 5,
// RUN-13 review). The real QuestionEngine around a probe registry tool that
// throws while `window.__mmCrash` is true — the way a damaged saved draft made
// lmr-wu-1 throw — so the engine's module boundary catches it.
//
//   ?scene=fresh   one keyed engine (as App.jsx mounts it) on a question whose
//                  record is `?status=` (expired | correct | unattempted)
//   ?scene=path    one engine with NO key (as My Math Path mounts it); the
//                  driver swaps the question under it (window.__mmNextItem)
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { TOOL_REGISTRY } from '../../src/tools/toolRegistry.js';
import { ToastProvider } from '../../src/ui/Toast.jsx';
import '../../src/index.css';
import '../../src/App.css';

window.__mmCrash = true;
function CrashProbe() {
  if (window.__mmCrash) throw new TypeError("Cannot read properties of undefined (reading 'map')");
  return (
    <div data-probe-tool="">
      <label>Probe answer <input data-probe-input="" aria-label="Probe answer" /></label>
      <button type="button" data-probe-action="">Probe action</button>
    </div>
  );
}
TOOL_REGISTRY.crashProbe = { ...TOOL_REGISTRY.openSortBoard, component: CrashProbe };

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') || 'fresh';
const status = params.get('status') || 'expired';
const record = (value) => ({
  status: value,
  attemptCount: value === 'expired' ? 3 : value === 'correct' ? 1 : 0,
  totalAttempts: value === 'expired' ? 3 : value === 'correct' ? 1 : 0,
  variantIndex: 0,
});
const question = (index) => ({ type: 'crashProbe', id: `probe-${index}`, questionId: `probe-${index}`, prompt: `Probe question ${index}.` });

function Harness() {
  const [item, setItem] = useState({ index: 1, status: scene === 'path' ? 'unattempted' : status });
  useEffect(() => {
    window.__mmNextItem = (next) => setItem((current) => ({ index: current.index + 1, ...next }));
    window.__mmModuleRecoveryReady = true;
  }, []);
  const props = {
    question: question(item.index),
    questionRecord: record(item.status),
    onGrade: async () => null,
    maximumAttempts: 3,
    activityRole: 'classwork',
    assignmentId: 'module-recovery-lock',
    executionScope: 'student',
    draftKey: `module-recovery-lock:${item.index}`,
  };
  return (
    <ToastProvider>
      <main className="app-container" data-item={item.index}>
        {scene === 'path'
          ? <QuestionEngine {...props} />
          : <QuestionEngine key="fresh" generationKey="fresh-1" {...props} />}
      </main>
    </ToastProvider>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
