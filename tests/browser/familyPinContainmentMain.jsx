/*
 * A QUESTION FAMILY PIN THAT WILL NOT REPLAY — IN A REAL BROWSER.
 *
 * Mounts the real QuestionEngine (and, in ?mode=recovery, the real
 * SectionRecoveryRunner) the way the hosts do, with navigation OUTSIDE the
 * engine exactly as App.jsx has it:
 *
 *   ?mode=student    three family-backed questions. Q1's canonical pin names an
 *                    instance its family no longer produces (the record holds
 *                    two attempts against it); Q2 has a valid canonical pin;
 *                    Q3 has none. `&q1=correct` makes Q1 an already-correct
 *                    answer. `&fault=1` makes Q3 throw while it is prepared
 *                    until the driver clears `window.__fault`.
 *                    `&context=null-quantity` gives Q3 a damaged authored
 *                    word-problem context instead (real data, no injection).
 *   ?mode=preview    the same assignment as a teacher preview: Q1 references a
 *                    family this build does not have, Q3 throws (fault).
 *   ?mode=recovery   a DOL Recovery assessment whose first pinned item will not
 *                    replay; items 2 and 3 are fine (`&nullPin=1`: item 2's
 *                    stored pin was dropped as unreadable).
 *   ?mode=recovery-practice  Practice with no next item to offer.
 *
 * The family context comes from buildStudentFamilyContext and the device pin
 * from writeLocalDeliveryPin, the functions App.jsx calls. Driven by
 * tests/browser/familyPinContainment.mjs.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import SectionRecoveryRunner from '../../src/components/student/SectionRecoveryRunner.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { buildStudentFamilyContext, writeLocalDeliveryPin } from '../../src/platform/generation/familyDelivery.js';
import {
  normalizeDeliveryPin,
  planSeatAdditions,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../functions/shared/questionGenerationIdentity.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const MODE = params.get('mode') || 'student';
const Q1_STATUS = params.get('q1') || 'attempted';
const FAULT = params.get('fault') === '1';
const STUDENT = 'harness-student-ben';
const CLASS_ID = 'class-p2';
const ASSIGNMENT_ID = `pin-containment-${MODE}`;

window.__fault = FAULT;

const twoStep = { questionId: 'q1-two-step', type: 'stepAlgebra', prompt: 'Solve for x.', activityRole: 'classwork', questionFamily: { id: MODE === 'preview' ? 'linear.noSuchFamilyInThisBuild' : 'linear.twoStepEquation' } };
const intercepts = { questionId: 'q2-intercepts', type: 'multiAnswer', prompt: 'Find both intercepts.', activityRole: 'classwork', questionFamily: { id: 'functions.identifyIntercepts' } };
const area = {
  questionId: 'q3-area',
  type: 'multiAnswer',
  prompt: 'A garden is {{w}} m wide and {{l}} m long. What is its area in square meters?',
  activityRole: 'classwork',
  generator: { parameters: { w: { type: 'int', min: 3, max: 12 }, l: { type: 'int', min: 4, max: 15 } }, derived: { area: 'w*l' }, constraints: ['w!=l'] },
  answerFields: [{ id: 'area', label: 'Area', inputProfile: 'number', answer: '{{area}}' }],
  questionFamily: { scope: 'assignment' },
};
// An unanticipated failure while preparing Q3: reading its prompt throws
// until the driver clears the fault. Everything before the response module
// reads it, so this is a throw ABOVE QuestionModuleBoundary.
const faulty = (question) => {
  if (!FAULT) return question;
  const copy = { ...question };
  Object.defineProperty(copy, 'prompt', {
    enumerable: true,
    get: () => {
      if (window.__fault) throw new TypeError('harness: transient failure while preparing the question');
      return question.prompt;
    },
  });
  return copy;
};
// Real authored data, not an injected fault: a word-problem context whose
// quantity list holds a null (a hand-edited or partially imported question).
// The family builds its instance fine; the word-problem layer that runs next,
// still above QuestionModuleBoundary, read `null.id`.
const DAMAGED_CONTEXT = params.get('context') === 'null-quantity';
const withContext = (question) => (DAMAGED_CONTEXT ? { ...question, context: { scenario: 'A rectangular garden', quantities: [null] } } : question);
const QUESTIONS = [twoStep, intercepts, faulty(withContext(area))];

const assignment = { id: ASSIGNMENT_ID, schemaVersion: 5, generationSeats: { version: 1, byClassId: {} } };
assignment.generationSeats.byClassId[CLASS_ID] = planSeatAdditions({ assignment, classId: CLASS_ID, studentIds: ['harness-student-ana', STUDENT, 'harness-student-cy'] });

const deliveryFor = (question, storageIndex) => resolveFamilyQuestionInstance({
  question,
  assignmentId: ASSIGNMENT_ID,
  storageIndex,
  allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo: resolveLearnerSeat({ assignment, studentId: STUDENT, classId: CLASS_ID }), variant: 0 }),
}).delivery;

// The grade row the server would hold. Persisted so a reload sees it.
const TRACKER_STORE = `pin-containment-tracker:${ASSIGNMENT_ID}`;
const initialTracker = () => {
  if (MODE !== 'student') return {};
  const q1Pin = deliveryFor({ ...twoStep, questionFamily: { id: 'linear.twoStepEquation' } }, 0);
  return {
    0: {
      status: Q1_STATUS,
      attemptCount: Q1_STATUS === 'correct' ? 1 : 2,
      totalAttempts: Q1_STATUS === 'correct' ? 1 : 2,
      variantIndex: 0,
      lastAttemptAt: '2026-10-01T15:00:00.000Z',
      lastResponseKey: 'x=4',
      questionId: twoStep.questionId,
      // The instance this record was graded against, which the family no
      // longer produces (its generator was re-tuned after these attempts).
      familyDelivery: { ...normalizeDeliveryPin(q1Pin), fingerprint: 'linear.twoStepEquation:1|1|1' },
    },
    1: {
      status: 'attempted', attemptCount: 1, totalAttempts: 1, variantIndex: 0, questionId: intercepts.questionId,
      familyDelivery: normalizeDeliveryPin(deliveryFor(intercepts, 1)),
    },
  };
};
let tracker = (() => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TRACKER_STORE) || 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch { /* fresh */ }
  const fresh = initialTracker();
  window.localStorage.setItem(TRACKER_STORE, JSON.stringify(fresh));
  return fresh;
})();

