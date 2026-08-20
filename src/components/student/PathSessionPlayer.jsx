import React, { useEffect, useMemo, useRef, useState } from 'react';
import CalculatorPanel from '../CalculatorPanel.jsx';
import ProblemUnderstandingPanel from '../ProblemUnderstandingPanel.jsx';
import QuestionEngine from '../../QuestionEngine.jsx';
import QuestionPrompt from '../../QuestionPrompt.jsx';
import MathText from '../common/MathText.jsx';
import PathResponseFields, { pathResponseComplete } from './PathResponseFields.jsx';
import PathQuestionStimulus from './PathQuestionStimulus.jsx';
import PathSolutionReview from './PathSolutionReview.jsx';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies.js';
import { resolveCalculatorPolicy } from '../../platform/policies/calculatorPolicy.js';
import { questionFromToolPayload } from '../../platform/path/pathToolResponses.js';
import { describeSkill, teksSkillId } from '../../platform/path/skillGraph.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

// Three ways a path question can arrive, in order of preference.
//
// SECURE TOOL — the instance carries `pathToolId` and a `tool` payload built by
// the Path Tool Contract. The real MathMaster tool renders from it, and the
// verdict comes back from the server: a systems question is the systems
// workspace, a graphing question is the graphing tool, a relation question is
// the mapping diagram, and none of them holds the answer.
//
// CANONICAL — the instance carries a whole authored question. The simulator
// still uses this for questions whose tool has no contract yet, and grading
// there is local by construction.
//
// SECURE GENERIC — `responseFields`, `choices` and `stimulus`. This is what a
// bank question issues when the mathematics does not need a full tool, and it
// is a real interaction now rather than a row of text boxes: choices are
// choices, an interval is typed with an interval pad, and the material the
// student reads sits in the same card as the answer they are giving.
//
// The distinction is the payload's, not a setting.

const WRAPPER = { maxWidth: 880, margin: '0 auto', padding: '14px 14px 44px' };

const CARD = {
  padding: '18px 18px 20px',
  border: '1px solid #dadce0',
  borderRadius: 14,
  background: '#fff',
  textAlign: 'left',
  boxShadow: '0 3px 14px rgba(0,0,0,.05)',
};

const DECISION_TONE = {
  support: { background: '#fef7e0', color: '#7a4f00', border: '#f0d489' },
  return: { background: '#e8f0fe', color: '#174ea6', border: '#c0d5f5' },
  challenge: { background: '#f3ecfd', color: '#5b21b6', border: '#d9c9f7' },
  retention: { background: '#e6f4ea', color: '#137333', border: '#b7e0c4' },
  teacher: { background: '#fce8e6', color: '#a50e0e', border: '#f2bcb8' },
};

/** The skill a student is working on, named the way a student names it. */
const skillNameFor = (questionInstance, session) => {
  const code = toDisplayCode(
    questionInstance?.teksCode
    || questionInstance?.alignmentKey
    || session?.currentSkillCode
    || session?.target?.alignmentKey
    || '',
  );
  if (!code) return 'My Math Path';
  const described = describeSkill(teksSkillId(code));
  return described.studentLabel || 'My Math Path';
};

/**
 * The session banner.
 *
 * Says what the student is working on, how far through they are, and how many
 * tries are left on THIS question. Deliberately no score: a running percentage
 * on a practice session turns every question into a grade, which is the
 * opposite of what practice is for.
 */
