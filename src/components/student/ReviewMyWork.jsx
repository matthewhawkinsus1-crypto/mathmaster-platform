import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SolutionReview, { legacySolutionReviewContent } from '../../SolutionReview.jsx';
import ToolSolutionReview from '../../tools/shared/ToolSolutionReview.jsx';
import { buildToolSolutionReviewModel } from '../../tools/shared/toolSolutionReview.js';
import QuestionSupplementBoundary from '../../QuestionSupplementBoundary.jsx';
import MathText from '../common/MathText.jsx';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import {
  LOAD_ERROR_TEXT,
  REVIEW_OUTCOME,
  SOLUTION_UNAVAILABLE_TEXT,
  buildReviewMyWorkModel,
} from '../../platform/student/reviewMyWorkModel.js';

/*
 * REVIEW MY WORK — the student's own answer beside the worked solution, for
 * every question of an assignment that is over for them.
 *
 * Shown only from what `load` returns: the server (loadMyReviewWork) decides
 * whether this assignment is closed for this student and its feedback
 * released, and refuses otherwise. Until it answers there is nothing but a
 * loading line, and on a refusal nothing but the error line — this screen never
 * falls back to the assignment it was handed to show solutions on its own.
 *
 * The solution renderers are the same ones a closed question uses
 * (SolutionReview / ToolSolutionReview), each inside its own
 * QuestionSupplementBoundary so one question whose review cannot render leaves
 * every other question on the page.
 */

const CHIP_STYLE = {
  [REVIEW_OUTCOME.CORRECT]: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', border: '1px solid var(--mm-success-border)' },
  [REVIEW_OUTCOME.PARTIAL]: { background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border-soft)' },
  [REVIEW_OUTCOME.INCORRECT]: { background: 'var(--mm-surface-tint)', color: 'var(--mm-text-strong)', border: '1px solid var(--mm-tint-border)' },
  [REVIEW_OUTCOME.NOT_ANSWERED]: { background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)', border: '1px solid var(--mm-border-soft)' },
  [REVIEW_OUTCOME.EXCUSED]: { background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)', border: '1px solid var(--mm-border-soft)' },
};

const buttonStyle = {
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX, minWidth: MIN_TOUCH_TARGET_PX, padding: '10px 16px', borderRadius: 10,
  fontWeight: 800, fontSize: 15, cursor: 'pointer',
  border: '2px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)',
};

const AnswerText = ({ line }) => (line.math
  ? <MathText>{`$${line.text}$`}</MathText>
  : <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line.text}</span>);

function YourAnswer({ answer }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--mm-surface-sunken, var(--mm-surface-control))', border: '1px solid var(--mm-border-soft)', minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--mm-text-muted)', marginBottom: 4 }}>Your answer</div>
      {answer.kind === 'fields' ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {answer.items.map((item) => (
            <li key={item.id} style={{ overflowWrap: 'anywhere' }}>
              <strong>{item.label}:</strong> <AnswerText line={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 17, color: answer.kind === 'none' ? 'var(--mm-text-muted)' : 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
          {answer.kind === 'none' ? answer.text : <AnswerText line={answer} />}
        </div>
      )}
    </div>
  );
}

function WorkedSolution({ item }) {
  if (!item.solutionQuestion) {
    return <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 14 }}>{SOLUTION_UNAVAILABLE_TEXT}</p>;
  }
  const question = item.solutionQuestion;
  const usesToolReview = Boolean(buildToolSolutionReviewModel(question));
  // A question type whose review has nothing to show says so, rather than an
  // empty frame (QA round 2). A question the check cannot read falls through to
  // the renderer inside the boundary, whose own fallback then shows.
  const legacyHasNothing = (() => {
    try { return !legacySolutionReviewContent(question)?.hasContent; } catch { return false; }
  })();
  if (!usesToolReview && legacyHasNothing) {
    return <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 14 }}>{SOLUTION_UNAVAILABLE_TEXT}</p>;
  }
  return (
    <QuestionSupplementBoundary
      stage="review-my-work-solution"
      context={{ questionId: question.questionId || null, executionScope: 'review-my-work' }}
      resetKey={item.key}
      fallback={<p role="status" style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 14 }}>The worked solution for this question could not be shown here. Your answer and grade are kept exactly as they are.</p>}
    >
      <div className="mm-review-solution" style={{ maxWidth: '100%', overflowX: 'auto' }}>
        {usesToolReview ? <ToolSolutionReview question={question} /> : <SolutionReview question={question} />}
      </div>
    </QuestionSupplementBoundary>
  );
}

