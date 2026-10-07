'use strict';

/*
 * THE OPEN ITEMS OF A SECURE SESSION, AND GRADING THEM ONCE AT THE END.
 *
 * A student may move freely between the questions of a secure Test, a Retest
 * or a practice test until they submit (secureExamNavigation.js). Every issued
 * item is therefore an editable draft until the session is finalized, and is
 * graded exactly once, on the server, at that moment — the student's submit,
 * the verified timer or a proctor's force-submit all come through
 * `finalizeOpenItems` below.
 *
 * WHERE AN OPEN ITEM LIVES. In `examSessions/{sessionId}/items/{instanceId}`:
 * the issued item (with its private grading and generator parameters, encoded
 * by secureItemStorage) and the student's draft. Admin-SDK only — firestore
 * rules deny every client. The session document keeps only the small
 * navigation entry per item, so its size no longer grows with the items.
 *
 * WHAT FINALIZE RECORDS PER ITEM. The same response record the linear runtime
 * wrote (grading, sanitized snapshot, sanitized work, blueprint provenance),
 * plus `releasedSolution` — the correct answer as display text and the item's
 * worked solution — which `secureExam.publicReview` hands out only after the
 * results are released. An item the student left blank is recorded as
 * `unanswered`, worth zero, so Corrections plans from it like any other miss.
 */

const mathPath = require('./mathPath');
const secureItems = require('./secureItems');
const navigationRules = require('./secureExamNavigation');

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

function itemRef(sessionRef, questionInstanceId) {
  return sessionRef.collection(navigationRules.ITEMS_SUBCOLLECTION).doc(clean(questionInstanceId));
}

/** The navigation entry stored on the session for a freshly issued item. */
function navigationEntryFor(storedItem, position) {
  return {
    position,
    state: navigationRules.ITEM_STATE.OPEN,
    hasWork: false,
    flagged: false,
    slotId: storedItem?.slotId || null,
    assessmentDomainId: storedItem?.assessmentDomainId || null,
    bankQuestionId: storedItem?.bankQuestionId || null,
  };
}

/**
 * A session in the navigation shape, plus the item documents a legacy session
 * needs written to get there. Pure apart from building refs; the caller writes
 * `writes` inside its own transaction (after all of its reads).
 */
async function upgradeSession(sessionRef, session = {}) {
  if (isObject(session.navigation) && Number(session.navigation.version) >= 1) {
    return { session, writes: [] };
  }
  const navigation = navigationRules.navigationOf(session);
  const writes = [];
  const current = isObject(session.currentQuestion) ? session.currentQuestion : null;
  const currentId = clean(current?.questionInstanceId);
  if (currentId && navigation.items[currentId]?.state === navigationRules.ITEM_STATE.OPEN) {
    const { draftResponse = null, ...item } = current;
    writes.push({ ref: itemRef(sessionRef, currentId), data: { item, draftResponse: draftResponse || null, issuedAt: Number(session.updatedAt) || Date.now() } });
    navigation.items[currentId] = {
      ...navigation.items[currentId],
      hasWork: await secureItems.payloadHasWork(recordedPayloadOf(draftResponse)),
    };
  }
  return { session: { ...session, navigation, currentQuestion: null }, writes };
}

/** The released-review snapshot of an issued item: public material only. */
async function reviewSnapshotOf(storedItem, session) {
  const current = secureItems.readStoredItem(storedItem);
  const mode = await secureItems.runtimeModeForSession(session);
  return mathPath.buildSanitizedQuestion(current, {
    questionInstanceId: current.questionInstanceId,
    attemptsAllowed: current.attemptsAllowed,
    attemptsUsed: current.attemptsUsed,
    toolPayload: await secureItems.toolPayloadForMode(current, mode),
  });
}

/*
 * THE CORRECT ANSWER, AS A STUDENT CAN READ IT.
 *
 * A choice field's key is a runtime choice id (`c_…`), which means nothing on
 * a screen and must never be replayable, so it is turned into the choice's
 * own label from the sanitized snapshot. A typed answer is shown as written.
 * A Rich Tool item has no single typed key; its worked solution's answer
 * summary says what the finished construction shows.
 */
function correctAnswerDisplay(item = {}, snapshot = {}) {
  const grading = isObject(item.privateGrading) ? item.privateGrading : null;
  if (!grading || grading.pathToolId) return [];
  const snapshotFields = list(snapshot?.responseFields);
  const fields = list(grading.fields);
  return fields.map((field, index) => {
    const id = clean(field?.id) || `response-${index + 1}`;
    const publicField = snapshotFields.find((entry) => clean(entry?.id) === id) || null;
    const choices = list(publicField?.choices).length
      ? publicField.choices
      : (fields.length === 1 ? list(snapshot?.choices) : []);
    const expected = field?.expected;
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    const display = expectedValues
      .filter((value) => value !== undefined && value !== null && clean(value) !== '')
      .map((value) => {
        const choice = choices.find((entry) => clean(entry?.id) === clean(value));
        return choice ? clean(choice.label) : clean(value);
      })
      .join(', ');
    return {
      fieldId: id,
      label: clean(publicField?.label) || null,
      display: display.slice(0, 400),
    };
  }).filter((entry) => entry.display);
}

async function releasedSolutionFor(item, snapshot) {
  let review = null;
  try {
    review = (await mathPath.buildPrivateSupport(item))?.solutionReview || null;
  } catch (error) {
    console.error('secure_review_solution_unavailable', error?.message || error);
  }
  const answers = correctAnswerDisplay(item, snapshot);
  if (!answers.length && !review) return null;
  return { answers, review };
}

