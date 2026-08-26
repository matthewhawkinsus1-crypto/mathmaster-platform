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
import PathSupportBar, { speechTextFor, supportPresentationStyle } from './PathSupportBar.jsx';
import { questionFromToolPayload } from '../../platform/path/pathToolResponses.js';
import { describeSkill, teksSkillId } from '../../platform/path/skillGraph.js';
import { toDisplayCode } from '../../utils/teksUtils.js';
import StandardBadge from '../common/StandardBadge.jsx';
import { FRAMEWORK_LABELS } from '../../platform/ccmr/assessmentCrosswalk.js';
import { questionAssessmentFramework } from '../../platform/student/questionAlignmentInfo.js';
import { getAssessmentStandardReferences, referenceLabel } from '../../platform/ccmr/assessmentStandardReferences.js';
import { assessmentItemTypeLabel, describeChallengeTier, frameworkExperience } from '../../platform/ccmr/assessmentFidelity.js';
import { ENTER_TO_CONTINUE_HINT, shouldAdvanceOnEnter } from '../../platform/interaction/answerEntryUx.js';
import { gradingClosesQuestion, latestAttemptCount } from '../../platform/path/pathProgression.js';

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

const WRAPPER = {
  width: '100%',
  maxWidth: 880,
  minWidth: 0,
  margin: '0 auto',
  padding: '14px 14px 44px',
  boxSizing: 'border-box',
  overflowX: 'clip',
};

