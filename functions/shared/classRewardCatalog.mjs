/*
 * CLASS REWARDS: THE TEACHER'S OWN NON-ACADEMIC REDEEMABLES (pure, shared).
 *
 * The Practice Pass is the one reward with an academic effect, and it has its
 * own rules, effect document and readers (docs/architecture/rewards.md). A
 * class reward is deliberately the opposite: a LABEL and a PRICE a teacher
 * chooses — "Choose your seat for a day", 50 Class Points — that a student
 * spends points on and the teacher then hands out in the room. Nothing in
 * MathMaster reads a class reward to decide a grade, a completion, a deadline
 * or a mastery level, and this module makes sure nothing ever could.
 *
 * THE PROMISE ("none of these change a grade") IS KEPT IN THREE LAYERS, AND
 * ONLY THE LAST ONE IS A WORD LIST (LC04):
 *
 *   1. NOTHING READS A REWARD. No grader, assignment, deadline, attempt or
 *      mastery code imports this module or reads its collections;
 *      tests/platform/classRewardNoAcademicReach.test.mjs lists every file
 *      that knows class rewards exist and fails the day another one does. A
 *      reward cannot change a grade because no code could notice it. This is
 *      the layer that is true however a reward is worded.
 *   2. AN ITEM IS SIX FIELDS AND NO OTHER (CLASS_REWARD_ITEM_FIELDS). The
 *      server rebuilds every item from them, so nothing grade-like is ever
 *      stored, and a payload carrying any other field is refused outright
 *      rather than silently trimmed — the teacher learns why, and a client
 *      that tries to attach an effect is told so. The list of grade-like
 *      names below only chooses the sentence; it protects nothing.
 *   3. FREE TEXT IS SCREENED, AND ONLY EVER SHOWN AS A REWARD. A name or
 *      description that promises an academic effect (homework-free, extra
 *      credit, skip a quiz, a retake…) is refused with a sentence saying so,
 *      and wherever a student reads it, MathMaster's own words sit beside it
 *      ("None of these change a grade", "This does not change any grade or
 *      assignment"). The Practice Pass is the only reward that touches an
 *      assignment.
 *
 * WHAT THE SCREEN CANNOT CATCH. It reads words, not meaning, and it checks
 * only what is typed here:
 *   - a promise made without the words: "A pass on tonight's problem set",
 *     "Take tonight off", "Everyone gets the A";
 *   - a spelling it has no rule for: a typo ("homwork"), letters spaced or
 *     joined apart ("h o m e w o r k", "home_work"), slang, a language other
 *     than English and Spanish, an emoji standing in for a word;
 *   - context: "pass" is a hall pass in one room and a free pass in another;
 *   - the teacher's decline reason, which is free text shown to the student
 *     but is not a reward, and so is not screened;
 *   - anything said, written or promised in the room: MathMaster never sees it.
 * Layers 1 and 2 are why none of that can move a grade; layer 3 only stops
 * MathMaster itself from publishing the promise.
 *
 * Request lifecycle (classRewardRequests/{id}, written only by the server):
 *
 *   pending ──teacher: fulfilled──► fulfilled   (terminal; never refunds)
 *   pending ──teacher: declined───► declined    (terminal; refunds the points
 *                                                once, with a reason the
 *                                                student sees)
 *   pending ──student erased──────► cancelled   (terminal; the teacher acted
 *                                                on a request whose student was
 *                                                permanently deleted: nothing
 *                                                is refunded or fulfilled, so
 *                                                no wallet or ledger row is
 *                                                ever re-created for them)
 *
 * The transactions live in functions/lib/classRewardStore.js; this file holds
 * every rule they apply, so the browser's "can I use this?" and the server's
 * decision come from the same functions.
 */

export const CLASS_REWARD_SCHEMA_VERSION = 1;
export const CLASS_REWARD_CATALOGS_COLLECTION = 'classRewardCatalogs';
export const CLASS_REWARD_REQUESTS_COLLECTION = 'classRewardRequests';

/** The ledger's rewardCode / reasonCode for a class reward spend or refund. */
export const CLASS_REWARD_CODE = 'classReward';

export const MAX_CATALOG_ITEMS = 12;
export const MAX_LABEL_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 160;
export const MIN_ITEM_COST = 10;
export const MAX_ITEM_COST = 500;
export const MAX_WEEKLY_LIMIT = 5;
export const MAX_DECLINE_REASON_LENGTH = 200;