const events = { grades: 0, stepGrades: 0, checkpoints: 0, deliveries: [] };
const errors = [];
const noteError = (source, error, extra = {}) => {
  errors.push({ source, message: String(error?.message || error), name: String(error?.name || ''), ...extra });
};
window.addEventListener('error', (event) => noteError('window.error', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => noteError('unhandledrejection', event.reason));

const listeners = new Set();
let current = Math.max(0, Number(params.get('start') || 0));
const notify = () => listeners.forEach((listen) => listen((value) => value + 1));

function StudentHarness({ preview }) {
  const [, setVersion] = useState(0);
  useEffect(() => { listeners.add(setVersion); return () => listeners.delete(setVersion); }, []);
  const question = QUESTIONS[current];
  const record = tracker[current] || null;
  const familyContext = buildStudentFamilyContext({
    assignment,
    question,
    storageIndex: current,
    studentId: preview ? null : STUDENT,
    classId: CLASS_ID,
    record,
    preview,
  });
  const next = current + 1 < QUESTIONS.length ? current + 1 : null;
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 16px' }} data-harness-question={current}>
      <nav aria-label="Assignment questions" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {QUESTIONS.map((entry, index) => (
          <button key={index} type="button" data-nav={index} onClick={() => { current = index; notify(); }}>
            Question {index + 1}
          </button>
        ))}
      </nav>
      <main data-question-stage>
        <QuestionEngine
          key={`${ASSIGNMENT_ID}-${current}-${record?.variantIndex || 0}-${preview ? 'preview' : 'open'}`}
          question={question}
          questionRecord={record}
          generationKey={`${ASSIGNMENT_ID}|${preview ? 'teacher-preview' : STUDENT}|${current}|variant:${record?.variantIndex || 0}`}
          familyContext={familyContext}
          onFamilyDelivery={preview ? null : (delivery) => {
            events.deliveries.push({ slot: delivery.slot, variant: delivery.variant });
            writeLocalDeliveryPin({ studentId: STUDENT, delivery });
          }}
          onGrade={() => { events.grades += 1; return null; }}
          onStepGrade={() => { events.stepGrades += 1; return null; }}
          onResponseCheckpoint={preview ? null : () => { events.checkpoints += 1; }}
          studentProfile={preview ? null : {}}
          activityRole="classwork"
          maximumAttempts={3}
          draftKey={buildQuestionDraftKey({ studentId: preview ? 'teacher-preview' : STUDENT, assignmentId: ASSIGNMENT_ID, questionIndex: current, variantIndex: record?.variantIndex || 0, sessionMode: 'graded' })}
          assignmentId={ASSIGNMENT_ID}
          executionScope={preview ? 'teacherPreview' : 'student'}
          onNextQuestion={next === null ? null : () => { current = next; notify(); }}
          nextQuestionLabel={next === null ? '' : `Question ${next + 1}`}
        />
      </main>
    </div>
  );
}

