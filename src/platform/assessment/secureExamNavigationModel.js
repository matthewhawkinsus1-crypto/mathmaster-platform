/*
 * MOVING AROUND A SECURE TEST, AS THE STUDENT'S SCREEN READS IT.
 *
 * The server decides where a student may go (functions/lib/secureExamNavigation.js):
 * any question already opened, or the next one not opened yet — never further
 * ahead, and never back into a Digital SAT module the student has finished. It
 * sends that state with every session as `navigation` (states only: answered,
 * unanswered, flagged, recorded — never whether anything is right).
 *
 * This module is the browser's reading of that block, kept out of React so it
 * can be tested directly: where Previous and Next lead, what each square of
 * the question grid shows, what the review screen lists before Submit, which
 * of the student's own words a refusal or a paused session is shown in, and
 * the plain-language status a student sees on their list of tests.
 *
 * It decides nothing the server does not also enforce. A move it allows can
 * still be refused, and the screen then shows the server's own message. And it
 * never looks at an answer: it only knows whether a question has one.
 */

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const wholeNumber = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export const ITEM_STATUS = Object.freeze({
  ANSWERED: 'answered',
  UNANSWERED: 'unanswered',
  // An answer the older one-way runtime recorded and locked: it stays locked.
  RECORDED: 'recorded',
  NOT_OPENED: 'notOpened',
});

export const SESSION_STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  LOCKED_PROCTOR: 'locked_proctor',
  LOCKED_INTEGRITY: 'locked_integrity',
  SUBMITTED: 'submitted',
  FORCE_SUBMITTED: 'force_submitted',
  TIME_EXPIRED: 'time_expired',
});

const TERMINAL = new Set([SESSION_STATUS.SUBMITTED, SESSION_STATUS.FORCE_SUBMITTED, SESSION_STATUS.TIME_EXPIRED]);
const ITEM_STATES = new Set([ITEM_STATUS.ANSWERED, ITEM_STATUS.UNANSWERED, ITEM_STATUS.RECORDED]);

// The server's own refusals, word for word, for a move this screen already
// knows it would refuse — so the student reads the same sentence either way.
export const NAVIGATION_MESSAGES = Object.freeze({
  module_closed: 'That module is finished. You can only move between questions in the current module.',
  not_reached: 'Open the questions in order the first time; you can skip any question with Next.',
  invalid: 'That question number is not on this test.',
});

export const DEFAULT_INTEGRITY_LOCK_THRESHOLD = 3;

/**
 * The navigation block of a public session, made safe to read: positions are
 * whole numbers inside the test, items are sorted by position, and a session
 * from before navigation existed reads as "nothing opened yet".
 */
export function readNavigation(session) {
  const source = isObject(session?.navigation) ? session.navigation : {};
  const total = wholeNumber(source.total) || wholeNumber(session?.requiredQuestions) || 0;
  const seen = new Set();
  const items = (Array.isArray(source.items) ? source.items : [])
    .filter((item) => {
      const position = wholeNumber(item?.position);
      if (!isObject(item) || position === null || position >= total || seen.has(position)) return false;
      seen.add(position);
      return true;
    })
    .map((item) => ({
      position: wholeNumber(item.position),
      questionInstanceId: String(item.questionInstanceId || '') || null,
      status: ITEM_STATES.has(item.status) ? item.status : ITEM_STATUS.UNANSWERED,
      flagged: item.flagged === true,
      closed: item.closed === true,
    }))
    .sort((left, right) => left.position - right.position);
  const issued = Math.min(total, Math.max(wholeNumber(source.issued) ?? 0, items.length));
  const modules = Array.isArray(source.modules) && source.modules.length
    ? source.modules
      .map((entry, index) => ({
        number: wholeNumber(entry?.number) || index + 1,
        start: wholeNumber(entry?.start) ?? 0,
        end: Math.min(total, wholeNumber(entry?.end) ?? 0),
        closed: entry?.closed === true,
      }))
      .filter((entry) => entry.end > entry.start)
      .sort((left, right) => left.start - right.start)
    : null;
  const cursor = Math.min(wholeNumber(source.cursor) ?? 0, Math.max(0, total - 1));
  return {
    total,
    issued,
    cursor,
    items,
    modules: modules && modules.length ? modules : null,
    upgradedFromLinear: source.upgradedFromLinear === true,
  };
}

