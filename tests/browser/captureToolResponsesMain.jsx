// The capture harness. Mounts one Path tool the way a student meets it.
//
// This is the other half of tests/platform/toolResponseContracts.test.mjs. It
// renders QuestionEngine in server-grading mode from the real public payload —
// the same wiring PathSessionPlayer uses — and records the exact object the
// engine would send to the Cloud Function, without sending it anywhere.
//
// Run it via tests/browser/captureToolResponses.mjs; see that file's header.
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { questionFromToolPayload } from '../../src/platform/path/pathToolResponses.js';
import { buildPublicToolPayload } from '../../functions/shared/pathToolContracts.mjs';
import { PATH_TOOL_QUESTIONS } from '../platform/fixtures/pathToolQuestions.mjs';

const toolId = new URLSearchParams(window.location.search).get('tool') || 'algebra';
const authored = PATH_TOOL_QUESTIONS[toolId];
const payload = buildPublicToolPayload(authored);
const question = questionFromToolPayload(payload);

window.__mmPublicPayload = payload;
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
        draftKey={`capture-${toolId}`}
        serverGrading={{
          pathToolId: payload.pathToolId,
          submit: async (rawWork, supportUsage, meta) => {
            window.__mmCaptured = {
              toolId,
              pathToolId: payload.pathToolId,
              rawWork: rawWork === undefined ? null : rawWork,
              responseKey: meta?.responseKey ?? '',
            };
            return { isCorrect: true, status: 'correct', attemptCount: 1, remainingAttempts: 2 };
          },
        }}
        onGrade={async () => null}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
