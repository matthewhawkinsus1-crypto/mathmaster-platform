import React, { useEffect, useMemo, useState } from 'react';
import { MathMasterToolWrapper } from '../../platform/ToolWrapper';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies';
import { PUBLICATION_STRATEGIES, planClassroomPublication } from '../../platform/publishing/publicationPlanner';
import { validateLessonBundle } from '../../platform/validation/bundleValidator';
import InteractiveModelingLabPlayer from '../labs/InteractiveModelingLabPlayer.jsx';
import { buildHonorsEnrichmentQuestion, inspectHonorsRigor, splitClassPeriodsByRigor } from '../../platform/rigor/courseRigor.js';

const tabButtonStyle = (active) => ({
  padding: '14px 18px',
  border: 'none',
  background: active ? '#fff' : 'transparent',
  borderBottom: active ? '3px solid #1a73e8' : '3px solid transparent',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '10px',
  border: '1px solid #c9ced6',
  borderRadius: 7,
  boxSizing: 'border-box',
  background: '#fff',
  color: '#202124',
};

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

export const LessonPreflightModal = ({
  lessonBundle,
  publicationPlan: suppliedPublicationPlan = null,
  initialDraft = {},
  classPeriods = [],
  courseProfiles = {},
  sourceLabel = '',
  onClose,
  onConfirmPublish,
  busy = false,
}) => {
  const activities = Array.isArray(lessonBundle?.activities) ? lessonBundle.activities : [];
  const [draft, setDraft] = useState(() => initialReviewDraft(initialDraft));
  const [activeTab, setActiveTab] = useState('assignment');
  const [demoActivityIndex, setDemoActivityIndex] = useState(0);
  const [demoQuestionIndex, setDemoQuestionIndex] = useState(0);
  const [demoTranslation, setDemoTranslation] = useState('en');
  const [demoCalculator, setDemoCalculator] = useState(false);
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

  const reviewErrors = useMemo(() => {
    const errors = [];
    if (!String(draft.title || '').trim()) errors.push('Assignment title is required.');
    if (!draft.dueAt) errors.push('A regular due date is required.');
    if (!draft.lateDueAt) errors.push('A final late due date is required.');
    if (draft.dueAt && draft.lateDueAt) {
      const due = new Date(draft.dueAt).getTime();
      const late = new Date(draft.lateDueAt).getTime();
      if (!Number.isFinite(due) || !Number.isFinite(late) || late <= due) errors.push('Final late due date must be later than the regular due date.');
    }
    if (classPeriods.length && draft.assignedClassPeriods.length === 0) errors.push('Select at least one class period.');
    if (honorsSelected && !honorsReport.isHonorsReady) errors.push('Honors destination needs the missing rigor/CCMR elements shown below before creation.');
    return errors;
  }, [draft, classPeriods.length, honorsSelected, honorsReport.isHonorsReady]);

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
  const canCreate = validationReport.isValid && reviewErrors.length === 0 && !busy;

  return (
    <div className="preflight-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.64)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px' }}>
      <section role="dialog" aria-modal="true" aria-label="Lesson pre-flight review" style={{ background: '#fff', width: 'min(1180px, 98vw)', height: 'min(92dvh, 920px)', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: '#202124' }}>
        <header style={{ padding: '15px 20px', background: '#1a73e8', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ margin: 0 }}>JSON Pre-Flight Review</h3>
            <span style={{ fontSize: '13px', opacity: 0.92 }}>Teacher review is final — JSON values are editable before creation.{sourceLabel ? ` · ${sourceLabel}` : ''}</span>
          </div>
          <button type="button" aria-label="Close pre-flight" onClick={onClose} disabled={busy} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </header>

        <nav aria-label="Pre-flight tabs" style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid #ccc', background: '#f8f9fa' }}>
          <button type="button" onClick={() => setActiveTab('assignment')} style={tabButtonStyle(activeTab === 'assignment')}>✏️ Assignment & Classes</button>
          <button type="button" onClick={() => setActiveTab('classroom')} style={tabButtonStyle(activeTab === 'classroom')}>📋 Publication Preview</button>
          <button type="button" onClick={() => setActiveTab('studentDemo')} style={tabButtonStyle(activeTab === 'studentDemo')}>🎮 Student Experience</button>
        </nav>

        {activeTab === 'assignment' && (
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1, textAlign: 'left' }}>
            <div style={{ padding: '12px 14px', marginBottom: 16, background: '#e8f0fe', color: '#174ea6', border: '1px solid #aecbfa', borderRadius: 9, fontSize: 13 }}>
              <strong>Nothing is published from JSON automatically.</strong> Review and change these settings now. The values on this screen override the file when you create the assignment.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <label style={{ fontWeight: 800 }}>Assignment title<input value={draft.title} onChange={(event) => setField('title', event.target.value)} style={inputStyle} /></label>
              <label style={{ fontWeight: 800 }}>Library folder<input value={draft.folder || ''} onChange={(event) => setField('folder', event.target.value)} placeholder="Algebra I/Module 1/Topic 1" style={inputStyle} /></label>
              <label style={{ fontWeight: 800 }}>Regular due date<input type="datetime-local" value={draft.dueAt || ''} onChange={(event) => setField('dueAt', event.target.value)} style={inputStyle} /></label>
              <label style={{ fontWeight: 800 }}>Final late due date<input type="datetime-local" value={draft.lateDueAt || ''} onChange={(event) => setField('lateDueAt', event.target.value)} style={inputStyle} /></label>
              <label style={{ fontWeight: 800 }}>Automatic release (optional)<input type="datetime-local" value={draft.releaseAt || ''} onChange={(event) => setField('releaseAt', event.target.value)} style={inputStyle} /></label>
              <label style={{ fontWeight: 800 }}>Assignment type<select value={draft.assignmentType} onChange={(event) => setField('assignmentType', event.target.value)} style={inputStyle}><option value="practice">Practice / Homework</option><option value="notesClasswork">Guided Notes / Classwork</option></select></label>
              <label style={{ fontWeight: 800 }}>Problem versions<select value={draft.variantMode} onChange={(event) => setField('variantMode', event.target.value)} style={inputStyle}><option value="shared">Shared exact version</option><option value="personalized">Different stable version per student</option></select></label>
            </div>

            <fieldset style={{ marginTop: 18, padding: 15, border: '1px solid #d8dde6', borderRadius: 10 }}>
              <legend style={{ fontWeight: 900 }}>Assign to MathMaster class periods</legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 11 }}>
                <button type="button" onClick={() => setField('assignedClassPeriods', [...classPeriods])} style={{ padding: '7px 11px' }}>Select all</button>
                <button type="button" onClick={() => setField('assignedClassPeriods', [])} style={{ padding: '7px 11px' }}>Clear</button>
                <span style={{ alignSelf: 'center', color: '#5f6368', fontSize: 12 }}>{draft.assignedClassPeriods.length} selected</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {classPeriods.map((period) => (
                  <label key={period} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 12px', background: draft.assignedClassPeriods.includes(period) ? '#e8f0fe' : '#fff', border: '1px solid #c5d5ef', borderRadius: 999, fontWeight: 800, cursor: 'pointer' }}>
                    <input type="checkbox" checked={draft.assignedClassPeriods.includes(period)} onChange={() => toggleClassPeriod(period)} /> {period}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset style={{ marginTop: 18, padding: 15, border: `1px solid ${honorsSelected ? '#c7a9ea' : '#d8dde6'}`, borderRadius: 10, background: honorsSelected ? '#fcf9ff' : '#fff' }}>
              <legend style={{ fontWeight: 900 }}>Course rigor destinations</legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><span style={{ padding: '4px 9px', borderRadius: 999, background: '#f1f3f4', fontSize: 11, fontWeight: 900 }}>STANDARD: {rigorDestinations.standard.join(', ') || 'none'}</span><span style={{ padding: '4px 9px', borderRadius: 999, background: '#efe4ff', color: '#6f2da8', fontSize: 11, fontWeight: 900 }}>HONORS: {rigorDestinations.honors.join(', ') || 'none'}</span></div>
              <p style={{ color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>{honorsSelected ? 'Honors periods are validated from the saved class designation. When Standard and Honors destinations are selected together, MathMaster creates destination variants from this one source assignment.' : 'No selected class is designated Honors. Standard validation applies.'}</p>
              {honorsSelected && honorsReport.isNarrowCheckpoint && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#e8f0fe', color: '#174ea6', fontSize: 12, lineHeight: 1.5 }}><strong>Narrow Honors checkpoint.</strong> Warm-Ups and DOLs with three or fewer items may stay focused on the current TEKS. Depth, prerequisite repair, and CCMR are balanced across the recent Honors sequence instead of forced into every short check.</div>}
              {honorsSelected && !honorsReport.isNarrowCheckpoint && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 7 }}>{[
                ['coreTeks', 'Core TEKS'], ['higherOrderReasoning', 'Higher-order reasoning'], ['multipleRepresentations', 'Multiple representations'], ['justification', 'Explanation / justification'], ['modelingApplication', 'Modeling / application'], ['ccmrEnrichment', 'CCMR enrichment'],
              ].map(([key, label]) => <div key={key} style={{ padding: '8px 10px', borderRadius: 8, background: honorsReport.checks[key] ? '#e6f4ea' : '#fff4ce', color: honorsReport.checks[key] ? '#137333' : '#7a4f00', fontWeight: 800, fontSize: 12 }}>{honorsReport.checks[key] ? '✓' : '!' } {label}</div>)}</div>}
              {honorsSelected && !honorsReport.isNarrowCheckpoint && !honorsReport.isHonorsReady && <button type="button" onClick={() => {
                const firstHonorsPeriod = rigorDestinations.honors[0];
                setHonorsEnrichmentQuestion(buildHonorsEnrichmentQuestion({ questions: sourceRigorQuestions, course: courseProfiles?.[firstHonorsPeriod]?.course || 'algebra1' }));
              }} style={{ marginTop: 12, padding: '9px 13px', border: 0, borderRadius: 8, background: '#6f2da8', color: '#fff', fontWeight: 900 }}>Build Honors Enrichment</button>}
              {honorsEnrichmentQuestion && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#e6f4ea', color: '#137333', fontSize: 12 }}><strong>MathMaster enrichment addendum prepared.</strong> It will be added only to the Honors destination variant after teacher confirmation.</div>}
              {honorsSelected && honorsReport.isHonorsReady && !honorsReport.isNarrowCheckpoint && !honorsEnrichmentQuestion && <div style={{ marginTop: 10, color: '#137333', fontWeight: 800, fontSize: 12 }}>✓ Source assignment already satisfies the Honors contract; MathMaster will not rewrite it.</div>}
            </fieldset>

            {draft.assignmentType === 'practice' && (
              <fieldset style={{ marginTop: 18, padding: 15, border: '1px solid #d8dde6', borderRadius: 10 }}>
                <legend style={{ fontWeight: 900 }}>DOL settings</legend>
                <label style={{ fontWeight: 800 }}><input type="checkbox" checked={draft.dolEnabled === true} onChange={(event) => setField('dolEnabled', event.target.checked)} /> Enable the DOL window</label>
                {draft.dolEnabled && <label style={{ display: 'block', marginTop: 10, fontWeight: 800 }}>Minutes before class ends<input type="number" min="1" max="30" value={draft.dolMinutesBeforeEnd || 10} onChange={(event) => setField('dolMinutesBeforeEnd', event.target.value)} style={{ ...inputStyle, width: 110 }} /></label>}
              </fieldset>
            )}

            <fieldset style={{ marginTop: 18, padding: 15, border: '1px solid #d8dde6', borderRadius: 10 }}>
              <legend style={{ fontWeight: 900 }}>Publication plan</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <label style={{ fontWeight: 800 }}>Strategy<select value={draft.publicationStrategy} onChange={(event) => setField('publicationStrategy', event.target.value)} style={inputStyle}><option value="hybrid">Hybrid</option><option value="bundle">Bundle</option><option value="split">Split by activity</option></select></label>
                <label style={{ fontWeight: 800 }}>Separate homework due date (optional)<input type="datetime-local" value={draft.homeworkDueAt || ''} onChange={(event) => setField('homeworkDueAt', event.target.value)} style={inputStyle} /></label>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 8, fontWeight: 800 }}><input type="checkbox" checked={draft.includeWarmupInClassroom === true} onChange={(event) => setField('includeWarmupInClassroom', event.target.checked)} /> Include Warm-Up as a Classroom post</label>
              <div style={{ marginTop: 8, color: '#5f6368', fontSize: 12 }}>{publicationPlan.summary} {publicationPlan.omittedWarmupCount ? `${publicationPlan.omittedWarmupCount} Warm-Up activity omitted by default.` : ''}</div>
            </fieldset>

            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {activities.map((activity) => <div key={activity.activityId} style={{ padding: 10, border: '1px solid #d9e2f1', borderRadius: 8, background: '#fbfdff' }}><strong>{humanRole(activity.role)}</strong><div style={{ fontSize: 12, color: '#5f6368' }}>{activity.isModelingLab ? `DOK ${activity.labDefinition?.dokLevel || 3} modeling lab` : `${activity.questions.length} question${activity.questions.length === 1 ? '' : 's'}`} · {activity.policy.attemptsAllowed} attempt{activity.policy.attemptsAllowed === 1 ? '' : 's'} · {activity.policy.feedbackMode}</div></div>)}
            </div>

            {(reviewErrors.length > 0 || !validationReport.isValid) && (
              <div role="alert" style={{ padding: 14, marginTop: 18, background: '#fce8e6', color: '#a50e0e', border: '1px solid #f1a5a0', borderRadius: 8 }}>
                <strong>Fix before creating:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>{[...reviewErrors, ...validationErrors].map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'classroom' && (
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1, textAlign: 'left' }}>
            <h4 style={{ marginTop: 0 }}>Publication simulation ({posts.length} {posts.length === 1 ? 'post' : 'posts'})</h4>
            <p style={{ color: '#5f6368', marginBottom: 16, lineHeight: 1.5 }}>This is the Phase 3 activity publication plan generated from the reviewed settings. Class-period targeting comes from the Assignment &amp; Classes tab.</p>
            {!validationReport.isValid && <div role="alert" style={{ padding: 14, marginBottom: 16, background: '#fce8e6', color: '#a50e0e', borderRadius: 8 }}>Deep Bundle V3 validation is blocking creation. Return to Assignment &amp; Classes to review the errors.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {posts.map((post) => (
                <article key={post.postId} style={{ border: '1px solid #dadce0', borderRadius: 9, padding: 15, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 8 }}><div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a73e8', color: '#fff', display: 'grid', placeItems: 'center' }}>📋</div><div><strong>{post.title}</strong><div style={{ fontSize: 12, color: '#5f6368' }}>Due {post.dueDate || 'not set'} · {post.maxPoints} pts · {post.gradingMode}</div></div></div>
                  <p style={{ color: '#3c4043', margin: '8px 0 10px' }}>{post.description}</p>
                  <div style={{ fontSize: 12, padding: '9px 11px', background: '#f8f9fa', borderRadius: 7 }}><strong>Activities:</strong> {post.activities.map((activity) => `${activity.title} (${activity.role})`).join(' + ')}</div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'studentDemo' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <aside style={{ width: 'min(280px, 34vw)', minWidth: 210, borderRight: '1px solid #ccc', padding: 14, background: '#f8f9fa', overflowY: 'auto', textAlign: 'left' }}>
              <h5 style={{ margin: '0 0 12px', color: '#5f6368' }}>SANDBOX CONTROLS</h5>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Activity stage</label>
              <select value={demoActivityIndex} onChange={(event) => { setDemoActivityIndex(Number(event.target.value)); setDemoQuestionIndex(0); }} style={{ ...inputStyle, marginBottom: 16 }}>
                {activities.map((activity, index) => <option key={activity.activityId} value={index}>{activity.title} ({activity.role.toUpperCase()})</option>)}
              </select>
              {currentPolicy && <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e0e0e0', marginBottom: 16, fontSize: 12, lineHeight: 1.55 }}><strong style={{ color: '#1a73e8' }}>Enforced activity policy</strong><div>Attempts: {currentPolicy.attempts}</div><div>Feedback: <code>{currentPolicy.feedback}</code></div><div>Hints: {currentPolicy.hintsAllowed ? 'Allowed' : 'Disabled'}</div><div>Remediation: {currentPolicy.remediationAllowed ? 'Allowed' : 'Disabled'}</div><div>Replacement: {currentPolicy.allowReplacement ? 'Allowed' : 'Disabled'}</div></div>}
              <h5 style={{ margin: '16px 0 8px', color: '#5f6368' }}>SIMULATE SUPPORTS</h5>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 10 }}><input type="checkbox" checked={demoCalculator} onChange={(event) => setDemoCalculator(event.target.checked)} /> Calculator accommodation</label>
              <label style={{ display: 'block', fontSize: 12 }}>Language<select value={demoTranslation} onChange={(event) => setDemoTranslation(event.target.value)} style={{ ...inputStyle, marginTop: 5 }}><option value="en">English</option><option value="es">Español (authored translation)</option></select></label>
            </aside>

            <main style={{ flex: 1, padding: 16, overflowY: 'auto', background: '#fff', minWidth: 0 }}>
              {!currentActivity && <p>No activities are available to preview.</p>}
              {currentActivity && !currentQuestion && !currentActivity.isModelingLab && <p>This activity has no questions to preview.</p>}
              {currentActivity?.isModelingLab && <InteractiveModelingLabPlayer rawLabSpec={currentActivity.labDefinition} executionScope="teacherPreview" />}
              {currentQuestion && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, borderBottom: '1px solid #eee', paddingBottom: 10 }}><div style={{ textAlign: 'left' }}><span style={{ fontSize: 11, background: '#e8f0fe', color: '#1a73e8', padding: '3px 8px', borderRadius: 12, fontWeight: 800 }}>{currentActivity.role.toUpperCase()} MODE</span><h3 style={{ margin: '4px 0 0' }}>{currentActivity.title}</h3></div><div style={{ fontSize: 12, color: '#5f6368' }}>Question {demoQuestionIndex + 1} of {questions.length}</div></div>
                  <MathMasterToolWrapper key={`${currentActivity.activityId}-${currentQuestion.questionId}-${demoCalculator}-${demoTranslation}`} activityRole={currentActivity.role} question={currentQuestion} student={{ id: 'teacher_preview_user', supportProfile: { accommodations: demoCalculator ? ['calculator'] : [], modifications: [], translationLanguage: demoTranslation } }} executionScope="teacherPreview" />
                  <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 8 }}><button type="button" disabled={demoQuestionIndex === 0} onClick={() => setDemoQuestionIndex((value) => value - 1)} style={{ minHeight: 44, padding: '8px 14px' }}>Previous</button><button type="button" disabled={demoQuestionIndex >= questions.length - 1} onClick={() => setDemoQuestionIndex((value) => value + 1)} style={{ minHeight: 44, padding: '8px 14px' }}>Next</button></div>
                </>
              )}
            </main>
          </div>
        )}

        <footer style={{ padding: '13px 18px', borderTop: '1px solid #ccc', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: canCreate ? '#5f6368' : '#a50e0e' }}>{canCreate ? 'Student preview is isolated; teacher review settings will override JSON metadata.' : 'Creation is blocked until review and validation errors are resolved.'}</span>
          <div style={{ display: 'flex', gap: 10 }}><button type="button" onClick={onClose} disabled={busy} style={{ minHeight: 44, padding: '9px 16px' }}>Back to JSON</button><button type="button" disabled={!canCreate} onClick={() => onConfirmPublish?.({ draft: { ...draft, honorsEnrichmentQuestion }, publicationPlan, lessonBundle: effectiveBundle, honorsReport })} style={{ minHeight: 44, padding: '9px 20px', border: 'none', borderRadius: 7, background: canCreate ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 800 }}>{busy ? 'Creating…' : 'Apply Review & Create Assignment'}</button></div>
        </footer>
      </section>
    </div>
  );
};

export default LessonPreflightModal;
