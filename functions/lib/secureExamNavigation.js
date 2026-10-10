'use strict';

const crypto = require('crypto');

/*
 * MOVING AROUND A SECURE TEST LIKE A REAL TEST.
 *
 * A secure session used to be strictly linear: the server held ONE open
 * question (`currentQuestion`), the student had to record an answer to reach
 * the next, and a recorded answer was graded and could never be revisited. A
 * real test is not taken that way. A student skips the question they are
 * stuck on, flags one to come back to, and changes an answer before handing
 * the paper in.
 *
 * WHAT THIS MODULE HOLDS. The pure rules of that navigation, kept apart from
 * Firestore so they can be tested directly:
 *
 *   itemOrder   the instance ids in the order they were issued, which is the
 *               question number the student sees. An item is issued only when
 *               the student first reaches it, exactly as before — the plan is
 *               still not handed to the browser.
 *   items       one small entry per issued item: open (an editable draft),
 *               recorded (an answer locked by the older "record & continue"
 *               call), whether the draft holds work, and the student's flag.
 *               The item itself, with its private grading and the student's
 *               draft, lives in the server-only `examSessions/{id}/items`
 *               subcollection so forty-four open Rich Tool items cannot push
 *               the session document past Firestore's 1 MiB limit.
 *   modules     a Digital SAT practice test moves within a module; once the
 *               student moves on, the earlier module is closed.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. Grade. An open draft is not graded until
 * the session is finalized — by the student's submit, by the verified timer
 * or by a proctor's force-submit — and nothing a navigation call returns says
 * anything about correctness.
 */

const NAVIGATION_VERSION = 1;
const ITEM_STATE = Object.freeze({ OPEN: 'open', RECORDED: 'recorded' });
const ITEMS_SUBCOLLECTION = 'items';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

/** Digital SAT practice tests are split into two modules, like the real test. */
function moduleLayoutFor(examType, requiredQuestions) {
  const total = Math.max(0, Math.floor(Number(requiredQuestions) || 0));
  if (String(examType || '') !== 'digitalSAT' || total < 2) return null;
  const firstEnd = Math.ceil(total / 2);
  return [{ number: 1, start: 0, end: firstEnd }, { number: 2, start: firstEnd, end: total }];
}

function moduleIndexOf(navigation, position) {
  const modules = list(navigation?.modules);
  const index = modules.findIndex((entry) => position >= Number(entry.start) && position < Number(entry.end));
  return index;
}

/**
 * The navigation block of a session, upgrading a session written before
 * navigation existed. Pure: returns what the session SHOULD hold; the caller
 * writes it (and moves a legacy `currentQuestion` into the items subcollection).
 *
 * A legacy session's recorded responses become locked positions in the order
 * they were recorded, and its open `currentQuestion` becomes the next, open,
 * position. Nothing already recorded is reopened: it was graded under the old
 * rules and the student was told it was final.
 */
function navigationOf(session = {}) {
  if (isObject(session.navigation) && Number(session.navigation.version) >= 1) {
    const navigation = session.navigation;
    return {
      ...navigation,
      itemOrder: list(navigation.itemOrder).map(clean).filter(Boolean),
      items: isObject(navigation.items) ? navigation.items : {},
      cursor: Math.max(0, Math.floor(Number(navigation.cursor) || 0)),
      closedThrough: Math.max(0, Math.floor(Number(navigation.closedThrough) || 0)),
      modules: Array.isArray(navigation.modules) ? navigation.modules : null,
      upgradedFromLinear: navigation.upgradedFromLinear === true,
    };
  }
  // The responses map is keyed by instance id; the key is the fallback when a
  // record does not repeat it.
  const recorded = Object.entries(isObject(session.responses) ? session.responses : {})
    .map(([key, response]) => ({ id: clean(response?.questionInstanceId) || clean(key), response: isObject(response) ? response : {} }))
    .filter((entry) => entry.id)
    .sort((left, right) => Number(left.response.submittedAt || 0) - Number(right.response.submittedAt || 0));
  const itemOrder = recorded.map((entry) => entry.id);
  const items = {};
  recorded.forEach(({ id, response }, index) => {
    items[id] = {
      position: index,
      state: ITEM_STATE.RECORDED,
      hasWork: response.unanswered !== true,
      flagged: false,
      slotId: response.slotId || null,
      assessmentDomainId: response.assessmentDomainId || null,
      bankQuestionId: response.bankQuestionId || null,
    };
  });
  const current = isObject(session.currentQuestion) ? session.currentQuestion : null;
  const currentId = clean(current?.questionInstanceId);
  if (currentId && !items[currentId]) {
    items[currentId] = {
      position: itemOrder.length,
      state: ITEM_STATE.OPEN,
      hasWork: false,
      flagged: false,
      slotId: current.slotId || null,
      assessmentDomainId: current.assessmentDomainId || null,
      bankQuestionId: current.bankQuestionId || null,
    };
    itemOrder.push(currentId);
  }
  const hadAnything = itemOrder.length > 0;
  return {
    version: NAVIGATION_VERSION,
    mode: 'free',
    itemOrder,
    items,
    cursor: Math.max(0, itemOrder.length - 1),
    closedThrough: 0,
    // A session already under way keeps one timer and one stretch of
    // questions; module boundaries are only drawn for sessions created with
    // them, so nothing a student already answered is suddenly behind a wall.
    modules: hadAnything ? null : moduleLayoutFor(session.examType, session.requiredQuestions),
    upgradedFromLinear: hadAnything,
  };
}

