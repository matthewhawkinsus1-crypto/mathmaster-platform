/*
 * WHAT THE WORKSPACE'S ASSIGNMENT ACTIONS RUN (the teacher's first load,
 * third pass).
 *
 * The handlers behind Pre-Flight, the assignment intake and setup editor, the
 * question editor's Save, Duplicate, Library repair and Dates & Classes, moved
 * out of ./TeacherWorkspace.jsx verbatim and in their original order. They
 * were about 1,400 lines of the workspace's chunk, which every teacher
 * downloaded, parsed and ran before Home drew, though no screen draws with
 * them: an action runs them. Every one is async, and each was already called
 * for its promise.
 *
 * The workspace builds them on each render, as it did when they were inline,
 * from the props and helpers of the same name (`scope`), and takes them
 * through ./authoringKitLoader.js: fetched while the browser is idle once the
 * workspace has drawn, before the authoring code they use, and at once by an
 * action that comes first. Once here, an action runs at once, as before; a
 * request that fails reaches AppErrorBoundary, as the authoring code's does.
 */
import { addDoc, collection, deleteField, doc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { joinTrackerOutsideTransaction, writeTrackerWhole } from '../../platform/grades/responseDetailStore.js';
import { db } from '../../firebase';
import { classDolFieldPatch } from '../../platform/assessment/dolAttemptGrantClient.js';
import { updateAssignmentClassroomPublications } from '../../classroomApi';
import { emptyQuestionRecord } from '../../attemptPolicy';
import { hydrateAssignmentCcmr } from '../../services/assignmentCcmrService.js';
import { auditAlignmentSpecificity, validateAlignments } from '../../platform/contract/alignments';
import { assignmentIsForStudent, localDateKey, resolveDOLQuestionIndex, questionIsIncluded } from '../../assignmentLifecycle';
import { resolveQuestionActivityRole } from '../../platform/policies/activityPolicies';
import { normalizeFolderPath } from '../../assignmentFolders';
import { buildDestinationGroups, destinationAssignmentKey, findAssignmentKeyConflict, isLibraryAssignment, resolveAssignmentDates, resolveCreationMode } from '../../assignmentDestinations';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../platform/contract/assignmentSchemaV5.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions, getStoredAssignmentTypeProjection, getStoredAssignmentVariantMode, storedAssignmentToV5, testCycleContractFields, lessonSupportsFields } from '../../platform/contract/storedAssignmentV5.js';
import { normalizeQuestionWeight } from '../../platform/grading/questionWeights.js';
import { normalizeLessonPublishingIntentV5 } from '../../platform/authoring/lessonPublishingIntent.js';
import { createQuestionId, normalizeAssignmentQuestions } from '../student/assignmentRuntimeHelpers.js';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';
import { attachTestCycleContract, preflightTestCycleCandidate, updateTestCyclePolicy } from '../../services/testCycleService.js';
import { TEST_CYCLE_CONTRACT_EDIT, planTestCycleContractEdit } from '../../platform/assessment/testCycleContractEdit.js';
import { currentGradingPeriodStamp } from '../../platform/student/gradingPeriods.js';
import { shouldAutoPublishClassroomPackage } from '../../platform/classroom/automaticClassroomPublishing.js';
import { practicePassesAllowed, rewardPolicyAfterEdit, rewardPolicyForNewAssignment } from '../../platform/rewards/practicePassPolicy.js';


