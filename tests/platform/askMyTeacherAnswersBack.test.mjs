/*
 * STUDENT PASS 3, HELP-5 / DECISION D6: "ASK MY TEACHER" ANSWERS BACK.
 *
 * Before: the request was a flag on the live heartbeat. At home nobody saw it,
 * a reload quietly lowered the hand, and the teacher's monitor had no way to
 * reply. Now:
 *
 *   IN CLASS   the raised hand stays (and survives a reload); the teacher
 *              answers it from the live monitor with "Seen" / "On my way",
 *              which the student reads beside the hand.
 *   OUT OF IT  the student leaves a short question with the question's place
 *              in the assignment; the teacher answers it from Teacher Home;
 *              the student reads the answer on the question and in Review My
 *              Work.
 *
 * "In class" is the student's own class meeting now (bell schedule, A/B day,
 * district calendar), not the clock alone. The emulator half of this contract
 * — who may read and write what — is tests/rules/askTeacherRules.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { getPeriodWindow } from '../../src/assignmentLifecycle.js';
import {
  ASK_MODE,
  HELP_ACK_STATUS,
  QUESTION_STATUS,
  QUESTION_TEXT_MAX,
  ANSWER_TEXT_MAX,
  TEACHER_QUESTIONS_SHOWN,
  acknowledgementFor,
  askTeacherMode,
  buildHelpAcknowledgement,
  buildQuestionEdit,
  buildTeacherAnswer,
  buildTeacherQuestion,
  cleanQuestionText,
  questionFor,
  studentClassInSession,
  teacherQuestionId,
  teacherQuestionPlace,
} from '../../src/platform/supports/askTeacher.js';
import {
  HELP_REQUEST_RESTORE_MS,
  helpRequestAfterClose,
  helpRequestFields,
  nextHand,
  nextHelpRequest,
  readStoredHelpRequest,
  restoreHelpRequest,
  storeHelpRequest,
} from '../../src/platform/supports/helpRequest.js';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const code = (path) => executableSource(read(path));

/* ------------------------------------------------------- the in-class test */

// Period 3 meets 8:30–9:20 on A days only. Monday 2026-10-19 is an A day,
// Tuesday 2026-10-20 a B day, Saturday 2026-10-24 a weekend.
const SCHEDULE = {
  version: 2,
  daySchedules: {
    A: { periods: { 'Period 3': { enabled: true, start: '08:30', end: '09:20' } } },
    B: { periods: { 'Period 3': { enabled: false, start: '08:30', end: '09:20' } } },
  },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
};
const noon = (dateKey) => Date.parse(`${dateKey}T17:00:00Z`);
const MONDAY_WINDOW = getPeriodWindow(SCHEDULE, 'Period 3', noon('2026-10-19'));
const NO_CLOSURES = new Set();

test('in class means the student\'s own period is meeting now — bell schedule, A/B day, district calendar', () => {
  assert.ok(MONDAY_WINDOW, 'the fixture has a Monday window');
  const start = MONDAY_WINDOW.start.getTime();
  const end = MONDAY_WINDOW.end.getTime();
  const inClass = (nowValue, overrides = {}) => studentClassInSession({
    schedule: SCHEDULE, classPeriod: 'Period 3', nowValue, nonInstructionalKeys: NO_CLOSURES, ...overrides,
  });
  assert.equal(inClass(start + 60000), true, 'during the period');
  assert.equal(inClass(start - 60000), false, 'before the bell');
  assert.equal(inClass(end + 60000), false, 'after class — at home that evening it is a question');
  assert.equal(inClass(start + 60000, { classPeriod: 'Period 4' }), false, 'another period is not this student\'s class');
  assert.equal(inClass(start + 60000, { classPeriod: '' }), false, 'no period on file: never in class');
  assert.equal(inClass(start + 60000, { schedule: null }), false, 'no schedule loaded yet');
  // The same clock time on a B day, a weekend, and a closed school day.
  assert.equal(inClass(start + 60000 + 86400000), false, 'Tuesday is a B day: Period 3 does not meet');
  assert.equal(inClass(start + 60000 + 5 * 86400000), false, 'Saturday');
  assert.equal(inClass(start + 60000, { nonInstructionalKeys: new Set(['2026-10-19']) }), false, 'a holiday on the district calendar');
  // …unless the school set a bell schedule for that very date (a make-up day).
  assert.equal(inClass(start + 60000, {
    nonInstructionalKeys: new Set(['2026-10-19']),
    schedule: { ...SCHEDULE, modifiedSchedules: { '2026-10-19': { periods: { 'Period 3': { enabled: true, start: '08:30', end: '09:20' } } } } },
  }), true, 'a make-up day with its own bell schedule');
  // A modified day outranks the rotation.
  assert.equal(inClass(start + 60000 + 86400000, {
    schedule: { ...SCHEDULE, modifiedSchedules: { '2026-10-20': { periods: { 'Period 3': { enabled: true, start: '08:30', end: '09:20' } } } } },
  }), true, 'a modified Tuesday that seats Period 3');
  assert.equal(askTeacherMode(true), ASK_MODE.HAND);
  assert.equal(askTeacherMode(false), ASK_MODE.QUESTION);
});

