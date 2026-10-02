/*
 * ANSWERING A RECOVERY — ITS PRACTICE AND ITS ASSESSMENT.
 *
 * Every question shown here is a question-family instance identified by a
 * delivery pin, rendered through the ordinary QuestionEngine so each tool
 * behaves exactly as it did in the original section — no extra help, no
 * different workspace. The pin is REQUIRED (`requirePin`): if it will not
 * replay, the student sees an error rather than some other question, because
 * the server marks the answer against that exact instance.
 *
 *   PRACTICE    one item at a time. The raw response goes to the server, which
 *               marks it and updates the mastery gate. One answer per item:
 *               the gate counts unique questions, so a retry would not be new
 *               evidence. The next item comes from the updated record.
 *
 *   ASSESSMENT  the plan the server pinned when the student started. Answers
 *               are saved locally and can be changed until the whole Recovery
 *               is submitted; nothing about correctness is shown before then,
 *               so a Recovery cannot be answered by trial and error.
 *
 * STEP TOOLS KEEP THEIR RULES. Step Algebra spends tries on rejected moves.
 * The runner keeps that bookkeeping with the same `recordQuestionStep` and the
 * same per-section attempt limits the assignment player uses, so a Recovery is
 * never more forgiving — or more revealing — than the original section. An
 * item whose tries run out is over: in the assessment it counts as incorrect;
 * in Practice it is recorded as an incorrect item (a forfeit) so it never
 * blocks the next question and never becomes a free skip.
 *
 * Draft keys use their own assignment namespace (`<id>~recovery…`), so the
 * workspace-draft sync — which only syncs the active assignment's keys — never
 * mixes Recovery work into the original assignment's drafts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuestionEngine from '../../QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../questionDraftStorage.js';
import { normalizeCheckpointResponse } from '../../platform/performance/responseCheckpoint.js';
import { ACTIVITY_POLICIES } from '../../platform/policies/activityPolicies.js';
import { recordQuestionStep, resolveQuestionMaximumAttempts } from '../../attemptPolicy.js';
import { useToast } from '../../ui/Toast.jsx';
import {
  recoveryErrorCode,
  submitRecoveryPracticeItem,
  submitSectionRecovery,
} from '../../services/sectionRecoveryService.js';
import { RecoveryMasteryMeter } from './SectionRecoveryPanel.jsx';

// Practice's own attempt policy for step tools; the final answer is still one
// server-graded submission per item.
const PRACTICE_POLICY = Object.freeze({
  ...ACTIVITY_POLICIES.practice,
  allowReplacement: false,
});

// The section's own attempt policy (a DOL keeps its single try), with
// correctness, hints and remediation withheld until the Recovery is submitted.
const assessmentPolicy = (section) => Object.freeze({
  ...(ACTIVITY_POLICIES[section] || ACTIVITY_POLICIES.dol),
  allowReplacement: false,
  feedback: 'afterAssignmentSubmit',
  hintsAllowed: false,
  remediationAllowed: false,
});

const storageKeyFor = ({ kind, studentId, assignmentId, section, opportunity }) => (
  `mathmaster:recovery-${kind}:${encodeURIComponent(studentId)}:${encodeURIComponent(assignmentId)}:${section}:o${opportunity}`
);

const readSaved = (key) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeSaved = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A convenience only: the answers are still on screen and in each tool's
    // own draft, so losing this copy costs one more Submit per question.
  }
};

const clearSaved = (key) => {
  try { window.localStorage.removeItem(key); } catch { /* see writeSaved */ }
};

const isOver = (record) => record?.status === 'expired';

const shellStyle = { maxWidth: 980, margin: '0 auto', padding: '18px 16px 40px', boxSizing: 'border-box', display: 'grid', gap: 14 };
const panelStyle = {
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid var(--mm-border)',
  background: 'var(--mm-surface-raised)',
  color: 'var(--mm-text)',
};
const actionButton = (primary, disabled = false) => ({
  padding: '10px 16px',
  borderRadius: 8,
  fontWeight: 800,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  border: primary ? '1px solid var(--mm-primary)' : '1px solid var(--mm-border)',
  background: primary ? 'var(--mm-primary)' : 'var(--mm-surface)',
  color: primary ? 'var(--mm-on-primary)' : 'var(--mm-text-strong)',
});

