import { useMemo, useState } from 'react';
import QuestionEngine from '../../QuestionEngine';
import { getQuestionPrimaryTeksCodes } from '../../questionMetadata';
import { getTexasStandard } from '../../texasStandards';
import {
  OUTCOME_CONTROLS, STARTING_PROFILES,
  applySimulationOutcome, buildDebugPackage, createSimulatedLearner,
  evaluateSimulation, explainRouting, forceSkillState, isRoutingMismatch,
} from '../../platform/simulation/simulatedLearner';
import { buildMasteryBySkillForStudent } from '../../platform/path/masteryAdapter';
import { getSkillGraph, teksSkillId } from '../../platform/path/skillGraph';
import { staticMapProvider } from '../../platform/path/curriculumPacing';
import { explainLock, listPrerequisiteChoices, simulateInstantMastery } from '../../platform/path/graphInspection';
import { REMEDIATION_ACTION, describeBranchImpact, planRemediation } from '../../platform/path/remediationPlan';

// Teacher Path Simulator.
//
// Student View is the real QuestionEngine — the same component a student gets,
// not a copy of it. Everything else on this screen is teacher-only tooling
// arranged around it, and every control feeds the real mastery and routing
// engines rather than editing the display.

const FEEDBACK_CATEGORIES = [
  'Question quality', 'Math error', 'Answer/scoring problem', 'Graph/tool problem',
  'Instructions unclear', 'Too easy/hard', 'Bad remediation', 'Bad routing',
  'Student experience', 'Accessibility', 'Other',
];

const panel = { border: '1px solid #dadce0', borderRadius: 12, background: '#fff', padding: 16, marginBottom: 16 };
const heading = { margin: '0 0 10px', fontSize: 15, fontWeight: 900, color: '#174ea6' };
const smallButton = {
  minHeight: 40, padding: '8px 12px', borderRadius: 8, border: '1px solid #c5d5ef',
  background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 13, cursor: 'pointer',
};
const input = {
  width: '100%', minHeight: 44, fontSize: 15, padding: '9px 10px', marginTop: 6,
  border: '1px solid #c9ced6', borderRadius: 8, boxSizing: 'border-box', background: '#fff', color: '#202124',
};

const STRENGTH_COLOR = { hard: '#a50e0e', soft: '#7a4f00', reinforcement: '#5f6368' };
const STRENGTH_LABEL = { hard: 'Required', soft: 'Helpful', reinforcement: 'Related' };

const REMEDIATION_LABEL = {
  [REMEDIATION_ACTION.RETEACH_IN_PLACE]: 'Reteach this skill',
  [REMEDIATION_ACTION.DIAGNOSE]: 'Check the prerequisite first',
  [REMEDIATION_ACTION.DESCEND]: 'Drop back to the prerequisite',
  [REMEDIATION_ACTION.NONE]: 'Nothing to route',
};

const pill = (color) => ({
  display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11,
  fontWeight: 900, color, border: `1px solid ${color}33`, background: `${color}14`,
});

const DECISION_COLOR = {
  Remediation: '#a50e0e',
  'Acceleration available': '#137333',
  'Gather more evidence': '#7a4f00',
  'Continue at grade level': '#174ea6',
  'No decision': '#5f6368',
};