/* -------------------------------------------- what a question document is */

const rulesSource = read('firestore.rules');
const listIn = (text) => [...text.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);

test('a question is short, about one question of one assignment, and has exactly the fields the rules allow', () => {
  const longText = `  ${'x'.repeat(QUESTION_TEXT_MAX + 40)}  `;
  const built = buildTeacherQuestion({
    studentId: 'S1', classId: 'C1', teacherEmail: 'teacher@school.org', assignmentId: 'A1', assignmentTitle: 'Lesson 4',
    questionIndex: 3, questionLabel: 'Classwork · Question 2', text: longText, timestamp: 'TS',
  });
  assert.equal(built.id, 'S1__A1__3', 'one question per student per question: asking again edits it');
  assert.equal(built.data.text.length, QUESTION_TEXT_MAX, 'capped at the rule\'s length');
  assert.equal(built.data.status, QUESTION_STATUS.OPEN);
  assert.equal(built.data.createdAt, 'TS');
  assert.equal(built.data.teacherEmail, 'teacher@school.org');
  assert.equal(buildTeacherQuestion({ studentId: 'S1', teacherEmail: 't@s.org', assignmentId: 'A1', questionIndex: 3, text: '   ' }), null, 'nothing to send');
  assert.equal(buildTeacherQuestion({ studentId: 'S1', teacherEmail: '', assignmentId: 'A1', questionIndex: 3, text: 'Why?' }), null, 'a student with no teacher on file cannot send one');
  assert.equal(teacherQuestionId({ studentId: 'S1', assignmentId: 'A1', questionIndex: -1 }), null);
  assert.equal(cleanQuestionText('  why does b move?  '), 'why does b move?');

  // SI04: student ids may hold "_" and "__", so an assignment id with "_" at
  // an end or "__" inside could make two questions share an id: student "a__"
  // on assignment "X" and student "a_" on assignment "_X" are both
  // "a____X__0". Those assignment ids get no id (auto-ids have no "_").
  assert.equal(teacherQuestionId({ studentId: 'a__', assignmentId: 'X', questionIndex: 0 }), 'a____X__0');
  assert.equal(teacherQuestionId({ studentId: 'a_', assignmentId: '_X', questionIndex: 0 }), null);
  assert.equal(teacherQuestionId({ studentId: 'a', assignmentId: 'X_', questionIndex: 0 }), null);
  assert.equal(teacherQuestionId({ studentId: 'a', assignmentId: 'P__Q', questionIndex: 0 }), null);
  assert.equal(teacherQuestionId({ studentId: 'a', assignmentId: 'A_1', questionIndex: 0 }), 'a__A_1__0', 'one "_" inside is fine');
  // Every student id and assignment id up to four characters of "a" and "_",
  // two positions: no two questions share an id.
  const words = (length) => (length === 0 ? [''] : words(length - 1).flatMap((word) => [`${word}a`, `${word}_`]));
  const upTo = (max) => Array.from({ length: max }, (_, index) => words(index + 1)).flat();
  const seen = new Map();
  for (const studentId of upTo(4)) {
    for (const assignmentId of upTo(4)) {
      for (const questionIndex of [0, 10]) {
        const id = teacherQuestionId({ studentId, assignmentId, questionIndex });
        if (id === null) continue;
        const who = `${studentId} | ${assignmentId} | ${questionIndex}`;
        assert.equal(seen.get(id) ?? who, who, `"${id}" names two questions`);
        seen.set(id, who);
      }
    }
  }
  assert.ok(seen.size > 300, 'the check covered the cases it means to');

  // Cross-check with firestore.rules: every field the browser writes is one
  // the rule allows, and every field it requires is written.
  const create = region(rulesSource, 'function teacherQuestionCreateValid(questionId) {', '\n    }', 'the create rule');
  const allowed = new Set(listIn(region(create, 'data.keys().hasOnly([', '])', 'allowed keys')));
  const required = listIn(region(create, 'data.keys().hasAll([', '])', 'required keys'));
  Object.keys(built.data).forEach((key) => assert.ok(allowed.has(key), `${key} is written but the rule refuses it`));
  required.forEach((key) => assert.ok(key in built.data, `${key} is required by the rule`));
  assert.match(create, /teacherQuestionTextValid\(data\.text, 500\)/);
  assert.equal(QUESTION_TEXT_MAX, 500);

  const block = region(rulesSource, 'match /askTeacherQuestions/{questionId} {', 'allow delete: if false;', 'the question rules');
  const studentEdit = new Set(listIn(region(block, '(ownsStudent(resource.data.studentId)', 'request.time)', 'the student edit')).filter((key) => key !== 'open'));
  Object.keys(buildQuestionEdit({ text: 'Better wording', timestamp: 'TS' })).forEach((key) => assert.ok(studentEdit.has(key), `the student edit writes ${key}`));
  const answerRule = region(block, '(teacherQuestionTeacher()', 'request.time);', 'the teacher answer');
  const answerKeys = new Set(listIn(region(answerRule, '.hasOnly([', '])', 'answer keys')));
  const answer = buildTeacherAnswer({ answer: `  ${'y'.repeat(ANSWER_TEXT_MAX + 5)}`, teacherEmail: 'teacher@school.org', timestamp: 'TS' });
  Object.keys(answer).forEach((key) => assert.ok(answerKeys.has(key), `the answer writes ${key}`));
  assert.equal(answer.answer.length, ANSWER_TEXT_MAX);
  assert.equal(answer.status, QUESTION_STATUS.ANSWERED);
  assert.match(answerRule, /teacherQuestionTextValid\(request\.resource\.data\.answer, 1000\)/);
  assert.equal(buildTeacherAnswer({ answer: ' ', teacherEmail: 'teacher@school.org' }), null);

  const questions = [built.data, { ...built.data, questionIndex: 5 }];
  assert.equal(questionFor(questions, { assignmentId: 'A1', questionIndex: 5 }).questionIndex, 5);
  assert.equal(questionFor(questions, { assignmentId: 'A2', questionIndex: 3 }), null);
});

