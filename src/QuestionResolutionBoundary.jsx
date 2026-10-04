import { Component, useEffect } from 'react';
import RecoveryPanel from './components/common/RecoveryPanel.jsx';
import { isChunkLoadError, recentlyReloadedForChunk, reloadForCurrentBuild } from './platform/runtime/chunkLoadRecovery.js';
import { recordClientDiagnostic } from './platform/runtime/clientDiagnostics.js';
import {
  QUESTION_RESOLUTION_FAILURE,
  QUESTION_RESOLUTION_RECOVERY,
} from './platform/generation/familyPinReplay.js';

/*
 * ONE QUESTION THAT CANNOT BE PREPARED MUST NOT TAKE THE ASSIGNMENT WITH IT.
 *
 * QuestionModuleBoundary (PR #426) contains a response module that throws
 * while rendering. Everything QuestionEngine does BEFORE that module — the
 * runtime repair, resolving a Question Family instance from its delivery pin,
 * the word-problem layer, and every memo derived from the result — ran above
 * it, so a throw there reached AppErrorBoundary and replaced the whole app.
 * This boundary sits around the entire engine body:
 *
 *   question resolution → family pin replay → generated instance → module
 *
 * Two kinds of failure end up here:
 *
 *   - a CLASSIFIED failure the generator reported as a `platformQuestionError`
 *     (QuestionResolutionFailure below), with a recovery chosen in
 *     src/platform/generation/familyPinReplay.js: retry, load the current
 *     build, or wait for a teacher's repair. An authoritative pin that cannot
 *     replay is never swapped for a different question;
 *   - anything that THREW (the class below). Preparing a question is pure, so
 *     preparing it again is always safe: the student is offered Try again.
 *
 * Either way the student keeps the assignment: navigation lives outside this
 * boundary, and the panel offers the next question when the host has one.
 * Nothing here submits, grades, spends an attempt, or touches saved work. The
 * diagnostic names the slot (assignment, question, family, version, pin kind,
 * classification) and never the student; no stack is shown or stored.
 */

const TEACHER_SCOPES = new Set(['teacherPreview', 'teacherRepairPreview']);

const describeContext = (context = {}) => [
  context.assignmentId || 'none',
  context.questionId || 'none',
  `family=${context.familyId || 'none'}${context.familyVersion ? `@v${context.familyVersion}` : ''}`,
  `role=${context.activityRole || 'none'}`,
  `scope=${context.executionScope || 'none'}`,
].join(' ');

const describeFailure = (failure = {}) => {
  const diagnostics = failure.diagnostics || {};
  return [
    failure.classification || 'unclassified',
    `recovery=${failure.recovery || 'none'}`,
    diagnostics.pinKind ? `pin=${diagnostics.pinKind}` : '',
    diagnostics.pinFamilyId ? `pinFamily=${diagnostics.pinFamilyId}@v${diagnostics.pinFamilyVersion ?? '?'}` : '',
    diagnostics.pinFingerprint ? `pinRef=${diagnostics.pinFingerprint}` : '',
    diagnostics.detail ? `detail=${diagnostics.detail}` : '',
  ].filter(Boolean).join(' ');
};

const recordedSignatures = new Set();

/** Record a question-level failure once per slot and classification. */
export const recordQuestionResolutionDiagnostic = ({ kind, context = {}, failure = {} }) => {
  const signature = `${kind}|${describeContext(context)}|${describeFailure(failure)}`;
  if (recordedSignatures.has(signature)) return;
  recordedSignatures.add(signature);
  console.warn('Question could not be prepared:', { ...context, classification: failure.classification, recovery: failure.recovery });
  recordClientDiagnostic({
    kind,
    message: `${describeContext(context)} ${describeFailure(failure)}`,
    source: 'question-resolution',
  });
};

const nextButton = (onNextQuestion, nextQuestionLabel) => (
  typeof onNextQuestion === 'function'
    ? { secondaryLabel: nextQuestionLabel ? `Go to ${nextQuestionLabel}` : 'Go to the next question', onSecondary: () => onNextQuestion() }
    : {}
);

/*
 * THE STUDENT'S VIEW OF A CLASSIFIED FAILURE.
 *
 * Plain words, a next step, and the classification folded under "Technical
 * details" (shown outright to a teacher previewing). Never a stack, an answer,
 * a generated value or a seat.
 */
