import React, { useEffect, useMemo, useRef, useState } from 'react';
import QuestionEngine from '../QuestionEngine';
import {
  emptyQuestionRecord,
  recordQuestionAttempt,
  recordQuestionStep,
  requestReplacementQuestion,
} from '../attemptPolicy';
import { getEffectiveActivityPolicy, normalizeActivityRole } from './policies/activityPolicies';
import { stableStringify } from '../utils/idUtils';

export const MathMasterToolWrapper = ({
  activityRole,
  activityPolicy = null,
  question,
  student = null,
  executionScope = 'student',
  onAttempt,
  feedbackReleased = false,
  assessmentContext = null,
  teacherCalculatorChoice = null,
}) => {
  const role = normalizeActivityRole(activityRole || question?.activityRole || question?.role || 'classwork');
  const policy = activityPolicy || getEffectiveActivityPolicy(role);
  const [record, setRecord] = useState(() => emptyQuestionRecord());
  const recordRef = useRef(record);
  const questionKey = String(question?.questionId || question?.id || stableStringify(question || {}));
  const generationKey = useMemo(() => `tool-wrapper|${executionScope}|${questionKey}|variant:${record.variantIndex}`, [executionScope, questionKey, record.variantIndex]);
  const studentProfile = student?.supportProfile || student?.profile || student || null;

  useEffect(() => {
    const next = emptyQuestionRecord();
    recordRef.current = next;
    setRecord(next);
  }, [questionKey]);

  const saveRecord = (nextRecord) => {
    recordRef.current = nextRecord;
    setRecord(nextRecord);
  };

  const handleGrade = async (isCorrect, questionDetails, parts, supportUsage, responseKey, attemptMetadata = {}) => {
    const outcome = recordQuestionAttempt({
      record: recordRef.current,
      isCorrect,
      questionDetails,
      parts,
      supportUsage,
      responseKey,
      partialCreditPercent: attemptMetadata.partialCreditPercent,
      maximumAttempts: policy.attempts,
    });
    saveRecord(outcome.record);
    onAttempt?.({ ...outcome.result, record: outcome.record, activityRole: role, executionScope });
    return outcome.result;
  };

  const handleStepGrade = async ({ stepGrade, countsAttempt, statePatch, supportUsage = null }) => {
    const outcome = recordQuestionStep({
      record: recordRef.current,
      stepGrade,
      countsAttempt,
      statePatch,
      supportUsage,
      maximumAttempts: policy.attempts,
    });
    saveRecord(outcome.record);
    return outcome.result;
  };

  const handleReplacement = async (options) => {
    if (!policy.allowReplacement) return;
    saveRecord(requestReplacementQuestion(recordRef.current, options));
  };

  return (
    <QuestionEngine
      question={question}
      questionRecord={record}
      generationKey={generationKey}
      onGrade={handleGrade}
      onStepGrade={handleStepGrade}
      onRequestNewQuestion={handleReplacement}
      studentProfile={studentProfile}
      maximumAttempts={policy.attempts}
      activityRole={role}
      activityPolicy={policy}
      feedbackReleased={feedbackReleased}
      assessmentContext={assessmentContext}
      teacherCalculatorChoice={teacherCalculatorChoice}
      executionScope={executionScope}
      dolMode={role === 'dol'}
    />
  );
};

export default MathMasterToolWrapper;