/* ------------------------------------------------------ "Seen / on my way" */

test('"Seen" and "On my way" answer one raised hand, and only that hand', () => {
  const hand = nextHelpRequest({ requested: true, assignmentId: 'A1', questionIndex: 2, now: 1_800_000_000_000 });
  const ack = buildHelpAcknowledgement({
    studentId: 'S1', assignmentId: 'A1', helpRequestedAt: helpRequestFields(hand, { assignmentId: 'A1' }).helpRequestedAt,
    status: HELP_ACK_STATUS.ON_MY_WAY, teacherEmail: 'teacher@school.org', timestamp: 'TS',
  });
  assert.equal(acknowledgementFor(hand, ack), HELP_ACK_STATUS.ON_MY_WAY);
  assert.equal(acknowledgementFor({ ...hand, at: hand.at + 60000 }, ack), null, 'the hand raised again later is a new request');
  assert.equal(acknowledgementFor({ ...hand, assignmentId: 'A2' }, ack), null, 'another assignment');
  assert.equal(acknowledgementFor(null, ack), null, 'no hand, nothing to show');
  assert.equal(acknowledgementFor(hand, { ...ack, status: '<b>come</b>' }), null, 'only the two words the platform knows');
  assert.equal(buildHelpAcknowledgement({ studentId: 'S1', assignmentId: 'A1', helpRequestedAt: 5, status: 'hurry', teacherEmail: 't@s.org' }), null);

  const ackRule = region(rulesSource, 'match /helpAcknowledgements/{studentId} {', 'allow delete: if false;', 'the acknowledgement rule');
  assert.deepEqual(new Set(listIn(region(ackRule, 'keys().hasOnly([', '])', 'ack keys'))), new Set(Object.keys(ack)));
  assert.match(ackRule, /request\.resource\.data\.status in \['seen', 'onMyWay'\]/);
  assert.deepEqual(Object.values(HELP_ACK_STATUS).sort(), ['onMyWay', 'seen']);
  // Bound to the hand presence is raising now.
  assert.match(ackRule, /presence\/\$\(studentId\)\)\.data\.get\('helpRequestedAt', null\)\s*== request\.resource\.data\.helpRequestedAt/);
});