function RecoveryHeader({ label, subtitle, onExit }) {
  return (
    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--mm-text-strong)' }}>{label}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--mm-text-muted)' }}>{subtitle}</p>}
      </div>
      <button type="button" onClick={onExit} style={actionButton(false)}>Back</button>
    </header>
  );
}

/** The engine for one pinned item, with the rendered instance reported back. */
function PinnedQuestion({
  item,
  question,
  assignmentId,
  section,
  studentId,
  studentProfile,
  draftNamespace,
  draftIndex,
  activityRole,
  activityPolicy,
  maximumAttempts,
  questionRecord,
  onRendered,
  onGrade,
  onStepGrade,
}) {
  const familyContext = useMemo(() => ({
    assignmentId,
    storageIndex: item.storageIndex,
    variant: item.pin.variant,
    pin: item.pin,
    requirePin: true,
  }), [assignmentId, item]);
  return (
    <QuestionEngine
      key={item.pin.fingerprint}
      question={question}
      generationKey={`${assignmentId}|${section}-recovery|${item.storageIndex}|variant:${item.pin.variant}`}
      familyContext={familyContext}
      onFamilyDelivery={(delivery, rendered) => onRendered(delivery, rendered)}
      onGrade={onGrade}
      onStepGrade={onStepGrade}
      onLoadScratchpad={async () => null}
      onSaveScratchpad={async () => null}
      questionRecord={questionRecord}
      maximumAttempts={maximumAttempts}
      draftKey={buildQuestionDraftKey({
        studentId,
        assignmentId: `${assignmentId}~${draftNamespace}`,
        questionIndex: item.storageIndex,
        variantIndex: draftIndex,
      })}
      studentProfile={studentProfile}
      activityRole={activityRole}
      activityPolicy={activityPolicy}
      assignmentId={assignmentId}
      showStandardBadge={false}
    />
  );
}