const moduleIndexFor = (navigation, position) => (
  Array.isArray(navigation?.modules)
    ? navigation.modules.findIndex((entry) => position >= entry.start && position < entry.end)
    : -1
);

export function moduleFor(navigation, position) {
  const index = moduleIndexFor(navigation, position);
  return index >= 0 ? navigation.modules[index] : null;
}

/** Everything the screen knows about one question number. Never its answer. */
export function positionState(navigation, position) {
  const item = navigation.items.find((entry) => entry.position === position) || null;
  const module = moduleFor(navigation, position);
  const opened = position < navigation.issued;
  return {
    position,
    number: position + 1,
    questionInstanceId: item?.questionInstanceId || null,
    status: opened ? (item?.status || ITEM_STATUS.UNANSWERED) : ITEM_STATUS.NOT_OPENED,
    flagged: Boolean(opened && item?.flagged),
    closed: Boolean(item?.closed || module?.closed),
    opened,
    moduleNumber: module ? module.number : null,
  };
}

/**
 * Where a move to `position` leads:
 *
 *   { kind: 'open', position }          ask the server for that question
 *   { kind: 'moduleEnd', position, finishing, next }
 *                                       the first question of the next module:
 *                                       review the finished module first
 *   { kind: 'blocked', reason, message }  refused here, in the server's words
 */
export function targetFor(navigation, position) {
  if (!Number.isInteger(position) || position < 0 || position >= navigation.total) {
    return { kind: 'blocked', reason: 'invalid', message: NAVIGATION_MESSAGES.invalid };
  }
  if (positionState(navigation, position).closed) {
    return { kind: 'blocked', reason: 'module_closed', message: NAVIGATION_MESSAGES.module_closed };
  }
  if (position > navigation.issued) {
    return { kind: 'blocked', reason: 'not_reached', message: NAVIGATION_MESSAGES.not_reached };
  }
  if (position === navigation.issued) {
    const index = moduleIndexFor(navigation, position);
    if (index > 0) {
      const next = navigation.modules[index];
      const finishing = navigation.modules[index - 1];
      if (next.start === position && !finishing.closed) return { kind: 'moduleEnd', position, finishing, next };
    }
  }
  return { kind: 'open', position };
}

/**
 * The module review the server is waiting for, if any: the next unopened
 * question starts a module the student has not been told they are leaving.
 * Used when the server refuses a move with `module_end` (this screen's copy
 * of the navigation was a step behind).
 */
export function pendingModuleEnd(navigation) {
  const target = targetFor(navigation, navigation.issued);
  return target.kind === 'moduleEnd' ? target : null;
}

/** What Next does from `current`: the next question, a module review, or the final review. */
export function nextTarget(navigation, current) {
  if (!Number.isInteger(current)) return targetFor(navigation, navigation.cursor);
  if (current + 1 >= navigation.total) return { kind: 'review' };
  return targetFor(navigation, current + 1);
}

/** The words on the Next button for where it leads. */
export function nextActionLabel(target) {
  if (target?.kind === 'review') return 'Review answers';
  if (target?.kind === 'moduleEnd') return `Review module ${target.finishing.number}`;
  return 'Next';
}

/** What Previous does from `current`, or null where there is nothing to go back to. */
export function previousTarget(navigation, current) {
  if (!Number.isInteger(current) || current <= 0) return null;
  const target = targetFor(navigation, current - 1);
  return target.kind === 'open' ? target : null;
}

const STATUS_WORDS = {
  [ITEM_STATUS.ANSWERED]: 'answered',
  [ITEM_STATUS.UNANSWERED]: 'no answer yet',
  [ITEM_STATUS.RECORDED]: 'answer recorded earlier, can\'t be changed',
  [ITEM_STATUS.NOT_OPENED]: 'not opened yet',
};

