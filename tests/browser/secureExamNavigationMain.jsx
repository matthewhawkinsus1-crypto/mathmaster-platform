// The secure test a student moves around in, mounted for real in a browser.
// Driven by tests/browser/secureExamNavigation.mjs; see that file's header.
//
//   ?scenario=practice    the student's Tests & Exams list with a Digital SAT
//                         practice test (two modules, results released at once)
//   ?scenario=course      a course Test as the Test Cycle card opens it: field
//                         items and a Rich Tool item, timed, with extended time
//   ?scenario=timeout     a short timed course Test that runs out of time
//   ?scenario=legacy      a test begun on the older one-way runtime: its first
//                         answer was recorded and locked before navigation existed
//   ?scenario=backtrack   a timed course Test with a choice, a typed answer and a
//                         two-part answer with the regression calculator, opened
//                         with a card that does not know the student's extended
//                         time: "Back to questions", resuming, reading while paused
//   ?scenario=dashboard   the list with a test in every status a student meets
//   ?theme=dark           the dark theme
//
// Every call goes to the real src/services/secureExamService.js in its
// MOCK_LOCAL sandbox. window.__secureHarness lets the driver act as the
// teacher (pause, resume, add time, release) on the session under test, read
// the released record, and leave and reopen the test (remount).
import React from 'react';
import { createRoot } from 'react-dom/client';
import SecureExamContainer from '../../src/components/assessment/SecureExamContainer.jsx';
import StudentSecureExamDashboard from '../../src/components/assessment/StudentSecureExamDashboard.jsx';
import {
  createSecureExamSession,
  finalizeSecureExam,
  getStudentSecureExamReview,
  issueSecureExamQuestion,
  listStudentSecureExamSessions,
  proctorExamAction,
  recordSecureExamIntegrityEvent,
  saveSecureExamDraft,
  startSecureExamSession,
  submitSecureExamResponse,
} from '../../src/services/secureExamService.js';
import { getExecutionMode } from '../../src/config/executionMode.js';
import { buildPublicToolPayload } from '../../functions/shared/pathToolContracts.mjs';
import { PATH_TOOL_QUESTIONS } from '../platform/fixtures/pathToolQuestions.mjs';
import '../../src/index.css';
import '../../src/App.css';

const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario') || 'practice';
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';

const field = (prompt, answer, extra = {}) => ({
  question: {
    questionType: extra.choices ? 'multipleChoice' : 'response',
    prompt,
    responseFields: [{ id: 'answer', label: extra.choices ? 'Choose one' : 'Answer', inputProfile: extra.inputProfile || 'text' }],
    choices: extra.choices || [],
    alignmentKeys: ['texas:A.5A'],
    runtimeMode: 'secureTest',
  },
  key: { answers: { answer }, display: extra.display || answer },
});

const intervalTool = () => {
  const authored = PATH_TOOL_QUESTIONS.intervalNumberLine;
  return {
    question: { questionType: 'intervalNumberLine', prompt: authored.prompt, ...buildPublicToolPayload(authored), alignmentKeys: ['texas:A.5B'], runtimeMode: 'secureTest' },
    key: null,
  };
};

// Two typed parts and the permitted regression calculator: the shape whose
// parts were lost when "Back to questions" reopened it from its first copy.
const twoPart = () => ({
  question: {
    questionType: 'response',
    prompt: 'The table shows hours studied $x$ and quiz score $y$. Use the regression calculator if you like, then enter the slope and the intercept of the line of best fit.',
    responseFields: [{ id: 'slope', label: 'Slope', inputProfile: 'number' }, { id: 'intercept', label: 'Intercept', inputProfile: 'number' }],
    choices: [],
    permittedTools: ['linearRegression'],
    alignmentKeys: ['texas:A.4C'],
    runtimeMode: 'secureTest',
  },
  key: { answers: { slope: '5', intercept: '3' }, display: '5 and 3' },
});