/* ------------------------------------------------ a reload keeps the hand */

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), values };
};

test('a reload does not lower the hand: this tab restores it for the same assignment while it is recent', () => {
  const now = 1_800_000_000_000;
  const storage = memoryStorage();
  const hand = nextHelpRequest({ requested: true, assignmentId: 'A1', questionIndex: 2, now: now - 5 * 60000 });
  storeHelpRequest(storage, 'S1', hand);
  const stored = readStoredHelpRequest(storage, 'S1');
  assert.deepEqual(stored, { assignmentId: 'A1', questionIndex: 2, at: hand.at }, 'a time, an assignment and a position — nothing else');
  assert.deepEqual(restoreHelpRequest(stored, { assignmentId: 'A1', now }), hand, 'reload: the same hand, still raised');
  assert.equal(restoreHelpRequest(stored, { assignmentId: 'A2', now }), null, 'another assignment');
  assert.equal(restoreHelpRequest(stored, { assignmentId: 'A1', now: hand.at + HELP_REQUEST_RESTORE_MS + 1 }), null, 'not the next class');
  assert.ok(HELP_REQUEST_RESTORE_MS < 86400000, 'inside the presence rule\'s one-day window');
  assert.equal(readStoredHelpRequest(storage, 'S2'), null, 'another student on this tab');
  storeHelpRequest(storage, 'S1', null);
  assert.equal(readStoredHelpRequest(storage, 'S1'), null, 'cancelled: forgotten');
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  assert.doesNotThrow(() => storeHelpRequest(broken, 'S1', hand));
  assert.equal(readStoredHelpRequest(broken, 'S1'), null);
});

test('a change to the hand that changes nothing keeps the same state, so App\'s close check cannot loop', () => {
  // App.jsx lowers a hand when its question closes, from an effect that runs on
  // most renders: setHelpRequest((current) => helpRequestAfterClose(current, …)).
  // React skips an update only when the state is the same object; rebuilding
  // it on every call looped ("Maximum update depth exceeded", every page).
  const open = { 2: { status: 'attempted', attemptCount: 1 } };
  const hand = { studentId: 'S1', assignmentId: 'A1', request: { assignmentId: 'A1', questionIndex: 2, at: 1 } };
  assert.equal(nextHand(hand, (current) => helpRequestAfterClose(current, open, { askingAllowed: true })), hand, 'the hand stays up: same state');
  assert.equal(nextHand(hand, hand.request), hand);
  const none = { studentId: null, assignmentId: null, request: null };
  assert.equal(nextHand(none, (current) => helpRequestAfterClose(current, open)), none, 'no hand (a teacher, Home): same state');
  // A real change is a new state, with nothing else moved.
  const lowered = nextHand(hand, (current) => helpRequestAfterClose(current, { 2: { status: 'correct' } }));
  assert.notEqual(lowered, hand);
  assert.deepEqual(lowered, { studentId: 'S1', assignmentId: 'A1', request: null });
  const raised = nextHand(none, { assignmentId: 'A1', questionIndex: 0, at: 5 });
  assert.deepEqual(raised.request, { assignmentId: 'A1', questionIndex: 0, at: 5 });
  // The hook's setter is that step.
  const hook = code('src/platform/supports/useAskMyTeacher.js');
  assert.match(hook, /const setRequest = useCallback\(\(next\) => setHand\(\(current\) => nextHand\(current, next\)\), \[\]\);/);
});