/** The squares of the question grid, with the words a screen reader says for each. */
export function navigatorCells(navigation, current = null) {
  return Array.from({ length: navigation.total }, (_, position) => {
    const state = positionState(navigation, position);
    const target = targetFor(navigation, position);
    const isCurrent = position === current;
    const words = [
      STATUS_WORDS[state.status],
      state.flagged ? 'marked for review' : null,
      state.closed ? 'module finished' : null,
      isCurrent ? 'current question' : null,
    ].filter(Boolean).join(', ');
    return {
      ...state,
      current: isCurrent,
      reachable: target.kind === 'open' || target.kind === 'moduleEnd',
      target,
      label: `Question ${state.number}: ${words}`,
    };
  });
}

/**
 * What the review screen lists: the whole test before Submit, or one module
 * before the student leaves it. Only questions the student can still reach are
 * listed to jump to; the counts cover everything, because a blank question in
 * a finished module still counts as zero.
 */
export function reviewSummary(navigation, { moduleNumber = null } = {}) {
  const module = moduleNumber === null || moduleNumber === undefined
    ? null
    : (navigation.modules || []).find((entry) => entry.number === moduleNumber) || null;
  const start = module ? module.start : 0;
  const end = module ? module.end : navigation.total;
  const states = Array.from({ length: Math.max(0, end - start) }, (_, offset) => positionState(navigation, start + offset));
  const answered = states.filter((state) => state.status === ITEM_STATUS.ANSWERED || state.status === ITEM_STATUS.RECORDED).length;
  const open = states.filter((state) => !state.closed);
  const notOpened = open.filter((state) => state.status === ITEM_STATUS.NOT_OPENED).map((state) => state.position);
  return {
    total: states.length,
    answered,
    blank: states.length - answered,
    unanswered: open.filter((state) => state.status === ITEM_STATUS.UNANSWERED).map((state) => state.position),
    notOpened,
    // Only the first unopened question can be reached; the rest follow it.
    firstNotOpened: notOpened.length && notOpened[0] === navigation.issued ? notOpened[0] : null,
    flagged: open.filter((state) => state.flagged).map((state) => state.position),
    finishedModules: (navigation.modules || []).filter((entry) => entry.closed && (!module || entry.number !== module.number)).map((entry) => entry.number),
  };
}

/** A copy of the session with one question's review flag set, for the screen to show at once. */
export function withReviewFlag(session, questionInstanceId, flagged) {
  if (!isObject(session?.navigation) || !Array.isArray(session.navigation.items)) return session;
  return {
    ...session,
    navigation: {
      ...session.navigation,
      items: session.navigation.items.map((item) => (
        item?.questionInstanceId === questionInstanceId ? { ...item, flagged: flagged === true } : item
      )),
    },
  };
}

/*
 * WHAT COUNTS TOWARD AN INTEGRITY PAUSE, IN A STUDENT'S WORDS.
 *
 * The integrity logger (examIntegrityLogger.js) records more than leaving the
 * window: copying, pasting or cutting, the copy/paste keyboard shortcuts, and
 * a right-click all count toward the same limit. A student who pressed Ctrl+V
 * in an answer box and was told they "left the test" would not know what to
 * stop doing, so every message names all of it.
 */
export const INTEGRITY_WARNING_TEXT = 'One more time leaving the test window, or trying to copy, paste or right-click, will pause the test for your teacher.';

/** Why an integrity pause happened, and what to do about it. */
export function integrityPauseText(lockThreshold = DEFAULT_INTEGRITY_LOCK_THRESHOLD) {
  const threshold = wholeNumber(lockThreshold) || DEFAULT_INTEGRITY_LOCK_THRESHOLD;
  return `The test paused because you left the test window or tried to copy, paste or right-click ${plural(threshold, 'time')} in all. Your answers are saved. Raise your hand — your teacher can let you continue.`;
}

function integrityRule(lockThreshold) {
  const threshold = wholeNumber(lockThreshold) || DEFAULT_INTEGRITY_LOCK_THRESHOLD;
  return `The test opens in full screen. Stay in the test window. Each time you leave it, or try to copy, paste or right-click, your teacher sees it — and after ${plural(threshold, 'time')} in all, the test pauses until your teacher lets you continue.`;
}

/**
 * Is the next integrity event the one that pauses the test?
 *
 * The server says so (`warning`) on the event that leaves exactly one to go.
 * The count is read too, with `>=`, for the case the server's flag does not
 * cover: a teacher who resumes an integrity-paused test leaves the count AT
 * the threshold, so any single event pauses it again — and the student should
 * be told that before it happens, not after.
 */