/** Weeks start on Monday on the school's wall clock (sectionDeadline.mjs SCHOOL_TIME_ZONE). */
export const CLASS_REWARD_TIME_ZONE = 'America/Chicago';

export const CLASS_REWARD_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  FULFILLED: 'fulfilled',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
});

export class ClassRewardInputError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ClassRewardInputError';
    this.field = field;
  }
}

const reject = (message, field = null) => { throw new ClassRewardInputError(message, field); };
const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/*
 * The ONLY fields an item has. The server rebuilds an item from these and
 * refuses a payload that names any other (validateCatalogItem), so what a
 * reward can be is fixed here, not by a list of what it may not be.
 */
export const CLASS_REWARD_ITEM_FIELDS = Object.freeze([
  'itemId', 'label', 'description', 'cost', 'active', 'weeklyLimitPerStudent',
]);
const ITEM_FIELD_SET = new Set(CLASS_REWARD_ITEM_FIELDS);

/*
 * Field names that would mean somebody is trying to make a reward change
 * academic records. Not the guard (CLASS_REWARD_ITEM_FIELDS is): a payload
 * naming one gets the academic sentence rather than the general one.
 */
export const ACADEMIC_FIELDS = Object.freeze([
  'grade', 'gradeEffect', 'gradeChange', 'score', 'scoreBonus', 'credit', 'extraCredit',
  'assignmentId', 'assignmentIds', 'sectionId', 'section', 'excuse', 'excused', 'waiver',
  'waive', 'mastery', 'deadline', 'dueAt', 'attempts', 'retake', 'practicePass',
]);
const ACADEMIC_FIELD_SET = new Set(ACADEMIC_FIELDS.map((field) => field.toLowerCase()));

/*
 * Wording that promises an academic effect. Word-boundary matches, so "Taste
 * test" is still refused (it says "test") but "contest" and "latest" are not.
 * Written as plain rules rather than a clever regex so a teacher's refusal
 * message can name what tripped it.
 */
