import React, { useEffect, useMemo, useState } from 'react';
import { MathMasterToolWrapper } from '../../platform/ToolWrapper';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies';
import { validateLessonBundle } from '../../platform/validation/bundleValidator';

const tabButtonStyle = (active) => ({
  padding: '14px 24px',
  border: 'none',
  background: active ? '#fff' : 'transparent',
  borderBottom: active ? '3px solid #1a73e8' : '3px solid transparent',
  fontWeight: 700,
  cursor: 'pointer',
});

export const LessonPreflightModal = ({ lessonBundle, publicationPlan, onClose, onConfirmPublish }) => {
  const activities = Array.isArray(lessonBundle?.activities) ? lessonBundle.activities : [];
  const posts = Array.isArray(publicationPlan?.plannedPosts) ? publicationPlan.plannedPosts : [];
  const [activeTab, setActiveTab] = useState('classroom');
  const [demoActivityIndex, setDemoActivityIndex] = useState(0);
  const [demoQuestionIndex, setDemoQuestionIndex] = useState(0);
  const [demoTranslation, setDemoTranslation] = useState('en');
  const [demoCalculator, setDemoCalculator] = useState(false);
  const currentActivity = activities[demoActivityIndex] || null;
  const questions = Array.isArray(currentActivity?.questions) ? currentActivity.questions : [];
  const currentQuestion = questions[demoQuestionIndex] || null;
  const currentPolicy = currentActivity ? getEffectiveActivityPolicy(currentActivity.role) : null;
  const validationReport = useMemo(() => validateLessonBundle(lessonBundle), [lessonBundle]);
  const validationErrors = useMemo(() => [
    ...(validationReport.criticalErrors || []),
    ...(validationReport.activityReports || []).flatMap((activity) => (
      (activity.errors || []).map((error) => `${activity.title || activity.role || 'Activity'}: ${error}`)
    )),
  ], [validationReport]);

  useEffect(() => {
    if (demoActivityIndex >= activities.length) setDemoActivityIndex(Math.max(0, activities.length - 1));
  }, [activities.length, demoActivityIndex]);

  useEffect(() => {
    if (demoQuestionIndex >= questions.length) setDemoQuestionIndex(Math.max(0, questions.length - 1));
  }, [questions.length, demoQuestionIndex]);

  if (!lessonBundle) return null;

  return (
    <div className="preflight-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
      <section role="dialog" aria-modal="true" aria-label="Lesson pre-flight review" style={{ background: '#fff', width: 'min(1100px, 96vw)', height: 'min(85vh, 880px)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ padding: '16px 24px', background: '#1a73e8', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ margin: 0 }}>Pre-Flight Review & Demo Sandbox</h3><span style={{ fontSize: '13px', opacity: 0.9 }}>{lessonBundle.lessonMetadata?.title || 'Untitled Lesson'}</span></div>
          <button type="button" aria-label="Close pre-flight" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </header>

        <nav style={{ display: 'flex', borderBottom: '1px solid #ccc', background: '#f8f9fa' }}>
          <button type="button" onClick={() => setActiveTab('classroom')} style={tabButtonStyle(activeTab === 'classroom')}>📋 Google Classroom Feed Preview</button>
          <button type="button" onClick={() => setActiveTab('studentDemo')} style={tabButtonStyle(activeTab === 'studentDemo')}>🎮 Interactive Student Experience Demo</button>
        </nav>

        {activeTab === 'classroom' && (
          <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
            <h4>Classroom Stream Simulation ({posts.length} {posts.length === 1 ? 'Post' : 'Posts'})</h4>
            {!validationReport.isValid && (
              <div role="alert" style={{ padding: '16px', marginBottom: '16px', background: '#fce8e6', color: '#a50e0e', border: '1px solid #f1a5a0', borderRadius: '8px', textAlign: 'left' }}>
                <strong>Pre-flight blocked: fix these bundle problems before publishing.</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            )}
            {validationReport.isValid && validationReport.warnings?.length > 0 && (
              <div style={{ padding: '12px 14px', marginBottom: '16px', background: '#fff8e1', color: '#6b5200', border: '1px solid #f0c761', borderRadius: '8px', textAlign: 'left', fontSize: '13px' }}>
                <strong>Pre-flight warnings:</strong> {validationReport.warnings.join(' ')}
              </div>
            )}
            {!posts.length && <div style={{ padding: '16px', background: '#fce8e6', color: '#a50e0e', borderRadius: '8px' }}>No Classroom posts are currently planned. Return to editing before publishing.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {posts.map((post) => (
                <article key={post.postId} style={{ border: '1px solid #dadce0', borderRadius: '8px', padding: '16px', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a73e8', color: '#fff', display: 'grid', placeItems: 'center' }}>📋</div>
                    <div><strong style={{ fontSize: '16px' }}>{post.title}</strong><div style={{ fontSize: '12px', color: '#5f6368' }}>Due {post.dueDate || 'not set'} · {post.maxPoints} pts</div></div>
                  </div>
                  <p style={{ fontSize: '14px', color: '#3c4043', margin: '8px 0 12px' }}>{post.description}</p>
                  <div style={{ border: '1px solid #dadce0', borderRadius: '6px', padding: '10px 14px', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>🔗 MathMaster Interactive Lesson Link</span>
                    <span style={{ fontSize: '11px', background: '#e8f0fe', color: '#1a73e8', padding: '4px 8px', borderRadius: '4px' }}>{post.activities.map((activity) => activity.title).join(' + ')}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'studentDemo' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <aside style={{ width: '280px', borderRight: '1px solid #ccc', padding: '16px', background: '#f8f9fa', overflowY: 'auto' }}>
              <h5 style={{ margin: '0 0 12px', color: '#5f6368' }}>SANDBOX CONTROLS</h5>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>Activity stage</label>
              <select value={demoActivityIndex} onChange={(event) => { setDemoActivityIndex(Number(event.target.value)); setDemoQuestionIndex(0); }} style={{ width: '100%', padding: '8px', marginBottom: '16px', borderRadius: '4px', border: '1px solid #ccc' }}>
                {activities.map((activity, index) => <option key={activity.activityId} value={index}>{activity.title} ({activity.role.toUpperCase()})</option>)}
              </select>
              {currentPolicy && <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', marginBottom: '16px', fontSize: '12px', lineHeight: 1.55 }}><strong style={{ color: '#1a73e8' }}>Active 3A policy</strong><div>Attempts: {currentPolicy.attempts}</div><div>Feedback: <code>{currentPolicy.feedback}</code></div><div>Hints: {currentPolicy.hintsAllowed ? 'Allowed' : 'Disabled'}</div><div>Remediation: {currentPolicy.remediationAllowed ? 'Allowed' : 'Disabled'}</div><div>Replacement: {currentPolicy.allowReplacement ? 'Allowed' : 'Disabled'}</div></div>}
              <h5 style={{ margin: '16px 0 8px', color: '#5f6368' }}>SIMULATE SUPPORTS</h5>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px' }}><input type="checkbox" checked={demoCalculator} onChange={(event) => setDemoCalculator(event.target.checked)} /> Calculator accommodation</label>
              <label style={{ display: 'block', fontSize: '12px' }}>Language <select value={demoTranslation} onChange={(event) => setDemoTranslation(event.target.value)} style={{ marginLeft: '6px', padding: '4px' }}><option value="en">English</option><option value="es">Español (authored translation)</option></select></label>
            </aside>

            <main style={{ flex: 1, padding: '24px', overflowY: 'auto', background: '#fff' }}>
              {!currentActivity && <p>No activities are available to preview.</p>}
              {currentActivity && !currentQuestion && <p>This activity has no questions to preview.</p>}
              {currentQuestion && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #eee', paddingBottom: '12px' }}>
                    <div><span style={{ fontSize: '12px', background: '#e8f0fe', color: '#1a73e8', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{currentActivity.role.toUpperCase()} MODE</span><h3 style={{ margin: '4px 0 0' }}>{currentActivity.title}</h3></div>
                    <div style={{ fontSize: '13px', color: '#5f6368' }}>Question {demoQuestionIndex + 1} of {questions.length}</div>
                  </div>
                  <MathMasterToolWrapper
                    key={`${currentActivity.activityId}-${currentQuestion.questionId}-${demoCalculator}-${demoTranslation}`}
                    activityRole={currentActivity.role}
                    question={currentQuestion}
                    student={{ id: 'teacher_preview_user', supportProfile: { accommodations: demoCalculator ? ['calculator'] : [], modifications: [], translationLanguage: demoTranslation } }}
                    executionScope="teacherPreview"
                  />
                  <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" disabled={demoQuestionIndex === 0} onClick={() => setDemoQuestionIndex((value) => value - 1)} style={{ padding: '8px 16px' }}>Previous Question</button>
                    <button type="button" disabled={demoQuestionIndex >= questions.length - 1} onClick={() => setDemoQuestionIndex((value) => value + 1)} style={{ padding: '8px 16px' }}>Next Question</button>
                  </div>
                </>
              )}
            </main>
          </div>
        )}

        <footer style={{ padding: '16px 24px', borderTop: '1px solid #ccc', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: validationReport.isValid ? '#5f6368' : '#a50e0e' }}>{validationReport.isValid ? 'Preview is isolated: attempts are never written to student grading state.' : 'Publish is disabled until deep validation passes.'}</span>
          <div style={{ display: 'flex', gap: '12px' }}><button type="button" onClick={onClose} style={{ padding: '10px 20px' }}>Back to Editing</button><button type="button" disabled={!posts.length || !validationReport.isValid} onClick={onConfirmPublish} style={{ padding: '10px 24px', border: 'none', borderRadius: '6px', background: posts.length && validationReport.isValid ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 'bold' }}>Publish {posts.length} Post{posts.length === 1 ? '' : 's'} Now</button></div>
        </footer>
      </section>
    </div>
  );
};

export default LessonPreflightModal;