function PracticeRunner({ assignment, entry, studentId, studentProfile, onExit, onRecord, onStartAssessment }) {
  const [item, setItem] = useState(entry.nextPracticeItem || null);
  const [outcome, setOutcome] = useState(null);
  const [notice, setNotice] = useState('');
  const [stepRecords, setStepRecords] = useState({});
  const [forfeiting, setForfeiting] = useState(false);
  const renderedRef = useRef({});

  // Before the first answer, follow the record (another tab may have moved it).
  useEffect(() => {
    if (!outcome && entry.nextPracticeItem?.pin?.fingerprint !== item?.pin?.fingerprint) {
      setItem(entry.nextPracticeItem || null);
    }
  }, [entry.nextPracticeItem, item, outcome]);

  const question = item ? entry.questionsByIndex?.[item.storageIndex] : null;
  const fingerprint = item?.pin?.fingerprint || '';
  const maximumAttempts = resolveQuestionMaximumAttempts({ question, activityPolicy: PRACTICE_POLICY });
  const stepRecord = stepRecords[fingerprint] || null;

  const recordOutcome = useCallback((result) => {
    if (result?.record) onRecord(entry.section, result.record);
    setOutcome({ isCorrect: result?.isCorrect === true, unlocked: result?.unlocked === true });
    setNotice('');
  }, [entry.section, onRecord]);

  const handleGrade = useCallback(async (unusedLocalVerdict, unusedDetails, parts, supportUsage, responseKey, attemptMetadata = {}) => {
    if (!item) return null;
    const rendered = renderedRef.current[item.pin.fingerprint];
    if (!rendered) {
      return { blocked: true, message: 'This question is still loading. Try Submit again in a moment.' };
    }
    // A registry tool's structured work travels as itself, so the server can
    // mark it with the tool's shared grader rather than refusing an opaque
    // string.
    const response = normalizeCheckpointResponse(rendered, { parts, responseKey, isComplete: true, toolResponse: attemptMetadata?.toolResponse || null });
    try {
      const result = await submitRecoveryPracticeItem({
        assignmentId: assignment.id,
        section: entry.section,
        pin: item.pin,
        practiceIndex: item.practiceIndex,
        response,
        supportUsage,
        attempts: (Number(stepRecords[item.pin.fingerprint]?.attemptCount) || 0) + 1,
      });
      recordOutcome(result);
      const isCorrect = result?.isCorrect === true;
      return {
        isCorrect,
        status: isCorrect ? 'correct' : 'expired',
        attemptCount: maximumAttempts,
        remainingAttempts: 0,
        expired: !isCorrect,
        message: isCorrect
          ? 'Correct! Nice work.'
          : 'Not quite. That one still counts as practice — review it, then try a fresh question.',
      };
    } catch (error) {
      const code = recoveryErrorCode(error);
      if (code === 'practice-item-repeated') {
        setOutcome({ isCorrect: null, unlocked: false });
        setNotice('That question was already answered. Here is a fresh one.');
        return { blocked: true, message: 'That question was already answered.' };
      }
      if (code === 'practice-response-ungradable') {
        return { blocked: true, message: 'MathMaster could not read that answer. Check it and press Submit again.' };
      }
      if (code === 'recovery-window-ended') {
        return { blocked: true, message: 'The final submission date has passed, so Recovery is closed.' };
      }
      return { blocked: true, message: 'Your answer could not be checked right now. Try Submit again.' };
    }
  }, [assignment.id, entry.section, item, maximumAttempts, recordOutcome, stepRecords]);

  // Rejected steps spend tries exactly as they do in ordinary Practice.
  const handleStepGrade = useCallback(async ({ stepGrade, countsAttempt, statePatch, supportUsage }) => {
    if (!fingerprint) return null;
    const next = recordQuestionStep({ record: stepRecords[fingerprint], stepGrade, countsAttempt, statePatch, supportUsage, maximumAttempts });
    setStepRecords((current) => ({ ...current, [fingerprint]: next.record }));
    return next.result;
  }, [fingerprint, maximumAttempts, stepRecords]);

  // Every try used before an answer was submitted: the item is recorded as
  // incorrect so Practice can continue. Never a free skip.
  const forfeitAndContinue = async () => {
    if (!item || forfeiting) return;
    setForfeiting(true);
    try {
      const result = await submitRecoveryPracticeItem({
        assignmentId: assignment.id,
        section: entry.section,
        pin: item.pin,
        practiceIndex: item.practiceIndex,
        response: null,
        forfeit: true,
      });
      recordOutcome(result);
    } catch (error) {
      if (recoveryErrorCode(error) === 'practice-item-repeated') setOutcome({ isCorrect: null, unlocked: false });
      else setNotice('That could not be saved right now. Try again in a moment.');
    } finally {
      setForfeiting(false);
    }
  };

  const nextQuestion = () => {
    setOutcome(null);
    setItem(entry.nextPracticeItem || null);
  };

  const unlocked = entry.state === 'unlocked';
  const triesUsedUp = !outcome && isOver(stepRecord);
  const engineRecord = outcome && outcome.isCorrect !== null
    ? { ...stepRecord, status: outcome.isCorrect ? 'correct' : 'expired', attemptCount: maximumAttempts }
    : stepRecord;
  return (
    <div style={shellStyle} data-recovery-runner="practice" data-recovery-section={entry.section}>
      <RecoveryHeader label={`${entry.label} — Practice`} subtitle="Show what you know. Each fresh question counts once." onExit={onExit} />
      <div style={{ ...panelStyle, display: 'grid', gap: 8 }}>
        <RecoveryMasteryMeter percent={entry.masteryPercent} />
        <p aria-live="polite" style={{ margin: 0, fontSize: 13.5 }}>
          {unlocked
            ? `${entry.label} Unlocked — you can start it whenever you are ready.`
            : `${entry.label} Locked — keep practicing to unlock it.`}
        </p>
        {unlocked && (
          <div>
            <button type="button" onClick={() => onStartAssessment(entry.section)} style={actionButton(true)}>
              Start {entry.label}
            </button>
          </div>
        )}
      </div>
      {notice && <p role="status" style={{ margin: 0, color: 'var(--mm-text-muted)' }}>{notice}</p>}
      {item && question ? (
        <PinnedQuestion
          item={item}
          question={question}
          assignmentId={assignment.id}
          section={entry.section}
          studentId={studentId}
          studentProfile={studentProfile}
          draftNamespace={`recoveryPractice~${entry.section}`}
          draftIndex={item.practiceIndex}
          activityRole="practice"
          activityPolicy={PRACTICE_POLICY}
          maximumAttempts={maximumAttempts}
          questionRecord={engineRecord}
          onRendered={(delivery, rendered) => { renderedRef.current[delivery.fingerprint] = rendered; }}
          onGrade={handleGrade}
          onStepGrade={handleStepGrade}
        />
      ) : (
        <p style={{ ...panelStyle, margin: 0 }}>There is no practice question to show right now.</p>
      )}
      {triesUsedUp && (
        <div role="status" style={{ ...panelStyle, display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>Every try on this question is used. It counts as a practice question you did not get — a fresh one is next.</p>
          <div>
            <button type="button" disabled={forfeiting} onClick={forfeitAndContinue} style={actionButton(true, forfeiting)}>
              {forfeiting ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </div>
      )}
      {outcome && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {entry.nextPracticeItem && (
            <button type="button" onClick={nextQuestion} style={actionButton(!unlocked)}>Next practice question</button>
          )}
          {unlocked && (
            <button type="button" onClick={() => onStartAssessment(entry.section)} style={actionButton(true)}>
              Start {entry.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AssessmentRunner({ assignment, entry, studentId, studentProfile, onExit, onRecord }) {
  const { confirm } = useToast();
  const plan = entry.plan;
  const items = useMemo(() => (Array.isArray(plan?.items) ? plan.items : []), [plan]);
  const keyArgs = { studentId, assignmentId: assignment.id, section: entry.section, opportunity: plan?.opportunity || 1 };
  const responsesKey = storageKeyFor({ kind: 'responses', ...keyArgs });
  const stepsKey = storageKeyFor({ kind: 'steps', ...keyArgs });
  const [responses, setResponses] = useState(() => readSaved(responsesKey));
  const [stepRecords, setStepRecords] = useState(() => readSaved(stepsKey));
  const [position, setPosition] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const renderedRef = useRef({});
  const policy = useMemo(() => assessmentPolicy(entry.section), [entry.section]);

  const current = items[Math.min(position, Math.max(0, items.length - 1))] || null;
  const currentQuestion = current ? entry.questionsByIndex?.[current.storageIndex] : null;
  const maximumAttempts = resolveQuestionMaximumAttempts({ question: currentQuestion, activityPolicy: policy });
  const answeredCount = items.filter((item) => responses[item.itemId] && !isOver(stepRecords[item.itemId])).length;

  const handleGrade = useCallback(async (unusedLocalVerdict, unusedDetails, parts, unusedSupportUsage, responseKey, attemptMetadata = {}) => {
    if (!current) return null;
    if (isOver(stepRecords[current.itemId])) return null;
    const rendered = renderedRef.current[current.pin.fingerprint];
    if (!rendered) return { blocked: true, message: 'This question is still loading. Try again in a moment.' };
    const response = normalizeCheckpointResponse(rendered, { parts, responseKey, isComplete: true, toolResponse: attemptMetadata?.toolResponse || null });
    setResponses((previous) => {
      const next = { ...previous, [current.itemId]: response };
      writeSaved(responsesKey, next);
      return next;
    });
    // Nothing about correctness: the Recovery is marked once, on submit.
    return { isCorrect: false, status: 'attempted', attemptCount: 0, remainingAttempts: maximumAttempts, expired: false };
  }, [current, maximumAttempts, responsesKey, stepRecords]);

  // Rejected steps spend tries exactly as in the original section; an item
  // whose tries are used up is over and counts as incorrect.
  const handleStepGrade = useCallback(async ({ stepGrade, countsAttempt, statePatch, supportUsage }) => {
    if (!current) return null;
    const next = recordQuestionStep({ record: stepRecords[current.itemId], stepGrade, countsAttempt, statePatch, supportUsage, maximumAttempts });
    setStepRecords((previous) => {
      const updated = { ...previous, [current.itemId]: next.record };
      writeSaved(stepsKey, updated);
      return updated;
    });
    if (isOver(next.record)) {
      setResponses((previous) => {
        const { [current.itemId]: _dropped, ...rest } = previous;
        writeSaved(responsesKey, rest);
        return rest;
      });
    }
    return next.result;
  }, [current, maximumAttempts, responsesKey, stepRecords, stepsKey]);

  const submitAll = async () => {
    if (submitting) return;
    const unanswered = items.length - answeredCount;
    if (unanswered > 0) {
      const proceed = await confirm({
        title: `Submit ${entry.label}?`,
        message: `${unanswered} question${unanswered === 1 ? ' has' : 's have'} no saved answer and will count as incorrect.`,
        confirmLabel: 'Submit anyway',
        cancelLabel: 'Keep working',
      });
      if (!proceed) return;
    }
    setSubmitting(true);
    setError('');
    try {
      const sendable = Object.fromEntries(Object.entries(responses).filter(([itemId]) => !isOver(stepRecords[itemId])));
      const result = await submitSectionRecovery({ assignmentId: assignment.id, section: entry.section, responses: sendable });
      if (result?.record) onRecord(entry.section, result.record);
      clearSaved(responsesKey);
      clearSaved(stepsKey);
    } catch (submitError) {
      const code = recoveryErrorCode(submitError);
      setError(code === 'recovery-not-in-progress'
        ? 'This Recovery was already submitted.'
        : code === 'recovery-window-ended'
          ? 'The final submission date has passed, so this Recovery can no longer be submitted. Your original score stands.'
          : 'Your Recovery could not be submitted right now. Your answers are saved here — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (entry.state === 'completed') {
    return (
      <div style={shellStyle} data-recovery-runner="complete" data-recovery-section={entry.section}>
        <RecoveryHeader label={entry.label} subtitle="Recovery complete." onExit={onExit} />
        <div style={{ ...panelStyle, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0 }}>Nice work finishing your Recovery.</p>
          {entry.result && (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              <div><dt style={{ color: 'var(--mm-text-muted)' }}>Original</dt><dd style={{ margin: 0, fontWeight: 900, fontSize: 18 }}>{entry.result.original}</dd></div>
              <div><dt style={{ color: 'var(--mm-text-muted)' }}>Recovery</dt><dd style={{ margin: 0, fontWeight: 900, fontSize: 18 }}>{entry.result.recovery}</dd></div>
              <div><dt style={{ color: 'var(--mm-text-muted)' }}>Final</dt><dd style={{ margin: 0, fontWeight: 900, fontSize: 18 }}>{entry.result.final}</dd></div>
            </dl>
          )}
          <div><button type="button" onClick={onExit} style={actionButton(true)}>Done</button></div>
        </div>
      </div>
    );
  }

  if (entry.state === 'closed') {
    return (
      <div style={shellStyle} data-recovery-runner="closed" data-recovery-section={entry.section}>
        <RecoveryHeader label={entry.label} subtitle="Recovery closed." onExit={onExit} />
        <div style={{ ...panelStyle, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0 }}>{entry.message}</p>
          <div><button type="button" onClick={onExit} style={actionButton(true)}>Done</button></div>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div style={shellStyle} data-recovery-runner="assessment" data-recovery-section={entry.section}>
        <RecoveryHeader label={entry.label} onExit={onExit} />
        <p style={{ ...panelStyle, margin: 0 }}>Your Recovery is being prepared. Go back and press Start again in a moment.</p>
      </div>
    );
  }

  const currentOver = isOver(stepRecords[current.itemId]);
  return (
    <div style={shellStyle} data-recovery-runner="assessment" data-recovery-section={entry.section}>
      <RecoveryHeader
        label={entry.label}
        subtitle="Fresh questions on the same skills. Save each answer, then submit when you are done."
        onExit={onExit}
      />
      <nav aria-label="Recovery questions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map((item, index) => {
          const active = item.itemId === current.itemId;
          const over = isOver(stepRecords[item.itemId]);
          const saved = Boolean(responses[item.itemId]) && !over;
          return (
            <button
              key={item.itemId}
              type="button"
              aria-current={active ? 'step' : undefined}
              aria-label={`Question ${index + 1}${saved ? ', answer saved' : over ? ', no tries left' : ''}`}
              onClick={() => setPosition(index)}
              style={{
                minWidth: 40,
                padding: '7px 10px',
                borderRadius: 8,
                fontWeight: 800,
                cursor: 'pointer',
                border: `1px solid ${active ? 'var(--mm-primary)' : saved ? 'var(--mm-success-border)' : 'var(--mm-border)'}`,
                background: active ? 'var(--mm-primary)' : saved ? 'var(--mm-success-bg)' : 'var(--mm-surface)',
                color: active ? 'var(--mm-on-primary)' : saved ? 'var(--mm-success-text)' : 'var(--mm-text-strong)',
              }}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>
      <p aria-live="polite" style={{ margin: 0, fontSize: 13.5, color: 'var(--mm-text-muted)' }}>
        Question {position + 1} of {items.length}
        {currentOver
          ? ' · Every try on this question is used, so it will count as incorrect.'
          : responses[current.itemId] ? ' · Answer saved — you can change it until you submit.' : ''}
      </p>
      <PinnedQuestion
        item={current}
        question={currentQuestion}
        assignmentId={assignment.id}
        section={entry.section}
        studentId={studentId}
        studentProfile={studentProfile}
        draftNamespace={`recovery~${entry.section}~o${plan?.opportunity || 1}`}
        draftIndex={position}
        activityRole={entry.section}
        activityPolicy={policy}
        maximumAttempts={maximumAttempts}
        questionRecord={stepRecords[current.itemId] || null}
        onRendered={(delivery, rendered) => { renderedRef.current[delivery.fingerprint] = rendered; }}
        onGrade={handleGrade}
        onStepGrade={handleStepGrade}
      />
      {error && <p role="alert" style={{ margin: 0, color: 'var(--mm-error-text)', fontWeight: 700 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={position === 0} onClick={() => setPosition((value) => Math.max(0, value - 1))} style={actionButton(false, position === 0)}>
            Previous
          </button>
          <button type="button" disabled={position >= items.length - 1} onClick={() => setPosition((value) => Math.min(items.length - 1, value + 1))} style={actionButton(false, position >= items.length - 1)}>
            Next
          </button>
        </div>
        <button type="button" disabled={submitting} onClick={submitAll} style={actionButton(true, submitting)}>
          {submitting ? 'Submitting…' : `Submit ${entry.label} (${answeredCount}/${items.length} saved)`}
        </button>
      </div>
    </div>
  );
}

export default function SectionRecoveryRunner({
  mode = 'practice',
  assignment,
  entry,
  studentId,
  studentProfile = null,
  onExit,
  onRecord,
  onStartAssessment,
}) {
  if (!assignment?.id || !entry) return null;
  if (mode === 'assessment') {
    return (
      <AssessmentRunner
        assignment={assignment}
        entry={entry}
        studentId={studentId}
        studentProfile={studentProfile}
        onExit={onExit}
        onRecord={onRecord}
      />
    );
  }
  return (
    <PracticeRunner
      assignment={assignment}
      entry={entry}
      studentId={studentId}
      studentProfile={studentProfile}
      onExit={onExit}
      onRecord={onRecord}
      onStartAssessment={onStartAssessment}
    />
  );
}
