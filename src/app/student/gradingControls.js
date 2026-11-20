/*
 * GRADING A QUESTION: SUBMIT (handleGradeSubmit), A STEP OF A STEPPED QUESTION, A NEW VERSION OF A QUESTION, AND WHICH VERSION AND WHICH TRIES COUNT.
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitAssignmentRuntime.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs they read and fill.
 */
import { checkpointDocumentId, normalizeCheckpointResponse } from '../../platform/performance/responseCheckpoint.js';
import { REPLACEMENT_NOT_QUEUED, STEP_NOT_QUEUED, SUBMISSION_NOT_QUEUED } from '../../platform/student/submissionNotQueued.js';
import { readLocalDeliveryPin } from '../../platform/generation/familyDeliveryPins.js';
import { countedQuestion, countedQuestionKnown, shownDeliveryKey } from '../../platform/generation/shownFamilyQuestion.js';
import { familySlotKey, isFamilyBackedQuestion } from '../../../functions/shared/questionFamilySlot.mjs';
import { normalizeDeliveryPin } from '../../../functions/shared/questionGenerationIdentity.mjs';
import {
  normalizeQuestionRecord, recordQuestionAttempt, recordQuestionStep, requestReplacementQuestion,
  resolveQuestionMaximumAttempts, resolveTeacherGrantedExtraAttempts,
} from '../../attemptPolicy';
import { getAssignmentLifecycle, getDOLState, getSectionVariantMode } from '../../assignmentLifecycle';
import { buildSupportUsage } from '../../studentSupport';
import { startPerformanceSpan } from '../../platform/performance/performanceTelemetry.js';
import { createDurableAction, enqueueDurableAction } from '../../platform/performance/durableActionOutbox.js';
import { captureSectionAccessProof, normalizeStepWork } from '../../../functions/shared/submissionEnvelope.mjs';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { buildAttemptEvidenceEvent } from '../../platform/history/evidenceEvent.js';
import { projectTeacherOverridesForDisplay } from '../../platform/grading/canonicalGradeProjection.js';
import { withUnstoredWork, withoutUnstoredWork } from '../../platform/student/saveStatusModel.js';
import { calculateDOLSectionScore, captureTimedSectionAccess, createPracticeAssignmentTracker, warmupCaptureWasActive } from './assignmentRuntimeHelpers.js';
import { resolveDeliveredQuestionMetadata } from '../../platform/assignments/assignmentAdaptation.js';

