import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { legacySolutionReviewContent } from '../../SolutionReview.jsx';
import SolutionReviewPanel from '../../SolutionReviewPanel.jsx';
import { buildToolSolutionReviewModel } from '../../tools/shared/toolSolutionReview.js';
import { closedQuestionHasReview } from '../../platform/supports/review/closedQuestionReview.js';
import PracticeLikeThis from '../../platform/supports/workedExample/PracticeLikeThis.jsx';
import { PRACTICE_LIKE_THIS_ROLES } from '../../platform/supports/workedExample/practiceLikeThis.js';
import { getStudentSupportPresentation } from '../../studentSupport.js';
import { toolsEntitlementFromProfile } from '../../platform/language/supportToolsEntitlement.js';
import { speechAvailable } from '../../platform/language/speechText.js';
import QuestionSupplementBoundary from '../../QuestionSupplementBoundary.jsx';
import MathText from '../common/MathText.jsx';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import {
  LOAD_ERROR_TEXT,
  REVIEW_OUTCOME,
  SOLUTION_UNAVAILABLE_TEXT,
  buildReviewMyWorkModel,
  describeReviewLoadError,
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
 * The worked solution is the same panel a closed question shows
 * (SolutionReviewPanel: authored steps, the question family's worked
 * solution, the tool's review, the legacy review), told whether the student
 * got it right, with Read aloud and Translate for a student entitled to them
 * (student pass 3, HELP-12: this screen used to show the thinnest review —
 * 95 of 180 non-tool items lost their worked steps here). Each sits inside
 * its own QuestionSupplementBoundary so one question whose review cannot
 * render leaves every other question on the page.
 *
 * A Classwork or Practice row the student did not get right also offers
 * "Try one like this": the same unscored sibling as the closed card
 * (PracticeLikeThis.jsx), never recorded anywhere.
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
  fontWeight: 800, fontSize: 'calc(15 * var(--mm-px))', cursor: 'pointer',
  border: '2px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)',
};

const AnswerText = ({ line }) => (line.math
  ? <MathText>{`$${line.text}$`}</MathText>
  : <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line.text}</span>);

