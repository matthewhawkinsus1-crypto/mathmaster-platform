import {
  ClassRewardInputError,
  CLASS_REWARD_REQUEST_STATUS,
  MAX_CATALOG_ITEMS,
  STARTER_CLASS_REWARDS,
  activeCatalogItems,
  evaluateClassRewardRedemption,
  schoolWeekKey,
  validateCatalogInput,
  validateCatalogItem,
  weeklyUseCount,
} from '../../../functions/shared/classRewardCatalog.mjs';
import { toMillis } from './rewardWallet.js';

/*
 * CLASS REWARDS, AS DATA FOR THE SCREENS.
 *
 * The student's shelf ("Choose your seat for a day — Use 50 points"), the
 * words for each of their requests, and the teacher's catalog draft are all
 * decided here, from the same rules the server applies
 * (functions/shared/classRewardCatalog.mjs). Nothing here decides what a
 * student MAY spend: redeemClassReward re-checks everything in one
 * transaction. This only decides what to offer, and says why not.
 *
 * Student words only: no ids, no "ledger", no "request document".
 */

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export const limitLabel = (item) => {
  const limit = Number(item?.weeklyLimitPerStudent) || 0;
  if (!limit) return null;
  return limit === 1 ? 'Once a week' : `Up to ${limit} times a week`;
};

/**
 * What the student sees: every active item with whether they can use it now
 * and, if not, the reason in one sentence; and their requests split into
 * waiting and finished.
 */
export const buildClassRewardShelf = ({
  catalog = null,
  requests = [],
  balance = 0,
  balanceKnown = true,
  nowMs = Date.now(),
} = {}) => {
  const weekKey = schoolWeekKey(nowMs);
  const list = Array.isArray(requests) ? requests.filter(Boolean) : [];
  const items = activeCatalogItems(catalog).map((item) => {
    const decision = balanceKnown
      ? evaluateClassRewardRedemption({ item, balance, requestsThisWeek: list, weekKey })
      : { eligible: false, code: 'balance-unknown', message: 'Your Class Points could not load. Try again in a minute.' };
    const limit = Number(item.weeklyLimitPerStudent) || 0;
    return {
      item,
      canUse: decision.eligible,
      reasonCode: decision.code,
      reason: decision.message,
      usedThisWeek: weeklyUseCount(list, { itemId: item.itemId, weekKey }),
      limit,
      limitLabel: limitLabel(item),
      buttonLabel: `Use ${item.cost} points`,
    };
  });
  const byNewest = (a, b) => (toMillis(b.requestedAt) ?? 0) - (toMillis(a.requestedAt) ?? 0);
  const pending = list.filter((request) => request.status === CLASS_REWARD_REQUEST_STATUS.PENDING).sort(byNewest);
  const finished = list.filter((request) => request.status !== CLASS_REWARD_REQUEST_STATUS.PENDING)
    .sort((a, b) => (toMillis(b.resolvedAt) ?? toMillis(b.requestedAt) ?? 0) - (toMillis(a.resolvedAt) ?? toMillis(a.requestedAt) ?? 0));
  return {
    weekKey,
    items,
    pending,
    finished,
    hasCatalog: items.length > 0,
    hasAnything: items.length > 0 || list.length > 0,
  };
};

/** One request, in a student's words: what, its status, and what happens next. */
export const describeClassRewardRequest = (request = {}) => {
  const cost = Number(request.cost) || 0;
  if (request.status === CLASS_REWARD_REQUEST_STATUS.FULFILLED) {
    return { title: request.itemLabel || 'Class reward', status: 'Done', chip: 'ok', detail: `You used ${cost} points. Your teacher marked it done.` };
  }
  if (request.status === CLASS_REWARD_REQUEST_STATUS.DECLINED) {
    const reason = String(request.declineReason || '').trim();
    return {
      title: request.itemLabel || 'Class reward',
      status: 'Declined — points returned',
      chip: 'warn',
      detail: `${reason ? `Your teacher said: “${reason}”. ` : ''}Your ${cost} points were given back.`,
    };
  }
  return { title: request.itemLabel || 'Class reward', status: 'Waiting for your teacher', chip: 'pass', detail: `You used ${cost} points. Remind your teacher in class if you need to.` };
};

/** The confirm step's promise, before the student agrees. */
export const describeClassRewardUse = ({ item, balance }) => {
  const cost = Number(item?.cost) || 0;
  return {
    question: `Use ${cost} points on “${item?.label || 'this reward'}”?`,
    cost: `Uses ${cost} Class Points.`,
    remaining: `You will have ${Math.max(0, (Number(balance) || 0) - cost)} Class Points left.`,
    effects: [
      'Your teacher gets your request and gives you the reward in class.',
      'If your teacher says no, your points come back.',
      'This does not change any grade or assignment.',
    ],
    confirmLabel: `Use ${cost} points`,
  };
};

export const classRewardSuccessMessage = ({ item, alreadyRequested = false }) => (alreadyRequested
  ? `Your request for “${item?.label || 'this reward'}” is already with your teacher. Your points above are up to date.`
  : `Done! Your teacher will see your request for “${item?.label || 'this reward'}”.`);