function ReviewQuestion({ item }) {
  return (
    <li style={{ listStyle: 'none', padding: '16px', borderRadius: 14, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 17, color: 'var(--mm-text-strong)' }}>
          Question {item.number}{item.section ? <span style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}> · {item.section}</span> : null}
        </h3>
        <span data-outcome={item.outcome} style={{ ...CHIP_STYLE[item.outcome], padding: '4px 10px', borderRadius: 999, fontSize: 13, fontWeight: 800 }}>
          {item.outcomeLabel}{item.credit !== null && item.outcome === REVIEW_OUTCOME.PARTIAL ? ` · ${item.credit}%` : ''}
        </span>
      </div>
      {item.prompt ? (
        <MathText as="p" style={{ margin: '8px 0 10px', color: 'var(--mm-text)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{item.prompt}</MathText>
      ) : null}
      <YourAnswer answer={item.answer} />
      {item.teacherLine ? (
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--mm-primary-text)', fontWeight: 700 }}>{item.teacherLine}</p>
      ) : null}
      <WorkedSolution item={item} />
    </li>
  );
}

export default function ReviewMyWork({ assignment, load, onClose = null }) {
  const [state, setState] = useState({ status: 'loading', result: null });
  const attempt = useRef(0);
  const assignmentId = assignment?.id || null;

  const fetchRows = useCallback(() => {
    const ticket = attempt.current + 1;
    attempt.current = ticket;
    setState({ status: 'loading', result: null });
    Promise.resolve()
      .then(() => load(assignmentId))
      .then((result) => {
        if (attempt.current === ticket) setState({ status: 'ready', result });
      })
      .catch(() => {
        if (attempt.current === ticket) setState({ status: 'error', result: null });
      });
  }, [assignmentId, load]);

  useEffect(() => {
    fetchRows();
    return () => { attempt.current += 1; };
  }, [fetchRows]);

  // Rows exist only once the server answered.
  const model = useMemo(
    () => (state.status === 'ready' ? buildReviewMyWorkModel({ result: state.result, assignment }) : null),
    [state, assignment],
  );

  return (
    <section aria-label="Review my work" style={{ marginTop: 18, textAlign: 'left', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 19, color: 'var(--mm-text-strong)' }}>Your answers and solutions</h2>
        {onClose ? <button type="button" style={buttonStyle} onClick={() => onClose()}>Close</button> : null}
      </div>

      {state.status === 'loading' && <p role="status" style={{ color: 'var(--mm-text-muted)' }}>Loading your answers…</p>}

      {state.status === 'error' && (
        <div role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--mm-surface-control)', border: '1px solid var(--mm-border-soft)' }}>
          <p style={{ margin: '0 0 10px', color: 'var(--mm-text)' }}>{LOAD_ERROR_TEXT}</p>
          <button type="button" style={buttonStyle} onClick={fetchRows}>Try again</button>
        </div>
      )}

      {model && (
        <>
          {model.excused && <p style={{ color: 'var(--mm-text-muted)' }}>This assignment is excused for you. Your answers and the solutions are here to learn from.</p>}
          {model.warmupWithheld && <p style={{ color: 'var(--mm-text-muted)' }}>Your Warm-Up review will appear here after your teacher closes the Warm-Up again.</p>}
          {model.assignmentLine && <p style={{ color: 'var(--mm-primary-text)', fontWeight: 700 }}>{model.assignmentLine}</p>}
          {model.items.length === 0 ? (
            <p style={{ color: 'var(--mm-text-muted)' }}>There are no questions to review on this assignment.</p>
          ) : (
            <ol style={{ margin: '12px 0 0', padding: 0, display: 'grid', gap: 14 }}>
              {model.items.map((item) => <ReviewQuestion key={item.key} item={item} />)}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