function SessionHeader({ session, questionInstance, attemptsLeft, attemptsAllowed }) {
  const total = Number(session?.requiredQuestions) || 5;
  const done = Number(session?.summary?.completedQuestions) || 0;
  const current = Math.min(total, done + 1);
  const isRetention = session?.sessionKind === 'retentionProbe';

  return (
    <header style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ color: '#174ea6', fontSize: 16 }}>
          {isRetention ? 'Quick retention check' : skillNameFor(questionInstance, session)}
        </strong>
        <span style={{ color: '#5f6368', fontSize: 13 }}>
          Question {current} of {total}
          {attemptsAllowed > 1 && attemptsLeft > 0 ? ` · ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left` : ''}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Progress through this session"
        style={{ display: 'flex', gap: 4, marginTop: 8 }}
      >
        {Array.from({ length: total }, (unused, index) => (
          <span
            key={index}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: index < done ? '#1a73e8' : index === done ? '#a8c7fa' : '#e3e6ea',
            }}
          />
        ))}
      </div>
    </header>
  );
}

/** Why the path just changed direction, in the student's own terms. */
function DecisionBanner({ notice }) {
  if (!notice?.message) return null;
  const tone = DECISION_TONE[notice.tone] || DECISION_TONE.return;
  return (
    <div
      role="status"
      style={{
        margin: '0 0 12px',
        padding: '10px 13px',
        borderRadius: 10,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        color: tone.color,
        fontSize: 13.5,
        lineHeight: 1.55,
      }}
    >
      {notice.headline && <strong style={{ display: 'block', marginBottom: 2 }}>{notice.headline}</strong>}
      {notice.message}
    </div>
  );
}