test('the hook owns the hand: restored on entering an assignment, forgotten on leaving it, published only in class', () => {
  const hook = code('src/platform/supports/useAskMyTeacher.js');
  // Entering an assignment restores this tab's hand DURING RENDER, so an
  // effect React runs again (StrictMode, a reconnect) never sees the moment
  // before the restore and erases it — which the harness caught.
  const enter = region(hook, 'if (hand.studentId !== studentId || hand.assignmentId !== assignmentId) {', '\n  }\n', 'restoring on entry');
  assert.match(enter, /restoreHelpRequest\(readStoredHelpRequest\(sessionStore\(\), studentId\), \{ assignmentId, now: Date\.now\(\) \}\)/);
  // Storing mirrors the state it was read for, and never on Home.
  const store = region(hook, 'useEffect(() => {\n    if (!studentId || !assignmentId || hand.studentId !== studentId || hand.assignmentId !== assignmentId) return;', '}, [studentId, assignmentId, hand]);', 'storing the hand');
  assert.match(store, /storeHelpRequest\(sessionStore\(\), studentId, hand\.request\)/);
  // Leaving an assignment forgets its hand.
  const leave = region(hook, 'const left = enteredAssignment.current;', '}, [studentId, assignmentId]);', 'leaving');
  assert.match(leave, /if \(left && left !== assignmentId && readStoredHelpRequest\(storage, studentId\)\?\.assignmentId === left\) \{\s*storeHelpRequest\(storage, studentId, null\);/);
  assert.match(hook, /const helpRequest = inClass \? request : null;/);
  assert.match(hook, /studentClassInSession\(\{ schedule, classPeriod, nowValue: minute \* 60000 \}\)/);
  assert.match(hook, /acknowledgement: acknowledgementFor\(helpRequest, acknowledgement\),/);

  const app = code('src/App.jsx');
  assert.match(app, /^import \{ useAskMyTeacher, useTeacherQuestionsOn \} from '\.\/platform\/supports\/useAskMyTeacher\.js';$/m);
  assert.match(app, /^import \{ questionFor \} from '\.\/platform\/supports\/askTeacher\.js';$/m);
  assert.match(app, /^import \{ TeacherAnswersList \} from '\.\/components\/student\/TeacherAnswersList\.jsx';$/m);
  const wiring = region(app, 'const askMyTeacher = useAskMyTeacher({', 'const { helpRequest, setHelpRequest } = askMyTeacher;', 'the hook call');
  assert.match(wiring, /classPeriod: user\?\.classPeriod \|\| null,/);
  assert.match(wiring, /schedule: classSchedule,/);
  assert.match(wiring, /assignmentId: activeAssignmentId,/);
  assert.match(wiring, /teacherEmail: askingStudentId \? user\.assignedTeacherEmail \|\| null : null,/);
  // The old reset on every assignment change is gone: it ran after the
  // restore and lowered the hand a reload had just brought back.
  assert.doesNotMatch(app, /useEffect\(\(\) => \{ setHelpRequest\(null\); \}, \[activeAssignmentId\]\);/);
  // The host hands the engine this question's asking state.
  const context = region(app, 'askTeacherContext={{', '}}', 'the ask context');
  assert.match(context, /mode: askMyTeacher\.mode,/);
  assert.match(context, /acknowledgement: askMyTeacher\.acknowledgement,/);
  assert.match(context, /question: questionFor\(askMyTeacher\.questions, \{ assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex \}\),/);
  assert.match(context, /questionIndex: currentQuestionIndex,/);
  assert.match(app, /\{!preview && <TeacherAnswersList questions=\{askMyTeacher\.questions\} compact \/>\}/);
});

test('the engine still decides where asking is offered: never locked, never under server grading', () => {
  const engine = code('src/QuestionEngine.jsx');
  // The host's context cannot switch on a toggle the engine withholds, nor
  // replace the engine's own requested/onToggle.
  assert.match(engine, /const askTeacher = typeof onAskTeacher === 'function' && !locked && !serverGrading\s*\? \{ \.\.\.askTeacherContext, requested: Boolean\(helpRequested\), onToggle: \(\) => onAskTeacher\(!helpRequested\) \}\s*: null;/);
});

/* --------------------------------------------- what the student sees */

const withVite = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    await server.close();
  }
};

