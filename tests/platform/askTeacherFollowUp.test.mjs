/*
 * TT01: ONE FOLLOW-UP AFTER THE TEACHER'S ANSWER ("Ask my teacher").
 *
 * Before: an answered question could not be followed up in the app (the rules
 * refused any change after the answer), so a student who still did not
 * understand had nothing to press until the next class. Now the student may
 * reopen the SAME document once: the new words become `text`, the exchange so
 * far is kept beside it in `earlierText` and `earlierAnswer`, and Teacher Home
 * lists it again. One round keeps it a question and not a chat.
 *
 * Pinned here, without a browser or the emulator:
 *   - the model: when a follow-up may be asked, exactly what it writes, and
 *     that it stops at one round;
 *   - that what it writes is what firestore.rules lets a student change after
 *     an answer (who may write what is proven by the database in
 *     tests/rules/askTeacherRules.test.mjs);
 *   - that the store keeps ONE document per question: no second document;
 *   - what the student and the teacher read at each step;
 *   - that a waiting follow-up is a waiting question to the class-change
 *     handover and to the retention job (TT26).
 *
 * Not built, by decision (docs/handoffs/STUDENT_PASS3_BATCH8.md, Open): email,
 * push or any other message outside the app, which is the owner's call on
 * privacy and cost, and a thread of more than one round.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  ASK_MODE,
  QUESTION_STATUS,
  QUESTION_TEXT_MAX,
  buildFollowUp,
  buildQuestionEdit,
  buildTeacherAnswer,
  canAskFollowUp,
  hasFollowUp,
} from '../../src/platform/supports/askTeacher.js';
import { askTeacherQuestionExpired, openQuestionHandover } from '../../functions/shared/askTeacherLifecycle.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const code = (path) => executableSource(read(path));

const TEACHER = 'teacher@school.org';
const FIRST = 'Why is b negative?';
const FIRST_ANSWER = 'The line crosses the y-axis below the origin.';
const SECOND = 'And when b is positive?';
const SECOND_ANSWER = 'Then it crosses above the origin.';

// The same document at each step of its life, as the app reads it back.
const waiting = {
  id: 'S1__A1__3', studentId: 'S1', classId: 'C1', teacherEmail: TEACHER, assignmentId: 'A1', questionIndex: 3,
  questionLabel: 'Classwork · Question 4', status: QUESTION_STATUS.OPEN, text: FIRST, createdAt: 1,
};
const answered = { ...waiting, ...buildTeacherAnswer({ answer: FIRST_ANSWER, teacherEmail: TEACHER, timestamp: 2 }) };
const followUpWords = buildFollowUp({ existing: answered, text: SECOND, timestamp: 3 });
const reopened = { ...answered, ...followUpWords };
const closed = { ...reopened, ...buildTeacherAnswer({ answer: SECOND_ANSWER, teacherEmail: TEACHER, timestamp: 4 }) };

/* ------------------------------------------------------------------ the model */

test('a follow-up is possible once, after the answer, and only with words', () => {
  assert.equal(canAskFollowUp(waiting), false, 'nobody has answered: that is rewording, not a follow-up');
  assert.equal(canAskFollowUp(answered), true);
  assert.equal(canAskFollowUp(null), false);
  assert.equal(canAskFollowUp({ ...answered, answer: '  ' }), false, 'no answer on the document, nothing to keep beside the new words');
  assert.equal(canAskFollowUp({ ...answered, status: QUESTION_STATUS.OPEN }), false, 'open means the teacher has yet to answer, whatever else the document holds');
  assert.equal(hasFollowUp(answered), false);

  // Exactly the five fields the rules let a student change, and the first exchange copied from the document.
  assert.deepEqual(
    buildFollowUp({ existing: answered, text: `  ${SECOND}  `, timestamp: 'TS' }),
    { status: QUESTION_STATUS.OPEN, text: SECOND, earlierText: FIRST, earlierAnswer: FIRST_ANSWER, updatedAt: 'TS' },
  );
  // Not the caller's idea of the first exchange: a student cannot supply the teacher's words.
  const forged = buildFollowUp({ existing: answered, text: SECOND, earlierText: 'made up', earlierAnswer: 'You are right, full marks.' });
  assert.equal(forged.earlierText, FIRST);
  assert.equal(forged.earlierAnswer, FIRST_ANSWER);

  assert.equal(buildFollowUp({ existing: waiting, text: SECOND }), null, 'a waiting question is reworded, not followed up');
  assert.equal(buildFollowUp({ existing: answered, text: '   ' }), null, 'nothing to send');
  assert.equal(buildFollowUp({ text: SECOND }), null, 'no question to follow up');
  assert.equal(buildFollowUp({ existing: answered, text: 'y'.repeat(QUESTION_TEXT_MAX + 50) }).text.length, QUESTION_TEXT_MAX, 'as long as a question may be');
});

