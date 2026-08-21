// What a student actually SEES, read back out of the DOM.
//
// The bug this exists to catch: an authored string that contains `$x$` reaching
// the screen as the four characters `$`, `x`, `$` instead of a rendered x. That
// escaped every existing check because the unit tests assert on the payload —
// which is correct — and nothing asserted on the pixels. A field is only safe
// if the component that renders it routes it through MathText, QuestionPrompt
// or MathDisplay, and the only way to know which components do is to render
// them and look.
//
// The driver (tests/browser/renderAudit.mjs) sanitizes every seed-bank question
// with the REAL server sanitizer and hands the public instance in here, so this
// renders the same object a student's browser is given — not a shape a test
// author imagined.
//
// HOW TO RUN: see tests/browser/renderAudit.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PathSessionPlayer from '../../src/components/student/PathSessionPlayer.jsx';
import PathSolutionReview from '../../src/components/student/PathSolutionReview.jsx';

const listeners = new Set();
let current = null;

// The driver calls this from `page.evaluate`. Kept off the component so it is
// available the moment the module loads, before React has mounted anything.
window.__mmRenderAudit = (scene) => {
  current = scene;
  listeners.forEach((notify) => notify(scene));
};

const SESSION = { requiredQuestions: 5, summary: { completedQuestions: 0 } };

function Harness() {
  const [scene, setScene] = useState(current);

  useEffect(() => {
    listeners.add(setScene);
    return () => listeners.delete(setScene);
  }, []);

  if (!scene) return <div data-audit-idle="1">idle</div>;

  return (
    <div data-audit-id={scene.id}>
      <PathSessionPlayer
        session={SESSION}
        questionInstance={scene.questionInstance}
        // Every optional surface forced on at once. A field that only appears
        // after a wrong answer is still a field a student reads, so the audit
        // has to render it rather than wait for one.
        lastGradingResult={scene.showAftermath ? { isCorrect: false, questionFinalized: true, attemptNumber: 3 } : null}
        lastFeedback={scene.feedback ? { message: scene.feedback } : null}
        lastSupport={scene.hint ? { hint: scene.hint } : null}
        solutionReview={null}
        studentProfile={{}}
        isSubmitting={false}
        onSubmitAnswer={async () => null}
      />
      {/* Rendered separately as well as through the player: the player only
          shows a review once the server has released one, and the audit needs
          to see the review text regardless of attempt state. */}
      <PathSolutionReview review={scene.solutionReview || null} wasCorrect={false} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
