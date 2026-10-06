import React from 'react';
import RichQuestionRuntime from '../question/RichQuestionRuntime.jsx';
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
  onSubmit,
  onDraftChange,
}) => (
  <RichQuestionRuntime
    question={question}
    // The secure shell renders secure modes only. A payload naming anything
    // else (or nothing) is shown as a Secure Test, never with practice help.
    mode={secureShellRuntimeMode(question)}
    draftKey={draftKey}
    initialResponsePayload={initialResponsePayload}
    busy={busy}
    examType={examType}
    sessionCalculatorMode={sessionCalculatorMode}
    accommodationConfirmed={accommodationConfirmed}
    studentSupportProfile={studentSupportProfile}
    executionScope={executionScope}
    onSubmit={onSubmit}
    onDraftChange={onDraftChange}
  />
);

export default SecureExamQuestionPlayer;