/** A fresh navigation block, written when a session is created. */
function initialNavigation({ examType, requiredQuestions }) {
  return {
    version: NAVIGATION_VERSION,
    mode: 'free',
    itemOrder: [],
    items: {},
    cursor: 0,
    closedThrough: 0,
    modules: moduleLayoutFor(examType, requiredQuestions),
    upgradedFromLinear: false,
  };
}

function itemEntry(navigation, questionInstanceId) {
  const id = clean(questionInstanceId);
  return id && isObject(navigation?.items?.[id]) ? navigation.items[id] : null;
}

function openItemIds(navigation) {
  return list(navigation?.itemOrder).filter((id) => itemEntry(navigation, id)?.state === ITEM_STATE.OPEN);
}

/** Is this position closed behind a module the student has already left? */
function positionClosed(navigation, position) {
  return Number(position) < Number(navigation?.closedThrough || 0);
}

/**
 * Questions the student has an answer for: recorded answers that were not
 * blank, plus open drafts that hold work. What every "answered" count reads,
 * on the student's screen and the teacher's table alike.
 */
function answeredCount(session = {}) {
  const navigation = navigationOf(session);
  const responses = isObject(session.responses) ? session.responses : {};
  const ids = new Set([...navigation.itemOrder, ...Object.keys(responses)]);
  let count = 0;
  ids.forEach((id) => {
    // A recorded response is authoritative once it exists.
    if (isObject(responses[id])) { if (responses[id].unanswered !== true) count += 1; return; }
    const entry = itemEntry(navigation, id);
    if (entry?.state === ITEM_STATE.OPEN && entry.hasWork === true) count += 1;
  });
  return count;
}

/** Slot ids already issued on this session (open or recorded), for the plan. */
function issuedSlotIds(session = {}) {
  const navigation = navigationOf(session);
  const fromNavigation = navigation.itemOrder.map((id) => clean(itemEntry(navigation, id)?.slotId)).filter(Boolean);
  const fromResponses = Object.values(isObject(session.responses) ? session.responses : {}).map((response) => clean(response?.slotId)).filter(Boolean);
  return [...new Set([...fromNavigation, ...fromResponses])];
}

/** Domain ids of every issued item, so a simulation keeps its domain balance. */
function issuedDomainIds(session = {}) {
  const navigation = navigationOf(session);
  return navigation.itemOrder.map((id) => clean(itemEntry(navigation, id)?.assessmentDomainId)).filter(Boolean);
}

/**
 * Where a navigation request may go.
 *
 *   { position }                  an issued item, or the next one to issue
 *   { error, reason }             refused — with the student-facing message
 *
 * Positions are zero-based. A student reaches any question already opened,
 * and the next unopened one ("skip" is simply moving on). Jumping further
 * ahead would issue questions the student has not reached, so it is refused.
 */
function resolveTarget(session = {}, { position = undefined, closeModule = false } = {}) {
  const navigation = navigationOf(session);
  const required = Math.max(1, Math.floor(Number(session.requiredQuestions) || 1));
  let target = position;
  if (target === undefined || target === null || target === '') {
    // The older linear client: the first open item, else the next new one.
    const firstOpen = navigation.itemOrder.findIndex((id, index) => itemEntry(navigation, id)?.state === ITEM_STATE.OPEN && !positionClosed(navigation, index));
    target = firstOpen >= 0 ? firstOpen : navigation.itemOrder.length;
    if (target >= required) return { error: 'complete', reason: 'All required exam questions have been completed.' };
  }
  target = Number(target);
  if (!Number.isInteger(target) || target < 0 || target >= required) {
    return { error: 'invalid', reason: 'That question number is not on this test.' };
  }
  if (positionClosed(navigation, target)) {
    return { error: 'module_closed', reason: 'That module is finished. You can only move between questions in the current module.' };
  }
  if (target > navigation.itemOrder.length) {
    return { error: 'not_reached', reason: 'Open the questions in order the first time; you can skip any question with Next.' };
  }
  const issuing = target === navigation.itemOrder.length;
  let closesThrough = null;
  if (issuing && Array.isArray(navigation.modules)) {
    const moduleIndex = moduleIndexOf(navigation, target);
    const module = navigation.modules[moduleIndex];
    if (moduleIndex > 0 && Number(module.start) === target && navigation.closedThrough < target) {
      if (!closeModule) {
        return { error: 'module_end', reason: `This is the end of module ${moduleIndex}. Review your answers, then start module ${moduleIndex + 1}. You will not be able to return to module ${moduleIndex}.` };
      }
      closesThrough = target;
    }
  }
  return { position: target, issuing, closesThrough };
}

