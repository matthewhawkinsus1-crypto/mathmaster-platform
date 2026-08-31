import React, { useEffect, useMemo, useState } from 'react';
import { MathMasterToolWrapper } from '../../platform/ToolWrapper';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies';
import { PUBLICATION_STRATEGIES, planClassroomPublication } from '../../platform/publishing/publicationPlanner';
import { normalizeLessonPublishingIntentV5 } from '../../platform/authoring/lessonPublishingIntent.js';
import { defaultAssignmentDateInputs } from '../../platform/assignments/assignmentDateDefaults.js';
import { buildAssignmentV5PreflightModel } from '../../platform/preflight/assignmentV5PreflightModel.js';
import InteractiveModelingLabPlayer from '../labs/InteractiveModelingLabPlayer.jsx';
import { buildHonorsEnrichmentQuestion, inspectHonorsRigor } from '../../platform/rigor/courseRigor.js';
import {
  applyHonorsDepthAiSections,
  buildHonorsDepthAiRepairRequest,
  honorsMissingLabels,
  nonCcmrHonorsMissing,
  separateHonorsDepthAiRepair,
} from '../../platform/contract/honorsDepthAiRepair.js';
import {
  assignmentAiFallbackRecommended,
  buildAssignmentWithAI,
} from '../../services/assignmentAiService.js';
import RepresentationAudit from './RepresentationAudit';
import SectionBalanceRigorAudit from './SectionBalanceRigorAudit.jsx';
import {
  PREFLIGHT_STEPS, blockersForStep, collectReviewBlockers,
  describePreflightAction, stepIndex, summarizePreflightReadiness,
} from './preflightSteps';
import AdaptivePreview from './AdaptivePreview.jsx';
import { buildPreflightReviewedAssignmentV5 } from './preflightV5Review.js';
import { buildQuestionRepairRequest, parseQuestionRepairResponse } from '../../platform/contract/questionRepairRequest.js';
import {
  groupQuestionPreflightIssues,
  newlyIntroducedPreflightErrors,
  replaceQuestionAtFlatIndex,
} from '../../platform/preflight/preflightQuestionRepair.js';

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
  fontSize: 16,
  minHeight: 44,
  padding: '10px',
  border: '1px solid #c9ced6',
  borderRadius: 7,
  boxSizing: 'border-box',
  background: '#fff',
  color: '#202124',
};

// A default checkbox is about 13px, which is a poor target on a phone even
// inside a 44px label.
const checkboxStyle = { width: 20, height: 20, flexShrink: 0 };

const fieldsetStyle = { marginTop: 18, padding: 15, border: '1px solid #d8dde6', borderRadius: 10 };
const legendStyle = { fontWeight: 900 };
const labelStyle = { fontWeight: 800, display: 'block' };

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
    guidedNotesBySection: { classwork: 'automatic', practice: 'off' },
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
    publicationStrategy: PUBLICATION_STRATEGIES.HYBRID,
    includeWarmupInClassroom: false,
    homeworkDueAt: '',
    ...rest,
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

// A blocker list scoped to one step, shown at the top of that step so the
// reason is next to the control that fixes it rather than eight screens down.
const StepBlockers = ({ blockers }) => {
  if (!blockers.length) return null;
  return (
    <div role="alert" style={{ padding: 13, marginBottom: 16, background: '#fce8e6', color: '#a50e0e', border: '1px solid #f1a5a0', borderRadius: 9 }}>
      <strong>{blockers.length === 1 ? 'One thing to fix here' : `${blockers.length} things to fix here`}</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>
        {blockers.map((entry, index) => <li key={`${index}-${entry.message}`}>{entry.message}</li>)}
      </ul>
    </div>
  );
};

