// The capture harness for the registry tools that are not Path tools (CI02):
// Polynomial Workshop, Representation Bridge, Representation Match and Matrix
// Lab. Mounts one of tests/platform/fixtures/registryToolQuestions.mjs in the
// real QuestionEngine, on an assignment's practice, and records what the
// engine hands its host with the attempt: the browser's verdict and the
// structured tool response (`toolResponse`) the server re-grades.
//
// Run it via tests/browser/captureRegistryToolResponses.mjs; see that file's header.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { REGISTRY_TOOL_QUESTIONS } from '../platform/fixtures/registryToolQuestions.mjs';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const toolId = new URLSearchParams(window.location.search).get('tool') || 'polynomialWorkshop';
const question = REGISTRY_TOOL_QUESTIONS[toolId];
window.__mmCaptured = null;

function Harness() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <div data-tool={toolId} style={{ fontWeight: 900, marginBottom: 8 }}>{toolId}</div>
      <QuestionEngine
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={3}
        activityRole="practice"
        draftKey={`capture-registry-${toolId}`}
        executionScope="student"
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
          window.__mmCaptured = {
            toolId,
            browserIsCorrect: isCorrect === true,
            toolResponse: meta?.toolResponse ? JSON.parse(JSON.stringify(meta.toolResponse)) : null,
          };
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
