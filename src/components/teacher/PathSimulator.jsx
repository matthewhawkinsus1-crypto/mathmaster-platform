import { useEffect, useMemo, useState } from 'react';
import QuestionEngine from '../../QuestionEngine';
import { getQuestionPrimaryTeksCodes } from '../../questionMetadata';
import { getTexasStandard } from '../../texasStandards';
import {
  OUTCOME_CONTROLS, STARTING_PROFILES,
  applySimulationOutcome, buildDebugPackage, createSimulatedLearner,
  evaluateSimulation, explainRouting, forceRetentionDue, forceSkillState, isRoutingMismatch,
} from '../../platform/simulation/simulatedLearner';
import { buildMasteryBySkillForStudent } from '../../platform/path/masteryAdapter';
import { getSkillGraph, teksSkillId } from '../../platform/path/skillGraph';
import { staticMapProvider } from '../../platform/path/curriculumPacing';
import { explainLock, listPrerequisiteChoices, simulateInstantMastery } from '../../platform/path/graphInspection';
import { REMEDIATION_ACTION, describeBranchImpact, planRemediation } from '../../platform/path/remediationPlan';
import { getStudentPathOptions } from '../../platform/path/recommendationEngine';
import WeeklyPathExplainer from './WeeklyPathExplainer.jsx';
import { getWheelTeksForCourse } from '../../platform/mastery/strandConfig.js';
import { COURSES } from '../../../functions/shared/classModel.mjs';
import { buildAssessmentEvidence, withSimulatedEvidence } from '../../platform/ccmr/assessmentEvidence';
import { getDirectAlignmentIndex } from '../../platform/ccmr/assessmentCrosswalk';
import { normalizeAssessmentContext, normalizeQuestionAlignments } from '../../platform/contract/alignments';
import AssessmentSkillInspector from './AssessmentSkillInspector';
import SimulatedStudentExperience from './SimulatedStudentExperience';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';
import { auditPathQuestionQuality, summarizePathBankQuality, buildPathQuestionRevisionBrief } from '../../platform/path/pathQuestionQuality.js';
import {
  createSlot, describeSimulatedDate, duplicateSlot, removeSlot, renameSlot, resolveSimulatedNow,
  restoreSnapshot, rewindTo, saveSnapshot, setSimulatedDate, simulatedDateInputValue, updateSlot,
  DEFAULT_SLOT_NAMES,
} from '../../platform/simulation/simulationSlots';

// Teacher Path Simulator.
//
// The teacher sees what the student sees. The main surface is the student's own
// dashboard, Path and CCMR screens — the same components, not copies —
// rendered from an isolated synthetic learner, with teacher controls beside
// them. Every control feeds the real mastery, routing and calendar engines
// rather than editing the display.
//
// The question bench is still here, one click away: choosing an assignment and
// a question and running it through the real QuestionEngine is the right tool
// for checking a single item, and it is not the right tool for checking what a
// student's path does over a term.
//
// Two clocks, deliberately. The student simulation runs on a date the teacher
// sets, so real pacing and the real calendar apply. The graph inspector holds
// pacing NEUTRAL, because "what mathematically blocks this skill?" must not be
// answered with "because it is March".

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

// Plain English for the selector's own reason codes. Teacher-facing only.
const SELECTION_REASON_LABEL = {
  production_family_with_a_new_representation: 'Polished family showing a representation this session has not used yet',
  production_family: 'Polished family — quality outranks a closer difficulty band',
  unused_family_in_preferred_band: 'Unused family at this student\'s readiness band',
  unused_family_in_adjacent_band: 'Unused family one band away — nothing left at the exact band',
  all_families_used_repeating_least_used: 'Every family has been used; repeating the least-used one',
};