export const LessonPreflightModal = ({
  assignmentV5,
  publicationPlan: suppliedPublicationPlan = null,
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
  const [honorsEnrichmentQuestion, setHonorsEnrichmentQuestion] = useState(null);
  const [honorsAiBusy, setHonorsAiBusy] = useState(false);
  const [honorsAiMessage, setHonorsAiMessage] = useState('');
  const [workingAssignmentV5, setWorkingAssignmentV5] = useState(() => assignmentV5);
  const [repairTargetIndex, setRepairTargetIndex] = useState(null);
  const [repairInstruction, setRepairInstruction] = useState('');
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');

  // Teacher review controls edit canonical Assignment V5 directly. The exact
  // reviewed V5 object is revalidated before it
  // powers preview, Classroom planning, and final publishing.
  const reviewedAssignmentV5 = useMemo(
    () => buildPreflightReviewedAssignmentV5(workingAssignmentV5, draft),
    [workingAssignmentV5, draft],
  );
  const preflightModel = useMemo(
    () => buildAssignmentV5PreflightModel(reviewedAssignmentV5),
    [reviewedAssignmentV5],
  );
  const effectiveAssignmentV5 = preflightModel.assignmentV5;
  const publishingIntent = useMemo(() => normalizeLessonPublishingIntentV5({
    classroom: effectiveAssignmentV5.classroomIntegration,
    lessonResources: { notesPdf: effectiveAssignmentV5.outputProfiles?.lessonNotesPdf },
  }, effectiveAssignmentV5.assignment, []), [effectiveAssignmentV5]);
  const activities = preflightModel.sections;
  const activityRoles = useMemo(() => [...new Set(activities.map((section) => section?.role).filter(Boolean))], [activities]);
  const hasAuthoredWarmup = activityRoles.includes('warmup');
  const hasAuthoredDOL = activityRoles.includes('dol');
  const previewQuestions = preflightModel.questions;
  const validationErrors = preflightModel.errors;
  const questionRepairIssues = useMemo(
    () => groupQuestionPreflightIssues(validationErrors, previewQuestions),
    [validationErrors, previewQuestions],
  );

  const computedPublicationPlan = useMemo(() => planClassroomPublication({
    assignmentV5: effectiveAssignmentV5,
    strategy: draft.publicationStrategy || PUBLICATION_STRATEGIES.HYBRID,
    mainDueDate: draft.dueAt || null,
    homeworkDueDate: draft.homeworkDueAt || null,
    includeWarmupInClassroom: draft.includeWarmupInClassroom === true,
  }), [effectiveAssignmentV5, draft.publicationStrategy, draft.dueAt, draft.homeworkDueAt, draft.includeWarmupInClassroom]);

  const publicationPlan = suppliedPublicationPlan && !initialDraft.publicationStrategy
    ? suppliedPublicationPlan
    : computedPublicationPlan;
  const posts = Array.isArray(publicationPlan?.plannedPosts) ? publicationPlan.plannedPosts : [];
  const currentActivity = activities[demoActivityIndex] || null;
  const questions = Array.isArray(currentActivity?.questions) ? currentActivity.questions : [];
  const currentQuestion = questions[demoQuestionIndex] || null;
  const currentPolicy = currentActivity ? getEffectiveActivityPolicy(currentActivity.role) : null;

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
  const honorsReport = useMemo(
    () => inspectHonorsRigor(
      [...sourceRigorQuestions, ...(honorsEnrichmentQuestion ? [honorsEnrichmentQuestion] : [])],
      { allowNarrowCheckpoint: true },
    ),
    [sourceRigorQuestions, honorsEnrichmentQuestion],
  );
  const honorsSelected = rigorDestinations.honors.length > 0;

  const readiness = useMemo(() => summarizePreflightReadiness({
    blockers: collectReviewBlockers({ draft, classPeriods, honorsSelected, honorsReport }),
    validationErrors,
    bundleIsValid: preflightModel.isValid,
  }), [draft, classPeriods, honorsSelected, honorsReport, validationErrors, preflightModel.isValid]);

  useEffect(() => {
    if (demoActivityIndex >= activities.length) setDemoActivityIndex(Math.max(0, activities.length - 1));
  }, [activities.length, demoActivityIndex]);

  useEffect(() => {
    if (demoQuestionIndex >= questions.length) setDemoQuestionIndex(Math.max(0, questions.length - 1));
  }, [questions.length, demoQuestionIndex]);

  if (!assignmentV5) return null;

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const repairIssueForIndex = (questionIndex) => (
    questionRepairIssues.find((entry) => entry.questionIndex === questionIndex) || null
  );

  const beginQuestionRepair = (questionIndex) => {
    if (!allowQuestionRepair) {
      setRepairMessage('Student records already exist for this assignment. Duplicate the assignment before rewriting question content so historical responses stay attached to what students actually saw.');
      return;
    }
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
      const replacement = parseQuestionRepairResponse(raw);
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
      setWorkingAssignmentV5(candidateModel.assignmentV5);
      setRepairTargetIndex(null);
      setRepairInstruction('');
      setRepairMessage(`Question ${issue.questionNumber} replacement accepted. MathMaster rechecked the assignment.`);
    } catch (error) {
      setRepairMessage(error.message);
    } finally {
      setRepairBusy(false);
    }
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
      const returned = JSON.parse(built.assignmentJson);
      const guardedCandidate = applyHonorsDepthAiSections(effectiveAssignmentV5, returned);
      const candidateModel = buildAssignmentV5PreflightModel(guardedCandidate);

      const newErrors = newlyIntroducedPreflightErrors(validationErrors, candidateModel.errors);
      if (newErrors.length) {
        throw new Error(`The AI repair introduced a new assignment blocker:\n${newErrors.join('\n')}`);
      }

      const candidateReport = inspectHonorsRigor(candidateModel.questions, { allowNarrowCheckpoint: true });
      const unresolved = nonCcmrHonorsMissing(candidateReport);
      if (unresolved.length) {
        throw new Error(`MathMaster AI could not safely resolve: ${honorsMissingLabels(unresolved).join(', ')}. The original assignment was kept unchanged.`);
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
          ? 'MathMaster AI repaired the Honors depth requirements and the assignment passed Preflight again.'
          : 'MathMaster AI repaired the Honors depth requirements. Audited CCMR Practice will be sourced from Fidelity V2.1 at publish.',
      );
    } catch (error) {
      setHonorsAiMessage(
        assignmentAiFallbackRecommended(error)
          ? 'Built-in MathMaster AI is unavailable right now. The assignment was not changed. You can try again, or use the local depth extension only when Core TEKS is already present.'
          : error.message,
      );
    } finally {
      setHonorsAiBusy(false);
    }
  };

  const sectionVariantMode = (role) => (
    draft.sectionVariantModes?.[role]
    || assignmentV5?.variantPolicy?.sectionModes?.[role]
    || assignmentV5?.variantPolicy?.mode
    || 'shared'
  );
  const setSectionVariantMode = (role, value) => setDraft((current) => ({
    ...current,
    sectionVariantModes: { ...(current.sectionVariantModes || {}), [role]: value },
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

  const canCreate = readiness.canCreate && !busy;
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
      document.getElementById(`preflight-step-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderDetails = () => (
    <section aria-label="Details">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'details')} />}
      <RepresentationAudit questions={previewQuestions} warnings={authoringWarnings} />
      <SectionBalanceRigorAudit assignmentV5={effectiveAssignmentV5} />

      <div style={{ padding: '12px 14px', marginBottom: 16, background: '#e8f0fe', color: '#174ea6', border: '1px solid #aecbfa', borderRadius: 9, fontSize: 13, lineHeight: 1.5 }}>
        <strong>AI-prepared Classroom and notes package.</strong> MathMaster carries the AI-written topic, post text, grade-passback settings, and 1–2 page student-notes plan into the saved lesson. The teacher still chooses classes and dates here before anything is published.
        {(publishingIntent.classroomPackage || publishingIntent.lessonResources?.notesPdf) && (
          <div style={{ marginTop: 9, padding: '9px 10px', borderRadius: 8, background: '#fff', border: '1px solid #c5d5ef', color: '#3c4043' }}>
            <div><strong>Classroom topic:</strong> {publishingIntent.classroomPackage?.topic?.name || 'MathMaster will infer this from the folder.'}</div>
            <div><strong>Assignment post:</strong> {publishingIntent.classroomPackage?.assignmentPost?.title || draft.title || 'Prepared from the lesson title'}</div>
            {publishingIntent.lessonResources?.notesPdf?.enabled && <div><strong>Student notes PDF:</strong> {publishingIntent.lessonResources.notesPdf.title || 'Student Notes'} · {Number(publishingIntent.lessonResources.notesPdf.targetPages) === 1 ? 1 : 2} page target · {(publishingIntent.lessonResources.notesPdf.sections || []).length} authored section{(publishingIntent.lessonResources.notesPdf.sections || []).length === 1 ? '' : 's'}</div>}
            {publishingIntent.classroomPackage?.resourcesPost?.enabled !== false && <div><strong>Resources post:</strong> {publishingIntent.classroomPackage?.resourcesPost?.postingMode === 'attachToAssignment' ? 'attach resources to the graded assignment' : 'separate Notes & Resources material post'}</div>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label style={labelStyle}>Assignment title<input value={draft.title} onChange={(event) => setField('title', event.target.value)} style={inputStyle} /></label>
        <label style={labelStyle}>Library folder<input value={draft.folder || ''} onChange={(event) => setField('folder', event.target.value)} placeholder="Algebra I/Module 1/Topic 1" style={inputStyle} /></label>
        <label style={labelStyle}>Regular due date<input type="datetime-local" value={draft.dueAt || ''} onChange={(event) => setField('dueAt', event.target.value)} style={inputStyle} /></label>
        <label style={labelStyle}>Final late due date<input type="datetime-local" value={draft.lateDueAt || ''} onChange={(event) => setField('lateDueAt', event.target.value)} style={inputStyle} /></label>
        <label style={labelStyle}>Automatic release (optional)<input type="datetime-local" value={draft.releaseAt || ''} onChange={(event) => setField('releaseAt', event.target.value)} style={inputStyle} /></label>
      </div>
    </section>
  );

  const renderClasses = () => (
    <section aria-label="Classes">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'classes')} />}

      <fieldset style={{ ...fieldsetStyle, marginTop: 0 }}>
        <legend style={legendStyle}>Assign to MathMaster classes</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 11 }}>
          <button type="button" onClick={() => setSelectedClassIds(activeClassChoices.map((entry) => entry.classId))} disabled={!activeClassChoices.length} style={{ minHeight: 44, padding: '7px 13px' }}>Select all</button>
          <button type="button" onClick={() => setSelectedClassIds([])} style={{ minHeight: 44, padding: '7px 13px' }}>Clear</button>
          <span style={{ alignSelf: 'center', color: '#5f6368', fontSize: 12 }}>{(draft.assignedClassIds || []).length} selected</span>
        </div>
        {!activeClassChoices.length && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: '#fff4ce', color: '#7a4f00', fontSize: 12 }}>
            No active MathMaster classes are available. Save this assignment to the Library, then create or restore a class before assigning it.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {activeClassChoices.map((classRecord) => {
            const selected = (draft.assignedClassIds || []).includes(classRecord.classId);
            return (
              <label key={classRecord.classId || classRecord.period} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 14px', background: selected ? '#e8f0fe' : '#fff', border: '1px solid #c5d5ef', borderRadius: 999, fontWeight: 800, cursor: 'pointer' }}>
                <input type="checkbox" style={checkboxStyle} checked={selected} onChange={() => toggleClassChoice(classRecord)} />
                {classRecord.name || classRecord.period}{classRecord.name && classRecord.name !== classRecord.period ? ` · ${classRecord.period}` : ''}
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 9, color: '#5f6368', fontSize: 12 }}>Assignments are targeted by MathMaster class ID. Period is derived from the selected class only for bell-schedule timing.</div>
      </fieldset>

      <fieldset style={{ ...fieldsetStyle, border: `1px solid ${honorsSelected ? '#c7a9ea' : '#d8dde6'}`, background: honorsSelected ? '#fcf9ff' : '#fff' }}>
        <legend style={legendStyle}>Course rigor destinations</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: '#f1f3f4', fontSize: 11, fontWeight: 900 }}>STANDARD: {rigorDestinations.standard.join(', ') || 'none'}</span>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: '#efe4ff', color: '#6f2da8', fontSize: 11, fontWeight: 900 }}>HONORS: {rigorDestinations.honors.join(', ') || 'none'}</span>
        </div>
        <p style={{ color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>{honorsSelected ? 'Honors periods are validated from the saved class designation. When Standard and Honors destinations are selected together, MathMaster creates destination variants from this one source assignment.' : 'No selected class is designated Honors. Standard validation applies.'}</p>
        {honorsSelected && honorsReport.isNarrowCheckpoint && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#e8f0fe', color: '#174ea6', fontSize: 12, lineHeight: 1.5 }}><strong>Narrow Honors checkpoint.</strong> Warm-Ups and DOLs with three or fewer items may stay focused on the current TEKS. Depth, prerequisite repair, and CCMR are balanced across the recent Honors sequence instead of forced into every short check.</div>}
        {honorsSelected && !honorsReport.isNarrowCheckpoint && <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(190px, 1fr))', gap: 7 }}>{[
          ['coreTeks', 'Core TEKS'], ['higherOrderReasoning', 'Higher-order reasoning'], ['multipleRepresentations', 'Multiple representations'], ['justification', 'Explanation / justification'], ['modelingApplication', 'Modeling / application'], ['ccmrEnrichment', 'Authentic CCMR Practice'],
        ].map(([key, label]) => {
          const present = honorsReport.checks[key];
          const queuedAtPublish = key === 'ccmrEnrichment' && !present;
          return (
            <div key={key} style={{ padding: '8px 10px', borderRadius: 8, background: present ? '#e6f4ea' : queuedAtPublish ? '#e8f0fe' : '#fff4ce', color: present ? '#137333' : queuedAtPublish ? '#174ea6' : '#7a4f00', fontWeight: 800, fontSize: 12 }}>
              {present ? '✓' : queuedAtPublish ? '↻' : '!'} {queuedAtPublish ? 'Audited CCMR at publish' : label}
            </div>
          );
        })}</div>}
        {honorsSelected && !honorsReport.isNarrowCheckpoint && !honorsReport.checks.ccmrEnrichment && (
          <div style={{ marginTop: 11, padding: '11px 13px', borderRadius: 9, background: '#fff4ce', border: '1px solid #f0d489', color: '#7a4f00', fontSize: 12.5, lineHeight: 1.55 }}>
            <strong>Audited CCMR Practice will be sourced at publish.</strong> Because an Honors destination is selected, MathMaster will replace matching Practice work with an audited CCMR Fidelity V2.1 family on the same lesson TEKS. Standard destinations keep the regular course Practice. Exam-looking wording by itself never counts as authentic CCMR.
          </div>
        )}
        {honorsSelected && !honorsReport.isNarrowCheckpoint && !honorsReport.isHonorsReady && honorsReport.missing.some((key) => key !== 'ccmrEnrichment') && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={buildHonorsDepthWithAi}
              disabled={honorsAiBusy || !allowQuestionRepair}
              title={!allowQuestionRepair ? 'Duplicate the assignment before rewriting Honors content because student records already exist.' : 'Use MathMaster’s embedded AI to repair the missing Honors depth requirements, then rerun Preflight.'}
              style={{ minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: honorsAiBusy || !allowQuestionRepair ? '#c9b5df' : '#6f2da8', color: '#fff', fontWeight: 900, cursor: honorsAiBusy || !allowQuestionRepair ? 'not-allowed' : 'pointer' }}
            >
              {honorsAiBusy ? '✨ Repairing Honors depth…' : '✨ Build Honors Depth with MathMaster AI'}
            </button>
            {honorsReport.checks.coreTeks && (
              <button type="button" disabled={!allowQuestionRepair || honorsAiBusy} onClick={() => {
                const firstHonorsClass = selectedClassChoices.find((entry) => entry.courseLevel === 'honors');
                setHonorsEnrichmentQuestion(buildHonorsEnrichmentQuestion({ questions: sourceRigorQuestions, course: firstHonorsClass?.course || 'algebra1' }));
                setHonorsAiMessage('Local MathMaster extension added. This fallback can add depth, but it does not invent missing TEKS alignment.');
              }} style={{ minHeight: 44, padding: '9px 15px', border: '1px solid #c7a9ea', borderRadius: 8, background: '#fff', color: '#6f2da8', fontWeight: 900 }}>
                Add local depth extension
              </button>
            )}
          </div>
        )}
        {honorsAiMessage && (
          <div role="status" style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#f5effc', border: '1px solid #d8c2ef', color: '#5b2788', fontSize: 12.5, lineHeight: 1.5 }}>
            {honorsAiMessage}
          </div>
        )}
        {honorsEnrichmentQuestion && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#e6f4ea', color: '#137333', fontSize: 12 }}><strong>MathMaster depth extension prepared.</strong> It strengthens modeling/justification for the Honors destination, but it does not substitute for an authentic CCMR-style Practice item.</div>}
        {honorsSelected && honorsReport.isHonorsReady && !honorsReport.isNarrowCheckpoint && !honorsEnrichmentQuestion && <div style={{ marginTop: 10, color: '#137333', fontWeight: 800, fontSize: 12 }}>✓ Source assignment already satisfies the Honors contract; MathMaster will not rewrite it.</div>}
      </fieldset>
    </section>
  );

  const renderDelivery = () => (
    <section aria-label="Delivery">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'delivery')} />}

      <div style={{ padding: '13px 15px', marginBottom: 14, border: '1px solid #c5d5ef', borderRadius: 10, background: '#f8fbff' }}>
        <strong style={{ color: '#174ea6' }}>Activity sections control student behavior</strong>
        <p style={{ margin: '6px 0 8px', color: '#3c4043', lineHeight: 1.5 }}>
          Warm-Up, Classwork, Practice, DOL, Quiz, and Test behavior comes from the sections already built into the assignment. You no longer need to choose a second Classwork/Practice designation here.
        </p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {activityRoles.map((role) => <span key={role} style={{ padding: '5px 9px', borderRadius: 999, background: '#e8f0fe', color: '#174ea6', fontSize: 11, fontWeight: 900 }}>{humanRole(role)}</span>)}
        </div>
      </div>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Question versions by section</legend>
        <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
          Choose independently for each assignment section. <strong>Same questions</strong> gives everyone the
          identical version. <strong>Different versions</strong> keeps the task, the depth and the complexity
          identical and changes only the numbers. <strong>Pitched to the student</strong> keeps the standard you
          assigned and lets MathMaster move complexity and depth by one step, using what each student has
          actually shown.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
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
                  <span style={{ display: 'block', marginTop: 4, color: '#5f6368', fontSize: 11, lineHeight: 1.45 }}>
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
        <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
          PDFs are optional and can be enabled or disabled at any time. Enabling one immediately adds its
          representation and page-fit safety checks; leaving PDFs off never blocks the digital Library copy.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {[
            ['studentWorksheetPdf', 'Student worksheet PDF', 'Printable assignment without answers.'],
            ['teacherWorksheetPdf', 'Teacher copy PDF', 'Answers and available worked solutions.'],
            ['answerKeyPdf', 'Compact answer key PDF', 'Answer-focused print copy.'],
            ['lessonNotesPdf', 'Lesson notes PDF', 'Separate notes/resource handout.'],
          ].map(([key, label, description]) => (
            <label key={key} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 58,
              padding: 10, border: '1px solid #d8dde6', borderRadius: 8, background: '#fbfdff',
            }}>
              <input
                type="checkbox"
                style={{ ...checkboxStyle, marginTop: 2 }}
                checked={outputProfileEnabled(key)}
                onChange={(event) => setOutputProfileEnabled(key, event.target.checked)}
              />
              <span>
                <strong style={{ display: 'block', color: '#202124' }}>{label}</strong>
                <span style={{ display: 'block', marginTop: 2, color: '#5f6368', fontSize: 11.5, lineHeight: 1.4 }}>{description}</span>
              </span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8, background: '#f7faff', color: '#526274', fontSize: 12, lineHeight: 1.5 }}>
          Student IEP/504/EB access supports remain automatic and server-resolved. Changing an output does not change the assessed standard.
        </div>
      </fieldset>

      {activityRoles.some((role) => ['classwork', 'practice'].includes(role)) && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Guided Notes by section</legend>
          <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
            Guided Notes should teach the mathematics, not narrate the interface. Automatic uses authored notes when present and otherwise builds tool/workflow-aware guidance. Authored only hides the panel unless the assignment includes meaningful notes. Off removes the panel entirely.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
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
          <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
            Recommended default: Classwork = Automatic; Practice = Off. Generic filler such as “Read the question” is suppressed even in Automatic mode.
          </p>
        </fieldset>
      )}

      {activityRoles.some((role) => ['classwork', 'practice'].includes(role)) && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Teacher section access controls</legend>
          <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
            Classwork and Practice can open automatically, or start locked until you release that section from the Live Class Hub. Either way, you can later open, close, or reopen the section for one class period without affecting your other classes.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
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
          <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
            These controls affect new graded responses only. After the final cutoff, the assignment enters ungraded Practice Mode and all sections become available for review/practice.
          </p>
        </fieldset>
      )}

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Warm-Up timing</legend>
        {hasAuthoredWarmup ? (
          <>
            <label style={{ ...labelStyle, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={checkboxStyle} checked={draft.warmupEnabled !== false} onChange={(event) => setField('warmupEnabled', event.target.checked)} /> Use the class-period Warm-Up window for the authored Warm-Up section</label>
            {draft.warmupEnabled !== false && (
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 10 }}>
                <label style={labelStyle}>Warm-Up instructional date<input type="date" value={resolvedWarmupInstructionDate} onChange={(event) => setField('warmupInstructionDate', event.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>Open before class (minutes)<input type="number" min="0" max="30" value={draft.warmupMinutesBeforeStart ?? 7} onChange={(event) => setField('warmupMinutesBeforeStart', event.target.value)} style={inputStyle} /></label>
              </div>
            )}
            {draft.warmupEnabled !== false && <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>The Warm-Up opens {draft.warmupMinutesBeforeStart ?? 7} minutes before that class begins, only on its instructional date. You can close it early from the Live Class Hub; students keep their saved work but the section becomes read-only.</p>}
            {draft.warmupEnabled !== false && draft.assignedClassPeriods.length > 0 && (
              <details style={{ marginTop: 12, padding: '10px 12px', border: '1px solid #d8dde6', borderRadius: 8, background: '#fff' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Different Warm-Up date for a specific class (optional)</summary>
                <p style={{ color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>Useful for A-Day/B-Day sections that receive this same bundled lesson on different dates. Leaving a class unchanged uses the default Warm-Up date above.</p>
                <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  {draft.assignedClassPeriods.map((period) => (
                    <label key={period} style={labelStyle}>{period}<input type="date" value={draft.warmupInstructionDatesByClassPeriod?.[period] || resolvedWarmupInstructionDate} onChange={(event) => setWarmupClassDate(period, event.target.value)} style={inputStyle} /></label>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p style={{ margin: 0, color: '#5f6368', lineHeight: 1.5 }}>This assignment has no Warm-Up section, so no class-start Warm-Up window will be created.</p>
        )}
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>DOL timing</legend>
        {hasAuthoredDOL ? (
          <>
            <label style={{ ...labelStyle, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={checkboxStyle} checked={draft.dolEnabled === true} onChange={(event) => setField('dolEnabled', event.target.checked)} /> Use the class-period DOL window for the authored DOL section</label>
            {draft.dolEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 10 }}>
                <label style={labelStyle}>DOL instructional date<input type="date" value={resolvedDOLInstructionDate} onChange={(event) => setField('dolInstructionDate', event.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>DOL working time (minutes)<input type="number" min="1" max="20" value={draft.dolMinutesBeforeEnd || 10} onChange={(event) => setField('dolMinutesBeforeEnd', event.target.value)} style={inputStyle} /></label>
                <label style={labelStyle}>Close before the bell (minutes)<input type="number" min="0" max="15" value={draft.dolCloseMinutesBeforeEnd ?? 5} onChange={(event) => setField('dolCloseMinutesBeforeEnd', event.target.value)} style={inputStyle} /></label>
              </div>
            )}
            {draft.dolEnabled && <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>The DOL opens {dolOpensMinutesBeforeEnd} minutes before the bell, gives students {dolWorkMinutes} minutes to work, and closes {dolCloseMinutesBeforeEnd} minutes before class ends so technology can be returned. If you unlock it early from the live class controls, the same {dolWorkMinutes}-minute timer starts then but still cannot run into the final {dolCloseMinutesBeforeEnd}-minute pack-up window.</p>}
            {draft.dolEnabled && draft.assignedClassPeriods.length > 0 && (
              <details style={{ marginTop: 12, padding: '10px 12px', border: '1px solid #d8dde6', borderRadius: 8, background: '#fff' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Different DOL date for a specific class (optional)</summary>
                <p style={{ color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>Use this when A-Day and B-Day sections receive the same bundled lesson on different calendar dates. Leaving a class unchanged uses the default DOL date above.</p>
                <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  {draft.assignedClassPeriods.map((period) => (
                    <label key={period} style={labelStyle}>{period}<input type="date" value={draft.dolInstructionDatesByClassPeriod?.[period] || resolvedDOLInstructionDate} onChange={(event) => setDOLClassDate(period, event.target.value)} style={inputStyle} /></label>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p style={{ margin: 0, color: '#5f6368', lineHeight: 1.5 }}>This assignment has no DOL section, so no timed DOL window will be created.</p>
        )}
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Publication plan</legend>
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label style={labelStyle}>Strategy<select value={draft.publicationStrategy} onChange={(event) => setField('publicationStrategy', event.target.value)} style={inputStyle}><option value="hybrid">Hybrid</option><option value="bundle">Bundle</option><option value="split">Split by section</option></select></label>
          <label style={labelStyle}>Separate homework due date (optional)<input type="datetime-local" value={draft.homeworkDueAt || ''} onChange={(event) => setField('homeworkDueAt', event.target.value)} style={inputStyle} /></label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 8, fontWeight: 800 }}><input type="checkbox" style={checkboxStyle} checked={draft.includeWarmupInClassroom === true} onChange={(event) => setField('includeWarmupInClassroom', event.target.checked)} /> Include Warm-Up as a Classroom post</label>
        <div style={{ marginTop: 8, color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>{publicationPlan.summary} {publicationPlan.omittedWarmupCount ? `${publicationPlan.omittedWarmupCount} Warm-Up section omitted by default.` : ''}</div>
      </fieldset>

      <details style={{ ...fieldsetStyle, padding: 0 }}>
        <summary style={{ ...legendStyle, padding: 15, cursor: 'pointer', minHeight: 44, boxSizing: 'border-box' }}>
          Google Classroom preview ({posts.length} {posts.length === 1 ? 'post' : 'posts'})
        </summary>
        <div style={{ padding: '0 15px 15px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {posts.map((post) => (
            <article key={post.postId} style={{ border: '1px solid #dadce0', borderRadius: 9, padding: 14, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a73e8', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>📋</div>
                <div style={{ minWidth: 0 }}><strong>{post.title}</strong><div style={{ fontSize: 12, color: '#5f6368' }}>Due {post.dueDate || 'not set'} · {post.maxPoints} pts · {post.gradingMode}</div></div>
              </div>
              <p style={{ color: '#3c4043', margin: '8px 0 10px', lineHeight: 1.5 }}>{post.description}</p>
              <div style={{ fontSize: 12, padding: '9px 11px', background: '#f8f9fa', borderRadius: 7 }}><strong>Sections:</strong> {post.activities.map((activity) => `${activity.title} (${activity.role})`).join(' + ')}</div>
            </article>
          ))}
        </div>
      </details>
    </section>
  );

  const demoControls = (
    <>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Section</label>
      <select value={demoActivityIndex} onChange={(event) => { setDemoActivityIndex(Number(event.target.value)); setDemoQuestionIndex(0); }} style={{ ...inputStyle, marginBottom: 14 }}>
        {activities.map((activity, index) => <option key={activity.id || activity.sectionId} value={index}>{activity.title} ({activity.role.toUpperCase()})</option>)}
      </select>
      {currentPolicy && (
        <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e0e0e0', marginBottom: 14, fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: '#1a73e8' }}>Enforced section policy</strong>
          <div>Attempts: {currentPolicy.attempts}</div>
          <div>Feedback: <code>{currentPolicy.feedback}</code></div>
          <div>Hints: {currentPolicy.hintsAllowed ? 'Allowed' : 'Disabled'}</div>
          <div>Remediation: {currentPolicy.remediationAllowed ? 'Allowed' : 'Disabled'}</div>
          <div>Replacement: {currentPolicy.allowReplacement ? 'Allowed' : 'Disabled'}</div>
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 13 }}><input type="checkbox" style={checkboxStyle} checked={demoCalculator} onChange={(event) => setDemoCalculator(event.target.checked)} /> Calculator accommodation</label>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>Language<select value={demoTranslation} onChange={(event) => setDemoTranslation(event.target.value)} style={inputStyle}><option value="en">English</option><option value="es">Español (authored translation)</option></select></label>
    </>
  );

  const studentPreview = (
    <>
      {!currentActivity && <p>No sections are available to preview.</p>}
      {currentActivity && !currentQuestion && !currentActivity.isModelingLab && <p>This section has no questions to preview.</p>}
      {currentActivity?.isModelingLab && <InteractiveModelingLabPlayer rawLabSpec={currentActivity.labDefinition} executionScope="teacherPreview" />}
      {currentQuestion && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid #eee', paddingBottom: 10 }}>
            <div style={{ textAlign: 'left' }}>
              <span style={{ fontSize: 11, background: '#e8f0fe', color: '#1a73e8', padding: '3px 8px', borderRadius: 12, fontWeight: 800 }}>{currentActivity.role.toUpperCase()} MODE</span>
              <h3 style={{ margin: '4px 0 0', fontSize: 17 }}>{currentActivity.title}</h3>
            </div>
            <div style={{ fontSize: 12, color: '#5f6368' }}>Question {demoQuestionIndex + 1} of {questions.length}</div>
          </div>
          <MathMasterToolWrapper
            key={`${currentActivity.id || currentActivity.sectionId}-${currentQuestion.questionId || demoQuestionIndex}-${demoCalculator}-${demoTranslation}`}
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

  const renderCheck = () => (
    <section aria-label="Check">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'check')} />}

      {questionRepairIssues.length > 0 && (
        <div style={{ marginBottom: 18, padding: 14, border: '1px solid #f1a5a0', borderRadius: 10, background: '#fff8f7' }}>
          <strong style={{ color: '#a50e0e' }}>Questions MathMaster can target directly</strong>
          <p style={{ margin: '5px 0 11px', color: '#5f6368', fontSize: 12.5, lineHeight: 1.5 }}>
            Each button builds a repair request for only that question. Other assignment blockers stay untouched.
          </p>
          {!allowQuestionRepair && (
            <div style={{ margin: '0 0 11px', padding: '9px 10px', borderRadius: 8, background: '#fef7e0', border: '1px solid #f0d489', color: '#7a4f00', fontSize: 12.5, lineHeight: 1.5 }}>
              Student records already exist, so question content is locked to preserve historical evidence. Duplicate the assignment to repair or rewrite its questions.
            </div>
          )}
          <div style={{ display: 'grid', gap: 9 }}>
            {questionRepairIssues.map((issue) => (
              <div key={issue.questionIndex} style={{ padding: 11, border: '1px solid #ead1ce', borderRadius: 8, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 420px', minWidth: 0 }}>
                    <strong>Question {issue.questionNumber}</strong>
                    <div style={{ marginTop: 4, color: '#3c4043', fontSize: 12.5, lineHeight: 1.45 }}>
                      {String(issue.question?.prompt || issue.question?.scenario || issue.question?.title || '').replace(/\s+/g, ' ').slice(0, 180) || 'Question content'}
                    </div>
                    <ul style={{ margin: '7px 0 0', paddingLeft: 18, color: '#a50e0e', fontSize: 12, lineHeight: 1.45 }}>
                      {issue.errors.map((message) => <li key={message}>{message}</li>)}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => beginQuestionRepair(issue.questionIndex)}
                    disabled={!allowQuestionRepair}
                    title={!allowQuestionRepair ? 'Duplicate the assignment before rewriting question content because student records already exist.' : 'Build a targeted AI repair request for this question.'}
                    style={{ minHeight: 40, padding: '8px 12px', border: '1px solid #1a73e8', borderRadius: 7, background: '#fff', color: allowQuestionRepair ? '#174ea6' : '#9aa0a6', fontWeight: 800, cursor: allowQuestionRepair ? 'pointer' : 'not-allowed' }}
                  >
                    Repair with AI
                  </button>
                </div>
                {repairTargetIndex === issue.questionIndex && (
                  <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid #eee' }}>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: 12.5 }}>
                      Anything else you want the AI to know? <span style={{ fontWeight: 500, color: '#5f6368' }}>(optional)</span>
                      <textarea
                        value={repairInstruction}
                        onChange={(event) => setRepairInstruction(event.target.value)}
                        placeholder="Example: Keep the graph and same TEKS. The issue is only that an equivalent answer is being rejected."
                        style={{ display: 'block', width: '100%', minHeight: 82, boxSizing: 'border-box', marginTop: 6, padding: 10, border: '1px solid #bdc7d6', borderRadius: 7, fontFamily: 'inherit', fontSize: 14 }}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
                      <button type="button" onClick={copyQuestionRepairRequest} disabled={repairBusy} style={{ minHeight: 40, padding: '8px 12px', border: 0, borderRadius: 7, background: '#1a73e8', color: '#fff', fontWeight: 800 }}>
                        Copy AI Repair Request
                      </button>
                      <button type="button" onClick={pasteQuestionRepairReplacement} disabled={repairBusy} style={{ minHeight: 40, padding: '8px 12px', border: 0, borderRadius: 7, background: '#188038', color: '#fff', fontWeight: 800 }}>
                        {repairBusy ? 'Checking…' : 'Paste AI Replacement'}
                      </button>
                      <button type="button" onClick={() => { setRepairTargetIndex(null); setRepairInstruction(''); setRepairMessage(''); }} disabled={repairBusy} style={{ minHeight: 40, padding: '8px 12px', border: '1px solid #cbd1da', borderRadius: 7, background: '#fff', fontWeight: 800 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {repairMessage && (
        <div role="status" style={{ marginBottom: 14, padding: '10px 12px', border: '1px solid #c6d8f1', borderRadius: 8, background: '#f8fbff', color: '#3c4043', fontSize: 12.5, lineHeight: 1.45 }}>
          {repairMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
        {activities.map((activity) => (
          <div key={activity.id || activity.sectionId} style={{ padding: 11, border: '1px solid #d9e2f1', borderRadius: 8, background: '#fbfdff' }}>
            <strong>{humanRole(activity.role)}</strong>
            <div style={{ fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>
              {activity.isModelingLab ? `DOK ${activity.labDefinition?.dokLevel || 3} modeling lab` : `${activity.questions.length} question${activity.questions.length === 1 ? '' : 's'}`} · {activity.policy.attemptsAllowed} attempt{activity.policy.attemptsAllowed === 1 ? '' : 's'} · {activity.policy.feedbackMode}
            </div>
          </div>
        ))}
      </div>

      {/* The preview mounts a real tool — including a modeling-lab player — so
          it stays unmounted until the teacher asks for it. The old layout got
          this for free by putting it behind a tab; every section is on the page
          at once now, so the gate has to be explicit. */}
      <fieldset style={{ ...fieldsetStyle, marginTop: 0, padding: 0 }}>
        <legend style={legendStyle}>See it as a student</legend>
        <button
          type="button"
          onClick={() => setPreviewOpen((current) => !current)}
          aria-expanded={previewOpen}
          style={{ width: '100%', minHeight: 48, padding: '12px 15px', border: 0, borderBottom: previewOpen ? '1px solid #e0e0e0' : 0, background: '#f8f9fa', fontWeight: 800, textAlign: 'left', cursor: 'pointer', fontSize: 15 }}
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
              style={{ width: '100%', minHeight: 44, padding: '11px 14px', border: 0, borderBottom: '1px solid #e0e0e0', background: '#f8f9fa', fontWeight: 800, textAlign: 'left', cursor: 'pointer' }}
            >
              {showDemoControls ? '▾' : '▸'} Preview controls
            </button>
            {showDemoControls && <div style={{ padding: 14, background: '#f8f9fa', borderBottom: '1px solid #e0e0e0' }}>{demoControls}</div>}
            <div style={{ padding: 14, background: '#fff' }}>{studentPreview}</div>
          </>
        ) : (
          <div style={{ display: 'flex', minHeight: 0 }}>
            <aside style={{ width: 'min(280px, 34vw)', minWidth: 210, borderRight: '1px solid #e0e0e0', padding: 14, background: '#f8f9fa', textAlign: 'left' }}>{demoControls}</aside>
            <main style={{ flex: 1, padding: 16, background: '#fff', minWidth: 0 }}>{studentPreview}</main>
          </div>
        ))}
      </fieldset>

      {!isNarrow && readiness.total > 0 && (
        <div role="alert" style={{ padding: 14, marginTop: 18, background: '#fce8e6', color: '#a50e0e', border: '1px solid #f1a5a0', borderRadius: 8 }}>
          <strong>Fix before creating:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>{readiness.all.map((entry, index) => <li key={`${index}-${entry.message}`}>{entry.message}</li>)}</ul>
        </div>
      )}
    </section>
  );

  const RENDERERS = { details: renderDetails, classes: renderClasses, delivery: renderDelivery, check: renderCheck };

  return (
    <div className="preflight-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.64)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isNarrow ? 0 : 12 }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Lesson pre-flight review"
        style={{
          background: '#fff',
          width: isNarrow ? '100%' : 'min(1180px, 98vw)',
          // Full-bleed on a phone: a rounded card inside a 12px gutter wastes
          // width the review cannot spare.
          height: isNarrow ? '100dvh' : 'min(92dvh, 920px)',
          borderRadius: isNarrow ? 0 : 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#202124',
        }}
      >
        <header style={{ padding: isNarrow ? '12px 14px' : '15px 20px', background: '#1a73e8', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: isNarrow ? 17 : 20 }}>{isUpdateMode ? 'Review assignment setup' : 'Review assignment'}</h3>
            <span style={{ fontSize: 12, opacity: 0.92, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {draft.title || 'Untitled assignment'}{sourceLabel ? ` · ${sourceLabel}` : ''}
            </span>
          </div>
          <button type="button" aria-label="Close pre-flight" onClick={onClose} disabled={busy} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', minHeight: 44, minWidth: 44, flexShrink: 0 }}>✕</button>
        </header>

        {/* The step rail doubles as the blocker summary: a step with an unresolved
            problem carries its count, so a disabled Create button always has a
            visible reason one tap away. */}
        <nav aria-label="Review steps" style={{ display: 'flex', borderBottom: '1px solid #ccc', background: '#f8f9fa' }}>
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
                  background: isActive ? '#fff' : 'transparent',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 13,
                  color: isActive ? '#1a73e8' : '#3c4043',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {isNarrow ? step.label : `${index + 1}. ${step.label}`}
                  {problems > 0 && (
                    <span aria-label={`${problems} to fix`} style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#d93025', color: '#fff', fontSize: 11, fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                      {problems}
                    </span>
                  )}
                </span>
                {!isNarrow && <span style={{ fontSize: 11, fontWeight: 500, color: '#5f6368' }}>{step.hint}</span>}
              </button>
            );
          })}
        </nav>

        <div data-preflight-scroll style={{ padding: isNarrow ? '16px 14px' : '20px', overflowY: 'auto', flex: 1, textAlign: 'left', WebkitOverflowScrolling: 'touch' }}>
          {stepsToRender.map((stepId, index) => (
            <div key={stepId} id={`preflight-step-${stepId}`} style={{ marginTop: !isNarrow && index > 0 ? 30 : 0, scrollMarginTop: 8 }}>
              {!isNarrow && (
                <h4 style={{ margin: '0 0 12px', paddingBottom: 6, borderBottom: '2px solid #e8f0fe', color: '#174ea6' }}>
                  {index + 1}. {PREFLIGHT_STEPS[index]?.label}
                </h4>
              )}
              {RENDERERS[stepId]()}
            </div>
          ))}
        </div>

        <footer style={{ padding: isNarrow ? '10px 14px calc(10px + env(safe-area-inset-bottom))' : '13px 18px', borderTop: '1px solid #ccc', background: '#f8f9fa', display: 'flex', flexDirection: isNarrow ? 'column' : 'row', justifyContent: 'space-between', alignItems: isNarrow ? 'stretch' : 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: readiness.total === 0 ? '#5f6368' : '#a50e0e', textAlign: isNarrow ? 'center' : 'left' }}>
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
          <div style={{ marginTop: 8, color: '#5f6368', fontSize: 12, lineHeight: 1.5, textAlign: isNarrow ? 'center' : 'right' }}>
            {isUpdateMode
              ? 'Updates this assignment after the same MathMaster checks used when it was created. It does not create a second copy.'
              : action.hint}
          </div>

          {isNarrow && !canCreate && !busy && readiness.firstBlockedStep && readiness.firstBlockedStep !== activeStep && (
            <button type="button" onClick={() => goToStep(readiness.firstBlockedStep)} style={{ minHeight: 44, padding: '8px 14px', border: '1px solid #f1a5a0', borderRadius: 8, background: '#fce8e6', color: '#a50e0e', fontWeight: 800 }}>
              Take me to what needs fixing
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};

export default LessonPreflightModal;
