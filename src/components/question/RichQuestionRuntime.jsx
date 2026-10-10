import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CalculatorPanel from '../CalculatorPanel.jsx';
import MathText from '../common/MathText.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import PathQuestionStimulus from '../student/PathQuestionStimulus.jsx';
import PathSolutionReview from '../student/PathSolutionReview.jsx';
import LinearRegressionPanel from '../assessment/LinearRegressionPanel.jsx';
import SecureItemAccessSupports from '../assessment/SecureItemAccessSupports.jsx';
import SecureMathAnswerField from '../assessment/SecureMathAnswerField.jsx';
import { SUPPORT_TOOL } from '../../platform/language/supportToolsEntitlement.js';
import { secureAccessEntitlement } from '../../platform/assessment/secureItemAccess.js';
import { resolveExamCalculatorPolicy } from '../../platform/policies/examPolicyResolver.js';
import { resolveCalculatorPolicy } from '../../platform/policies/calculatorPolicy.js';
import { questionFromToolPayload } from '../../platform/path/pathToolResponses.js';
import { engineActivityPolicyForMode, resolveQuestionRuntimePolicy } from '../../platform/assessment/questionRuntimePolicy.js';
import { readQuestionDraftFamily, restoreQuestionDrafts, subscribeToQuestionDrafts } from '../../questionDraftStorage.js';
import { createToolWorkGate } from './toolWorkGate.js';
import { assessmentSupportProfile } from '../../studentSupport.js';

/*
 * THE SHARED RICH QUESTION RUNTIME.
 *
 * One way to render a MathMaster question that came from the server, wherever
 * it is met: a secure Test, a secure Retest, Corrections, and the teacher's
 * preview of a Test. The surfaces differ in AUTHORITY — who issued the item,
 * what the payload may contain, who grades it, when the verdict is released —
 * and that stays in each surface's container and on the server. They do not
 * differ in the question. A graphing item is the Graphing tool on all four.
 *
 *   tool item   (`pathToolId` + `tool`, built by the Path Tool Contract's
 *               allowlist and stripped of assistance for a secure mode)
 *               → QuestionEngine and the real registry tool, LAZY-loaded: a
 *               Test of response fields never downloads the engine, and a
 *               graphing item downloads the graphing tool and nothing else.
 *   field item  (`responseFields` / `choices`)
 *               → the secure response fields: choices are choices, numbers are
 *               typed as text so 3/4 is a legal answer.
 *
 * WHAT A MODE CHANGES — and nothing else changes. `runtimeMode` comes on the
 * payload from the server; resolveQuestionRuntimePolicy maps it onto the
 * activity policy QuestionEngine and every tool already enforce (hints, self
 * checks, outcome feedback, replacement). A Secure Test keeps every response
 * tool and loses every assistance capability; Corrections keeps the tool and
 * adds hints, immediate feedback and three tries. An unknown mode resolves to
 * Secure Test, never to practice.
 *
 * WHAT IT NEVER DOES. Decide correctness. The engine runs in server-grading
 * mode: it serializes the student's construction and hands it up; the verdict
 * (or, on a secure item, the absence of one) comes back from the server.
 *
 * WORK SURVIVES. A tool keeps its drafts under `draftKey` on the device (a
 * refresh, a Chromebook sleep, a dropped connection, a proctor lock), and its
 * raw construction plus those drafts go up with every autosave through
 * `onDraftChange`, so the item reopens on another device as it was left.
 *
 * NAVIGATION MODE (`navigationMode`). A secure test the student moves around
 * in — Previous, Next, a question list, change any answer until Submit — has
 * no per-question "record" step: every answer is a draft the server grades
 * once, when the whole test is submitted. So in this mode nothing here
 * records, gates or continues. A field item has no button of its own (the
 * container's Previous/Next move on, and autosave keeps the answer); a Rich
 * Tool's final action is "Save answer", which hands the work to `onSubmit` to
 * be saved as a draft and always comes back with no result — so the engine
 * shows no verdict and leaves the tool open for more changes.
 */

const QuestionEngine = lazy(() => import('../../QuestionEngine.jsx'));