// A DOL Recovery assessment as the server planned it: three pinned items.
const recoveryEntry = () => {
  const slot = (question, index) => resolveFamilyQuestionInstance({
    question,
    assignmentId: ASSIGNMENT_ID,
    storageIndex: index,
    slotKey: `${ASSIGNMENT_ID}|recovery:dol:o1|${question.questionId}`,
    allocation: { seat: index, variant: 0, stride: 1, index, basis: 'provisional' },
  }).delivery;
  const p0 = slot(twoStep, 0);
  return {
    section: 'dol',
    label: 'DOL Recovery',
    state: 'in-progress',
    plan: {
      opportunity: 1,
      items: [
        { itemId: 'item-1', storageIndex: 0, questionId: twoStep.questionId, pin: { ...normalizeDeliveryPin(p0), fingerprint: 'linear.twoStepEquation:1|1|1' } },
        // `&nullPin=1`: a plan item whose pin normalizeRecoveryRecord dropped.
        { itemId: 'item-2', storageIndex: 1, questionId: intercepts.questionId, pin: params.get('nullPin') === '1' ? null : normalizeDeliveryPin(slot(intercepts, 1)) },
        { itemId: 'item-3', storageIndex: 2, questionId: area.questionId, pin: normalizeDeliveryPin(slot(area, 2)) },
      ],
    },
    questionsByIndex: { 0: twoStep, 1: intercepts, 2: area },
  };
};

function RecoveryHarness() {
  const [entry] = useState(recoveryEntry);
  // ?mode=recovery-practice: Practice whose family has nothing unseen left,
  // so the server offers no next item (nextPracticeItem: null).
  const practice = MODE === 'recovery-practice';
  return (
    <SectionRecoveryRunner
      mode={practice ? 'practice' : 'assessment'}
      assignment={assignment}
      entry={practice ? { ...entry, state: 'locked', masteryPercent: 40, nextPracticeItem: null } : entry}
      studentId={STUDENT}
      studentProfile={{}}
      onExit={() => { window.__exited = true; }}
      onRecord={() => {}}
      onStartAssessment={() => {}}
    />
  );
}

window.__pins = {
  errors: () => [...errors],
  events: () => JSON.parse(JSON.stringify(events)),
  tracker: () => JSON.parse(JSON.stringify(tracker)),
  trackerStored: () => window.localStorage.getItem(TRACKER_STORE),
  clearFault: () => { window.__fault = false; },
  go: (index) => { current = index; notify(); },
  current: () => current,
  devicePins: () => Object.keys(window.localStorage).filter((key) => key.startsWith('mm.familyDelivery.v1')).sort(),
  diagnostics: () => JSON.parse(window.localStorage.getItem('mm:client-diagnostics') || '[]'),
};

createRoot(document.getElementById('root'), {
  onUncaughtError: (error, info) => noteError('react.uncaught', error, { componentStack: info?.componentStack || '' }),
  onCaughtError: (error) => noteError('react.caught', error),
}).render(MODE.startsWith('recovery') ? <RecoveryHarness /> : <StudentHarness preview={MODE === 'preview'} />);