/*
 * A failed use, explained. Every message keeps one promise: nothing was spent
 * twice. A transport failure is the one case where the student cannot know
 * whether the server finished, so it says retrying is safe — the retry reuses
 * the same request id and is answered "already with your teacher".
 */
export const classRewardErrorMessage = (error) => {
  const code = String(error?.code || '').replace(/^functions\//, '');
  const message = String(error?.message || '').trim();
  if (['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'cancelled'].includes(code) || /network|offline|fetch/i.test(message)) {
    return "We couldn't reach MathMaster. Check your connection and try again — trying again will never spend your points twice.";
  }
  if (code === 'permission-denied' || code === 'unauthenticated') return 'Your sign-in has expired. Sign in again, then try. Nothing was spent.';
  if (/nothing was spent/i.test(message)) return message;
  return `${message || 'That reward could not be used right now.'} Nothing was spent.`;
};

// ---------------------------------------------------------------------------
// Teacher: the catalog editor's draft, and the pending list.
// ---------------------------------------------------------------------------

/** A new item id that is valid for the server's pattern and unique in the draft. */
export const newCatalogItemId = (draft = [], random = Math.random) => {
  const taken = new Set((draft || []).map((item) => item.itemId));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `item-${random().toString(36).slice(2, 10) || attempt}`;
    if (!taken.has(id)) return id;
  }
  return `item-${Date.now().toString(36)}`;
};

export const emptyCatalogItem = (draft = []) => ({
  itemId: newCatalogItemId(draft), label: '', description: '', cost: 50, active: true, weeklyLimitPerStudent: 1,
});

export const draftFromCatalog = (catalog) => (Array.isArray(catalog?.items) ? catalog.items : []).map((item) => ({ ...item }));

/** Starter suggestions not already in the draft (by id or by name). */
export const availableStarters = (draft = []) => {
  const ids = new Set(draft.map((item) => item.itemId));
  const labels = new Set(draft.map((item) => String(item.label || '').trim().toLowerCase()));
  return STARTER_CLASS_REWARDS.filter((starter) => !ids.has(starter.itemId) && !labels.has(starter.label.toLowerCase()));
};

export const catalogIsFull = (draft = []) => draft.length >= MAX_CATALOG_ITEMS;

/** The first problem with one draft item, as { field, message }, or null. */
export const draftItemProblem = (item) => {
  try {
    validateCatalogItem({ ...item, cost: item?.cost === '' ? NaN : Number(item?.cost), weeklyLimitPerStudent: Number(item?.weeklyLimitPerStudent) || 0 });
    return null;
  } catch (error) {
    if (error instanceof ClassRewardInputError || error?.name === 'ClassRewardInputError') return { field: error.field, message: error.message };
    return { field: null, message: 'Check this reward.' };
  }
};

/** The whole draft's first problem (duplicates, too many), or null. */
export const draftProblem = (classId, draft = []) => {
  try {
    validateCatalogInput({
      classId,
      items: draft.map((item) => ({ ...item, cost: Number(item.cost), weeklyLimitPerStudent: Number(item.weeklyLimitPerStudent) || 0 })),
    });
    return null;
  } catch (error) {
    return error?.message || 'Check the reward list.';
  }
};

/** What the save sends: numbers as numbers, and nothing but the item fields. */
export const catalogPayload = (draft = []) => draft.map((item) => ({
  itemId: item.itemId,
  label: String(item.label || '').trim(),
  description: String(item.description || '').trim(),
  cost: Number(item.cost),
  active: item.active !== false,
  weeklyLimitPerStudent: Number(item.weeklyLimitPerStudent) || 0,
}));

export const draftChanged = (catalog, draft) => JSON.stringify(catalogPayload(draftFromCatalog(catalog)))
  !== JSON.stringify(catalogPayload(draft));

/** Pending requests, oldest first: the student who asked first is served first. */
export const sortPendingRequests = (requests = []) => [...(Array.isArray(requests) ? requests : [])]
  .filter((request) => request?.status === CLASS_REWARD_REQUEST_STATUS.PENDING)
  .sort((a, b) => (toMillis(a.requestedAt) ?? 0) - (toMillis(b.requestedAt) ?? 0));

export const pendingSummary = (requests = []) => {
  const count = sortPendingRequests(requests).length;
  return count ? `${plural(count, 'request')} waiting` : 'No requests waiting';
};

export const teacherRequestStudentName = (request, studentNames = {}) => {
  const names = studentNames instanceof Map ? Object.fromEntries(studentNames) : (studentNames || {});
  return String(names[request?.studentId] || request?.studentLabel || 'A student');
};

export const teacherRewardActionError = (error) => {
  const code = String(error?.code || '').replace(/^functions\//, '');
  const message = String(error?.message || '').trim();
  if (['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'cancelled'].includes(code) || /network|offline|fetch/i.test(message)) {
    return "We couldn't reach MathMaster. Try again — trying again never refunds or charges twice.";
  }
  return message || 'That did not work. Try again.';
};