test('the student sees the hand and the teacher\'s answer in class, and a question box outside it (rendered)', async () => {
  await withVite(async (load) => {
    const { default: HintPanel } = await load('/src/platform/supports/hints/HintPanel.jsx');
    const { TeacherAnswersList } = await load('/src/components/student/TeacherAnswersList.jsx');
    const panel = (askTeacher) => renderToStaticMarkup(React.createElement(HintPanel, { hints: [], askTeacher }));
    const toggle = () => {};

    const down = panel({ mode: ASK_MODE.HAND, requested: false, onToggle: toggle });
    assert.match(down, /<button type="button"[^>]*aria-pressed="false"[^>]*>✋ Ask my teacher<\/button>/);
    assert.doesNotMatch(down, /data-ask-teacher-status/);

    const up = panel({ mode: ASK_MODE.HAND, requested: true, onToggle: toggle, acknowledgement: HELP_ACK_STATUS.ON_MY_WAY });
    assert.match(up, />Cancel my help request<\/button>/);
    assert.match(up, /<p role="status" data-ask-teacher-status="hand"[^>]*>Your hand is raised on your teacher’s live class screen for this question\. Keep working while you wait\. <span data-help-acknowledgement="onMyWay">Your teacher is on the way\.<\/span><\/p>/);
    assert.match(panel({ mode: ASK_MODE.HAND, requested: true, onToggle: toggle, acknowledgement: HELP_ACK_STATUS.SEEN }), /Your teacher has seen your hand\./);
    assert.doesNotMatch(panel({ mode: ASK_MODE.HAND, requested: true, onToggle: toggle, acknowledgement: null }), /data-help-acknowledgement/);

    const send = async () => {};
    const home = panel({ mode: ASK_MODE.QUESTION, requested: false, onToggle: toggle, question: null, onSendQuestion: send });
    assert.match(home, /<button type="button"[^>]*>✉ Leave a question for my teacher<\/button>/);
    assert.doesNotMatch(home, /Ask my teacher<\/button>|aria-pressed/, 'no hand to raise when nobody is in the room');

    const waiting = panel({ mode: ASK_MODE.QUESTION, question: { id: 'q', status: QUESTION_STATUS.OPEN, text: 'Why is b negative?' }, onSendQuestion: send });
    assert.match(waiting, />Edit my question<\/button>/);
    assert.match(waiting, /data-ask-teacher-status="waiting"[^>]*>Your question is with your teacher\. Their answer will show here and in Review My Work\./);

    const answered = panel({ mode: ASK_MODE.QUESTION, question: { id: 'q', status: QUESTION_STATUS.ANSWERED, text: 'Why is b negative?', answer: 'The line falls, so the slope is negative.' }, onSendQuestion: send });
    assert.match(answered, /Your teacher answered your question/);
    assert.match(answered, /You asked: Why is b negative\?/);
    assert.match(answered, /The line falls, so the slope is negative\./);
    assert.doesNotMatch(answered, /Leave a question|Edit my question/, 'an answered question is not reopened');

    const noTeacher = panel({ mode: ASK_MODE.QUESTION, question: null, onSendQuestion: null });
    assert.doesNotMatch(noTeacher, /Leave a question/);
    assert.match(noTeacher, /data-ask-teacher-status="unavailable"/);

    // Review My Work lists every question; the workspace folds the answered ones.
    const questions = [
      { id: 'a', assignmentId: 'A1', questionIndex: 4, questionLabel: 'Classwork · Question 5', status: QUESTION_STATUS.ANSWERED, text: 'Q?', answer: 'Use the vertex.', createdAt: 2 },
      { id: 'b', assignmentId: 'A1', questionIndex: 1, questionLabel: 'Warm-Up · Question 2', status: QUESTION_STATUS.OPEN, text: 'Stuck here', createdAt: 1 },
    ];
    const review = renderToStaticMarkup(React.createElement(TeacherAnswersList, { questions }));
    assert.match(review, /<section aria-label="Your questions for your teacher" data-teacher-answers="review"/);
    assert.ok(review.indexOf('Warm-Up · Question 2') < review.indexOf('Classwork · Question 5'), 'in the order asked');
    assert.match(review, /Waiting for your teacher’s answer\./);
    assert.match(review, /Your teacher: <\/span>Use the vertex\./);
    const compact = renderToStaticMarkup(React.createElement(TeacherAnswersList, { questions, compact: true }));
    assert.match(compact, /<details data-teacher-answers="compact"/);
    assert.doesNotMatch(compact, /<details[^>]*\sopen/, 'folded until opened');
    assert.match(compact, /Your teacher answered your question/);
    assert.doesNotMatch(compact, /Stuck here/, 'the workspace lists answers, not waiting questions');
    assert.equal(renderToStaticMarkup(React.createElement(TeacherAnswersList, { questions: [questions[1]], compact: true })), '');
  });
});