test('the follow-up reopens the same question once, and the first exchange stays beside it', () => {
  assert.equal(reopened.id, answered.id, 'the same document');
  assert.equal(reopened.status, QUESTION_STATUS.OPEN, 'open again, so Teacher Home lists it');
  assert.equal(reopened.text, SECOND);
  assert.equal(hasFollowUp(reopened), true);
  assert.equal(canAskFollowUp(reopened), false, 'while it waits, asking again is only rewording');

  // Rewording the waiting follow-up changes the words and nothing of the first exchange.
  assert.deepEqual(Object.keys(buildQuestionEdit({ text: 'Rephrased', timestamp: 'TS' })).sort(), ['text', 'updatedAt']);

  // The teacher answers it; the first exchange is still there, and that is the last round.
  assert.equal(closed.status, QUESTION_STATUS.ANSWERED);
  assert.equal(closed.answer, SECOND_ANSWER);
  assert.equal(closed.earlierText, FIRST);
  assert.equal(closed.earlierAnswer, FIRST_ANSWER);
  assert.equal(canAskFollowUp(closed), false, 'one round: past it the student asks in class');
  assert.equal(buildFollowUp({ existing: closed, text: 'One more' }), null);
});

test('a waiting follow-up is a waiting question to the handover and the retention job (TT26)', () => {
  // The class changed hands while the follow-up waited: it moves to the new teacher of record, with its first exchange.
  const handover = { teacherOfRecord: 'new@school.org', classId: 'C2' };
  assert.deepEqual(openQuestionHandover(reopened, handover), { teacherEmail: 'new@school.org', classId: 'C2' });
  assert.equal(openQuestionHandover(closed, handover), null, 'answered, it stays with the teacher who answered');
  // A year is counted from the last change, and the follow-up is one.
  const now = Date.UTC(2027, 5, 1);
  const daysAgo = (days) => now - days * 24 * 60 * 60 * 1000;
  const longAgo = { ...answered, updatedAt: daysAgo(400) };
  assert.equal(askTeacherQuestionExpired(longAgo, now), true);
  const followed = { ...longAgo, ...buildFollowUp({ existing: longAgo, text: SECOND, timestamp: daysAgo(2) }) };
  assert.equal(askTeacherQuestionExpired(followed, now), false, 'the exchange is kept a year from the follow-up');
});

/* ------------------------------------------------ the model and the rules agree */

const rulesSource = read('firestore.rules');
const listIn = (text) => [...text.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);

test('a follow-up writes exactly the fields firestore.rules lets a student change after an answer', () => {
  const block = region(rulesSource, 'match /askTeacherQuestions/{questionId} {', 'allow delete: if false;', 'the question rules');
  const named = block.match(/hasOnly\(\[([^\]]*'earlierText'[^\]]*)\]\)/);
  assert.ok(named, 'the rules name the fields a follow-up may change');
  assert.deepEqual(
    Object.keys(buildFollowUp({ existing: answered, text: SECOND, timestamp: 'TS' })).sort(),
    [...listIn(named[1])].sort(),
    'the app writes what the rule allows, and the rule allows nothing more',
  );
  // The first exchange can only be what the document already holds, and the new words are as long as a question.
  assert.match(block, /request\.resource\.data\.earlierText\s*==\s*resource\.data\.text/);
  assert.match(block, /request\.resource\.data\.earlierAnswer\s*==\s*resource\.data\.answer/);
  assert.equal(QUESTION_TEXT_MAX, 500);
});

test('the store writes the follow-up to the same document, never a second one', () => {
  const store = code('src/platform/supports/askTeacherStore.js');
  const send = region(store, 'export const sendTeacherQuestion', '\n};', 'sendTeacherQuestion');
  const answeredCase = region(send, 'QUESTION_STATUS.ANSWERED', 'return existing.id;', 'the answered case');
  assert.match(answeredCase, /buildFollowUp\(\{ existing, text, timestamp: serverTimestamp\(\) \}\)/);
  assert.match(answeredCase, /updateDoc\(doc\(db, TEACHER_QUESTION_COLLECTION, existing\.id\), followUp\)/);
  assert.doesNotMatch(answeredCase, /setDoc|addDoc|collection\(/, 'one document per question: no second document, no list');
  // With no room left (already followed up) or nothing to say, it throws instead of writing.
  assert.match(answeredCase, /if \(!followUp\) throw new Error\(/);
});

/* --------------------------------------------------------------- what is read */

const withVite = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    await server.close();
  }
};

const ASK_BUTTONS = /Ask a follow-up|Edit my follow-up|Edit my question|Leave a question/;
const inOrder = (html, lines) => {
  const places = lines.map((line) => html.indexOf(line));
  places.forEach((place, index) => assert.notEqual(place, -1, `"${lines[index]}" is shown`));
  places.forEach((place, index) => index && assert.ok(place > places[index - 1], `"${lines[index]}" comes after "${lines[index - 1]}"`));
};