export function QuestionResolutionFailure({
  failure = {},
  context = {},
  executionScope = 'student',
  onRetry = null,
  onNextQuestion = null,
  nextQuestionLabel = '',
  hasRecordedWork = false,
}) {
  const recovery = failure?.recovery || QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR;
  const signatureContext = { ...context, executionScope };
  const signature = `${describeContext(signatureContext)}|${describeFailure(failure)}`;
  useEffect(() => {
    recordQuestionResolutionDiagnostic({ kind: 'question-resolution-failure', context: signatureContext, failure });
    // Once per distinct failure, not once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const teacherView = TEACHER_SCOPES.has(executionScope);
  const technicalMessage = `${failure?.classification || 'unclassified'} · ${describeContext(signatureContext)}`;
  const savedWork = hasRecordedWork
    ? 'Your recorded answers, attempts and grade for this question are kept exactly as they are.'
    : 'Nothing you did caused this, and your grade is not affected.';
  const next = nextButton(onNextQuestion, nextQuestionLabel);
  // A reload that already happened and did not help is offered as a retry:
  // reloading again in a loop would strand the student on a spinner.
  const reloadSpent = recovery === QUESTION_RESOLUTION_RECOVERY.RELOAD && recentlyReloadedForChunk();
  const effectiveRecovery = reloadSpent ? QUESTION_RESOLUTION_RECOVERY.RETRY : recovery;

  let panel;
  if (effectiveRecovery === QUESTION_RESOLUTION_RECOVERY.RELOAD) {
    panel = {
      tone: 'updated',
      title: 'MathMaster was just updated',
      primaryLabel: 'Load the new version',
      onPrimary: () => reloadForCurrentBuild(),
      body: `This question needs the newest version of MathMaster. Loading it brings you right back here. ${savedWork}`,
    };
  } else if (effectiveRecovery === QUESTION_RESOLUTION_RECOVERY.RETRY && typeof onRetry === 'function') {
    panel = {
      tone: 'error',
      title: 'This question did not load',
      primaryLabel: 'Try again',
      onPrimary: () => onRetry(),
      body: `Try again. If it still does not load, continue with the other questions and let your teacher know. ${savedWork}`,
    };
  } else if (effectiveRecovery === QUESTION_RESOLUTION_RECOVERY.LEGACY_UNSUPPORTED) {
    panel = {
      tone: 'error',
      title: 'This question needs your teacher',
      body: `This question was saved in an older format that this version of MathMaster cannot open, so it is not showing you a different question in its place. ${savedWork} You can keep working on the other questions.`,
    };
  } else {
    panel = {
      tone: 'error',
      title: 'This question needs your teacher',
      body: `MathMaster could not open the exact version of this question that was set for you, so it is not showing you a different one in its place. ${savedWork} You can keep working on the other questions while your teacher fixes this one.`,
    };
  }

  return (
    <div data-question-resolution-failure={failure?.classification || QUESTION_RESOLUTION_FAILURE.GENERATION_FAILED} data-question-resolution-recovery={recovery}>
      <RecoveryPanel
        compact
        tone={panel.tone}
        title={panel.title}
        primaryLabel={panel.primaryLabel || ''}
        onPrimary={panel.onPrimary || null}
        {...next}
        technicalMessage={technicalMessage}
      >
        <p style={{ margin: 0 }}>{panel.body}</p>
        {teacherView ? (
          <p style={{ margin: '10px 0 0', fontSize: 13 }} data-teacher-resolution-detail>
            Teacher details: {describeFailure(failure)}
          </p>
        ) : null}
      </RecoveryPanel>
    </div>
  );
}

/** Contains any throw while a question is being prepared or rendered. */
export default class QuestionResolutionBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const context = { ...this.props.context, executionScope: this.props.executionScope };
    const chunk = isChunkLoadError(error);
    console.error('Question could not be prepared:', context, error, info);
    recordQuestionResolutionDiagnostic({
      kind: chunk ? 'chunk-load' : 'question-resolution-error',
      context,
      failure: {
        classification: chunk ? 'chunk-load' : QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION,
        recovery: chunk ? QUESTION_RESOLUTION_RECOVERY.RELOAD : QUESTION_RESOLUTION_RECOVERY.RETRY,
        diagnostics: { detail: `${error?.name || 'Error'}: ${String(error?.message || error).slice(0, 60)}` },
      },
    });
  }

  componentDidUpdate(previousProps) {
    // Another question (or a retry) starts clean, so one failure never latches
    // the boundary for the rest of the assignment.
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    return (
      <QuestionResolutionFailure
        failure={{
          classification: chunk ? 'chunk-load' : QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION,
          recovery: chunk ? QUESTION_RESOLUTION_RECOVERY.RELOAD : QUESTION_RESOLUTION_RECOVERY.RETRY,
          diagnostics: { detail: error?.name || 'Error' },
        }}
        context={this.props.context}
        executionScope={this.props.executionScope}
        onRetry={this.props.onRetry}
        onNextQuestion={this.props.onNextQuestion}
        nextQuestionLabel={this.props.nextQuestionLabel}
        hasRecordedWork={this.props.hasRecordedWork}
      />
    );
  }
}