const COURSE_ITEMS = [
  field('Which value of $x$ makes $3x - 4 = 11$ true?', 'c', { choices: [{ id: 'a', label: '$3$' }, { id: 'b', label: '$4$' }, { id: 'c', label: '$5$' }, { id: 'd', label: '$7$' }], display: '$5$' }),
  intervalTool(),
  field('Solve for $x$: $2(x + 3) = 18$.', '6', { inputProfile: 'number' }),
  field('Write the slope of the line $y = -\\tfrac{3}{4}x + 2$.', '-3/4'),
  field('What is $f(-2)$ when $f(x) = x^2 + 1$?', '5', { inputProfile: 'number' }),
];

const harness = { scenario, mode: getExecutionMode(), sessionId: null, ready: false };
window.__secureHarness = harness;
harness.proctor = (action, extra = {}) => proctorExamAction({ examSessionId: harness.sessionId, action, ...extra });
harness.list = () => listStudentSecureExamSessions();
harness.integrity = (type = 'window_blur') => recordSecureExamIntegrityEvent({ examSessionId: harness.sessionId, eventId: `harness_${Date.now()}_${Math.random()}`, type });
// The released record of the session under test (after `proctor('releaseFeedback')`).
harness.review = () => getStudentSecureExamReview({ examSessionId: harness.sessionId });
harness.session = async () => (await listStudentSecureExamSessions()).sessions.find((entry) => entry.examSessionId === harness.sessionId) || null;

const shell = (children) => (
  <div style={{ minHeight: '100vh', background: 'var(--mm-page-bg)', color: 'var(--mm-text)' }}>{children}</div>
);

// The card's delivery facts as the server now sends them: the student's
// extended time is already in `timeLimitMinutes`.
const EXTENDED_DELIVERY = { timed: true, timeLimitMinutes: 45, baseTimeLimitMinutes: 30, extendedTimeMultiplier: 1.5, calculatorMode: 'none', questionCount: COURSE_ITEMS.length };

const CourseTest = ({ examSessionId, title = 'Unit 4 Test: Linear Equations', delivery = EXTENDED_DELIVERY }) => {
  const [finished, setFinished] = React.useState(false);
  // Leaving the test and opening it again from the card: a new container.
  const [mountKey, setMountKey] = React.useState(0);
  harness.remount = () => setMountKey((key) => key + 1);
  if (finished) return <p data-harness-exited="">Back on the assignment card.</p>;
  return (
    <SecureExamContainer
      key={mountKey}
      examSessionId={examSessionId}
      examType="courseTest"
      studentSupportProfile={null}
      title={title}
      startLabel="Start Test"
      delivery={delivery}
      exitLabel="Back to my assessment"
      onFinished={() => {}}
      onExitAfterFinished={() => setFinished(true)}
    />
  );
};

const buildDashboardStates = async () => {
  const make = async (payload) => (await createSecureExamSession({ studentId: 'harness-student', ...payload })).session.examSessionId;
  const started = async (payload) => { const id = await make(payload); await startSecureExamSession({ examSessionId: id }); return id; };
  // Not started, with extended time: the list states it before Start.
  await make({ examType: 'act', questionCount: 10, title: 'ACT Mathematics — not started', extendedTimeMultiplier: 1.5 });
  await started({ examType: 'tsia2', questionCount: 6 });
  const paused = await started({ examType: 'asvab', questionCount: 8 });
  await proctorExamAction({ examSessionId: paused, action: 'lock' });
  const integrity = await started({ examType: 'digitalSAT', questionCount: 6, title: 'Digital SAT Math — Practice B' });
  for (let index = 0; index < 3; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await recordSecureExamIntegrityEvent({ examSessionId: integrity, eventId: `seed_${index}`, type: 'window_blur' });
  }
  const released = await started({ examType: 'digitalSAT', questionCount: 4, title: 'Digital SAT Math — Practice A', extendedTimeMultiplier: 1.5 });
  const first = await issueSecureExamQuestion({ examSessionId: released, position: 0 });
  await saveSecureExamDraft({ examSessionId: released, questionInstanceId: first.questionInstance.questionInstanceId, responsePayload: { responses: { answer: '4' } } });
  await finalizeSecureExam({ examSessionId: released, reason: 'studentSubmit' });
  const held = await started({ examType: 'act', questionCount: 5, releasePolicy: 'teacher', title: 'ACT Mathematics — teacher review' });
  await finalizeSecureExam({ examSessionId: held, reason: 'studentSubmit' });
  const teacherSubmitted = await started({ examType: 'tsia2', questionCount: 4, releasePolicy: 'teacher' });
  await proctorExamAction({ examSessionId: teacherSubmitted, action: 'forceSubmit' });
};

