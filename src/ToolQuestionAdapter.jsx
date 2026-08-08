import { useCallback, useEffect, useState } from 'react';
import { getToolDefinition } from './tools/toolRegistry';
import { ToolRuntimeProvider } from './tools/shared/ToolRuntimeContext';

/*
 * Bridges the Batch A-D tools into the shared question flow.
 *
 * The tools speak their own contract — `{ questionData, onAction }`, emitting an
 * `ATTEMPT_SUBMITTED` action carrying `{ isCorrect, score, ... }` — while every
 * other response module in QuestionEngine speaks `{ question, onStateChange }`
 * and reports readiness so the shared Submit button can enable itself.
 *
 * Translating here rather than rewriting fifteen tools keeps the tools usable
 * standalone in the Math Tools Lab and means their own test suites keep
 * passing. Without this, a tool type could pass blueprint validation and then
 * render as "unsupported question type" for the student.
 */
export default function ToolQuestionAdapter({ question, onStateChange, feedback, disabled }) {
  const definition = getToolDefinition(question?.type);
  const ToolComponent = definition?.component || null;
  const [latest, setLatest] = useState(null);

  const handleAction = useCallback((action, payload) => {
    if (action !== 'ATTEMPT_SUBMITTED' || !payload) return;
    setLatest(payload);
  }, []);

  useEffect(() => {
    if (!latest) {
      // Nothing submitted inside the tool yet, so the shared Submit stays off.
      onStateChange({ isComplete: false, isCorrect: false, responseKey: '', questionDetails: question?.prompt || '', parts: [] });
      return;
    }
    // `score` is a 0-1 fraction in the tool contract; the attempt record wants a
    // percentage, and passing it through partialCreditPercent avoids inventing
    // fake response parts just to express partial credit.
    const rawScore = Number(latest.score);
    const percent = Number.isFinite(rawScore) ? Math.round(Math.max(0, Math.min(1, rawScore)) * 100) : null;
    onStateChange({
      isComplete: true,
      isCorrect: Boolean(latest.isCorrect),
      responseKey: JSON.stringify(latest.response ?? latest),
      questionDetails: `${question?.prompt || definition?.label || question?.type}: ${JSON.stringify(latest.response ?? {})}`.slice(0, 900),
      parts: Array.isArray(latest.parts) ? latest.parts : [],
      partialCreditPercent: percent,
    });
  }, [latest, onStateChange, question?.prompt, question?.type, definition?.label]);

  if (!ToolComponent) {
    return (
      <div style={{ padding: '20px', borderRadius: '12px', background: 'var(--mm-warning-soft, #fef7e0)', border: '1px solid var(--mm-warning, #f9ab00)', textAlign: 'left' }}>
        <strong>This question could not be displayed</strong>
        <p style={{ margin: '8px 0 0' }}>
          It references an interactive tool that is not available in this version. Your grade is not affected — let your teacher know.
        </p>
      </div>
    );
  }

  return (
    <ToolRuntimeProvider showImmediateFeedback={Boolean(feedback)}>
      <div aria-disabled={disabled ? 'true' : undefined}>
        <ToolComponent questionData={question} onAction={handleAction} />
      </div>
    </ToolRuntimeProvider>
  );
}
