// One registry tool in the real QuestionEngine, so the platform Undo the
// student presses is the real one. Driven by tests/browser/undoTyping.mjs.
//
//   ?tool=relationMapping   any registry tool id (its MathToolsLab sample spec)
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const toolId = params.get('tool') || 'relationMapping';
const question = {
  questionId: `undo-typing-${toolId}`,
  type: toolId,
  prompt: `Complete the ${toolId} activity.`,
  ...SAMPLE_SPECS[toolId],
};

createRoot(document.getElementById('root')).render(
  <div style={{ padding: 16, fontFamily: 'system-ui' }}>
    <QuestionEngine
      question={question}
      questionRecord={{ status: 'unattempted', attemptCount: 0 }}
      maximumAttempts={3}
      activityRole="practice"
      draftKey={`undo-typing-${toolId}-${params.get('run') || 'a'}`}
      onGrade={async () => ({ isCorrect: false, status: 'attempted', attemptCount: 1, remainingAttempts: 2 })}
    />
  </div>,
);
