/*
 * A TIMED WARM-UP, CLOSED AND REOPENED UNDER UNFINISHED WORK — IN A REAL BROWSER.
 *
 * The production incident (lmr-wu-1, `linear.representationSort`): a student
 * sorts some cards, does not submit, the Warm-Up timer runs out, the teacher
 * reopens the Warm-Up, and the question has to come back with the student's
 * cards where they left them.
 *
 * Everything that decides the outcome is the platform's own code:
 *   - the assignment is compiled through the teacher import chain, exactly as
 *     linearMultipleRepresentationsMain.jsx does (final or ?family=1);
 *   - open / closed is `getWarmupState` on the page clock, which the driver
 *     advances with Playwright's fake timers;
 *   - the teacher's Close / Reopen / Timer is `applyWarmupTeacherControl`, the
 *     function the teacher handler in App.jsx writes to the assignment;
 *   - QuestionEngine is mounted with App.jsx's key shape, lock rule and draft
 *     key, so a lock flips under a MOUNTED question and a refresh re-reads
 *     only what is durable.
 *
 * Driven by tests/browser/warmupReopenDraft.mjs.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { getWarmupState, localDateKey } from '../../src/assignmentLifecycle.js';
import { applyWarmupTeacherControl } from '../../functions/shared/sectionDeadline.mjs';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import FINAL_TEXT from '../../docs/assignments/algebra1-linear-multiple-representations-final-v5.json?raw';
import FAMILY_TEXT from '../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json?raw';
import { MathfieldElement } from 'mathlive';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const FAMILY = params.get('family') === '1';
const ASSIGNMENT = FAMILY ? 'wu-reopen-family' : 'wu-reopen-final';
const STUDENT = params.get('student') || 'wu-reopen-student-a';
const CLASS_ID = 'class-p3';
const PERIOD = 'Period 3';

const compile = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`Preflight rejected the assignment:\n${model.errors.join('\n')}`);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return rebuildV5SectionsFromQuestions(model.assignmentV5, questions);
};

const sections = compile(FAMILY ? FAMILY_TEXT : FINAL_TEXT);
const allQuestions = sections.flatMap((section) => section.questions.map((question, index) => ({ section, question, index })));

/*
 * The bell: Period 3 is 09:00–09:50 today, as a one-day modified schedule so
 * no A/B designation is needed. The Warm-Up opens at 08:53 and its default
 * cutoff is 09:10.
 */
const today = localDateKey(Date.now());
const SCHEDULE = {
  version: 2,
  modifiedSchedules: { [today]: { periods: { [PERIOD]: { enabled: true, start: '09:00', end: '09:50' } } } },
};

// The live assignment document the teacher writes and every student reads.
// Persisted in localStorage so a refresh sees the reopen, like Firestore would.
const ASSIGNMENT_STORE = `wu-reopen-assignment:${ASSIGNMENT}`;
const readAssignment = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ASSIGNMENT_STORE) || 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch { /* fresh */ }
  return {
    id: ASSIGNMENT,
    assignedClassIds: [CLASS_ID],
    warmup: { enabled: true, minutesBeforeStart: 7, closeMinutesAfterStart: 10, instructionDatesByClassId: { [CLASS_ID]: today } },
  };
};
let assignment = readAssignment();

// The grade row: what a Submit records. Persisted for the same reason.
const TRACKER_STORE = `wu-reopen-tracker:${ASSIGNMENT}:${STUDENT}`;
let tracker = (() => { try { return JSON.parse(window.localStorage.getItem(TRACKER_STORE) || '{}') || {}; } catch { return {}; } })();

