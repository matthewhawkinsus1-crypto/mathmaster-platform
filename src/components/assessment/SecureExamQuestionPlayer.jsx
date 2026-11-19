import React, { useCallback, useRef, useState } from 'react';
import RichQuestionRuntime from '../question/RichQuestionRuntime.jsx';
import QuestionResolutionBoundary, { questionFailureContext } from '../../QuestionResolutionBoundary.jsx';
import { secureShellRuntimeMode } from '../../platform/assessment/questionRuntimePolicy.js';

/*
 * THE SECURE EXAM'S QUESTION, THROUGH THE SHARED RICH QUESTION RUNTIME.
 *
 * This used to be a renderer of its own — radio choices and text boxes, and
 * nothing else — so a graphing, systems or algebra-workspace item placed on a
 * secure Test could not be answered with the tool it was written for. It is
 * now an adapter: the secure container decides which item is issued, saves
 * and submits, and holds the integrity shell; RichQuestionRuntime renders the
 * item — the authentic Rich Tool for a tool item, the secure response fields
 * otherwise — under the mode the SERVER put on the payload (Secure Test or
 * Secure Retest: every response tool, no assistance, no verdict).
 *
 * The SAT, ACT, TSIA2 and ASVAB simulations come through here too. Their items
 * are field items, so what they render is what they always rendered.
 *
 * ONE ITEM THAT THROWS MUST NOT TAKE THE TEST WITH IT. Nothing caught a throw
 * between the item and the app, so one item that could not render replaced the
 * whole Test screen: the header, the question list, Next and Submit. The item
 * now sits in QuestionResolutionBoundary, as a question does everywhere else.
 * The student reads "This question did not load", can Try again (the item is
 * drawn afresh; the answers saved on the server are untouched) and keeps the
 * rest of the Test, whose navigation is outside the boundary. The panel says
 * the saved answers are kept, and not that the grade is unaffected: an item
 * that cannot be shown cannot be answered, so the student is told to let the
 * teacher know. No copyable report on a secure Test (`technicalDetails={false}`):
 * the diagnostic is recorded, scrubbed, as everywhere else. A new item starts
 * clean: the container keys this player by the item. Where the item is the
 * page's <main>, so is the panel (`fallbackLandmark`).
 *
 * Try again draws the item as the student last left it. Every change reaches
 * the container as a draft (a tool's Save answer as onSubmit), and the latest
 * is kept here, so a redraw never brings back an older answer than the one
 * being saved, as "Back to questions" does in the container (latestDraftsRef).
 */
export const SecureExamQuestionPlayer = ({
  examType,
  sessionCalculatorMode = null,
  question,
  initialResponsePayload = null,
  studentSupportProfile,
  accommodationConfirmed = false,
  busy = false,
  draftKey = null,
  executionScope = 'student',
  // A secure test the student moves around freely: answers are drafts saved
  // as they work, nothing is recorded per item, and the item has no
  // "record & continue" button (RichQuestionRuntime, NAVIGATION MODE).
  navigationMode = false,
  // The exam toolbar has this item's calculator (secureExamTools.js
  // graphingCalculator): the item draws none of its own (H-19).
  calculatorInToolbar = false,
  // The item is the page's <main>. A teacher's page has one already (the Test Cycle preview) and
  // passes false: RichQuestionRuntime then draws a plain <div> (TT27, "ITS LANDMARK" there).
  mainLandmark = true,
  onSubmit,
  onDraftChange,
}) => {
  const [attempt, setAttempt] = useState(0);
  const latestDraft = useRef(initialResponsePayload);
  const draftChanged = useCallback((payload, usage) => {
    latestDraft.current = payload;
    return onDraftChange?.(payload, usage);
  }, [onDraftChange]);
  const submitted = useCallback((payload, usage) => {
    latestDraft.current = payload;
    return onSubmit?.(payload, usage);
  }, [onSubmit]);
  return (
    <QuestionResolutionBoundary
      resetKey={attempt}
      onRetry={() => setAttempt((count) => count + 1)}
      context={questionFailureContext({ question, activityRole: 'secureTest', executionScope })}
      executionScope={executionScope}
      draftKey={draftKey}
      technicalDetails={false}
      savedWorkNote="Your saved answers are kept exactly as they are."
      fallbackLandmark={mainLandmark ? 'main' : null}
    >
      <RichQuestionRuntime
        key={attempt}
        question={question}
        // The secure shell renders secure modes only. A payload naming anything
        // else (or nothing) is shown as a Secure Test, never with practice help.
        mode={secureShellRuntimeMode(question)}
        draftKey={draftKey}
        initialResponsePayload={attempt ? latestDraft.current : initialResponsePayload}
        busy={busy}
        examType={examType}
        sessionCalculatorMode={sessionCalculatorMode}
        accommodationConfirmed={accommodationConfirmed}
        studentSupportProfile={studentSupportProfile}
        executionScope={executionScope}
        navigationMode={navigationMode}
        calculatorInToolbar={calculatorInToolbar}
        mainLandmark={mainLandmark}
        onSubmit={submitted}
        onDraftChange={draftChanged}
      />
    </QuestionResolutionBoundary>
  );
};

export default SecureExamQuestionPlayer;