export default function PathSimulator({ assignments = [], teacherId = 'teacher', onCopyText }) {
  const runnableAssignments = useMemo(
    () => assignments.filter((assignment) => Array.isArray(assignment?.questions) && assignment.questions.length),
    [assignments],
  );

  const [assignmentId, setAssignmentId] = useState(() => runnableAssignments[0]?.id || '');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [profileId, setProfileId] = useState('fresh');
  const [session, setSession] = useState(null);
  const [expectedRoute, setExpectedRoute] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState(FEEDBACK_CATEGORIES[0]);
  const [feedback, setFeedback] = useState('');
  const [showDeveloperDetails, setShowDeveloperDetails] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [inspectSkillId, setInspectSkillId] = useState('');
  const [whatIfSkillId, setWhatIfSkillId] = useState('');
  const [copied, setCopied] = useState('');

  const assignment = runnableAssignments.find((item) => item.id === assignmentId) || null;
  const question = assignment?.questions?.[questionIndex] || null;
  const teksCodes = useMemo(() => getQuestionPrimaryTeksCodes(question), [question]);

  // Starting the session needs the question's TEKS, so it cannot be created
  // until an assignment is chosen.
  const startSession = (nextProfileId = profileId) => {
    const created = createSimulatedLearner({ profileId: nextProfileId, teacherId, teksCodes });
    setSession({ ...created, extraAssignments: created.seedAssignments });
    setProfileId(nextProfileId);
  };

  const simulationAssignments = useMemo(() => (
    session ? [...(session.extraAssignments || []), ...(assignment ? [assignment] : [])] : []
  ), [session, assignment]);

  const evaluated = useMemo(() => (
    session ? evaluateSimulation({ learner: session.learner, assignments: simulationAssignments, question }) : null
  ), [session, simulationAssignments, question]);

  const explanation = useMemo(() => (
    evaluated ? explainRouting({ question, profile: evaluated.profile, routing: evaluated.routing }) : null
  ), [evaluated, question]);

  const mismatch = explanation ? isRoutingMismatch(expectedRoute, explanation) : false;

  // --- Graph inspection ----------------------------------------------------
  // These questions are about readiness, not pacing, so the inspector uses a
  // deliberately neutral calendar: an empty window map leaves every skill in
  // the current window. Otherwise "why is this locked?" would sometimes answer
  // "because it is March", which is true but is not what was being asked.
  const inspectionCourseId = getTexasStandard(teksCodes[0])?.courseId || 'algebra1';
  const courseSkills = useMemo(() => getSkillGraph(inspectionCourseId), [inspectionCourseId]);
  const defaultSkillId = teksCodes[0] ? teksSkillId(teksCodes[0]) : (courseSkills[0]?.skillId || '');
  const activeSkillId = courseSkills.some((skill) => skill.skillId === inspectSkillId)
    ? inspectSkillId
    : defaultSkillId;

  const masteryBySkill = useMemo(() => (
    session ? buildMasteryBySkillForStudent({ student: session.learner, assignments: simulationAssignments }) : {}
  ), [session, simulationAssignments]);

  const lockExplanation = useMemo(() => (
    activeSkillId ? explainLock({ courseId: inspectionCourseId, skillId: activeSkillId, masteryBySkill }) : null
  ), [inspectionCourseId, activeSkillId, masteryBySkill]);

  const prerequisiteChoices = useMemo(() => (
    activeSkillId ? listPrerequisiteChoices({ courseId: inspectionCourseId, skillId: activeSkillId }) : []
  ), [inspectionCourseId, activeSkillId]);

  // A prerequisite chosen for one skill is meaningless for another, so the
  // selection is validated against the current list rather than remembered.
  const activeWhatIfId = prerequisiteChoices.some((entry) => entry.skillId === whatIfSkillId) ? whatIfSkillId : '';

  const whatIf = useMemo(() => {
    if (!activeSkillId || !activeWhatIfId) return null;
    return simulateInstantMastery({
      pathInput: {
        courseId: inspectionCourseId,
        masteryBySkill,
        pacing: { currentWindow: 1, windowCount: 1 },
        pacingProvider: staticMapProvider({ windowMap: {}, windowCount: 1 }),
      },
      skillId: activeSkillId,
      prerequisiteSkillId: activeWhatIfId,
    });
  }, [inspectionCourseId, activeSkillId, activeWhatIfId, masteryBySkill]);

  const remediation = useMemo(() => (
    activeSkillId ? planRemediation({ courseId: inspectionCourseId, skillId: activeSkillId, masteryBySkill }) : null
  ), [inspectionCourseId, activeSkillId, masteryBySkill]);

  const branchImpact = useMemo(() => (
    activeSkillId ? describeBranchImpact({ courseId: inspectionCourseId, skillId: activeSkillId }) : null
  ), [inspectionCourseId, activeSkillId]);

  const runOutcome = (outcomeId) => {
    if (!session || !assignment) return;
    if (outcomeId === 'forceSkillMastery' || outcomeId === 'forceSkillFailure') {
      const forced = forceSkillState({
        learner: session.learner,
        targetKey: outcomeId === 'forceSkillMastery' ? 'masters' : 'didNotMeet',
        teksCodes,
      });
      if (!forced.seedAssignment) return;
      setSession((current) => ({
        ...current,
        learner: forced.learner,
        // Replace any previous forced state rather than stacking a second one
        // beside it; forceSkillState reuses the id precisely so this can.
        extraAssignments: [
          ...(current.extraAssignments || []).filter((item) => item.id !== forced.seedAssignment.id),
          forced.seedAssignment,
        ],
        timeline: [...current.timeline, forced.event],
      }));
      return;
    }

    const applied = applySimulationOutcome({
      learner: session.learner,
      assignmentId: assignment.id,
      questionIndex,
      outcomeId,
      questionDetails: String(question?.prompt || '').slice(0, 120),
    });
    setSession((current) => ({
      ...current,
      learner: applied.learner,
      timeline: [...current.timeline, applied.event],
    }));
  };

  const copyDebugPackage = async () => {
    if (!explanation) return;
    const text = buildDebugPackage({
      question,
      explanation,
      profile: evaluated.profile,
      routing: evaluated.routing,
      differentiation: evaluated.differentiation,
      timeline: session.timeline,
      teacherFeedback: feedback,
      feedbackCategory,
      expectedRoute,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied the debug package to your clipboard.');
    } catch {
      onCopyText?.(text);
      setCopied('Clipboard is unavailable here — the package was opened instead.');
    }
    window.setTimeout(() => setCopied(''), 5000);
  };

  if (!runnableAssignments.length) {
    return (
      <div style={{ ...panel, textAlign: 'left' }}>
        <h3 style={heading}>Path Simulator</h3>
        <p style={{ color: '#5f6368', margin: 0, lineHeight: 1.6 }}>
          Create an assignment first. The simulator runs real questions through the real
          mastery and routing engines, so it needs something to run.
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'left' }}>
      {/* Unmissable, and worded so a teacher knows exactly what is and is not at risk. */}
      <div style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 10, background: '#4a148c', color: '#fff', fontWeight: 800, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 18 }} aria-hidden="true">🧪</span>
        <span>Teacher Simulation — no student data is affected.</span>
        <span style={{ fontWeight: 500, opacity: 0.9, fontSize: 13 }}>
          Nothing here reaches grades, analytics, Google Classroom, or any student&apos;s path.
        </span>
      </div>

      <div style={panel}>
        <h3 style={heading}>1. Choose what to simulate</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          <label style={{ fontWeight: 800 }}>Assignment
            <select value={assignmentId} onChange={(event) => { setAssignmentId(event.target.value); setQuestionIndex(0); setSession(null); }} style={input}>
              {runnableAssignments.map((item) => <option key={item.id} value={item.id}>{item.title || 'Untitled'}</option>)}
            </select>
          </label>
          <label style={{ fontWeight: 800 }}>Question
            <select value={questionIndex} onChange={(event) => setQuestionIndex(Number(event.target.value))} style={input}>
              {(assignment?.questions || []).map((item, index) => (
                <option key={index} value={index}>{index + 1}. {String(item?.prompt || item?.type || '').slice(0, 60)}</option>
              ))}
            </select>
          </label>
          <label style={{ fontWeight: 800 }}>Starting state
            <select value={profileId} onChange={(event) => startSession(event.target.value)} style={input}>
              {STARTING_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <p style={{ color: '#5f6368', fontSize: 13, lineHeight: 1.55, margin: '10px 0 0' }}>
          {STARTING_PROFILES.find((item) => item.id === profileId)?.description}
          {teksCodes.length
            ? ` Seeded against ${teksCodes.join(', ')}.`
            : ' This question carries no TEKS alignment, so no starting state can be seeded and routing has nothing to reason about.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" onClick={() => startSession()} style={{ ...smallButton, background: '#1a73e8', color: '#fff', border: 0, minHeight: 44 }}>
            {session ? 'Restart simulation' : 'Start simulation'}
          </button>
          {session && <button type="button" onClick={() => setSession(null)} style={{ ...smallButton, minHeight: 44 }}>Reset simulated student</button>}
        </div>
      </div>

      {session && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0 }}>
          <div style={panel}>
            <h3 style={heading}>2. Student View</h3>
            <p style={{ color: '#5f6368', fontSize: 12, margin: '0 0 12px' }}>
              This is the student question renderer itself, not a teacher copy of it.
            </p>
            {question
              ? <QuestionEngine question={question} onStateChange={() => {}} feedback={null} draftKey={`simulator-${assignment.id}-${questionIndex}`} />
              : <p>No question selected.</p>}
          </div>

          <div style={panel}>
            <h3 style={heading}>3. Simulation Controls</h3>
            <p style={{ color: '#5f6368', fontSize: 12, margin: '0 0 12px', lineHeight: 1.55 }}>
              These do not change the screen. Each one records real attempts through the attempt
              policy, then the mastery and routing engines re-evaluate from that evidence.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
              {OUTCOME_CONTROLS.map((control) => (
                <button key={control.id} type="button" onClick={() => runOutcome(control.id)} title={control.hint} style={smallButton}>
                  {control.label}
                </button>
              ))}
            </div>
          </div>

          {explanation && (
            <div style={{ ...panel, borderLeft: `5px solid ${DECISION_COLOR[explanation.decision] || '#5f6368'}` }}>
              <h3 style={heading}>4. Why this next?</h3>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(150px, auto) 1fr', gap: '7px 14px', fontSize: 14, lineHeight: 1.5 }}>
                <dt style={{ fontWeight: 800 }}>Current skill</dt><dd style={{ margin: 0 }}>{explanation.currentSkill}</dd>
                <dt style={{ fontWeight: 800 }}>Performance</dt><dd style={{ margin: 0 }}>{explanation.performanceLabel}{explanation.performanceScore != null ? ` · ${explanation.performanceScore}` : ''} from {explanation.evidenceCount} item{explanation.evidenceCount === 1 ? '' : 's'}</dd>
                <dt style={{ fontWeight: 800 }}>Detected difficulty</dt><dd style={{ margin: 0 }}>{explanation.detectedDifficulty}</dd>
                <dt style={{ fontWeight: 800 }}>Prerequisite affected</dt><dd style={{ margin: 0 }}>{explanation.prerequisiteAffected}</dd>
                <dt style={{ fontWeight: 800 }}>Decision</dt><dd style={{ margin: 0, fontWeight: 900, color: DECISION_COLOR[explanation.decision] }}>{explanation.decision}</dd>
                <dt style={{ fontWeight: 800 }}>Next activity</dt><dd style={{ margin: 0 }}>{explanation.nextActivity}</dd>
                <dt style={{ fontWeight: 800 }}>Exit condition</dt><dd style={{ margin: 0 }}>{explanation.exitCondition}</dd>
              </dl>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' }}>
                <label style={{ fontWeight: 800, fontSize: 13 }}>I expect this to route to
                  <input value={expectedRoute} onChange={(event) => setExpectedRoute(event.target.value)} placeholder="e.g. A.2A" style={input} />
                </label>
                {expectedRoute && (
                  <div style={{ padding: '10px 12px', borderRadius: 8, fontWeight: 900, background: mismatch ? '#fce8e6' : '#e6f4ea', color: mismatch ? '#a50e0e' : '#137333' }}>
                    {mismatch ? 'ROUTING MISMATCH' : 'Routing matches your expectation'}
                  </div>
                )}
              </div>

              <button type="button" onClick={() => setShowDeveloperDetails((current) => !current)} style={{ ...smallButton, marginTop: 12 }}>
                {showDeveloperDetails ? '▾' : '▸'} Developer details
              </button>
              {showDeveloperDetails && (
                <pre style={{ marginTop: 10, padding: 12, background: '#f8f9fa', borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                  {JSON.stringify(explanation.developerDetails, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div style={panel}>
            <h3 style={heading}>5. Graph inspection</h3>
            <p style={{ color: '#5f6368', fontSize: 12, margin: '0 0 12px', lineHeight: 1.55 }}>
              What is actually holding a skill closed, and what would open it. Only <strong>required</strong>{' '}
              prerequisites can lock — helpful and related ones change ranking and support, never access.
              Pacing is held neutral here so the answer is about readiness alone.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <label style={{ fontWeight: 800, fontSize: 13 }}>Skill
                <select value={activeSkillId} onChange={(event) => { setInspectSkillId(event.target.value); setWhatIfSkillId(''); }} style={input}>
                  {courseSkills.map((skill) => (
                    <option key={skill.skillId} value={skill.skillId}>{skill.skillId.replace('teks:', '')} — {String(skill.title || '').slice(0, 70)}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontWeight: 800, fontSize: 13 }}>What if this were instantly mastered?
                <select value={activeWhatIfId} onChange={(event) => setWhatIfSkillId(event.target.value)} style={input}>
                  <option value="">Choose a prerequisite…</option>
                  {prerequisiteChoices.map((entry) => (
                    <option key={entry.skillId} value={entry.skillId}>
                      {STRENGTH_LABEL[entry.strength] || entry.strength} · {entry.label.slice(0, 70)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {whatIf && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, fontWeight: 800, fontSize: 13, lineHeight: 1.5, background: whatIf.opened ? '#e6f4ea' : '#f1f3f4', color: whatIf.opened ? '#137333' : '#3c4043' }}>
                {whatIf.summary}
              </div>
            )}

            {lockExplanation && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13 }}>Why is this locked?</p>
                <p style={{ margin: '0 0 10px', color: '#3c4043', fontSize: 13, lineHeight: 1.55 }}>{lockExplanation.summary}</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
                  {lockExplanation.blocking.map((entry) => (
                    <li key={entry.skillId}>
                      <span style={pill(STRENGTH_COLOR.hard)}>Blocking</span>{' '}
                      {entry.label} — at {Math.round((entry.mastery ?? 0) * 100)}%, needs {Math.round(entry.minimumMastery * 100)}%
                    </li>
                  ))}
                  {lockExplanation.helpful.map((entry) => (
                    <li key={entry.skillId}>
                      <span style={pill(STRENGTH_COLOR.soft)}>{STRENGTH_LABEL.soft}</span>{' '}
                      {entry.label}
                      {entry.mastery != null ? ` — at ${Math.round(entry.mastery * 100)}%` : ' — no evidence yet'}
                    </li>
                  ))}
                  {lockExplanation.related.map((entry) => (
                    <li key={entry.skillId}>
                      <span style={pill(STRENGTH_COLOR.reinforcement)}>{STRENGTH_LABEL.reinforcement}</span> {entry.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {remediation && (
              <div style={{ marginTop: 16 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13 }}>
                  If this student struggled here: {REMEDIATION_LABEL[remediation.action] || remediation.action}
                </p>
                <p style={{ margin: 0, color: '#3c4043', fontSize: 13, lineHeight: 1.55 }}>
                  {remediation.explanation}
                  {remediation.target ? ` Target: ${remediation.target.label}.` : ''}
                </p>
              </div>
            )}

            {branchImpact && (
              <p style={{ margin: '14px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.55 }}>
                Remediating this skill would hold back {branchImpact.blockedSkillIds.length} of{' '}
                {branchImpact.blockedSkillIds.length + branchImpact.unrelatedSkillIds.length} other skills in this course.
                The other {branchImpact.unrelatedSkillIds.length} stay open — a student in remediation keeps working elsewhere.
              </p>
            )}
          </div>

          <div style={panel}>
            <h3 style={heading}>6. Path history</h3>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.65 }}>
              {session.timeline.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.label}</strong> — {entry.detail}
                </li>
              ))}
            </ol>
          </div>

          <div style={panel}>
            <h3 style={heading}>7. Inspector &amp; feedback</h3>
            <button type="button" onClick={() => setShowInspector((current) => !current)} style={smallButton}>
              {showInspector ? '▾' : '▸'} Inspect question
            </button>
            {showInspector && question && (
              <dl style={{ margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'minmax(140px, auto) 1fr', gap: '6px 14px', fontSize: 13, lineHeight: 1.5 }}>
                <dt style={{ fontWeight: 800 }}>Type</dt><dd style={{ margin: 0 }}>{question.toolId || question.type}</dd>
                <dt style={{ fontWeight: 800 }}>Primary TEKS</dt><dd style={{ margin: 0 }}>{teksCodes.map((code) => `${code} — ${getTexasStandard(code)?.description || 'unknown'}`).join('; ') || 'none'}</dd>
                <dt style={{ fontWeight: 800 }}>DOK</dt><dd style={{ margin: 0 }}>{question.dok ?? 'not set'}</dd>
                <dt style={{ fontWeight: 800 }}>Difficulty band</dt><dd style={{ margin: 0 }}>{question.difficultyBand ?? 'not set'}</dd>
                <dt style={{ fontWeight: 800 }}>Activity role</dt><dd style={{ margin: 0 }}>{question.activityRole || 'classwork'}</dd>
                <dt style={{ fontWeight: 800 }}>Adaptive mode</dt><dd style={{ margin: 0 }}>{evaluated?.differentiation?.question?.adaptiveMeta?.mode || 'recommend'} · target band {evaluated?.differentiation?.targetBand ?? '—'}</dd>
                <dt style={{ fontWeight: 800 }}>Question JSON</dt>
                <dd style={{ margin: 0 }}>
                  <pre style={{ margin: 0, padding: 10, background: '#f8f9fa', borderRadius: 8, fontSize: 11, maxHeight: 220, overflow: 'auto' }}>{JSON.stringify(question, null, 2)}</pre>
                </dd>
              </dl>
            )}

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <label style={{ fontWeight: 800, fontSize: 13 }}>What kind of problem is this?
                <select value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value)} style={input}>
                  {FEEDBACK_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label style={{ fontWeight: 800, fontSize: 13 }}>What happened?
                <textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  rows={3}
                  placeholder="Students should be able to drag the point rather than enter coordinates."
                  style={{ ...input, minHeight: 84, resize: 'vertical' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={copyDebugPackage} style={{ ...smallButton, background: '#1a73e8', color: '#fff', border: 0, minHeight: 44 }}>
                  Copy Debug Package for AI
                </button>
                {copied && <span style={{ color: '#137333', fontWeight: 800, fontSize: 13 }}>{copied}</span>}
              </div>
              <p style={{ color: '#5f6368', fontSize: 12, margin: 0, lineHeight: 1.55 }}>
                The package carries the question JSON, the mastery and routing state that produced
                this decision, and the path history — so whoever fixes it gets the cause rather than
                a description of the symptom.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