test('the student reads the whole exchange at each step, and is offered the follow-up only once (rendered)', async () => {
  await withVite(async (load) => {
    const { default: HintPanel } = await load('/src/platform/supports/hints/HintPanel.jsx');
    const { TeacherAnswersList } = await load('/src/components/student/TeacherAnswersList.jsx');
    const send = async () => {};
    const panel = (question, extra = {}) => renderToStaticMarkup(React.createElement(HintPanel, {
      hints: [], askTeacher: { mode: ASK_MODE.QUESTION, question, onSendQuestion: send, ...extra },
    }));

    // Answered: the answer, and a way to ask more, but not a way to reword the question that was answered.
    const afterAnswer = panel(answered);
    inOrder(afterAnswer, [FIRST, FIRST_ANSWER]);
    assert.match(afterAnswer, />Ask a follow-up<\/button>/);
    assert.doesNotMatch(afterAnswer, /Leave a question|Edit my question|Edit my follow-up/);
    assert.doesNotMatch(panel(answered, { onSendQuestion: null }), /Ask a follow-up/, 'nothing can be sent from here: no button');

    // Follow-up waiting: the first exchange stays above the new words, which can still be reworded.
    const whileWaiting = panel(reopened);
    inOrder(whileWaiting, [FIRST, FIRST_ANSWER, SECOND]);
    assert.match(whileWaiting, /data-ask-teacher-status="waiting"/);
    assert.match(whileWaiting, />Edit my follow-up<\/button>/);
    assert.doesNotMatch(whileWaiting, /Ask a follow-up|Leave a question|Edit my question/);

    // Answered again: all four, in the order they happened, and nothing left to press.
    const atTheEnd = panel(closed);
    inOrder(atTheEnd, [FIRST, FIRST_ANSWER, SECOND, SECOND_ANSWER]);
    assert.match(atTheEnd, /data-ask-teacher-status="answered"/);
    assert.doesNotMatch(atTheEnd, ASK_BUTTONS, 'one round');
    assert.match(atTheEnd, /in class/i, 'and it says where to ask next');
    assert.doesNotMatch(panel(waiting), /Ask a follow-up/, 'a first question that is still waiting has no follow-up to ask');

    // Review My Work lists every question with its whole exchange; the workspace keeps a waiting follow-up
    // (its first answer stays one click away) but not a first question that is still waiting.
    const stuck = { ...waiting, id: 'x', questionIndex: 7, questionLabel: 'Classwork · Question 8', text: 'Still stuck here', createdAt: 9 };
    const questions = [
      { ...closed, questionLabel: 'Classwork · Question 4' },
      { ...reopened, id: 'r', questionIndex: 5, questionLabel: 'Classwork · Question 6' },
      stuck,
    ];
    const review = renderToStaticMarkup(React.createElement(TeacherAnswersList, { questions }));
    inOrder(review, [FIRST, FIRST_ANSWER, SECOND, SECOND_ANSWER]);
    assert.equal((review.match(/data-teacher-follow-up/g) || []).length, 2, 'both follow-ups are marked');
    assert.match(review, /Still stuck here/);
    const compact = renderToStaticMarkup(React.createElement(TeacherAnswersList, { questions, compact: true }));
    assert.equal((compact.match(/data-teacher-question=/g) || []).length, 2, 'the answered follow-up and the waiting one');
    assert.doesNotMatch(compact, /Still stuck here/);
    inOrder(compact, [FIRST, FIRST_ANSWER, SECOND]);
  });
});

test('the teacher sees what the student was told before reading the follow-up (rendered)', async () => {
  await withVite(async (load) => {
    const { QuestionRow } = await load('/src/components/teacher/StudentQuestionsPanel.jsx');
    const row = (question) => renderToStaticMarkup(React.createElement(QuestionRow, {
      question,
      place: { title: 'Lesson 4: Slope', label: 'Classwork · Question 4' },
      studentName: 'Sam Student',
      studentIdText: '',
      prompt: '',
      teacherEmail: TEACHER,
      onOpenStudent: null,
      onAnswered: () => {},
    }));

    const first = row(waiting);
    assert.ok(first.includes(FIRST));
    assert.doesNotMatch(first, /data-student-follow-up/, 'a first question has no earlier exchange');

    const followUp = row(reopened);
    assert.match(followUp, /data-student-follow-up/);
    inOrder(followUp, [FIRST, FIRST_ANSWER, SECOND]);
    assert.match(followUp, /<textarea/, 'and the same answer box');
  });
});

test('the follow-up box opens from its own button and sends through the same call as a question', () => {
  const control = code('src/platform/supports/AskTeacherControl.jsx');
  const button = region(control, 'canAskFollowUp(question)', '</button>', 'the follow-up button');
  assert.match(button, /open\(true\)/, 'it opens the box for a follow-up, not for a first question');
  // The store decides from the document, so the box sends the same way for both.
  assert.match(control, /await askTeacher\.onSendQuestion\(\{ existing: question, text: words \}\);/);
  // Nothing about a follow-up goes anywhere but the send call (no log, report or notification).
  [
    'src/platform/supports/AskTeacherControl.jsx', 'src/platform/supports/askTeacher.js', 'src/platform/supports/askTeacherStore.js',
    'src/components/student/TeacherAnswersList.jsx', 'src/components/teacher/StudentQuestionsPanel.jsx',
  ].forEach((path) => assert.doesNotMatch(code(path), /console\.|reportClientError|reportError|logEvent|analytics|sendEmail|sendPush|httpsCallable|fetch\(/, path));
});
