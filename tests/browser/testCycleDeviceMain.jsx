// The Test Cycle student surfaces, in a real browser, at real device sizes.
//
// The emulator suite proves the cycle is CORRECT. It cannot see whether the
// button that starts a secure Test sits off the bottom of a 390px phone, or
// whether the corrections workspace shoves sideways — and a student who cannot
// reach the control cannot take the test, however right the grade rules are.
//
// Every payload comes from the stubbed service in the SHAPE the real callable
// returns, with the grade breakdown built by the real shared module, so this
// harness cannot measure a layout driven by numbers the product never produces.
//
// HOW TO RUN: see tests/browser/testCycleDevice.mjs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import TestCycleCard from '../../src/components/student/TestCycleCard.jsx';

const params = new URLSearchParams(window.location.search);
const stage = params.get('stage') || 'test';

const App = () => (
  <main style={{ padding: '16px', maxWidth: 880, margin: '0 auto', boxSizing: 'border-box' }}>
    <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>My assignments</h1>
    <TestCycleCard
      assignmentId="cert-assignment"
      studentProfile={null}
      onOpenReview={() => {}}
      onExit={() => {}}
    />
  </main>
);

createRoot(document.getElementById('root')).render(<App />);
window.__CERT_STAGE__ = stage;
