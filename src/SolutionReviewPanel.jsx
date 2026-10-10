import MathText from './components/common/MathText.jsx';
import SolutionReview, { legacySolutionReviewContent } from './SolutionReview';
import { SupportedTextActions } from './platform/supports/SupportedText.jsx';
import { buildClosedQuestionReview } from './platform/supports/review/closedQuestionReview.js';

/*
 * THE ONE WORKED-SOLUTION PANEL FOR A CLOSED CLASSROOM QUESTION.
 *
 * It replaces three renderers that each showed part of the story: the legacy
 * SolutionReview (question types), ToolSolutionReview (registry tools) and the
 * unused SolutionReview2. What it shows, in order:
 *
 *   1. the AUTHORED review the compiler already copies onto the question
 *      (solutionReview: headline, reasoning, answer summary, common error,
 *      connection — the Path shape, read through pathSolutionSupport.mjs);
 *   2. the TOOL review (the tool's own builder: results, worked steps, why);
 *   3. the LEGACY review for a question type (graphs, workflows, tables);
 *
 * and, for a student who got it right, why it worked.
 *
 * Rendered only by QuestionEngine once the question is closed and outcome
 * feedback is open; it is never given a question that can still be answered.
 * When there is nothing to show it says so in one line — it never promises a
 * review "below" that is not there.
 */
const box = { margin: '18px auto 0', maxWidth: '860px', padding: '20px', borderRadius: '12px', border: '2px solid var(--mm-border-strong, #5f6368)', background: 'var(--mm-surface-sunken)', textAlign: 'left', color: 'var(--mm-text)' };
const row = { padding: '10px 12px', borderRadius: '8px', background: 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)' };

export default function SolutionReviewPanel({
  question,
  isToolQuestion = false,
  wasCorrect = false,
  incorrectParts = [],
  allowReplacement = false,
  readAloud = null,
  translation = null,
  onSupportEvidence = null,
}) {
  const review = buildClosedQuestionReview({ question, isToolQuestion, wasCorrect, legacyContent: legacySolutionReviewContent });
  if (!review) return null;
  const { authored, tool, legacy, hasContent } = review;
  return (
    <section aria-label="Worked solution" data-worked-solution={hasContent ? 'present' : 'absent'} style={box}>
      <h3 style={{ margin: '0 0 6px', color: 'var(--mm-text-strong)' }}>{wasCorrect ? 'Why that works' : 'Worked solution'}</h3>
      <p style={{ margin: '0 0 14px', color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>{review.intro}</p>

      {authored && (
        <div data-review-source="authored" style={{ display: 'grid', gap: 10, marginBottom: (tool || legacy) ? 14 : 0 }}>
          {authored.headline && <MathText as="p" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--mm-text-strong)', lineHeight: 1.5 }}>{authored.headline}</MathText>}
          {authored.reasoning.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 7 }}>
              {authored.reasoning.map((line, index) => <li key={`a-${index}`} style={{ lineHeight: 1.6 }}><MathText>{line}</MathText></li>)}
            </ol>
          )}
          {authored.answerSummary && <p style={{ margin: 0, padding: '9px 12px', borderRadius: 8, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }}><MathText>{authored.answerSummary}</MathText></p>}
          {authored.commonError && <p style={{ margin: 0, color: 'var(--mm-warning-text)', lineHeight: 1.6 }}><strong>Watch out: </strong><MathText>{authored.commonError}</MathText></p>}
          {authored.connection && <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.6 }}><MathText>{authored.connection}</MathText></p>}
        </div>
      )}

      {tool && (
        <div data-review-source="tool" style={{ display: 'grid', gap: 8 }}>
          {!authored && tool.title && <strong style={{ color: 'var(--mm-text-strong)' }}>{tool.title}</strong>}
          {tool.steps.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 7 }}>
              {tool.steps.map((line, index) => <li key={`s-${index}`} style={{ lineHeight: 1.6 }}><MathText>{line}</MathText></li>)}
            </ol>
          )}
          {tool.items.map((item, index) => (
            <div key={`${item.label}-${index}`} style={row}>
              <strong style={{ color: 'var(--mm-text-muted)', marginRight: '8px' }}>{item.label}:</strong>
              <MathText style={{ color: 'var(--mm-text-strong)' }}>{item.value}</MathText>
            </div>
          ))}
          {tool.why && <p style={{ margin: 0, padding: '9px 12px', borderRadius: 8, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', lineHeight: 1.55 }}><strong>Why it works: </strong><MathText>{tool.why}</MathText></p>}
          {tool.note && <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}><MathText>{tool.note}</MathText></p>}
        </div>
      )}

      {legacy && <SolutionReview question={question} incorrectParts={incorrectParts} embedded />}

      {hasContent && (
        <SupportedTextActions text={review.speechText} readAloud={readAloud} translation={translation} label="the worked solution" onEvidence={onSupportEvidence} />
      )}

      {allowReplacement && (
        <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)' }}>When you are ready, you can request a new problem at the same difficulty.</p>
      )}
    </section>
  );
}
