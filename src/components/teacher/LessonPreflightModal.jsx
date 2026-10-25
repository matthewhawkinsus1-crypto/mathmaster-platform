import React, { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { MathMasterToolWrapper } from '../../platform/ToolWrapper';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies';
import { PUBLICATION_STRATEGIES, planClassroomPublication } from '../../platform/publishing/publicationPlanner';
import {
  normalizeLessonPublishingIntentV5,
  validateLessonPublishingIntent,
} from '../../platform/authoring/lessonPublishingIntent.js';
import { defaultAssignmentDateInputs } from '../../platform/assignments/assignmentDateDefaults.js';
import { buildAssignmentV5PreflightModel } from '../../platform/preflight/assignmentV5PreflightModel.js';
import { findAssignmentKeyConflict } from '../../assignmentDestinations.js';
import { applySafeToolContractRepairs } from '../../platform/contract/questionToolContract.js';
import { formatPlannedTime } from '../../platform/teacher/classworkPacing.js';
import {
  SECURE_FAMILY_IMPORT_ROUTE,
  buildTestCyclePhaseStatus,
  isTestCycleAssignment,
  resolveTestCycleStage,
} from '../../platform/assessment/testCycle.js';
import InteractiveModelingLabPlayer from '../labs/InteractiveModelingLabPlayer.jsx';
import { inspectHonorsRigor } from '../../platform/rigor/courseRigor.js';
import {
  buildDeterministicHonorsExtension,
  describeHonorsRecipeForTeacher,
  certifyHonorsExtensionQuestion,
  selectHonorsExtensionRecipe,
  withHonorsExtension,
} from '../../platform/rigor/honorsExtensionRecipes.js';
import {
  applyHonorsDepthAiSections,
  buildHonorsDepthAiRepairRequest,
  honorsMissingLabels,
  nonCcmrHonorsMissing,
  nonCcmrHonorsReady,
  separateHonorsDepthAiRepair,
  unresolvedRequestedHonorsGaps,
} from '../../platform/contract/honorsDepthAiRepair.js';
import {
  assignmentAiDiagnostics,
  assignmentAiFailureMessage,
  assignmentAiFallbackRecommended,
  buildAssignmentWithAI,
  repairQuestionWithAI,
} from '../../services/assignmentAiService.js';
import { preflightTestCycleCandidate } from '../../services/testCycleService.js';
import { hydrateAssignmentCcmr } from '../../services/assignmentCcmrService.js';
import { generatePathInstanceWithRetries, hasPathGenerator } from '../../../functions/shared/pathQuestionGeneration.mjs';
import MathText from '../common/MathText.jsx';
import {
  HONORS_CCMR_STATUS,
  assignmentFingerprint,
  ccmrSelectionKey,
  ccmrSourcingKey,
  composeHonorsCcmrCandidate,
  selectHonorsCcmrItems,
} from '../../platform/assignments/canonicalCcmrHydration.js';
import { seedPathQuestionBank } from '../../platform/path/pathCoverageService.js';
import { clearTeacherPathBankSnapshotCache } from '../../platform/path/pathBankSimulationService.js';
import { testCycleCandidateContract } from '../../platform/teacher/testCyclePreviewModel.js';
import {
  familyDocumentsToRegister,
  registrableTestCycleFamilies,
  unavailableTestCycleFamilies,
} from '../../platform/teacher/testCycleFamilyRegistration.js';
import Dialog from '../../ui/Dialog.jsx';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';
import RepresentationAudit from './RepresentationAudit';
import RecoveryReadinessPanel from './RecoveryReadinessPanel.jsx';
import { RECOVERY_REPAIR_INSTRUCTION } from '../../platform/recovery/recoveryReadinessCopy.js';
import SectionBalanceRigorAudit from './SectionBalanceRigorAudit.jsx';
import {
  PREFLIGHT_STEPS, blockersForStep, collectReviewBlockers,
  describePreflightAction, stepIndex, summarizePreflightReadiness,
} from './preflightSteps';
import AdaptivePreview from './AdaptivePreview.jsx';
import { ASSIGNMENT_CALCULATOR_SETTINGS, buildPreflightReviewedAssignmentV5, reviewedCalculatorSetting } from './preflightV5Review.js';
import { practicePassSwitchApplies } from '../../platform/rewards/practicePassPolicy.js';
import { REWARD_DEFINITIONS } from '../../../functions/shared/rewardGrants.mjs';
import { buildQuestionRepairRequest, parseQuestionRepairResponse } from '../../platform/contract/questionRepairRequest.js';
import { CONTRACT_SLICES, buildContractSlice } from '../../platform/contract/authoringContract.js';
import { parseExternalAiJson } from '../../platform/contract/externalAiJson.js';
import {
  groupQuestionPreflightIssues,
  newlyIntroducedPreflightErrors,
  replaceQuestionAtFlatIndex,
} from '../../platform/preflight/preflightQuestionRepair.js';
import { scrollMotion } from '../../motionPreference.js';

// The full student preview of a Test Cycle mounts the secure question player
// and every Rich Tool, so it loads only when a teacher opens it.
const TestCyclePreview = lazy(() => import('./TestCyclePreview.jsx'));

// Narrow enough that side-by-side panels stop working. Matches the breakpoint
// the student-side mobile container already uses, so the two agree about what
// "a phone" is.
const NARROW_QUERY = '(max-width: 820px)';

const useIsNarrow = () => {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(NARROW_QUERY)?.matches === true,
  );
  useEffect(() => {
    const media = window.matchMedia?.(NARROW_QUERY);
    if (!media) return undefined;
    const update = (event) => setIsNarrow(event.matches);
    media.addEventListener('change', update);
    setIsNarrow(media.matches);
    return () => media.removeEventListener('change', update);
  }, []);
  return isNarrow;
};

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  // 16px keeps iOS from zooming the whole page in when a field is focused,
  // which on the old layout left the teacher scrolled sideways with no way back.
  fontSize: 'calc(16 * var(--mm-px))',
  minHeight: 44,
  padding: '10px',
  border: '1px solid var(--mm-border)',
  borderRadius: 7,
  boxSizing: 'border-box',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
};

// A default checkbox is about 13px, which is a poor target on a phone even
// inside a 44px label.
const checkboxStyle = { width: 20, height: 20, flexShrink: 0 };

const fieldsetStyle = { marginTop: 18, padding: 15, border: '1px solid var(--mm-border)', borderRadius: 10 };
const legendStyle = { fontWeight: 900 };
const labelStyle = { fontWeight: 800, display: 'block' };

const writeClipboardText = async (text) => {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard copy is unavailable in this browser.');
  await navigator.clipboard.writeText(String(text || ''));
};

const readClipboardText = async () => {
  if (!navigator.clipboard?.readText) throw new Error('Clipboard paste is unavailable in this browser.');
  const text = await navigator.clipboard.readText();
  if (!String(text || '').trim()) throw new Error('The clipboard is empty.');
  return text;
};

const initialReviewDraft = (draft = {}) => {
  const { assignedClassPeriods, assignedClassIds, ...rest } = draft;
  const defaultDates = defaultAssignmentDateInputs();
  return {
    title: '',
    folder: '',
    dueAt: defaultDates.dueAt,
    lateDueAt: defaultDates.lateDueAt,
    releaseAt: '',
    sectionVariantModes: {},
    sectionAccessDefaults: { classwork: 'open', practice: 'open' },
    // Practice keeps Guided Notes off by default: the owner's decision (FB20, 2026-10-23).
    guidedNotesBySection: { classwork: 'automatic', practice: 'off' },
    // Students may use a Practice Pass on it unless the teacher turns that off (LC23).
    allowPracticePasses: true,
    warmupEnabled: true,
    warmupMinutesBeforeStart: 7,
    warmupInstructionDate: '',
    warmupInstructionDatesByClassPeriod: {},
    dolEnabled: false,
    dolMinutesBeforeEnd: 10,
    dolCloseMinutesBeforeEnd: 5,
    dolInstructionDate: '',
    dolInstructionDatesByClassPeriod: {},
    dolQuestionIndex: null,
    homeworkDueAt: '',
    ...rest,
    // Assignment V5 always publishes one Classroom post per authored section.
    // Put these after legacy saved draft fields so reopening an older Hybrid
    // setup previews the new per-section contract without changing Classroom
    // until the teacher explicitly saves.
    publicationStrategy: PUBLICATION_STRATEGIES.SPLIT,
    includeWarmupInClassroom: true,
    assignedClassPeriods: Array.isArray(assignedClassPeriods) ? [...assignedClassPeriods] : [],
    assignedClassIds: Array.isArray(assignedClassIds) ? [...assignedClassIds] : [],
  };
};

const humanRole = (role) => ({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  dol: 'DOL',
  practice: 'Practice',
  quiz: 'Quiz',
  test: 'Test',
}[role] || role);

