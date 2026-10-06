import { Component, useEffect } from 'react';
import RecoveryPanel from './components/common/RecoveryPanel.jsx';
import { isChunkLoadError, recentlyReloadedForChunk, reloadForCurrentBuild } from './platform/runtime/chunkLoadRecovery.js';
import { QUESTION_DIAGNOSTIC_MESSAGE_LIMIT, recordClientDiagnostic } from './platform/runtime/clientDiagnostics.js';
import {
  QUESTION_RESOLUTION_FAILURE,
  QUESTION_RESOLUTION_RECOVERY,
  familyPinKind,
  fingerprintDigest,
} from './platform/generation/familyPinReplay.js';
import { questionDraftEnvelopeVersion } from './questionDraftStorage.js';

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
 *
 * WHAT IT DELIBERATELY DOES NOT DO (lmr-wu-1, October 2026). After a Warm-Up
 * reopen students met this panel on a question the deadline had closed, and
 * the tempting recoveries here would each have been wrong: clearing the saved
 * draft would have discarded the very sort the deadline submitted and fixed
 * nothing (the throw was in the closed question's solution review, not in
 * saved work); dealing a fresh question would have replaced the one the
 * student was graded on; skipping ahead only hides it. So recovery is layered
 * instead. The panels beside a question are contained by
 * QuestionSupplementBoundary and no longer reach this boundary; the response
 * module by QuestionModuleBoundary, which can set aside a draft it cannot read
 * (the October 3 fix); and whatever still arrives here is recorded with where
 * the question stood — its stage, record status, attempts and what wrote the
 * last one, variant and pin — so the next failure is found from its
 * diagnostic rather than from a screenshot.
 */

const TEACHER_SCOPES = new Set(['teacherPreview', 'teacherRepairPreview']);

/*
 * WHERE THE QUESTION STOOD WHEN IT FAILED — NEVER WHO WAS ANSWERING IT.
 *
 * "This question did not load" on lmr-wu-1 reached support as an assignment,
 * a question id and a family, which said nothing about the one thing that
 * mattered: the question had just become CLOSED (its last attempt was the
 * Warm-Up deadline's auto-submit), and only a closed question renders its
 * solution review. So a failure now also carries the question's lifecycle
 * (its recorded status, and whether its section is locked), how many attempts
 * the record holds and what wrote the last one, the variant on the record,
 * which delivery pin replayed it (its kind, the variant it was written for
 * and a one-way tag of its fingerprint) and the saved draft's envelope
 * version. None of that names, identifies or quotes a student: no student
 * id, no draft key (it holds the student id), no answer, no generated value.
 */
const integerOrNull = (value) => (Number.isInteger(Number(value)) && value !== null && value !== '' ? Number(value) : null);

export const questionFailureContext = ({
  assignmentId = null,
  question = null,
  questionRecord = null,
  familyContext = null,
  activityRole = null,
  executionScope = null,
  assignmentLocked = false,
} = {}) => {
  const read = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const record = read(() => (questionRecord && typeof questionRecord === 'object' ? questionRecord : {}), {});
  const family = read(() => (question?.questionFamily && typeof question.questionFamily === 'object' ? question.questionFamily : null));
  const status = read(() => String(record.status || 'unattempted'), 'unknown');
  const pin = read(() => (familyContext?.pin && typeof familyContext.pin === 'object' ? familyContext.pin : null));
  return {
    assignmentId: assignmentId ?? null,
    questionId: read(() => question?.questionId ?? question?.id ?? null),
    familyId: read(() => family?.id || family?.familyId || (family ? 'assignment-template' : null)),
    familyVersion: read(() => integerOrNull(family?.version)),
    activityRole: activityRole ?? 'practice',
    executionScope: executionScope ?? 'student',
    lifecycle: `${status}${assignmentLocked ? ',section-locked' : ''}`,
    attempts: read(() => integerOrNull(record.totalAttempts)),
    origin: read(() => (record.submissionOrigin ? String(record.submissionOrigin).slice(0, 40) : null)),
    variant: read(() => integerOrNull(record.variantIndex ?? 0)),
    pinKind: read(() => (familyContext ? familyPinKind(familyContext) : null)),
    pinVariant: read(() => integerOrNull(pin?.variant)),
    pinRef: read(() => fingerprintDigest(pin?.fingerprint)),
  };
};

/** The saved draft's envelope version — the tool workspace's, else the question's. */
export const draftEnvelopeVersionFor = (draftKey) => {
  if (!draftKey) return null;
  try {
    const tool = questionDraftEnvelopeVersion(`${draftKey}:work:tool`);
    return tool !== 'none' ? tool : questionDraftEnvelopeVersion(draftKey);
  } catch {
    return 'unreadable';
  }
};

