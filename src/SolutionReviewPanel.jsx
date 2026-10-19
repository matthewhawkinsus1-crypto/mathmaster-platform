import MathText from './components/common/MathText.jsx';
import MathDisplay from './MathDisplay';
import SolutionReview, { legacySolutionReviewContent } from './SolutionReview';
import { SupportedTextActions } from './platform/supports/SupportedText.jsx';
import { buildClosedQuestionReview, buildPartReviewRows, partReviewSpeech } from './platform/supports/review/closedQuestionReview.js';

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
 * PART BY PART (HELP-11): given the device's grading of each part
 * (`yourParts`), a question with several answer boxes first lists every part
 * with what the student wrote beside the answer, the wrong parts first — and
 * the legacy review then leaves out its own bare "label: answer" list.
 * Read aloud reads all of it, the legacy review included (it used to read
 * only the authored and tool reviews).
 *
 * Rendered by QuestionEngine once the question is closed and outcome feedback
 * is open, and — given only `{ solutionReview }`, the review the server
 * released — by a Test's results (SecureExamReview) and Corrections
 * (RichQuestionRuntime), so every worked solution a student reads has Read
 * aloud and Translate when they are entitled to them (student pass 3, H-6).
 * It is never given a question that can still be answered.
 *
 * `headingLevel` fits the page it sits in (H-14): 3 under a classroom
 * question, 4 under a Test result's "Question N". `showIntro` false leaves
 * out the line about a closed classroom question where the page has already
 * said whether the answer was right.
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
  yourParts = [],
  allowReplacement = false,
  readAloud = null,
  translation = null,
  onSupportEvidence = null,
  headingLevel = 3,
  showIntro = true,
}) {
  const review = buildClosedQuestionReview({ question, isToolQuestion, wasCorrect, legacyContent: legacySolutionReviewContent });
  if (!review) return null;
  const { authored, tool, legacy, hasContent } = review;
  const partRows = hasContent && !isToolQuestion ? buildPartReviewRows({ question, parts: yourParts }) : [];
  const speechText = [partReviewSpeech(partRows), review.speechText].filter(Boolean).join(' ');
  const Heading = `h${Math.min(6, Math.max(2, Number(headingLevel) || 3))}`;
  return (
    <section aria-label="Worked solution" data-worked-solution={hasContent ? 'present' : 'absent'} style={box}>
      <Heading style={{ margin: '0 0 6px', color: 'var(--mm-text-strong)' }}>{wasCorrect ? 'Why that works' : 'Worked solution'}</Heading>
      {(showIntro || !hasContent) && <p style={{ margin: '0 0 14px', color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>{review.intro}</p>}

      {partRows.length > 0 && (
        <div data-part-review="" style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <strong style={{ color: 'var(--mm-text-strong)' }}>Part by part</strong>
          {partRows.map((part) => (
            <div key={part.id} data-part-review-row={part.isCorrect === false ? 'wrong' : part.isCorrect === true ? 'right' : 'ungraded'} style={{ ...row, borderLeft: `4px solid ${part.isCorrect === false ? 'var(--mm-error-text)' : part.isCorrect === true ? 'var(--mm-success-text)' : 'var(--mm-tint-border)'}`, display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 800, color: 'var(--mm-text-strong)' }}>
                <MathText>{part.label}</MathText>
                {part.isCorrect === false ? <span role="img" aria-label="not correct" style={{ marginLeft: 8, color: 'var(--mm-error-text)' }}>✗</span> : part.isCorrect === true ? <span role="img" aria-label="correct" style={{ marginLeft: 8, color: 'var(--mm-success-text)' }}>✓</span> : null}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'baseline' }}>
                <span><span style={{ color: 'var(--mm-text-muted)', fontWeight: 700 }}>You wrote: </span>{part.yourAnswer ? <MathDisplay value={part.yourAnswer} format="latex" inline /> : <em>nothing</em>}</span>
                <span><span style={{ color: 'var(--mm-text-muted)', fontWeight: 700 }}>Correct: </span><MathText>{part.correct}</MathText></span>
              </span>
            </div>
          ))}
        </div>
      )}

      {authored && (
        <div data-review-source="authored" style={{ display: 'grid', gap: 10, marginBottom: (tool || legacy) ? 14 : 0 }}>
          {authored.headline && <MathText as="p" style={{ margin: 0, fontSize: 'calc(16 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-strong)', lineHeight: 1.5 }}>{authored.headline}</MathText>}
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

      {legacy && <SolutionReview question={question} incorrectParts={incorrectParts} embedded hideAnswerDetails={partRows.length > 0} />}

      {hasContent && (
        <SupportedTextActions text={speechText} readAloud={readAloud} translation={translation} label="the worked solution" onEvidence={onSupportEvidence} />
      )}

      {allowReplacement && (
        <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)' }}>When you are ready, you can request a new problem at the same difficulty.</p>
      )}
    </section>
  );
}
