/*
 * RC10: A RECOVERY THAT RUNS OUT OF PRACTICE QUESTIONS CAN REACH THE TEACHER.
 *
 * "There are no new practice questions left for this Recovery" sent the
 * student to their teacher with no way to reach them from that screen. The
 * screen now offers the question box Ask my teacher uses outside class. The
 * question is filed under one of the section's own questions (the only places
 * firestore.rules allows), labelled with the Recovery's name, and never on top
 * of a question the student asked there during the lesson.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { region } from './helpers/sourceContract.mjs';
import { QUESTION_STATUS, teacherQuestionPlace } from '../../src/platform/supports/askTeacher.js';
import { recoveryQuestionPlace } from '../../src/platform/supports/recoveryTeacherQuestion.js';
import { RECOVERY_NAME } from '../../src/platform/student/studentWords.js';

const code = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const LABEL = RECOVERY_NAME.dol;
const asked = (questionIndex, { label = `${'Exit ticket (DOL)'} · Question ${questionIndex + 1}`, status = QUESTION_STATUS.OPEN, at = 1 } = {}) => ({
  id: `S1__A1__${questionIndex}`, assignmentId: 'A1', questionIndex, questionLabel: label, status, text: 'Help', createdAt: at,
});
const place = (questions, questionIndexes = ['4', '5', '6']) => recoveryQuestionPlace({ questions, assignmentId: 'A1', questionIndexes, label: LABEL });

test('a Recovery question goes to the first of the section\'s questions the student has not asked about', () => {
  assert.deepEqual(place([]), { questionIndex: 4, question: null });
  // A question the student asked during the lesson is never reworded or
  // overwritten by the Recovery's.
  assert.deepEqual(place([asked(4)]), { questionIndex: 5, question: null });
  assert.deepEqual(place([asked(4), asked(5, { status: QUESTION_STATUS.ANSWERED })]), { questionIndex: 6, question: null });
  // Positions arrive as object keys: numbers, in order, whatever the order given.
  assert.deepEqual(place([], ['12', '3', 'x', '-1', '3']), { questionIndex: 3, question: null });
});

test('the student\'s own Recovery question waiting for an answer is the one shown, to wait on or reword', () => {
  const waiting = asked(6, { label: LABEL });
  // Even with an earlier place free: the question already sent is the one.
  assert.deepEqual(place([waiting]), { questionIndex: 6, question: waiting });
  assert.deepEqual(place([asked(4), waiting]), { questionIndex: 6, question: waiting });
});

test('after the teacher answers, a free place takes a new question; with none left the latest answer shows', () => {
  const answered = asked(4, { label: LABEL, status: QUESTION_STATUS.ANSWERED, at: 1 });
  assert.deepEqual(place([answered]), { questionIndex: 5, question: null }, 'a new question can be asked');
  const later = asked(5, { label: LABEL, status: QUESTION_STATUS.ANSWERED, at: 2 });
  assert.deepEqual(place([answered, later, asked(6)]), { questionIndex: 5, question: later }, 'every place used: the latest answer');
  // Every place holds a lesson question and none is the Recovery's: nothing to
  // offer, and the screen keeps its "let your teacher know".
  assert.equal(place([asked(4), asked(5), asked(6)]), null);
  assert.equal(place([], []), null);
  assert.equal(recoveryQuestionPlace({ questions: [], assignmentId: 'A1', questionIndexes: [4], label: '' }), null);
  assert.equal(recoveryQuestionPlace({ questions: [], assignmentId: '', questionIndexes: [4], label: LABEL }), null);
});

test('the teacher sees the Recovery\'s name as the place, and nothing else the device sends', () => {
  const assignment = { title: 'Slope' };
  assert.equal(teacherQuestionPlace({ assignment, questionLabel: RECOVERY_NAME.dol, questionIndex: 4 }).label, RECOVERY_NAME.dol);
  assert.equal(teacherQuestionPlace({ assignment, questionLabel: RECOVERY_NAME.warmup, questionIndex: 0 }).label, 'Warm-Up Recovery');
  assert.equal(teacherQuestionPlace({ assignment, questionLabel: 'Free points Recovery', questionIndex: 4 }).label, 'Question 5');
});

const ENTRY = {
  section: 'dol',
  label: LABEL,
  state: 'locked',
  message: 'Keep answering Recovery practice questions.',
  masteryPercent: 40,
  masteryCorrect: 2,
  masteryWindow: 5,
  masteryRequired: 4,
  nextPracticeItem: null,
  plan: null,
  submittedItemIds: [],
  note: null,
  result: null,
  questionsByIndex: { 4: { prompt: 'Find the slope.' }, 5: { prompt: 'Find the intercept.' } },
};

test('the empty Recovery offers the question box, and only to a student with a teacher on the roster (rendered)', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: SectionRecoveryRunner } = await server.ssrLoadModule('/src/components/student/SectionRecoveryRunner.jsx');
    const render = (props) => renderToStaticMarkup(React.createElement(SectionRecoveryRunner, {
      mode: 'practice', assignment: { id: 'A1', title: 'Slope' }, entry: ENTRY, studentId: 'S1', onExit: () => {}, onRecord: () => {}, onStartAssessment: () => {}, ...props,
    }));
    const withTeacher = render({ teacherQuestions: [], sendTeacherQuestion: async () => {} });
    assert.match(withTeacher, /no new practice questions left for this Recovery/);
    assert.match(withTeacher, /<div data-recovery-ask-teacher=""[^>]*><button type="button"[^>]*>✉ Leave a question for my teacher<\/button><\/div>/);
    const noTeacher = render({ teacherQuestions: [], sendTeacherQuestion: null });
    assert.match(noTeacher, /no new practice questions left for this Recovery/);
    assert.doesNotMatch(noTeacher, /data-recovery-ask-teacher|Leave a question/, 'no teacher on the roster: nothing to offer');
  } finally {
    await server.close();
  }
});

test('the question is sent with the Recovery\'s place and its own opening line; App reads and sends for it', () => {
  const runner = code('src/components/student/SectionRecoveryRunner.jsx');
  const asking = region(runner, 'function RecoveryTeacherQuestion(', '\n}\n', 'the Recovery question');
  assert.match(asking, /questionIndex: place\.questionIndex,\s*questionLabel: entry\.label,/);
  assert.match(asking, /composeHelp: RECOVERY_QUESTION_HELP,/);
  assert.match(code('src/platform/supports/AskTeacherControl.jsx'), /\{askTeacher\.composeHelp \|\| 'Your teacher is not in class with you right now\./);
  // The lazy Recovery screen imports no Firestore store: App reads the
  // questions, and only while a Recovery is open and there is a teacher.
  assert.doesNotMatch(runner, /useAskMyTeacher|askTeacherStore/);
  const app = code('src/App.jsx');
  const reading = region(app, 'const recoveryTeacherQuestions = useTeacherQuestionsOn({', '});', 'App reads the Recovery\'s questions');
  assert.match(reading, /studentId: askingStudentId && user\?\.assignedTeacherEmail \? askingStudentId : null,/);
  assert.match(reading, /assignmentId: recoverySession\?\.assignmentId \|\| null,/);
  const mount = region(app, '<SectionRecoveryRunner', '/>', 'the Recovery mount');
  assert.match(mount, /teacherQuestions=\{recoveryTeacherQuestions\.questions\}/);
  assert.match(mount, /sendTeacherQuestion=\{recoveryTeacherQuestions\.canLeaveQuestion \? recoveryTeacherQuestions\.sendQuestion : null\}/);
});