/**
 * The navigator a student's browser receives. States only — never a verdict,
 * never anything about the item's content.
 */
function publicNavigation(session = {}) {
  const navigation = navigationOf(session);
  const required = Math.max(0, Math.floor(Number(session.requiredQuestions) || 0));
  const items = navigation.itemOrder.map((id, position) => {
    const entry = itemEntry(navigation, id) || {};
    const recorded = entry.state === ITEM_STATE.RECORDED;
    return {
      position,
      questionInstanceId: id,
      status: recorded ? 'recorded' : entry.hasWork ? 'answered' : 'unanswered',
      flagged: entry.flagged === true,
      closed: positionClosed(navigation, position),
    };
  });
  const modules = Array.isArray(navigation.modules)
    ? navigation.modules.map((entry) => ({ number: Number(entry.number), start: Number(entry.start), end: Number(entry.end), closed: Number(entry.end) <= navigation.closedThrough }))
    : null;
  return {
    version: NAVIGATION_VERSION,
    total: required,
    issued: items.length,
    cursor: Math.min(navigation.cursor, Math.max(0, required - 1)),
    items,
    modules,
    upgradedFromLinear: navigation.upgradedFromLinear === true,
  };
}

/*
 * A RANDOM BUT REPRODUCIBLE DRAW.
 *
 * Simulation items used to be taken from the bank in id order, so every
 * student met the same questions in the same order. The order is now a hash
 * of the session id and the bank id: different for every session, the same on
 * every retry of the same issue (so a transaction retry cannot draw twice),
 * and never derived from anything a browser sends.
 */
function seededRank(seed, id) {
  return crypto.createHash('sha256').update(`${clean(seed)}|${clean(id)}`).digest('hex');
}

function seededOrder(seed, values, idOf = (value) => value?.id) {
  return list(values).slice().sort((left, right) => {
    const a = seededRank(seed, idOf(left));
    const b = seededRank(seed, idOf(right));
    return a < b ? -1 : a > b ? 1 : clean(idOf(left)).localeCompare(clean(idOf(right)));
  });
}

/*
 * TIME THAT MATCHES THE TEST.
 *
 * A shortened practice test keeps the full test's PACE, not its clock: ten
 * questions of a 44-question, 70-minute SAT get 16 minutes, not 70. An
 * untimed test stays untimed. The student's documented extended-time
 * accommodation multiplies whatever the test allows, and is recorded on the
 * session so a teacher can see why one student's clock is longer.
 */
function proportionalTimeLimitSeconds(policy, requiredQuestions) {
  const full = Number(policy?.timeLimitSeconds);
  const total = Number(policy?.totalQuestions);
  if (!Number.isFinite(full) || full <= 0) return null;
  const required = Math.floor(Number(requiredQuestions) || 0);
  if (!Number.isFinite(total) || total <= 0 || required <= 0 || required >= total) return full;
  // Rounded UP to a whole minute so a short test never gets a fraction of one.
  return Math.max(60, Math.ceil((full * required) / total / 60) * 60);
}

function accommodatedTimeLimitSeconds(seconds, multiplier) {
  if (seconds === null || seconds === undefined) return null;
  const base = Number(seconds);
  if (!Number.isFinite(base) || base <= 0) return null;
  const factor = Number(multiplier);
  const safe = Number.isFinite(factor) ? Math.max(1, Math.min(4, factor)) : 1;
  return Math.ceil((base * safe) / 60) * 60;
}

/** The record finalize writes for an issued item the student left blank. */
function unansweredMarker() {
  return { unanswered: true, grading: { score: 0, isCorrect: false } };
}

module.exports = {
  ITEMS_SUBCOLLECTION,
  ITEM_STATE,
  NAVIGATION_VERSION,
  accommodatedTimeLimitSeconds,
  answeredCount,
  initialNavigation,
  issuedDomainIds,
  issuedSlotIds,
  itemEntry,
  moduleLayoutFor,
  navigationOf,
  openItemIds,
  positionClosed,
  proportionalTimeLimitSeconds,
  publicNavigation,
  resolveTarget,
  seededOrder,
  unansweredMarker,
};