const ACADEMIC_WORDING = Object.freeze([
  { pattern: /\bhome\s*-?\s*work\b/i, words: 'homework' },
  { pattern: /\bextra\s+credit\b/i, words: 'extra credit' },
  { pattern: /\bgrades?\b|\bgrading\b|\bgpa\b/i, words: 'a grade' },
  { pattern: /\b(?:bonus|extra)\s+points?\b/i, words: 'bonus points' },
  { pattern: /\bpoints?\s+(?:on|off|toward|towards|added\s+to)\b/i, words: 'points on work' },
  { pattern: /\bquiz(?:zes)?\b|\btests?\b|\bexams?\b|\bstaar\b|\beoc\b|\bdol\b/i, words: 'a quiz or test' },
  // "Warm-up" alone is allowed on purpose: being the class DJ FOR the warm-up
  // is a classroom privilege, not a change to the Warm-Up grade.
  { pattern: /\bassignments?\b|\bclasswork\b/i, words: 'required work' },
  { pattern: /\bretakes?\b|\bredo\b|\bre-?test\b/i, words: 'a retake' },
  // "Skip the line at the pencil sharpener" is fine; skipping WORK is not.
  { pattern: /\bskip\s+(?:a|an|the|one|my|your|\d+)?\s*(?:questions?|problems?|sections?|practice|work|warm[\s-]?ups?)\b|\bexcuse[ds]?\b|\bexempt(?:ion)?\b|\bwaive[ds]?\b|\bwaiver\b/i, words: 'skipping or excusing work' },
  { pattern: /\blate\s+work\b|\bdeadline\b|\bextensions?\b|\bdue\s+date\b/i, words: 'a deadline' },
  { pattern: /\banswers?\b|\banswer\s+key\b|\bhints?\b/i, words: 'answers or hints' },
  { pattern: /\bpractice\s+pass\b/i, words: 'the Practice Pass' },
  // Shorthand and indirect ways of writing the same effects: "No HW",
  // "Drop your lowest score", "Free 100", "+5 on the next check",
  // "Turn it in late", "Open-note day". Still a word list (see the docs), so
  // these name the effect, not a whole phrase.
  { pattern: /\bhw\b/i, words: 'homework' },
  { pattern: /\bscores?\b|\blowest\b|\bcurve[ds]?\b|\bfree\s+(?:100|\d+\s*%)|(?:^|[\s(])\+\s*\d+/i, words: 'a grade' },
  { pattern: /\b(?:unit|skills?|progress|knowledge|mastery|exit|next)\s+checks?\b/i, words: 'a quiz or test' },
  { pattern: /\bturn(?:ed|ing|s)?\s+(?:(?:it|work|something)\s+)?in\b[^.]*\blate\b|\b(?:a\s+day|days?|hours?)\s+late\b/i, words: 'a deadline' },
  { pattern: /\bopen[\s-]?(?:notes?|book)\b|\buse\s+(?:your\s+|my\s+)?notes\b/i, words: 'answers or hints' },
  // Another go at the work: "One extra attempt on Path", "Second try on any
  // question", "Retry a problem", "Do-over". An attempt is always about
  // work; "try" only counts with a number or "extra/another/second" before it,
  // so "Try the class snack" is still fine.
  { pattern: /\battempts?\b|\bre-?tr(?:y|ies)\b|\bdo[\s-]?overs?\b|\b(?:extra|another|second|2nd|one\s+more|bonus|\d+)\s+(?:more\s+)?tr(?:y|ies)\b/i, words: 'another attempt' },
  // Seeing the work done for you: "Peek at the solution", "Worked example".
  { pattern: /\bsolutions?\b|\bworked\s+examples?\b|\bsolve\s+(?:it|one|a|the)\s+for\b/i, words: 'answers or hints' },
  // A counted or chosen question or problem: "Skip 1 question", "Skip 2
  // problems", "any question", "the next problem". The skip rule above only
  // knew "a/an/the/one" in front of the noun.
  { pattern: /\b(?:\d+|one|two|three|four|five|a|an|any|every|each|next|last|hardest|extra|free|bonus|skip(?:ped|ping|s)?|drop(?:ped|ping|s)?|peek)\s+(?:\w+\s+)?(?:questions?|problems?)\b/i, words: 'skipping or excusing work' },
  // The same effects in Spanish (LC04). MathMaster serves Spanish-speaking
  // families, and a teacher writing in Spanish would otherwise walk past every
  // rule above. These run on text with its accents folded away (below), so
  // "crédito extra" and "credito extra" are one rule. "Nota" and "trabajo" are
  // left out on purpose: a note on the board and teamwork are ordinary.
  { pattern: /\b(?:tareas?|deberes)\b/, words: 'homework' },
  { pattern: /\bcredito\s+extra\b|\bpuntos?\s+(?:extra|adicionales)\b/, words: 'extra credit' },
  { pattern: /\bcalificacion(?:es)?\b|\bcalificar\b/, words: 'a grade' },
  { pattern: /\bexamen(?:es)?\b|\bcuestionarios?\b|\bpruebas?\b/, words: 'a quiz or test' },
  { pattern: /\bfecha\s+(?:limite|de\s+entrega)\b|\bentrega\s+tardia\b|\bentregar\s+tarde\b/, words: 'a deadline' },
  { pattern: /\brespuestas?\b|\bpistas?\b/, words: 'answers or hints' },
  { pattern: /\b(?:otro|segundo)\s+intento\b|\breintentos?\b/, words: 'another attempt' },
]);

/*
 * THE SAME WORDS, WRITTEN DIFFERENTLY (LC04). The rules above read text as a
 * person reads it, so the text is first put in the form a person reads it in:
 * full-width and styled letters become plain ones, invisible characters (a
 * zero-width space inside "home\u200bwork") are dropped, accents are folded
 * ("crédito" -> "credito") and case is ignored. A second reading swaps the
 * look-alike digits and symbols teachers and students type for letters
 * ("h0mework", "qu1z", "gr@de"). A hit in either reading is a hit.
 *
 * This is all it does. A spelling it has no rule for is not caught — see
 * "WHAT THE SCREEN CANNOT CATCH" at the top of this file.
 */
const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
const LOOKALIKE = Object.freeze({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' });
const foldWording = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(INVISIBLE, '')
  .normalize('NFD')
  .replace(/\p{M}+/gu, '')
  .toLowerCase();
const readingsOf = (text) => {
  const plain = foldWording(text);
  return [plain, plain.replace(/[013457@$]/g, (character) => LOOKALIKE[character])];
};

/** The academic effect a piece of text promises, in a few words, or null. */
export const academicWordingIn = (text) => {
  for (const reading of readingsOf(text)) {
    const hit = ACADEMIC_WORDING.find((rule) => rule.pattern.test(reading));
    if (hit) return hit.words;
  }
  return null;
};

export const ACADEMIC_REFUSAL = 'Class rewards can\'t change grades or required work. The Practice Pass is the only reward that touches an assignment.';

/*
 * One click to add. Every one is something a teacher hands out in the room;
 * none touches a grade, an assignment or a deadline. Ids are fixed so adding
 * the same suggestion twice is visibly a duplicate rather than a second item.
 */
export const STARTER_CLASS_REWARDS = Object.freeze([
  Object.freeze({ itemId: 'starter-seat', label: 'Choose your seat for a day', description: 'Sit anywhere in the room for one class period.', cost: 50, weeklyLimitPerStudent: 1 }),
  Object.freeze({ itemId: 'starter-music', label: 'Music with headphones during independent work', description: 'Listen to your own music with headphones while you work on your own.', cost: 40, weeklyLimitPerStudent: 2 }),
  Object.freeze({ itemId: 'starter-dj', label: 'Be the class DJ for the warm-up', description: 'Pick the (school-appropriate) playlist while the class does the warm-up.', cost: 60, weeklyLimitPerStudent: 1 }),
  Object.freeze({ itemId: 'starter-pen', label: 'Use the teacher\'s fancy pens for a day', description: 'Borrow the good markers and pens for one class period.', cost: 20, weeklyLimitPerStudent: 0 }),
  Object.freeze({ itemId: 'starter-shoutout', label: 'Shout-out on the class board', description: 'Your first name goes on the class board for the week.', cost: 30, weeklyLimitPerStudent: 1 }),
  Object.freeze({ itemId: 'starter-helper', label: 'Teacher\'s helper for a day', description: 'Hand out materials and help run class for one period.', cost: 40, weeklyLimitPerStudent: 1 }),
]);

const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

/**
 * Validate and normalize ONE catalog item. Throws ClassRewardInputError with a
 * sentence a teacher can act on. Only the allow-listed fields survive.
 */
export const validateCatalogItem = (raw = {}) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) reject('Each reward needs a name and a price.');
  const keys = Object.keys(raw);
  const academicKey = keys.find((key) => ACADEMIC_FIELD_SET.has(String(key).toLowerCase()));
  if (academicKey) reject(ACADEMIC_REFUSAL, academicKey);
  // A reward is exactly CLASS_REWARD_ITEM_FIELDS. Any other field is refused,
  // not dropped: nothing outside the list is ever stored, and a request that
  // tries to attach one hears about it (LC04).
  const strayKey = keys.find((key) => !ITEM_FIELD_SET.has(key));
  if (strayKey !== undefined) {
    reject(`A reward is a name, a description, a price and a weekly limit. "${String(strayKey).slice(0, 40)}" is not part of it.`, strayKey);
  }

  const itemId = String(raw.itemId ?? '').trim();
  if (!ITEM_ID_PATTERN.test(itemId)) reject('Each reward needs an id of 3–40 letters, numbers, - or _.', 'itemId');

  const label = cleanText(raw.label, MAX_LABEL_LENGTH + 1);
  if (!label) reject('Give the reward a name.', 'label');
  if (label.length > MAX_LABEL_LENGTH) reject(`Keep the name to ${MAX_LABEL_LENGTH} characters.`, 'label');

  const description = cleanText(raw.description, MAX_DESCRIPTION_LENGTH + 1);
  if (description.length > MAX_DESCRIPTION_LENGTH) reject(`Keep the description to ${MAX_DESCRIPTION_LENGTH} characters.`, 'description');

  const wording = academicWordingIn(label) || academicWordingIn(description);
  if (wording) reject(`"${label}" mentions ${wording}. ${ACADEMIC_REFUSAL}`, academicWordingIn(label) ? 'label' : 'description');

  const cost = Number(raw.cost);
  if (!Number.isInteger(cost) || cost < MIN_ITEM_COST || cost > MAX_ITEM_COST) {
    reject(`The price must be a whole number from ${MIN_ITEM_COST} to ${MAX_ITEM_COST} Class Points.`, 'cost');
  }

  const limit = raw.weeklyLimitPerStudent === undefined || raw.weeklyLimitPerStudent === null || raw.weeklyLimitPerStudent === ''
    ? 0
    : Number(raw.weeklyLimitPerStudent);
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_WEEKLY_LIMIT) {
    reject(`The weekly limit must be 0 (no limit) or 1 to ${MAX_WEEKLY_LIMIT}.`, 'weeklyLimitPerStudent');
  }

  return {
    itemId,
    label,
    description,
    cost,
    active: raw.active !== false,
    weeklyLimitPerStudent: limit,
  };
};

