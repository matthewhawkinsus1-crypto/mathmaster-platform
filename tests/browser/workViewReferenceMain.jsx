// One question with "Information you need" in the real QuestionEngine, for
// tests/browser/workViewReference.mjs (student pass 3, TOOL-12).
//
//   ?q=line       Graphing 2 (a registry tool) with an authored reference card
//   ?q=interval   Interval Number Line with a scenario as its reference
//   ?q=none       the same Graphing 2 question with no reference card
//   ?role=practice|dol   the activity policy (default practice)
//
// All data is synthetic.
import React from 'react';
import { MathfieldElement } from 'mathlive';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'line';

const LINE = {
  type: 'graphing2', toolId: 'graphing2',
  prompt: 'Graph the line that shows the total cost.',
  line: { m: 2, b: 3 }, xMin: -2, xMax: 8, yMin: -2, yMax: 20,
};
const FIXTURES = {
  line: { ...LINE, referenceInfo: { statements: ['A taxi charges a $3 pickup fee.', 'Each mile costs $2 more.'] } },
  none: { ...LINE },
  interval: {
    type: 'intervalNumberLine', toolId: 'intervalNumberLine',
    prompt: 'Graph every temperature the freezer allows.',
    scenario: 'A freezer must stay at or below −3 degrees and above −8 degrees.',
    min: -10, max: 2, step: 1, variable: 't', ask: ['graph'],
    intervals: [{ min: -8, max: -3, minClosed: false, maxClosed: true }],
  },
};

const question = FIXTURES[which] ? { questionId: `work-view-reference-${which}`, ...FIXTURES[which] } : null;

function Harness() {
  if (!question) return <p role="alert">Unknown fixture {which}.</p>;
  return (
    <main style={{ maxWidth: 1360, margin: '0 auto', padding: 12, fontFamily: 'system-ui' }} data-reference-fixture={which}>
      <QuestionEngine
        key={`${which}-${role}`}
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        activityRole={role}
        maximumAttempts={3}
        draftKey={`work-view-reference-${which}-${role}-${Date.now()}`}
        onGrade={async (isCorrect) => ({ isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 })}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