// A tool needs the room. 880px is right for a prompt and an answer box, but a
// coordinate plane shares that width with a panel of point tasks, and the plane
// ends up too small to aim at. Reading text still wraps at a comfortable
// measure inside the tool's own shell.
const TOOL_WRAPPER = { ...WRAPPER, maxWidth: 1180 };

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
function SessionHeader({ session, questionInstance, attemptsLeft, attemptsAllowed, assessmentFramework = null, weeklyGoalRequired = null, onExit = null }) {
  const total = Number(session?.requiredQuestions) || 5;
  const done = Number(session?.summary?.completedQuestions) || 0;
  const current = Math.min(total, done + 1);
  const isRetention = session?.sessionKind === 'retentionProbe';
  // The standard THIS question is on, not the standard the session started on:
  // the routing engine can descend into a prerequisite mid-session, and when it
  // does, the badge has to follow the student.
  const questionCode = toDisplayCode(
    questionInstance?.teksCode
    || questionInstance?.alignmentKey
    || session?.currentSkillCode
    || session?.target?.alignmentKey
    || '',
  );
  const authoredAssessment = questionAssessmentFramework(questionInstance || {});
  const bridgeFramework = questionInstance?.assessmentBridgeFramework || null;
  // New issued questions carry their own assessmentContext. The fallback keeps
  // an already-open pre-deploy CCMR session labelled correctly without ever
  // overriding an explicit course foundation bridge.
  const directFramework = authoredAssessment.examStyle
    ? authoredAssessment.framework
    : (!bridgeFramework && assessmentFramework && !questionInstance?.assessmentContext ? assessmentFramework : null);
  const challengeTier = Number(questionInstance?.ccmrChallengeTier || session?.ccmrChallengeTier || 1);
  const challenge = describeChallengeTier(challengeTier, directFramework);
  const experience = directFramework ? frameworkExperience(directFramework) : null;
  const assessmentReferences = directFramework && questionCode
    ? getAssessmentStandardReferences(teksSkillId(questionCode), directFramework)
    : [];
  const primaryAssessmentReference = assessmentReferences[0] || null;

  return (
    <header style={{ marginBottom: 12 }}>
      {/* AN ACTIVE SESSION HAD NO EXIT AT ALL.
          Not a broken one — none. A student part-way through who needed to stop
          had the browser back button or a reload, which is exactly the "no state
          should require browser refresh" case. Progress is held server-side and
          the session resumes from its lock, so leaving costs nothing; the
          wording says so, because a student who fears losing their work will sit
          on a question rather than go and ask for help. */}
      {onExit && (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            onClick={onExit}
            style={{
              appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
              minHeight: 44, padding: '8px 2px', border: 0, background: 'transparent',
              color: '#174ea6', fontWeight: 800, fontSize: 13.5, cursor: 'pointer',
            }}
          >
            ← Back to My Math Path
          </button>
          <span style={{ display: 'block', color: '#5f6368', fontSize: 11.5, lineHeight: 1.45 }}>
            Your work so far is saved. You can pick this session up again.
          </span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ color: '#174ea6', fontSize: 16 }}>
          {isRetention ? 'Quick retention check' : skillNameFor(questionInstance, session)}
        </strong>
        <span style={{ color: '#5f6368', fontSize: 13 }}>
          Question {current} of {total}
          {attemptsAllowed > 1 && attemptsLeft > 0 ? ` · ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left` : ''}
        </span>
      </div>
      {session?.weeklySlotKey && (
        <div role="status" style={{ marginTop: 8, padding: '9px 11px', borderRadius: 9, background: '#e6f4ea', border: '1px solid #b7e0c4', color: '#12633a', fontSize: 12.5, fontWeight: 850, lineHeight: 1.45 }}>
          WEEKLY PATH · Session {session?.weeklySlot || '?'}{weeklyGoalRequired ? ` of ${weeklyGoalRequired}` : ''} · Completing this session counts toward your weekly target.
        </div>
      )}
      {directFramework && !bridgeFramework && (
        <div
          role="status"
          style={{
            margin: '9px 0 0', padding: '11px 13px', borderRadius: 11,
            background: challengeTier >= 2 ? '#f3ecfd' : '#e8f0fe',
            border: `2px solid ${challengeTier >= 2 ? '#7e57c2' : '#1a73e8'}`,
            color: '#202124', lineHeight: 1.45,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong style={{ color: challengeTier >= 2 ? '#5b21b6' : '#174ea6', fontSize: 13, letterSpacing: 0.35 }}>
              {experience?.shortLabel || FRAMEWORK_LABELS[directFramework] || directFramework} · {challenge.shortLabel}
            </strong>
            <span style={{ color: '#5f6368', fontSize: 11.5, fontWeight: 800 }}>
              {assessmentItemTypeLabel(questionInstance || {})}
            </span>
          </div>
          {primaryAssessmentReference && (
            <div style={{ marginTop: 4, color: '#5b21b6', fontWeight: 850, fontSize: 12 }}>
              {referenceLabel(primaryAssessmentReference)}
            </div>
          )}
          <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', color: '#5f6368', fontSize: 11.5 }}>
            <span>{experience?.calculatorSummary || (questionInstance?.calculatorPolicy === 'none' ? 'No calculator' : 'Calculator policy follows the assessment')}</span>
            <span>{challenge.label}</span>
          </div>
          {challengeTier >= 2 && (
            <div style={{ marginTop: 5, color: '#5b21b6', fontSize: 11.5, fontWeight: 750 }}>
              {challenge.explanation}
            </div>
          )}
        </div>
      )}
      {bridgeFramework && (
        <p role="status" style={{ margin: '6px 0 0', padding: '7px 10px', width: 'fit-content', maxWidth: '100%', borderRadius: 8, background: '#fef7e0', border: '1px solid #f0d489', color: '#7a4f00', fontSize: 12.5, fontWeight: 800, lineHeight: 1.45 }}>
          Foundation bridge for {FRAMEWORK_LABELS[bridgeFramework] || bridgeFramework} practice · strengthen this math first, then return to exam-format questions.
        </p>
      )}
      {questionCode && (
        <StandardBadge code={questionCode} framework={directFramework} domainId={questionInstance?.assessmentContext?.domainId || null} examStyle={Boolean(directFramework)} style={{ marginTop: 7 }} />
      )}
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
  isAdvancing = false,
  continueLabel = 'Next question',
  assessmentFramework = null,
  weeklyGoalRequired = null,
  studentProfile,
  onSubmitAnswer,
  onContinue = null,
  // One logical level up: My Math Path, never Home. Null in the teacher
  // simulator, which has its own frame around this.
  onExit = null,
}) => {
  const [responsesByQuestion, setResponsesByQuestion] = useState({});
  const [calculatorUsed, setCalculatorUsed] = useState(false);
  const [contextScaffoldUsed, setContextScaffoldUsed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  // What the support bar actually rendered and what the student pressed. The
  // server intersects both with the authorized set before believing them.
  const [supportDelivery, setSupportDelivery] = useState({ presented: [], used: [] });
  const feedbackRef = useRef(null);
  const workspaceRef = useRef(null);

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

  // Which authorized supports apply to THIS question. Decided by the server at
  // issue time — the browser does not read a profile and decide for itself
  // what it is allowed to offer.
  const applicableSupports = useMemo(
    () => (Array.isArray(questionInstance?.applicableSupports) ? questionInstance.applicableSupports : []),
    [questionInstance],
  );

  // Everything a student would need read to them, in the order they meet it.
  // Deliberately excludes anything the server holds back — a read-aloud button
  // must never become a way to hear the answer.
  const speechText = useMemo(() => {
    if (!questionInstance) return '';
    const parts = [
      questionInstance.context?.scenario,
      questionInstance.prompt,
      questionInstance.formulaLatex,
      ...(questionInstance.choices || []).map((choice, index) => `Option ${index + 1}. ${choice?.label ?? ''}`),
      ...(questionInstance.responseFields || []).map((field) => field?.label),
    ];
    return speechTextFor(parts.filter(Boolean).join('. '));
  }, [questionInstance]);

  const presentationStyle = useMemo(
    () => supportPresentationStyle(supportDelivery.presented),
    [supportDelivery.presented],
  );

  // Path pages must never pan sideways. MathLive, native numeric fields and
  // SVG keyboard interaction can all ask Chromium to reveal a focused caret.
  // When browser zoom/device scaling makes a wide tool barely exceed the visual
  // viewport, Chromium may satisfy that request by changing document scrollX.
  // Preserve vertical scrolling, but force the document's horizontal origin
  // back to zero for the entire Path question.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    let frame = 0;

    let trailingTimer = 0;

    const restoreHorizontalOrigin = () => {
      frame = 0;
      const top = Number(window.scrollY || window.pageYOffset || 0);

      // Reset the page AND any horizontally-scrollable ancestor Chromium chose
      // while trying to reveal the MathLive caret.
      let node = workspaceRef.current;
      while (node) {
        if (Number(node.scrollLeft || 0) !== 0) node.scrollLeft = 0;
        node = node.parentElement;
      }

      if (Number(window.scrollX || window.pageXOffset || 0) !== 0) window.scrollTo(0, top);
      if (document.documentElement) document.documentElement.scrollLeft = 0;
      if (document.body) document.body.scrollLeft = 0;
    };

    const scheduleRestore = () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (trailingTimer) window.clearTimeout(trailingTimer);

      // MathLive and Chromium can schedule their own reveal AFTER the keydown
      // handler. Reset once on the next paint and once after that work settles.
      frame = window.requestAnimationFrame(() => {
        restoreHorizontalOrigin();
        window.requestAnimationFrame(restoreHorizontalOrigin);
      });
      trailingTimer = window.setTimeout(restoreHorizontalOrigin, 40);
    };

    const root = workspaceRef.current;
    root?.addEventListener('focusin', scheduleRestore, true);
    root?.addEventListener('keydown', scheduleRestore, true);
    root?.addEventListener('input', scheduleRestore, true);
    document.addEventListener('scroll', scheduleRestore, true);
    window.addEventListener('scroll', scheduleRestore, { passive: true });
    window.visualViewport?.addEventListener?.('scroll', scheduleRestore, { passive: true });
    scheduleRestore();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (trailingTimer) window.clearTimeout(trailingTimer);
      root?.removeEventListener('focusin', scheduleRestore, true);
      root?.removeEventListener('keydown', scheduleRestore, true);
      root?.removeEventListener('input', scheduleRestore, true);
      document.removeEventListener('scroll', scheduleRestore, true);
      window.removeEventListener('scroll', scheduleRestore);
      window.visualViewport?.removeEventListener?.('scroll', scheduleRestore);
    };
  }, [instanceId]);

  // Move the reader to the response when it changes. Chromebook screens are
  // short, and a student who submitted at the bottom of the card should not
  // have to hunt for what the platform said back.
  useEffect(() => {
    if (lastFeedback || lastGradingResult) feedbackRef.current?.focus?.();
  }, [lastFeedback, lastGradingResult]);

  // Once a response is correct, Enter becomes the same deliberate continue
  // action as the visible Next question button. A window listener is used here
  // because locking the answer can move focus away from the disabled field.
  // This only activates after correctness is confirmed; wrong/finalized work
  // still requires the student to review the on-screen next step.
  useEffect(() => {
    const canAdvance = Boolean(gradingClosesQuestion(lastGradingResult) && typeof onContinue === 'function' && !isAdvancing);
    if (!canAdvance || typeof window === 'undefined') return undefined;
    const handleContinueShortcut = (event) => {
      if (!shouldAdvanceOnEnter({ event, canAdvance })) return;
      event.preventDefault();
      event.stopPropagation();
      onContinue();
    };
    window.addEventListener('keydown', handleContinueShortcut, true);
    return () => window.removeEventListener('keydown', handleContinueShortcut, true);
  }, [lastGradingResult, onContinue, isAdvancing]);

  if (!questionInstance) {
    return <div style={{ padding: 50, textAlign: 'center', color: '#5f6368' }}>Preparing the next question…</div>;
  }

  const attemptsUsed = latestAttemptCount(questionInstance, lastGradingResult);
  const attemptsAllowed = Number(questionInstance.attemptsAllowed) || activityPolicy.attempts || 3;
  const attemptsLeft = Math.max(0, attemptsAllowed - attemptsUsed);
  const finalized = gradingClosesQuestion(lastGradingResult);

  // A secure payload wins over a canonical one: if the server built a tool
  // payload it also kept the grading definition, and the verdict is its own.
  const canonical = secureQuestion || questionInstance.canonicalQuestion || null;
  if (canonical) {
    return (
      <main ref={workspaceRef} style={TOOL_WRAPPER}>
        <SessionHeader
          session={session}
          questionInstance={questionInstance}
          attemptsLeft={attemptsLeft}
          attemptsAllowed={attemptsAllowed}
          assessmentFramework={assessmentFramework}
          weeklyGoalRequired={weeklyGoalRequired}
          onExit={onExit}
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
          showStandardBadge={false}
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
        {onContinue && (
          <ContinueAction onContinue={onContinue} pending={isAdvancing} label={continueLabel} />
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
        // ACCESS accommodations. Sent as what actually rendered and what the
        // student actually pressed — not as a copy of their profile. The
        // server intersects both with the authorized set, so this can only
        // ever narrow what gets recorded, never widen it.
        supportsPresented: supportDelivery.presented,
        supportsUsed: supportDelivery.used,
      },
    );
  };

  const feedbackTone = lastGradingResult?.isCorrect
    ? { background: '#e6f4ea', color: '#137333' }
    : finalized
      ? { background: '#f1f3f4', color: '#3c4043' }
      : { background: '#fff4ce', color: '#7a4f00' };

  return (
    <main ref={workspaceRef} style={WRAPPER}>
      <SessionHeader
        session={session}
        questionInstance={questionInstance}
        attemptsLeft={attemptsLeft}
        attemptsAllowed={attemptsAllowed}
        assessmentFramework={assessmentFramework}
        weeklyGoalRequired={weeklyGoalRequired}
        onExit={onExit}
      />
      <DecisionBanner notice={routeNotice} />

      <section style={{ ...CARD, ...presentationStyle }}>
        <PathSupportBar
          applicableSupports={applicableSupports}
          speechText={speechText}
          questionInstanceId={instanceId}
          onDelivery={setSupportDelivery}
          disabled={isSubmitting}
        />

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

        {/* STICKY ON A SHORT SCREEN.
            A school Chromebook at 1366x768 leaves roughly 600px of page once
            the browser chrome is accounted for. Prompt, stimulus, response
            fields, hint panel and feedback all live above this button, so on a
            longer question the student had to scroll down to submit and back up
            to read the response. The action follows them instead.
            `position: sticky` degrades to normal flow wherever it is not
            supported, so nothing is lost on an older browser. */}
        {!finalized && (
          <button
            type="button"
            onClick={submit}
            disabled={!complete || isSubmitting}
            style={{
              position: 'sticky',
              bottom: 10,
              zIndex: 2,
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
              boxShadow: '0 -2px 12px rgba(255,255,255,.9)',
              cursor: !complete || isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? 'Checking…' : 'Check my answer'}
          </button>
        )}
      </section>

      <PathSolutionReview review={solutionReview} wasCorrect={Boolean(lastGradingResult?.isCorrect)} />

      {finalized && onContinue && (
        <ContinueAction onContinue={onContinue} pending={isAdvancing} label={continueLabel} />
      )}

      <CalculatorPanel policy={calculatorPolicy} onCalculatorOpened={() => setCalculatorUsed(true)} />
    </main>
  );
};

const ContinueAction = ({ onContinue, pending = false, label = 'Next question' }) => (
  <div style={{ marginTop: 16 }}>
    <button
      type="button"
      onClick={onContinue}
      disabled={pending}
      aria-keyshortcuts="Enter"
      aria-busy={pending ? 'true' : undefined}
      style={{
        ...continueButtonStyle,
        marginTop: 0,
        opacity: pending ? 0.7 : 1,
        cursor: pending ? 'wait' : 'pointer',
      }}
    >
      {pending ? 'Loading next question…' : label}
    </button>
    <p style={{ margin: '7px 0 0', textAlign: 'center', color: '#5f6368', fontSize: 12.5, fontWeight: 750 }}>
      {ENTER_TO_CONTINUE_HINT}
    </p>
  </div>
);

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