export function createGradingControls(
  user, studentRequiredFor, assignments, activeAssignmentId, setTracker, tracker, setStudentOutboxDepth,
  setStudentPersistenceStatus, setStudentUnstoredAssignmentIds, practiceTracker, setPracticeTracker, previewTracker,
  setPreviewTracker, currentQuestionIndex, classSchedule, dolGradesByAssignment, setDolGradesByAssignment,
  getSectionAccessState, setSupportUsageByAssignment, supportUsageByAssignment, teacherGradeOverridesByAssignment,
  studentLearningProfile, lastAcademicInteractionRef, activeTimeRef, markAnswerSent, reconcileAndReportStudentOutbox,
  flushAssignmentActivity, activeQuestions, isTeacherPreview, activeQuestionRole, activeActivityPolicy,
  familyDelivery, isPersonalizedBlueprint, familyDeliveriesRef, dealtFamilyQuestionsRef,
) {
  // The question a slot's pin dealt, rebuilt as the server rebuilds it to
  // count, for the signed-in student. It comes with the family engine, so
  // until the engine lands there is none.
  const dealFor = (assignment, questionIndex, record) => (familyDelivery && user?.role === 'student' && user?.id
    ? ({ slot, variant, storedQuestion }) => familyDelivery.dealtFamilyQuestion({
      assignment,
      question: storedQuestion,
      questionIndex,
      record,
      devicePin: readLocalDeliveryPin({ studentId: user.id, slotKey: slot, variant }),
      studentId: user.id,
      classId: user.classId || null,
      cache: dealtFamilyQuestionsRef.current,
    })
    : null);
  // What every try count below reads for one stored slot: the questions shown
  // on this page, then that deal (platform/generation/shownFamilyQuestion.js).
  const triesCountingFor = (assignment, questionIndex, record, preview = false) => ({
    shown: familyDeliveriesRef.current,
    deal: dealFor(assignment, questionIndex, record),
    assignmentId: assignment?.id,
    storedQuestion: getStoredAssignmentQuestions(assignment)[questionIndex],
    questionIndex,
    record,
    preview,
  });
  // The question every try count below reads: the one shown for this slot and
  // variant; where nothing has been shown on this device yet (after a reload,
  // a slot not opened again), the one its pin dealt, as the server counts it;
  // else `fallback` (platform/generation/shownFamilyQuestion.js, P-7).
  const countedQuestionFor = (assignment, questionIndex, record, fallback, preview = false) => countedQuestion({
    ...triesCountingFor(assignment, questionIndex, record, preview),
    fallback,
  });
  // Whether that question is the one the student was dealt. Not for a family
  // slot nothing has shown on this page before the engine lands (a reload
  // straight into the assignment): the stored slot stands in, and the question
  // list counts nothing on it (assignmentNavigator.js PENDING).
  const countedQuestionKnownFor = (assignment, questionIndex, record, preview = false) => countedQuestionKnown(
    triesCountingFor(assignment, questionIndex, record, preview),
  );
  // What questionIsTerminal needs to count a family slot as the list does:
  // where it is stored, what this page has shown and the engine's deal
  // (platform/student/studentWorkState.js). Start/Continue and Home's Today
  // rule both read it, so they keep answering "finished?" the same way. Home
  // asks for every question it lists, so nothing here is worked out until a
  // count needs it.
  const terminalCountingFor = (assignment, questionIndex, record) => ({
    questionIndex,
    shown: familyDeliveriesRef.current,
    deal: dealFor(assignment, questionIndex, record),
  });

  /** The pin (and rendered question) for a family-backed slot, or null. */
  const familyDeliveryForQuestion = (assignment, questionIndex, record) => {
    const storedQuestion = getStoredAssignmentQuestions(assignment)[questionIndex];
    if (!assignment?.id || !isFamilyBackedQuestion(storedQuestion)) return null;
    const variant = normalizeQuestionRecord(record).variantIndex;
    const slotKey = familySlotKey({ assignmentId: assignment.id, question: storedQuestion, storageIndex: questionIndex });
    const remembered = familyDeliveriesRef.current.get(shownDeliveryKey({ slot: slotKey, variant }));
    const pin = normalizeDeliveryPin(remembered?.delivery)
      || readLocalDeliveryPin({ studentId: user?.id, slotKey, variant })
      || (normalizeDeliveryPin(record?.familyDelivery)?.variant === variant ? normalizeDeliveryPin(record.familyDelivery) : null);
    return pin ? { pin, renderedQuestion: remembered?.question || null } : null;
  };

  const handleGradeSubmit = async (isCorrect, specificQuestionData, parts = [], supportUsage = null, responseKey = '', attemptMetadata = {}) => {
    if (!activeAssignmentId) return null;
    if (!isTeacherPreview) lastAcademicInteractionRef.current = Date.now();

    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    const teacherGrantedExtraAttempts = resolveTeacherGrantedExtraAttempts({
      assignment: localAssignment,
      activityRole: activeQuestionRole,
      classId: user?.classId || null,
      studentId: user?.role === 'student' ? user.id : null,
    });
    const applyAttempt = (record) =>
      recordQuestionAttempt({
        record,
        isCorrect,
        questionDetails: specificQuestionData,
        timeSpent: activeTimeRef.current,
        parts,
        supportUsage,
        responseKey,
        partialCreditPercent: attemptMetadata.partialCreditPercent,
        maximumAttempts: resolveQuestionMaximumAttempts({
          question: countedQuestionFor(localAssignment, currentQuestionIndex, record, activeQuestions[currentQuestionIndex], isTeacherPreview),
          maximumAttempts: activeActivityPolicy.attempts,
          activityPolicy: activeActivityPolicy,
          teacherGrantedExtraAttempts,
        }),
      });

    if (isTeacherPreview) {
      const outcome = applyAttempt(previewTracker[currentQuestionIndex]);
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: outcome.record,
      }));
      return outcome.result;
    }

    if (user?.role !== 'student') return null;

    const submissionCapturedAt = Date.now();
    const timedSectionAccess = captureTimedSectionAccess({
      activityRole: activeQuestionRole,
      assignment: localAssignment,
      schedule: classSchedule,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      capturedAt: submissionCapturedAt,
    });
    const teacherReopenedWarmupIsActive = activeQuestionRole === 'warmup'
      && warmupCaptureWasActive(timedSectionAccess, submissionCapturedAt)
      && timedSectionAccess?.teacherTimerScheduled === true;
    if (getAssignmentLifecycle(localAssignment, submissionCapturedAt, { studentId: user.id }).isPracticeOnly && !teacherReopenedWarmupIsActive) {
      const currentPractice = practiceTracker[activeAssignmentId]
        || createPracticeAssignmentTracker(getStoredAssignmentQuestions(localAssignment), tracker[activeAssignmentId] || {});
      const outcome = applyAttempt(currentPractice[currentQuestionIndex]);
      setPracticeTracker((current) => ({
        ...current,
        [activeAssignmentId]: {
          ...(current[activeAssignmentId] || currentPractice),
          [currentQuestionIndex]: outcome.record,
        },
      }));
      return outcome.result;
    }

    // The subscribed assignment is the authorization snapshot for the local
    // interaction. Revalidate it before persistence below, but do not make a
    // student's click wait for an otherwise redundant getDoc roundtrip.
    const assignment = localAssignment;
    const gradingSpan = startPerformanceSpan('grading_ms', { flow: 'ordinary_assignment' });
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const outcome = applyAttempt(currentAssignmentGrades[currentQuestionIndex]);
    gradingSpan.finish({ status: 'graded' });
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: outcome.record,
      },
    };

    const previousSupport = supportUsageByAssignment[activeAssignmentId] || { modified: false, accommodations: [], modifications: [] };
    const updatedSupportUsage = {
      ...supportUsageByAssignment,
      [activeAssignmentId]: {
        modified: Boolean(previousSupport.modified || supportUsage?.modified),
        accommodations: [...new Set([...(previousSupport.accommodations || []), ...(supportUsage?.accommodations || [])])],
        modifications: [...new Set([...(previousSupport.modifications || []), ...(supportUsage?.modifications || [])])],
      },
    };

    /*
     * NO CLASSWORK COMPLETION IS COMPUTED HERE.
     *
     * `updatedTracker` is the local overlay and this attempt is not canonical
     * yet — it is about to be queued. Deriving completion from it and carrying
     * it forward would be the browser asserting a projection the gradebook
     * cannot support. Server ingestion derives it from canonical records in
     * the same transaction that records this attempt.
     */
    let updatedDOLGrades = dolGradesByAssignment;
    const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: Date.now() });
    if (activeQuestionRole === 'dol' && dolState.status === 'active' && (dolState.questionIndices || [dolState.questionIndex]).includes(currentQuestionIndex)) {
      const date = new Date();
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dolOmitted = new Set(studentRequiredFor(assignment, { assignmentTracker: updatedTracker?.[activeAssignmentId] || null }).omitted);
      const studentDolIndices = (dolState.questionIndices || [dolState.questionIndex]).filter((index) => !dolOmitted.has(index));
      updatedDOLGrades = {
        ...dolGradesByAssignment,
        [activeAssignmentId]: {
          ...(dolGradesByAssignment?.[activeAssignmentId] || {}),
          [dateKey]: {
            finalized: false,
            score: calculateDOLSectionScore(
              projectTeacherOverridesForDisplay(
                updatedTracker,
                teacherGradeOverridesByAssignment,
              )[activeAssignmentId] || {},
              studentDolIndices,
              assignment,
            ),
            questionIndex: studentDolIndices[0] ?? currentQuestionIndex,
            questionIndices: studentDolIndices,
            recordedAt: new Date().toISOString(),
            status: 'section-in-progress',
          },
        },
      };
    }

    const assignmentQuestions = getStoredAssignmentQuestions(assignment);
    const evidenceEvent = assignmentQuestions[currentQuestionIndex]?.type === 'modelingLab'
      ? null
      : buildAttemptEvidenceEvent({
        studentId: user.id,
        assignment,
        question: assignmentQuestions[currentQuestionIndex],
        questionIndex: currentQuestionIndex,
        activityRole: activeQuestionRole,
        attemptRecord: outcome.record,
        attemptResult: outcome.result,
        supportUsage: outcome.record.supportUsage || supportUsage || {},
        delivered: resolveDeliveredQuestionMetadata({
          question: assignmentQuestions[currentQuestionIndex],
          learningProfile: studentLearningProfile,
          activityRole: activeQuestionRole,
          variationMode: getSectionVariantMode(assignment, activeQuestionRole),
          honors: String(user?.profile?.courseLevel || '').toLowerCase() === 'honors',
        }),
      });
    const capturedSectionAccess = captureSectionAccessProof({
      sectionAccess: getSectionAccessState({
        assignment,
        activityRole: activeQuestionRole,
        classId: user.classId || null,
        classPeriod: user.classPeriod,
        nowValue: submissionCapturedAt,
        studentId: user.id,
      }),
      capturedAt: submissionCapturedAt,
    });
    // Built from the student's own parts and response key through the SHARED
    // contract, so what the server re-grades is exactly what the browser saw.
    // A family-backed slot is answered against ITS rendered instance (type and
    // fields), and its delivery pin travels with the attempt so the server can
    // re-create exactly this question.
    const familyDelivery = familyDeliveryForQuestion(assignment, currentQuestionIndex, currentAssignmentGrades[currentQuestionIndex]);
    const capturedResponse = normalizeCheckpointResponse(
      familyDelivery?.renderedQuestion || assignmentQuestions[currentQuestionIndex],
      // A registry tool's structured raw work (built through the shared tool
      // response contract by QuestionEngine) travels as itself; the server
      // grades it with the same shared grader the browser just used.
      { parts, responseKey, isComplete: true, toolResponse: attemptMetadata?.toolResponse || null },
    );

    let queuedAction;
    try {
      setStudentPersistenceStatus('capturing');
      queuedAction = await enqueueDurableAction(createDurableAction({
        kind: 'ordinarySubmission',
        studentId: user.id,
        assignmentId: activeAssignmentId,
        questionIndex: currentQuestionIndex,
        createdAt: submissionCapturedAt,
        payload: {
          previousTotalAttempts: Number(normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).totalAttempts) || 0,
          activityRole: activeQuestionRole,
          timedSectionAccess,
          // THE SECTION STATE AS IT WAS WHEN THE STUDENT PRESSED SUBMIT.
          //
          // The only witness a teacher's later close cannot rewrite. Without it
          // a Classwork answer given at 10:10 and closed at 10:15 is
          // indistinguishable from one given after the close — and the old
          // reconciler resolved that ambiguity by destroying the answer.
          capturedSectionAccess,
          // The student's RAW response, so the server can mark this itself for
          // every question type the shared grading contract supports. Where it
          // can, the browser's verdict is discarded at ingestion.
          response: capturedResponse,
          familyDelivery: familyDelivery?.pin || null,
          questionId: assignmentQuestions[currentQuestionIndex]?.questionId || assignmentQuestions[currentQuestionIndex]?.id || null,
          variantIndex: normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).variantIndex,
          timeSpentSeconds: activeTimeRef.current,
          // Retiring this question's checkpoint rides the same transaction as
          // the attempt, so a deadline can never turn one response into two.
          checkpointDocumentId: checkpointDocumentId({
            studentId: user.id,
            assignmentId: activeAssignmentId,
            questionIndex: currentQuestionIndex,
            questionId: assignmentQuestions[currentQuestionIndex]?.questionId || assignmentQuestions[currentQuestionIndex]?.id || '',
            variantIndex: normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).variantIndex,
            generationKey: `${activeAssignmentId}|${user.id}|${currentQuestionIndex}|variant:${normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).variantIndex}`,
          }),
          record: outcome.record,
          supportUsage: updatedSupportUsage[activeAssignmentId],
          hasClassworkGrade: false,
          classworkGrade: null,
          hasDolGrade: Object.hasOwn(updatedDOLGrades, activeAssignmentId),
          dolGrade: updatedDOLGrades[activeAssignmentId] ?? null,
          evidenceEvent,
        },
      }));
      // An answer is on its way only once it is in the device queue: a
      // no-credit practice submit or one that could not be stored is not
      // (RUN-11, saveStatusModel.js).
      markAnswerSent();
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      // Nothing was recorded anywhere, so nothing was submitted: no verdict,
      // no try used, the question stays open with Submit (RUN-3). A `null`
      // here used to read as "show the device's own verdict" — "Correct!",
      // locked, and no Submit to press again. It is said once, by the
      // question's own alert (SUBMISSION_NOT_QUEUED.message), where Submit is:
      // no toast repeats it.
      console.error('Could not durably queue this response:', error);
      setStudentUnstoredAssignmentIds((ids) => withUnstoredWork(ids, activeAssignmentId));
      setStudentPersistenceStatus('volatile');
      return SUBMISSION_NOT_QUEUED;
    }

    setTracker(updatedTracker);
    setStudentUnstoredAssignmentIds((ids) => withoutUnstoredWork(ids, activeAssignmentId));
    setSupportUsageByAssignment(updatedSupportUsage);
    setDolGradesByAssignment(updatedDOLGrades);

    const serverAckSpan = startPerformanceSpan('submit_server_ack_ms', { flow: 'ordinary_assignment' });
    // The immutable envelope is already durable in IndexedDB. Canonical grade
    // and idempotent evidence reconciliation can now happen without extending
    // the student's critical interaction path.
    void (async () => {
      try {
        await reconcileAndReportStudentOutbox({ successStatus: 'submitted' });
        await flushAssignmentActivity(activeAssignmentId);
        serverAckSpan.finish({ status: 'durable' });
      } catch (error) {
        serverAckSpan.finish({ status: 'failed' });
        console.error('Response remains queued for retry:', queuedAction.actionId, error);
      }
    })();

    return outcome.result;
  };

  // `stepWork` is the step's raw work (Step Algebra: the states before and
  // after, the operation, the support level — never a verdict). It travels in
  // the durable step submission so the server derives the step's credit from
  // the work itself (functions/shared/serverGrading/
  // stepAlgebraStepVerification.mjs) instead of trusting this record.
  const handleStepGrade = async ({ stepGrade, countsAttempt, statePatch, supportUsage: providedSupportUsage = null, stepWork = null }) => {
    if (!activeAssignmentId) return null;
    const supportUsage = providedSupportUsage || buildSupportUsage(user?.profile, activeQuestions[currentQuestionIndex]);
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    const teacherGrantedExtraAttempts = resolveTeacherGrantedExtraAttempts({
      assignment: localAssignment,
      activityRole: activeQuestionRole,
      classId: user?.classId || null,
      studentId: user?.role === 'student' ? user.id : null,
    });
    // `occurredAt` is the step's capture time on the durable path, so this
    // record and the one the server derives carry the same timestamps.
    const applyStep = (record, occurredAt = null) =>
      recordQuestionStep({
        record,
        stepGrade,
        countsAttempt,
        statePatch,
        supportUsage,
        maximumAttempts: resolveQuestionMaximumAttempts({
          question: countedQuestionFor(localAssignment, currentQuestionIndex, record, activeQuestions[currentQuestionIndex], isTeacherPreview),
          maximumAttempts: activeActivityPolicy.attempts,
          activityPolicy: activeActivityPolicy,
          teacherGrantedExtraAttempts,
        }),
        occurredAt,
      });

    if (isTeacherPreview) {
      const outcome = applyStep(previewTracker[currentQuestionIndex]);
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: outcome.record,
      }));
      return outcome.result;
    }

    if (user?.role !== 'student') return null;
    const stepCapturedAt = Date.now();
    const stepTimedSectionAccess = captureTimedSectionAccess({
      activityRole: activeQuestionRole,
      assignment: localAssignment,
      schedule: classSchedule,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      capturedAt: stepCapturedAt,
    });
    const teacherReopenedWarmupStepIsActive = activeQuestionRole === 'warmup'
      && warmupCaptureWasActive(stepTimedSectionAccess, stepCapturedAt)
      && stepTimedSectionAccess?.teacherTimerScheduled === true;
    if (getAssignmentLifecycle(localAssignment, stepCapturedAt, { studentId: user.id }).isPracticeOnly && !teacherReopenedWarmupStepIsActive) {
      const currentPractice = practiceTracker[activeAssignmentId]
        || createPracticeAssignmentTracker(getStoredAssignmentQuestions(localAssignment), tracker[activeAssignmentId] || {});
      const outcome = applyStep(currentPractice[currentQuestionIndex]);
      setPracticeTracker((current) => ({
        ...current,
        [activeAssignmentId]: {
          ...(current[activeAssignmentId] || currentPractice),
          [currentQuestionIndex]: outcome.record,
        },
      }));
      return outcome.result;
    }
    const assignment = localAssignment;
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const priorRecord = normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]);
    const outcome = applyStep(priorRecord, stepCapturedAt);
    const updatedTracker = { ...tracker, [activeAssignmentId]: { ...currentAssignmentGrades, [currentQuestionIndex]: outcome.record } };
    const previousSupport = supportUsageByAssignment[activeAssignmentId] || { modified: false, accommodations: [], modifications: [] };
    const assignmentSupportUsage = {
      modified: Boolean(previousSupport.modified || supportUsage.modified),
      accommodations: [...new Set([...(previousSupport.accommodations || []), ...(supportUsage.accommodations || [])])],
      modifications: [...new Set([...(previousSupport.modifications || []), ...(supportUsage.modifications || [])])],
    };
    const updatedSupportUsage = { ...supportUsageByAssignment, [activeAssignmentId]: assignmentSupportUsage };
    // As above: completion is the server's projection from canonical records,
    // never this browser's from a tracker holding unqueued work.
    try {
      setStudentPersistenceStatus('capturing');
      await enqueueDurableAction(createDurableAction({
        kind: 'stepSubmission', studentId: user.id, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex,
        createdAt: stepCapturedAt,
        payload: {
          previousTotalAttempts: Number(priorRecord.totalAttempts) || 0,
          activityRole: activeQuestionRole,
          timedSectionAccess: stepTimedSectionAccess,
          // Rapid step submissions are the case that most needs capture-time
          // eligibility: several of them can be queued inside the seconds it
          // takes a teacher to close a section.
          capturedSectionAccess: captureSectionAccessProof({
            sectionAccess: getSectionAccessState({
              assignment,
              activityRole: activeQuestionRole,
              classId: user.classId || null,
              classPeriod: user.classPeriod,
              nowValue: stepCapturedAt,
              studentId: user.id,
            }),
            capturedAt: stepCapturedAt,
          }),
          questionId: activeQuestions[currentQuestionIndex]?.questionId || activeQuestions[currentQuestionIndex]?.id || null,
          variantIndex: priorRecord.variantIndex,
          familyDelivery: familyDeliveryForQuestion(assignment, currentQuestionIndex, priorRecord)?.pin || null,
          timeSpentSeconds: activeTimeRef.current,
          record: outcome.record,
          // The step's raw work, bounded (null when the surface reports none,
          // or when it cannot be read whole): with it the server derives this
          // step's credit itself; without it the record above is sanitized.
          stepWork: normalizeStepWork(stepWork),
          supportUsage: assignmentSupportUsage,
          hasClassworkGrade: false,
          classworkGrade: null,
          hasDolGrade: false,
        },
      }));
      markAnswerSent();
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      // Nothing was recorded, so the step was not taken: the solver keeps it
      // on the board unapplied and says so in its own alert, inside Work View
      // where the student is (STEP_NOT_QUEUED). A toast here sat under Work
      // View, and `null` let the solver apply the step as if it were saved.
      console.error('Could not durably queue this algebra step:', error);
      setStudentUnstoredAssignmentIds((ids) => withUnstoredWork(ids, activeAssignmentId));
      setStudentPersistenceStatus('volatile');
      return STEP_NOT_QUEUED;
    }
    setTracker(updatedTracker);
    setStudentUnstoredAssignmentIds((ids) => withoutUnstoredWork(ids, activeAssignmentId));
    setSupportUsageByAssignment(updatedSupportUsage);
    void (async () => {
      try {
        await reconcileAndReportStudentOutbox();
        await flushAssignmentActivity(activeAssignmentId);
      } catch (error) {
        console.error('Algebra step remains queued for retry:', error);
      }
    })();
    return outcome.result;
  };

  const handleRequestNewQuestion = async (options = {}) => {
    if (!activeAssignmentId) return;

    const replacementBlueprint = activeQuestions[currentQuestionIndex];
    // A replacement must be a different question. One that cannot vary would
    // come back identical, with fresh attempts, right after its solution was
    // shown (see resolveQuestionReplacementAllowed).
    if (!isPersonalizedBlueprint(replacementBlueprint)) {
      return;
    }

    if (isTeacherPreview) {
      const replacement = requestReplacementQuestion(
        previewTracker[currentQuestionIndex],
        options,
      );
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: replacement,
      }));
      return;
    }

    if (user?.role !== 'student') return;
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    if (getAssignmentLifecycle(localAssignment, Date.now(), { studentId: user.id }).isPracticeOnly) {
      const currentPractice = practiceTracker[activeAssignmentId]
        || createPracticeAssignmentTracker(getStoredAssignmentQuestions(localAssignment), tracker[activeAssignmentId] || {});
      const replacement = requestReplacementQuestion(currentPractice[currentQuestionIndex], options);
      setPracticeTracker((current) => ({
        ...current,
        [activeAssignmentId]: {
          ...(current[activeAssignmentId] || currentPractice),
          [currentQuestionIndex]: replacement,
        },
      }));
      return;
    }
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const replacement = requestReplacementQuestion(
      currentAssignmentGrades[currentQuestionIndex],
      options,
    );
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: replacement,
      },
    };

    let updatedDOLGrades = dolGradesByAssignment;
    if (options.clearHistory) {
      const date = new Date();
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const assignmentDol = { ...(dolGradesByAssignment?.[activeAssignmentId] || {}) };
      delete assignmentDol[dateKey];
      updatedDOLGrades = { ...dolGradesByAssignment, [activeAssignmentId]: assignmentDol };
    }

    try {
      setStudentPersistenceStatus('capturing');
      await enqueueDurableAction(createDurableAction({
        kind: 'questionReplacement', studentId: user.id, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex,
        payload: {
          previousTotalAttempts: Number(normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).totalAttempts) || 0,
          activityRole: activeQuestionRole,
          questionId: activeQuestions[currentQuestionIndex]?.questionId || activeQuestions[currentQuestionIndex]?.id || null,
          variantIndex: Number(replacement?.variantIndex) || 0,
          record: replacement,
          supportUsage: supportUsageByAssignment[activeAssignmentId] || { modified: false, accommodations: [], modifications: [] },
          hasClassworkGrade: false,
          hasDolGrade: Boolean(options.clearHistory),
          dolGrade: updatedDOLGrades[activeAssignmentId] ?? {},
        },
      }));
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      // Nothing was recorded: the question and its work stay, and the engine
      // says so under its own button (REPLACEMENT_NOT_QUEUED). No toast.
      console.error('Could not durably queue a replacement question:', error);
      setStudentUnstoredAssignmentIds((ids) => withUnstoredWork(ids, activeAssignmentId));
      setStudentPersistenceStatus('volatile');
      return REPLACEMENT_NOT_QUEUED;
    }
    setTracker(updatedTracker);
    setStudentUnstoredAssignmentIds((ids) => withoutUnstoredWork(ids, activeAssignmentId));
    if (options.clearHistory) setDolGradesByAssignment(updatedDOLGrades);
    void reconcileAndReportStudentOutbox().catch((error) => console.error('Question replacement remains queued for retry:', error));
  };
  return [
    countedQuestionFor, countedQuestionKnownFor, terminalCountingFor, familyDeliveryForQuestion, handleGradeSubmit,
    handleStepGrade, handleRequestNewQuestion,
  ];
}