export function createAssignmentActions(scope) {
  const {
    allStudents,
    assignmentFolderPaths,
    assignmentPreflight,
    assignments,
    authoringKit,
    autoPublishAssignmentPackageToClassroom,
    classes,
    confirmAction,
    editingAssignmentDates,
    fetchAssignments,
    gradingPeriodSettings,
    openAssignmentPreflight,
    questionEditorAssignment,
    requireAuthoringKit,
    saveAssignmentFolderPaths,
    setAssignmentPreflight,
    setAssignmentPreflightBusy,
    setEditingAssignmentId,
    setQuestionEditorAssignment,
    toastError,
    toastInfo,
    toastSuccess,
    toastWarning,
    user,
    V5_COMPILER_PLUMBING_ERROR,
  } = scope;
  // Reads the one supported Assignment V5 object and reports what is wrong in
  // terms an AI can act on, rather than throwing a single opaque message.
  const readAssignmentJson = (rawText) => {
    const { parseAssignmentBlueprintText, validateAssignmentQuestions, validateQuestionsSemantics } = requireAuthoringKit();
    const errors = [];
    const warnings = [];
    let parsed = null;
    try {
      parsed = parseAssignmentBlueprintText(rawText);
    } catch (error) {
      // A compile throw is not the same as unreadable input, and treating it as
      // one is what made salvage unreachable for the case it exists for. The
      // commonest V5 failure is a single question the compiler refuses — "V5
      // question 3 does not contain enough mathematical intent" — thrown from
      // the middle of the compile. The document itself is still a perfectly
      // legible V5 with nineteen good questions in it, but discarding it here
      // left the salvage check with no assignment to look at and no schema
      // version to recognise, so the teacher was told to take the whole
      // assignment back to the AI over one question.
      //
      // The raw text is re-read as plain JSON instead. This is deliberately not
      // a second compiler: it recovers the authored document so it can be saved
      // and repaired, and every question in it still has to pass Preflight
      // before anything can be published.
      let recoveredV5 = null;
      try {
        const document = JSON.parse(rawText);
        if (document && typeof document === 'object' && Number(document.schemaVersion) === 5) {
          recoveredV5 = document;
        }
      } catch {
        recoveredV5 = null;
      }

      if (!recoveredV5) {
        return { ok: false, errors: [error.message], warnings, sourceSchemaVersion: null, compilerDefect: false };
      }

      return {
        ok: false,
        errors: [error.message],
        warnings,
        parsed: { assignmentV5: recoveredV5, questions: [] },
        sourceSchemaVersion: 5,
        compilerDefect: V5_COMPILER_PLUMBING_ERROR.test(String(error.message)),
      };
    }

    // What the compiler itself noticed while reading the file (a function base
    // the bridge cannot grade, say) is the teacher's to see as well. It used to
    // stop here, so the question shipped with the warning never read (TT08).
    warnings.push(...(Array.isArray(parsed.warnings) ? parsed.warnings : []));

    try {
      validateAssignmentQuestions(parsed.questions, { variantMode: parsed.assignmentV5?.variantPolicy?.mode });
    } catch (error) {
      errors.push(error.message);
    }

    parsed.questions.forEach((question, index) => {
      const result = validateAlignments(question, { label: `Question ${index + 1}` });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });

    // One TEKS copied onto every question is the commonest authoring mistake an
    // AI makes, and it silently corrupts mastery evidence rather than failing.
    warnings.push(...auditAlignmentSpecificity(parsed.questions).warnings);

    // A recognized type is not enough: the renderer has to be able to show it.
    const semantic = validateQuestionsSemantics(parsed.questions);
    errors.push(...semantic.errors);
    warnings.push(...semantic.warnings);

    if (errors.length) {
      const sourceSchemaVersion = parsed.sourceSchemaVersion || null;
      const compilerDefect = Number(sourceSchemaVersion) === 5
        && errors.every((message) => V5_COMPILER_PLUMBING_ERROR.test(String(message)));
      return { ok: false, errors, warnings, parsed, sourceSchemaVersion, compilerDefect };
    }

    return {
      ok: true,
      errors,
      warnings,
      parsed,
      sourceSchemaVersion: parsed.sourceSchemaVersion || null,
      compilerDefect: false,
    };
  };

  // Single entry point for pasted, uploaded and dropped JSON.
  const handleAssignmentJsonReady = async ({ text, sourceName, incompleteDraftId = null }) => {
    const { buildAssignmentV5PreflightModel, canSalvageV5IntakeResult, ccmrAuditWarnings, parseAssignmentBlueprintText, proveImportedCcmrClaims } = await authoringKit();
    let sourceText = text;
    let ccmrAudit = null;

    // Every authoring route gets the same CCMR treatment. Built-in AI is
    // already bank-backed, while ChatGPT/Claude/Gemini JSON is hydrated here
    // before local V5 compilation and Preflight. If the network is temporarily
    // unavailable, import still works; Preflight will visibly flag any direct
    // exam-style item that lacks audited-bank provenance.
    try {
      const raw = JSON.parse(String(text || ''));
      const isCanonicalSelfExport = raw?.portableContract?.kind === 'mathmasterCanonicalAssignmentV5'
        && Number(raw?.portableContract?.version) === 1;
      if (
        raw
        && !Array.isArray(raw)
        && Number(raw.schemaVersion) === 5
        && Array.isArray(raw.sections)
        && !isCanonicalSelfExport
      ) {
        const hydrated = await hydrateAssignmentCcmr(raw, { ensurePracticeTarget: false, includeCandidates: true });
        // A question written as exam practice becomes the audited item it
        // imitates only when MathMaster's checks pass with that item in its
        // place; one no offered item passes for stays as written
        // (canonicalCcmrHydration.js). Compiled as written only when there is
        // such a question to prove.
        let authoredAssignmentV5 = null;
        if ((hydrated.audit?.plan?.slots || []).some((slot) => slot?.kind === 'directClaim')) {
          try {
            authoredAssignmentV5 = parseAssignmentBlueprintText(String(text || '')).assignmentV5;
          } catch {
            // Not compilable as written: the server's own answer, as before.
          }
        }
        const proven = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5, hydration: hydrated });
        sourceText = JSON.stringify(proven.assignment);
        ccmrAudit = proven.audit;
      }
    } catch (error) {
      console.warn('CCMR assignment hydration was skipped', error);
    }

    const result = readAssignmentJson(sourceText);
    const bankWarnings = [...ccmrAuditWarnings(ccmrAudit)];
    const warnings = [...(result.warnings || []), ...bankWarnings];
    if (!result.ok) {
      if (!canSalvageV5IntakeResult(result)) return { ...result, warnings };

      // Publication validity and previewability are different boundaries.
      // A parseable V5 with question-level blockers still opens Preflight.
      const preflightModel = buildAssignmentV5PreflightModel(result.parsed.assignmentV5);
      const salvageResult = {
        ...result,
        ok: false,
        errors: [...new Set([...(result.errors || []), ...(preflightModel.errors || [])])],
        warnings: [...new Set([...warnings, ...(preflightModel.warnings || [])])],
        parsed: {
          ...result.parsed,
          assignmentV5: preflightModel.assignmentV5,
          questions: preflightModel.questions,
        },
      };
      const previewOpenResult = openAssignmentPreflight(
        { ...salvageResult.parsed, authoringWarnings: salvageResult.warnings },
        sourceName,
        {},
        // Imported now: Review gives SP-5's new-assignment warnings.
        { incompleteDraftId, authoredNow: true },
      );
      if (previewOpenResult !== true) {
        return {
          ...salvageResult,
          errors: [...salvageResult.errors, previewOpenResult?.error || 'Could not build Assignment Review from this assignment.'],
          previewOpened: false,
        };
      }
      return { ...salvageResult, previewOpened: true, ccmrAudit };
    }
    const opened = openAssignmentPreflight({ ...result.parsed, authoringWarnings: warnings }, sourceName, {}, { incompleteDraftId, authoredNow: true });
    if (opened !== true) {
      return { ok: false, errors: [opened?.error || 'Could not build Assignment Review from this assignment.'], warnings, sourceSchemaVersion: result.sourceSchemaVersion, compilerDefect: false };
    }
    return { ok: true, warnings, repairs: result.parsed.repairs || [], ccmrAudit };
  };

  const handleCreateAssignment = async (teacherReview, reviewedAssignmentV5, { honorsCandidate = null } = {}) => {
    const sourceIncompleteDraftId = assignmentPreflight?.incompleteDraftId || null;
    // Set once the assignment documents are written. A failure before that
    // created nothing and leaves the review open to try again; a failure after
    // it must never read as "not created", or a second press duplicates it.
    let committed = false;
    try {
      const {
        assertFirestoreSafeAssignmentPayload, buildAssignmentV5PreflightModel, certifyHonorsExtensionQuestion, confirmHonorsCandidateForCreate,
        creationRecoveryContent, markIncompleteAssignmentDraftPublished, normalizeLabDefinition, validateAssignmentQuestions,
      } = await authoringKit();
      if (!teacherReview || typeof teacherReview !== 'object') {
        throw new Error('Publishing requires the completed Assignment Review settings.');
      }
      const reviewedCandidate = reviewedAssignmentV5 && Number(reviewedAssignmentV5.schemaVersion) === 5
        ? reviewedAssignmentV5
        : null;
      if (!reviewedCandidate) {
        throw new Error('Publishing requires the MathMaster assignment that was reviewed before creation.');
      }

      // Creation must never be the first place a teacher learns that the
      // reviewed assignment is invalid. Re-run the same native V5 Preflight
      // model used by Assignment Review and publish only its validated,
      // persistence-safe object. This is a final race/defense check, not a
      // separate validation system.
      const finalPreflight = buildAssignmentV5PreflightModel(reviewedCandidate);
      if (!finalPreflight.isValid) {
        throw new Error(`This assignment is no longer ready to create:\n${finalPreflight.errors.join('\n')}`);
      }
      const reviewedV5 = finalPreflight.assignmentV5;

      // Final publishing consumes the exact reviewed canonical object. The
      // original pasted/uploaded JSON is intentionally not reparsed here.
      const reviewedQuestions = flattenV5Sections(reviewedV5);
      const title = String(reviewedV5.assignment?.title || '').trim();
      const dueValue = teacherReview.dueAt || '';
      const lateDueValue = teacherReview.lateDueAt || '';
      const releaseValue = teacherReview.releaseAt || '';
      const variantMode = getStoredAssignmentVariantMode(reviewedV5);
      const assignedClassIds = [...new Set((teacherReview.assignedClassIds || []).filter(Boolean))];
      const selectedClassRecords = assignedClassIds.length
        ? classes.filter((entry) => assignedClassIds.includes(entry.classId) && entry?.status !== 'archived')
        : [];
      const assignedClassPeriods = [...new Set(selectedClassRecords.map((entry) => entry.period).filter(Boolean))];
      const creationMode = resolveCreationMode({ assignedClassIds });
      if (!title) {
        throw new Error('Assignment title is missing. Add a title in Assignment Review before publishing.');
      }

      const { dueAt, lateDueAt, dueDate, releaseAt } = resolveAssignmentDates({
        mode: creationMode,
        dueValue,
        lateDueValue,
        releaseValue,
      });

      const parsedQuestions = normalizeAssignmentQuestions(
        validateAssignmentQuestions(reviewedQuestions, { variantMode }),
      );
      const authoredRoles = parsedQuestions.map((question) => resolveQuestionActivityRole({
        question,
        assignment: reviewedV5,
      }));
      const hasWarmupSection = authoredRoles.includes('warmup');
      const hasDOLSection = authoredRoles.includes('dol');
      const assignmentType = getStoredAssignmentTypeProjection(reviewedV5);

      const warmupEnabled = hasWarmupSection && teacherReview.warmupEnabled !== false;
      const requestedWarmupLeadMinutes = Number(teacherReview.warmupMinutesBeforeStart);
      const warmupMinutesBeforeStart = Math.max(
        0,
        Number.isFinite(requestedWarmupLeadMinutes) ? requestedWarmupLeadMinutes : 7,
      );
      const warmupInstructionDate = String(
        teacherReview.warmupInstructionDate
        || (releaseAt ? localDateKey(new Date(releaseAt)) : '')
        || localDateKey(Date.now()),
      ).trim() || null;
      const warmupInstructionDatesByClassPeriod = teacherReview.warmupInstructionDatesByClassPeriod || {};

      let dolQuestionIndex = Number.isInteger(Number(teacherReview.dolQuestionIndex))
        ? Number(teacherReview.dolQuestionIndex)
        : null;
      if (Number.isInteger(dolQuestionIndex)) {
        dolQuestionIndex = Math.max(0, Math.min(parsedQuestions.length - 1, dolQuestionIndex));
      } else {
        const authoredDOLIndex = authoredRoles.findIndex((role) => role === 'dol');
        dolQuestionIndex = authoredDOLIndex >= 0 ? authoredDOLIndex : null;
      }
      const dolEnabled = Boolean(
        teacherReview.dolEnabled === true
        && hasDOLSection
        && Number.isInteger(dolQuestionIndex),
      );
      const dolMinutesBeforeEnd = Math.max(1, Number(teacherReview.dolMinutesBeforeEnd) || 10);
      const dolCloseMinutesBeforeEnd = Math.max(0, Number(teacherReview.dolCloseMinutesBeforeEnd ?? 5));
      const dolInstructionDate = String(
        teacherReview.dolInstructionDate
        || (releaseAt ? localDateKey(new Date(releaseAt)) : '')
        || localDateKey(Date.now()),
      ).trim() || null;

      const folder = normalizeFolderPath(reviewedV5.assignment?.folder) || null;
      const completionRule = assignmentType === 'notesClasswork'
        ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
        : null;
      const sourceAssignmentKey = String(reviewedV5.assignment?.assignmentKey || '').trim() || null;

      // Assignment Review already says so (TT10); this stays as the last check,
      // for a list that changed while the review was open.
      if (findAssignmentKeyConflict({ assignments, assignmentKey: sourceAssignmentKey })) {
        throw new Error(`An assignment with assignmentKey "${sourceAssignmentKey}" already exists. Clear or change assignment.assignmentKey if you intend to create a separate copy.`);
      }

      const publishingIntent = normalizeLessonPublishingIntentV5({
        classroom: reviewedV5.classroomIntegration,
        lessonResources: { notesPdf: reviewedV5.outputProfiles?.lessonNotesPdf },
      }, {
        ...(reviewedV5.assignment || {}),
        title,
        folder,
      }, []);

      // "Students can use a Practice Pass on this assignment" (LC23): only the
      // teacher's "no" is stored, as rewardPolicy.practicePassEligible = false.
      const newRewardPolicy = rewardPolicyForNewAssignment(teacherReview.allowPracticePasses);

      const assignmentPayloadBase = {
        schemaVersion: 5,
        title,
        courseId: reviewedV5.assignment?.courseId || null,
        dueAt,
        lateDueAt,
        dueDate,
        sectionAccess: {
          classwork: { defaultState: teacherReview.sectionAccessDefaults?.classwork === 'closed' ? 'closed' : 'open', overridesByClassId: {}, overridesByClassPeriod: {} },
          practice: { defaultState: teacherReview.sectionAccessDefaults?.practice === 'closed' ? 'closed' : 'open', overridesByClassId: {}, overridesByClassPeriod: {} },
        },
        guidedNotesBySection: {
          classwork: teacherReview.guidedNotesBySection?.classwork || 'automatic',
          practice: teacherReview.guidedNotesBySection?.practice || 'off',
        },
        releaseAt,
        prerequisiteAssignmentId: null,
        completionRule,
        warmup: {
          enabled: warmupEnabled,
          minutesBeforeStart: warmupMinutesBeforeStart,
          closeMinutesAfterStart: 10,
          instructionDate: warmupInstructionDate,
          instructionDatesByClassPeriod: warmupInstructionDatesByClassPeriod,
          closedByClassId: {},
          closedByClassPeriod: {},
        },
        dol: {
          enabled: dolEnabled,
          minutesBeforeEnd: dolMinutesBeforeEnd,
          closeMinutesBeforeEnd: dolCloseMinutesBeforeEnd,
          instructionDate: dolInstructionDate,
          instructionDatesByClassPeriod: teacherReview.dolInstructionDatesByClassPeriod || {},
          questionIndex: dolQuestionIndex,
          earlyUnlocksByClassId: {},
          earlyUnlocks: {},
        },
        folder,
        publicationSettings: {
          strategy: teacherReview.publicationStrategy || 'hybrid',
          includeWarmupInClassroom: teacherReview.includeWarmupInClassroom === true,
          homeworkDueAt: teacherReview.homeworkDueAt ? new Date(teacherReview.homeworkDueAt).toISOString() : null,
        },
        classroomPackage: publishingIntent.classroomPackage,
        lessonResources: publishingIntent.lessonResources,
        instructionalPurpose: reviewedV5.assignment?.instructionalPurpose || 'lesson',
        gradingPurpose: reviewedV5.assignment?.gradingPurpose ?? null,
        variantPolicy: reviewedV5.variantPolicy || {},
        differentiationPolicy: reviewedV5.differentiationPolicy || null,
        supportPolicy: reviewedV5.supportPolicy || null,
        toolPolicy: reviewedV5.toolPolicy || null,
        deliveryPolicy: reviewedV5.deliveryPolicy || null,
        gradingPolicy: reviewedV5.gradingPolicy || null,
        evidencePolicy: reviewedV5.evidencePolicy || null,
        outputProfiles: reviewedV5.outputProfiles || null,
        ...(newRewardPolicy ? { rewardPolicy: newRewardPolicy } : {}),
        classroomIntegration: reviewedV5.classroomIntegration || null,
        provenance: reviewedV5.provenance || null,
        preflight: reviewedV5.preflight || { required: true },
        // A Test Cycle's policy, secure blueprint and secure reference are not
        // sections, and this payload used to drop all three — so a Test Cycle
        // authored here was saved as a Review with no secure Test behind it.
        ...testCycleContractFields(reviewedV5),
        // Nor are the lesson's own worked examples and reference cards: a
        // question names its example by id, and the student's assignment needs
        // the entry of that name.
        ...lessonSupportsFields(reviewedV5),
        ...(assignmentPreflight?.sourceContentLineage ? {
          contentLineage: assignmentPreflight?.sourceContentLineage,
        } : {}),
        createdAt: new Date(),
      };

      const bundleLabs = reviewedV5
        ? (reviewedV5.sections || []).flatMap((section) => (
            (section?.questions || [])
              .filter((question) => question?.type === 'modelingLab' && question?.labDefinition)
              .map((question) => ({
                activityId: section.id || null,
                role: section.role || 'classwork',
                labDefinition: question.labDefinition,
              }))
          ))
        : [];
      const privateLabsById = new Map(bundleLabs.map((activity) => {
        const definition = normalizeLabDefinition(activity.labDefinition, { includeEvaluation: true });
        return [definition.labId, { definition, activity }];
      }));

      // Extracted so assigning a library item later runs the same split rather
      // than a second copy of it. A library save returns [] here, which is the
      // correct answer: nobody has been given it, so there is nothing to split.
      const destinationGroups = buildDestinationGroups({ assignedClassIds, classes });
      const hasHonorsDestination = destinationGroups.some((entry) => entry.courseLevel === 'honors');

      // THE HONORS VERSION IS THE ONE PRE-FLIGHT PROVED.
      //
      // CCMR is destination-aware: Standard destinations keep the authored
      // Practice, and an Honors destination gets audited CCMR Fidelity V2.1
      // items on the same TEKS. Those used to be sourced HERE, after Pre-Flight
      // had said the lesson was ready — so an audited item that failed
      // MathMaster's checks ("Question 24 refers to a graph in its prompt…")
      // failed Create, where it could not be shown, replaced or repaired.
      // Pre-Flight now prepares the Honors version, proves every item in place
      // and previews it (canonicalCcmrHydration.js). Creation publishes that
      // exact object, checked once more by the same model, or nothing: it never
      // sources, swaps or repairs a question, so it cannot fail on one.
      const honorsVersion = hasHonorsDestination
        ? confirmHonorsCandidateForCreate({
          honorsCandidate,
          reviewedAssignmentV5: reviewedCandidate,
          honorsEnrichmentQuestion: teacherReview?.honorsEnrichmentQuestion || null,
        })
        : null;
      const honorsParsedQuestions = honorsVersion
        ? normalizeAssignmentQuestions(validateAssignmentQuestions(flattenV5Sections(honorsVersion.assignmentV5), { variantMode, allowFixed: variantMode === 'shared' }))
        : null;
      const sourceHonorsReport = honorsVersion?.honorsReport || null;
      const splitVariantGroupId = destinationGroups.length > 1 ? `rigor_${createQuestionId()}` : null;

      // Every document this publish writes, built before anything is written,
      // so a payload that cannot be saved stops the publish while nothing exists.
      const planAssignmentVariantWrite = ({ destination, questions, sectionsSource }) => {
        const assignmentRef = doc(collection(db, 'assignments'));
        const labSuffix = `${destination.course}-${destination.courseLevel}-${assignmentRef.id.slice(0, 8)}`;
        const privateLabWrites = [];
        const variantQuestions = questions.map((question) => {
          if (question?.type !== 'modelingLab' || !question.labDefinition?.labId) return question;
          const originalLabId = question.labDefinition.labId;
          const privateSource = privateLabsById.get(originalLabId);
          if (!privateSource) {
            if (bundleLabs.length) throw new Error(`Modeling lab ${originalLabId} could not be matched to its private assignment definition.`);
            return question;
          }
          const nextLabId = `${originalLabId}-${labSuffix}`;
          if (privateSource) privateLabWrites.push({ nextLabId, ...privateSource });
          return { ...question, labDefinition: { ...question.labDefinition, labId: nextLabId } };
        });
        const payload = {
          ...assignmentPayloadBase,
          // Filed in the marking period that is current when it is assigned,
          // so moving to the next period does not drag it into "current".
          ...((destination.classIds || []).length ? currentGradingPeriodStamp(gradingPeriodSettings) : {}),
          assignedClassPeriods: destination.periods,
          assignedClassIds: destination.classIds || [],
          sections: rebuildV5SectionsFromQuestions(sectionsSource, variantQuestions),
          courseProfile: { course: destination.course, courseLevel: destination.courseLevel },
          rigorVariant: destination.courseLevel,
          rigorVariantGroupId: splitVariantGroupId,
          assignmentKey: destinationAssignmentKey({
            assignmentKey: sourceAssignmentKey,
            destination,
            destinationCount: destinationGroups.length,
          }),
          honorsContractVersion: destination.courseLevel === 'honors' ? 1 : null,
          honorsContractScope: destination.courseLevel === 'honors' ? sourceHonorsReport.scope : null,
          // How this Honors version's CCMR was decided: the audited items it
          // carries, or the teacher's recorded choice when none passed.
          ...(destination.courseLevel === 'honors' ? { honorsCcmr: honorsVersion.record } : {}),
        };
        // Recovery V2: each copy's static Warm-Up and DOL questions, paired
        // with certified families, planned on this exact payload (the Honors
        // copy from its own questions). Never a question change.
        const recoveryContent = creationRecoveryContent(payload, { actorUid: user?.uid || null });
        if (recoveryContent) payload.recoveryContent = recoveryContent;
        else delete payload.recoveryContent;
        assertFirestoreSafeAssignmentPayload(payload);
        return { assignmentRef, payload, privateLabWrites };
      };

      const destinationVariants = destinationGroups.map((destination) => {
        if (destination.courseLevel !== 'honors') {
          return { destination, questions: parsedQuestions, sectionsSource: reviewedV5 };
        }
        // The extension the teacher reviewed in Pre-Flight extends THIS
        // assignment's mathematics, so every Honors destination gets that
        // same one, whatever course a destination class profile names. It
        // was rebuilt per destination course once, which is how an Algebra I
        // lesson was given an "Algebra II" extension. It is already in place in
        // the Honors version Pre-Flight proved; certified again here, so
        // publish never stores an extension Pre-Flight would refuse.
        const enrichmentQuestion = teacherReview?.honorsEnrichmentQuestion || null;
        if (enrichmentQuestion) {
          const certification = certifyHonorsExtensionQuestion(enrichmentQuestion);
          if (!certification.ok) {
            throw new Error(`The Honors extension cannot be published because it does not pass MathMaster's checks. Return to Pre-Flight and add it again:\n${certification.errors.join('\n')}`);
          }
        }
        return { destination, questions: honorsParsedQuestions, sectionsSource: honorsVersion.assignmentV5 };
      });

      const plannedWrites = creationMode === 'library'
        // ONE canonical document, deliberately without a course/rigor variant.
        // Choosing a destination now would be guessing: the teacher has not said
        // which classes get it, and materialising a Standard variant today would
        // be wrong the moment they assign it to an Honors class. The split runs
        // when the assignment is actually assigned, through the same helper.
        ? [planAssignmentVariantWrite({
          destination: { course: null, courseLevel: null, periods: [] },
          questions: parsedQuestions,
          sectionsSource: reviewedV5,
        })]
        : destinationVariants.map(planAssignmentVariantWrite);

      // ONE COMMIT FOR EVERY DESTINATION. The Standard and Honors versions and
      // their private lab definitions are written together or not at all, so a
      // failed publish leaves no half-created assignment behind, and pressing
      // Create again cannot duplicate a version that did save.
      const publishBatch = writeBatch(db);
      plannedWrites.forEach(({ assignmentRef, payload, privateLabWrites }) => {
        publishBatch.set(assignmentRef, payload);
        privateLabWrites.forEach(({ nextLabId, definition, activity }) => publishBatch.set(doc(db, 'modelingLabDefinitions', nextLabId), {
          ...definition,
          labId: nextLabId,
          assignmentId: assignmentRef.id,
          activityId: activity.activityId || null,
          activityRole: activity.role || 'classwork',
          updatedAt: new Date(),
        }));
      });
      await publishBatch.commit();
      committed = true;
      const createdAssignments = plannedWrites.map(({ assignmentRef, payload }) => ({ id: assignmentRef.id, ...payload }));

      // A new folder joins the folder list only once the assignment that names
      // it is saved (TT12): saved before the commit, a publish that failed left
      // an empty folder behind. A failure here is a missing list entry, not a
      // failed publish: the assignment keeps its folder either way.
      if (folder && !assignmentFolderPaths.includes(folder)) {
        try {
          await saveAssignmentFolderPaths([...assignmentFolderPaths, folder]);
        } catch (folderError) {
          console.error('Published the assignment but could not add its folder to the folder list:', folderError);
          toastWarning('Published, but the folder was not added to your list', `“${title}” is saved in the folder “${folder}”. If the folder is missing from your list, create it again there.`);
        }
      }

      // "Publish" in Preflight now means publish the whole authored package:
      // MathMaster assignment + mapped Google Classroom post + optional notes
      // material. Classroom is downstream, so a failure is surfaced but never
      // deletes the MathMaster assignment that was just created.
      if (creationMode !== 'library') {
        for (const createdAssignment of createdAssignments) {
          if (!shouldAutoPublishClassroomPackage(createdAssignment)) continue;
          try {
            // eslint-disable-next-line no-await-in-loop
            const classroomResult = await autoPublishAssignmentPackageToClassroom(createdAssignment);
            if (classroomResult.status === 'needs-mapping') {
              toastWarning(
                'MathMaster assignment published; Classroom needs a mapping',
                `${createdAssignment.title} was assigned in MathMaster, but no saved Google Classroom mapping matches ${createdAssignment.assignedClassPeriods.join(', ')}. Map that class once in Google Classroom Manager and publish/retry there.`,
              );
            } else if (classroomResult.status === 'failed' || classroomResult.status === 'partial') {
              toastWarning(
                'MathMaster assignment published; Classroom needs attention',
                `${createdAssignment.title} is live in MathMaster. Google Classroom published ${classroomResult.published || 0} destination(s) and failed ${classroomResult.failed || 0}. Open Google Classroom Manager for details/retry.`,
              );
            } else if (classroomResult.status === 'published') {
              toastSuccess(
                'Google Classroom published',
                `${createdAssignment.title} was posted automatically to ${classroomResult.published} mapped Classroom destination${classroomResult.published === 1 ? '' : 's'}.`,
              );
            }
          } catch (classroomError) {
            console.error('Automatic Google Classroom publication failed:', classroomError);
            toastWarning(
              'MathMaster assignment published; Classroom did not post',
              `${createdAssignment.title} is live in MathMaster, but Google Classroom returned: ${classroomError.message}`,
            );
          }
        }
      }

      // The intake is stateless now — closing preflight and clearing the held
      // JSON is the whole reset.
      setAssignmentPreflight(null);
      await fetchAssignments();
      // Creation consumes the already-reviewed canonical V5 object. There is
      // no local `parsed` result in this function; referencing one here used
      // to throw after Firestore had successfully saved the assignment, making
      // a successful library save look like a failure.
      // The draft existed to hold this assignment while it was unpublishable.
      // It is published now, so the draft's job is done. This runs after the
      // Firestore write and deliberately does not fail the publication: the
      // assignment is live either way, and a leftover draft is a tidiness
      // problem, not a reason to tell the teacher publishing failed.
      if (sourceIncompleteDraftId) {
        try {
          await markIncompleteAssignmentDraftPublished(sourceIncompleteDraftId);
        } catch (draftCleanupError) {
          console.error('Published the assignment but could not close its incomplete draft:', draftCleanupError);
          toastWarning(
            'Published, but the incomplete draft is still listed',
            `“${title}” is saved. Its Incomplete Assignments entry could not be removed automatically — delete it there so the repaired copy is the only one.`,
          );
        }
      }

      const repairMessage = '';
      const sourceMessage = 'Created with MathMaster Assignment Creator after teacher review.';
      toastSuccess(
        creationMode === 'library' ? `Saved “${title}” to the library` : `Published “${title}”`,
        creationMode === 'library'
          ? `${sourceMessage} Not assigned to any class yet, so it has no due date. Assign it when you are ready.${folder ? `\nFolder: ${folder}` : ''}${repairMessage}`
          : `${sourceMessage} Assigned to ${assignedClassPeriods.length} class period(s)${folder ? `\nFolder: ${folder}` : ''}.${repairMessage}`,
      );

    } catch (error) {
      if (committed) {
        // The assignment exists. Close the review so it cannot be created a
        // second time, and say exactly what did not finish.
        console.error('Created the assignment, but a step after saving it failed:', error);
        setAssignmentPreflight(null);
        toastWarning('Created, but MathMaster could not finish refreshing', `The assignment was saved. ${error.message} Refresh the page to see it.`);
      } else {
        toastError('Could not create assignment', `${error.message}\nNothing was created. Your review is still open with every choice kept, so you can fix this and create again.`);
      }
    }
  };

  const updateExistingAssignmentFromReview = async ({ draft, assignmentV5 }) => {
    const { assertFirestoreSafeAssignmentPayload, buildAssignmentV5PreflightModel } = await authoringKit();
    const assignmentId = assignmentPreflight?.existingAssignmentId;
    const existing = assignments.find((item) => item.id === assignmentId);
    if (!assignmentId || !existing) throw new Error('The assignment being edited could not be found.');

    const model = buildAssignmentV5PreflightModel(assignmentV5);
    if (!model.isValid) {
      throw new Error(`This setup cannot be saved until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
    }

    const assignedClassIds = [...new Set((draft.assignedClassIds || []).filter(Boolean))];
    const selectedClassRecords = assignedClassIds.length
      ? classes.filter((entry) => assignedClassIds.includes(entry.classId) && entry?.status !== 'archived')
      : [];
    const assignedClassPeriods = [...new Set(selectedClassRecords.map((entry) => entry.period).filter(Boolean))];

    if (isLibraryAssignment(existing) && assignedClassIds.length) {
      throw new Error(
        'This is a reusable library template. Use Dates & Classes to assign it; MathMaster will open Assignment Review and create the correct destination copy while keeping the template unchanged.',
      );
    }

    const targetGroups = buildDestinationGroups({ assignedClassIds, classes });
    const currentCourse = existing.courseId || existing.courseProfile?.course || null;
    const currentLevel = existing.rigorVariant || existing.courseProfile?.courseLevel || null;
    const changesDestination = targetGroups.length > 1
      || (targetGroups.length === 1 && currentCourse && targetGroups[0].course !== currentCourse)
      || (targetGroups.length === 1 && currentLevel && targetGroups[0].courseLevel !== currentLevel);
    if (changesDestination) {
      throw new Error(
        'This assignment is already a destination-specific Standard/Honors version. Duplicate it to the library, then assign the library copy through Assignment Review to create a different rigor destination.',
      );
    }

    const originalV5 = storedAssignmentToV5(existing);
    const hasStudentData = allStudents.some(
      (student) => student.gradesByAssignment?.[existing.id] !== undefined,
    );
    if (hasStudentData) {
      const originalQuestionState = flattenV5Sections(originalV5);
      const reviewedQuestionState = flattenV5Sections(model.assignmentV5);
      const questionContentChanged = JSON.stringify(originalQuestionState) !== JSON.stringify(reviewedQuestionState);
      const historicalFields = [
        'variantPolicy',
        'differentiationPolicy',
        'supportPolicy',
        'toolPolicy',
        'deliveryPolicy',
        'gradingPolicy',
        'evidencePolicy',
      ];
      const changed = historicalFields.filter((field) => (
        JSON.stringify(originalV5[field] || null) !== JSON.stringify(model.assignmentV5[field] || null)
      ));
      const audienceChanged = JSON.stringify([...(existing.assignedClassIds || [])].sort())
        !== JSON.stringify([...assignedClassIds].sort());
      if (changed.length || audienceChanged || questionContentChanged) {
        throw new Error(
          `Student records already exist. To preserve historical evidence, this setup editor cannot change ${[
            ...changed,
            ...(audienceChanged ? ['class audience'] : []),
            ...(questionContentChanged ? ['question content'] : []),
          ].join(', ')}. Duplicate the assignment for a new delivery policy or question rewrite instead.`,
        );
      }
    }

    const mode = resolveCreationMode({ assignedClassIds });
    const { dueAt, lateDueAt, dueDate, releaseAt } = resolveAssignmentDates({
      mode,
      dueValue: draft.dueAt || '',
      lateDueValue: draft.lateDueAt || '',
      releaseValue: draft.releaseAt || '',
    });

    // The Test Cycle contract is server-owned after creation (firestore.rules
    // pins it). Work out what this edit does to it BEFORE saving anything, so a
    // save that would strip it is refused rather than half-applied.
    const contractEdit = planTestCycleContractEdit({ stored: existing, reviewed: model.assignmentV5 });
    if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.REFUSE) throw new Error(contractEdit.message);

    const persistence = canonicalV5PersistencePatch(model.assignmentV5);
    // Firestore stores sections[] only. Derive the temporary flat runtime view
    // from the validated V5 object instead of reading a removed persistence field.
    const persistedQuestions = flattenV5Sections(model.assignmentV5);
    const authoredRoles = persistedQuestions.map((question) => resolveQuestionActivityRole({
      question,
      assignment: model.assignmentV5,
    }));
    const hasWarmup = authoredRoles.includes('warmup');
    const dolIndexFromRole = authoredRoles.findIndex((role) => role === 'dol');
    const hasDOL = dolIndexFromRole >= 0;
    const dolQuestionIndex = hasDOL
      ? Math.max(0, Math.min(
          persistedQuestions.length - 1,
          Number.isInteger(Number(draft.dolQuestionIndex))
            ? Number(draft.dolQuestionIndex)
            : dolIndexFromRole,
        ))
      : null;

    const publishingIntent = normalizeLessonPublishingIntentV5({
      classroom: model.assignmentV5.classroomIntegration,
      lessonResources: { notesPdf: model.assignmentV5.outputProfiles?.lessonNotesPdf },
    }, model.assignmentV5.assignment, []);

    // "Students can use a Practice Pass on this assignment" (LC23): written only
    // when the switch changed (the "no" added, or removed again), beside whatever
    // else the stored policy holds.
    const nextRewardPolicy = rewardPolicyAfterEdit(existing.rewardPolicy, draft.allowPracticePasses);

    const patch = {
      ...persistence,
      title: model.assignmentV5.assignment.title,
      folder: normalizeFolderPath(model.assignmentV5.assignment.folder) || null,
      dueAt,
      dueDate,
      lateDueAt,
      releaseAt,
      assignedClassIds,
      assignedClassPeriods,
      sectionAccess: {
        ...(existing.sectionAccess || {}),
        classwork: {
          ...(existing.sectionAccess?.classwork || {}),
          defaultState: draft.sectionAccessDefaults?.classwork === 'closed' ? 'closed' : 'open',
        },
        practice: {
          ...(existing.sectionAccess?.practice || {}),
          defaultState: draft.sectionAccessDefaults?.practice === 'closed' ? 'closed' : 'open',
        },
      },
      guidedNotesBySection: {
        classwork: draft.guidedNotesBySection?.classwork || 'automatic',
        practice: draft.guidedNotesBySection?.practice || 'off',
      },
      ...(nextRewardPolicy !== undefined ? { rewardPolicy: nextRewardPolicy } : {}),
      warmup: {
        ...(existing.warmup || {}),
        enabled: hasWarmup && draft.warmupEnabled !== false,
        minutesBeforeStart: Math.max(0, Number(draft.warmupMinutesBeforeStart) || 7),
        instructionDate: draft.warmupInstructionDate || existing.warmup?.instructionDate || null,
        instructionDatesByClassPeriod: draft.warmupInstructionDatesByClassPeriod || existing.warmup?.instructionDatesByClassPeriod || {},
      },
      dol: {
        ...(existing.dol || {}),
        enabled: hasDOL && draft.dolEnabled === true,
        minutesBeforeEnd: Math.max(1, Number(draft.dolMinutesBeforeEnd) || 10),
        closeMinutesBeforeEnd: Math.max(0, Number(draft.dolCloseMinutesBeforeEnd ?? existing.dol?.closeMinutesBeforeEnd ?? 5)),
        instructionDate: draft.dolInstructionDate || existing.dol?.instructionDate || null,
        instructionDatesByClassPeriod: draft.dolInstructionDatesByClassPeriod || existing.dol?.instructionDatesByClassPeriod || {},
        questionIndex: dolQuestionIndex,
      },
      publicationSettings: {
        ...(existing.publicationSettings || {}),
        strategy: draft.publicationStrategy || existing.publicationSettings?.strategy || 'hybrid',
        includeWarmupInClassroom: draft.includeWarmupInClassroom === true,
        homeworkDueAt: draft.homeworkDueAt ? new Date(draft.homeworkDueAt).toISOString() : null,
      },
      classroomPackage: publishingIntent.classroomPackage,
      lessonResources: publishingIntent.lessonResources,
      updatedAt: new Date().toISOString(),
    };

    assertFirestoreSafeAssignmentPayload({ ...existing, ...patch });
    // `dol` as the fields this edit changed, not the whole map from this tab's
    // copy (which would carry students' grants with it).
    const { dol: editedDol, ...patchWithoutDol } = patch;
    await updateDoc(doc(db, 'assignments', existing.id), {
      ...patchWithoutDol,
      ...classDolFieldPatch(existing.dol, editedDol, { deleteValue: deleteField() }),
    });
    // Then the contract, through the server, which checks the teacher of record
    // and refuses a change that would contradict released results or open
    // secure sessions. Its refusal is reported, not swallowed: the rest of the
    // setup is saved, and the teacher is told exactly what was not.
    if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.ATTACH) {
      await attachTestCycleContract({ assignmentId: existing.id, ...contractEdit.contract });
    } else if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.POLICY) {
      await updateTestCyclePolicy({ assignmentId: existing.id, policy: contractEdit.policyChanges });
    }

    if (!isLibraryAssignment(existing) && shouldAutoPublishClassroomPackage({ ...existing, ...patch })) {
      try {
        await updateAssignmentClassroomPublications({ assignmentId: existing.id });
      } catch (classroomError) {
        console.warn('Classroom sync after assignment setup edit failed:', classroomError);
        toastWarning(
          'Assignment setup saved; Classroom needs attention',
          'MathMaster saved the changes, but Google Classroom could not confirm the updated due date. Open Google Classroom Manager to review it.',
        );
      }
    }

    setAssignmentPreflight(null);
    await fetchAssignments();
    toastSuccess('Assignment setup updated', `“${patch.title}” passed MathMaster’s assignment checks and the reviewed settings were saved.`);
  };

  const confirmAssignmentPreflight = async ({ draft, assignmentV5, honorsCandidate = null }) => {
    setAssignmentPreflightBusy(true);
    try {
      // References to server-only secure manifests cannot be certified by the
      // browser's pure V5 validator. Only Test Cycle candidates pay for this
      // authoritative call, and no assignment is saved/assigned before it
      // passes.
      if (isTestCycleAssignment(assignmentV5)) {
        const authoritative = await preflightTestCycleCandidate({
          assignment: assignmentV5,
          sourceAssignmentId: assignmentPreflight?.sourceAssignmentId || null,
        });
        if (authoritative.preflight?.blocked) {
          throw new Error(`This Test Cycle cannot be published:\n${(authoritative.preflight.errors || []).join('\n')}`);
        }
      }
      if (assignmentPreflight?.mode === 'update') {
        await updateExistingAssignmentFromReview({ draft, assignmentV5 });
      } else {
        await handleCreateAssignment(draft, assignmentV5, { honorsCandidate });
      }
    } finally {
      setAssignmentPreflightBusy(false);
    }
  };

  const saveQuestionEditor = async ({ title, questions, liveRepairs = [], appendedSections = [] }) => {
    if (!questionEditorAssignment?.id) return;
    const {
      GRAPH_VIEWPORT_REPAIR_KIND, buildAssignmentV5PreflightModel, questionFingerprint,
      repairAssignmentTrackerForGranularWorkflowCredit, repairAssignmentTrackerForLiveCorrections, withAppendedQuestionSections,
    } = await authoringKit();
    const normalizedQuestions = normalizeAssignmentQuestions(questions);
    const included = normalizedQuestions.filter(questionIsIncluded);
    if (!included.length) throw new Error('At least one included question is required.');

    // The FINAL candidate is what is judged: a swap's replacement goes in its
    // own appended section (so no stored index moves), and Pre-Flight judges
    // every question that stays active while setting aside the ones the
    // teacher excluded or retired (assignmentV5PreflightModel).
    const candidateV5 = storedAssignmentToV5(withAppendedQuestionSections(questionEditorAssignment, appendedSections), {
      titleOverride: title,
      questions: normalizedQuestions,
    });
    const model = buildAssignmentV5PreflightModel(candidateV5);
    if (!model.isValid) {
      throw new Error(`These question edits cannot be saved until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
    }
    const persistence = canonicalV5PersistencePatch(model.assignmentV5);
    const persistedQuestions = flattenV5Sections(model.assignmentV5);
    const originalEditorQuestions = getStoredAssignmentQuestions(questionEditorAssignment);
    const weightChanges = persistedQuestions.flatMap((question, index) => {
      const before = originalEditorQuestions[index];
      if (!before || String(before.questionId || '') !== String(question.questionId || '')) return [];
      const beforeWeight = normalizeQuestionWeight(before);
      const afterWeight = normalizeQuestionWeight(question);
      return Math.abs(beforeWeight - afterWeight) > 1e-9
        ? [{ questionId: question.questionId, questionIndex: index, beforeWeight, afterWeight }]
        : [];
    });
    const dolIndex = resolveDOLQuestionIndex({
      ...questionEditorAssignment,
      questions: persistedQuestions,
    });
    const correctedAt = new Date().toISOString();
    const assignmentPatch = {
      ...persistence,
      'dol.questionIndex': dolIndex >= 0 ? dolIndex : null,
      updatedAt: correctedAt,
    };

    const needsLiveGradeTransaction = !isLibraryAssignment(questionEditorAssignment)
      && ((Array.isArray(liveRepairs) && liveRepairs.length > 0) || weightChanges.length > 0);
    // A viewport repair reframes the picture; it never rewrites a response
    // control, so it earns no correction credit and no returned attempt.
    const presentationOnlyLiveRepair = Array.isArray(liveRepairs)
      && liveRepairs.length > 0
      && liveRepairs.every((repair) => repair?.repairKind === GRAPH_VIEWPORT_REPAIR_KIND);
    // Nothing in a student's grade document can be affected by where a graph is
    // framed, so a presentation-only repair never opens one. It reads and
    // writes no student record at all: not to migrate a tracker, not to write
    // back an identical one, and not to log that it happened. The repair is
    // recorded once, on the assignment.
    const needsStudentGradeMigration = weightChanges.length > 0
      || (Array.isArray(liveRepairs) && liveRepairs.length > 0 && !presentationOnlyLiveRepair);

    if (needsLiveGradeTransaction) {
      const assignmentId = questionEditorAssignment.id;
      const assignmentRef = doc(db, 'assignments', assignmentId);
      const audienceStudents = allStudents.filter((student) => assignmentIsForStudent(
        questionEditorAssignment,
        {
          classId: student.classId || null,
          classPeriod: student.classPeriod,
        },
      ));

      if (needsStudentGradeMigration && audienceStudents.length > 450) {
        throw new Error(
          'This assignment has too many student records for a browser-side live correction. Use the server migration path so every student is updated atomically.',
        );
      }

      await runTransaction(db, async (transaction) => {
        const liveAssignmentSnapshot = await transaction.get(assignmentRef);
        if (!liveAssignmentSnapshot.exists()) {
          throw new Error('This assignment no longer exists. Nothing was changed.');
        }

        const liveAssignment = {
          id: liveAssignmentSnapshot.id,
          ...liveAssignmentSnapshot.data(),
        };
        if (
          questionEditorAssignment.updatedAt
          && liveAssignment.updatedAt
          && String(questionEditorAssignment.updatedAt) !== String(liveAssignment.updatedAt)
        ) {
          throw new Error(
            'This assignment changed after you opened the editor. Close and reopen it before applying the live repair so newer student-facing content is not overwritten.',
          );
        }

        const liveQuestions = getStoredAssignmentQuestions(liveAssignment);
        liveRepairs.forEach((repair) => {
          const index = Number(repair?.questionIndex);
          const liveQuestion = liveQuestions[index];
          const repairedQuestion = persistedQuestions[index];
          if (!Number.isInteger(index) || index < 0 || !liveQuestion || !repairedQuestion) {
            throw new Error('MathMaster could not match a live repair to its original question index.');
          }
          if (
            String(liveQuestion.questionId || '') !== String(repair.questionId || '')
            || String(repairedQuestion.questionId || '') !== String(repair.questionId || '')
          ) {
            throw new Error(
              'A question ID or position changed while the assignment was live. The repair was cancelled to protect student progress.',
            );
          }
          if (
            repair.beforeFingerprint
            && questionFingerprint(liveQuestion) !== repair.beforeFingerprint
          ) {
            throw new Error(
              'The live question changed after this repair was prepared. Reopen the editor and prepare the correction again.',
            );
          }
        });

        weightChanges.forEach((change) => {
          const liveQuestion = liveQuestions[change.questionIndex];
          const weightedQuestion = persistedQuestions[change.questionIndex];
          if (
            !liveQuestion
            || !weightedQuestion
            || String(liveQuestion.questionId || '') !== String(change.questionId || '')
            || String(weightedQuestion.questionId || '') !== String(change.questionId || '')
          ) {
            throw new Error('A weighted question moved or changed identity. Reopen the editor before changing live grade weights.');
          }
          if (Math.abs(normalizeQuestionWeight(liveQuestion) - change.beforeWeight) > 1e-9) {
            throw new Error('A question weight changed after you opened the editor. Reopen it before recalculating live grades.');
          }
        });

        const gradeEntries = needsStudentGradeMigration
          ? await Promise.all(audienceStudents.map(async (student) => {
            const studentRef = doc(db, 'grades', student.id);
            const snapshot = await transaction.get(studentRef);
            // The records whole: a correction re-grades parts and responses,
            // stored beside the grades document (gradeEntryStorage.mjs). The
            // grades document is read in this transaction, its detail beside
            // it: a detail read in it would cost the commit a rules lookup per
            // student (responseDetailStore.js joinTrackerOutsideTransaction).
            const joined = snapshot.exists()
              ? await joinTrackerOutsideTransaction(db, student.id, snapshot.data() || {}, assignmentId)
              : null;
            return { student, studentRef, snapshot, joined };
          }))
          : [];

        gradeEntries.forEach(({ student, studentRef, snapshot, joined }) => {
          if (!snapshot.exists()) return;
          const studentData = joined || {};
          const gradesByAssignment = studentData.gradesByAssignment || {};
          const assignmentTracker = gradesByAssignment[assignmentId];
          if (assignmentTracker === undefined) return;

          const studentPatch = {};
          let nextTracker = assignmentTracker;
          if (Array.isArray(liveRepairs) && liveRepairs.length > 0) {
            nextTracker = repairAssignmentTrackerForLiveCorrections({
              assignmentTracker: nextTracker,
              questions: persistedQuestions,
              repairs: liveRepairs,
              correctedAt,
              // A repair retry is counted as this student's screen counts it.
              assignment: liveAssignment,
              studentId: student.id,
              classId: studentData.classId || student.classId || null,
            });
          }
          if (weightChanges.length > 0) {
            nextTracker = repairAssignmentTrackerForGranularWorkflowCredit({
              assignmentTracker: nextTracker,
              questions: persistedQuestions,
              questionIndices: weightChanges.map((change) => change.questionIndex),
              correctedAt,
            });
          }
          if (nextTracker !== assignmentTracker || (Array.isArray(liveRepairs) && liveRepairs.length > 0)) {
            // This assignment's tracker only, every record whole on the grades
            // document: a detail write per student would cost this one
            // transaction a rules lookup each, past the 20 it is allowed
            // (responseDetailStore.js writeTrackerWhole).
            writeTrackerWhole({ db, writer: transaction, studentId: student.id, assignmentId, tracker: nextTracker });
          }
          if (weightChanges.length > 0) {
            studentPatch.classroomReleaseSignals = {
              ...(studentData.classroomReleaseSignals || {}),
              [assignmentId]: {
                reason: 'manual-retry',
                requestedAt: correctedAt,
                source: 'question-weight-change',
              },
            };
          }
          if (Object.keys(studentPatch).length > 0) transaction.update(studentRef, studentPatch);
        });

        // The live repair audit trail lives with the assignment, not with any
        // student record, so a display-only correction is recorded without
        // touching attempts, responses, grades or progress.
        const priorLiveRepairHistory = Array.isArray(liveAssignment.liveRepairHistory)
          ? liveAssignment.liveRepairHistory
          : [];
        const liveRepairAudit = (Array.isArray(liveRepairs) ? liveRepairs : []).map((repair) => ({
          kind: repair?.repairKind || 'response-entry-repair',
          questionId: repair?.questionId || null,
          questionIndex: Number(repair?.questionIndex),
          affectedFieldIds: Array.isArray(repair?.affectedFieldIds) ? repair.affectedFieldIds : [],
          changedViewportKeys: Array.isArray(repair?.changedViewportKeys) ? repair.changedViewportKeys : [],
          correctedAt,
        }));

        if (liveRepairAudit.length) {
          assignmentPatch.liveRepairHistory = [...priorLiveRepairHistory, ...liveRepairAudit].slice(-50);
        }

        transaction.update(assignmentRef, assignmentPatch);
      });

      if (weightChanges.length > 0 && Array.isArray(liveRepairs) && liveRepairs.length > 0) {
        toastSuccess(
          'Live repairs and grade weights saved',
          'Student responses and attempt history were preserved. MathMaster recalculated the assignment and section grades with the new weights and queued Google Classroom to reconcile them.',
        );
      } else if (weightChanges.length > 0) {
        toastSuccess(
          'Grade weights saved',
          'Existing responses and attempts were not changed. MathMaster recalculated the assignment and section grades using the new question weights and queued Google Classroom to reconcile them.',
        );
      } else if (presentationOnlyLiveRepair) {
        toastSuccess(
          'Graph viewport corrected',
          'The graph is now framed so students can see the whole picture. This is a display-only change: attempts, responses, grades and progress were left exactly as they were.',
        );
      } else {
        toastSuccess(
          'Safe live repair saved',
          'The corrected response controls are live. Existing student attempts were preserved, affected rejected responses were protected from score loss, and exhausted students received a repair retry only when they still had another incorrect part.',
        );
      }
    } else {
      await updateDoc(doc(db, 'assignments', questionEditorAssignment.id), assignmentPatch);
    }

    setQuestionEditorAssignment(null);
    await fetchAssignments();
  };

  const handleDuplicateAssignment = async (assignment) => {
    try {
      const { buildAssignmentV5PreflightModel, creationRecoveryContent, stripAssignmentInstanceState } = await authoringKit();
      const duplicateQuestions = getStoredAssignmentQuestions(assignment).map((question) => ({
        ...question,
        questionId: createQuestionId(),
      }));
      const candidateV5 = storedAssignmentToV5(assignment, {
        titleOverride: `${assignment.title} (Copy)`,
        questions: duplicateQuestions,
        resetAssignmentKey: true,
      });
      const model = buildAssignmentV5PreflightModel(candidateV5);
      if (!model.isValid) {
        throw new Error(`The copy cannot be created until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
      }
      const persistence = canonicalV5PersistencePatch(model.assignmentV5);
      // A copy carries the content, never the source's instance state:
      // students' overrides (which the create rule refuses anyway, so any
      // assignment with an extension could not be duplicated) and each
      // class's DOL/Warm-Up runtime state (shared/assignmentPrivacy.mjs).
      const {
        id: _id,
        archived: _archived,
        archivedAt: _archivedAt,
        archivedBy: _archivedBy,
        // A copy is a new assessment: it starts published (to whichever class
        // it is later assigned) and carries none of the source's audit history.
        unpublished: _unpublished,
        unpublishedAt: _unpublishedAt,
        unpublishedBy: _unpublishedBy,
        lifecycleHistory: _lifecycleHistory,
        assessmentPolicyHistory: _assessmentPolicyHistory,
        contentLineage: _contentLineage,
        contentUpgrade: _contentUpgrade,
        // The source's Recovery bindings name the SOURCE's question ids; the
        // copy's questions have new ones, so its Recovery is planned afresh.
        recoveryContent: _recoveryContent,
        ...rest
      } = stripAssignmentInstanceState(assignment);
      const copyRecoveryContent = creationRecoveryContent({ ...rest, ...persistence }, { actorUid: user?.uid || null });
      await addDoc(collection(db, 'assignments'), {
        ...rest,
        ...persistence,
        ...(copyRecoveryContent ? { recoveryContent: copyRecoveryContent } : {}),
        assignmentKey: null,
        assignedClassIds: [],
        assignedClassPeriods: [],
        dueAt: null,
        dueDate: null,
        lateDueAt: null,
        lateDueDate: null,
        releaseAt: null,
        courseProfile: { course: model.assignmentV5.assignment.courseId, courseLevel: null },
        rigorVariant: null,
        rigorVariantGroupId: null,
        honorsContractVersion: null,
        honorsContractScope: null,
        feedbackReleased: false,
        feedbackReleasedAt: null,
        createdAt: new Date(),
      });
      await fetchAssignments();
      toastSuccess(
        `Duplicated “${assignment.title}”`,
        'The copy passed MathMaster’s assignment checks and was saved as an unassigned library item with no student records.',
      );
    } catch (error) {
      toastError('Could not duplicate assignment', error.message);
    }
  };

  const openStoredAssignmentForPreflight = async (assignment, draftOverrides = {}) => {
    const { prepareStoredAssignmentForReuse } = await authoringKit();
    // A stored assignment is ALREADY canonical V5. Sending it back through the
    // authoring compiler used to reinterpret internal renderer contracts as new
    // AI intent. A composed function workflow could therefore collapse into the
    // legacy y=x free-plot tool while being moved from the Library to a class.
    // Reuse validates the stored canonical object directly and never recompiles
    // its questions.
    const prepared = prepareStoredAssignmentForReuse(assignment, { resetAssignmentKey: true });
    const opened = openAssignmentPreflight(
      {
        assignmentV5: prepared.assignmentV5,
        questions: prepared.questions,
        authoringWarnings: prepared.warnings,
      },
      `Library · ${assignment.title}`,
      draftOverrides,
      { sourceContentLineage: assignment.contentLineage || null, sourceAssignmentId: assignment.id || null },
    );
    if (opened !== true) throw new Error(opened?.error || 'Could not open Assignment Review for this saved assignment.');
    return prepared.assignmentV5;
  };

  const handleRepairAssignmentFromLibrary = async (assignment) => {
    const { buildSafeLibraryContentRepair, inspectLibraryContentRepair } = await authoringKit();
    const inspection = inspectLibraryContentRepair(assignment, assignments);
    if (!inspection.source || !inspection.questionIds.length) {
      toastError(
        'No safe repair source found',
        'MathMaster could not find one unambiguous saved assignment with the same question identity and the richer workflow. No student work was changed.',
      );
      return;
    }

    const proceed = await confirmAction({
      title: `Repair ${inspection.questionIds.length} corrupted question${inspection.questionIds.length === 1 ? '' : 's'}?`,
      message: 'MathMaster will restore only the collapsed workflow question content from the matching intact assignment source. The live assignment ID, question IDs/order, dates, classes, and every other question stay unchanged. Because the corrupted question was not valid work, students receive fresh attempts on that repaired question only; they do not restart the assignment.',
      confirmLabel: 'Repair assignment',
    });
    if (!proceed) return;

    try {
      const repair = buildSafeLibraryContentRepair(assignment, inspection.source);
      const currentQuestions = getStoredAssignmentQuestions(assignment);
      const repairedIndices = repair.repairedQuestionIds
        .map((questionId) => currentQuestions.findIndex((question) => question?.questionId === questionId))
        .filter((index) => index >= 0);
      const studentsWithThisAssignment = allStudents.filter((student) => (
        student?.id && student.gradesByAssignment?.[assignment.id]
      ));

      // The assignment itself and the repaired-question attempt reset are one
      // Firestore batch. Students keep every other answer/score. Only work on a
      // question that MathMaster rendered incorrectly is cleared, because
      // carrying an "expired" attempt record into the restored workflow would
      // leave the repaired question impossible to answer.
      if (studentsWithThisAssignment.length > 450) {
        throw new Error('This assignment has too many active student grade records for one safe atomic repair. Contact the platform administrator before repairing it.');
      }
      const repairedAt = new Date().toISOString();
      const batch = writeBatch(db);
      batch.update(doc(db, 'assignments', assignment.id), {
        sections: repair.sections,
        contentRepair: {
          kind: 'libraryCanonicalWorkflowRestore',
          sourceAssignmentId: inspection.source.id,
          repairedQuestionIds: repair.repairedQuestionIds,
          repairedQuestionIndices: repairedIndices,
          repairedAt,
          studentQuestionAttemptsReset: true,
        },
      });
      studentsWithThisAssignment.forEach((student) => {
        const gradePatch = {};
        repairedIndices.forEach((questionIndex) => {
          gradePatch[`gradesByAssignment.${assignment.id}.${questionIndex}`] = emptyQuestionRecord();
        });
        // Classwork completion is a derived summary. The student's other
        // question records remain untouched, and the summary will be earned
        // again from the repaired content rather than retaining a score based
        // on the broken renderer.
        gradePatch[`classworkGradesByAssignment.${assignment.id}`] = deleteField();
        batch.update(doc(db, 'grades', student.id), gradePatch);
      });
      await batch.commit();

      await fetchAssignments();
      toastSuccess(
        'Assignment repaired without restarting students',
        `Restored ${repair.repairedQuestionIds.length} corrupted question${repair.repairedQuestionIds.length === 1 ? '' : 's'} in place. Students keep all other work and receive fresh attempts only on the repaired question${repair.repairedQuestionIds.length === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      console.error(error);
      toastError('Could not repair assignment', error.message);
    }
  };

  const handleSaveAssignmentDates = async (assignmentId) => {
    const dueAt = new Date(editingAssignmentDates.dueAt);
    const hasLateDue = Boolean(String(editingAssignmentDates.lateDueAt || '').trim());
    const lateDueAt = hasLateDue ? new Date(editingAssignmentDates.lateDueAt) : null;
    if (
      Number.isNaN(dueAt.getTime())
      || (lateDueAt && (Number.isNaN(lateDueAt.getTime()) || lateDueAt <= dueAt))
    ) {
      toastError('Check the dates', 'Set a valid due date. If you use a final late due date, it must be later than the regular due date.');
      return;
    }

    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) {
      toastError('Assignment not found', 'Refresh the assignment list and try again.');
      return;
    }

    const editedClassIds = Array.isArray(editingAssignmentDates.assignedClassIds)
      ? editingAssignmentDates.assignedClassIds
      : [];
    const editedClassRecords = editedClassIds.length
      ? classes.filter((entry) => editedClassIds.includes(entry.classId) && entry?.status !== 'archived')
      : [];
    const editedPeriods = [...new Set(editedClassRecords.map((entry) => entry.period).filter(Boolean))];

    // A library item is a reusable source, not a half-published assignment.
    // Selecting classes launches the same Preflight/new-destination path used by
    // fresh V5 authoring. The library template remains untouched and reusable.
    if (isLibraryAssignment(assignment) && editedClassIds.length) {
      try {
        await openStoredAssignmentForPreflight(assignment, {
          title: assignment.title,
          folder: assignment.folder || '',
          dueAt: editingAssignmentDates.dueAt,
          lateDueAt: editingAssignmentDates.lateDueAt || '',
          // A teacher's "no Practice Passes" goes with the assignment to the classes it is given to.
          allowPracticePasses: practicePassesAllowed(assignment),
          assignedClassIds: editedClassIds,
          assignedClassPeriods: editedPeriods,
          dolInstructionDate: editingAssignmentDates.dolInstructionDate || '',
        });
        setEditingAssignmentId(null);
        toastInfo(
          'Review before assigning',
          'The library template is staying unchanged. Preflight will create the correct destination version(s) for the classes you selected.',
        );
      } catch (error) {
        toastError('Could not open assignment Preflight', error.message);
      }
      return;
    }

    // Adding another class is a NEW delivery of the same authored assignment.
    // Keep the existing class record (and therefore its due date, student
    // evidence, and Classroom post) unchanged. The edited dates belong to the
    // newly-added class(es), which are prepared from this assignment's reviewed
    // V5 source. This is what makes "Period 3 due Tuesday, Period 5 due
    // Wednesday" possible without one save silently moving both deadlines.
    const originalClassIds = Array.isArray(assignment.assignedClassIds)
      ? assignment.assignedClassIds.filter(Boolean)
      : [];
    const addedClassIds = editedClassIds.filter((classId) => !originalClassIds.includes(classId));
    const keptEveryOriginalClass = originalClassIds.every((classId) => editedClassIds.includes(classId));
    if (addedClassIds.length && keptEveryOriginalClass) {
      try {
        const addedRecords = classes.filter((entry) => addedClassIds.includes(entry.classId) && entry?.status !== 'archived');
        const addedPeriods = [...new Set(addedRecords.map((entry) => entry.period).filter(Boolean))];
        await openStoredAssignmentForPreflight(assignment, {
          title: assignment.title,
          folder: assignment.folder || '',
          dueAt: editingAssignmentDates.dueAt,
          lateDueAt: editingAssignmentDates.lateDueAt || '',
          allowPracticePasses: practicePassesAllowed(assignment),
          assignedClassIds: addedClassIds,
          assignedClassPeriods: addedPeriods,
          dolInstructionDate: editingAssignmentDates.dolInstructionDate || '',
        });
        setEditingAssignmentId(null);
        toastInfo(
          'Review the added class delivery',
          'The current class assignment and its dates stay unchanged. MathMaster reused the assignment for only the new class(es), so their due date and Standard/Honors depth can be managed independently.',
        );
      } catch (error) {
        toastError('Could not prepare the added class', error.message);
      }
      return;
    }

    // Existing assigned variants may move among classes with the same
    // course/rigor destination, but cannot silently change Standard/Honors
    // identity or fan out into mixed rigor without going through a fresh split.
    const targetGroups = buildDestinationGroups({ assignedClassIds: editedClassIds, classes });
    const currentCourse = assignment.courseId || assignment.courseProfile?.course || null;
    const currentLevel = assignment.rigorVariant || assignment.courseProfile?.courseLevel || null;
    const changesDestination = targetGroups.length > 1
      || (targetGroups.length === 1 && currentCourse && targetGroups[0].course !== currentCourse)
      || (targetGroups.length === 1 && currentLevel && targetGroups[0].courseLevel !== currentLevel);
    if (changesDestination) {
      toastError(
        'Use a destination copy',
        'This edit would move or mix a destination-specific Standard/Honors delivery. Add another class without removing the current class, or use the reusable Library source so MathMaster can preserve the correct rigor version.',
      );
      return;
    }

    const hasDOL = Boolean(assignment?.dol?.enabled || getStoredAssignmentQuestions(assignment).some((question) => (
      resolveQuestionActivityRole({ question, assignment }) === 'dol'
    )));
    const patch = {
      dueAt: dueAt.toISOString(),
      dueDate: dueAt.toISOString(),
      lateDueAt: lateDueAt ? lateDueAt.toISOString() : null,
      assignedClassIds: editedClassIds,
      assignedClassPeriods: editedPeriods,
    };
    if (hasDOL) {
      patch.dol = {
        ...(assignment?.dol || {}),
        enabled: assignment?.dol?.enabled ?? true,
        instructionDate: editingAssignmentDates.dolInstructionDate || localDateKey(Date.now()),
      };
    }
    // `dol` as the fields this edit changed (enabled, its day), never the
    // whole map from this tab's copy, which would carry students' grants.
    const { dol: editedDol, ...patchWithoutDol } = patch;
    await updateDoc(doc(db, 'assignments', assignmentId), {
      ...patchWithoutDol,
      ...(editedDol ? classDolFieldPatch(assignment?.dol, editedDol, { deleteValue: deleteField() }) : {}),
    });

    const nextAssignment = {
      ...assignment,
      ...patch,
      dol: patch.dol || assignment?.dol,
    };

    if (shouldAutoPublishClassroomPackage(nextAssignment)) {
      try {
        // Publishing is idempotent for courses that already have a MathMaster
        // post and creates the missing post for any class just added in Dates &
        // Classes. Only after that do we patch every existing post's due date.
        // Previously we only ran the update call, which cannot create a
        // Classroom post and made "add another class" appear not to work.
        await autoPublishAssignmentPackageToClassroom(nextAssignment);
        await updateAssignmentClassroomPublications({ assignmentId });
      } catch (classroomError) {
        console.warn('Classroom publish/sync after assignment edit failed:', classroomError);
      }
    }

    setEditingAssignmentId(null);
  };
  return {
    handleAssignmentJsonReady,
    confirmAssignmentPreflight,
    saveQuestionEditor,
    handleDuplicateAssignment,
    handleRepairAssignmentFromLibrary,
    handleSaveAssignmentDates,
  };
}