export const PathSessionPlayer = ({
  session,
  questionInstance,
  lastGradingResult,
  lastFeedback = null,
  lastSupport = null,
  solutionReview = null,
  routeNotice = null,
  isSubmitting,
  studentProfile,
  onSubmitAnswer,
  onContinue = null,
}) => {
  const [responsesByQuestion, setResponsesByQuestion] = useState({});
  const [calculatorUsed, setCalculatorUsed] = useState(false);
  const [contextScaffoldUsed, setContextScaffoldUsed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const feedbackRef = useRef(null);

  const instanceId = questionInstance?.questionInstanceId || '';
  const activityRole = questionInstance?.activityRole || 'practice';
  const activityPolicy = getEffectiveActivityPolicy(activityRole);
  const calculatorPolicy = useMemo(() => resolveCalculatorPolicy({
    questionSpec: questionInstance || {},
    activityPolicy,
    studentSupportProfile: studentProfile,
  }), [questionInstance, activityPolicy, studentProfile]);

  // Keyed on the question instance, not on the payload object: the container
  // replaces `questionInstance` after every attempt to update the attempt
  // count, and rebuilding the question object each time would reset the tool
  // and throw away the student's work between attempts.
  const secureQuestion = useMemo(
    () => questionFromToolPayload(questionInstance),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionInstance?.questionInstanceId, questionInstance?.pathToolId],
  );

  // A new question closes the hint panel; a second attempt on the SAME question
  // does not, because the student is still using it.
  useEffect(() => { setHintOpen(false); }, [instanceId]);

  // Move the reader to the response when it changes. Chromebook screens are
  // short, and a student who submitted at the bottom of the card should not
  // have to hunt for what the platform said back.
  useEffect(() => {
    if (lastFeedback || lastGradingResult) feedbackRef.current?.focus?.();
  }, [lastFeedback, lastGradingResult]);

  if (!questionInstance) {
    return <div style={{ padding: 50, textAlign: 'center', color: '#5f6368' }}>Preparing the next question…</div>;
  }

  const attemptsUsed = Number(questionInstance.attemptsUsed ?? lastGradingResult?.attemptNumber) || 0;
  const attemptsAllowed = Number(questionInstance.attemptsAllowed) || activityPolicy.attempts || 3;
  const attemptsLeft = Math.max(0, attemptsAllowed - attemptsUsed);

  // A secure payload wins over a canonical one: if the server built a tool
  // payload it also kept the grading definition, and the verdict is its own.
  const canonical = secureQuestion || questionInstance.canonicalQuestion || null;
  if (canonical) {
    return (
      <main style={WRAPPER}>
        <SessionHeader
          session={session}
          questionInstance={questionInstance}
          attemptsLeft={attemptsLeft}
          attemptsAllowed={attemptsAllowed}
        />
        <DecisionBanner notice={routeNotice} />

        <QuestionEngine
          question={canonical}
          // The session owns the attempt count, so the renderer is told where
          // the student actually is. Passing null gave the student unlimited
          // attempts on screen while the session finalized underneath them.
          questionRecord={{
            status: questionInstance.attemptsUsed > 0 ? 'attempted' : 'unattempted',
            attemptCount: questionInstance.attemptsUsed || 0,
          }}
          studentProfile={studentProfile}
          maximumAttempts={questionInstance.attemptsAllowed}
          activityRole={questionInstance.activityRole || 'practice'}
          draftKey={`path-${questionInstance.questionInstanceId}`}
          // With a secure payload the engine collects raw work and the server
          // decides; `onGrade` is not used at all on that route.
          serverGrading={secureQuestion ? {
            pathToolId: questionInstance.pathToolId,
            submit: async (rawWork, supportUsage, meta) => onSubmitAnswer?.(
              { raw: rawWork, responseKey: meta?.responseKey || '' },
              { ...supportUsage, calculatorUsed: supportUsage?.calculatorUsed ?? calculatorUsed },
            ),
          } : null}
          onGrade={async (isCorrect, questionDetails, parts, supportUsage) => {
            // Everything the engine observed about assistance travels with the
            // result, so the player never has to assert that a student worked
            // independently.
            await onSubmitAnswer?.(
              { responses: parts, questionDetails },
              { ...supportUsage, calculatorUsed: supportUsage?.calculatorUsed ?? calculatorUsed },
              { isCorrect },
            );
            return null;
          }}
        />

        <PathSolutionReview review={solutionReview} wasCorrect={Boolean(lastGradingResult?.isCorrect)} />
        {solutionReview && onContinue && (
          <button type="button" onClick={onContinue} style={continueButtonStyle}>Next question</button>
        )}
      </main>
    );
  }

  // --- The secure generic renderer ---------------------------------------------

  const fields = questionInstance.responseFields?.length
    ? questionInstance.responseFields
    : [{ id: 'answer', label: 'Answer', inputProfile: questionInstance.choices?.length ? 'choice' : 'text' }];
  const values = responsesByQuestion[instanceId] || {};
  const complete = pathResponseComplete(fields, values);
  const finalized = Boolean(lastGradingResult?.questionFinalized);

  const setFieldValue = (fieldId, value) => {
    setResponsesByQuestion((current) => ({
      ...current,
      // Keyed by question instance, so a second attempt opens with the work the
      // student already did rather than an empty box.
      [instanceId]: { ...(current[instanceId] || {}), [fieldId]: value },
    }));
  };

  const submit = async () => {
    if (!complete || isSubmitting || finalized) return;
    await onSubmitAnswer?.(
      { responses: values },
      {
        calculatorUsed,
        contextScaffoldUsed,
        // A conceptual hint the student opened is mathematical help, and it
        // travels so mastery evidence records that this success was supported.
        hintUsed: hintOpen && Boolean(lastSupport?.hint),
        teacherAssisted: false,
        scaffoldUsed: contextScaffoldUsed,
        remediationUsed: false,
        workedExampleUsed: false,
        isMathematicallyIndependent: !contextScaffoldUsed && !(hintOpen && Boolean(lastSupport?.hint)),
      },
    );
  };

  const feedbackTone = lastGradingResult?.isCorrect
    ? { background: '#e6f4ea', color: '#137333' }
    : finalized
      ? { background: '#f1f3f4', color: '#3c4043' }
      : { background: '#fff4ce', color: '#7a4f00' };

  return (
    <main style={WRAPPER}>
      <SessionHeader
        session={session}
        questionInstance={questionInstance}
        attemptsLeft={attemptsLeft}
        attemptsAllowed={attemptsAllowed}
      />
      <DecisionBanner notice={routeNotice} />

      <section style={CARD}>
        {questionInstance.isDevelopmentSandbox && (
          <p style={{ margin: '0 0 12px', padding: '8px 11px', borderRadius: 8, background: '#fce8e6', color: '#a50e0e', fontSize: 12, fontWeight: 800 }}>
            Developer sandbox — this is not authored MathMaster content.
          </p>
        )}

        {questionInstance.context?.scenario && (
          <ProblemUnderstandingPanel context={questionInstance.context} onScaffoldComplete={() => setContextScaffoldUsed(true)} />
        )}

        <QuestionPrompt variant="task">{questionInstance.prompt}</QuestionPrompt>

        {questionInstance.formulaLatex && (
          <MathText as="div" style={{ margin: '0 0 14px', fontSize: 19, textAlign: 'center' }}>
            {`$${questionInstance.formulaLatex}$`}
          </MathText>
        )}

        <PathQuestionStimulus stimulus={questionInstance.stimulus} />

        <PathResponseFields
          fields={fields}
          questionChoices={questionInstance.choices || []}
          values={values}
          onChangeField={setFieldValue}
          onSubmit={submit}
          disabled={isSubmitting || finalized}
        />

        {/* The conceptual hint, released by the server on the second miss and
            never before. It is opened deliberately, and opening it is recorded. */}
        {lastSupport?.hint && !finalized && (
          <div style={{ marginTop: 14 }}>
            {hintOpen ? (
              <div style={{ padding: '11px 13px', borderRadius: 9, background: '#f4f8ff', border: '1px solid #c5d5ef', color: '#174ea6', fontSize: 14, lineHeight: 1.6 }}>
                <strong style={{ display: 'block', marginBottom: 3 }}>Something to think about</strong>
                <MathText>{lastSupport.hint}</MathText>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHintOpen(true)}
                style={{ minHeight: 40, padding: '0 14px', border: '1px solid #c5d5ef', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 800, cursor: 'pointer' }}
              >
                Show me something to think about
              </button>
            )}
          </div>
        )}

        {(lastFeedback || lastGradingResult) && (
          <div
            ref={feedbackRef}
            tabIndex={-1}
            aria-live="polite"
            style={{ marginTop: 16, padding: '12px 14px', borderRadius: 9, fontSize: 14.5, lineHeight: 1.6, ...feedbackTone }}
          >
            <MathText>
              {lastFeedback?.message
                || (lastGradingResult?.isCorrect
                  ? 'Correct.'
                  : finalized ? 'Recorded. Moving forward.' : 'Not yet. Try again.')}
            </MathText>
          </div>
        )}

        {!finalized && (
          <button
            type="button"
            onClick={submit}
            disabled={!complete || isSubmitting}
            style={{
              width: '100%',
              marginTop: 18,
              minHeight: 48,
              padding: '12px 16px',
              border: 0,
              borderRadius: 9,
              background: !complete || isSubmitting ? '#dadce0' : '#1a73e8',
              color: '#fff',
              fontSize: 16,
              fontWeight: 900,
              cursor: !complete || isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? 'Checking…' : 'Check my answer'}
          </button>
        )}
      </section>

      <PathSolutionReview review={solutionReview} wasCorrect={Boolean(lastGradingResult?.isCorrect)} />

      {finalized && onContinue && (
        <button type="button" onClick={onContinue} style={continueButtonStyle}>Next question</button>
      )}

      <CalculatorPanel policy={calculatorPolicy} onCalculatorOpened={() => setCalculatorUsed(true)} />
    </main>
  );
};

const continueButtonStyle = {
  width: '100%',
  marginTop: 16,
  minHeight: 48,
  padding: '12px 16px',
  border: 0,
  borderRadius: 9,
  background: '#1a73e8',
  color: '#fff',
  fontSize: 16,
  fontWeight: 900,
  cursor: 'pointer',
};

export default PathSessionPlayer;
