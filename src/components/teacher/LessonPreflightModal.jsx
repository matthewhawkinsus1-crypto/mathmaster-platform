import React, { useEffect, useMemo, useState } from 'react';
import { MathMasterToolWrapper } from '../../platform/ToolWrapper';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies';
import { PUBLICATION_STRATEGIES, planClassroomPublication } from '../../platform/publishing/publicationPlanner';
import { validateLessonBundle } from '../../platform/validation/bundleValidator';
import InteractiveModelingLabPlayer from '../labs/InteractiveModelingLabPlayer.jsx';
import { buildHonorsEnrichmentQuestion, inspectHonorsRigor, splitClassPeriodsByRigor } from '../../platform/rigor/courseRigor.js';
import RepresentationAudit from './RepresentationAudit';
import {
  PREFLIGHT_STEPS, blockersForStep, collectReviewBlockers,
  stepIndex, summarizePreflightReadiness,
} from './preflightSteps';

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
  const { assignedClassPeriods, ...rest } = draft;
  return {
    title: '',
    folder: '',
    dueAt: '',
    lateDueAt: '',
    releaseAt: '',
    assignmentType: 'practice',
    variantMode: 'shared',
    dolEnabled: false,
    dolMinutesBeforeEnd: 10,
    dolQuestionIndex: null,
    publicationStrategy: PUBLICATION_STRATEGIES.HYBRID,
    includeWarmupInClassroom: false,
    homeworkDueAt: '',
    ...rest,
    assignedClassPeriods: Array.isArray(assignedClassPeriods) ? [...assignedClassPeriods] : [],
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
  lessonBundle,
  publicationPlan: suppliedPublicationPlan = null,
  initialDraft = {},
  classPeriods = [],
  courseProfiles = {},
  sourceLabel = '',
  sourceQuestions = [],
  authoringWarnings = [],
  onClose,
  onConfirmPublish,
  busy = false,
}) => {
  const activities = Array.isArray(lessonBundle?.activities) ? lessonBundle.activities : [];
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

  const effectiveBundle = useMemo(() => ({
    ...lessonBundle,
    lessonMetadata: {
      ...lessonBundle?.lessonMetadata,
      title: draft.title || lessonBundle?.lessonMetadata?.title || 'Untitled Lesson',
    },
  }), [lessonBundle, draft.title]);

  const validationReport = useMemo(() => validateLessonBundle(effectiveBundle), [effectiveBundle]);
  const validationErrors = useMemo(() => [
    ...(validationReport.criticalErrors || []),
    ...(validationReport.activityReports || []).flatMap((activity) => (
      (activity.errors || []).map((error) => `${activity.title || activity.role || 'Activity'}: ${error}`)
    )),
  ], [validationReport]);

  const computedPublicationPlan = useMemo(() => planClassroomPublication({
    lessonBundle: effectiveBundle,
    strategy: draft.publicationStrategy || PUBLICATION_STRATEGIES.HYBRID,
    mainDueDate: draft.dueAt || null,
    homeworkDueDate: draft.homeworkDueAt || null,
    includeWarmupInClassroom: draft.includeWarmupInClassroom === true,
  }), [effectiveBundle, draft.publicationStrategy, draft.dueAt, draft.homeworkDueAt, draft.includeWarmupInClassroom]);

  const publicationPlan = suppliedPublicationPlan && !initialDraft.publicationStrategy
    ? suppliedPublicationPlan
    : computedPublicationPlan;
  const posts = Array.isArray(publicationPlan?.plannedPosts) ? publicationPlan.plannedPosts : [];
  const currentActivity = activities[demoActivityIndex] || null;
  const questions = Array.isArray(currentActivity?.questions) ? currentActivity.questions : [];
  const currentQuestion = questions[demoQuestionIndex] || null;
  const currentPolicy = currentActivity ? getEffectiveActivityPolicy(currentActivity.role) : null;

  const rigorDestinations = useMemo(
    () => splitClassPeriodsByRigor(draft.assignedClassPeriods, courseProfiles),
    [draft.assignedClassPeriods, courseProfiles],
  );
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
    bundleIsValid: validationReport.isValid,
  }), [draft, classPeriods, honorsSelected, honorsReport, validationErrors, validationReport.isValid]);

  useEffect(() => {
    if (demoActivityIndex >= activities.length) setDemoActivityIndex(Math.max(0, activities.length - 1));
  }, [activities.length, demoActivityIndex]);

  useEffect(() => {
    if (demoQuestionIndex >= questions.length) setDemoQuestionIndex(Math.max(0, questions.length - 1));
  }, [questions.length, demoQuestionIndex]);

  if (!lessonBundle) return null;

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const toggleClassPeriod = (period) => setDraft((current) => ({
    ...current,
    assignedClassPeriods: current.assignedClassPeriods.includes(period)
      ? current.assignedClassPeriods.filter((item) => item !== period)
      : [...current.assignedClassPeriods, period],
  }));

  const canCreate = readiness.canCreate && !busy;
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
      <RepresentationAudit questions={sourceQuestions} warnings={authoringWarnings} />

      <div style={{ padding: '12px 14px', marginBottom: 16, background: '#e8f0fe', color: '#174ea6', border: '1px solid #aecbfa', borderRadius: 9, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Nothing is published from JSON automatically.</strong> The values on these screens override the file when you create the assignment.
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
        <legend style={legendStyle}>Assign to MathMaster class periods</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 11 }}>
          <button type="button" onClick={() => setField('assignedClassPeriods', [...classPeriods])} style={{ minHeight: 44, padding: '7px 13px' }}>Select all</button>
          <button type="button" onClick={() => setField('assignedClassPeriods', [])} style={{ minHeight: 44, padding: '7px 13px' }}>Clear</button>
          <span style={{ alignSelf: 'center', color: '#5f6368', fontSize: 12 }}>{draft.assignedClassPeriods.length} selected</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {classPeriods.map((period) => (
            <label key={period} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 14px', background: draft.assignedClassPeriods.includes(period) ? '#e8f0fe' : '#fff', border: '1px solid #c5d5ef', borderRadius: 999, fontWeight: 800, cursor: 'pointer' }}>
              <input type="checkbox" style={checkboxStyle} checked={draft.assignedClassPeriods.includes(period)} onChange={() => toggleClassPeriod(period)} /> {period}
            </label>
          ))}
        </div>
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
          ['coreTeks', 'Core TEKS'], ['higherOrderReasoning', 'Higher-order reasoning'], ['multipleRepresentations', 'Multiple representations'], ['justification', 'Explanation / justification'], ['modelingApplication', 'Modeling / application'], ['ccmrEnrichment', 'CCMR enrichment'],
        ].map(([key, label]) => <div key={key} style={{ padding: '8px 10px', borderRadius: 8, background: honorsReport.checks[key] ? '#e6f4ea' : '#fff4ce', color: honorsReport.checks[key] ? '#137333' : '#7a4f00', fontWeight: 800, fontSize: 12 }}>{honorsReport.checks[key] ? '✓' : '!'} {label}</div>)}</div>}
        {honorsSelected && !honorsReport.isNarrowCheckpoint && !honorsReport.isHonorsReady && <button type="button" onClick={() => {
          const firstHonorsPeriod = rigorDestinations.honors[0];
          setHonorsEnrichmentQuestion(buildHonorsEnrichmentQuestion({ questions: sourceRigorQuestions, course: courseProfiles?.[firstHonorsPeriod]?.course || 'algebra1' }));
        }} style={{ marginTop: 12, minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: '#6f2da8', color: '#fff', fontWeight: 900 }}>Build Honors Enrichment</button>}
        {honorsEnrichmentQuestion && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#e6f4ea', color: '#137333', fontSize: 12 }}><strong>MathMaster enrichment addendum prepared.</strong> It will be added only to the Honors destination variant after teacher confirmation.</div>}
        {honorsSelected && honorsReport.isHonorsReady && !honorsReport.isNarrowCheckpoint && !honorsEnrichmentQuestion && <div style={{ marginTop: 10, color: '#137333', fontWeight: 800, fontSize: 12 }}>✓ Source assignment already satisfies the Honors contract; MathMaster will not rewrite it.</div>}
      </fieldset>
    </section>
  );

  const renderDelivery = () => (
    <section aria-label="Delivery">
      {isNarrow && <StepBlockers blockers={blockersForStep(readiness, 'delivery')} />}

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label style={labelStyle}>Assignment type<select value={draft.assignmentType} onChange={(event) => setField('assignmentType', event.target.value)} style={inputStyle}><option value="practice">Practice / Homework</option><option value="notesClasswork">Guided Notes / Classwork</option></select></label>
        <label style={labelStyle}>Problem versions<select value={draft.variantMode} onChange={(event) => setField('variantMode', event.target.value)} style={inputStyle}><option value="shared">Shared exact version</option><option value="personalized">Different stable version per student</option></select></label>
      </div>

      {draft.assignmentType === 'practice' && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>DOL settings</legend>
          <label style={{ ...labelStyle, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={checkboxStyle} checked={draft.dolEnabled === true} onChange={(event) => setField('dolEnabled', event.target.checked)} /> Enable the DOL window</label>
          {draft.dolEnabled && <label style={{ ...labelStyle, marginTop: 10 }}>Minutes before class ends<input type="number" min="1" max="30" value={draft.dolMinutesBeforeEnd || 10} onChange={(event) => setField('dolMinutesBeforeEnd', event.target.value)} style={{ ...inputStyle, width: 120 }} /></label>}
        </fieldset>
      )}

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Publication plan</legend>
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label style={labelStyle}>Strategy<select value={draft.publicationStrategy} onChange={(event) => setField('publicationStrategy', event.target.value)} style={inputStyle}><option value="hybrid">Hybrid</option><option value="bundle">Bundle</option><option value="split">Split by activity</option></select></label>
          <label style={labelStyle}>Separate homework due date (optional)<input type="datetime-local" value={draft.homeworkDueAt || ''} onChange={(event) => setField('homeworkDueAt', event.target.value)} style={inputStyle} /></label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 8, fontWeight: 800 }}><input type="checkbox" style={checkboxStyle} checked={draft.includeWarmupInClassroom === true} onChange={(event) => setField('includeWarmupInClassroom', event.target.checked)} /> Include Warm-Up as a Classroom post</label>
        <div style={{ marginTop: 8, color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>{publicationPlan.summary} {publicationPlan.omittedWarmupCount ? `${publicationPlan.omittedWarmupCount} Warm-Up activity omitted by default.` : ''}</div>
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
              <div style={{ fontSize: 12, padding: '9px 11px', background: '#f8f9fa', borderRadius: 7 }}><strong>Activities:</strong> {post.activities.map((activity) => `${activity.title} (${activity.role})`).join(' + ')}</div>
            </article>
          ))}
        </div>
      </details>
    </section>
  );

  const demoControls = (
    <>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Activity stage</label>
      <select value={demoActivityIndex} onChange={(event) => { setDemoActivityIndex(Number(event.target.value)); setDemoQuestionIndex(0); }} style={{ ...inputStyle, marginBottom: 14 }}>
        {activities.map((activity, index) => <option key={activity.activityId} value={index}>{activity.title} ({activity.role.toUpperCase()})</option>)}
      </select>
      {currentPolicy && (
        <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e0e0e0', marginBottom: 14, fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: '#1a73e8' }}>Enforced activity policy</strong>
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
      {!currentActivity && <p>No activities are available to preview.</p>}
      {currentActivity && !currentQuestion && !currentActivity.isModelingLab && <p>This activity has no questions to preview.</p>}
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
            key={`${currentActivity.activityId}-${currentQuestion.questionId}-${demoCalculator}-${demoTranslation}`}
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

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
        {activities.map((activity) => (
          <div key={activity.activityId} style={{ padding: 11, border: '1px solid #d9e2f1', borderRadius: 8, background: '#fbfdff' }}>
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
            <h3 style={{ margin: 0, fontSize: isNarrow ? 17 : 20 }}>Review before posting</h3>
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
              ? 'Ready to create. Your review overrides the JSON metadata.'
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
              <button type="button" onClick={onClose} disabled={busy} style={{ minHeight: 44, padding: '9px 16px' }}>Back to JSON</button>
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
                  onConfirmPublish?.({ draft: { ...draft, honorsEnrichmentQuestion }, publicationPlan, lessonBundle: effectiveBundle, honorsReport });
                }}
                style={{ flex: isNarrow ? 2 : undefined, minHeight: isNarrow ? 48 : 44, padding: '10px 20px', border: 'none', borderRadius: 8, background: canCreate ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 800 }}
              >
                {busy ? 'Creating…' : isNarrow ? 'Create' : 'Apply Review & Create Assignment'}
              </button>
            )}
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
