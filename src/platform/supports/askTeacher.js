/*
 * "ASK MY TEACHER" THAT ANSWERS BACK (student pass 3, HELP-5, decision D6).
 *
 * Two shapes of the same request, chosen by whether the student's class is
 * meeting right now:
 *
 *   IN CLASS   — the raised hand (helpRequest.js, carried by presence). The
 *                teacher's live monitor answers it with "Seen" or "On my way",
 *                one small document the student reads beside the hand:
 *                helpAcknowledgements/{studentId}.
 *   OUT OF IT  — a short question the student leaves for their teacher, with
 *                the assignment and question it is about. The teacher answers
 *                it from Teacher Home; the student reads the answer on the
 *                question and in Review My Work:
 *                askTeacherQuestions/{studentId}__{assignmentId}__{questionIndex}.
 *
 * "In class" is the student's own class meeting now — the bell schedule (A/B
 * day, a modified day), their class period, and the district calendar — not the
 * clock alone. A student with no period, a weekend, a holiday or the hours
 * outside their period all leave a question instead of raising a hand nobody
 * is there to see.
 *
 * What the student writes is private to them and their teacher
 * (firestore.rules): it is never logged, never sent to analytics, and never
 * rides in presence. This module only shapes documents; it writes nothing.
 */
import { getPeriodWindow, localDateKey } from '../../assignmentLifecycle.js';
import { EXIT_TICKET_SPELLED_OUT, RECOVERY_NAME } from '../student/studentWords.js';
import { buildNonInstructionalSet } from '../path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../curriculum/calendars/schoolYear2026-2027.js';

export const TEACHER_QUESTION_COLLECTION = 'askTeacherQuestions';
export const HELP_ACKNOWLEDGEMENT_COLLECTION = 'helpAcknowledgements';

// "A few sentences": long enough to say what is confusing, short enough that
// it stays a question and not a chat. firestore.rules enforces the same caps.
export const QUESTION_TEXT_MAX = 500;
export const ANSWER_TEXT_MAX = 1000;
// Display fields the student's screen copies from the assignment. They travel
// with the question, so they are the student's device's words: Teacher Home
// shows its own copy of the title and accepts the label only in the shape the
// app builds (teacherQuestionPlace).
export const QUESTION_LABEL_MAX = 120;
export const ASSIGNMENT_TITLE_MAX = 200;
// How many waiting questions Teacher Home loads at once (askTeacherStore.js).
export const TEACHER_QUESTIONS_SHOWN = 100;

export const ASK_MODE = Object.freeze({ HAND: 'hand', QUESTION: 'question' });
export const QUESTION_STATUS = Object.freeze({ OPEN: 'open', ANSWERED: 'answered' });
export const HELP_ACK_STATUS = Object.freeze({ SEEN: 'seen', ON_MY_WAY: 'onMyWay' });

export const HELP_ACK_TEXT = Object.freeze({
  [HELP_ACK_STATUS.SEEN]: 'Your teacher has seen your hand.',
  [HELP_ACK_STATUS.ON_MY_WAY]: 'Your teacher is on the way.',
});

// Built once: the district calendar does not change while the app is open.
const SCHOOL_NON_INSTRUCTIONAL_KEYS = buildNonInstructionalSet(schoolYearNonInstructionalRanges());

const text = (value) => String(value ?? '').trim();
const millis = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return null;
};

/**
 * Is the student's own class meeting right now? The bell schedule decides
 * (getPeriodWindow: today's A/B day or modified schedule, with this period
 * switched on), and a day the district calendar marks closed is not class —
 * unless the school set a bell schedule for that very date (a make-up day), which
 * is the more specific word, as it already outranks the A/B rotation.
 */
export const studentClassInSession = ({
  schedule = null,
  classPeriod = null,
  nowValue = Date.now(),
  nonInstructionalKeys = SCHOOL_NON_INSTRUCTIONAL_KEYS,
} = {}) => {
  if (!schedule || !text(classPeriod)) return false;
  const now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  if (!Number.isFinite(now)) return false;
  const dateKey = localDateKey(now);
  if (nonInstructionalKeys?.has?.(dateKey) && !schedule?.modifiedSchedules?.[dateKey]) return false;
  const window = getPeriodWindow(schedule, classPeriod, now);
  if (!window) return false;
  return now >= window.start.getTime() && now <= window.end.getTime();
};

export const askTeacherMode = (inClass) => (inClass ? ASK_MODE.HAND : ASK_MODE.QUESTION);

/** The student's words, trimmed and capped — '' when there is nothing to send. */
export const cleanQuestionText = (value, max = QUESTION_TEXT_MAX) => text(value).slice(0, max).trim();

/*
 * ONE ID, ONE QUESTION (SI04). A student id may hold "_" anywhere, "__" too,
 * so the id below is read back unambiguously only because the assignment id
 * neither starts nor ends with "_" and has no "__" in it: then the student is
 * everything before the last run of two or more underscores but its last two
 * (student "a__" with assignment "X" and student "a_" with assignment "_X"
 * would both be "a____X__0"). Every assignment is created with a Firestore
 * auto-id, which has no "_" at all; firestore.rules refuses the same shapes.
 */
const SEPARABLE_ASSIGNMENT_ID = /^(?!_)(?!.*__)(?!.*_$).+$/;

/**
 * One question per student per question of an assignment: the id is the
 * student, the assignment and the question position, so asking again edits
 * the open one. The rules also require a real assignment of the student's own
 * class; together with the teacher's capped list (TEACHER_QUESTIONS_SHOWN)
 * that keeps one student from burying everyone else's questions.
 */