function YourAnswer({ answer }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--mm-surface-sunken, var(--mm-surface-control))', border: '1px solid var(--mm-border-soft)', minWidth: 0 }}>
      <div style={{ fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)', marginBottom: 4 }}>Your answer</div>
      {answer.kind === 'fields' ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {answer.items.map((item) => (
            <li key={item.id} style={{ overflowWrap: 'anywhere' }}>
              <strong>{item.label}:</strong> <AnswerText line={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 'calc(17 * var(--mm-px))', color: answer.kind === 'none' ? 'var(--mm-text-muted)' : 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
          {answer.kind === 'none' ? answer.text : <AnswerText line={answer} />}
        </div>
      )}
    </div>
  );
}

/*
 * Read aloud and Translate beside a row's solution: the same entitlement a
 * question uses (QuestionEngine) — the student's own plan, or the universal
 * tools of a Warm-Up, Classwork or Practice row; never a DOL, quiz or test
 * row's universal tools (supportToolsEntitlement.js fails closed).
 */
const textSupportsFor = (studentProfile, role, speechReady) => {
  const presentation = (() => {
    try { return getStudentSupportPresentation(studentProfile); } catch { return {}; }
  })();
  const tools = (() => {
    try { return toolsEntitlementFromProfile(studentProfile, { activityRole: role || null, universalDesignRole: role || null }); } catch { return { tools: [] }; }
  })();
  const toolList = Array.isArray(tools?.tools) ? tools.tools : [];
  return {
    readAloud: speechReady && (presentation?.textToSpeech || toolList.includes('read-aloud')) ? { language: 'en' } : null,
    translation: toolList.includes('translate') && tools?.language ? { language: tools.language } : null,
  };
};

const WRONG_OUTCOMES = new Set([REVIEW_OUTCOME.INCORRECT, REVIEW_OUTCOME.PARTIAL]);

function WorkedSolution({ item, supports }) {
  if (!item.solutionQuestion) {
    return <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' }}>{SOLUTION_UNAVAILABLE_TEXT}</p>;
  }
  const question = item.solutionQuestion;
  const isToolQuestion = (() => {
    try { return Boolean(buildToolSolutionReviewModel(question)); } catch { return false; }
  })();
  // A question whose review has nothing to show says so, rather than an empty
  // frame (QA round 2). A question the check cannot read falls through to the
  // panel inside the boundary, whose own fallback then shows.
  const nothingToShow = (() => {
    try { return !closedQuestionHasReview({ question, isToolQuestion, legacyContent: legacySolutionReviewContent }); } catch { return false; }
  })();
  if (nothingToShow) {
    return <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' }}>{SOLUTION_UNAVAILABLE_TEXT}</p>;
  }
  const offerPractice = WRONG_OUTCOMES.has(item.outcome) && PRACTICE_LIKE_THIS_ROLES.includes(item.role);
  return (
    <QuestionSupplementBoundary
      stage="review-my-work-solution"
      context={{ questionId: question.questionId || null, executionScope: 'review-my-work' }}
      resetKey={item.key}
      fallback={<p role="status" style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' }}>The worked solution for this question could not be shown here. Your answer and grade are kept exactly as they are.</p>}
    >
      <div className="mm-review-solution" style={{ maxWidth: '100%', overflowX: 'auto' }}>
        {/* This page keeps every control at the full touch target (tests/browser/reviewMyWork.mjs);
            Read aloud and Translate are smaller beside a question's feedback. */}
        <style>{`.mm-review-solution [data-supported-text-actions] button { min-height: ${MIN_TOUCH_TARGET_PX}px !important; min-width: ${MIN_TOUCH_TARGET_PX}px; }`}</style>
        <SolutionReviewPanel
          question={question}
          isToolQuestion={isToolQuestion}
          wasCorrect={item.outcome === REVIEW_OUTCOME.CORRECT}
          readAloud={supports.readAloud}
          translation={supports.translation}
        />
        {offerPractice && (
          <PracticeLikeThis question={question} seed={item.index} readAloud={supports.readAloud} translation={supports.translation} label="Try one like this" />
        )}
      </div>
    </QuestionSupplementBoundary>
  );
}

function ReviewQuestion({ item, studentProfile = null, speechReady = false }) {
  const supports = useMemo(() => textSupportsFor(studentProfile, item.role, speechReady), [studentProfile, item.role, speechReady]);
  return (
    <li style={{ listStyle: 'none', padding: '16px', borderRadius: 14, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 'calc(17 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>
          Question {item.number}{item.section ? <span style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}> · {item.section}</span> : null}
        </h3>
        <span data-outcome={item.outcome} style={{ ...CHIP_STYLE[item.outcome], padding: '4px 10px', borderRadius: 999, fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800 }}>
          {item.outcomeLabel}{item.credit !== null && item.outcome === REVIEW_OUTCOME.PARTIAL ? ` · ${item.credit}%` : ''}
        </span>
      </div>
      {item.prompt ? (
        <MathText as="p" style={{ margin: '8px 0 10px', color: 'var(--mm-text)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{item.prompt}</MathText>
      ) : null}
      <YourAnswer answer={item.answer} />
      {item.teacherLine ? (
        <p style={{ margin: '10px 0 0', fontSize: 'calc(14 * var(--mm-px))', color: 'var(--mm-primary-text)', fontWeight: 700 }}>{item.teacherLine}</p>
      ) : null}
      <WorkedSolution item={item} supports={supports} />
    </li>
  );
}

// `teacherAnswers`: the student's questions for their teacher on this
// assignment and the answers (TeacherAnswers.jsx), shown whatever the
// solution rows below do.
export default function ReviewMyWork({ assignment, load, onClose = null, studentProfile = null, teacherAnswers = null }) {
  const [state, setState] = useState({ status: 'loading', result: null });
  const [speechReady] = useState(() => {
    try { return speechAvailable(); } catch { return false; }
  });
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
      .catch((error) => {
        if (attempt.current === ticket) setState({ status: 'error', result: null, error: describeReviewLoadError(error) });
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
        <h2 style={{ margin: 0, fontSize: 'calc(19 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>Your answers and solutions</h2>
        {onClose ? <button type="button" style={buttonStyle} onClick={() => onClose()}>Close</button> : null}
      </div>

      {teacherAnswers}

      {state.status === 'loading' && <p role="status" style={{ color: 'var(--mm-text-muted)' }}>Loading your answers…</p>}

      {/* A refusal says why in the server's words and offers no retry
          (NAV-1); only a failure to reach the server says "Try again". */}
      {state.status === 'error' && (
        <div role={state.error?.kind === 'refused' ? 'status' : 'alert'} data-review-error={state.error?.kind || 'network'} style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--mm-surface-control)', border: '1px solid var(--mm-border-soft)' }}>
          <p style={{ margin: state.error?.retry === false ? 0 : '0 0 10px', color: 'var(--mm-text)' }}>{state.error?.text || LOAD_ERROR_TEXT}</p>
          {state.error?.retry !== false && <button type="button" style={buttonStyle} onClick={fetchRows}>Try again</button>}
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
              {model.items.map((item) => <ReviewQuestion key={item.key} item={item} studentProfile={studentProfile} speechReady={speechReady} />)}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