test('the question box is capped, and the student\'s words go only to the send call', () => {
  const control = code('src/platform/supports/AskTeacherControl.jsx');
  assert.match(control, /maxLength=\{QUESTION_TEXT_MAX\}/);
  assert.match(control, /await askTeacher\.onSendQuestion\(\{ existing: question, text: words \}\);/);
  // No student or teacher text in logs or analytics: nothing on either path
  // logs, reports or tracks.
  [
    'src/platform/supports/AskTeacherControl.jsx', 'src/platform/supports/askTeacher.js', 'src/platform/supports/askTeacherStore.js',
    'src/platform/supports/useAskMyTeacher.js', 'src/components/student/TeacherAnswers.jsx', 'src/components/student/TeacherAnswersList.jsx',
    'src/components/teacher/StudentQuestionsPanel.jsx', 'src/components/teacher/HelpAcknowledgeControls.jsx',
  ].forEach((path) => assert.doesNotMatch(code(path), /console\.|reportClientError|reportError|logEvent|analytics|recordStudentSupportEvidence|onEvidence/, path));
  // And the words never ride in presence: the heartbeat's help fields are a
  // time and a position.
  assert.deepEqual(Object.keys(helpRequestFields(nextHelpRequest({ requested: true, assignmentId: 'A1', questionIndex: 1, now: 5 }), { assignmentId: 'A1' })).sort(), ['helpQuestionIndex', 'helpRequestedAt']);
});

/* ------------------------------------------------------- the teacher side */