export const teacherQuestionId = ({ studentId, assignmentId, questionIndex } = {}) => {
  const student = text(studentId);
  const assignment = text(assignmentId);
  const index = Number(questionIndex);
  if (!student || !assignment || !Number.isInteger(index) || index < 0) return null;
  if (!SEPARABLE_ASSIGNMENT_ID.test(assignment)) return null;
  return `${student}__${assignment}__${index}`;
};

/*
 * WHERE THE QUESTION WAS ASKED, AS TEACHER HOME SAYS IT.
 *
 * The title and label are written by the student's device, so a teacher is
 * never shown them as if they were the platform's: the title is the teacher's
 * own copy of the assignment's, and the label ("Classwork · Question 3", the
 * section and the position App.jsx builds) only in that shape, with a section
 * the platform names. Anything else reads "Question <n>" from the index.
 */
// The workspace's section tabs. The exit ticket's tab is "Exit ticket (DOL)"
// since student pass 3 (D9, studentWords.js); "DOL / Exit Ticket" stays for
// questions already stored under the old tab name.
const SECTION_LABELS = Object.freeze(['Warm-Up', 'Classwork', 'Practice', EXIT_TICKET_SPELLED_OUT, 'DOL / Exit Ticket', 'Checkpoint', 'Quiz', 'Test']);
const PLACE_PATTERN = /^(.+) · Question ([1-9][0-9]{0,2})$/;
// A question left from a Recovery is about the Recovery, not one question:
// its label is the Recovery's own name (RC10, recoveryTeacherQuestion.js).
const RECOVERY_PLACES = Object.freeze(Object.values(RECOVERY_NAME));

export const teacherQuestionPlace = ({ assignment = null, questionLabel = '', questionIndex = 0 } = {}) => {
  const title = text(assignment?.title) || 'Assignment';
  const match = PLACE_PATTERN.exec(text(questionLabel));
  const label = match && SECTION_LABELS.includes(match[1])
    ? `${match[1]} · Question ${match[2]}`
    : RECOVERY_PLACES.includes(text(questionLabel))
      ? text(questionLabel)
      : `Question ${Math.max(0, Number(questionIndex) || 0) + 1}`;
  return { title, label };
};


/** A new question, exactly the fields firestore.rules allows a student to create. */
export const buildTeacherQuestion = ({
  studentId, classId = null, teacherEmail, assignmentId, assignmentTitle = '', questionIndex,
  questionLabel = '', text: words, timestamp,
} = {}) => {
  const body = cleanQuestionText(words);
  const id = teacherQuestionId({ studentId, assignmentId, questionIndex });
  if (!id || !body || !text(teacherEmail)) return null;
  return {
    id,
    data: {
      schemaVersion: 1,
      studentId: text(studentId),
      classId: text(classId) || null,
      teacherEmail: text(teacherEmail),
      assignmentId: text(assignmentId),
      assignmentTitle: text(assignmentTitle).slice(0, ASSIGNMENT_TITLE_MAX),
      questionIndex: Number(questionIndex),
      questionLabel: text(questionLabel).slice(0, QUESTION_LABEL_MAX),
      text: body,
      status: QUESTION_STATUS.OPEN,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
};

/** The student rewording a question nobody has answered yet. */
export const buildQuestionEdit = ({ text: words, timestamp } = {}) => {
  const body = cleanQuestionText(words);
  return body ? { text: body, updatedAt: timestamp } : null;
};

/** The teacher's answer: the only fields a teacher may change. */
export const buildTeacherAnswer = ({ answer, teacherEmail, timestamp } = {}) => {
  const body = cleanQuestionText(answer, ANSWER_TEXT_MAX);
  if (!body || !text(teacherEmail)) return null;
  return {
    status: QUESTION_STATUS.ANSWERED,
    answer: body,
    answeredBy: text(teacherEmail),
    answeredAt: timestamp,
    updatedAt: timestamp,
  };
};

/** The student's question about one question of one assignment, if any. */
export const questionFor = (questions, { assignmentId, questionIndex } = {}) => (
  (Array.isArray(questions) ? questions : []).find((question) => (
    question?.assignmentId === assignmentId && Number(question?.questionIndex) === Number(questionIndex)
  )) || null
);

/** Questions in the order they were asked; answered ones carry the answer. */
export const sortQuestions = (questions) => [...(Array.isArray(questions) ? questions : [])]
  .sort((a, b) => (millis(a?.createdAt) ?? 0) - (millis(b?.createdAt) ?? 0)
    || Number(a?.questionIndex) - Number(b?.questionIndex));

/**
 * The teacher's "Seen" / "On my way" for one raised hand. It names the hand
 * (the presence `helpRequestedAt`), so a hand raised again later is a new
 * request the old acknowledgement does not answer.
 */
export const buildHelpAcknowledgement = ({
  studentId, assignmentId, helpRequestedAt, status, teacherEmail, timestamp,
} = {}) => {
  const at = Number(helpRequestedAt);
  if (!text(studentId) || !text(assignmentId) || !Number.isInteger(at) || at <= 0) return null;
  if (!Object.values(HELP_ACK_STATUS).includes(status) || !text(teacherEmail)) return null;
  return {
    studentId: text(studentId),
    assignmentId: text(assignmentId),
    helpRequestedAt: at,
    status,
    teacherEmail: text(teacherEmail),
    acknowledgedAt: timestamp,
  };
};

/** What the student sees beside their raised hand: 'seen', 'onMyWay' or null. */
export const acknowledgementFor = (request, acknowledgement) => {
  if (!request || !acknowledgement) return null;
  if (acknowledgement.assignmentId !== request.assignmentId) return null;
  if (Number(acknowledgement.helpRequestedAt) !== Math.floor(Number(request.at))) return null;
  return Object.values(HELP_ACK_STATUS).includes(acknowledgement.status) ? acknowledgement.status : null;
};