/**
 * Validate a whole catalog save. Ids must be unique; labels must be unique
 * among ACTIVE items so a student never sees two identical choices.
 */
export const validateCatalogInput = (input = {}) => {
  const classId = cleanText(input?.classId, 120);
  if (!classId) reject('Choose a class.');
  const rawItems = input?.items;
  if (!Array.isArray(rawItems)) reject('The reward list is missing.');
  if (rawItems.length > MAX_CATALOG_ITEMS) reject(`A class can have up to ${MAX_CATALOG_ITEMS} rewards. Remove one first.`);
  const items = rawItems.map((item) => validateCatalogItem(item));
  const ids = new Set();
  const activeLabels = new Set();
  items.forEach((item) => {
    if (ids.has(item.itemId)) reject('Two rewards have the same id. Reload and try again.', 'itemId');
    ids.add(item.itemId);
    if (!item.active) return;
    const key = item.label.toLowerCase();
    if (activeLabels.has(key)) reject(`There are two rewards called "${item.label}".`, 'label');
    activeLabels.add(key);
  });
  const baseRevision = input?.baseRevision === undefined || input?.baseRevision === null
    ? null
    : Number(input.baseRevision);
  if (baseRevision !== null && (!Number.isInteger(baseRevision) || baseRevision < 0)) reject('Reload the reward list and try again.');
  return { classId, items, baseRevision };
};

