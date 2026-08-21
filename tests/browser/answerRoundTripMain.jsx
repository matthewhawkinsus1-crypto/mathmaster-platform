// What the math editor actually SENDS when a student types an answer.
//
// The Path's generic answer fields are plain text boxes, so a student who
// writes a fraction sees `3/4` rather than a fraction. Replacing them with the
// platform's own math editor fixes that, but it also changes what gets
// submitted: MathLive serializes to LaTeX (`\frac{3}{4}`, `\left[-3,5\right)`,
// `x\ge4`), and every grader has to still accept it.
//
// This harness is the evidence for that, and it has to be a real browser
// because the serialization is MathLive's, not something a test can invent. The
// driver types an answer key in, reads back exactly what the field produced,
// and grades that string with the real server grader.
//
// Run via tests/browser/answerRoundTrip.mjs.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MathInput from '../../src/MathInput.jsx';
import { normalizePathInputProfile } from '../../src/components/student/PathResponseFields.jsx';

// The tool profile MathInput should use for each Path input profile, so the
// symbol strip a student gets matches the answer they are being asked for.
const TOOL_PROFILE = {
  interval: 'interval',
  inequality: 'inequality',
  set: 'set',
  equation: 'equation',
  expression: 'expression',
  orderedPair: 'expression',
  number: 'expression',
};

function Harness() {
  const [profile, setProfile] = useState('expression');
  const [value, setValue] = useState('');
  // A fresh field per trial. Clearing by keystroke is unreliable — MathLive owns
  // its own selection, so Ctrl+A does not necessarily select the whole formula,
  // and the first version of this harness silently CONCATENATED every answer
  // onto the last one and reported the pile-up as grading failures.
  const [nonce, setNonce] = useState(0);

  window.__mmSetProfile = (next) => setProfile(normalizePathInputProfile(next));
  window.__mmReset = () => { setValue(''); setNonce((current) => current + 1); };
  window.__mmValue = () => value;

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <div data-profile={profile} data-nonce={nonce} style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{profile}</div>
      <MathInput
        key={`${profile}-${nonce}`}
        value={value}
        onChange={setValue}
        toolProfile={TOOL_PROFILE[profile] || 'expression'}
        ariaLabel="round-trip"
        showToolsInitially
      />
      <pre data-serialized style={{ marginTop: 12, fontSize: 12 }}>{value}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
