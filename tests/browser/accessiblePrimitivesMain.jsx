// Harness for tests/browser/accessiblePrimitives.mjs: the Dialog primitive
// (with a nested confirm), the global keyboard focus ring on an interactive
// span that sets outline:none inline, and QuestionAnnouncer across a question
// change whose prompt contains typeset math.
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import Dialog from '../../src/ui/Dialog.jsx';
import QuestionAnnouncer from '../../src/components/common/QuestionAnnouncer.jsx';
import QuestionPrompt from '../../src/QuestionPrompt.jsx';
import '../../src/index.css';

const PROMPTS = ['Solve $2x+3=7$.', 'Graph $y = -\\frac{2}{3}x + 4$.', 'What is $\\frac{3}{4}$ of 12?'];

function Harness() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [foreign, setForeign] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState(0);
  const stageRef = useRef(null);
  return (
    <main>
      <h1>Accessible primitives</h1>
      <button type="button" data-test="opener" onClick={() => setOpen(true)}>Open settings</button>
      {/* Disabled while the dialog loads (like the Scratchpad): focus falls to <body> before the Dialog mounts. */}
      <button type="button" data-test="slow-opener" disabled={loading} onClick={() => { setLoading(true); setTimeout(() => { setOpen(true); setLoading(false); }, 150); }}>Open slowly</button>
      <span role="button" tabIndex={0} data-test="term" style={{ outline: 'none', padding: 6 }}>2 times x</span>
      <button type="button" data-test="next" onClick={() => setQuestion((q) => (q + 1) % PROMPTS.length)}>Next question</button>
      <QuestionAnnouncer announceKey={`q-${question}`} position={`Practice, question ${question + 1} of ${PROMPTS.length}`} containerRef={stageRef} />
      <section ref={stageRef}><QuestionPrompt>{PROMPTS[question]}</QuestionPrompt></section>
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' }}>
          <Dialog aria-labelledby="settings-title" onClose={() => setOpen(false)} closeOnEscape={!busy} data-test="dialog" style={{ background: 'var(--mm-surface)', margin: 40, padding: 20 }}>
            <button type="button" aria-label="Close" data-test="close" onClick={() => setOpen(false)}>×</button>
            <h2 id="settings-title">Settings</h2>
            <input aria-label="Name" data-test="name" />
            <label><input type="checkbox" data-test="busy" checked={busy} onChange={(event) => setBusy(event.target.checked)} /> Saving</label>
            <button type="button" data-test="delete" onClick={() => setConfirm(true)}>Delete</button>
            <button type="button" data-test="open-foreign" onClick={() => setForeign(true)}>Ask</button>
            {confirm && (
              <Dialog role="alertdialog" aria-label="Confirm delete" onClose={() => setConfirm(false)} data-test="confirm" style={{ background: 'var(--mm-surface)', padding: 12 }}>
                <button type="button" data-test="confirm-yes" onClick={() => setConfirm(false)}>Yes, delete</button>
                <button type="button" data-test="confirm-no" data-autofocus="" onClick={() => setConfirm(false)}>Cancel</button>
              </Dialog>
            )}
          </Dialog>
        </div>
      )}
      {/* A modal that is not a Dialog (like the Toast confirm), portalled to the end of <body>. */}
      {foreign && createPortal(
        <div role="alertdialog" aria-modal="true" aria-label="Foreign confirm" data-test="foreign"
          onKeyDown={(event) => { if (event.key === 'Escape') setForeign(false); }}>
          <button type="button" data-test="foreign-a" onClick={() => setForeign(false)}>OK</button>
          <button type="button" data-test="foreign-b" onClick={() => setForeign(false)}>Cancel</button>
        </div>,
        document.body,
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