test('the teacher answers a raised hand on the live monitor — never on the projector', () => {
  const monitor = code('src/components/teacher/LiveClassMonitor.jsx');
  assert.match(monitor, /^import HelpAcknowledgeControls from '\.\/HelpAcknowledgeControls\.jsx';$/m);
  const tile = region(monitor, 'function StudentTile({', 'function withClassworkStates', 'the room tile');
  assert.match(tile, /\{!roomMode && row\.flags\.includes\(LIVE_FLAGS\.HELP_REQUESTED\) && \(\s*<HelpAcknowledgeControls studentId=\{row\.id\} live=\{live\} teacherEmail=\{teacherEmail\} \/>/);
  const card = region(monitor, 'function WalkthroughCard({', 'function LiveTeachingPanel', 'the walkthrough card');
  assert.match(card, /\{row\.helpRequested && <HelpAcknowledgeControls studentId=\{row\.id\} live=\{row\.live\} teacherEmail=\{teacherEmail\} \/>\}/);
  // Projected tiles are rendered with roomMode, and given the teacher.
  const tiles = region(monitor, '<StudentTile\n', '/>', 'the tile mount');
  assert.match(tiles, /roomMode=\{roomMode && mode === 'room'\}/);
  assert.match(tiles, /teacherEmail=\{teacherEmail\}/);
  assert.match(monitor, /<WalkthroughCard key=\{row\.id\}[^\n]*teacherEmail=\{teacherEmail\} \/>/);

  const controls = code('src/components/teacher/HelpAcknowledgeControls.jsx');
  assert.match(controls, /await acknowledgeHelpRequest\(db, \{ studentId, assignmentId: live\.assignmentId, helpRequestedAt, status, teacherEmail \}\);/);
  assert.match(controls, /aria-pressed=\{current === status\}/);
  assert.match(controls, /const current = acknowledgementFor\(\{ assignmentId: live\.assignmentId, at: helpRequestedAt \}, stored\);/);
});

test('the teacher reads and answers questions on Teacher Home, folded until opened', () => {
  const home = code('src/TeacherHome.jsx');
  assert.match(home, /^import StudentQuestionsPanel from '\.\/components\/teacher\/StudentQuestionsPanel\.jsx';$/m);
  // `withheld` keeps it to a count while a class is in session or projected
  // (TT26, tests/platform/askTeacherLifecycle.test.mjs).
  assert.match(home, /<StudentQuestionsPanel\s+(?:withheld=\{[^}]+\}\s+)?teacherEmail=\{teacherEmail\}\s+students=\{allStudents\}\s+assignments=\{assignments\}\s+onOpenStudent=\{onOpenStudent\}\s+\/>/);
  const panel = code('src/components/teacher/StudentQuestionsPanel.jsx');
  assert.match(panel, /watchQuestions\(openTeacherQuestionsQuery\(db, \{ teacherEmail \}\), setQuestions, \(\) => setUnavailable\(true\)\)/);
  assert.match(panel, /await answerTeacherQuestion\(db, \{ questionId: question\.id, answer: words, teacherEmail \}\);/);
  assert.match(panel, /maxLength=\{ANSWER_TEXT_MAX\}/);
  const folded = region(panel, '<details className="tw-disclosure" data-student-questions=""', '>', 'the panel');
  assert.doesNotMatch(folded, /\bopen\b/, 'a student\'s words show only when the teacher opens the panel');
  assert.match(panel, /if \(!waiting\.length && !unavailable && !sentNotice\) return null;/);
});

test('Teacher Home loads a bounded list, and says where each question was asked in its own words', () => {
  // Where: the teacher's own copy of the title, and the label the student's
  // device sent only in the shape the app builds, with a section the platform
  // names (a student's device can send any text in both).
  const assignment = { id: 'A1', title: 'Lesson 4: Slope' };
  assert.deepEqual(teacherQuestionPlace({ assignment, questionLabel: 'Classwork · Question 3', questionIndex: 2 }), { title: 'Lesson 4: Slope', label: 'Classwork · Question 3' });
  // The exit ticket's tab as the workspace names it now (D9), and the old name
  // for questions stored before.
  assert.equal(teacherQuestionPlace({ assignment, questionLabel: 'Exit ticket (DOL) · Question 1', questionIndex: 7 }).label, 'Exit ticket (DOL) · Question 1');
  assert.equal(teacherQuestionPlace({ assignment, questionLabel: 'DOL / Exit Ticket · Question 1', questionIndex: 9 }).label, 'DOL / Exit Ticket · Question 1');
  // App.jsx builds the label from the same tab name the platform names.
  assert.match(code('src/App.jsx'), /dol: \{ label: EXIT_TICKET_SPELLED_OUT, /);
  for (const sent of ['Call home now', 'MESSAGE FROM THE PRINCIPAL · Question 1', 'Classwork · Question 0', 'Classwork · Question 3 — urgent', '', null]) {
    assert.equal(teacherQuestionPlace({ assignment, questionLabel: sent, questionIndex: 2 }).label, 'Question 3', String(sent));
  }
  assert.equal(teacherQuestionPlace({ assignment: null, questionLabel: 'Classwork · Question 3', questionIndex: 2 }).title, 'Assignment', 'never the stored title');
  const panel = code('src/components/teacher/StudentQuestionsPanel.jsx');
  assert.doesNotMatch(panel, /question\.assignmentTitle|question\.questionLabel \|\|/, 'the sent title and label are not shown as given');
  assert.match(panel, /place=\{teacherQuestionPlace\(\{ assignment, questionLabel: question\.questionLabel, questionIndex: question\.questionIndex \}\)\}/);
  assert.match(panel, /\{place\.title\} · \{place\.label\}/);

  // How many: at most TEACHER_QUESTIONS_SHOWN load at once, and the count says
  // when more are waiting (answering one lets the next in).
  assert.equal(TEACHER_QUESTIONS_SHOWN, 100);
  const store = code('src/platform/supports/askTeacherStore.js');
  assert.match(region(store, 'export const openTeacherQuestionsQuery', ');', 'teacher query'), /\n\s*limit\(TEACHER_QUESTIONS_SHOWN\),\n/);
  assert.match(panel, /const more = questions\.length >= TEACHER_QUESTIONS_SHOWN;/);
  assert.match(panel, /\{more \? `\$\{TEACHER_QUESTIONS_SHOWN\}\+` : waiting\.length\}/);
  assert.match(panel, /\{more \? <p[^>]*>Showing \{TEACHER_QUESTIONS_SHOWN\} waiting questions\. Answer these to see the rest\.<\/p> : null\}/);
});

test('the store reads only the caller\'s own questions, and an account deletion takes them with the student', async () => {
  const store = code('src/platform/supports/askTeacherStore.js');
  assert.match(region(store, 'export const myTeacherQuestionsQuery', ');', 'student query'), /where\('studentId', '==', studentId\),\s*where\('assignmentId', '==', assignmentId\),/);
  assert.match(region(store, 'export const openTeacherQuestionsQuery', ');', 'teacher query'), /where\('teacherEmail', '==', teacherEmail\),\s*where\('status', '==', QUESTION_STATUS\.OPEN\),/);
  const { createRequire } = await import('node:module');
  const admin = createRequire(import.meta.url)('../../functions/lib/admin.js');
  assert.ok(admin.STUDENT_QUERY_COLLECTIONS.includes('askTeacherQuestions'), 'deleted by studentId with the student');
  assert.ok(admin.STUDENT_DIRECT_COLLECTIONS.includes('helpAcknowledgements'), 'keyed by studentId');
  assert.ok(admin.PREPRODUCTION_RESET_COLLECTIONS.includes('askTeacherQuestions'));
  assert.ok(admin.PREPRODUCTION_RESET_COLLECTIONS.includes('helpAcknowledgements'));
});
