// The secure exam a student sits, for the accessibility certification.
//
// The Test Cycle card at its `test` stage, exactly as testCycleDeviceMain.jsx
// mounts it, but with the stylesheets App.jsx loads for every student surface
// (tokens, index.css, App.css) — a contrast audit of an unstyled page would
// measure the browser's defaults, not MathMaster. "Start Test" opens the REAL
// SecureExamContainer: its start screen, then one secure question, served by
// the stubbed callables in tests/browser/emulator/secureExamServiceStub.js.
//
// Served by tests/browser/emulator/vite.config.mjs (src/firebase.js and the
// Test Cycle / secure exam services swapped out; nothing reaches Firebase).
// Driven by tests/browser/accessibilityCertification.mjs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import TestCycleCard from '../../src/components/student/TestCycleCard.jsx';
import '../../src/index.css';
import '../../src/App.css';

// Vite's dev optimizer moves mathlive into .vite/deps without its fonts.
MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const App = () => (
  <main style={{ padding: '16px', maxWidth: 880, margin: '0 auto', boxSizing: 'border-box' }} data-a11y-secure-exam="true">
    <h1 style={{ fontSize: 'calc(20 * var(--mm-px))', margin: '0 0 12px' }}>My assignments</h1>
    <TestCycleCard
      assignmentId="cert-assignment"
      studentProfile={null}
      onOpenReview={() => {}}
      onExit={() => {}}
    />
  </main>
);

createRoot(document.getElementById('root')).render(<App />);