const errors = [];
const noteError = (source, error, extra = {}) => {
  errors.push({ source, message: String(error?.message || error), stack: String(error?.stack || ''), ...extra });
};
window.addEventListener('error', (event) => noteError('window.error', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => noteError('unhandledrejection', event.reason));

const listeners = new Set();
let current = Math.max(0, allQuestions.findIndex((entry) => entry.question.questionId === (params.get('q') || 'lmr-wu-1')));
let generation = 0;
let tick = 0;
const notify = () => listeners.forEach((listen) => listen((value) => value + 1));

const draftKeyFor = (flat) => buildQuestionDraftKey({
  studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: flat, variantIndex: 0, sessionMode: 'graded',
});

const warmupState = () => getWarmupState({ assignment, schedule: SCHEDULE, classId: CLASS_ID, classPeriod: PERIOD, nowValue: Date.now() });

/*
 * App.jsx's student clock, in miniature: re-render at the next Warm-Up
 * transition (+100 ms), and on every assignment update. A callback armed for
 * the ORIGINAL close is still pending when the teacher reopens — exactly the
 * stale timer the reopen must survive.
 */
const armTransitionTimer = () => {
  const state = warmupState();
  const target = state.status === 'waiting'
    ? state.opensAt?.getTime()
    : state.status === 'active'
      ? (state.autoCloseScheduled ? state.autoCloseAt?.getTime() : state.endsAt?.getTime()) + 100
      : null;
  if (!Number.isFinite(target) || target <= Date.now()) return;
  window.setTimeout(() => { tick += 1; notify(); armTransitionTimer(); }, Math.max(50, target - Date.now()));
};

function Harness() {
  const [, setVersion] = useState(0);
  useEffect(() => { listeners.add(setVersion); return () => listeners.delete(setVersion); }, []);
  const { section, question } = allQuestions[current];
  const flat = current;
  const draftKey = useMemo(() => draftKeyFor(flat), [flat]);
  const state = warmupState();
  const isWarmup = section.role === 'warmup';
  const record = tracker[flat] || null;
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 16px' }} data-question-id={question.questionId} data-warmup-status={state.status}>
      <nav aria-label="Assignment questions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {allQuestions.map((entry, index) => (
          <button key={entry.question.questionId} type="button" data-nav={entry.question.questionId} onClick={() => { current = index; notify(); }}>
            {entry.question.questionId}
          </button>
        ))}
      </nav>
      <p data-warmup-banner>Warm-Up: {state.status}{state.status === 'active' && state.endsAt ? ` until ${state.endsAt.toISOString()}` : ''}</p>
      <QuestionEngine
        key={`${ASSIGNMENT}-${flat}-${record?.variantIndex || 0}-onTime-draft${generation}`}
        question={question}
        questionRecord={record}
        generationKey={`${ASSIGNMENT}|${STUDENT}|${flat}|variant:0`}
        onGrade={(isCorrect) => {
          const previous = tracker[flat] || { attemptCount: 0, totalAttempts: 0, variantIndex: 0 };
          tracker = {
            ...tracker,
            [flat]: {
              ...previous,
              status: isCorrect ? 'correct' : 'attempted',
              attemptCount: previous.attemptCount + 1,
              totalAttempts: previous.totalAttempts + 1,
              lastAttemptAt: new Date().toISOString(),
              questionId: question.questionId,
            },
          };
          window.localStorage.setItem(TRACKER_STORE, JSON.stringify(tracker));
          notify();
          return null;
        }}
        onStepGrade={() => {}}
        studentProfile={{}}
        activityRole={section.role}
        maximumAttempts={section.attemptsAllowed || 3}
        assignmentLocked={isWarmup && state.status !== 'active'}
        assignmentLockedMessage={isWarmup && state.status === 'closed' ? 'Your teacher closed the Warm-Up for this class.' : ''}
        draftKey={draftKey}
        assignmentId={ASSIGNMENT}
        executionScope="student"
      />
    </div>
  );
}

window.__wu = {
  errors: () => [...errors],
  state: () => {
    const state = warmupState();
    return {
      status: state.status,
      endsAt: state.endsAt?.toISOString() || null,
      windowGeneration: state.windowGeneration ?? null,
      openedAt: state.openedAt?.toISOString?.() || null,
    };
  },
  teacher: (action, options = {}) => {
    const result = applyWarmupTeacherControl({
      assignment,
      classId: CLASS_ID,
      action,
      nowMs: Date.now(),
      dateKey: localDateKey(Date.now()),
      windowEndMs: getWarmupState({ assignment, schedule: SCHEDULE, classId: CLASS_ID, classPeriod: PERIOD, nowValue: Date.now() }).window.end.getTime(),
      timerMinutes: options.timerMinutes,
      teacherIdentity: 'teacher@example.test',
    });
    assignment = { ...assignment, warmup: result.warmup };
    window.localStorage.setItem(ASSIGNMENT_STORE, JSON.stringify(assignment));
    notify();
    armTransitionTimer();
    return window.__wu.state();
  },
  remount: () => { generation += 1; notify(); },
  go: (questionId) => {
    const index = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    if (index < 0) return false;
    current = index;
    notify();
    return true;
  },
  work: (questionId) => {
    const index = allQuestions.findIndex((entry) => entry.question.questionId === questionId);
    try { return JSON.parse(window.localStorage.getItem(`${draftKeyFor(index)}:work:tool`))?.value ?? null; } catch { return null; }
  },
  workKey: (questionId) => `${draftKeyFor(allQuestions.findIndex((entry) => entry.question.questionId === questionId))}:work:tool`,
  tracker: () => JSON.parse(JSON.stringify(tracker)),
  ticks: () => tick,
  questionIds: () => allQuestions.map((entry) => `${entry.section.role}:${entry.question.questionId}:${entry.question.type}`),
};

createRoot(document.getElementById('root'), {
  onUncaughtError: (error, info) => noteError('react.uncaught', error, { componentStack: info?.componentStack || '' }),
  onCaughtError: (error, info) => noteError('react.caught', error, { componentStack: info?.componentStack || '' }),
}).render(<Harness />);
armTransitionTimer();