const CCMR_FRAMEWORK_LABELS = Object.freeze({ digitalSAT: 'Digital SAT', act: 'ACT', tsia2: 'TSIA2', asvab: 'ASVAB' });
const ccmrFrameworkLabel = (framework) => CCMR_FRAMEWORK_LABELS[framework] || framework || 'Audited CCMR';
// An audited item is a template ({{m}}, {{b|signed}}). The teacher reads one
// instance of it, drawn by the generator a student's copy comes from, not the
// placeholders; the template text only if no instance can be drawn.
const auditedExamplePrompt = (question, fallback = '') => {
  try {
    if (question && hasPathGenerator(question)) {
      const drawn = generatePathInstanceWithRetries(question, 'preflight-honors-example');
      if (drawn?.question?.prompt) return String(drawn.question.prompt);
    }
  } catch {
    // The template text below.
  }
  return String(fallback || question?.prompt || '');
};
const HONORS_TONES = Object.freeze({
  done: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  busy: { background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  note: { background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)' },
  attention: { background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' },
});
const HONORS_TONE_MARKS = Object.freeze({ done: '✓', busy: '↻', note: 'i', attention: '!' });

// A blocker list scoped to one step, shown at the top of that step so the
// reason is next to the control that fixes it rather than eight screens down.
const StepBlockers = ({ blockers }) => {
  if (!blockers.length) return null;
  return (
    <div role="alert" style={{ padding: 13, marginBottom: 16, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '1px solid var(--mm-error-border-soft)', borderRadius: 9 }}>
      <strong>{blockers.length === 1 ? 'One thing to fix here' : `${blockers.length} things to fix here`}</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>
        {blockers.map((entry, index) => <li key={`${index}-${entry.message}`}>{entry.message}</li>)}
      </ul>
    </div>
  );
};

export const LessonPreflightModal = ({
  assignmentV5,
  initialDraft = {},
  classPeriods = [],
  classes = [],
  courseProfiles = {},
  sourceLabel = '',
  sourceQuestions = [],
  authoringWarnings = [],
  onClose,
  onConfirmPublish,
  busy = false,
  reviewMode = 'create',
  allowQuestionRepair = true,
  // The saved assignments, so a reused assignmentKey is caught here and not at
  // Create (findAssignmentKeyConflict; TT10).
  existingAssignments = [],
  // { classId: number of active students } — lets Pre-Flight compare each
  // question's distinct versions with the class it will actually be given to.
  rosterSizesByClassId = {},
  // Discoverability only: the root administrator is offered the in-place
  // import of a Test Cycle's missing secure families. The server re-checks.
  canManageSecureBank = false,
}) => {
  const isNarrow = useIsNarrow();
  const [draft, setDraft] = useState(() => initialReviewDraft(initialDraft));
  const [activeStep, setActiveStep] = useState('details');
  const [demoActivityIndex, setDemoActivityIndex] = useState(0);
  const [demoQuestionIndex, setDemoQuestionIndex] = useState(0);
  const [demoTranslation, setDemoTranslation] = useState('en');
  const [demoCalculator, setDemoCalculator] = useState(false);
  const [showDemoControls, setShowDemoControls] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewReviewComplete, setPreviewReviewComplete] = useState(false);
  const [serverCyclePreflight, setServerCyclePreflight] = useState(null);
  // Bumped to ask the server again, e.g. after the missing families are imported.
  const [serverCyclePreflightRun, setServerCyclePreflightRun] = useState(0);
  const [familyRegistration, setFamilyRegistration] = useState({ busy: false, message: '', error: '', rejected: [] });
  const [cyclePreviewOpen, setCyclePreviewOpen] = useState(false);
  const [honorsEnrichmentQuestion, setHonorsEnrichmentQuestion] = useState(null);
  const [honorsAiBusy, setHonorsAiBusy] = useState(false);
  const [honorsAiMessage, setHonorsAiMessage] = useState('');
  const [publishingAiBusy, setPublishingAiBusy] = useState(false);
  const [publishingAiMessage, setPublishingAiMessage] = useState('');
  const honorsRepairFileRef = useRef(null);
  const notesRepairFileRef = useRef(null);
  const [workingAssignmentV5, setWorkingAssignmentV5] = useState(() => assignmentV5);
  const [repairTargetIndex, setRepairTargetIndex] = useState(null);
  // 'blocker' (a Pre-Flight blocker) or 'recovery' (a Warm-Up or DOL question
  // with no certified Recovery): which list the repair request is built from.
  const [repairPurpose, setRepairPurpose] = useState('blocker');
  const [repairInstruction, setRepairInstruction] = useState('');
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');
  // THE HONORS VERSION (canonicalCcmrHydration.js): the server's ranked plan of
  // audited CCMR candidates, the items the teacher set aside, and the
  // teacher's decision when no audited item passes. The plan is keyed to the
  // questions it was made for; the decision to the situation it answered.
  const [ccmrPlan, setCcmrPlan] = useState({ key: null, status: 'idle', hydration: null, error: '' });
  const [ccmrPlanRun, setCcmrPlanRun] = useState(0);
  const [ccmrSetAside, setCcmrSetAside] = useState([]);
  const [ccmrKeepAuthoredFor, setCcmrKeepAuthoredFor] = useState(null);
  const [previewVersion, setPreviewVersion] = useState('standard');

  // Teacher review controls edit canonical Assignment V5 directly. The exact
  // reviewed V5 object is revalidated before it
  // powers preview, Classroom planning, and final publishing.
  const reviewedAssignmentV5 = useMemo(
    () => buildPreflightReviewedAssignmentV5(workingAssignmentV5, draft),
    [workingAssignmentV5, draft],
  );
  // The largest class this assignment will be given to: uniqueness is per class.
  const preflightClassSize = useMemo(() => {
    const chosen = Array.isArray(draft.assignedClassIds) && draft.assignedClassIds.length
      ? draft.assignedClassIds
      : Object.keys(rosterSizesByClassId || {});
    const sizes = chosen.map((classId) => Number(rosterSizesByClassId?.[classId]) || 0).filter((size) => size > 0);
    return sizes.length ? Math.max(...sizes) : null;
  }, [draft.assignedClassIds, rosterSizesByClassId]);
  const preflightModel = useMemo(
    () => buildAssignmentV5PreflightModel(reviewedAssignmentV5, { classSize: preflightClassSize }),
    [reviewedAssignmentV5, preflightClassSize],
  );
  const effectiveAssignmentV5 = preflightModel.assignmentV5;
  const publishingIntent = useMemo(() => normalizeLessonPublishingIntentV5({
    classroom: effectiveAssignmentV5.classroomIntegration,
    lessonResources: { notesPdf: effectiveAssignmentV5.outputProfiles?.lessonNotesPdf },
  }, effectiveAssignmentV5.assignment, []), [effectiveAssignmentV5]);
  const activities = preflightModel.sections;
  const classworkPacing = preflightModel.classworkPacing || { totalSeconds: 0, maxSeconds: 1200, remainingSeconds: 1200, hasAuthoredTiming: false, isWithinBudget: true };
  const activityRoles = useMemo(() => [...new Set(activities.map((section) => section?.role).filter(Boolean))], [activities]);
  const hasAuthoredWarmup = activityRoles.includes('warmup');
  const hasAuthoredDOL = activityRoles.includes('dol');
  const previewQuestions = preflightModel.questions;
  const testCyclePreview = useMemo(() => {
    if (!isTestCycleAssignment(effectiveAssignmentV5)) return null;
    const record = { review: { required: true }, test: { examSessionId: 'teacher-preview-secure-test', state: 'assigned' } };
    const state = resolveTestCycleStage({
      policy: effectiveAssignmentV5.assessmentPolicy || { mode: 'testCycle' },
      record,
      reviewProgress: { total: 1, attempted: previewReviewComplete ? 1 : 0, complete: previewReviewComplete },
    });
    return { state, phases: buildTestCyclePhaseStatus({ state, record }) };
  }, [effectiveAssignmentV5, previewReviewComplete]);
  useEffect(() => {
    let active = true;
    if (!isTestCycleAssignment(effectiveAssignmentV5)) {
      setServerCyclePreflight(null);
      return () => { active = false; };
    }
    setServerCyclePreflight({ loading: true, blocked: true, checks: [], errors: [] });
    preflightTestCycleCandidate({ assignment: effectiveAssignmentV5 })
      .then((response) => {
        if (active) setServerCyclePreflight({ ...(response.preflight || {}), loading: false });
      })
      .catch((error) => {
        if (active) setServerCyclePreflight({ loading: false, blocked: true, checks: [], errors: [error.message || 'Secure Test validation could not be completed.'] });
      });
    return () => { active = false; };
  }, [effectiveAssignmentV5, serverCyclePreflightRun]);
  // What the server is sent to preview the unsaved Test Cycle: its contract,
  // not its Review answers. Memoized, because the preview reloads on a change.
  const testCycleCandidate = useMemo(
    () => (isTestCycleAssignment(effectiveAssignmentV5) ? testCycleCandidateContract(effectiveAssignmentV5) : null),
    [effectiveAssignmentV5],
  );
  const familiesToRegister = useMemo(() => (
    serverCyclePreflight && !serverCyclePreflight.loading
      ? registrableTestCycleFamilies(unavailableTestCycleFamilies({ preflight: serverCyclePreflight, blueprint: effectiveAssignmentV5.testBlueprint }))
      : []
  ), [serverCyclePreflight, effectiveAssignmentV5]);
  // Import exactly the missing families from the Test's secure-families file,
  // through the same validated, all-or-nothing importer Administration uses,
  // then ask the server again. Families already in the bank are not touched.
  const registerSecureFamilies = async (file) => {
    if (!file || familyRegistration.busy) return;
    setFamilyRegistration({ busy: true, message: 'Reading the families file…', error: '', rejected: [] });
    let reachedServer = false;
    try {
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error('That file is not valid JSON. Choose the secure-families .json file that came with this Test.');
      }
      const wanted = familiesToRegister.map((row) => row.familyId);
      const { documents, missingFromFile } = familyDocumentsToRegister({ parsed, familyIds: wanted });
      if (!documents.length) {
        throw new Error(`That file does not contain ${wanted.join(', ')}. Choose the secure-families file that came with this Test.`);
      }
      reachedServer = true;
      const imported = await seedPathQuestionBank(documents, {
        onProgress: ({ phase }) => setFamilyRegistration((current) => ({
          ...current,
          message: phase === 'validating' ? 'The server is checking the family before anything is saved…'
            : phase === 'coverage' ? 'Saved. Updating My Math Path coverage…'
              : 'Saving to the secure question bank…',
        })),
      });
      if (!imported.imported) {
        setFamilyRegistration({ busy: false, message: '', error: 'The server refused it, so nothing was saved:', rejected: imported.rejected || [] });
        return;
      }
      clearTeacherPathBankSnapshotCache();
      setFamilyRegistration({
        busy: false,
        message: `Registered ${documents.map((document) => document.id).join(', ')} in the secure question bank.${missingFromFile.length ? ` Not in that file: ${missingFromFile.join(', ')}.` : ''}`,
        error: '',
        rejected: [],
      });
    } catch (error) {
      setFamilyRegistration({ busy: false, message: '', error: error.message || 'The families could not be registered.', rejected: [] });
    } finally {
      // Whatever happened on the server, show what is true now.
      if (reachedServer) setServerCyclePreflightRun((run) => run + 1);
    }
  };
  const publishingValidation = useMemo(
    () => validateLessonPublishingIntent(publishingIntent),
    [publishingIntent],
  );
  const validationErrors = [
    ...preflightModel.errors,
    ...publishingValidation.errors,
  ];
  const reviewedNotesPdf = publishingIntent.lessonResources?.notesPdf || {};
  const notesNeedAuthoring = reviewedNotesPdf.enabled === true && (
    Number(reviewedNotesPdf.targetPages) !== 2
    || !String(reviewedNotesPdf.learningGoal || '').trim()
    || !Array.isArray(reviewedNotesPdf.sections)
    || reviewedNotesPdf.sections.length < 2
  );
  const questionRepairIssues = useMemo(
    () => groupQuestionPreflightIssues(validationErrors, previewQuestions),
    [validationErrors, previewQuestions],
  );
  // RECOVERY V2: a Warm-Up or DOL question no certified Recovery family can
  // pair, in the planner's own words plus the instruction that asks the AI
  // for a recoverable version. Offered only where Recovery applies.
  const recoveryRepairIssues = useMemo(() => {
    const recovery = preflightModel.questionGeneration?.recovery || {};
    return ['warmup', 'dol'].flatMap((section) => {
      const entry = recovery[section];
      if (!entry || ['off', 'liveChallenge', 'secure'].includes(entry.status)) return [];
      return (entry.rows || [])
        .filter((row) => row.status === 'unavailable' && Number.isInteger(row.storageIndex))
        .map((row) => ({
          questionIndex: row.storageIndex,
          questionNumber: row.storageIndex + 1,
          question: previewQuestions[row.storageIndex],
          errors: [
            ...(row.issues || []).map((issue) => [issue.message, issue.fix].filter(Boolean).join(' ')),
            RECOVERY_REPAIR_INSTRUCTION,
          ],
          recovery: true,
        }));
    });
  }, [preflightModel.questionGeneration, previewQuestions]);

  const computedPublicationPlan = useMemo(() => planClassroomPublication({
    assignmentV5: effectiveAssignmentV5,
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: draft.dueAt || null,
    homeworkDueDate: draft.homeworkDueAt || null,
    includeWarmupInClassroom: true,
  }), [effectiveAssignmentV5, draft.dueAt, draft.homeworkDueAt]);

  const publicationPlan = computedPublicationPlan;
  const posts = Array.isArray(publicationPlan?.plannedPosts) ? publicationPlan.plannedPosts : [];

  const activeClassChoices = useMemo(() => (Array.isArray(classes) ? classes : []).filter((entry) => entry?.status !== 'archived' && entry?.classId), [classes]);
  const selectedClassChoices = useMemo(
    () => activeClassChoices.filter((entry) => (draft.assignedClassIds || []).includes(entry.classId)),
    [activeClassChoices, draft.assignedClassIds],
  );
  const rigorDestinations = useMemo(() => ({
    standard: selectedClassChoices.filter((entry) => entry.courseLevel !== 'honors').map((entry) => entry.name || entry.period),
    honors: selectedClassChoices.filter((entry) => entry.courseLevel === 'honors').map((entry) => entry.name || entry.period),
  }), [selectedClassChoices]);
  const sourceRigorQuestions = useMemo(() => activities.flatMap((activity) => [
    ...(Array.isArray(activity.questions) ? activity.questions.map((question) => ({
      ...question,
      activityRole: question.activityRole || activity.role || 'classwork',
    })) : []),
    ...(activity.isModelingLab ? [{
      type: 'modelingLab',
      activityRole: activity.role || 'classwork',
      dok: activity.labDefinition?.dokLevel || activity.labDefinition?.dok || 3,
      teks: activity.labDefinition?.teksAlignments || activity.labDefinition?.teks || [],
      prompt: activity.labDefinition?.guidingQuestion || activity.title,
      ccmr: activity.labDefinition?.ccmr === true,
    }] : []),
  ]), [activities]);
  // Whether a vetted no-AI Honors recipe exists for this assignment's concept
  // and course, known before the teacher clicks: an unavailable extension is
  // explained on the screen, never replaced by a generic one.
  const localHonorsRecipe = useMemo(() => selectHonorsExtensionRecipe({
    questions: sourceRigorQuestions,
    assignmentCourseId: effectiveAssignmentV5?.assignment?.courseId,
  }), [sourceRigorQuestions, effectiveAssignmentV5]);
  const honorsReport = useMemo(
    () => inspectHonorsRigor(
      [...sourceRigorQuestions, ...(honorsEnrichmentQuestion ? [honorsEnrichmentQuestion] : [])],
      { allowNarrowCheckpoint: true },
    ),
    [sourceRigorQuestions, honorsEnrichmentQuestion],
  );
  const honorsSelected = rigorDestinations.honors.length > 0;

  /*
   * THE HONORS VERSION, PREPARED AND PROVEN HERE — NOT AT CREATE.
   *
   * With an Honors class selected, MathMaster asks the audited CCMR bank for
   * its ranked candidates, keeps for each Practice place the first one this
   * whole assignment passes Pre-Flight with, and builds the final Honors
   * assignment (canonicalCcmrHydration.js). That object is what the teacher
   * previews below and exactly what Create publishes. Editing a question,
   * adding the Honors extension or changing classes prepares it again.
   * Setup edits to an existing assignment never change its rigor destination
   * (updateExistingAssignmentFromReview refuses), so there is nothing to
   * prepare then.
   */
  const honorsVersionNeeded = reviewMode !== 'update' && honorsSelected;
  const honorsCcmrNeeded = honorsVersionNeeded && !honorsReport.isNarrowCheckpoint;
  // Uniqueness and capacity are judged per class: the largest Honors class.
  const honorsClassSize = useMemo(() => {
    const sizes = selectedClassChoices
      .filter((entry) => entry.courseLevel === 'honors')
      .map((entry) => Number(rosterSizesByClassId?.[entry.classId]) || 0)
      .filter((size) => size > 0);
    return sizes.length ? Math.max(...sizes) : preflightClassSize;
  }, [selectedClassChoices, rosterSizesByClassId, preflightClassSize]);
  // Typing a title must not wait for the Honors version to be re-proven; the
  // blockers below hold Create until it has caught up with what is on screen.
  const honorsBaseAssignmentV5 = useDeferredValue(effectiveAssignmentV5);
  const ccmrRequestKey = useMemo(() => (
    honorsCcmrNeeded ? `${ccmrSourcingKey(honorsBaseAssignmentV5)}|${ccmrSetAside.join(',')}|${ccmrPlanRun}` : null
  ), [honorsCcmrNeeded, honorsBaseAssignmentV5, ccmrSetAside, ccmrPlanRun]);
  useEffect(() => {
    if (!ccmrRequestKey) return undefined;
    let active = true;
    const requested = honorsBaseAssignmentV5;
    const excludeDocumentIds = ccmrSetAside;
    setCcmrPlan((current) => (current.key === ccmrRequestKey ? current : { key: ccmrRequestKey, status: 'loading', hydration: null, error: '' }));
    // A short pause so a burst of edits asks the bank once.
    const timer = setTimeout(() => {
      hydrateAssignmentCcmr(requested, { ensurePracticeTarget: true, includeCandidates: true, excludeDocumentIds })
        .then((hydration) => {
          if (active) setCcmrPlan({ key: ccmrRequestKey, status: 'ready', hydration, error: '' });
        })
        .catch((error) => {
          if (active) setCcmrPlan({ key: ccmrRequestKey, status: 'error', hydration: null, error: error?.message || 'The audited CCMR bank did not answer.' });
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ccmrRequestKey]);
  const honorsSelectionKey = useMemo(() => (honorsCcmrNeeded ? ccmrSelectionKey(honorsBaseAssignmentV5) : null), [honorsCcmrNeeded, honorsBaseAssignmentV5]);
  const ccmrPlanReady = honorsCcmrNeeded && ccmrPlan.status === 'ready' && ccmrPlan.key === ccmrRequestKey;
  // Stage 1 — which audited item goes where — re-runs only when something the
  // checks read changes, never for a retitle (see ccmrSelectionKey).
  const honorsSelection = useMemo(() => (
    ccmrPlanReady
      ? selectHonorsCcmrItems({
        baseAssignmentV5: honorsBaseAssignmentV5,
        hydration: ccmrPlan.hydration,
        honorsEnrichmentQuestion,
        excludedDocumentIds: ccmrSetAside,
        classSize: honorsClassSize,
      })
      : null
  ), [ccmrPlanReady, ccmrPlan, honorsSelectionKey, honorsEnrichmentQuestion, ccmrSetAside, honorsClassSize]);
  const keepAuthoredToken = honorsSelection ? `${ccmrRequestKey}|${honorsSelection.selectionKey}` : null;
  // Stage 2 — the final Honors assignment, on exactly the reviewed object.
  const honorsCandidate = useMemo(() => {
    if (!honorsVersionNeeded) return null;
    if (honorsCcmrNeeded && !honorsSelection) return null;
    return composeHonorsCcmrCandidate({
      baseAssignmentV5: honorsBaseAssignmentV5,
      selection: honorsCcmrNeeded ? honorsSelection : null,
      honorsEnrichmentQuestion,
      keepAuthored: Boolean(keepAuthoredToken) && ccmrKeepAuthoredFor === keepAuthoredToken,
      classSize: honorsClassSize,
    });
  }, [honorsVersionNeeded, honorsCcmrNeeded, honorsSelection, honorsBaseAssignmentV5, honorsEnrichmentQuestion, keepAuthoredToken, ccmrKeepAuthoredFor, honorsClassSize]);
  const reviewedFingerprint = useMemo(() => (honorsVersionNeeded ? assignmentFingerprint(effectiveAssignmentV5) : null), [honorsVersionNeeded, effectiveAssignmentV5]);
  const honorsCandidateCurrent = Boolean(honorsCandidate) && honorsCandidate.baseFingerprint === reviewedFingerprint;
  const honorsCcmrState = useMemo(() => {
    if (!honorsVersionNeeded) return null;
    if (honorsCcmrNeeded && ccmrPlan.status === 'error' && ccmrPlan.key === ccmrRequestKey) return { status: 'error', error: ccmrPlan.error };
    if (!honorsCandidate || !honorsCandidateCurrent) return { status: 'preparing' };
    return { status: honorsCandidate.status, errors: honorsCandidate.errors };
  }, [honorsVersionNeeded, honorsCcmrNeeded, ccmrPlan, ccmrRequestKey, honorsCandidate, honorsCandidateCurrent]);

  const honorsCcmrChip = (() => {
    if (!honorsVersionNeeded) {
      // A setup edit keeps the questions this assignment already has.
      return honorsReport.checks.ccmrEnrichment
        ? { tone: 'done', text: 'Authentic CCMR Practice' }
        : { tone: 'note', text: 'No audited CCMR in this version' };
    }
    switch (honorsCcmrState?.status) {
      case HONORS_CCMR_STATUS.READY: return { tone: 'done', text: 'Authentic CCMR Practice' };
      case HONORS_CCMR_STATUS.NOT_REQUIRED: return { tone: 'done', text: 'CCMR not needed (short Practice)' };
      case HONORS_CCMR_STATUS.KEPT_AUTHORED: return { tone: 'note', text: 'Authored Practice kept for Honors' };
      case 'error':
      case HONORS_CCMR_STATUS.NEEDS_DECISION:
      case HONORS_CCMR_STATUS.INVALID: return { tone: 'attention', text: 'Audited CCMR needs attention' };
      default: return { tone: 'busy', text: 'Checking audited CCMR' };
    }
  })();

  // Readiness judges the Honors version Create will publish, once there is
  // one: the same report confirmHonorsCandidateForCreate checks again.
  const readinessHonorsReport = honorsCandidateCurrent ? honorsCandidate.honorsReport : honorsReport;
  // Create refuses an assignmentKey another saved assignment already uses, so a
  // new assignment is told so here. Setup edits (update mode) keep their own key.
  const duplicateAssignmentKey = useMemo(() => {
    if (reviewMode === 'update') return '';
    const key = String(effectiveAssignmentV5.assignment?.assignmentKey ?? '').trim();
    return key && findAssignmentKeyConflict({ assignments: existingAssignments, assignmentKey: key }) ? key : '';
  }, [reviewMode, existingAssignments, effectiveAssignmentV5]);
  const readiness = useMemo(() => summarizePreflightReadiness({
    blockers: collectReviewBlockers({ draft, classPeriods, honorsSelected, honorsReport: readinessHonorsReport, honorsCcmr: honorsCcmrState, duplicateAssignmentKey }),
    validationErrors,
    bundleIsValid: preflightModel.isValid,
  }), [draft, classPeriods, honorsSelected, readinessHonorsReport, honorsCcmrState, duplicateAssignmentKey, validationErrors, preflightModel.isValid]);

  // The student preview shows either version, from the same object Create
  // publishes for it: the reviewed assignment, or the final Honors one.
  const showingHonorsPreview = previewVersion === 'honors' && Boolean(honorsCandidate);
  const previewActivities = showingHonorsPreview ? honorsCandidate.model.sections : activities;
  const currentActivity = previewActivities[demoActivityIndex] || null;
  const questions = Array.isArray(currentActivity?.questions) ? currentActivity.questions : [];
  const currentQuestion = questions[demoQuestionIndex] || null;
  const currentPolicy = currentActivity ? getEffectiveActivityPolicy(currentActivity.role) : null;
  const honorsOnlyLabel = (() => {
    if (!showingHonorsPreview || !currentQuestion) return '';
    const here = (entry) => entry && entry.sectionIndex === demoActivityIndex && entry.questionIndex === demoQuestionIndex;
    const sourced = honorsCandidate.sourced.find(here);
    if (sourced) return `Honors only · Audited CCMR · ${ccmrFrameworkLabel(sourced.framework)} · ${sourced.documentId} — in place of the authored Practice question ${sourced.questionNumber}`;
    if (here(honorsCandidate.extensionLocation)) return 'Honors only · Honors extension';
    return '';
  })();

  useEffect(() => {
    if (previewVersion === 'honors' && !honorsCandidate) setPreviewVersion('standard');
  }, [previewVersion, honorsCandidate]);

  useEffect(() => {
    if (demoActivityIndex >= previewActivities.length) setDemoActivityIndex(Math.max(0, previewActivities.length - 1));
  }, [previewActivities.length, demoActivityIndex]);

  useEffect(() => {
    if (demoQuestionIndex >= questions.length) setDemoQuestionIndex(Math.max(0, questions.length - 1));
  }, [questions.length, demoQuestionIndex]);

  if (!assignmentV5) return null;

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const repairIssueForIndex = (questionIndex) => (
    (repairPurpose === 'recovery' ? recoveryRepairIssues : questionRepairIssues)
      .find((entry) => entry.questionIndex === questionIndex) || null
  );

  const beginQuestionRepair = (questionIndex, purpose = 'blocker') => {
    if (!allowQuestionRepair) {
      setRepairMessage('Student records already exist for this assignment. Duplicate the assignment before rewriting question content so historical responses stay attached to what students actually saw.');
      return;
    }
    setRepairPurpose(purpose);
    setRepairTargetIndex(questionIndex);
    setRepairInstruction('');
    setRepairMessage('');
    if (isNarrow) setActiveStep('check');
  };

  const repairInstructionText = () => {
    const issue = repairIssueForIndex(repairTargetIndex);
    const lines = [
      'MathMaster found these blockers for this question:',
      ...(issue?.errors || []).map((message) => `- ${message}`),
    ];
    if (String(repairInstruction || '').trim()) {
      lines.push('', 'Teacher note:', String(repairInstruction).trim());
    }
    return lines.join('\n');
  };

  const copyQuestionRepairRequest = async () => {
    if (!allowQuestionRepair) return;
    const issue = repairIssueForIndex(repairTargetIndex);
    if (!issue?.question) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard copy is unavailable in this browser.');
      }
      const request = buildQuestionRepairRequest({
        assignment: effectiveAssignmentV5,
        question: issue.question,
        instruction: repairInstructionText(),
        questionNumber: issue.questionNumber,
      });
      await navigator.clipboard.writeText(request);
      setRepairMessage('Repair request copied. Paste it into your AI, copy the replacement question, then return here.');
    } catch (error) {
      setRepairMessage(error.message);
    }
  };

  // Shared acceptance path for both repair routes. A replacement is only taken
  // when it clears the blockers on its own question AND introduces no new
  // blocker anywhere else; otherwise the assignment is left exactly as it was.
  const acceptQuestionRepairReplacement = (replacement, issue, sourceLabel) => {
    const candidate = replaceQuestionAtFlatIndex(
      effectiveAssignmentV5,
      repairTargetIndex,
      replacement,
    );
    const candidateModel = buildAssignmentV5PreflightModel(candidate);
    const afterGroups = groupQuestionPreflightIssues(candidateModel.errors, candidateModel.questions);
    const afterTarget = afterGroups.find((entry) => entry.questionIndex === repairTargetIndex);
    if (afterTarget?.errors?.length) {
      throw new Error(`The replacement still has blockers:\n${afterTarget.errors.join('\n')}`);
    }
    const newErrors = newlyIntroducedPreflightErrors(validationErrors, candidateModel.errors);
    if (newErrors.length) {
      throw new Error(`The replacement introduced a new assignment blocker:\n${newErrors.join('\n')}`);
    }
    if (issue?.recovery) {
      // A "Fix for Recovery" replacement is taken only when the planner can
      // now certify a Recovery for that question — never on the AI's word.
      const recovery = candidateModel.questionGeneration?.recovery || {};
      const row = ['warmup', 'dol']
        .flatMap((section) => recovery[section]?.rows || [])
        .find((entry) => entry.storageIndex === repairTargetIndex);
      if (!row || row.status === 'unavailable') {
        const why = row?.issues?.[0]?.message || 'MathMaster still cannot prepare a Recovery for it.';
        throw new Error(`The replacement is valid, but it still has no certified Recovery: ${why} Nothing was changed.`);
      }
    }
    setWorkingAssignmentV5(candidateModel.assignmentV5);
    setRepairTargetIndex(null);
    setRepairInstruction('');
    setRepairMessage(`${sourceLabel} replaced question ${issue.questionNumber}. MathMaster rechecked the assignment.`);
  };

  const repairQuestionWithMathMasterAi = async () => {
    if (!allowQuestionRepair) return;
    const issue = repairIssueForIndex(repairTargetIndex);
    if (!issue?.question) return;
    setRepairBusy(true);
    setRepairMessage('');
    try {
      const request = buildQuestionRepairRequest({
        assignment: effectiveAssignmentV5,
        question: issue.question,
        instruction: repairInstructionText(),
        questionNumber: issue.questionNumber,
      });
      const built = await repairQuestionWithAI(request);
      acceptQuestionRepairReplacement(built.question, issue, 'MathMaster AI');
    } catch (error) {
      if (assignmentAiFallbackRecommended(error)) {
        const diagnostics = assignmentAiDiagnostics(error);
        setRepairMessage(
          `${assignmentAiFailureMessage(error)}${diagnostics ? ` (${diagnostics})` : ''} Nothing was changed. You can still copy the repair request to ChatGPT, Claude, or Gemini and paste the result back here.`,
        );
      } else {
        setRepairMessage(error.message);
      }
    } finally {
      setRepairBusy(false);
    }
  };

  const pasteQuestionRepairReplacement = async () => {
    if (!allowQuestionRepair) return;
    const issue = repairIssueForIndex(repairTargetIndex);
    if (!issue?.question) return;
    setRepairBusy(true);
    setRepairMessage('');
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error('Clipboard paste is unavailable in this browser.');
      }
      const raw = await navigator.clipboard.readText();
      acceptQuestionRepairReplacement(parseQuestionRepairResponse(raw), issue, 'Outside AI');
    } catch (error) {
      setRepairMessage(error.message);
    } finally {
      setRepairBusy(false);
    }
  };

  const acceptHonorsDepthCandidate = (returned, sourceLabel = 'AI') => {
    if (!allowQuestionRepair) {
      throw new Error('Student records already exist for this assignment. Duplicate it before rewriting Honors content so historical evidence stays attached to what students actually saw.');
    }
    const guardedCandidate = applyHonorsDepthAiSections(effectiveAssignmentV5, returned);
    const candidateModel = buildAssignmentV5PreflightModel(guardedCandidate);

    const newErrors = newlyIntroducedPreflightErrors(validationErrors, candidateModel.errors);
    if (newErrors.length) {
      throw new Error(`The Honors repair introduced a new assignment blocker:\n${newErrors.join('\n')}`);
    }

    const candidateReport = inspectHonorsRigor(candidateModel.questions, { allowNarrowCheckpoint: true });
    const requestedGaps = nonCcmrHonorsMissing(honorsReport);
    const unresolvedRequested = unresolvedRequestedHonorsGaps(requestedGaps, candidateReport);
    if (unresolvedRequested.length) {
      throw new Error(`${sourceLabel} did not resolve the Honors gap(s) it was asked to repair: ${honorsMissingLabels(unresolvedRequested).join(', ')}. The original assignment was kept unchanged.`);
    }
    if (!nonCcmrHonorsReady(candidateReport)) {
      const unresolved = nonCcmrHonorsMissing(candidateReport);
      throw new Error(`${sourceLabel} could not safely resolve enough Honors depth: ${honorsMissingLabels(unresolved).join(', ')}. Honors requires Core TEKS, DOK 3+ reasoning, and at least three of the four depth dimensions. The original assignment was kept unchanged.`);
    }

    const separated = separateHonorsDepthAiRepair(effectiveAssignmentV5, candidateModel.assignmentV5);
    const sourceOnlyModel = buildAssignmentV5PreflightModel(separated.assignmentV5);
    const sourceOnlyNewErrors = newlyIntroducedPreflightErrors(validationErrors, sourceOnlyModel.errors);
    if (sourceOnlyNewErrors.length) {
      throw new Error(`The source assignment gained a new blocker while separating the Honors-only extension:\n${sourceOnlyNewErrors.join('\n')}`);
    }

    setWorkingAssignmentV5(sourceOnlyModel.assignmentV5);
    setHonorsEnrichmentQuestion(separated.honorsEnrichmentQuestion);
    setHonorsAiMessage(
      candidateReport.checks.ccmrEnrichment
        ? `${sourceLabel} repaired the Honors depth requirements and the assignment passed Preflight again.`
        : `${sourceLabel} repaired the Honors depth requirements. MathMaster is checking the Honors version again, with its audited CCMR Practice, below.`,
    );
  };

  const buildHonorsDepthWithAi = async () => {
    if (!allowQuestionRepair) {
      setHonorsAiMessage('Student records already exist for this assignment. Duplicate it before using AI to rewrite Honors content so historical evidence stays attached to what students actually saw.');
      return;
    }
    setHonorsAiBusy(true);
    setHonorsAiMessage('');
    try {
      const request = buildHonorsDepthAiRepairRequest({
        assignmentV5: effectiveAssignmentV5,
        honorsReport,
      });
      const built = await buildAssignmentWithAI(request);
      acceptHonorsDepthCandidate(JSON.parse(built.assignmentJson), 'MathMaster AI');
    } catch (error) {
      setHonorsAiMessage(
        assignmentAiFallbackRecommended(error)
          ? `${assignmentAiFailureMessage(error)} Nothing was changed. You can use the no-AI MathMaster extension below, or copy the repair request to ChatGPT/Claude/Gemini and paste the result back here.`
          : error.message,
      );
    } finally {
      setHonorsAiBusy(false);
    }
  };

  const copyHonorsDepthRepairRequest = async () => {
    try {
      const request = buildHonorsDepthAiRepairRequest({
        assignmentV5: effectiveAssignmentV5,
        honorsReport,
      });
      await writeClipboardText(request);
      setHonorsAiMessage('Honors repair request copied. Paste it into ChatGPT, Claude, or Gemini. Ask it to return only the JSON, then use “Paste AI Honors result” here.');
    } catch (error) {
      setHonorsAiMessage(error.message);
    }
  };

  const importHonorsDepthRaw = async (raw, sourceLabel = 'Outside AI') => {
    if (!allowQuestionRepair) {
      setHonorsAiMessage('Student records already exist for this assignment. Duplicate it before importing Honors content.');
      return;
    }
    setHonorsAiBusy(true);
    setHonorsAiMessage('');
    try {
      acceptHonorsDepthCandidate(parseExternalAiJson(raw), sourceLabel);
    } catch (error) {
      setHonorsAiMessage(error.message);
    } finally {
      setHonorsAiBusy(false);
    }
  };

  const pasteHonorsDepthResult = async () => {
    try {
      await importHonorsDepthRaw(await readClipboardText(), 'Outside AI');
    } catch (error) {
      setHonorsAiMessage(error.message);
    }
  };

  const uploadHonorsDepthResult = async (file) => {
    if (!file) return;
    try {
      if (!/\.json$/i.test(file.name || '')) throw new Error('Choose the JSON file returned by the AI.');
      await importHonorsDepthRaw(await file.text(), 'Imported AI file');
    } catch (error) {
      setHonorsAiMessage(error.message);
    } finally {
      if (honorsRepairFileRef.current) honorsRepairFileRef.current.value = '';
    }
  };

  // No-AI Honors depth comes only from a vetted recipe for THIS assignment's
  // concept and course (honorsExtensionRecipes.js). The Honors class's own
  // course setting never chooses the content; when there is no recipe, the
  // teacher is told so and nothing is added.
  const addLocalHonorsDepth = () => {
    if (!allowQuestionRepair) {
      setHonorsAiMessage('Student records already exist for this assignment. Duplicate it before adding an Honors extension.');
      return;
    }
    try {
      const firstHonorsClass = selectedClassChoices.find((entry) => entry.courseLevel === 'honors');
      const built = buildDeterministicHonorsExtension({
        questions: sourceRigorQuestions,
        assignmentCourseId: effectiveAssignmentV5?.assignment?.courseId,
        destinationCourseId: firstHonorsClass?.course || null,
      });
      if (built.status !== 'ready') {
        setHonorsAiMessage(built.teacherMessage);
        return;
      }
      const localQuestion = built.question;
      // The same gate every other repair passes: the extension on its own,
      // then the whole assignment with it in place.
      const certification = certifyHonorsExtensionQuestion(localQuestion);
      if (!certification.ok) {
        throw new Error(`The no-AI Honors extension did not pass MathMaster's checks, so nothing was added:\n${certification.errors.join('\n')}`);
      }
      const candidateModel = buildAssignmentV5PreflightModel(withHonorsExtension(effectiveAssignmentV5, localQuestion));
      const newErrors = newlyIntroducedPreflightErrors(validationErrors, candidateModel.errors);
      if (newErrors.length) {
        throw new Error(`The no-AI Honors extension would add an assignment blocker, so nothing was added:\n${newErrors.join('\n')}`);
      }
      const localReport = inspectHonorsRigor(
        [...sourceRigorQuestions, localQuestion],
        { allowNarrowCheckpoint: true },
      );
      if (!nonCcmrHonorsReady(localReport)) {
        const unresolved = nonCcmrHonorsMissing(localReport);
        throw new Error(`The no-AI extension cannot safely resolve enough Honors depth: ${honorsMissingLabels(unresolved).join(', ')}. Nothing was added; use the outside-AI import option instead.`);
      }
      setHonorsEnrichmentQuestion(localQuestion);
      setHonorsAiMessage([
        `No-AI MathMaster Honors extension added: ${built.recipe.title.charAt(0).toLowerCase()}${built.recipe.title.slice(1)}, on the lesson's own Multiple Representations board (DOK ${localQuestion.dok}, self-graded, a different version for each student). It passed Pre-Flight, and MathMaster is checking the whole Honors version again, with its audited CCMR Practice, below.`,
        ...built.notes,
      ].join(' '));
    } catch (error) {
      setHonorsAiMessage(error.message);
    }
  };

  // The Honors version's controls (renderHonorsVersion). Each one changes
  // what is asked for or decided, and the version is prepared and proven
  // again from it — nothing here edits a question directly.
  const previewHonorsQuestion = (sectionIndex, questionIndex) => {
    setPreviewVersion('honors');
    setPreviewOpen(true);
    setDemoActivityIndex(sectionIndex);
    setDemoQuestionIndex(questionIndex);
    if (isNarrow) setActiveStep('check');
    window.requestAnimationFrame?.(() => {
      document.getElementById('preflight-student-preview')?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
    });
  };
  // "Use a different audited item": the server is asked again without it, and
  // whatever replaces it is validated like the first choice was.
  const setAuditedItemAside = (documentId) => {
    if (!documentId) return;
    setCcmrSetAside((current) => [...new Set([...current, documentId])]);
  };
  const restoreSetAsideAuditedItems = () => setCcmrSetAside([]);
  const prepareHonorsVersionAgain = () => setCcmrPlanRun((run) => run + 1);
  // Offered only once MathMaster has found that no audited item passes; it is
  // recorded on the Honors assignment, so the gap is visible, never silent.
  const keepAuthoredPracticeForHonors = () => {
    if (keepAuthoredToken) setCcmrKeepAuthoredFor(keepAuthoredToken);
  };
  const undoKeepAuthoredPractice = () => setCcmrKeepAuthoredFor(null);

  // The same fallback the saved assignment and the runtime use
  // (resolveReviewedSectionModes, getSectionVariantMode). This used to fall
  // back to 'shared', so a section the teacher never touched SHOWED "Same
  // questions for all students" while students were in fact given different
  // versions — the screen and the classroom disagreed.
  const sectionVariantMode = (role) => (
    draft.sectionVariantModes?.[role]
    || assignmentV5?.variantPolicy?.sectionModes?.[role]
    || assignmentV5?.variantPolicy?.mode
    || 'personalized'
  );
  const setSectionVariantMode = (role, value) => setDraft((current) => ({
    ...current,
    sectionVariantModes: { ...(current.sectionVariantModes || {}), [role]: value },
  }));

  const calculatorSetting = reviewedCalculatorSetting(workingAssignmentV5, draft);
  const setCalculatorSetting = (value) => setDraft((current) => ({
    ...current,
    toolPolicy: { ...(current.toolPolicy || {}), calculator: value },
  }));

  const sectionAccessDefault = (role) => draft.sectionAccessDefaults?.[role] || 'open';
  const setSectionAccessDefault = (role, value) => setDraft((current) => ({
    ...current,
    sectionAccessDefaults: { ...(current.sectionAccessDefaults || {}), [role]: value },
  }));
  const guidedNotesMode = (role) => draft.guidedNotesBySection?.[role] || (role === 'classwork' ? 'automatic' : 'off');
  const setGuidedNotesMode = (role, value) => setDraft((current) => ({
    ...current,
    guidedNotesBySection: { ...(current.guidedNotesBySection || {}), [role]: value },
  }));
  // Whether students may use a Practice Pass on this assignment (LC23). Only the
  // teacher's "no" is stored (practicePassPolicy.js); a quiz, a test or a Test
  // Cycle can never take a pass, so the choice is not offered there.
  const allowPracticePasses = draft.allowPracticePasses !== false;
  const setAllowPracticePasses = (allow) => setDraft((current) => ({ ...current, allowPracticePasses: allow }));
  const showPracticePassSwitch = practicePassSwitchApplies(activityRoles, { testCycle: isTestCycleAssignment(effectiveAssignmentV5) });
  const outputProfileEnabled = (key) => (
    draft.outputProfiles?.[key]?.enabled
    ?? assignmentV5?.outputProfiles?.[key]?.enabled
    ?? true
  );
  const setOutputProfileEnabled = (key, enabled) => setDraft((current) => ({
    ...current,
    outputProfiles: {
      ...(current.outputProfiles || assignmentV5?.outputProfiles || {}),
      [key]: {
        ...(assignmentV5?.outputProfiles?.[key] || {}),
        ...(current.outputProfiles?.[key] || {}),
        enabled,
      },
    },
  }));
  const localToday = (() => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();
  const resolvedWarmupInstructionDate = draft.warmupInstructionDate
    || String(draft.releaseAt || '').slice(0, 10)
    || localToday;
  const resolvedWarmupInstructionDatesByClassPeriod = Object.fromEntries((draft.assignedClassPeriods || []).map((period) => [
    period,
    draft.warmupInstructionDatesByClassPeriod?.[period] || resolvedWarmupInstructionDate,
  ]).filter(([, date]) => Boolean(date)));
  const setWarmupClassDate = (period, value) => setDraft((current) => {
    const next = { ...(current.warmupInstructionDatesByClassPeriod || {}) };
    if (value) next[period] = value;
    else delete next[period];
    return { ...current, warmupInstructionDatesByClassPeriod: next };
  });
  const resolvedDOLInstructionDate = draft.dolInstructionDate
    || String(draft.releaseAt || '').slice(0, 10)
    || localToday;
  const resolvedDOLInstructionDatesByClassPeriod = Object.fromEntries((draft.assignedClassPeriods || []).map((period) => [
    period,
    draft.dolInstructionDatesByClassPeriod?.[period] || resolvedDOLInstructionDate,
  ]).filter(([, date]) => Boolean(date)));
  const dolWorkMinutes = Math.max(1, Number(draft.dolMinutesBeforeEnd) || 10);
  const dolCloseMinutesBeforeEnd = Math.max(0, Number(draft.dolCloseMinutesBeforeEnd ?? 5));
  const dolOpensMinutesBeforeEnd = dolWorkMinutes + dolCloseMinutesBeforeEnd;
  const setDOLClassDate = (period, value) => setDraft((current) => {
    const next = { ...(current.dolInstructionDatesByClassPeriod || {}) };
    if (value) next[period] = value;
    else delete next[period];
    return { ...current, dolInstructionDatesByClassPeriod: next };
  });
  const setSelectedClassIds = (ids) => setDraft((current) => {
    const selected = activeClassChoices.filter((entry) => ids.includes(entry.classId));
    return {
      ...current,
      assignedClassIds: ids,
      assignedClassPeriods: [...new Set(selected.map((entry) => entry.period).filter(Boolean))],
    };
  });
  const toggleClassChoice = (classRecord) => {
    const currentIds = draft.assignedClassIds || [];
    setSelectedClassIds(currentIds.includes(classRecord.classId)
      ? currentIds.filter((item) => item !== classRecord.classId)
      : [...currentIds, classRecord.classId]);
  };

  const canCreate = readiness.canCreate
    && !busy
    && (!testCyclePreview || (serverCyclePreflight?.loading === false && serverCyclePreflight.blocked !== true));
  const isUpdateMode = reviewMode === 'update';
  // The button says which of the two actions it performs. A teacher who has
  // selected no class is saving to the library, and the label should not
  // promise them an assignment their students will receive.
  const action = describePreflightAction(draft);
  const currentIndex = stepIndex(activeStep);
  const isLastStep = currentIndex === PREFLIGHT_STEPS.length - 1;
  // On a wide screen every step is on the page at once, so a per-step blocker
  // list would repeat itself; the full list goes at the bottom instead.
  const stepsToRender = isNarrow ? [activeStep] : PREFLIGHT_STEPS.map((step) => step.id);

  const goToStep = (stepId) => {
    setActiveStep(stepId);
    // On a phone the step swaps, so the scroller returns to the top. On a wide
    // screen every section is already on the page, so the rail is a jump-nav
    // and has to actually jump — otherwise clicking it appears to do nothing.
    if (isNarrow) {
      document.querySelector('[data-preflight-scroll]')?.scrollTo({ top: 0 });
    } else {
      document.getElementById(`preflight-step-${stepId}`)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
    }
  };

  const publishingRepairRequest = (completeAssignment = true) => {
    const instructions = [
      'This request is portable: paste it into ChatGPT, Claude, Gemini, or another capable AI.',
      '',
      'Create the missing Google Classroom publishing metadata and a substantive TWO-PAGE student notes package for this existing MathMaster lesson.',
      completeAssignment
        // The old wording explained the internal endpoint's shape requirement to
        // a teacher pasting into an outside chat window, which meant nothing to
        // them and nothing to the AI reading it.
        ? 'Return one complete schemaVersion 5 Assignment V5 JSON object, carrying every section and question through unchanged.'
        : 'Return one JSON object with ONLY lessonNotesPdf and classroomIntegration. Do not return questions.',
      'Do not rewrite, reorder, add, remove, or reinterpret any assignment question.',
      'The student notes must be useful before/during the lesson, not an answer key for this assignment.',
      'REQUIRED OUTPUT CONTRACT: lessonNotesPdf.enabled=true; targetPages=2; learningGoal required; at least two content-bearing sections.',
      'Set lessonNotesPdf.enabled true and targetPages 2.',
      'Include a clear learningGoal and at least two content-bearing sections. Prefer 3–4 concise sections when the topic needs it.',
      'Include key ideas/vocabulary and at least one general worked example or reference pattern when mathematically appropriate.',
      'Do not copy an assignment question and solve it verbatim.',
      'classroomIntegration must include a useful topic, nonblank assignment instructions, a Notes & Resources post, and grade passback enabled/finalized.',
      'Preserve any teacher-authored Classroom wording already present.',
      '',
      'Never include student names, IDs, grades, attempts, accommodations, or IEP/504/EB information.',
      '',
      'CURRENT CANONICAL ASSIGNMENT:',
      JSON.stringify(effectiveAssignmentV5),
      '',
      buildContractSlice({
        sections: CONTRACT_SLICES.publishingPackage,
        courseId: effectiveAssignmentV5?.assignment?.courseId || null,
      }),
    ];
    return instructions.join('\n');
  };

  const applyPublishingRepairCandidate = (authored, sourceLabel = 'AI') => {
    const rawNotes = authored?.outputProfiles?.lessonNotesPdf
      || authored?.lessonNotesPdf
      || authored?.lessonResources?.notesPdf
      || authored?.notesPdf
      || {};
    const rawClassroom = authored?.classroomIntegration
      || authored?.classroomPackage
      || {};

    const candidatePublishing = normalizeLessonPublishingIntentV5({
      classroom: rawClassroom,
      lessonResources: { notesPdf: rawNotes },
    }, effectiveAssignmentV5.assignment, []);
    const candidateValidation = validateLessonPublishingIntent(candidatePublishing);
    if (candidateValidation.errors.length) {
      throw new Error(`${sourceLabel} returned an incomplete publishing package: ${candidateValidation.errors.join(' ')}`);
    }

    const authoredNotes = candidatePublishing.lessonResources?.notesPdf;
    if (
      !authoredNotes?.enabled
      || Number(authoredNotes.targetPages) !== 2
      || !String(authoredNotes.learningGoal || '').trim()
      || !Array.isArray(authoredNotes.sections)
      || authoredNotes.sections.length < 2
    ) {
      throw new Error(`${sourceLabel} must return enabled two-page student notes with a learning goal and at least two substantive sections.`);
    }

    const currentClassroom = effectiveAssignmentV5.classroomIntegration && typeof effectiveAssignmentV5.classroomIntegration === 'object'
      ? effectiveAssignmentV5.classroomIntegration
      : {};
    const aiClassroom = candidatePublishing.classroomPackage || {};
    const mergeNested = (key) => ({
      ...(aiClassroom[key] && typeof aiClassroom[key] === 'object' ? aiClassroom[key] : {}),
      ...(currentClassroom[key] && typeof currentClassroom[key] === 'object' ? currentClassroom[key] : {}),
    });
    const mergedClassroom = {
      ...aiClassroom,
      ...currentClassroom,
      topic: mergeNested('topic'),
      assignmentPost: mergeNested('assignmentPost'),
      resourcesPost: mergeNested('resourcesPost'),
      gradePassback: mergeNested('gradePassback'),
      additionalLinks: Array.isArray(currentClassroom.additionalLinks)
        ? currentClassroom.additionalLinks
        : (Array.isArray(aiClassroom.additionalLinks) ? aiClassroom.additionalLinks : []),
    };

    // Keep BOTH layers in sync. Preflight intentionally overlays draft review
    // fields on top of workingAssignmentV5. Older Library drafts can still carry
    // lessonNotesPdf.sections=[] and a blank learningGoal; updating only the
    // working assignment made that stale draft immediately overwrite a valid
    // outside-AI import, so the UI continued to show "0 authored sections".
    setWorkingAssignmentV5((current) => ({
      ...current,
      outputProfiles: {
        ...(current.outputProfiles || {}),
        lessonNotesPdf: authoredNotes,
      },
      classroomIntegration: mergedClassroom,
    }));
    setDraft((currentDraft) => ({
      ...currentDraft,
      outputProfiles: {
        ...(currentDraft.outputProfiles || {}),
        lessonNotesPdf: authoredNotes,
      },
      classroomIntegration: mergedClassroom,
    }));

    setPublishingAiMessage(`${sourceLabel} notes and Google Classroom publishing details are ready. The assignment questions were not changed.`);
  };

  const buildMissingPublishingPackageWithAi = async () => {
    if (!notesNeedAuthoring || publishingAiBusy) return;
    setPublishingAiBusy(true);
    setPublishingAiMessage('');
    try {
      const built = await buildAssignmentWithAI(publishingRepairRequest(true));
      applyPublishingRepairCandidate(JSON.parse(built.assignmentJson), 'MathMaster AI');
    } catch (error) {
      setPublishingAiMessage(
        assignmentAiFallbackRecommended(error)
          ? `${assignmentAiFailureMessage(error)} Nothing was changed. Use “Copy notes request” with ChatGPT/Claude/Gemini, then paste or upload the result here.`
          : error.message,
      );
    } finally {
      setPublishingAiBusy(false);
    }
  };

  const copyPublishingRepairRequest = async () => {
    try {
      await writeClipboardText(publishingRepairRequest(false));
      setPublishingAiMessage('Two-page notes request copied. Paste it into ChatGPT, Claude, or Gemini. Copy the JSON result, then use “Paste AI notes result” here.');
    } catch (error) {
      setPublishingAiMessage(error.message);
    }
  };

  const importPublishingRepairRaw = async (raw, sourceLabel = 'Outside AI') => {
    setPublishingAiBusy(true);
    setPublishingAiMessage('');
    try {
      applyPublishingRepairCandidate(parseExternalAiJson(raw), sourceLabel);
    } catch (error) {
      setPublishingAiMessage(error.message);
    } finally {
      setPublishingAiBusy(false);
    }
  };

  const pastePublishingRepairResult = async () => {
    try {
      await importPublishingRepairRaw(await readClipboardText(), 'Outside AI');
    } catch (error) {
      setPublishingAiMessage(error.message);
    }
  };

  const uploadPublishingRepairResult = async (file) => {
    if (!file) return;
    try {
      if (!/\.json$/i.test(file.name || '')) throw new Error('Choose the JSON file returned by the AI.');
      await importPublishingRepairRaw(await file.text(), 'Imported AI file');
    } catch (error) {
      setPublishingAiMessage(error.message);
    } finally {
      if (notesRepairFileRef.current) notesRepairFileRef.current.value = '';
    }
  };

  const renderDetails = () => (
    <section aria-label="Details">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'details')} />}
      <RepresentationAudit questions={previewQuestions} warnings={authoringWarnings} />
      <SectionBalanceRigorAudit assignmentV5={effectiveAssignmentV5} />

      <div style={{ padding: '12px 14px', marginBottom: 16, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', border: '1px solid var(--mm-primary-border)', borderRadius: 9, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5 }}>
        <strong>AI-prepared Classroom and notes package.</strong> MathMaster carries the AI-written topic, post text, grade-passback settings, and two-page student-notes plan into the saved lesson. The teacher still chooses classes and dates here before anything is published.
        {(publishingIntent.classroomPackage || publishingIntent.lessonResources?.notesPdf) && (
          <div style={{ marginTop: 9, padding: '9px 10px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)', color: 'var(--mm-text)' }}>
            <div><strong>Classroom topic:</strong> {publishingIntent.classroomPackage?.topic?.name || 'MathMaster will infer this from the folder.'}</div>
            <div><strong>Assignment post:</strong> {publishingIntent.classroomPackage?.assignmentPost?.title || draft.title || 'Prepared from the lesson title'}</div>
            {publishingIntent.lessonResources?.notesPdf?.enabled && <div><strong>Student notes PDF:</strong> {publishingIntent.lessonResources.notesPdf.title || 'Student Notes'} · {Number(publishingIntent.lessonResources.notesPdf.targetPages) === 1 ? 1 : 2} page target · {(publishingIntent.lessonResources.notesPdf.sections || []).length} authored section{(publishingIntent.lessonResources.notesPdf.sections || []).length === 1 ? '' : 's'}</div>}
            {publishingIntent.classroomPackage?.resourcesPost?.enabled !== false && <div><strong>Resources post:</strong> {publishingIntent.classroomPackage?.resourcesPost?.postingMode === 'attachToAssignment' ? 'attach resources to the graded assignment' : 'separate Notes & Resources material post'}</div>}
          </div>
        )}
        {notesNeedAuthoring && (
          <div style={{ marginTop: 10, padding: '10px 11px', borderRadius: 8, background: 'var(--mm-warning-soft)', border: '1px solid var(--mm-warning-border-soft)', color: 'var(--mm-warning-text)' }}>
            <strong>Student notes are required, but this saved lesson has no authored note content.</strong>
            <div style={{ marginTop: 5, lineHeight: 1.5 }}>
              MathMaster will not post a blank handout. Finish the two-page notes package here. All repair paths below are publishing-only: assignment questions are protected from the notes import.
            </div>
            <div style={{ marginTop: 9, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={publishingAiBusy}
                onClick={buildMissingPublishingPackageWithAi}
                style={{ minHeight: 42, padding: '8px 13px', border: '1px solid #b78103', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-warning-text)', fontWeight: 900, cursor: publishingAiBusy ? 'wait' : 'pointer' }}
              >
                {publishingAiBusy ? 'Building notes…' : 'Build notes with MathMaster AI'}
              </button>
              <button type="button" disabled={publishingAiBusy} onClick={copyPublishingRepairRequest} style={{ minHeight: 42, padding: '8px 13px', border: '1px solid #b78103', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-warning-text)', fontWeight: 900 }}>
                Copy notes request
              </button>
              <button type="button" disabled={publishingAiBusy} onClick={pastePublishingRepairResult} style={{ minHeight: 42, padding: '8px 13px', border: '1px solid #b78103', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-warning-text)', fontWeight: 900 }}>
                Paste AI notes result
              </button>
              <button type="button" disabled={publishingAiBusy} onClick={() => notesRepairFileRef.current?.click()} style={{ minHeight: 42, padding: '8px 13px', border: '1px solid #b78103', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-warning-text)', fontWeight: 900 }}>
                Upload notes JSON
              </button>
              <input
                ref={notesRepairFileRef}
                type="file"
                accept=".json,application/json"
                onChange={(event) => uploadPublishingRepairResult(event.target.files?.[0])}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        )}
        {publishingAiMessage && (
          <div role="status" style={{ marginTop: 9, padding: '9px 10px', borderRadius: 8, background: notesNeedAuthoring ? 'var(--mm-warning-soft)' : 'var(--mm-success-bg)', color: notesNeedAuthoring ? 'var(--mm-warning-text)' : 'var(--mm-success-text)', fontSize: 'calc(12.5 * var(--mm-px))' }}>
            {publishingAiMessage}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
        <label style={labelStyle}>Assignment title<input value={draft.title} onChange={(event) => setField('title', event.target.value)} style={inputStyle} /></label>
        <label style={labelStyle}>Library folder<input value={draft.folder || ''} onChange={(event) => setField('folder', event.target.value)} placeholder="Algebra I/Module 1/Topic 1" style={inputStyle} /></label>
        <label style={labelStyle}>Regular due date<input type="datetime-local" value={draft.dueAt || ''} onChange={(event) => setField('dueAt', event.target.value)} style={inputStyle} /></label>
        <label style={labelStyle}>Final late due date<input type="datetime-local" value={draft.lateDueAt || ''} onChange={(event) => setField('lateDueAt', event.target.value)} style={inputStyle} /></label>
        <label style={labelStyle}>Automatic release (optional)<input type="datetime-local" value={draft.releaseAt || ''} onChange={(event) => setField('releaseAt', event.target.value)} style={inputStyle} /></label>
      </div>
    </section>
  );

  /*
   * THE HONORS VERSION, AS THE TEACHER SEES IT.
   *
   * What Honors classes will get and why: the audited items that replace
   * Practice (each one previewable and replaceable), the audited items that
   * were checked and not used — with the actual question and the checks it
   * failed — and, when no audited item passes, the choice of what to do,
   * made here instead of discovered at Create.
   */
  const renderHonorsVersion = () => {
    const state = honorsCcmrState?.status || 'preparing';
    const candidate = honorsCandidateCurrent ? honorsCandidate : null;
    const sourced = candidate?.sourced || [];
    const skipped = (candidate?.skipped || []).filter((entry) => !entry.depthOnly);
    const keptClaims = candidate?.keptAuthoredClaims || [];
    const box = (tone) => ({ marginTop: 11, padding: '11px 13px', borderRadius: 9, fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.55, overflowWrap: 'anywhere', ...HONORS_TONES[tone] });
    const buttonRow = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 };
    const button = { minHeight: 44, padding: '8px 13px', border: '1px solid var(--mm-accent-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900, cursor: 'pointer' };
    const listStyle = { margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 9 };
    const muted = { color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' };
    const code = { overflowWrap: 'anywhere', fontSize: 'calc(11.5 * var(--mm-px))' };
    return (
      <section aria-label="Honors version" data-honors-version-state={state} style={{ marginTop: 4 }}>
        {state === 'preparing' && (
          <div role="status" style={box('busy')}>
            <strong>Preparing the Honors version…</strong> MathMaster is choosing audited CCMR Practice on this lesson’s TEKS and checking each item with the same checks as the rest of this review. Create waits until it is done.
          </div>
        )}
        {state === 'error' && (
          <div role="alert" style={box('attention')}>
            <strong>MathMaster could not prepare the Honors version.</strong> {honorsCcmrState.error} Nothing was changed, and your review is kept.
            <div style={buttonRow}>
              <button type="button" onClick={prepareHonorsVersionAgain} style={button}>Try again</button>
            </div>
          </div>
        )}
        {state === HONORS_CCMR_STATUS.NOT_REQUIRED && (
          <div role="status" style={box('done')}>
            <strong>✓ Honors version checked.</strong> {honorsReport.isNarrowCheckpoint ? 'This short checkpoint does' : 'This Practice section is short, so it does'} not need audited CCMR Practice. Honors classes get the questions in the preview{candidate?.extensionLocation ? ', including the Honors extension' : ''}.
          </div>
        )}
        {state === HONORS_CCMR_STATUS.READY && (
          <div role="status" style={box('done')}>
            <strong>✓ Honors version checked.</strong>{' '}
            {sourced.length
              ? `For Honors classes only, ${sourced.length === 1 ? 'one Practice question is' : `${sourced.length} Practice questions are`} replaced by audited CCMR Fidelity V2.1 ${sourced.length === 1 ? 'item' : 'items'} on the same TEKS. Every question passed MathMaster’s checks in place. Standard classes keep the Practice you wrote.`
              : 'It already contains audited CCMR Practice that passes MathMaster’s checks.'}
            {sourced.length > 0 && (
              <ul style={listStyle}>
                {sourced.map((entry) => (
                  <li key={`${entry.sectionIndex}-${entry.questionIndex}-${entry.documentId}`} data-honors-ccmr-item={entry.documentId}>
                    <strong>Question {entry.questionNumber}</strong> · {ccmrFrameworkLabel(entry.framework)}{entry.teksCodes?.length ? ` · TEKS ${entry.teksCodes.join(', ')}` : ''}
                    <MathText as="div" style={{ color: 'var(--mm-text)' }}>{auditedExamplePrompt(candidate.assignmentV5.sections[entry.sectionIndex]?.questions?.[entry.questionIndex], entry.prompt)}</MathText>
                    <div style={muted}>In place of: {entry.replacedPrompt ? <MathText>{entry.replacedPrompt}</MathText> : 'the authored Practice question'} · <code style={code}>{entry.documentId}</code></div>
                    <div style={buttonRow}>
                      <button type="button" onClick={() => previewHonorsQuestion(entry.sectionIndex, entry.questionIndex)} style={button}>Preview as a student</button>
                      <button type="button" onClick={() => setAuditedItemAside(entry.documentId)} style={button}>Use a different audited item</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {(state === HONORS_CCMR_STATUS.NEEDS_DECISION || state === HONORS_CCMR_STATUS.KEPT_AUTHORED) && candidate && (
          <div role={state === HONORS_CCMR_STATUS.NEEDS_DECISION ? 'alert' : 'status'} style={box(state === HONORS_CCMR_STATUS.NEEDS_DECISION ? 'attention' : 'note')}>
            <strong>
              {state === HONORS_CCMR_STATUS.NEEDS_DECISION
                ? 'No audited CCMR Practice item passed MathMaster’s checks for this Honors version.'
                : 'Honors classes will get the Practice you wrote for this lesson.'}
            </strong>
            {candidate.explanation && <p style={{ margin: '6px 0 0' }}>{candidate.explanation}</p>}
            <p style={{ margin: '6px 0 0' }}>
              {state === HONORS_CCMR_STATUS.NEEDS_DECISION
                ? 'Nothing has been created and your review is kept. Check the bank again, or publish the Honors version with the Practice you wrote. That choice is recorded on the Honors assignment, so the missing CCMR item is visible, never silent; every other Honors requirement still applies.'
                : 'Recorded on the Honors assignment: no audited CCMR item passed MathMaster’s checks, and the authored Practice was kept by your choice. Every other Honors requirement still applies.'}
            </p>
            <div style={buttonRow}>
              {state === HONORS_CCMR_STATUS.NEEDS_DECISION
                ? <button type="button" onClick={keepAuthoredPracticeForHonors} style={button}>Keep the authored Practice for Honors</button>
                : <button type="button" onClick={undoKeepAuthoredPractice} style={button}>Undo</button>}
              <button type="button" onClick={prepareHonorsVersionAgain} style={button}>Check the audited bank again</button>
              {ccmrSetAside.length > 0 && (
                <button type="button" onClick={restoreSetAsideAuditedItems} style={button}>Offer the {ccmrSetAside.length === 1 ? 'set-aside item' : `${ccmrSetAside.length} set-aside items`} again</button>
              )}
            </div>
          </div>
        )}
        {state === HONORS_CCMR_STATUS.INVALID && (
          <div role="alert" style={box('attention')}>
            <strong>The Honors version does not pass MathMaster’s checks, so it cannot be created yet.</strong>
            <ul style={listStyle}>{(honorsCcmrState?.errors || []).slice(0, 8).map((message) => <li key={message}>{message}</li>)}</ul>
            <div style={buttonRow}>
              <button type="button" onClick={prepareHonorsVersionAgain} style={button}>Prepare it again</button>
            </div>
          </div>
        )}
        {state === HONORS_CCMR_STATUS.READY && ccmrSetAside.length > 0 && (
          <div style={{ ...muted, marginTop: 8 }}>
            {ccmrSetAside.length === 1 ? 'One audited item is' : `${ccmrSetAside.length} audited items are`} set aside at your request.{' '}
            <button type="button" onClick={restoreSetAsideAuditedItems} style={{ ...button, padding: '4px 12px' }}>Offer again</button>
          </div>
        )}
        {keptClaims.length > 0 && (
          <div style={box('note')}>
            {keptClaims.map((entry) => (
              <div key={`${entry.sectionIndex}-${entry.questionIndex}`}>
                Question {entry.questionNumber} is written like exam practice, but no audited item on its TEKS passed MathMaster’s checks, so your question stays as written.
              </div>
            ))}
          </div>
        )}
        {skipped.length > 0 && (
          <details data-honors-ccmr-skipped="true" style={{ marginTop: 10, padding: '0 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))' }}>
              {skipped.length === 1 ? 'One audited item was checked and not used' : `${skipped.length} audited items were checked and not used`}
            </summary>
            <p style={{ ...muted, margin: '0 0 8px', lineHeight: 1.5 }}>
              Each one failed MathMaster’s assignment checks where it would have gone, so it never reaches students. {state === HONORS_CCMR_STATUS.READY ? 'MathMaster used the next audited item instead.' : 'The authored question stays in its place.'}
            </p>
            <ul style={{ ...listStyle, marginBottom: 12 }}>
              {skipped.map((entry) => (
                <li key={`${entry.documentId}-${entry.questionNumber}`} data-honors-ccmr-skipped-item={entry.documentId}>
                  <strong>Question {entry.questionNumber}</strong> · {ccmrFrameworkLabel(entry.framework)} · <code style={code}>{entry.documentId}</code>
                  {entry.prompt && <MathText as="div" style={{ color: 'var(--mm-text)' }}>{auditedExamplePrompt(entry.question, entry.prompt)}</MathText>}
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--mm-error-text)', fontSize: 'calc(12 * var(--mm-px))' }}>
                    {entry.errors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  };

  const renderClasses = () => (
    <section aria-label="Classes">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'classes')} />}

      <fieldset style={{ ...fieldsetStyle, marginTop: 0 }}>
        <legend style={legendStyle}>Assign to MathMaster classes</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 11 }}>
          <button type="button" onClick={() => setSelectedClassIds(activeClassChoices.map((entry) => entry.classId))} disabled={!activeClassChoices.length} style={{ minHeight: 44, padding: '7px 13px' }}>Select all</button>
          <button type="button" onClick={() => setSelectedClassIds([])} style={{ minHeight: 44, padding: '7px 13px' }}>Clear</button>
          <span style={{ alignSelf: 'center', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{(draft.assignedClassIds || []).length} selected</span>
        </div>
        {!activeClassChoices.length && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', fontSize: 'calc(12 * var(--mm-px))' }}>
            No active MathMaster classes are available. Save this assignment to the Library, then create or restore a class before assigning it.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {activeClassChoices.map((classRecord) => {
            const selected = (draft.assignedClassIds || []).includes(classRecord.classId);
            return (
              <label key={classRecord.classId || classRecord.period} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 14px', background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)', borderRadius: 999, fontWeight: 800, cursor: 'pointer' }}>
                <input type="checkbox" style={checkboxStyle} checked={selected} onChange={() => toggleClassChoice(classRecord)} />
                {classRecord.name || classRecord.period}{classRecord.name && classRecord.name !== classRecord.period ? ` · ${classRecord.period}` : ''}
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 9, color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>Assignments are targeted by MathMaster class ID. Period is derived from the selected class only for bell-schedule timing.</div>
      </fieldset>

      <fieldset style={{ ...fieldsetStyle, border: `1px solid ${honorsSelected ? 'var(--mm-accent-border)' : 'var(--mm-border)'}`, background: honorsSelected ? 'var(--mm-accent-subtle)' : 'var(--mm-surface)' }}>
        <legend style={legendStyle}>Course rigor destinations</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--mm-surface-control)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900 }}>STANDARD: {rigorDestinations.standard.join(', ') || 'none'}</span>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900 }}>HONORS: {rigorDestinations.honors.join(', ') || 'none'}</span>
        </div>
        <p style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>{honorsSelected ? 'Honors periods are validated from the saved class designation. When Standard and Honors destinations are selected together, MathMaster creates destination variants from this one source assignment.' : 'No selected class is designated Honors. Standard validation applies.'}</p>
        {honorsSelected && honorsReport.isNarrowCheckpoint && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}><strong>Narrow Honors checkpoint.</strong> Warm-Ups and DOLs with three or fewer items may stay focused on the current TEKS. Depth, prerequisite repair, and CCMR are balanced across the recent Honors sequence instead of forced into every short check.</div>}
        {honorsSelected && !honorsReport.isNarrowCheckpoint && <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 7 }}>{[
          ['coreTeks', 'Core TEKS'], ['higherOrderReasoning', 'Higher-order reasoning'], ['multipleRepresentations', 'Multiple representations'], ['justification', 'Explanation / justification'], ['modelingApplication', 'Modeling / application'], ['ccmrEnrichment', 'Authentic CCMR Practice'],
        ].map(([key, label]) => {
          // CCMR is judged on the Honors version, which is where it lives.
          const chip = key === 'ccmrEnrichment'
            ? honorsCcmrChip
            : { tone: honorsReport.checks[key] ? 'done' : 'attention', text: label };
          return (
            <div key={key} data-honors-check={key} data-honors-check-tone={chip.tone} style={{ padding: '8px 10px', borderRadius: 8, fontWeight: 800, fontSize: 'calc(12 * var(--mm-px))', ...HONORS_TONES[chip.tone] }}>
              {HONORS_TONE_MARKS[chip.tone]} {chip.text}
            </div>
          );
        })}</div>}
        {honorsVersionNeeded && renderHonorsVersion()}
        {honorsSelected && !honorsReport.isNarrowCheckpoint && !honorsReport.isHonorsReady && honorsReport.missing.some((key) => key !== 'ccmrEnrichment') && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {honorsReport.checks.coreTeks && (
              <div style={{ padding: '10px 11px', borderRadius: 9, background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)' }}>
                <strong style={{ color: 'var(--mm-primary-text)' }}>Fastest option — no AI required</strong>
                <div style={{ marginTop: 4, color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
                  {localHonorsRecipe.status === 'ready'
                    ? describeHonorsRecipeForTeacher(localHonorsRecipe)
                    : localHonorsRecipe.teacherMessage}
                </div>
                <button
                  type="button"
                  disabled={!allowQuestionRepair || honorsAiBusy || localHonorsRecipe.status !== 'ready'}
                  onClick={addLocalHonorsDepth}
                  style={{ marginTop: 8, minHeight: 44, padding: '8px 13px', border: '1px solid #6f2da8', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900, cursor: !allowQuestionRepair || honorsAiBusy || localHonorsRecipe.status !== 'ready' ? 'not-allowed' : 'pointer' }}
                >
                  Add built-in Honors extension (no AI)
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={buildHonorsDepthWithAi}
                disabled={honorsAiBusy || !allowQuestionRepair}
                title={!allowQuestionRepair ? 'Duplicate the assignment before rewriting Honors content because student records already exist.' : 'Use MathMaster’s embedded AI to repair the missing Honors depth requirements, then rerun Preflight.'}
                style={{ minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: honorsAiBusy || !allowQuestionRepair ? '#c9b5df' : '#6f2da8', color: '#fff', fontWeight: 900, cursor: honorsAiBusy || !allowQuestionRepair ? 'not-allowed' : 'pointer' }}
              >
                {honorsAiBusy ? '✨ Repairing Honors depth…' : '✨ Build Honors Depth with MathMaster AI'}
              </button>
              <button type="button" onClick={copyHonorsDepthRepairRequest} disabled={honorsAiBusy || !allowQuestionRepair} style={{ minHeight: 44, padding: '9px 13px', border: '1px solid var(--mm-accent-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>
                Copy outside-AI repair request
              </button>
              <button type="button" onClick={pasteHonorsDepthResult} disabled={honorsAiBusy || !allowQuestionRepair} style={{ minHeight: 44, padding: '9px 13px', border: '1px solid var(--mm-accent-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>
                Paste AI Honors result
              </button>
              <button type="button" onClick={() => honorsRepairFileRef.current?.click()} disabled={honorsAiBusy || !allowQuestionRepair} style={{ minHeight: 44, padding: '9px 13px', border: '1px solid var(--mm-accent-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>
                Upload Honors JSON
              </button>
              <input
                ref={honorsRepairFileRef}
                type="file"
                accept=".json,application/json"
                onChange={(event) => uploadHonorsDepthResult(event.target.files?.[0])}
                style={{ display: 'none' }}
              />
            </div>
            <div style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(11.5 * var(--mm-px))', lineHeight: 1.45 }}>
              Outside-AI imports go through the same MathMaster safety gate as the embedded AI. Existing questions cannot be silently rewritten, removed, or reordered just to make the Honors check turn green.
            </div>
          </div>
        )}
        {honorsAiMessage && (
          <div role="status" style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--mm-accent-soft)', border: '1px solid var(--mm-accent-border)', color: 'var(--mm-accent-text)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            {honorsAiMessage}
          </div>
        )}
        {honorsEnrichmentQuestion && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', fontSize: 'calc(12 * var(--mm-px))' }}><strong>MathMaster depth extension prepared.</strong> It adds self-graded Honors depth for the Honors destination, but it does not substitute for an authentic CCMR-style Practice item.</div>}
        {honorsSelected && honorsReport.isHonorsReady && !honorsReport.isNarrowCheckpoint && !honorsEnrichmentQuestion && <div style={{ marginTop: 10, color: 'var(--mm-success-text)', fontWeight: 800, fontSize: 'calc(12 * var(--mm-px))' }}>✓ Source assignment already satisfies the Honors contract; MathMaster will not rewrite it.</div>}
      </fieldset>
    </section>
  );

  const renderDelivery = () => (
    <section aria-label="Delivery">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'delivery')} />}

      <div style={{ padding: '13px 15px', marginBottom: 14, border: '1px solid var(--mm-tint-border)', borderRadius: 10, background: 'var(--mm-surface-tint)' }}>
        <strong style={{ color: 'var(--mm-primary-text)' }}>Activity sections control student behavior</strong>
        <p style={{ margin: '6px 0 8px', color: 'var(--mm-text)', lineHeight: 1.5 }}>
          Warm-Up, Classwork, Practice, DOL, Quiz, and Test behavior comes from the sections already built into the assignment. You no longer need to choose a second Classwork/Practice designation here.
        </p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {activityRoles.map((role) => <span key={role} style={{ padding: '5px 9px', borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900 }}>{humanRole(role)}</span>)}
        </div>
      </div>

      {activityRoles.includes('classwork') && (
        <div
          role={classworkPacing.isWithinBudget ? 'status' : 'alert'}
          style={{
            padding: '12px 15px',
            marginBottom: 14,
            border: `1px solid ${classworkPacing.isWithinBudget ? 'var(--mm-success-border)' : 'var(--mm-error-border-soft)'}`,
            borderRadius: 10,
            background: classworkPacing.isWithinBudget ? 'var(--mm-success-subtle)' : 'var(--mm-error-bg)',
            color: classworkPacing.isWithinBudget ? 'var(--mm-success-text)' : 'var(--mm-error-text)',
          }}
        >
          <strong>Classwork planned time: {formatPlannedTime(classworkPacing.totalSeconds)} / 20:00</strong>
          <div style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.45 }}>
            {classworkPacing.hasAuthoredTiming
              ? (classworkPacing.isWithinBudget
                ? `${formatPlannedTime(classworkPacing.remainingSeconds)} remains in the authored 20-minute Classwork budget. Live teacher extensions can go beyond this without changing the authored plan.`
                : 'Reduce the authored Classwork question times before publishing. Live extensions are separate and remain available during instruction.')
              : 'No Classwork question times are authored yet. This assignment is valid, but Walkthrough will have no planned pacing to preload.'}
          </div>
        </div>
      )}

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Question versions by section</legend>
        <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
          Choose independently for each assignment section. <strong>Same questions</strong> gives everyone the
          identical version. <strong>Different versions</strong> keeps the task, the depth and the complexity
          identical and changes only the numbers. <strong>Pitched to the student</strong> keeps the standard you
          assigned and lets MathMaster move complexity and depth by one step, using what each student has
          actually shown.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          {activityRoles.map((role) => {
            // Assessment sections are offered the first two options only.
            // Levelling a DOL or a quiz per student makes its grades
            // incomparable, and a dropdown that quietly allows it is how that
            // happens by accident rather than by decision.
            const isAssessment = ['dol', 'quiz', 'test', 'assessment', 'formative'].includes(String(role).toLowerCase());
            return (
              <label key={role} style={labelStyle}>
                {humanRole(role)}
                <select value={sectionVariantMode(role)} onChange={(event) => setSectionVariantMode(role, event.target.value)} style={inputStyle}>
                  <option value="shared">Same questions for all students</option>
                  <option value="personalized">Different versions, same difficulty</option>
                  {!isAssessment && <option value="adaptive">Pitched to the student</option>}
                </select>
                {isAssessment && (
                  <span style={{ display: 'block', marginTop: 4, color: 'var(--mm-text-muted)', fontSize: 'calc(11 * var(--mm-px))', lineHeight: 1.45 }}>
                    Assessment sections keep one rigor for everyone, so the results stay comparable.
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {/*
          THE ANSWER TO "WHAT DID I JUST CHOOSE?", BEFORE PUBLISHING.
          Run through the real adaptation engine, so a teacher who sets a section
          to "pitched to the student" and sees nothing change learns that HERE,
          rather than from a class of identical worksheets on Monday.
        */}
        <div style={{ marginTop: 16 }}>
          <AdaptivePreview
            assignment={effectiveAssignmentV5}
            questions={previewQuestions}
            courseId={draft?.courseId || 'algebra1'}
            honors={String(draft?.courseLevel || '').toLowerCase() === 'honors'}
          />
        </div>
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Printable and shareable outputs</legend>
        <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
          PDFs are optional and can be enabled or disabled at any time. Enabling one immediately adds its
          representation and page-fit safety checks; leaving PDFs off never blocks the digital Library copy.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
          {[
            ['studentWorksheetPdf', 'Student worksheet PDF', 'Printable assignment without answers.'],
            ['teacherWorksheetPdf', 'Teacher copy PDF', 'Answers and available worked solutions.'],
            ['answerKeyPdf', 'Compact answer key PDF', 'Answer-focused print copy.'],
            ['lessonNotesPdf', 'Lesson notes PDF', 'Separate notes/resource handout.'],
          ].map(([key, label, description]) => (
            <label key={key} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 58,
              padding: 10, border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)',
            }}>
              <input
                type="checkbox"
                style={{ ...checkboxStyle, marginTop: 2 }}
                checked={outputProfileEnabled(key)}
                onChange={(event) => setOutputProfileEnabled(key, event.target.checked)}
              />
              <span>
                <strong style={{ display: 'block', color: 'var(--mm-text-strong)' }}>{label}</strong>
                <span style={{ display: 'block', marginTop: 2, color: 'var(--mm-text-muted)', fontSize: 'calc(11.5 * var(--mm-px))', lineHeight: 1.4 }}>{description}</span>
              </span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8, background: 'var(--mm-surface-tint)', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
          Student IEP/504/EB access supports remain automatic and server-resolved. Changing an output does not change the assessed standard.
        </div>
      </fieldset>

      {activityRoles.some((role) => ['classwork', 'practice'].includes(role)) && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Guided Notes by section</legend>
          <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
            Guided Notes should teach the mathematics, not narrate the interface. Automatic uses authored notes when present and otherwise builds tool/workflow-aware guidance. Authored only hides the panel unless the assignment includes meaningful notes. Off removes the panel entirely.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
            {activityRoles.filter((role) => ['classwork', 'practice'].includes(role)).map((role) => (
              <label key={role} style={labelStyle}>
                {humanRole(role)} Guided Notes
                <select value={guidedNotesMode(role)} onChange={(event) => setGuidedNotesMode(role, event.target.value)} style={inputStyle}>
                  <option value="automatic">Automatic — authored or MathMaster-derived</option>
                  <option value="authoredOnly">Only when meaningful notes are authored</option>
                  <option value="off">Off</option>
                </select>
              </label>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
            Recommended default: Classwork = Automatic; Practice = Off. Generic filler such as “Read the question” is suppressed even in Automatic mode.
          </p>
        </fieldset>
      )}

      {activityRoles.some((role) => ['classwork', 'practice'].includes(role)) && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Teacher section access controls</legend>
          <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
            Classwork and Practice can open automatically, or start locked until you release that section from the Live Class Hub. Either way, you can later open, close, or reopen the section for one class period without affecting your other classes.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
            {activityRoles.filter((role) => ['classwork', 'practice'].includes(role)).map((role) => (
              <label key={role} style={labelStyle}>
                {humanRole(role)} initial access
                <select value={sectionAccessDefault(role)} onChange={(event) => setSectionAccessDefault(role, event.target.value)} style={inputStyle}>
                  <option value="open">Open automatically with assignment</option>
                  <option value="closed">Start locked until teacher opens it</option>
                </select>
              </label>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
            These controls affect new graded responses only. After the final cutoff, the assignment enters ungraded Practice Mode and all sections become available for review/practice.
          </p>
        </fieldset>
      )}

      {showPracticePassSwitch && (
        <fieldset style={fieldsetStyle} data-preflight-practice-passes>
          <legend style={legendStyle}>Practice Passes</legend>
          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 58,
            padding: 10, border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)',
          }}>
            <input
              type="checkbox"
              style={{ ...checkboxStyle, marginTop: 2 }}
              checked={allowPracticePasses}
              onChange={(event) => setAllowPracticePasses(event.target.checked)}
            />
            <span>
              <strong style={{ display: 'block', color: 'var(--mm-text-strong)' }}>Students can use a Practice Pass on this assignment</strong>
              <span style={{ display: 'block', marginTop: 2, color: 'var(--mm-text-muted)', fontSize: 'calc(11.5 * var(--mm-px))', lineHeight: 1.4 }}>{REWARD_DEFINITIONS.practicePass.teacherDescription}</span>
            </span>
          </label>
          <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
            {REWARD_DEFINITIONS.practicePass.gradeEffect} A pass is never available on a quiz, a test or a Test Cycle, or once a student has started Practice, whatever this says. Turning this off does not undo a pass a student has already used; undo that from the student&apos;s rewards.
          </p>
        </fieldset>
      )}

      <fieldset style={fieldsetStyle} data-preflight-calculator>
        <legend style={legendStyle}>Calculator</legend>
        <label style={labelStyle}>
          Calculator for this lesson
          <select value={calculatorSetting} onChange={(event) => setCalculatorSetting(event.target.value)} style={inputStyle}>
            {ASSIGNMENT_CALCULATOR_SETTINGS.map((setting) => <option key={setting.value} value={setting.value}>{setting.label}</option>)}
          </select>
        </label>
        <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>
          Used for questions that set no calculator of their own; a question&apos;s own setting is kept. On an exit ticket, quiz or test it can only make a question&apos;s calculator stricter, never add one, and a skill assessed without a calculator stays without one. A student&apos;s calculator accommodation still applies.
        </p>
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Warm-Up timing</legend>
        {hasAuthoredWarmup ? (
          <>
            <label style={{ ...labelStyle, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={checkboxStyle} checked={draft.warmupEnabled !== false} onChange={(event) => setField('warmupEnabled', event.target.checked)} /> Use the class-period Warm-Up window for the authored Warm-Up section</label>
            {draft.warmupEnabled !== false && (
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12, marginTop: 10 }}>
                <label style={labelStyle}>Warm-Up instructional date<input type="date" value={resolvedWarmupInstructionDate} onChange={(event) => setField('warmupInstructionDate', event.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>Open before class (minutes)<input type="number" min="0" max="30" value={draft.warmupMinutesBeforeStart ?? 7} onChange={(event) => setField('warmupMinutesBeforeStart', event.target.value)} style={inputStyle} /></label>
              </div>
            )}
            {draft.warmupEnabled !== false && <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>The Warm-Up opens {draft.warmupMinutesBeforeStart ?? 7} minutes before that class begins, only on its instructional date. You can close it early from the Live Class Hub; students keep their saved work but the section becomes read-only.</p>}
            {draft.warmupEnabled !== false && draft.assignedClassPeriods.length > 0 && (
              <details style={{ marginTop: 12, padding: '10px 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Different Warm-Up date for a specific class (optional)</summary>
                <p style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>Useful for A-Day/B-Day sections that receive this same bundled lesson on different dates. Leaving a class unchanged uses the default Warm-Up date above.</p>
                <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                  {draft.assignedClassPeriods.map((period) => (
                    <label key={period} style={labelStyle}>{period}<input type="date" value={draft.warmupInstructionDatesByClassPeriod?.[period] || resolvedWarmupInstructionDate} onChange={(event) => setWarmupClassDate(period, event.target.value)} style={inputStyle} /></label>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>This assignment has no Warm-Up section, so no class-start Warm-Up window will be created.</p>
        )}
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>DOL timing</legend>
        {hasAuthoredDOL ? (
          <>
            <label style={{ ...labelStyle, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={checkboxStyle} checked={draft.dolEnabled === true} onChange={(event) => setField('dolEnabled', event.target.checked)} /> Use the class-period DOL window for the authored DOL section</label>
            {draft.dolEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12, marginTop: 10 }}>
                <label style={labelStyle}>DOL instructional date<input type="date" value={resolvedDOLInstructionDate} onChange={(event) => setField('dolInstructionDate', event.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>DOL working time (minutes)<input type="number" min="1" max="20" value={draft.dolMinutesBeforeEnd || 10} onChange={(event) => setField('dolMinutesBeforeEnd', event.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>Close before the bell (minutes)<input type="number" min="0" max="15" value={draft.dolCloseMinutesBeforeEnd ?? 5} onChange={(event) => setField('dolCloseMinutesBeforeEnd', event.target.value)} style={inputStyle} /></label>
              </div>
            )}
            {draft.dolEnabled && <p style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>The DOL opens {dolOpensMinutesBeforeEnd} minutes before the bell, gives students {dolWorkMinutes} minutes to work, and closes {dolCloseMinutesBeforeEnd} minutes before class ends so technology can be returned. If you unlock it early from the live class controls, the same {dolWorkMinutes}-minute timer starts then but still cannot run into the final {dolCloseMinutesBeforeEnd}-minute pack-up window.</p>}
            {draft.dolEnabled && draft.assignedClassPeriods.length > 0 && (
              <details style={{ marginTop: 12, padding: '10px 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Different DOL date for a specific class (optional)</summary>
                <p style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>Use this when A-Day and B-Day sections receive the same bundled lesson on different calendar dates. Leaving a class unchanged uses the default DOL date above.</p>
                <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                  {draft.assignedClassPeriods.map((period) => (
                    <label key={period} style={labelStyle}>{period}<input type="date" value={draft.dolInstructionDatesByClassPeriod?.[period] || resolvedDOLInstructionDate} onChange={(event) => setDOLClassDate(period, event.target.value)} style={inputStyle} /></label>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>This assignment has no DOL section, so no timed DOL window will be created.</p>
        )}
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Google Classroom posts</legend>
        <p style={{ margin: '0 0 12px', color: 'var(--mm-text)', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5 }}>
          Each assignment section gets its own Google Classroom post and grade column. Titles start with the section name, followed by the assignment name, so student gradebooks stay easy to scan.
        </p>
        <label style={labelStyle}>Separate Practice due date (optional)<input type="datetime-local" value={draft.homeworkDueAt || ''} onChange={(event) => setField('homeworkDueAt', event.target.value)} style={inputStyle} /></label>
        <div style={{ marginTop: 8, color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5 }}>{publicationPlan.summary}</div>
      </fieldset>

      <details style={{ ...fieldsetStyle, padding: 0 }}>
        <summary style={{ ...legendStyle, padding: 15, cursor: 'pointer', minHeight: 44, boxSizing: 'border-box' }}>
          Google Classroom preview ({posts.length} {posts.length === 1 ? 'post' : 'posts'})
        </summary>
        <div style={{ padding: '0 15px 15px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {posts.map((post) => (
            <article key={post.postId} style={{ border: '1px solid var(--mm-border)', borderRadius: 9, padding: 14, background: 'var(--mm-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a73e8', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>📋</div>
                <div style={{ minWidth: 0 }}><strong>{post.title}</strong><div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Due {post.dueDate || 'not set'} · {post.maxPoints} pts · {post.gradingMode}</div></div>
              </div>
              <p style={{ color: 'var(--mm-text)', margin: '8px 0 10px', lineHeight: 1.5 }}>{post.description}</p>
              <div style={{ fontSize: 'calc(12 * var(--mm-px))', padding: '9px 11px', background: 'var(--mm-surface-sunken)', borderRadius: 7 }}><strong>Sections:</strong> {post.activities.map((activity) => `${activity.title} (${activity.role})`).join(' + ')}</div>
            </article>
          ))}
        </div>
      </details>
    </section>
  );

  const demoControls = (
    <>
      <label style={{ display: 'block', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, marginBottom: 4 }}>Section</label>
      <select value={demoActivityIndex} onChange={(event) => { setDemoActivityIndex(Number(event.target.value)); setDemoQuestionIndex(0); }} style={{ ...inputStyle, marginBottom: 14 }}>
        {previewActivities.map((activity, index) => <option key={activity.id || activity.sectionId} value={index}>{activity.title} ({activity.role.toUpperCase()})</option>)}
      </select>
      {currentPolicy && (
        <div style={{ background: 'var(--mm-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--mm-border)', marginBottom: 14, fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--mm-primary)' }}>Enforced section policy</strong>
          <div>Attempts: {currentPolicy.attempts}</div>
          <div>Feedback: <code>{currentPolicy.feedback}</code></div>
          <div>Hints: {currentPolicy.hintsAllowed ? 'Allowed' : 'Disabled'}</div>
          <div>Remediation: {currentPolicy.remediationAllowed ? 'Allowed' : 'Disabled'}</div>
          <div>Replacement: {currentPolicy.allowReplacement ? 'Allowed' : 'Disabled'}</div>
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 'calc(13 * var(--mm-px))' }}><input type="checkbox" style={checkboxStyle} checked={demoCalculator} onChange={(event) => setDemoCalculator(event.target.checked)} /> Calculator accommodation</label>
      <label style={{ display: 'block', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800 }}>Language<select value={demoTranslation} onChange={(event) => setDemoTranslation(event.target.value)} style={inputStyle}><option value="en">English</option><option value="es">Español (authored translation)</option></select></label>
    </>
  );

  const studentPreview = (
    <>
      {testCyclePreview && (
        <section aria-label="Test Cycle student preview" style={{ display: 'grid', gap: 9, marginBottom: 16 }}>
          <strong>Test Cycle phases</strong>
          {testCyclePreview.phases.map((phase) => (
            <div key={phase.id} data-preview-test-cycle-phase={phase.id} data-phase-status={phase.status} style={{ padding: 10, border: '1px solid var(--mm-border)', borderRadius: 8 }}>
              <strong>{phase.label}</strong> — {phase.status === 'notRequired' ? 'Not required' : phase.status[0].toUpperCase() + phase.status.slice(1)}
              {phase.reason && <div style={{ color: 'var(--mm-text-muted)', marginTop: 4 }}>{phase.reason}</div>}
            </div>
          ))}
          {testCyclePreview.state.stage === 'test' && testCyclePreview.state.canEnter && <div role="status">Test unlocked — your Review is complete. Start Test</div>}
          <button type="button" onClick={() => setPreviewReviewComplete((value) => !value)}>
            {previewReviewComplete ? 'Reset Review preview' : 'Simulate Review complete'}
          </button>
          <small>This preview is isolated. It does not create or update student Test Cycle records, and secure questions are not loaded here.</small>
          {testCycleCandidate && (
            <button type="button" onClick={() => setCyclePreviewOpen(true)} style={{ justifySelf: 'start', minHeight: 44 }}>
              Sit the secure Test, Corrections and Retest as a student →
            </button>
          )}
        </section>
      )}
      {!currentActivity && <p>No sections are available to preview.</p>}
      {currentActivity && !currentQuestion && !currentActivity.isModelingLab && <p>This section has no questions to preview.</p>}
      {currentActivity?.isModelingLab && <InteractiveModelingLabPlayer rawLabSpec={currentActivity.labDefinition} executionScope="teacherPreview" />}
      {currentQuestion && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid var(--mm-border-soft)', paddingBottom: 10 }}>
            <div style={{ textAlign: 'left' }}>
              <span style={{ fontSize: 'calc(11 * var(--mm-px))', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', padding: '3px 8px', borderRadius: 12, fontWeight: 800 }}>{currentActivity.role.toUpperCase()} MODE</span>
              <h3 style={{ margin: '4px 0 0', fontSize: 'calc(17 * var(--mm-px))' }}>{currentActivity.title}</h3>
            </div>
            <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Question {demoQuestionIndex + 1} of {questions.length}</div>
          </div>
          {honorsOnlyLabel && (
            <div data-preview-honors-only="true" style={{ marginBottom: 12, padding: '7px 10px', borderRadius: 8, fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, lineHeight: 1.45, overflowWrap: 'anywhere', ...HONORS_TONES.note }}>
              {honorsOnlyLabel}
            </div>
          )}
          <MathMasterToolWrapper
            key={`${previewVersion}-${currentActivity.id || currentActivity.sectionId}-${currentQuestion.questionId || demoQuestionIndex}-${demoCalculator}-${demoTranslation}`}
            activityRole={currentActivity.role}
            question={currentQuestion}
            student={{ id: 'teacher_preview_user', supportProfile: { accommodations: demoCalculator ? ['calculator'] : [], modifications: [], translationLanguage: demoTranslation } }}
            executionScope="teacherPreview"
          />
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button type="button" disabled={demoQuestionIndex === 0} onClick={() => setDemoQuestionIndex((value) => value - 1)} style={{ minHeight: 44, padding: '8px 16px' }}>Previous</button>
            <button type="button" disabled={demoQuestionIndex >= questions.length - 1} onClick={() => setDemoQuestionIndex((value) => value + 1)} style={{ minHeight: 44, padding: '8px 16px' }}>Next</button>
          </div>
        </>
      )}
    </>
  );

  // The repair controls for the question being repaired — one copy, used by
  // the blocker list and the Recovery readiness panel alike.
  const renderRepairControls = () => (
    <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--mm-border-soft)' }}>
      <label style={{ display: 'block', fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))' }}>
        Anything else you want the AI to know? <span style={{ fontWeight: 500, color: 'var(--mm-text-muted)' }}>(optional)</span>
        <textarea
          value={repairInstruction}
          onChange={(event) => setRepairInstruction(event.target.value)}
          placeholder="Example: Keep the graph and same TEKS. The issue is only that an equivalent answer is being rejected."
          style={{ display: 'block', width: '100%', minHeight: 82, boxSizing: 'border-box', marginTop: 6, padding: 10, border: '1px solid var(--mm-border)', borderRadius: 7, fontFamily: 'inherit', fontSize: 'calc(14 * var(--mm-px))' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
        <button type="button" onClick={repairQuestionWithMathMasterAi} disabled={repairBusy} style={{ minHeight: 40, padding: '8px 12px', border: 0, borderRadius: 7, background: '#6f2da8', color: '#fff', fontWeight: 800 }}>
          {repairBusy ? 'Repairing…' : '✨ Repair with MathMaster AI'}
        </button>
        <button type="button" onClick={copyQuestionRepairRequest} disabled={repairBusy} style={{ minHeight: 40, padding: '8px 12px', border: 0, borderRadius: 7, background: '#1a73e8', color: '#fff', fontWeight: 800 }}>
          Copy AI Repair Request
        </button>
        <button type="button" onClick={pasteQuestionRepairReplacement} disabled={repairBusy} style={{ minHeight: 40, padding: '8px 12px', border: 0, borderRadius: 7, background: '#188038', color: '#fff', fontWeight: 800 }}>
          {repairBusy ? 'Checking…' : 'Paste AI Replacement'}
        </button>
        <button type="button" onClick={() => { setRepairTargetIndex(null); setRepairPurpose('blocker'); setRepairInstruction(''); setRepairMessage(''); }} disabled={repairBusy} style={{ minHeight: 40, padding: '8px 12px', border: '1px solid var(--mm-border)', borderRadius: 7, background: 'var(--mm-surface)', fontWeight: 800 }}>
          Cancel
        </button>
      </div>
    </div>
  );

  // RECOVERY V2: the Warm-Up and DOL Recovery each version will be created
  // with — the Standard assignment, and the Honors copy on its own questions
  // once there is one. The same planner creation stores (recoveryContentAuthoring).
  const honorsRecoveryModel = honorsCandidateCurrent ? honorsCandidate?.model : null;
  const renderRecoveryReadiness = () => (
    <>
      <RecoveryReadinessPanel
        sections={preflightModel.questionGeneration?.recovery}
        fullyReady={preflightModel.questionGeneration?.recoveryReadiness?.fullyReady ?? null}
        title={honorsRecoveryModel ? 'Warm-Up and DOL Recovery — Standard' : 'Warm-Up and DOL Recovery'}
        intro="MathMaster pairs each Warm-Up and DOL question with a checked Question Family, so a student who needs Recovery gets fresh, equivalent, server-graded questions. You do not write Recovery questions; the questions here stay exactly as they are."
        onRepair={allowQuestionRepair ? (row) => beginQuestionRepair(row.storageIndex, 'recovery') : null}
        renderRepairControls={repairPurpose === 'recovery' ? renderRepairControls : null}
        repairTargetIndex={repairPurpose === 'recovery' ? repairTargetIndex : null}
      />
      {honorsRecoveryModel && (
        <RecoveryReadinessPanel
          sections={honorsRecoveryModel.questionGeneration?.recovery}
          fullyReady={honorsRecoveryModel.questionGeneration?.recoveryReadiness?.fullyReady ?? null}
          title="Warm-Up and DOL Recovery — Honors"
          intro="The Honors copy is checked on its own questions. A Warm-Up or DOL question it shares with the Standard version is fixed by fixing it above."
        />
      )}
    </>
  );

  const renderCheck = () => (
    <section aria-label="Check">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'check')} />}

      {(preflightModel.questionGeneration?.notes?.length > 0 || preflightModel.questionGeneration?.warnings?.length > 0) && (
        <div data-question-generation-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Question versions and Recovery</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            MathMaster generated sample versions of each question, checked that their answers grade correctly, and checked whether a fresh Recovery can be made for the Warm-Up and DOL.
          </p>
          {preflightModel.questionGeneration.notes.length > 0 && (
            <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5 }}>
              {preflightModel.questionGeneration.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
          {preflightModel.questionGeneration.warnings.length > 0 && (
            <ul data-question-generation-warnings="true" style={{ margin: 0, paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.questionGeneration.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
        </div>
      )}

      {renderRecoveryReadiness()}

      {/* The advice below, counted (TT14, TT21): it never stops the
          assignment from being ready (assignmentV5PreflightModel.js
          summarizeAdvisoryFindings). */}
      {preflightModel.advisory?.total > 0 && (
        <p data-preflight-advisory={preflightModel.advisory.total} style={{ margin: '0 0 12px', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text)' }}>
          <strong>{preflightModel.advisory.total === 1 ? '1 suggestion' : `${preflightModel.advisory.total} suggestions`} below</strong>
          {' '}({preflightModel.advisory.groups.map((group) => `${group.count} ${group.label}`).join(', ')}). Advice only: they never stop the assignment from being ready or published.
        </p>
      )}

      {/* WORKED SOLUTIONS (student pass 3, HELP-11 / HELP-18): what a student
          reads after the last try. Suggestions only — they never change
          whether the assignment is ready (assignmentV5PreflightModel.js). */}
      {preflightModel.solutionReviews?.warnings?.length > 0 && (
        <div data-solution-review-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Worked solutions</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            A student who misses a question reads its worked solution. These do not stop the assignment from being ready; they are what would make the solution teach more.
          </p>
          <ul data-solution-review-warnings="true" style={{ margin: 0, paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
            {preflightModel.solutionReviews.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      {/* Advice, not a readiness finding: it never turns the assignment
          "Needs Review" (attemptFeedbackPreflight.js). */}
      {preflightModel.attemptFeedback?.warnings?.length > 0 && (
        <div data-attempt-feedback-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Feedback while students can still fix it</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            These Practice questions have no attempt feedback. A student who misses can ask "What might have gone wrong?", but a sentence you write for the next try says more. This does not stop you publishing.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>{preflightModel.attemptFeedback.warnings.length === 1 ? '1 question' : `${preflightModel.attemptFeedback.warnings.length} questions`}</summary>
            <ul data-attempt-feedback-warnings="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.attemptFeedback.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* Advice, not a readiness finding (hintAnswerPreflight.js): a hint
          that writes the row or the value the student is asked for. */}
      {preflightModel.hintAnswers?.warnings?.length > 0 && (
        <div data-hint-answer-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Hints that give the answer</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            These hints state what the student is asked to write, so after a few tries the hints have done the question. This does not stop you publishing.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>{preflightModel.hintAnswers.warnings.length === 1 ? '1 hint' : `${preflightModel.hintAnswers.warnings.length} hints`}</summary>
            <ul data-hint-answer-warnings="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.hintAnswers.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* Advice, not a readiness finding (choiceOptionPreflight.js, GR06): a
          choice option worth the same as the key is marked wrong, which suits
          a question about form and not one about equivalence. */}
      {preflightModel.choiceOptions?.warnings?.length > 0 && (
        <div data-choice-option-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Choices worth the same as the key</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            These options have the key's value. A student who picks one is marked wrong: check each question asks for a form, not just an equal value. This does not stop you publishing.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>{preflightModel.choiceOptions.warnings.length === 1 ? '1 question' : `${preflightModel.choiceOptions.warnings.length} questions`}</summary>
            <ul data-choice-option-warnings="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.choiceOptions.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* Advice, not a readiness finding (answerKeyPreflight.js): a typed key
          that reads two ways (GR04), or "lowest terms" asked of a box that
          takes any equal value (GR14). */}
      {preflightModel.answerKeys?.warnings?.length > 0 && (
        <div data-answer-key-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Answer keys to check</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            These keys may not be graded the way you mean them. Each one says what to change. This does not stop you publishing.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>{preflightModel.answerKeys.warnings.length === 1 ? '1 key' : `${preflightModel.answerKeys.warnings.length} keys`}</summary>
            <ul data-answer-key-warnings="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.answerKeys.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* Advice, not a readiness finding (impossibleItemsPreflight.js, TT04): a
          system that cannot have exactly one solution as written, and a vertex
          or center asked of a function that has none. Graded correctly, so it
          never turns the assignment "Needs Review". */}
      {preflightModel.impossibleItems?.warnings?.length > 0 && (
        <div data-impossible-items-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Questions to double-check</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            These are written so that the answer may not be the one you expect: a system with no single solution, or a graph feature the function does not have. Each is marked correctly for students; check you meant it. This does not stop you publishing.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>{preflightModel.impossibleItems.warnings.length === 1 ? '1 note' : `${preflightModel.impossibleItems.warnings.length} notes`}</summary>
            <ul data-impossible-items-warnings="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.impossibleItems.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* Advice, not a readiness finding (hintAnswerPreflight.js, HELP-16):
          teacher-written hints the leak guard drops, so a student never
          sees them, and why. */}
      {preflightModel.hiddenHints?.warnings?.length > 0 && (
        <div data-hidden-hint-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Hints students will not see</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            MathMaster never shows a hint that names one of the question's answers, so these are skipped and the student gets the next hint instead. Reword one and it will be shown. This does not stop you publishing.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>{preflightModel.hiddenHints.warnings.length === 1 ? '1 hint' : `${preflightModel.hiddenHints.warnings.length} hints`}</summary>
            <ul data-hidden-hint-warnings="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.hiddenHints.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* Advice, not a readiness finding (spanishVersionPreflight.js, TT22): the
          teacher's own hints and worked solutions can be translated only by the
          teacher, as translations.es on the question. */}
      {preflightModel.spanishVersions?.warnings?.length > 0 && (
        <div data-spanish-version-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Spanish for your hints and worked solutions</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            A student who reads in Spanish can press Translate beside a hint or a worked solution. MathMaster translates its own sentences, but only you can translate the ones you wrote: add them to the question as translations.es, with one line for each hint in the same order and a solutionReview with the same fields. A line that changes a number, letter or symbol is not used, and the student sees the English. In Spanish prose a lone y, o, a, e or u reads as a word, so write a variable like that inside $…$ (for example $y$). This does not stop you publishing.
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>{preflightModel.spanishVersions.warnings.length === 1 ? '1 note' : `${preflightModel.spanishVersions.warnings.length} notes`}</summary>
            <ul data-spanish-version-warnings="true" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.spanishVersions.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        </div>
      )}

      {preflightModel.questionValues?.rows?.length > 0 && (
        <div data-question-value-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-info-border)', borderRadius: 10, background: 'var(--mm-info-bg)', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-info-text)' }}>Question values</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            How much each question counts toward the assignment grade. ×1 is one standard question; MathMaster set any value the assignment did not, from the work the question asks for. Change a value in the question editor.
          </p>
          {preflightModel.questionValues.notes.length > 0 && (
            <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5 }}>
              {preflightModel.questionValues.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
          {preflightModel.questionValues.warnings.length > 0 && (
            <ul data-question-value-warnings="true" style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-warning-text)' }}>
              {preflightModel.questionValues.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800 }}>Every question's value</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
              {preflightModel.questionValues.rows.map((row) => (
                <li key={`${row.questionIndex}-${row.questionId || ''}`} data-question-value-source={row.source}>
                  <strong>{row.label}</strong> ×{row.value} — {row.sentence}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {preflightModel.toolContract?.findings?.length > 0 && (
        <div data-tool-contract-panel="true" style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-primary-border)', borderRadius: 10, background: 'var(--mm-surface-tint)' }}>
          <strong style={{ color: 'var(--mm-primary-text)' }}>Question and tool check</strong>
          <p style={{ margin: '5px 0 9px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            MathMaster checked that each question opens a tool that can do what it asks. A safe repair keeps the same mathematics and only moves it to the workspace students already see.
          </p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text-strong)' }}>
            {preflightModel.toolContract.findings.map((finding) => (
              <li key={`${finding.questionIndex}:${finding.rule}`} data-tool-contract-rule={finding.rule}>{finding.message}</li>
            ))}
          </ul>
          {preflightModel.toolContract.safeRepairs.length > 0 && allowQuestionRepair && (
            <button
              type="button"
              onClick={() => setWorkingAssignmentV5((current) => applySafeToolContractRepairs(current).assignmentV5)}
              style={{ padding: '8px 13px', border: 0, borderRadius: 8, background: '#174ea6', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
            >
              Apply {preflightModel.toolContract.safeRepairs.length} safe {preflightModel.toolContract.safeRepairs.length === 1 ? 'repair' : 'repairs'}
            </button>
          )}
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Developer details</summary>
            <pre style={{ margin: '8px 0 0', padding: 10, borderRadius: 8, background: '#202124', color: '#e8eaed', fontSize: 'calc(11.5 * var(--mm-px))', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(preflightModel.toolContract.findings.map(({ questionId, questionNumber, rule, severity, expected, actual, recommendedRepair }) => ({
                questionId, questionNumber, rule, severity, expected, actual,
                recommendedRepair: recommendedRepair ? { kind: recommendedRepair.kind, safe: recommendedRepair.safe, description: recommendedRepair.description } : null,
              })), null, 2)}
            </pre>
          </details>
        </div>
      )}

      {questionRepairIssues.length > 0 && (
        <div style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-error-border-soft)', borderRadius: 10, background: 'var(--mm-error-subtle)' }}>
          <strong style={{ color: 'var(--mm-error-text)' }}>Questions MathMaster can target directly</strong>
          <p style={{ margin: '5px 0 11px', color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
            Each button builds a repair request for only that question. Other assignment blockers stay untouched.
          </p>
          {!allowQuestionRepair && (
            <div style={{ margin: '0 0 11px', padding: '9px 10px', borderRadius: 8, background: 'var(--mm-warning-bg)', border: '1px solid var(--mm-warning-border-soft)', color: 'var(--mm-warning-text)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
              Student records already exist, so question content is locked to preserve historical evidence. Duplicate the assignment to repair or rewrite its questions.
            </div>
          )}
          <div style={{ display: 'grid', gap: 9 }}>
            {questionRepairIssues.map((issue) => (
              <div key={issue.questionIndex} style={{ padding: 11, border: '1px solid var(--mm-error-border-soft)', borderRadius: 8, background: 'var(--mm-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 420px', minWidth: 0 }}>
                    <strong>Question {issue.questionNumber}</strong>
                    <div style={{ marginTop: 4, color: 'var(--mm-text)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.45 }}>
                      {String(issue.question?.prompt || issue.question?.scenario || issue.question?.title || '').replace(/\s+/g, ' ').slice(0, 180) || 'Question content'}
                    </div>
                    <ul style={{ margin: '7px 0 0', paddingLeft: 18, color: 'var(--mm-error-text)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.45 }}>
                      {issue.errors.map((message) => <li key={message}>{message}</li>)}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => beginQuestionRepair(issue.questionIndex)}
                    disabled={!allowQuestionRepair}
                    title={!allowQuestionRepair ? 'Duplicate the assignment before rewriting question content because student records already exist.' : 'Repair this question with MathMaster AI, or build a request for an outside AI.'}
                    style={{ minHeight: 40, padding: '8px 12px', border: '1px solid #1a73e8', borderRadius: 7, background: 'var(--mm-surface)', color: allowQuestionRepair ? 'var(--mm-primary-text)' : 'var(--mm-text-subtle)', fontWeight: 800, cursor: allowQuestionRepair ? 'pointer' : 'not-allowed' }}
                  >
                    Repair with AI
                  </button>
                </div>
                {repairPurpose === 'blocker' && repairTargetIndex === issue.questionIndex && renderRepairControls()}
              </div>
            ))}
          </div>
        </div>
      )}

      {repairMessage && (
        <div role="status" style={{ marginBottom: 14, padding: '10px 12px', border: '1px solid var(--mm-tint-border)', borderRadius: 8, background: 'var(--mm-surface-tint)', color: 'var(--mm-text)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.45 }}>
          {repairMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10, marginBottom: 18 }}>
        {activities.map((activity) => (
          <div key={activity.id || activity.sectionId} style={{ padding: 11, border: '1px solid var(--mm-tint-border)', borderRadius: 8, background: 'var(--mm-surface)' }}>
            <strong>{humanRole(activity.role)}</strong>
            <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>
              {activity.isModelingLab ? `DOK ${activity.labDefinition?.dokLevel || 3} modeling lab` : `${activity.questions.length} question${activity.questions.length === 1 ? '' : 's'}`} · {activity.policy.attemptsAllowed} attempt{activity.policy.attemptsAllowed === 1 ? '' : 's'} · {activity.policy.feedbackMode}
            </div>
          </div>
        ))}
      </div>

      {/* The preview mounts a real tool — including a modeling-lab player — so
          it stays unmounted until the teacher asks for it. The old layout got
          this for free by putting it behind a tab; every section is on the page
          at once now, so the gate has to be explicit. */}
      {testCyclePreview && serverCyclePreflight && (
        <section aria-label="Authoritative Test Cycle preflight" style={{ ...fieldsetStyle, background: serverCyclePreflight.blocked ? 'var(--mm-error-subtle)' : 'var(--mm-success-subtle)' }}>
          <strong>{serverCyclePreflight.loading ? 'Resolving secure Test…' : serverCyclePreflight.blocked ? 'Test Cycle cannot be published' : 'Test Cycle server preflight passed'}</strong>
          {(serverCyclePreflight.checks || []).map((check) => <div key={check.id}>{check.passed ? '✓' : '✗'} {check.label}</div>)}
          {(serverCyclePreflight.errors || []).map((error) => <div key={error} role="alert" style={{ color: 'var(--mm-error-text)' }}>{error}</div>)}
          {familiesToRegister.length > 0 && (
            <div data-secure-family-registration style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', display: 'grid', gap: 8 }}>
              <strong>
                {familiesToRegister.length === 1
                  ? 'This Test names a secure family that is not in the question bank yet'
                  : `This Test names ${familiesToRegister.length} secure families that are not in the question bank yet`}
              </strong>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
                {familiesToRegister.map((row) => (
                  <li key={row.familyId}>
                    {row.label}{row.alignmentKey ? ` (${row.alignmentKey.replace(/^texas:/i, '')})` : ''} — <code style={{ overflowWrap: 'anywhere' }}>{row.familyId}</code>
                  </li>
                ))}
              </ul>
              {canManageSecureBank ? (
                <>
                  <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))' }}>
                    Import {familiesToRegister.length === 1 ? 'it' : 'them'} from this Test's secure-families file
                    <input
                      type="file"
                      accept="application/json,.json"
                      disabled={familyRegistration.busy}
                      onChange={(event) => {
                        const [file] = event.target.files || [];
                        event.target.value = '';
                        registerSecureFamilies(file);
                      }}
                      style={{ fontSize: 'calc(14 * var(--mm-px))', minHeight: 44 }}
                    />
                  </label>
                  <small style={{ color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>
                    Only the {familiesToRegister.length === 1 ? 'family' : 'families'} listed above {familiesToRegister.length === 1 ? 'is' : 'are'} imported; families already in the bank are not touched.
                    The server checks {familiesToRegister.length === 1 ? 'it' : 'each one'} first and saves nothing if anything fails.
                  </small>
                </>
              ) : (
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  Ask your MathMaster administrator to import this Test's secure-families file ({SECURE_FAMILY_IMPORT_ROUTE}), then open this review again.
                </p>
              )}
            </div>
          )}
          {/* Outside the box: once nothing is missing the box goes, and the
              teacher should still see what was registered (or why not). */}
          {(familyRegistration.message || familyRegistration.error) && (
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {familyRegistration.message && <div role="status" style={{ fontWeight: 700, color: 'var(--mm-primary-text)' }}>{familyRegistration.message}</div>}
              {familyRegistration.error && <div role="alert" style={{ fontWeight: 700, color: 'var(--mm-error-text)' }}>{familyRegistration.error}</div>}
              {familyRegistration.rejected.map((entry, index) => (
                <div key={`${entry.id || 'rejected'}-${index}`} style={{ fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-error-text)' }}>
                  <code>{entry.id || '(no id)'}</code>: {entry.reason}{entry.detail ? ` — ${entry.detail}` : ''}{entry.propertyPath ? ` (at ${entry.propertyPath})` : ''}
                </div>
              ))}
            </div>
          )}
          {!serverCyclePreflight.loading && testCycleCandidate && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              <button
                type="button"
                onClick={() => setCyclePreviewOpen(true)}
                style={{ justifySelf: 'start', minHeight: 44, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer' }}
              >
                Preview the Test, Corrections and Retest as a student
              </button>
              <small style={{ color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>
                The student's card at every stage, and real secure items you can answer and have graded. Nothing is saved, and no student sees anything.
                {serverCyclePreflight.blocked ? ' While this Test is blocked, the questions that cannot be issued yet are named in the preview.' : ''}
              </small>
            </div>
          )}
        </section>
      )}
      <fieldset id="preflight-student-preview" style={{ ...fieldsetStyle, marginTop: 0, padding: 0, scrollMarginTop: 8 }}>
        <legend style={legendStyle}>See it as a student</legend>
        {honorsCandidate && (
          // Two versions are created from this review when Honors classes are
          // selected; each previews the exact object Create publishes for it.
          <div role="group" aria-label="Which version to preview" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 15px', borderBottom: '1px solid var(--mm-border)', background: 'var(--mm-surface)' }}>
            {[
              ['standard', rigorDestinations.standard.length ? 'Standard version' : 'Without Honors changes'],
              ['honors', 'Honors version'],
            ].map(([version, label]) => (
              <button
                key={version}
                type="button"
                aria-pressed={previewVersion === version}
                onClick={() => setPreviewVersion(version)}
                style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', border: `1px solid ${previewVersion === version ? 'var(--mm-primary)' : 'var(--mm-border)'}`, background: previewVersion === version ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', color: previewVersion === version ? 'var(--mm-primary-text)' : 'var(--mm-text)' }}
              >
                {label}
              </button>
            ))}
            <span style={{ alignSelf: 'center', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.4 }}>
              {showingHonorsPreview ? 'What Honors classes receive, including audited CCMR Practice and any Honors extension.' : 'What Standard classes receive.'}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setPreviewOpen((current) => !current)}
          aria-expanded={previewOpen}
          style={{ width: '100%', minHeight: 48, padding: '12px 15px', border: 0, borderBottom: previewOpen ? '1px solid var(--mm-border)' : 0, background: 'var(--mm-surface-sunken)', fontWeight: 800, textAlign: 'left', cursor: 'pointer', fontSize: 'calc(15 * var(--mm-px))' }}
        >
          {previewOpen ? '▾' : '▸'} {previewOpen ? 'Hide the student preview' : 'Open the student preview'}
        </button>

        {previewOpen && (isNarrow ? (
          // The controls were a 210px sidebar, which on a phone left about
          // 180px for the question itself. They collapse above it instead.
          <>
            <button
              type="button"
              onClick={() => setShowDemoControls((current) => !current)}
              aria-expanded={showDemoControls}
              style={{ width: '100%', minHeight: 44, padding: '11px 14px', border: 0, borderBottom: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)', fontWeight: 800, textAlign: 'left', cursor: 'pointer' }}
            >
              {showDemoControls ? '▾' : '▸'} Preview controls
            </button>
            {showDemoControls && <div style={{ padding: 14, background: 'var(--mm-surface-sunken)', borderBottom: '1px solid var(--mm-border)' }}>{demoControls}</div>}
            <div style={{ padding: 14, background: 'var(--mm-surface)' }}>{studentPreview}</div>
          </>
        ) : (
          <div style={{ display: 'flex', minHeight: 0 }}>
            <aside style={{ width: 'min(280px, 34vw)', minWidth: 210, borderRight: '1px solid var(--mm-border)', padding: 14, background: 'var(--mm-surface-sunken)', textAlign: 'left' }}>{demoControls}</aside>
            <main style={{ flex: 1, padding: 16, background: 'var(--mm-surface)', minWidth: 0 }}>{studentPreview}</main>
          </div>
        ))}
      </fieldset>

      {!isNarrow && readiness.total > 0 && (
        <div role="alert" style={{ padding: 14, marginTop: 18, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '1px solid var(--mm-error-border-soft)', borderRadius: 8 }}>
          <strong>Fix before creating:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>{readiness.all.map((entry, index) => <li key={`${index}-${entry.message}`}>{entry.message}</li>)}</ul>
        </div>
      )}
    </section>
  );

  const RENDERERS = { details: renderDetails, classes: renderClasses, delivery: renderDelivery, check: renderCheck };

  return (
    <div className="preflight-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.64)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isNarrow ? 0 : 12 }}>
      <Dialog
        as="section"
        onClose={onClose}
        closeOnEscape={false}
        aria-label="Lesson pre-flight review"
        style={{
          background: 'var(--mm-surface)',
          width: isNarrow ? '100%' : 'min(1180px, 98vw)',
          // Full-bleed on a phone: a rounded card inside a 12px gutter wastes
          // width the review cannot spare.
          height: isNarrow ? '100dvh' : 'min(92dvh, 920px)',
          borderRadius: isNarrow ? 0 : 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--mm-text-strong)',
        }}
      >
        <header style={{ padding: isNarrow ? '12px 14px' : '15px 20px', background: '#1a73e8', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: isNarrow ? 'calc(17 * var(--mm-px))' : 'calc(20 * var(--mm-px))' }}>{isUpdateMode ? 'Review assignment setup' : 'Review assignment'}</h3>
            <span style={{ fontSize: 'calc(12 * var(--mm-px))', opacity: 0.92, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {draft.title || 'Untitled assignment'}{sourceLabel ? ` · ${sourceLabel}` : ''}
            </span>
          </div>
          <button type="button" aria-label="Close pre-flight" onClick={onClose} disabled={busy} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 'calc(24 * var(--mm-px))', cursor: 'pointer', minHeight: 44, minWidth: 44, flexShrink: 0 }}>✕</button>
        </header>

        {/* The step rail doubles as the blocker summary: a step with an unresolved
            problem carries its count, so a disabled Create button always has a
            visible reason one tap away. */}
        <nav aria-label="Review steps" style={{ display: 'flex', borderBottom: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)' }}>
          {PREFLIGHT_STEPS.map((step, index) => {
            const problems = readiness.countByStep[step.id] || 0;
            const isActive = isNarrow ? activeStep === step.id : false;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(step.id)}
                aria-current={isActive ? 'step' : undefined}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 52,
                  padding: '8px 6px',
                  border: 'none',
                  borderBottom: isActive ? '3px solid #1a73e8' : '3px solid transparent',
                  background: isActive ? 'var(--mm-surface)' : 'transparent',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 'calc(13 * var(--mm-px))',
                  color: isActive ? 'var(--mm-primary)' : 'var(--mm-text)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {isNarrow ? step.label : `${index + 1}. ${step.label}`}
                  {problems > 0 && (
                    <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#d93025', color: '#fff', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                      <span aria-hidden="true">{problems}</span>
                      <span style={SR_ONLY_STYLE}>{`${problems} to fix`}</span>
                    </span>
                  )}
                </span>
                {!isNarrow && <span style={{ fontSize: 'calc(11 * var(--mm-px))', fontWeight: 500, color: 'var(--mm-text-muted)' }}>{step.hint}</span>}
              </button>
            );
          })}
        </nav>

        <div data-preflight-scroll style={{ padding: isNarrow ? '16px 14px' : '20px', overflowY: 'auto', flex: 1, textAlign: 'left', WebkitOverflowScrolling: 'touch' }}>
          {stepsToRender.map((stepId, index) => (
            <div key={stepId} id={`preflight-step-${stepId}`} style={{ marginTop: !isNarrow && index > 0 ? 30 : 0, scrollMarginTop: 8 }}>
              {!isNarrow && (
                <h4 style={{ margin: '0 0 12px', paddingBottom: 6, borderBottom: '2px solid var(--mm-tint-border)', color: 'var(--mm-primary-text)' }}>
                  {index + 1}. {PREFLIGHT_STEPS[index]?.label}
                </h4>
              )}
              {RENDERERS[stepId]()}
            </div>
          ))}
        </div>

        <footer style={{ padding: isNarrow ? '10px 14px calc(10px + env(safe-area-inset-bottom))' : '13px 18px', borderTop: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)', display: 'flex', flexDirection: isNarrow ? 'column' : 'row', justifyContent: 'space-between', alignItems: isNarrow ? 'stretch' : 'center', gap: 10 }}>
          <span style={{ fontSize: 'calc(12 * var(--mm-px))', color: readiness.total === 0 ? 'var(--mm-text-muted)' : 'var(--mm-error-text)', textAlign: isNarrow ? 'center' : 'left' }}>
            {readiness.total === 0
              ? (isUpdateMode ? 'Ready to save. These reviewed choices will update this assignment.' : 'Ready to create. These reviewed choices are what MathMaster will publish.')
              : `${readiness.total} thing${readiness.total === 1 ? '' : 's'} still to fix${readiness.firstBlockedStep && readiness.firstBlockedStep !== activeStep ? ` — see step ${stepIndex(readiness.firstBlockedStep) + 1}` : ''}.`}
          </span>

          <div style={{ display: 'flex', gap: 10 }}>
            {isNarrow && currentIndex > 0 && (
              <button type="button" onClick={() => goToStep(PREFLIGHT_STEPS[currentIndex - 1].id)} disabled={busy} style={{ flex: 1, minHeight: 48, padding: '10px 16px', fontWeight: 700 }}>Back</button>
            )}
            {isNarrow && currentIndex === 0 && (
              <button type="button" onClick={onClose} disabled={busy} style={{ flex: 1, minHeight: 48, padding: '10px 16px', fontWeight: 700 }}>Cancel</button>
            )}
            {!isNarrow && (
              <button type="button" onClick={onClose} disabled={busy} style={{ minHeight: 44, padding: '9px 16px' }}>{isUpdateMode ? 'Cancel' : 'Back to Creator'}</button>
            )}

            {isNarrow && !isLastStep ? (
              <button type="button" onClick={() => goToStep(PREFLIGHT_STEPS[currentIndex + 1].id)} style={{ flex: 2, minHeight: 48, padding: '10px 18px', border: 'none', borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800 }}>Next</button>
            ) : (
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => {
                  // A disabled button on a phone explains nothing, so when the
                  // teacher can tap it at all it always does something: create,
                  // or jump to the step that is blocking creation.
                  if (!canCreate) { if (readiness.firstBlockedStep) goToStep(readiness.firstBlockedStep); return; }
                  onConfirmPublish?.({
                    draft: {
                      ...draft,
                      variantPolicy: effectiveAssignmentV5.variantPolicy,
                      differentiationPolicy: effectiveAssignmentV5.differentiationPolicy,
                      supportPolicy: effectiveAssignmentV5.supportPolicy,
                      toolPolicy: effectiveAssignmentV5.toolPolicy,
                      deliveryPolicy: effectiveAssignmentV5.deliveryPolicy,
                      gradingPolicy: effectiveAssignmentV5.gradingPolicy,
                      evidencePolicy: effectiveAssignmentV5.evidencePolicy,
                      outputProfiles: effectiveAssignmentV5.outputProfiles,
                      classroomIntegration: effectiveAssignmentV5.classroomIntegration,
                      provenance: effectiveAssignmentV5.provenance,
                      preflight: effectiveAssignmentV5.preflight,
                      warmupEnabled: hasAuthoredWarmup && draft.warmupEnabled !== false,
                      warmupInstructionDate: resolvedWarmupInstructionDate,
                      warmupInstructionDatesByClassPeriod: resolvedWarmupInstructionDatesByClassPeriod,
                      dolEnabled: hasAuthoredDOL && draft.dolEnabled === true,
                      dolInstructionDate: resolvedDOLInstructionDate,
                      dolInstructionDatesByClassPeriod: resolvedDOLInstructionDatesByClassPeriod,
                      honorsEnrichmentQuestion,
                    },
                    publicationPlan,
                    assignmentV5: effectiveAssignmentV5,
                    honorsReport,
                    // The Honors version this review prepared, proved and
                    // previewed; Create publishes it or nothing.
                    honorsCandidate: honorsCandidateCurrent ? honorsCandidate : null,
                  });
                }}
                style={{ flex: isNarrow ? 2 : undefined, minHeight: isNarrow ? 48 : 44, padding: '10px 20px', border: 'none', borderRadius: 8, background: canCreate ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 800 }}
              >
                {busy ? 'Saving…' : isUpdateMode ? 'Save Setup' : isNarrow ? (action.mode === 'library' ? 'Save' : 'Assign') : action.action}
              </button>
            )}
          </div>

          {/* Why the button says what it says. Without this a teacher who
              forgot to tick a class reads "Save to Library" as a bug. */}
          <div style={{ marginTop: 8, color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.5, textAlign: isNarrow ? 'center' : 'right' }}>
            {isUpdateMode
              ? 'Updates this assignment after the same MathMaster checks used when it was created. It does not create a second copy.'
              : action.hint}
          </div>

          {isNarrow && !canCreate && !busy && readiness.firstBlockedStep && readiness.firstBlockedStep !== activeStep && (
            <button type="button" onClick={() => goToStep(readiness.firstBlockedStep)} style={{ minHeight: 44, padding: '8px 14px', border: '1px solid var(--mm-error-border-soft)', borderRadius: 8, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', fontWeight: 800 }}>
              Take me to what needs fixing
            </button>
          )}
        </footer>
      </Dialog>
      {cyclePreviewOpen && testCycleCandidate && (
        <Suspense fallback={<p role="status" style={{ position: 'fixed', top: 12, left: 12, zIndex: 11000, margin: 0, padding: '8px 12px', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-text)' }}>Opening the student preview…</p>}>
          <TestCyclePreview
            assignment={effectiveAssignmentV5}
            candidate={testCycleCandidate}
            onClose={() => setCyclePreviewOpen(false)}
            // Review is ordinary content, already playable in this review's
            // own student preview: go there instead of a second player.
            onPreviewReview={() => {
              const reviewIndex = activities.findIndex((activity) => activity.role === 'review');
              setCyclePreviewOpen(false);
              setPreviewVersion('standard');
              setPreviewOpen(true);
              if (reviewIndex >= 0) {
                setDemoActivityIndex(reviewIndex);
                setDemoQuestionIndex(0);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default LessonPreflightModal;