const belongsToDraft = (key, draftKey) => Boolean(draftKey) && (key === draftKey || String(key || '').startsWith(`${draftKey}:`));

const card = {
  background: 'var(--mm-surface)',
  border: '1px solid var(--mm-border)',
  borderRadius: 14,
  padding: 'clamp(18px, 4vw, 30px)',
  boxShadow: '0 5px 22px rgba(0,0,0,.07)',
};

const sectionLabelStyle = { color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' };

/** The instructional panels a mode allows, below whichever renderer ran. */
const InstructionalSupport = ({ policy, feedback, isToolItem }) => {
  if (!feedback) return null;
  const caps = policy.capabilities;
  return (
    <>
      {/* A tool item's verdict is shown by QuestionEngine itself, from the
          feedback the container returned; a field item's is shown here. */}
      {!isToolItem && caps.immediateFeedback && (
        <div role="status" style={{ marginTop: 14, padding: 13, borderRadius: 9, background: feedback.isCorrect ? 'var(--mm-success-bg)' : 'var(--mm-error-bg)', color: feedback.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-error-text)', lineHeight: 1.55 }}>
          <MathText>{feedback.message || (feedback.isCorrect ? 'Correct.' : 'Not yet.')}</MathText>
        </div>
      )}
      {caps.hints && feedback.hint && !feedback.isCorrect && (
        <div style={{ marginTop: 12, padding: 13, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', borderRadius: 9, border: '1px solid var(--mm-warning-border)' }}>
          <strong style={{ display: 'block', marginBottom: 3 }}>Something to think about</strong>
          <MathText style={{ lineHeight: 1.55 }}>{feedback.hint}</MathText>
        </div>
      )}
      {caps.workedSolution && feedback.solutionReview && (
        <PathSolutionReview review={feedback.solutionReview} wasCorrect={Boolean(feedback.isCorrect)} />
      )}
    </>
  );
};

/*
 * A FIELD ITEM. The secure response renderer: radio cards for choices; for a
 * typed answer, the math editor students use everywhere else, or a plain text
 * box where the server grader reads typed text and not the editor's LaTeX
 * (SecureMathAnswerField / secureAnswerEntry.js, which pins every case
 * against the real grader — 3/4 typed in the editor is accepted); the
 * regression calculator panel where the item permits it. On a secure item,
 * Read aloud / Translate / Vocabulary for the PROMPT ONLY, for a student
 * whose own support plan grants them on a test (SecureItemAccessSupports —
 * given the raw profile, because the flattened assessment profile loses the
 * plan's per-activity limits). Nothing here reads or computes correctness.
 */
const FieldItem = ({ question, policy, calculatorPolicy, studentSupportProfile, rawStudentSupportProfile = null, initialResponsePayload, busy, closed, feedback, navigationMode = false, onSubmit, onDraftChange }) => {
  const [responses, setResponses] = useState(() => initialResponsePayload?.responses || {});
  const [calculatorUsed, setCalculatorUsed] = useState(false);
  const [regressionState, setRegressionState] = useState(() => {
    const saved = initialResponsePayload?.toolState?.linearRegression;
    return saved ? { ...saved, rows: saved.rows.map((row) => (Array.isArray(row) ? row : row.cells)) } : null;
  });
  const fields = question?.responseFields?.length ? question.responseFields : [{ id: 'answer', label: 'Answer', inputProfile: 'text' }];
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  const complete = fields.every((field) => String(responses[field.id] ?? '').trim());
  const locked = busy || closed;
  const supportUsage = (used = calculatorUsed) => ({ calculatorUsed: used, accommodations: studentSupportProfile?.accommodations || [], modifications: studentSupportProfile?.modifications || [] });

  const submit = async (event) => {
    event.preventDefault();
    // Navigation mode: Enter in an answer box records nothing and moves
    // nowhere. The answer is already autosaving as a draft.
    if (navigationMode || !complete || locked) return;
    await onSubmit?.({ responses, toolState: { linearRegression: regressionState } }, supportUsage());
  };
  const updateResponse = (id, value) => {
    // While an answer is being recorded the item is already gone: a keystroke
    // here would autosave a draft onto the submitted item and show "Answer
    // saved" over the next question, which then appears empty.
    if (locked) return;
    setResponses((current) => {
      const next = { ...current, [id]: value };
      onDraftChange?.({ responses: next, toolState: { linearRegression: regressionState } }, supportUsage());
      return next;
    });
  };

  const actionLabel = policy.secure
    ? (busy ? 'Recording securely…' : complete ? 'Record answer & continue' : 'Answer to continue')
    : (busy ? 'Checking…' : feedback && !feedback.isCorrect && !closed ? 'Check my answer again' : 'Check my answer');
  const enabled = complete && !locked;

  return (
    <main style={{ width: 'min(820px, 100%)', margin: '0 auto', padding: '28px 18px 64px', boxSizing: 'border-box' }}>
      <section style={card}>
        {policy.secure && <div style={sectionLabelStyle}>Secure exam question</div>}
        {/* Secure mode deliberately hides TEKS/domain labels while answering,
            but the mathematics itself must still render exactly as authored. */}
        <MathText as="h1" style={{ color: 'var(--mm-text-strong)', fontSize: 'clamp(20px, 4vw, 27px)', lineHeight: 1.45, margin: '10px 0 24px', fontWeight: 760 }}>{question.prompt}</MathText>
        {policy.secure && <SecureItemAccessSupports question={question} studentSupportProfile={rawStudentSupportProfile} />}
        {question.formulaLatex && <div style={{ background: 'var(--mm-surface-sunken)', padding: 12, borderRadius: 8, marginBottom: 18, overflowX: 'auto' }}><MathDisplay value={question.formulaLatex} /></div>}
        <PathQuestionStimulus stimulus={question.stimulus} />
        {question.permittedTools?.includes('linearRegression') && <LinearRegressionPanel value={regressionState} onUsed={() => setCalculatorUsed(true)} onChange={(next) => {
          setRegressionState(next);
          if (locked) return; // the item is being recorded; see updateResponse
          onDraftChange?.({ responses, toolState: { linearRegression: next } }, supportUsage(true));
        }} />}
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gap: 15 }}>
            {fields.map((field, fieldIndex) => {
              const fieldChoices = field.choices?.length ? field.choices : fields.length === 1 ? choices : [];
              return (
                <fieldset key={field.id} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontSize: 13, fontWeight: 900, color: 'var(--mm-text)', marginBottom: 7 }}>
                    <MathText>{field.label || `Response ${fieldIndex + 1}`}{field.unit ? ` (${field.unit})` : ''}</MathText>
                  </legend>
                  {fieldChoices.length ? fieldChoices.map((choice) => {
                    const selected = responses[field.id] === choice.id;
                    return (
                      <label key={choice.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 13px', marginBottom: 8, border: selected ? '2px solid var(--mm-primary)' : '1px solid var(--mm-border)', borderRadius: 9, cursor: 'pointer', background: selected ? 'var(--mm-primary-subtle)' : 'var(--mm-surface)', boxShadow: selected ? '0 0 0 1px rgba(26,115,232,.08)' : 'none' }}>
                        <input type="radio" name={field.id} value={choice.id} checked={selected} disabled={locked} onChange={(event) => updateResponse(field.id, event.target.value)} style={{ marginTop: 3 }} />
                        <MathText style={{ lineHeight: 1.5 }}>{choice.label}</MathText>
                      </label>
                    );
                  }) : (
                    <SecureMathAnswerField
                      field={field}
                      value={responses[field.id] ?? ''}
                      onChange={(next) => updateResponse(field.id, next)}
                      readOnly={locked}
                      autoFocus={fieldIndex === 0}
                      ariaLabel={field.label || `Response ${fieldIndex + 1}`}
                    />
                  )}
                </fieldset>
              );
            })}
          </div>
          {/* Disabled is a token pair, not white on light grey: that read at
              about 1.4:1 in both themes, so "why can't I continue?" had no
              visible answer. In navigation mode there is no per-question
              action at all: nothing is gated on answering, and moving on is
              the container's Previous/Next. */}
          {!navigationMode && <button type="submit" disabled={!enabled} style={{ width: '100%', minHeight: 48, marginTop: 22, border: 0, borderRadius: 9, background: !enabled ? 'var(--mm-surface-control-strong)' : 'var(--mm-primary)', color: !enabled ? 'var(--mm-disabled-text)' : 'var(--mm-on-primary)', fontWeight: 900, cursor: !enabled ? 'not-allowed' : 'pointer' }}>{actionLabel}</button>}
        </form>
        <InstructionalSupport policy={policy} feedback={feedback} isToolItem={false} />
      </section>
      <CalculatorPanel policy={calculatorPolicy} onCalculatorOpened={() => setCalculatorUsed(true)} />
    </main>
  );
};

/*
 * A RICH TOOL ITEM. QuestionEngine and the authentic registry tool, in
 * server-grading mode, under the mode's activity policy.
 */
/*
 * On a secure Rich Tool item the engine's own support tray offers what a
 * secure item allows — Read aloud and Translate, from the student's own plan
 * for a test — and nothing else: no Break it down, no Help me say it, and no
 * Vocabulary, whose glossary entries carry worked examples (the engine's tray
 * has no way to leave them out yet). A practice surface keeps its tray.
 */
const secureToolTrayEntitlement = (rawStudentSupportProfile) => {
  const entitlement = secureAccessEntitlement(rawStudentSupportProfile);
  const tools = entitlement.tools.filter((tool) => tool !== SUPPORT_TOOL.VOCABULARY);
  return { tools, language: tools.includes(SUPPORT_TOOL.TRANSLATE) ? entitlement.language : null };
};

const ToolItem = ({ question, policy, calculatorPolicy, supportProfile, rawStudentSupportProfile = null, draftKey, initialResponsePayload, busy, closed, closedMessage, feedback, attempt, executionScope, navigationMode = false, onSubmit, onDraftChange }) => {
  const latestRawRef = useRef(initialResponsePayload?.raw || null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  // Read at press time: the grader below is built once per item.
  const navigationModeRef = useRef(navigationMode);
  navigationModeRef.current = navigationMode;
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const supportUsageRef = useRef({});
  const busyRef = useRef(busy);
  busyRef.current = busy || closed;

  // Server-held drafts go back onto this device BEFORE the engine mounts and
  // reads them, newest wins (restoreQuestionDrafts). The device copy of an
  // item the student worked on here is never overwritten by an older one.
  useState(() => {
    const drafts = Array.isArray(initialResponsePayload?.workspaceDrafts) ? initialResponsePayload.workspaceDrafts : [];
    const own = drafts.filter((entry) => belongsToDraft(entry?.key, draftKey));
    if (own.length) restoreQuestionDrafts(own);
    return null;
  });

  const emitDraft = useCallback(() => {
    if (busyRef.current || !onDraftChangeRef.current) return;
    onDraftChangeRef.current({
      responses: {},
      ...(latestRawRef.current ? { raw: latestRawRef.current } : {}),
      workspaceDrafts: draftKey ? readQuestionDraftFamily(draftKey) : [],
    }, supportUsageRef.current);
  }, [draftKey]);

  // The tool's raw construction, as its Path Tool Contract grades it: only
  // the student's work, or work the server does not hold (toolWorkGate).
  const [toolWorkGate] = useState(() => createToolWorkGate({ serverRaw: initialResponsePayload?.raw || null }));
  const handleRawWork = useCallback((raw) => {
    latestRawRef.current = raw && typeof raw === 'object' ? raw : null;
    if (toolWorkGate(latestRawRef.current)) emitDraft();
  }, [emitDraft, toolWorkGate]);

  // A tool's own draft writes that are the STUDENT's edits (not a workspace
  // writing back what it read on mount) also go up, coalesced: subscribers are
  // told synchronously, mid-keystroke, and must not do work there.
  useEffect(() => {
    if (!draftKey) return undefined;
    let timer = 0;
    const unsubscribe = subscribeToQuestionDrafts(({ key, edit }) => {
      if (!edit || !belongsToDraft(key, draftKey)) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = 0; emitDraft(); }, 0);
    });
    return () => { unsubscribe(); if (timer) window.clearTimeout(timer); };
  }, [draftKey, emitDraft]);

  const serverGrading = useMemo(() => ({
    pathToolId: question.pathToolId,
    // This host keeps a registry tool's live work (the secure autosave); a host
    // that does not ask for it (Live Challenge) is never sent it.
    publishToolWork: true,
    submit: async (rawWork, engineSupportUsage) => {
      supportUsageRef.current = engineSupportUsage || {};
      const raw = rawWork && typeof rawWork === 'object' ? rawWork : latestRawRef.current;
      const supportUsage = {
        calculatorUsed: Boolean(engineSupportUsage?.calculatorUsed),
        accommodations: supportProfile?.accommodations || [],
        modifications: supportProfile?.modifications || [],
      };
      if (navigationModeRef.current) {
        /*
         * "SAVE ANSWER" SAVES A DRAFT AND HANDS THE ENGINE NOTHING BACK.
         *
         * Whatever this resolves to becomes QuestionEngine's `feedback`, and
         * null is the one value that shows nothing and closes nothing: a
         * result box needs a feedback object, "question complete" needs
         * status 'correct', a closed question needs `expired` with no tries
         * left, and `blocked` prints its message as an alert. So the save's
         * own outcome never comes back through here — the container shows
         * whether it saved — and the tool stays open to be changed.
         */
        if (raw) latestRawRef.current = raw;
        try {
          await onSubmitRef.current?.({
            responses: {},
            ...(raw ? { raw } : {}),
            workspaceDrafts: draftKey ? readQuestionDraftFamily(draftKey) : [],
          }, supportUsage);
        } catch { /* the container reports a save that did not land */ }
        return null;
      }
      return (await onSubmitRef.current?.({ responses: {}, raw }, supportUsage)) || null;
    },
  // The grader is chosen by the server from what it stored; the tool id only
  // selects how the engine serializes work. Stable per item.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [question.questionInstanceId, question.pathToolId]);

  // The tool's own question shape, rebuilt from the public payload with the
  // answer fields simply absent (questionFromToolPayload). Keyed on the issued
  // instance so an attempt count update never resets the construction.
  const engineQuestion = useMemo(() => ({
    ...questionFromToolPayload(question),
    questionId: question.questionInstanceId,
    ...(question.calculatorPolicy ? { calculatorPolicy: question.calculatorPolicy } : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [question.questionInstanceId, question.pathToolId]);

  const activityPolicy = useMemo(() => engineActivityPolicyForMode(policy.mode), [policy.mode]);
  // Stable per profile: the engine re-reads its tray when this object changes.
  const trayEntitlement = useMemo(
    () => (policy.secure ? secureToolTrayEntitlement(rawStudentSupportProfile) : null),
    [policy.secure, rawStudentSupportProfile],
  );
  // The calculator is the assessment's, not the tool's: a course Test's
  // blueprint setting, an item's own, or the student's documented
  // accommodation — exactly as for a field item.
  const assessmentContext = useMemo(() => ({
    mode: calculatorPolicy?.available ? calculatorPolicy.mode : 'none',
    forceAvailable: Boolean(calculatorPolicy?.available),
    accommodationOverride: calculatorPolicy?.source === 'accommodation',
  }), [calculatorPolicy?.available, calculatorPolicy?.mode, calculatorPolicy?.source]);

  return (
    <main data-rich-question-runtime={policy.mode} data-path-tool={question.pathToolId} style={{ width: 'min(1180px, 100%)', margin: '0 auto', padding: '18px 14px 64px', boxSizing: 'border-box', minWidth: 0, overflowX: 'clip' }}>
      {policy.secure && <div style={{ ...sectionLabelStyle, margin: '0 4px 8px' }}>Secure exam question</div>}
      <Suspense fallback={<p role="status" style={{ padding: 30, textAlign: 'center', color: 'var(--mm-text-muted)' }}>Opening the math workspace…</p>}>
        <QuestionEngine
          question={engineQuestion}
          questionRecord={{
            status: Number(attempt?.used || 0) > 0 ? 'attempted' : 'unattempted',
            attemptCount: Number(attempt?.used || 0),
          }}
          maximumAttempts={Number(attempt?.allowed) || activityPolicy.attempts}
          activityRole={activityPolicy.role}
          activityPolicy={activityPolicy}
          studentProfile={supportProfile}
          supportEntitlement={trayEntitlement}
          showStandardBadge={false}
          draftKey={draftKey}
          assessmentContext={assessmentContext}
          // On a secure item the final action records the one answer and the
          // verdict is withheld: it is called that, not "Check". In a test the
          // student moves around in, it saves a draft, and says so.
          submitLabel={policy.secure ? (navigationMode ? 'Save answer' : 'Record answer') : null}
          serverGrading={serverGrading}
          onResponseStateChange={handleRawWork}
          assignmentLocked={Boolean(closed)}
          assignmentLockedMessage={closedMessage || null}
          executionScope={executionScope}
          onGrade={async () => null}
        />
      </Suspense>
      <InstructionalSupport policy={policy} feedback={feedback} isToolItem />
    </main>
  );
};

export default function RichQuestionRuntime({
  question,
  mode = null,
  draftKey = null,
  initialResponsePayload = null,
  busy = false,
  // Corrections: the item is closed (answered correctly or out of tries).
  closed = false,
  closedMessage = '',
  // The server's latest result for this item, where the mode releases one.
  feedback = null,
  attempt = null,
  // Exam calculator inputs (secure modes). Without `examType` the calculator
  // follows the mode's activity policy and the item's own setting.
  examType = null,
  sessionCalculatorMode = null,
  accommodationConfirmed = false,
  studentSupportProfile = null,
  executionScope = 'student',
  // A secure test the student moves around in (see the header): no
  // per-question record step, and `onSubmit` only saves a draft.
  navigationMode = false,
  onSubmit,
  onDraftChange,
}) {
  const policy = useMemo(() => resolveQuestionRuntimePolicy(mode || question?.runtimeMode), [mode, question?.runtimeMode]);
  // On a secure item the student keeps every ACCESS accommodation and loses
  // every construct change (assessmentSupportProfile).
  const supportProfile = useMemo(
    () => (policy.secure && studentSupportProfile ? assessmentSupportProfile(studentSupportProfile) : studentSupportProfile),
    [policy.secure, studentSupportProfile],
  );
  const calculatorPolicy = useMemo(() => {
    if (!question) return null;
    if (examType) {
      return resolveExamCalculatorPolicy({
        examType,
        // A course test's blueprint names a session-wide calculator setting; it
        // travels on the session, not on each item.
        questionSpec: { ...question, sessionCalculatorMode },
        studentSupportProfile: supportProfile,
        accommodationConfirmed,
        isComputationSkill: question.assessedConstruct === 'computation',
      });
    }
    return resolveCalculatorPolicy({
      questionSpec: question,
      activityPolicy: engineActivityPolicyForMode(policy.mode),
      studentSupportProfile: supportProfile,
    });
  }, [question, examType, sessionCalculatorMode, supportProfile, accommodationConfirmed, policy.mode]);

  if (!question) return <div style={{ padding: 36, textAlign: 'center', color: 'var(--mm-text-muted)' }}>Preparing the next secure item…</div>;

  if (question.pathToolId) {
    return (
      <ToolItem
        question={question}
        policy={policy}
        calculatorPolicy={calculatorPolicy}
        supportProfile={supportProfile}
        rawStudentSupportProfile={studentSupportProfile}
        draftKey={draftKey}
        initialResponsePayload={initialResponsePayload}
        busy={busy}
        closed={closed}
        closedMessage={closedMessage}
        feedback={feedback}
        attempt={attempt}
        executionScope={executionScope}
        navigationMode={navigationMode}
        onSubmit={onSubmit}
        onDraftChange={onDraftChange}
      />
    );
  }
  return (
    <FieldItem
      question={question}
      policy={policy}
      calculatorPolicy={calculatorPolicy}
      studentSupportProfile={supportProfile}
      rawStudentSupportProfile={studentSupportProfile}
      initialResponsePayload={initialResponsePayload}
      busy={busy}
      closed={closed}
      feedback={feedback}
      navigationMode={navigationMode}
      onSubmit={onSubmit}
      onDraftChange={onDraftChange}
    />
  );
}