/** The stored catalog document. No field on it, or on an item, is academic. */
export const buildCatalogDocument = ({
  classId, items, previous = null, teacherEmail = null, at,
}) => ({
  schemaVersion: CLASS_REWARD_SCHEMA_VERSION,
  classId,
  items: items.map((item) => ({ ...item })),
  revision: (Number(previous?.revision) || 0) + 1,
  updatedAt: at,
  updatedByEmail: teacherEmail || null,
});

export const findCatalogItem = (catalog, itemId) => (Array.isArray(catalog?.items) ? catalog.items : [])
  .find((item) => item?.itemId === String(itemId ?? '')) || null;

/** Items a student is offered, cheapest first; inactive items are hidden. */
export const activeCatalogItems = (catalog) => (Array.isArray(catalog?.items) ? catalog.items : [])
  .filter((item) => item && item.active !== false)
  .sort((a, b) => (Number(a.cost) - Number(b.cost)) || String(a.label).localeCompare(String(b.label)));

/*
 * THE SCHOOL WEEK.
 *
 * A weekly limit resets on Monday morning in the school's time zone, not at
 * midnight UTC (Sunday evening in Texas). The key is the Monday's date.
 */
const WEEKDAY_INDEX = Object.freeze({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 });
export const schoolWeekKey = (nowMs = Date.now(), timeZone = CLASS_REWARD_TIME_ZONE) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date(nowMs)).map((part) => [part.type, part.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const monday = new Date(local - (WEEKDAY_INDEX[parts.weekday] ?? 0) * 86_400_000);
  return monday.toISOString().slice(0, 10);
};

/** A request counts toward the weekly limit unless it was declined (and refunded). */
export const countsTowardWeeklyLimit = (request) => Boolean(request)
  && request.status !== CLASS_REWARD_REQUEST_STATUS.DECLINED;

export const weeklyUseCount = (requests, { itemId, weekKey }) => (Array.isArray(requests) ? requests : [])
  .filter((request) => request?.itemId === itemId && request?.weekKey === weekKey && countsTowardWeeklyLimit(request))
  .length;

/**
 * Can this student spend on this item right now? The ONE rule: the server
 * applies it inside the transaction, and the browser uses it only to decide
 * whether to offer the button (and to say why not).
 */
export const evaluateClassRewardRedemption = ({
  item = null, balance = 0, requestsThisWeek = [], weekKey, expectedCost = null,
} = {}) => {
  if (!item) return { eligible: false, code: 'not-in-catalog', message: 'That reward isn\'t on your class\'s list.' };
  if (item.active === false) return { eligible: false, code: 'inactive', message: 'Your teacher turned that reward off for now.' };
  const cost = Number(item.cost);
  if (expectedCost !== null && expectedCost !== undefined && Number(expectedCost) !== cost) {
    return { eligible: false, code: 'price-changed', message: `The price changed to ${cost} Class Points.` };
  }
  const limit = Number(item.weeklyLimitPerStudent) || 0;
  if (limit > 0 && weeklyUseCount(requestsThisWeek, { itemId: item.itemId, weekKey }) >= limit) {
    return {
      eligible: false,
      code: 'weekly-limit',
      message: limit === 1 ? 'You already used this one this week. It resets on Monday.' : `You already used this ${limit} times this week. It resets on Monday.`,
    };
  }
  const have = Number(balance) || 0;
  if (have < cost) {
    return { eligible: false, code: 'insufficient-balance', message: `You need ${cost - have} more Class Points.` };
  }
  return { eligible: true, code: null, message: null };
};

export const validateRedeemInput = (input = {}) => {
  const itemId = String(input?.itemId ?? '').trim();
  if (!ITEM_ID_PATTERN.test(itemId)) reject('Choose a reward.');
  const requestId = cleanText(input?.requestId, 200);
  if (!requestId) reject('A request id is required so a retry never spends twice.');
  const expectedCost = input?.expectedCost === undefined || input?.expectedCost === null ? null : Number(input.expectedCost);
  if (expectedCost !== null && !Number.isInteger(expectedCost)) reject('Reload your rewards and try again.');
  return { itemId, requestId, expectedCost };
};

export const RESOLUTION = Object.freeze({ FULFILLED: 'fulfilled', DECLINED: 'declined' });

export const validateResolveInput = (input = {}) => {
  const requestDocId = cleanText(input?.requestDocId ?? input?.id, 200);
  if (!requestDocId) reject('Choose the request.');
  const resolution = String(input?.resolution ?? '');
  if (![RESOLUTION.FULFILLED, RESOLUTION.DECLINED].includes(resolution)) reject('Mark the request fulfilled or declined.');
  const reason = cleanText(input?.reason, MAX_DECLINE_REASON_LENGTH);
  if (resolution === RESOLUTION.DECLINED && !reason) reject('Add a short reason. The student will see it.');
  return { requestDocId, resolution, reason: reason || null };
};

/**
 * What a retry with the same requestId must agree with. A requestId reused
 * for a different item is not a retry — it is refused, never answered with
 * the first request.
 */
export const redeemFingerprint = ({ studentId, classId, itemId }) => JSON.stringify({
  studentId: String(studentId ?? ''), classId: String(classId ?? ''), itemId: String(itemId ?? ''),
});

/** The pending request a redemption creates. A snapshot of the item as bought. */
export const buildClassRewardRequest = ({
  requestDocId, requestId, studentId, classId, item, weekKey, studentLabel = null,
  debitTransactionId, originTeacherEmail, authorizedTeacherEmails, at,
}) => ({
  schemaVersion: CLASS_REWARD_SCHEMA_VERSION,
  requestDocId,
  requestId,
  studentId,
  classId,
  studentLabel: studentLabel || null,
  itemId: item.itemId,
  itemLabel: item.label,
  itemDescription: item.description || '',
  cost: Number(item.cost),
  weekKey,
  status: CLASS_REWARD_REQUEST_STATUS.PENDING,
  requestedAt: at,
  debitTransactionId,
  refundTransactionId: null,
  resolvedAt: null,
  resolvedByEmail: null,
  declineReason: null,
  fingerprint: redeemFingerprint({ studentId, classId, itemId: item.itemId }),
  originTeacherEmail: originTeacherEmail || null,
  authorizedTeacherEmails: Array.isArray(authorizedTeacherEmails) ? authorizedTeacherEmails : [],
  history: [{ status: CLASS_REWARD_REQUEST_STATUS.PENDING, at, actor: 'student' }],
});

/**
 * The ledger entries. Shaped exactly like the Practice Pass purchase and its
 * refund (classPointRewards.mjs) so every existing ledger reader — the
 * student's Recent points, the teacher's history — already understands them.
 * `sourceType` strings are classPoints.mjs SOURCE_TYPES, passed in so this
 * file stays free of a second copy.
 */
export const buildClassRewardDebit = ({ request, sourceType, issuedByUid = null, at }) => ({
  schemaVersion: CLASS_REWARD_SCHEMA_VERSION,
  studentId: request.studentId,
  classId: request.classId,
  amount: -Math.abs(Number(request.cost)),
  reasonCode: CLASS_REWARD_CODE,
  reasonLabel: `Class reward — ${request.itemLabel}`,
  sourceType,
  isReversal: false,
  reversalOf: null,
  issuedByUid,
  issuedByEmail: null,
  requestId: request.requestId,
  originTeacherEmail: request.originTeacherEmail,
  authorizedTeacherEmails: request.authorizedTeacherEmails,
  rewardCode: CLASS_REWARD_CODE,
  classRewardItemId: request.itemId,
  classRewardRequestId: request.requestDocId,
  createdAt: at,
});

export const buildClassRewardRefund = ({
  request, sourceType, reason, teacherEmail, issuedByUid = null, originTeacherEmail, authorizedTeacherEmails, at,
}) => ({
  schemaVersion: CLASS_REWARD_SCHEMA_VERSION,
  studentId: request.studentId,
  classId: request.classId,
  amount: Math.abs(Number(request.cost)),
  reasonCode: CLASS_REWARD_CODE,
  reasonLabel: `Class reward returned — ${request.itemLabel}`,
  sourceType,
  isReversal: false,
  reversalOf: request.debitTransactionId || null,
  issuedByUid,
  issuedByEmail: teacherEmail || null,
  requestId: null,
  note: cleanText(reason, MAX_DECLINE_REASON_LENGTH) || null,
  originTeacherEmail,
  authorizedTeacherEmails,
  rewardCode: CLASS_REWARD_CODE,
  classRewardItemId: request.itemId,
  classRewardRequestId: request.requestDocId,
  createdAt: at,
});

/** Where a request goes when a teacher resolves it, or why it cannot. */
export const planRequestResolution = (request, { resolution, reason = null, teacherEmail = null, at }) => {
  if (!request) return { outcome: 'refused', code: 'not-found', message: 'That request was not found.' };
  if (request.status === resolution) return { outcome: 'replay' };
  if (request.status === CLASS_REWARD_REQUEST_STATUS.CANCELLED) {
    return { outcome: 'refused', code: 'failed-precondition', message: 'That student\'s account was deleted, so the request was cancelled. Nothing was refunded.' };
  }
  if (request.status !== CLASS_REWARD_REQUEST_STATUS.PENDING) {
    return {
      outcome: 'refused',
      code: 'failed-precondition',
      message: request.status === CLASS_REWARD_REQUEST_STATUS.FULFILLED
        ? 'That request was already marked fulfilled.'
        : 'That request was already declined and refunded.',
    };
  }
  const declined = resolution === CLASS_REWARD_REQUEST_STATUS.DECLINED;
  return {
    outcome: 'apply',
    refund: declined,
    next: {
      ...request,
      status: resolution,
      resolvedAt: at,
      resolvedByEmail: teacherEmail || null,
      declineReason: declined ? cleanText(reason, MAX_DECLINE_REASON_LENGTH) : null,
      history: [
        ...(Array.isArray(request.history) ? request.history : []),
        { status: resolution, at, actor: 'teacher', ...(declined ? { reason: cleanText(reason, MAX_DECLINE_REASON_LENGTH) } : {}) },
      ],
    },
  };
};

/**
 * A pending request whose student no longer exists (permanently deleted).
 * Closed without a refund or a fulfilment, so nothing re-creates the erased
 * student's wallet or ledger, and with the student's display label removed.
 */
export const buildCancelledRequest = (request, { teacherEmail = null, at }) => ({
  ...request,
  status: CLASS_REWARD_REQUEST_STATUS.CANCELLED,
  studentLabel: null,
  resolvedAt: at,
  resolvedByEmail: teacherEmail || null,
  declineReason: null,
  cancelledReason: 'student-deleted',
  history: [
    ...(Array.isArray(request?.history) ? request.history : []),
    { status: CLASS_REWARD_REQUEST_STATUS.CANCELLED, at, actor: 'system', reason: 'student-deleted' },
  ],
});