/** The supportUsage fields a secure response may carry. */
function safeSupportUsage(source) {
  if (!isObject(source)) return {};
  return {
    accommodations: Array.isArray(source.accommodations) ? source.accommodations.map(String).slice(0, 20) : [],
    modifications: Array.isArray(source.modifications) ? source.modifications.map(String).slice(0, 20) : [],
    calculatorUsed: Boolean(source.calculatorUsed),
    teacherAssisted: Boolean(source.teacherAssisted),
  };
}

/**
 * One recorded response, graded by the server.
 *
 * `responsePayload` must already be sanitized (and stripped of workspace
 * drafts, which are only ever a way back to the screen). `unanswered` items
 * are not graded: there is nothing to grade, and they are worth zero.
 */
async function buildResponseRecord(storedItem, { session, responsePayload, supportUsage, now, unanswered = false, finalizedFromDraft = false }) {
  const item = secureItems.readStoredItem(storedItem);
  const grading = unanswered
    ? navigationRules.unansweredMarker().grading
    : await secureItems.gradeIssuedItem(storedItem, responsePayload || {});
  const snapshot = await reviewSnapshotOf(storedItem, session);
  return {
    questionInstanceId: item.questionInstanceId,
    bankQuestionId: item.bankQuestionId || null,
    // Which Rich Tool produced the work, so released review can say so.
    pathToolId: item.pathToolId || null,
    alignmentKeys: item.alignmentKeys || [],
    questionType: item.questionType || null,
    familyId: item.familyId || null,
    assessmentDomainId: item.assessmentDomainId || null,
    dok: item.dok ?? null,
    // Blueprint provenance for a course Test. Null on a simulation, which is
    // why the corrections algorithm only ever runs on a Test Cycle session.
    slotId: item.slotId || null,
    targetId: item.targetId || null,
    planWeight: item.planWeight ?? null,
    grading: { score: Number(grading.score) || 0, isCorrect: grading.isCorrect === true },
    supportUsage: safeSupportUsage(supportUsage),
    // Stored server-side while feedback is held. `publicSession` strips the
    // whole responses map; `publicReview` releases the sanitized snapshot and
    // the solution only after the results are released.
    questionSnapshot: secureItems.storableItem(snapshot),
    responsePayload: responsePayload && Object.keys(responsePayload).length ? responsePayload : { responses: {} },
    releasedSolution: await releasedSolutionFor(item, snapshot),
    submittedAt: now,
    ...(unanswered ? { unanswered: true } : {}),
    ...(finalizedFromDraft ? { finalizedFromAutosave: true } : {}),
  };
}

/** The recordable part of a stored draft. */
function recordedPayloadOf(draftResponse) {
  const payload = isObject(draftResponse?.responsePayload) ? draftResponse.responsePayload : {};
  const { workspaceDraftsJson: _workspaceDrafts, ...recorded } = payload;
  return recorded;
}

/**
 * Read every open item of a session. Call inside a transaction BEFORE any
 * write (Firestore requires all transaction reads first).
 */
async function readOpenItems(transaction, sessionRef, session) {
  const navigation = navigationRules.navigationOf(session);
  const ids = navigationRules.openItemIds(navigation);
  if (!ids.length) return new Map();
  const refs = ids.map((id) => itemRef(sessionRef, id));
  const snapshots = transaction ? await transaction.getAll(...refs) : await Promise.all(refs.map((ref) => ref.get()));
  const byId = new Map();
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists) byId.set(ids[index], snapshot.data() || {});
  });
  return byId;
}

/*
 * GRADE EVERY OPEN ITEM, ONCE.
 *
 * Returns the session with a response for every issued item that was still
 * open, and every open navigation entry marked recorded. A draft with work is
 * graded as it stands (an unfinished construction a grader refuses scores 0);
 * an item with no work is recorded as unanswered. Grading never throws
 * (secureItems.gradeItem), so no saved draft can make a session impossible to
 * finish.
 */
async function finalizeOpenItems(session, openItems, now) {
  const navigation = navigationRules.navigationOf(session);
  const responses = { ...(isObject(session.responses) ? session.responses : {}) };
  const items = { ...navigation.items };
  // eslint-disable-next-line no-restricted-syntax
  for (const id of navigationRules.openItemIds(navigation)) {
    const stored = openItems.get(id);
    if (stored?.item && !responses[id]) {
      const payload = recordedPayloadOf(stored.draftResponse);
      // eslint-disable-next-line no-await-in-loop
      const hasWork = await secureItems.payloadHasWork(payload);
      // eslint-disable-next-line no-await-in-loop
      responses[id] = await buildResponseRecord(stored.item, {
        session,
        responsePayload: hasWork ? payload : { responses: {} },
        supportUsage: stored.draftResponse?.supportUsage || {},
        now,
        unanswered: !hasWork,
        finalizedFromDraft: hasWork,
      });
    }
    items[id] = { ...items[id], state: navigationRules.ITEM_STATE.RECORDED };
  }
  const values = Object.values(responses);
  return {
    ...session,
    navigation: { ...navigation, items },
    responses,
    summary: {
      completedQuestions: values.filter((response) => response?.unanswered !== true).length,
      correctQuestions: values.filter((response) => response?.grading?.isCorrect === true).length,
    },
    usedQuestionIds: [...new Set([...list(session.usedQuestionIds), ...values.map((response) => response?.bankQuestionId).filter(Boolean)])],
    currentQuestion: null,
  };
}

module.exports = {
  buildResponseRecord,
  correctAnswerDisplay,
  finalizeOpenItems,
  itemRef,
  navigationEntryFor,
  readOpenItems,
  recordedPayloadOf,
  releasedSolutionFor,
  reviewSnapshotOf,
  safeSupportUsage,
  upgradeSession,
};