const mount = async () => {
  const root = createRoot(document.getElementById('root'));
  if (scenario === 'course') {
    const { session } = await createSecureExamSession({
      studentId: 'harness-student', examType: 'courseTest', title: 'Unit 4 Test: Linear Equations',
      questionCount: COURSE_ITEMS.length, timeLimitMinutes: 30, extendedTimeMultiplier: 1.5, sandboxItems: COURSE_ITEMS,
      calculatorMode: 'none',
    });
    harness.sessionId = session.examSessionId;
    root.render(shell(<CourseTest examSessionId={session.examSessionId} />));
  } else if (scenario === 'timeout') {
    // Six seconds: long enough to open the first question, short enough to watch run out.
    const { session } = await createSecureExamSession({
      studentId: 'harness-student', examType: 'courseTest', title: 'Quiz: timing check',
      questionCount: 2, timeLimitMinutes: 0.1, sandboxItems: COURSE_ITEMS.slice(2, 4), calculatorMode: 'none',
    });
    harness.sessionId = session.examSessionId;
    root.render(shell(<CourseTest examSessionId={session.examSessionId} title="Quiz: timing check" delivery={{ timed: true, timeLimitMinutes: 1, calculatorMode: 'none', questionCount: 2 }} />));
  } else if (scenario === 'backtrack') {
    const items = [COURSE_ITEMS[0], COURSE_ITEMS[2], twoPart()];
    const { session } = await createSecureExamSession({
      studentId: 'harness-student', examType: 'courseTest', title: 'Unit 5 Test: Data and Lines',
      questionCount: items.length, timeLimitMinutes: 20, extendedTimeMultiplier: 1.5, sandboxItems: items, calculatorMode: 'none',
    });
    harness.sessionId = session.examSessionId;
    // A card that only knows the base time: the screen must find the rest.
    root.render(shell(<CourseTest examSessionId={session.examSessionId} title="Unit 5 Test: Data and Lines" delivery={{ timed: true, timeLimitMinutes: 20, calculatorMode: 'none', questionCount: items.length }} />));
  } else if (scenario === 'legacy') {
    // The older client recorded (and locked) question 1 with the one-way call.
    const { session } = await createSecureExamSession({ studentId: 'harness-student', examType: 'act', questionCount: 3, title: 'ACT Mathematics — begun earlier' });
    harness.sessionId = session.examSessionId;
    await startSecureExamSession({ examSessionId: session.examSessionId });
    const first = await issueSecureExamQuestion({ examSessionId: session.examSessionId, position: 0 });
    await submitSecureExamResponse({ examSessionId: session.examSessionId, questionInstanceId: first.questionInstance.questionInstanceId, responsePayload: { responses: { answer: '4' } } });
    await issueSecureExamQuestion({ examSessionId: session.examSessionId, position: 1 });
    root.render(shell(<StudentSecureExamDashboard studentProfile={null} onExit={() => {}} />));
  } else if (scenario === 'dashboard') {
    await buildDashboardStates();
    root.render(shell(<StudentSecureExamDashboard studentProfile={null} onExit={() => {}} />));
  } else {
    const { session } = await createSecureExamSession({ studentId: 'harness-student', examType: 'digitalSAT', questionCount: 4, title: 'Digital SAT Math — Practice Test 1' });
    harness.sessionId = session.examSessionId;
    root.render(shell(<StudentSecureExamDashboard studentProfile={null} onExit={() => {}} />));
  }
  harness.ready = true;
};

mount().catch((error) => {
  harness.error = String(error?.stack || error);
  document.getElementById('root').textContent = `Harness failed: ${error?.message || error}`;
});