export function integrityWarningDue({ status, violationCount, lockThreshold, warning } = {}) {
  if (status !== SESSION_STATUS.IN_PROGRESS) return false;
  if (warning === true) return true;
  const threshold = wholeNumber(lockThreshold) || DEFAULT_INTEGRITY_LOCK_THRESHOLD;
  const count = wholeNumber(violationCount) ?? 0;
  return count > 0 && count >= threshold - 1;
}

/** Which kind of pause a session is in: the teacher's, or the integrity limit's. */
export function pauseKind(status) {
  if (status === SESSION_STATUS.LOCKED_PROCTOR) return 'teacher';
  if (status === SESSION_STATUS.LOCKED_INTEGRITY) return 'integrity';
  return null;
}

/**
 * The paused status to show after a refusal that says the session is paused.
 *
 * A refusal names the pause when it can (`details.status`). One that does not
 * — finalize's own "A locked exam must be resolved by the proctor." — keeps
 * the pause already on screen rather than relabelling an integrity pause as
 * the teacher's; with nothing on screen yet it reads as the teacher's, and
 * the screen then asks the server which pause it is.
 */
export function pausedStatusAfterRefusal(refusalStatus, currentStatus) {
  if (pauseKind(refusalStatus)) return refusalStatus;
  if (pauseKind(currentStatus)) return currentStatus;
  return SESSION_STATUS.LOCKED_PROCTOR;
}

/**
 * What a failed secure-exam call means for the screen.
 *
 *   locked      the session is paused (teacher or integrity): show the pause,
 *               never a question that will not load
 *   navigation  the server refused a move; `message` is written for students
 *   expired     the time is up: finish the test as timed out
 *   finished    the test was already submitted (a teacher may have done it)
 *   itemClosed  that question can no longer be saved
 *   network     offline, or the call timed out
 *   other       anything else, with its message
 *
 * A callable's `deadline-exceeded` is also what the SDK reports for a call
 * that simply took too long, so it means "time is up" only when the message
 * says so or the session's own deadline has passed.
 */