// Controls that act on a whole SKILL rather than on the question currently on
// screen. They stay available without an open Path question, which is what the
// disabled-state logic below keys off.
const SKILL_LEVEL_CONTROLS = new Set(['forceSkillMastery', 'forceSkillFailure', 'forceRetentionDue']);

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
  const [simulationCourseId, setSimulationCourseId] = useState('algebra1');
  const courseWheelTeks = useMemo(() => getWheelTeksForCourse(simulationCourseId), [simulationCourseId]);
  const [simulationTargetTeks, setSimulationTargetTeks] = useState(() => getWheelTeksForCourse('algebra1')[0] || '');
  const [profileId, setProfileId] = useState('fresh');
  const [mode, setMode] = useState('experience');
  const [slots, setSlots] = useState(() => [createSlot({ name: DEFAULT_SLOT_NAMES[0] })]);
  const [activeSlotId, setActiveSlotId] = useState(() => null);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [slotNotice, setSlotNotice] = useState('');
  const [pathController, setPathController] = useState(null);
  const [pathBankRecords, setPathBankRecords] = useState([]);
  const [simulationEvents, setSimulationEvents] = useState([]);
  const pathBankQuality = useMemo(() => summarizePathBankQuality(pathBankRecords), [pathBankRecords]);
  const activeBankQuestion = useMemo(() => {
    const id = pathController?.question?.sourceBankQuestionId;
    return id ? pathBankRecords.find((item) => item?.id === id) || null : null;
  }, [pathController, pathBankRecords]);
  const activeQuestionAudit = useMemo(
    () => (activeBankQuestion ? auditPathQuestionQuality(activeBankQuestion) : null),
    [activeBankQuestion],
  );
  const pushSimulationEvent = (event) => {
    if (!event) return;
    setSimulationEvents((current) => [event, ...current].slice(0, 12));
  };

  const activeSlot = slots.find((slot) => slot.id === activeSlotId) || slots[0];
  // Every existing control below still speaks in terms of one `session`. Slots
  // are a container around that, so nothing had to be rewritten to gain them.
  const session = activeSlot?.session || null;
  const setSession = (updater) => {
    setSlots((current) => current.map((slot) => (slot.id !== activeSlot.id ? slot : {
      ...slot,
      session: typeof updater === 'function' ? updater(slot.session) : updater,
    })));
  };
  const simulatedNow = resolveSimulatedNow(activeSlot);
  const [expectedRoute, setExpectedRoute] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState(FEEDBACK_CATEGORIES[0]);
  const [feedback, setFeedback] = useState('');
  const [showDeveloperDetails, setShowDeveloperDetails] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [inspectSkillId, setInspectSkillId] = useState('');
  const [whatIfSkillId, setWhatIfSkillId] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!assignmentId && runnableAssignments[0]?.id) setAssignmentId(runnableAssignments[0].id);
  }, [assignmentId, runnableAssignments]);

  useEffect(() => {
    if (!courseWheelTeks.includes(simulationTargetTeks)) setSimulationTargetTeks(courseWheelTeks[0] || '');
  }, [courseWheelTeks, simulationTargetTeks]);

  const assignment = runnableAssignments.find((item) => item.id === assignmentId) || null;
  const question = assignment?.questions?.[questionIndex] || null;
  const teksCodes = useMemo(() => getQuestionPrimaryTeksCodes(question), [question]);

  // Student Experience is course/skill based, not assignment based. A teacher
  // can simulate a completely fresh student before a single classroom
  // assignment exists. Question Bench still uses the selected assignment when
  // there is one.
  const startSession = (nextProfileId = profileId) => {
    setPathController(null);
    setSimulationEvents([]);
    const seedCodes = mode === 'bench' && teksCodes.length
      ? teksCodes
      : (simulationTargetTeks ? [simulationTargetTeks] : []);
    // The Weekly Path view shows a Student Learning Profile, which will not
    // classify anyone from six questions on one standard. Without surrounding
    // evidence every starting profile renders as "Establishing Baseline" and a
    // teacher sees the same week for Advanced and Struggling — concluding,
    // reasonably, that the engine does not adapt. Routing and Question Bench
    // keep the single-standard learner they were calibrated against.
    const contextCodes = mode === 'week'
      ? courseWheelTeks.filter((code) => code !== simulationTargetTeks).slice(0, 2)
      : [];
    const created = createSimulatedLearner({ profileId: nextProfileId, teacherId, teksCodes: seedCodes, contextCodes });
    setSession({ ...created, extraAssignments: created.seedAssignments });
    setProfileId(nextProfileId);
  };

  const simulationAssignments = useMemo(() => (
    session ? [...(session.extraAssignments || []), ...(assignment ? [assignment] : [])] : []
  ), [session, assignment]);
  const simulationVisibleAssignments = useMemo(() => (assignment ? [assignment] : []), [assignment]);

  const evaluated = useMemo(() => (
    session ? evaluateSimulation({ learner: session.learner, assignments: simulationAssignments, question, courseId: simulationCourseId, retentionSchedulesByTEKS: session.retentionSchedulesByTEKS || {} }) : null
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
  const inspectionCourseId = simulationCourseId;
  const courseSkills = useMemo(() => getSkillGraph(inspectionCourseId), [inspectionCourseId]);
  const defaultSkillId = simulationTargetTeks ? teksSkillId(simulationTargetTeks) : (courseSkills[0]?.skillId || '');
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

  // --- CCMR simulation -----------------------------------------------------
  // Assessment-context evidence is a separate map from core mastery, so the
  // simulator overlays synthetic framework evidence on top of whatever the
  // simulated learner has actually done. Core mastery is untouched by it —
  // which is the property the teacher is here to check.
  const [ccmrOverrides, setCcmrOverrides] = useState({});

  const ccmrPathOptions = useMemo(() => getStudentPathOptions({
    courseId: inspectionCourseId,
    masteryBySkill,
    pacing: { currentWindow: 1, windowCount: 1 },
    pacingProvider: staticMapProvider({ windowMap: {}, windowCount: 1 }),
  }), [inspectionCourseId, masteryBySkill]);

  const directIndex = useMemo(() => getDirectAlignmentIndex(simulationAssignments, {
    normalizeAlignments: (question) => normalizeQuestionAlignments(question, { includeCrosswalks: false }),
    normalizeContext: normalizeAssessmentContext,
  }), [simulationAssignments]);

  const assessmentEvidence = useMemo(() => {
    const base = session
      ? buildAssessmentEvidence({ student: session.learner, assignments: simulationAssignments })
      : {};
    return Object.values(ccmrOverrides).reduce((current, override) => (
      override.proficiency == null ? current : withSimulatedEvidence(current, override)
    ), base);
  }, [session, simulationAssignments, ccmrOverrides]);

  const simulateAssessment = ({ skillId, framework, proficiency }) => {
    setCcmrOverrides((current) => ({
      ...current,
      [`${skillId}:${framework}`]: { skillId, framework, proficiency },
    }));
  };

  // --- Slots, snapshots and the simulated clock ----------------------------
  const notify = (message) => {
    setSlotNotice(message);
    window.setTimeout(() => setSlotNotice(''), 4000);
  };

  const addSlot = () => {
    const next = createSlot({ name: DEFAULT_SLOT_NAMES[slots.length] || `Custom ${slots.length - 2}` });
    setSlots((current) => [...current, next]);
    setActiveSlotId(next.id);
  };

  const takeSnapshot = () => {
    if (!session) return;
    setSlots((current) => current.map((slot) => (
      slot.id === activeSlot.id ? saveSnapshot(slot, { label: snapshotLabel, ccmrOverrides }) : slot
    )));
    setSnapshotLabel('');
    notify('Snapshot saved.');
  };

  const restore = (snapshotId) => {
    const result = restoreSnapshot(activeSlot, snapshotId);
    if (!result.restored) return;
    setSlots((current) => current.map((slot) => (slot.id === activeSlot.id ? result.slot : slot)));
    setCcmrOverrides(result.ccmrOverrides || {});
    notify('Restored. The routing should now be exactly what it was.');
  };

  const rewind = (eventId) => {
    const result = rewindTo(activeSlot, eventId);
    if (!result.restored) {
      notify(result.reason === 'no-snapshot'
        ? 'Nothing to rewind to — save a snapshot before the step you want to come back to.'
        : 'That point is no longer on the timeline.');
      return;
    }
    setSlots((current) => current.map((slot) => (slot.id === activeSlot.id ? result.slot : slot)));
    setCcmrOverrides(result.ccmrOverrides || {});
    notify(`Rewound to "${result.snapshotLabel}".`);
  };

  // The simulated student runs on the REAL calendar at the teacher's chosen
  // date. Pacing here is only the acceleration window; the calendar decides
  // what is current, which is what makes moving the date meaningful.
  const simulationPacing = useMemo(() => ({ windowIndex: 0, windowCount: 6, accelerationRadius: 1 }), []);

  // What the simulated learner has already done on the bench question, so a
  // second attempt is a second attempt rather than a fresh start.
  const benchRecord = session?.learner?.gradesByAssignment?.[assignmentId]?.[questionIndex] || null;

  const runOutcome = (outcomeId) => {
    if (!session) return;
    if (mode === 'experience' && !outcomeId.startsWith('forceSkill')) {
      if (!pathController?.canForce || typeof pathController.forceOutcome !== 'function') {
        notify('Start a My Math Path practice question first. The force controls act on the question currently visible to the simulated student.');
        return;
      }
      pathController.forceOutcome(outcomeId).then((result) => {
        if (!result?.ok) {
          notify(result?.reason || 'That simulator action could not be applied.');
          return;
        }
        notify(result.event?.label || 'Simulator outcome applied.');
      });
      return;
    }
    if (outcomeId === 'forceRetentionDue') {
      const codes = teksCodes.length ? teksCodes : (simulationTargetTeks ? [simulationTargetTeks] : []);
      const forced = forceRetentionDue({
        schedules: session.retentionSchedulesByTEKS || {},
        teksCodes: codes,
        nowValue: simulatedNow,
      });
      if (!forced.event) {
        notify('Choose a starting skill first — a retention check has to be due on something.');
        return;
      }
      setSession((current) => ({
        ...current,
        retentionSchedulesByTEKS: forced.schedules,
        timeline: [...current.timeline, forced.event],
      }));
      pushSimulationEvent(forced.event);
      notify(forced.event.label);
      return;
    }

    if (outcomeId === 'forceSkillMastery' || outcomeId === 'forceSkillFailure') {
      const forced = forceSkillState({
        learner: session.learner,
        targetKey: outcomeId === 'forceSkillMastery' ? 'masters' : 'didNotMeet',
        teksCodes: teksCodes.length ? teksCodes : (simulationTargetTeks ? [simulationTargetTeks] : []),
      });
      if (!forced.seedAssignment) {
        // Used to return silently, so a teacher pressing a live-looking button
        // saw nothing at all and could not tell whether it had worked.
        notify('That skill could not be seeded — it has no evidence template. Choose a different starting skill.');
        return;
      }
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
      pushSimulationEvent(forced.event);
      notify(forced.event?.label || 'Forced skill state applied.');
      return;
    }

    // Force Correct/Incorrect/etc. are Question Bench controls and need a real
    // assignment question. Whole-skill force controls above do not.
    if (!assignment || !question) {
      notify('Open a question in the Question Bench first — this control acts on the question currently loaded there.');
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
    // Bench outcomes used to change nothing a teacher could see without
    // scrolling to panel 7. Every force control now confirms itself.
    pushSimulationEvent(applied.event);
    notify(applied.event?.label || 'Question Bench outcome applied.');
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

      <div role="group" aria-label="Simulator mode" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['experience', 'Student experience'], ['week', 'Weekly Path'], ['bench', 'Question bench']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            aria-pressed={mode === id}
            style={{
              minHeight: 44, padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${mode === id ? '#1a73e8' : '#c5d5ef'}`,
              background: mode === id ? '#e8f0fe' : '#fff',
              color: mode === id ? '#174ea6' : '#3c4043', fontWeight: 900, fontSize: 14,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {slotNotice && (
        <div role="status" style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: '#e8f0fe', color: '#174ea6', fontWeight: 800, fontSize: 13 }}>
          {slotNotice}
        </div>
      )}

      {mode === 'week' && (
        <div>
          <div style={{ ...panel, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ fontSize: 12.5, fontWeight: 800, color: '#3c4043' }}>
                Starting profile
                <select
                  value={profileId}
                  onChange={(event) => startSession(event.target.value)}
                  style={{ display: 'block', marginTop: 4, minHeight: 44, padding: '9px 10px', border: '1px solid #c9ced6', borderRadius: 8, fontSize: 15 }}
                >
                  {STARTING_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 800, color: '#3c4043' }}>
                Course
                <select
                  value={simulationCourseId}
                  onChange={(event) => {
                    const nextCourse = event.target.value;
                    setSimulationCourseId(nextCourse);
                    setSimulationTargetTeks(getWheelTeksForCourse(nextCourse)[0] || '');
                    setSession(null);
                  }}
                  style={{ display: 'block', marginTop: 4, minHeight: 44, padding: '9px 10px', border: '1px solid #c9ced6', borderRadius: 8, fontSize: 15 }}
                >
                  {COURSES.map((course) => <option key={course.id} value={course.id}>{course.label}</option>)}
                </select>
              </label>
              {!session && (
                <button type="button" onClick={() => startSession()} style={{ ...smallButton, minHeight: 44, background: '#1a73e8', color: '#fff', border: 0 }}>
                  Start a simulated student
                </button>
              )}
            </div>
            <p style={{ color: '#5f6368', fontSize: 13, lineHeight: 1.55, margin: '12px 0 0' }}>
              {STARTING_PROFILES.find((item) => item.id === profileId)?.description}
            </p>
          </div>
          <WeeklyPathExplainer
            learner={session?.learner || null}
            assignments={simulationAssignments}
            courseId={simulationCourseId}
            retentionSchedulesByTEKS={session?.retentionSchedulesByTEKS || {}}
          />
        </div>
      )}

      {mode === 'experience' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)', gap: 16, alignItems: 'start' }} className="mm-simulator-split">
          <div style={{ ...panel, minWidth: 0 }}>
            {session ? (
              <SimulatedStudentExperience
                learner={session.learner}
                assignments={simulationVisibleAssignments}
                evidenceAssignments={simulationAssignments}
                courseId={inspectionCourseId}
                pacing={simulationPacing}
                nowValue={simulatedNow}
                // Retention schedules the teacher has forced due. Without this
                // the simulator could never reach a retention state at all.
                retentionSchedulesByTEKS={session.retentionSchedulesByTEKS || {}}
                assessmentEvidence={assessmentEvidence}
                directIndex={directIndex}
                onPathBankLoaded={setPathBankRecords}
                onSimulationController={setPathController}
                onSimulationEvent={pushSimulationEvent}
                onChooseSkill={(card) => {
                  // The dashboard's Recommended for You cards are real doors
                  // here too: choosing one opens My Math Path on that skill,
                  // exactly as it does for a student.
                  setSlotNotice(`Opening My Math Path on ${card?.title || 'that skill'}.`);
                  window.setTimeout(() => setSlotNotice(''), 3000);
                }}
                onSimulatedEvidence={({ learner: nextLearner, sessionAssignment }) => {
                  // Real answers become real evidence on the synthetic learner,
                  // so the Path the teacher returns to has actually moved.
                  setSlots((current) => current.map((slot) => (slot.id !== activeSlot.id ? slot : {
                    ...slot,
                    session: {
                      ...slot.session,
                      learner: nextLearner,
                      extraAssignments: [
                        ...(slot.session?.extraAssignments || []).filter((entry) => entry.id !== sessionAssignment.id),
                        sessionAssignment,
                      ],
                    },
                  })));
                }}
                onStartAssignment={(id, index) => {
                  // Opening work from the simulated dashboard drops the teacher
                  // into the question bench on that exact question, which is
                  // where the outcome controls act.
                  setAssignmentId(id);
                  setQuestionIndex(Number(index) || 0);
                  setMode('bench');
                }}
              />
            ) : (
              <div style={{ textAlign: 'left' }}>
                <h3 style={heading}>Start as a fresh student</h3>
                <p style={{ color: '#5f6368', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
                  This shows the student&apos;s own dashboard, Path and CCMR screens for an isolated
                  simulated learner. Everything you do to them here stays here.
                </p>
                <button type="button" onClick={() => startSession()} style={{ ...smallButton, background: '#1a73e8', color: '#fff', border: 0, minHeight: 44 }}>
                  Start as fresh student
                </button>
              </div>
            )}
          </div>

          <aside style={{ ...panel, position: 'sticky', top: 12 }}>
            <h3 style={heading}>Teacher controls</h3>

            <label style={{ fontWeight: 800, fontSize: 13, display: 'block' }}>Simulation
              <select value={activeSlot.id} onChange={(event) => setActiveSlotId(event.target.value)} style={input}>
                {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 14px' }}>
              <button type="button" onClick={addSlot} style={smallButton}>New</button>
              <button type="button" onClick={() => { const copied = duplicateSlot(slots, activeSlot.id); setSlots(copied); setActiveSlotId(copied[copied.indexOf(copied.find((slot) => slot.name.endsWith('(copy)')))]?.id || activeSlot.id); }} style={smallButton}>Duplicate</button>
              <button type="button" onClick={() => { const name = window.prompt('Rename this simulation', activeSlot.name); if (name) setSlots((current) => renameSlot(current, activeSlot.id, name)); }} style={smallButton}>Rename</button>
              <button type="button" onClick={() => { const next = removeSlot(slots, activeSlot.id); setSlots(next); setActiveSlotId(next[0].id); }} style={smallButton}>Delete</button>
            </div>

            <label style={{ fontWeight: 800, fontSize: 13, display: 'block' }}>Course
              <select
                value={simulationCourseId}
                onChange={(event) => {
                  const nextCourse = event.target.value;
                  setSimulationCourseId(nextCourse);
                  setSimulationTargetTeks(getWheelTeksForCourse(nextCourse)[0] || '');
                  setSession(null);
                }}
                style={input}
              >
                {COURSES.map((course) => <option key={course.id} value={course.id}>{course.label}</option>)}
              </select>
            </label>

            <label style={{ fontWeight: 800, fontSize: 13, display: 'block', marginTop: 12 }}>Starting skill
              <select value={simulationTargetTeks} onChange={(event) => { setSimulationTargetTeks(event.target.value); setSession(null); }} style={input}>
                {courseWheelTeks.map((code) => <option key={code} value={code}>{code} — {getTexasStandard(code)?.description || 'Texas standard'}</option>)}
              </select>
            </label>

            <label style={{ fontWeight: 800, fontSize: 13, display: 'block', marginTop: 12 }}>Starting state
              <select value={profileId} onChange={(event) => startSession(event.target.value)} style={input}>
                {STARTING_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>

            <label style={{ fontWeight: 800, fontSize: 13, display: 'block', marginTop: 12 }}>Simulated date
              <input
                type="date"
                value={simulatedDateInputValue(activeSlot)}
                onChange={(event) => setSlots((current) => updateSlot(current, activeSlot.id, setSimulatedDate(activeSlot, event.target.value)))}
                style={input}
              />
            </label>
            <p style={{ margin: '6px 0 14px', fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>
              {describeSimulatedDate(activeSlot)}. The real calendar applies at this date, so what is
              current, upcoming and open all move with it. Nothing about your classes changes.
            </p>

            {session && (
              <>
                <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 13 }}>Force an outcome</p>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>
                  {assignment && question
                    ? `Question Bench: ${assignment.title || 'selected assignment'}, question ${questionIndex + 1}${teksCodes.length ? ` · ${teksCodes.join(', ')}` : ''}.`
                    : `Path-only simulation · ${simulationTargetTeks || 'choose a starting skill'}. Whole-skill force controls remain available without an assignment.`}
                </p>
                {!teksCodes.length && !simulationTargetTeks && (
                  // Forcing a skill state needs a skill. Without this the two
                  // skill buttons would appear to work and change nothing.
                  <p style={{ margin: '0 0 8px', padding: '8px 10px', borderRadius: 8, background: '#fef7e0', color: '#7a4f00', fontSize: 12, lineHeight: 1.5 }}>
                    Choose a Path starting skill or an aligned Question Bench item before forcing a whole-skill state.
                  </p>
                )}
                <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                  {OUTCOME_CONTROLS.map((control) => (
                    <button
                      key={control.id}
                      type="button"
                      onClick={() => runOutcome(control.id)}
                      title={control.hint}
                      disabled={(SKILL_LEVEL_CONTROLS.has(control.id)
                        ? (!teksCodes.length && !simulationTargetTeks)
                        : !pathController?.canForce)}
                      style={{ ...smallButton, textAlign: 'left', opacity: (SKILL_LEVEL_CONTROLS.has(control.id)
                        ? (!teksCodes.length && !simulationTargetTeks)
                        : !pathController?.canForce) ? 0.5 : 1 }}
                    >
                      {control.label}
                    </button>
                  ))}
                </div>

                <div style={{ margin: '0 0 14px', padding: 11, border: '1px solid #d2e3fc', borderRadius: 9, background: '#f8fbff' }}>
                  <p style={{ margin: '0 0 7px', fontWeight: 900, fontSize: 13, color: '#174ea6' }}>Current Path question QA</p>
                  <p style={{ margin: '0 0 8px', fontSize: 11, color: '#5f6368', lineHeight: 1.45 }}>
                    Bank quality: {pathBankQuality.ready} ready · {pathBankQuality.candidate} candidates · {pathBankQuality.blocked} blocked · {pathBankQuality.total} total
                  </p>
                  {pathController?.question ? (
                    <>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: '#3c4043' }}>
                        <strong>{pathController.question.teksCode || pathController.question.alignmentKey || 'Current skill'}</strong>
                        {pathController.question.sourceBankQuestionId && <> · <code>{pathController.question.sourceBankQuestionId}</code></>}
                      </div>
                      {activeQuestionAudit && (
                        <div style={{ marginTop: 7 }}>
                          <span style={pill(activeQuestionAudit.level === 'ready' ? '#137333' : activeQuestionAudit.level === 'blocked' ? '#a50e0e' : '#7a4f00')}>
                            {activeQuestionAudit.level.toUpperCase()} · {activeQuestionAudit.score}/100
                          </span>
                        </div>
                      )}
                      {/* Why the engine chose THIS family. The student never
                          sees any of it; a teacher asking "why this question?"
                          should not have to infer the answer. */}
                      {[
                        pathController.question.selectionReason,
                        pathController.question.selectedBand,
                        pathController.question.representation,
                        pathController.question.selectedTaskType,
                        pathController.question.contentQuality,
                      ].some((value) => value !== null && value !== undefined) && (
                        <dl style={{ margin: '8px 0 0', padding: '8px 9px', borderRadius: 7, background: '#fff', border: '1px solid #e0e4e9', fontSize: 11, lineHeight: 1.5, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px' }}>
                          {pathController.question.selectionReason && (
                            <>
                              <dt style={{ fontWeight: 800, color: '#5f6368' }}>Chosen because</dt>
                              <dd style={{ margin: 0 }}>{SELECTION_REASON_LABEL[pathController.question.selectionReason] || pathController.question.selectionReason.replace(/_/g, ' ')}</dd>
                            </>
                          )}
                          {pathController.question.selectedBand !== null && pathController.question.selectedBand !== undefined && (
                            <>
                              <dt style={{ fontWeight: 800, color: '#5f6368' }}>Band</dt>
                              <dd style={{ margin: 0 }}>
                                {pathController.question.selectedBand}
                                {pathController.question.preferredBand !== null && pathController.question.preferredBand !== undefined
                                  && ` (readiness band ${pathController.question.preferredBand})`}
                              </dd>
                            </>
                          )}
                          {pathController.question.representation && (
                            <>
                              <dt style={{ fontWeight: 800, color: '#5f6368' }}>Representation</dt>
                              <dd style={{ margin: 0 }}>{pathController.question.representation}</dd>
                            </>
                          )}
                          {pathController.question.selectedTaskType && (
                            <>
                              <dt style={{ fontWeight: 800, color: '#5f6368' }}>Thinking</dt>
                              <dd style={{ margin: 0 }}>{pathController.question.selectedTaskType}</dd>
                            </>
                          )}
                          {pathController.question.contentQuality && (
                            <>
                              <dt style={{ fontWeight: 800, color: '#5f6368' }}>Content state</dt>
                              <dd style={{ margin: 0 }}>{pathController.question.contentQuality}</dd>
                            </>
                          )}
                          {pathController.question.unusedFamiliesRemaining !== null && pathController.question.unusedFamiliesRemaining !== undefined && (
                            <>
                              <dt style={{ fontWeight: 800, color: '#5f6368' }}>Unused families left</dt>
                              <dd style={{ margin: 0 }}>
                                {pathController.question.unusedFamiliesRemaining}
                                {pathController.question.isRepeatFamily ? ' · this one is a repeat' : ''}
                              </dd>
                            </>
                          )}
                        </dl>
                      )}
                      {activeBankQuestion?.responseFields?.some((field) => Object.prototype.hasOwnProperty.call(field || {}, 'expected')) && (
                        <div style={{ marginTop: 8, padding: '8px 9px', borderRadius: 7, background: '#fff', border: '1px solid #e0e4e9', fontSize: 12 }}>
                          <strong>Secure expected answer</strong>
                          {activeBankQuestion.responseFields.filter((field) => Object.prototype.hasOwnProperty.call(field || {}, 'expected')).map((field) => (
                            <div key={field.id || field.label} style={{ marginTop: 4 }}>{field.label || field.id || 'Answer'}: <code>{String(field.expected)}</code></div>
                          ))}
                        </div>
                      )}
                      {activeQuestionAudit?.issues?.length > 0 && (
                        <ul style={{ margin: '8px 0 0', paddingLeft: 17, fontSize: 11, color: '#5f6368', lineHeight: 1.45 }}>
                          {activeQuestionAudit.issues.slice(0, 4).map((issue) => <li key={issue.code}>{issue.message}</li>)}
                        </ul>
                      )}
                      {activeBankQuestion && (
                        <button
                          type="button"
                          style={{ ...smallButton, minHeight: 34, padding: '5px 9px', marginTop: 8, width: '100%' }}
                          onClick={async () => {
                            const text = buildPathQuestionRevisionBrief(activeBankQuestion, activeQuestionAudit);
                            try {
                              await navigator.clipboard.writeText(text);
                              notify('Copied a revision brief for this secure bank question.');
                            } catch {
                              onCopyText?.(text);
                              notify('Opened the revision brief so you can copy it.');
                            }
                          }}
                        >
                          Copy AI revision brief
                        </button>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#5f6368' }}>Start practice to inspect the exact secure bank item being shown.</p>
                  )}
                </div>

                <div style={{ margin: '0 0 14px', padding: 11, border: '1px solid #dadce0', borderRadius: 9, background: '#fff' }}>
                  <p style={{ margin: '0 0 7px', fontWeight: 900, fontSize: 13, color: '#174ea6' }}>Simulation event log</p>
                  {simulationEvents.length ? (
                    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 7 }}>
                      {simulationEvents.slice(0, 6).map((event) => (
                        <li key={event.id} style={{ padding: '7px 8px', borderRadius: 7, background: event.kind === 'error' ? '#fce8e6' : event.isCorrect === true ? '#e6f4ea' : '#f8f9fa', fontSize: 11, lineHeight: 1.45 }}>
                          <strong style={{ color: event.kind === 'error' ? '#a50e0e' : event.isCorrect === true ? '#137333' : '#3c4043' }}>{event.label}</strong>
                          <div style={{ color: '#5f6368', marginTop: 2 }}>{event.detail}</div>
                          {event.decision?.explanation && <div style={{ color: '#174ea6', marginTop: 3 }}><strong>Why next:</strong> {event.decision.explanation}</div>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#5f6368' }}>Answer a Path question or use a force control. Every result and route decision will appear here.</p>
                  )}
                </div>

                <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 13 }}>Snapshots</p>
                <input
                  value={snapshotLabel}
                  onChange={(event) => setSnapshotLabel(event.target.value)}
                  placeholder="e.g. Systems — before Q4"
                  style={input}
                />
                <button type="button" onClick={takeSnapshot} style={{ ...smallButton, marginTop: 6, width: '100%' }}>Save snapshot</button>
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                  {(activeSlot.snapshots || []).map((snapshot) => (
                    <li key={snapshot.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                      <span style={{ flex: '1 1 120px', minWidth: 0 }}>{snapshot.label}</span>
                      <button type="button" onClick={() => restore(snapshot.id)} style={{ ...smallButton, minHeight: 34, padding: '4px 9px' }}>Restore</button>
                    </li>
                  ))}
                  {!(activeSlot.snapshots || []).length && (
                    <li style={{ fontSize: 12, color: '#5f6368' }}>None yet. Save one before a branch you want to come back to.</li>
                  )}
                </ul>

                {runnableAssignments.length > 0 && (
                  <button type="button" onClick={() => setMode('bench')} style={{ ...smallButton, marginTop: 14, width: '100%' }}>
                    Open the question bench
                  </button>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {mode === 'bench' && !runnableAssignments.length && (
        <div style={panel}>
          <h3 style={heading}>Question Bench</h3>
          <p style={{ margin: 0, color: '#5f6368', lineHeight: 1.6 }}>
            No classroom assignment exists yet. That does <strong>not</strong> block My Math Path — switch to Student experience to run the secure Path bank.
            Question Bench appears after you create an assignment because its job is to QA a particular authored assignment question.
          </p>
          <button type="button" onClick={() => { setMode('experience'); if (!session) startSession(); }} style={{ ...smallButton, marginTop: 12, background: '#1a73e8', color: '#fff', border: 0 }}>Open Student experience</button>
        </div>
      )}

      {mode === 'bench' && runnableAssignments.length > 0 && (
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
          <button type="button" onClick={() => setMode('experience')} style={{ ...smallButton, minHeight: 44 }}>Back to the student experience</button>
        </div>
      </div>
      )}

      {mode === 'bench' && runnableAssignments.length > 0 && session && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0 }}>
          <div style={panel}>
            <h3 style={heading}>2. One question, in the real renderer</h3>
            <p style={{ color: '#5f6368', fontSize: 12, margin: '0 0 12px' }}>
              This is the student question renderer itself, not a teacher copy of it.
            </p>
            <p style={{ color: '#5f6368', fontSize: 12, margin: '0 0 12px' }}>
              Answer it as a student would. Submitting records a real attempt against the simulated
              learner through the attempt policy — the force controls below are shortcuts for the
              same thing, not a different thing.
            </p>
            {question
              ? (
                <QuestionEngine
                  question={question}
                  questionRecord={benchRecord}
                  maximumAttempts={3}
                  draftKey={`simulator-${assignment.id}-${questionIndex}`}
                  feedback={null}
                  onGrade={async (isCorrect, questionDetails, parts, supportUsage) => {
                    // The teacher's own answer is evidence. Previously this was
                    // discarded and only the force buttons moved the learner.
                    const applied = applySimulationOutcome({
                      learner: session.learner,
                      assignmentId: assignment.id,
                      questionIndex,
                      outcomeId: isCorrect ? 'correct' : 'incorrect',
                      questionDetails: String(questionDetails || '').slice(0, 160),
                    });
                    setSession((current) => ({
                      ...current,
                      learner: applied.learner,
                      timeline: [...current.timeline, {
                        ...applied.event,
                        label: isCorrect ? 'Answered correctly' : 'Answered incorrectly',
                        detail: `${applied.event.detail} Support: ${supportUsage?.hintUsed ? 'hint used' : 'independent'}.`,
                      }],
                    }));
                    return null;
                  }}
                />
              )
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
              {evaluated?.learningProfile && <div style={{ marginBottom: 12 }}><StudentPerformanceBadge profile={evaluated.learningProfile} studentName={session?.learner?.name || 'Simulated student'} /></div>}
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
            <h3 style={heading}>6. CCMR pathways</h3>
            <p style={{ color: '#5f6368', fontSize: 12, margin: '0 0 12px', lineHeight: 1.55 }}>
              The same skill seen through each assessment. Set a framework proficiency to check the
              routing — core mastery is a separate record and will not move, which is how a
              <strong> transfer gap</strong> (strong course performance, weak assessment format) becomes visible.
            </p>
            <AssessmentSkillInspector
              skillId={activeSkillId}
              pathOptions={ccmrPathOptions}
              assessmentEvidence={assessmentEvidence}
              directIndex={directIndex}
              onSimulate={simulateAssessment}
            />
          </div>

          <div style={panel}>
            <h3 style={heading}>7. Path history</h3>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.65 }}>
              {session.timeline.map((entry) => (
                <li key={entry.id} style={{ marginBottom: 4 }}>
                  <strong>{entry.label}</strong> — {entry.detail}
                  {/* Evidence is recorded by the real attempt policy and cannot
                      be un-recorded, so rewinding restores the nearest snapshot
                      at or before this point and says so. */}
                  <button type="button" onClick={() => rewind(entry.id)} style={{ ...smallButton, marginLeft: 8, minHeight: 30, padding: '2px 8px', fontSize: 11 }}>
                    Rewind to here
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div style={panel}>
            <h3 style={heading}>8. Inspector &amp; feedback</h3>
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