const describeContext = (context = {}) => [
  context.assignmentId || 'none',
  context.questionId || 'none',
  `family=${context.familyId || 'none'}${context.familyVersion ? `@v${context.familyVersion}` : ''}`,
  `role=${context.activityRole || 'none'}`,
  `scope=${context.executionScope || 'none'}`,
  context.lifecycle ? `state=${context.lifecycle}` : '',
  Number.isInteger(context.attempts) ? `attempts=${context.attempts}` : '',
  context.origin ? `origin=${context.origin}` : '',
  Number.isInteger(context.variant) ? `variant=${context.variant}` : '',
  context.pinKind ? `pin=${context.pinKind}${Number.isInteger(context.pinVariant) ? `@v${context.pinVariant}` : ''}` : '',
  context.pinRef ? `pinRef=${context.pinRef}` : '',
  context.draftVersion !== undefined && context.draftVersion !== null ? `draft=v${context.draftVersion}` : '',
  context.stage ? `stage=${context.stage}` : '',
].filter(Boolean).join(' ');

/*
 * What an exception says, without what it quotes. A message can quote a
 * student's input ("Unexpected token in '3x+'"), so quoted text is dropped;
 * React's own wording ("Objects are not valid as a React child (found: object
 * with keys {xValues})") is kept, which is what makes a render failure
 * recognisable. clientDiagnostics.js scrubs again before anything is stored.
 */
export const describeErrorDetail = (error) => {
  const name = String(error?.name || 'Error').slice(0, 40);
  const message = String(error?.message ?? error ?? '')
    .replace(/(["'`]).*?\1/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  return `${name}: ${message}`.slice(0, 120);
};

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

/**
 * Record a question-level failure once per slot and classification.
 *
 * `draftKey` is read only to find the saved draft's envelope version, at the
 * moment of failure; it names the student, so it never enters the record.
 */
export const recordQuestionResolutionDiagnostic = ({ kind, context = {}, failure = {}, draftKey = null, source = 'question-resolution' }) => {
  const described = draftKey && context.draftVersion === undefined
    ? { ...context, draftVersion: draftEnvelopeVersionFor(draftKey) }
    : context;
  const signature = `${kind}|${describeContext(described)}|${describeFailure(failure)}`;
  if (recordedSignatures.has(signature)) return;
  recordedSignatures.add(signature);
  console.warn('Question could not be prepared:', { ...described, classification: failure.classification, recovery: failure.recovery });
  // What went wrong, and where in the question, first: a stored diagnostic is
  // bounded, and the slot's context is what can be spared at the end.
  recordClientDiagnostic({
    kind,
    message: `${described.stage ? `[${described.stage}] ` : ''}${describeFailure(failure)} | ${describeContext({ ...described, stage: null })}`,
    source,
    limit: QUESTION_DIAGNOSTIC_MESSAGE_LIMIT,
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
  // false where the host already tells the student what happened in its own
  // words (a Recovery question MathMaster could not grade): no classification
  // code and no copyable report on the student's screen — the teacher reads
  // the server-verified classification instead. The diagnostic is still
  // recorded.
  technicalDetails = true,
  // Only to report the saved draft's envelope version (see
  // recordQuestionResolutionDiagnostic); never shown or stored.
  draftKey = null,
}) {
  const recovery = failure?.recovery || QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR;
  const signatureContext = { ...context, executionScope };
  const signature = `${describeContext(signatureContext)}|${describeFailure(failure)}`;
  useEffect(() => {
    recordQuestionResolutionDiagnostic({ kind: 'question-resolution-failure', context: signatureContext, failure, draftKey });
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
        technicalMessage={technicalDetails || teacherView ? technicalMessage : ''}
        offerReport={technicalDetails || teacherView}
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
    const context = { ...this.props.context, executionScope: this.props.executionScope, stage: this.props.context?.stage || 'engine' };
    const chunk = isChunkLoadError(error);
    console.error('Question could not be prepared:', context, error, info);
    const failure = {
      classification: chunk ? 'chunk-load' : QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION,
      recovery: chunk ? QUESTION_RESOLUTION_RECOVERY.RELOAD : QUESTION_RESOLUTION_RECOVERY.RETRY,
    };
    recordQuestionResolutionDiagnostic({
      kind: chunk ? 'chunk-load' : 'question-resolution-error',
      context,
      failure: { ...failure, diagnostics: { detail: describeErrorDetail(error) } },
      draftKey: this.props.draftKey || null,
    });
    // A host that must know this question could not be shown (a Recovery tells
    // the server, so it is never counted against the student).
    if (typeof this.props.onResolutionFailure === 'function') {
      try { this.props.onResolutionFailure(failure); } catch { /* the host's problem, never this question's */ }
    }
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
        context={{ ...this.props.context, stage: this.props.context?.stage || 'engine' }}
        executionScope={this.props.executionScope}
        onRetry={this.props.onRetry}
        onNextQuestion={this.props.onNextQuestion}
        nextQuestionLabel={this.props.nextQuestionLabel}
        hasRecordedWork={this.props.hasRecordedWork}
        technicalDetails={this.props.technicalDetails !== false}
        draftKey={this.props.draftKey || null}
      />
    );
  }
}