export function classifySecureExamError(error, { expiresAt = null, now = Date.now() } = {}) {
  const code = String(error?.code || '').replace(/^functions\//, '');
  const details = isObject(error?.details) ? error.details : {};
  const message = String(error?.message || '').trim();
  if (details.status === SESSION_STATUS.LOCKED_PROCTOR || details.status === SESSION_STATUS.LOCKED_INTEGRITY) {
    return { kind: 'locked', status: details.status, message };
  }
  if (typeof details.navigation === 'string' && details.navigation) {
    return { kind: 'navigation', reason: details.navigation, message: message || NAVIGATION_MESSAGES[details.navigation] || '' };
  }
  const deadline = Number(expiresAt);
  const deadlinePassed = Number.isFinite(deadline) && deadline > 0 && Number(now) >= deadline;
  if (code === 'deadline-exceeded' && (/expired/i.test(message) || deadlinePassed)) return { kind: 'expired', message };
  // A server too old to say which pause it is (or finalize's own refusal).
  if (/exam is locked|locked exam/i.test(message)) return { kind: 'locked', status: null, message };
  if (/already (been )?submitted/i.test(message)) return { kind: 'finished', message };
  if (/no longer active/i.test(message)) return { kind: 'itemClosed', message };
  if (code === 'unavailable' || code === 'deadline-exceeded' || /network|offline|failed to fetch/i.test(message)) {
    return { kind: 'network', message };
  }
  return { kind: 'other', message };
}

/** The time a session allows, including a teacher's added minutes and the student's extended time. */
export function timeAllowance(session) {
  const seconds = Number(session?.timeLimitSeconds);
  const timed = session?.timed !== false && Number.isFinite(seconds) && seconds > 0;
  if (!timed) return { timed: false, minutes: null, extended: false };
  const added = Math.max(0, Number(session?.addedTimeSeconds) || 0);
  return {
    timed: true,
    // Limits are whole minutes; a timed test never reads as "0 minutes".
    minutes: Math.max(1, Math.round((seconds + added) / 60)),
    extended: Number(session?.extendedTimeMultiplier) > 1,
  };
}

/**
 * The time a start screen can promise, from the best source it has:
 *
 *   - a test already started (the student is coming back to it): what is LEFT
 *     on its clock, which kept running while they were away — never the whole
 *     allowance "starting when you press Start";
 *   - a test not started yet: its own limit. The server sends a not-started
 *     session with the student's extended time already applied
 *     (`extendedTimeMultiplier`), exactly as it will apply it at Start;
 *   - a course Test opened from its card before the session is known: the
 *     Test Cycle's delivery facts, which carry the extended time the same way.
 *
 * null when nothing says (the screen then says where the timer will be).
 */
export function startScreenTime({ session = null, delivery = null, courseTest = false, now = Date.now() } = {}) {
  const status = String(session?.status || '');
  if (status && status !== SESSION_STATUS.NOT_STARTED && !TERMINAL.has(status)) {
    const allowance = timeAllowance(session);
    const deadline = Number(session?.expiresAt);
    const minutesLeft = allowance.timed && Number.isFinite(deadline) && deadline > 0
      ? Math.max(0, Math.ceil((deadline - Number(now)) / 60000))
      : null;
    return { ...allowance, resuming: true, minutesLeft };
  }
  if (session && Object.prototype.hasOwnProperty.call(session, 'timeLimitSeconds')) {
    return { ...timeAllowance(session), resuming: false, minutesLeft: null };
  }
  if (courseTest && isObject(delivery)) {
    const minutes = Number(delivery.timeLimitMinutes);
    return delivery.timed && Number.isFinite(minutes) && minutes > 0
      ? { timed: true, minutes: Math.round(minutes), extended: Number(delivery.extendedTimeMultiplier) > 1, resuming: false, minutesLeft: null }
      : { timed: false, minutes: null, extended: false, resuming: false, minutesLeft: null };
  }
  return null;
}

export function timeAllowanceText(allowance) {
  if (!allowance?.timed) return 'Untimed';
  return `${plural(allowance.minutes, 'minute')}${allowance.extended ? ' (includes your extended time)' : ''}`;
}

const isPractice = (session) => String(session?.examType || '') !== 'courseTest';
const resultsAreAutomatic = (session) => isPractice(session) && session?.releasePolicy === 'automatic';

/**
 * The status a student reads on their list of tests, in their words — never
 * `locked_integrity`. `tone` picks the colour; it never means right or wrong.
 */
export function studentSessionStatus(session) {
  const status = String(session?.status || '');
  const done = TERMINAL.has(status);
  const released = session?.feedbackReleased === true;
  const make = (label, tone) => ({ status, label, tone, done, released });
  if (done && released) return make('Results ready', 'ready');
  switch (status) {
    case SESSION_STATUS.NOT_STARTED: return make('Not started', 'neutral');
    case SESSION_STATUS.IN_PROGRESS: return make('In progress', 'active');
    case SESSION_STATUS.LOCKED_PROCTOR: return make('Paused by your teacher', 'paused');
    case SESSION_STATUS.LOCKED_INTEGRITY: return make('Paused — ask your teacher', 'paused');
    case SESSION_STATUS.SUBMITTED: return make('Submitted', 'done');
    case SESSION_STATUS.FORCE_SUBMITTED: return make('Submitted by your teacher', 'done');
    case SESSION_STATUS.TIME_EXPIRED: return make('Time ran out', 'done');
    default: return make('Not available yet', 'neutral');
  }
}

/** When this student's results arrive, said once on their list of tests. */
export function resultsTimingText(session) {
  const status = String(session?.status || '');
  const done = TERMINAL.has(status);
  if (done && session?.feedbackReleased === true) return null;
  if (resultsAreAutomatic(session)) return done ? 'Your results are being prepared.' : 'Results are ready right after you submit.';
  return done ? 'Your teacher hasn\'t released results yet.' : null;
}

/** The finished screen: what happened, and whether the results can be opened now. */
export function finishedSummary(session, { courseTest = false } = {}) {
  const status = String(session?.status || '');
  const released = session?.feedbackReleased === true;
  const navigation = readNavigation(session);
  const total = navigation.total || wholeNumber(session?.requiredQuestions) || 0;
  const answered = Math.min(total || Infinity, wholeNumber(session?.answeredQuestions) ?? 0);
  const title = status === SESSION_STATUS.TIME_EXPIRED
    ? 'Time is up'
    : status === SESSION_STATUS.FORCE_SUBMITTED
      ? 'Your teacher turned in your test'
      : courseTest ? 'Test submitted' : 'Practice test submitted';
  const lead = status === SESSION_STATUS.TIME_EXPIRED
    ? 'Your saved answers were turned in when time ran out.'
    : status === SESSION_STATUS.FORCE_SUBMITTED
      ? 'Your saved answers were turned in.'
      : 'Your answers are turned in.';
  const counts = total ? ` You answered ${answered} of ${plural(total, 'question')}.` : '';
  const results = released
    ? ' Your results are ready.'
    : courseTest
      ? ' Your score appears after your teacher releases results.'
      : ' Your teacher will release your results.';
  return { title, message: `${lead}${counts}${results}`, canSeeResults: released };
}

const calculatorRule = (mode) => {
  const value = String(mode || 'questionSpecific');
  if (value === 'none') return 'There is no calculator on this test.';
  if (value === 'questionSpecific') return 'A calculator appears only on questions where your teacher allows one.';
  return `A ${value} calculator is available on this test.`;
};

/** The time line of the start screen: how long, from when — or, coming back, how long is left. */
function timeRule({ allowance, courseTest, questions }) {
  // `allowance` null: the time is not known before the test starts (the
  // screen opened without the session). Say where it will be, not a number.
  if (!allowance) return `${questions}If this test is timed, the timer starts when you press Start and stays on screen.`;
  if (!allowance.timed || !allowance.minutes) {
    return `${questions}${courseTest ? 'This test is not timed. Take the time you need.' : 'This practice test is not timed.'}`;
  }
  if (allowance.resuming) {
    const left = wholeNumber(allowance.minutesLeft);
    if (left === 0) return `${questions}Your time for this test is up. Open the test to turn in your saved answers.`;
    return left === null
      ? `${questions}Your timer started when you first pressed Start and has kept running. It stays on screen.`
      : `${questions}Your timer started when you first pressed Start and has kept running: about ${plural(left, 'minute')} ${left === 1 ? 'is' : 'are'} left.`;
  }
  const extendedNote = allowance.extended ? ' This includes your extended time.' : '';
  return `${questions}You have ${plural(allowance.minutes, 'minute')}, starting when you press Start. The timer stays on screen.${extendedNote}`;
}

/**
 * The rules on the start screen, in the order a student needs them.
 *
 * They describe the test as it now works — move around, skip, mark for review,
 * change any answer until Submit — and say what happens if the student leaves
 * the test window, before it can happen. `allowance` comes from
 * startScreenTime: a student coming back to a test is told the time left on a
 * clock that kept running, not the whole allowance.
 */
export function startScreenRules({
  courseTest = false,
  questionCount = null,
  allowance = { timed: false },
  calculatorMode = null,
  modules = false,
  automaticResults = false,
  lockThreshold = DEFAULT_INTEGRITY_LOCK_THRESHOLD,
} = {}) {
  const count = wholeNumber(questionCount);
  const questions = count ? `${plural(count, 'question')}. ` : '';
  return [
    timeRule({ allowance, courseTest, questions }),
    'Move between questions with Previous and Next, or open the question list. You can skip a question and come back to it.',
    'Mark any question for review. You can change any answer until you submit.',
    modules ? 'This test has 2 modules. At the end of module 1 you review it, then start module 2. After that you can\'t go back to module 1.' : null,
    courseTest
      ? 'Your answers save automatically. If you lose your connection or the page reloads, open the test again and you\'ll pick up where you left off.'
      : 'Your answers save automatically as you work.',
    courseTest || calculatorMode ? calculatorRule(calculatorMode) : null,
    integrityRule(lockThreshold),
    courseTest
      ? 'When you finish, review your answers and press Submit. Questions left blank count as zero.'
      : `When you finish, review your answers and press Submit. Questions left blank count as zero.${automaticResults ? ' Your score and the answers are ready as soon as you submit.' : ''}`,
  ].filter(Boolean);
}
