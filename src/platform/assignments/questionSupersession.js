/*
 * ONE DELIVERED VERSION PER QUESTION — THE EDITOR'S SUPERSESSION GUARD.
 *
 * A live assignment never rewrites a question students answered. To correct
 * one, MathMaster retires it in place (`teacherExcluded: true`, every response
 * still attached to its id and storage index) and appends a replacement with
 * a NEW id whose `supersedesQuestionId` names it. The current-content
 * projection (currentContentProjection.js) then delivers the replacement where
 * the retired question was. Honors swaps (rigor/honorsExtensionSwap.js),
 * server teacher repairs (functions/lib/teacherQuestionRepair.js) and Content
 * upgrades (functions/lib/assignmentContentVersion.js) all write that shape.
 *
 * Questions joined by supersession links are versions of ONE question — its
 * LINEAGE — and students may be given at most one of them. The Question
 * Editor's Include button used to ignore that: it flipped `teacherExcluded`
 * back on a retired version while its replacement stayed active, and the
 * projection, which only diagnoses, delivered BOTH. For a chained retirement
 * (A → B → C, written by the server as C → B → A) it did not even diagnose
 * it: A and C were simply both delivered.
 *
 * This module is the guard, at the editor action where the invalid state is
 * created rather than after it is saved:
 *
 *   planQuestionInclusion        Include, or a refusal that changes nothing
 *                                and says, in plain words, what to retire first
 *   describeQuestionSupersession what a card shows: replaced, by which question,
 *                                or what it replaces, and whether Include is open
 *   findSupersessionConflicts    for a save: lineages with more than one
 *                                active version, however they arose
 *   withoutSupersessionLink      Duplicate makes a new question, never a second
 *                                replacement of the same original
 *   keepSupersessionLink         a content repair keeps the question's own link
 *                                and cannot invent one
 *   detachSupersessionLinksTo    a permanent removal (no student history)
 *                                leaves no link pointing at nothing
 *
 * CHAINS RESOLVE DETERMINISTICALLY. A lineage is the connected set of
 * questions under supersession links, whatever shape wrote it: linked
 * (each replacement names the one it replaced — the server's repair), flat
 * (every replacement names the ORIGINAL — an Honors swap, which also records
 * the one it swapped out in `honorsEnrichment.replacesQuestionId`), or a
 * hand-edited cycle. The active version is a property of the set, so storage
 * order, traversal order and cycles cannot change the answer.
 *
 * Nothing here rewrites a question id, a storage position or a response.
 * Pure: no React, no Firestore, no clock.
 */

const clean = (value) => String(value ?? '').trim();
const isActive = (question) => question?.teacherExcluded !== true;

// The fields that make a question a later version of another. A copy of a
// question is a new question, so it carries neither.
const SUPERSESSION_FIELDS = Object.freeze(['supersedesQuestionId', 'introducedInContentVersion']);

export const SUPERSESSION_REFUSAL = Object.freeze({
  NOT_FOUND: 'question-not-found',
  // A version that replaced this one (directly or through a chain) is active.
  ACTIVE_REPLACEMENT: 'active-replacement',
  // This question is itself a replacement, and a version it replaced is active again.
  ACTIVE_EARLIER_VERSION: 'active-earlier-version',
  // Another replacement of the same original is active, and nothing records
  // which of the two came later.
  ACTIVE_OTHER_VERSION: 'active-other-version',
});

export const SUPERSESSION_RELATION = Object.freeze({
  SELF: 'self',
  REPLACEMENT: 'replacement',
  EARLIER_VERSION: 'earlierVersion',
  OTHER_VERSION: 'otherVersion',
});

/* ---------------------------------------------------------------------------
 * Lineages.
 * ------------------------------------------------------------------------- */

const reachable = (start, edges) => {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    (edges[node] || []).forEach((next) => {
      if (seen.has(next)) return;
      seen.add(next);
      queue.push(next);
    });
  }
  seen.delete(start);
  return seen;
};

/**
 * The lineages of a flat question list — the editor's list, or any flattened
 * storage order. Positions are the list's own indexes.
 *
 *   lineageOf(index)          { indexes, questionIds, activeIndexes }, in list order
 *   relation(index, other)    how `other` relates to the question at `index`
 *   supersedesTargets(index)  the positions its supersedesQuestionId names
 *   lineages                  every lineage, as position lists in list order
 */
export const resolveQuestionLineages = (questions = []) => {
  const list = Array.isArray(questions) ? questions : [];
  const ids = list.map((question) => clean(question?.questionId));
  const positionsById = new Map();
  ids.forEach((id, index) => {
    if (!id) return;
    if (!positionsById.has(id)) positionsById.set(id, []);
    positionsById.get(id).push(index);
  });
  const positionsOf = (id) => (id ? positionsById.get(id) || [] : []);
  const supersedes = list.map((question) => clean(question?.supersedesQuestionId));
  const swappedOut = list.map((question) => clean(question?.honorsEnrichment?.replacesQuestionId));

  // Union-find over positions. The smaller position always becomes the root,
  // so a lineage's identity never depends on the order links are visited.
  const parent = list.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let node = index;
    while (parent[node] !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  supersedes.forEach((target, index) => positionsOf(target).forEach((position) => union(index, position)));

  const members = new Map();
  list.forEach((_, index) => {
    const root = find(index);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(index);
  });

  // Which version replaced which, inside a lineage: the supersession link,
  // plus the Honors swap's own record of the extension it swapped out (a swap
  // links every replacement to the ORIGINAL, so the link alone cannot say that
  // the second replacement replaced the first). Membership never comes from
  // the Honors record: it only orders versions already joined by a link.
  const earlier = list.map((_, index) => [...new Set([...positionsOf(supersedes[index]), ...positionsOf(swappedOut[index])])]
    .filter((position) => position !== index && find(position) === find(index)));
  const later = list.map(() => []);
  earlier.forEach((positions, index) => positions.forEach((position) => later[position].push(index)));

  const lineageOf = (index) => {
    const indexes = members.get(find(index)) || [index];
    return {
      indexes: [...indexes],
      questionIds: indexes.map((position) => ids[position] || null),
      activeIndexes: indexes.filter((position) => isActive(list[position])),
    };
  };

  const relation = (index, other) => {
    if (index === other) return SUPERSESSION_RELATION.SELF;
    if (reachable(index, later).has(other)) return SUPERSESSION_RELATION.REPLACEMENT;
    if (reachable(index, earlier).has(other)) return SUPERSESSION_RELATION.EARLIER_VERSION;
    return SUPERSESSION_RELATION.OTHER_VERSION;
  };

  return Object.freeze({
    lineageOf,
    relation,
    supersedesTargets: (index) => positionsOf(supersedes[index]),
    supersedesQuestionId: (index) => supersedes[index] || null,
    lineages: [...members.values()].map((indexes) => [...indexes]),
  });
};

/* ---------------------------------------------------------------------------
 * Words a teacher reads.
 * ------------------------------------------------------------------------- */

const numberList = (indexes) => {
  const numbers = indexes.map((index) => index + 1);
  if (numbers.length <= 1) return `Question ${numbers[0]}`;
  return `Questions ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
};

const NOTHING_CHANGED = 'Nothing was changed.';

const refusalFor = (blocking) => {
  const has = (relation) => blocking.some((entry) => entry.relation === relation);
  const indexes = blocking.map((entry) => entry.index);
  const names = numberList(indexes);
  const plural = indexes.length > 1;
  if (has(SUPERSESSION_RELATION.REPLACEMENT)) {
    return {
      code: SUPERSESSION_REFUSAL.ACTIVE_REPLACEMENT,
      teacherMessage: `This question has an active replacement (${names}). Remove or retire the replacement before restoring this version. To retire it, use Exclude (or Throw Out Safely) on ${names}. ${NOTHING_CHANGED}`,
    };
  }
  if (has(SUPERSESSION_RELATION.OTHER_VERSION)) {
    return {
      code: SUPERSESSION_REFUSAL.ACTIVE_OTHER_VERSION,
      teacherMessage: `Another version of this question (${names}) is active. Only one version of a question can be given to students, so remove or retire ${plural ? 'them' : 'it'} before restoring this version. ${NOTHING_CHANGED}`,
    };
  }
  return {
    code: SUPERSESSION_REFUSAL.ACTIVE_EARLIER_VERSION,
    teacherMessage: `This question replaced ${names}, which ${plural ? 'are' : 'is'} active again. Only one version of a question can be given to students, so exclude ${names} before restoring this replacement. ${NOTHING_CHANGED}`,
  };
};

const conflictMessage = (activeIndexes) => (
  activeIndexes.length === 2
    ? `${numberList(activeIndexes)} are both active versions of the same question, so students would be given both. Exclude one of them before saving.`
    : `${numberList(activeIndexes)} are all active versions of the same question, so students would be given every one of them. Keep one and exclude the others before saving.`
);

/* ---------------------------------------------------------------------------
 * What a card shows.
 * ------------------------------------------------------------------------- */

/**
 * The supersession facts of the question at `index`, for its editor card.
 *
 *   isVersioned           it belongs to a lineage (or names a question that is gone)
 *   supersedes            { index, questionId } of the question it replaced, or null
 *   activeVersions        every active version of this question, each with its
 *                         relation to this one ('self', 'replacement', ...)
 *   activeVersion         the one active version when there is exactly one
 *   isReplaced            retired, and a later version stands in its place
 *   conflict              more than one version is active
 *   includeBlocked        Include would make a second active version; the
 *   includeBlockedReason  reason, word for word what a refusal says
 *
 * `lineages` may be passed to reuse one resolution across every card.
 */
export const describeQuestionSupersession = (questions = [], index = -1, lineages = null) => {
  const list = Array.isArray(questions) ? questions : [];
  const position = Number(index);
  const question = Number.isInteger(position) ? list[position] : undefined;
  if (!question) {
    return {
      index: position,
      questionId: null,
      isVersioned: false,
      supersedes: null,
      supersedesMissing: false,
      activeVersions: [],
      activeVersion: null,
      isReplaced: false,
      conflict: false,
      includeBlocked: false,
      includeBlockedReason: '',
    };
  }
  const resolved = lineages || resolveQuestionLineages(list);
  const lineage = resolved.lineageOf(position);
  const targets = resolved.supersedesTargets(position);
  const supersedesMissing = Boolean(resolved.supersedesQuestionId(position)) && targets.length === 0;
  const versionAt = (memberIndex) => ({
    index: memberIndex,
    questionId: clean(list[memberIndex]?.questionId) || null,
    relation: resolved.relation(position, memberIndex),
  });
  const activeVersions = lineage.activeIndexes.map(versionAt);
  const others = activeVersions.filter((entry) => entry.relation !== SUPERSESSION_RELATION.SELF);
  const includeBlocked = !isActive(question) && others.length > 0;
  return {
    index: position,
    questionId: clean(question.questionId) || null,
    isVersioned: lineage.indexes.length > 1 || supersedesMissing,
    lineageQuestionIds: lineage.questionIds,
    supersedes: targets.length ? { index: targets[0], questionId: clean(list[targets[0]]?.questionId) || null } : null,
    supersedesMissing,
    activeVersions,
    activeVersion: activeVersions.length === 1 ? activeVersions[0] : null,
    isReplaced: !isActive(question) && others.some((entry) => entry.relation !== SUPERSESSION_RELATION.EARLIER_VERSION),
    conflict: activeVersions.length > 1,
    includeBlocked,
    includeBlockedReason: includeBlocked ? refusalFor(others).teacherMessage : '',
  };
};

/**
 * The words and tone of a card's supersession notice, or null for a question
 * that has no other version. `showQuestion` is the other card a teacher most
 * likely wants to look at next (the active version, or the one replaced).
 */
export const supersessionCardSummary = (described = {}) => {
  if (!described?.isVersioned) return null;
  const others = (described.activeVersions || []).filter((entry) => entry.relation !== SUPERSESSION_RELATION.SELF);
  const otherNames = others.length ? numberList(others.map((entry) => entry.index)) : '';
  const selfActive = (described.activeVersions || []).some((entry) => entry.relation === SUPERSESSION_RELATION.SELF);
  if (described.conflict) {
    return {
      tone: 'error',
      badge: `${described.activeVersions.length} VERSIONS ACTIVE`,
      text: selfActive
        ? `${otherNames} ${others.length === 1 ? 'is' : 'are'} also an active version of this question, so students would be given both. Exclude one of them before saving.`
        : `${otherNames} are all active versions of this question, so students would be given every one of them. Keep one and exclude the others before saving.`,
      showQuestion: others[0] || null,
    };
  }
  if (described.isReplaced) {
    const active = others[0];
    return {
      tone: 'warning',
      badge: 'REPLACED',
      text: `Replaced by Question ${active.index + 1}. Students are given Question ${active.index + 1} in this question's place, and the responses students gave this version stay attached to it. To restore this version, retire Question ${active.index + 1} first.`,
      showQuestion: active,
    };
  }
  if (!selfActive && others.length) {
    // Retired, and a version it replaced has been restored.
    return {
      tone: 'warning',
      badge: 'RETIRED REPLACEMENT',
      text: `This version replaced ${otherNames}, which ${others.length === 1 ? 'is' : 'are'} active again, so students are given ${otherNames}. To restore this version, retire ${otherNames} first.`,
      showQuestion: others[0],
    };
  }
  if (selfActive && described.supersedes) {
    return {
      tone: 'info',
      badge: 'REPLACEMENT',
      text: `Replaces Question ${described.supersedes.index + 1}. That question stays in the record, excluded, so the responses students gave it keep their meaning; students are given this question in its place.`,
      showQuestion: { index: described.supersedes.index, questionId: described.supersedes.questionId },
    };
  }
  if (!selfActive) {
    const versions = (described.lineageQuestionIds || []).length - 1;
    return {
      tone: 'muted',
      badge: 'NO ACTIVE VERSION',
      text: versions > 0
        ? `No version of this question is active, so students are given none of them. You can include one version of it.`
        : 'This question replaced a question that is no longer in this assignment.',
      showQuestion: null,
    };
  }
  return {
    tone: 'muted',
    badge: null,
    text: described.supersedesMissing
      ? 'This question replaced a question that is no longer in this assignment.'
      : 'Students are given this version. The other versions of this question are kept in the record, excluded, with their student responses.',
    showQuestion: null,
  };
};

/* ---------------------------------------------------------------------------
 * Include.
 * ------------------------------------------------------------------------- */

/**
 * Include the retired question at `index` — or refuse, changing nothing.
 *
 *   ready      { questions }  the list with that one question included; every
 *                             other question is the same object it was
 *   unchanged  the question is already included
 *   refused    { code, teacherMessage, blocking } and NO candidate: the caller
 *              must leave the assignment exactly as it was
 *
 * Only supersession is judged here. A restored version goes back under every
 * ordinary check when the editor saves (the Assignment V5 Pre-Flight), exactly
 * like any other re-included question.
 */
export const planQuestionInclusion = ({ questions = [], index = -1 } = {}) => {
  const list = Array.isArray(questions) ? questions : [];
  const position = Number(index);
  if (!Number.isInteger(position) || !list[position]) {
    return {
      status: 'refused',
      code: SUPERSESSION_REFUSAL.NOT_FOUND,
      teacherMessage: `MathMaster could not find that question in this assignment. ${NOTHING_CHANGED}`,
      blocking: [],
    };
  }
  if (isActive(list[position])) return { status: 'unchanged', code: null, teacherMessage: '', blocking: [] };
  const described = describeQuestionSupersession(list, position);
  const blocking = described.activeVersions.filter((entry) => entry.relation !== SUPERSESSION_RELATION.SELF);
  if (blocking.length) {
    return { status: 'refused', ...refusalFor(blocking), blocking };
  }
  return {
    status: 'ready',
    code: null,
    teacherMessage: '',
    blocking: [],
    questions: list.map((question, questionIndex) => (
      questionIndex === position ? { ...question, teacherExcluded: false } : question
    )),
  };
};

/* ---------------------------------------------------------------------------
 * Saving, and the other editor actions.
 * ------------------------------------------------------------------------- */

/**
 * Every lineage with more than one active version — two versions of one
 * question both delivered — whichever way it arose (an older Include, a
 * record written before this guard, a hand edit). [] when there is none.
 */
export const findSupersessionConflicts = (questions = []) => {
  const list = Array.isArray(questions) ? questions : [];
  const resolved = resolveQuestionLineages(list);
  return resolved.lineages
    .map((indexes) => ({ indexes, activeIndexes: indexes.filter((index) => isActive(list[index])) }))
    .filter(({ activeIndexes }) => activeIndexes.length > 1)
    .map(({ indexes, activeIndexes }) => ({
      lineageQuestionIds: indexes.map((index) => clean(list[index]?.questionId) || null),
      activeIndexes,
      activeQuestionIds: activeIndexes.map((index) => clean(list[index]?.questionId) || null),
      message: conflictMessage(activeIndexes),
    }));
};

/** A copy of a question is a new question: it supersedes nothing. */
export const withoutSupersessionLink = (question = {}) => {
  const copy = { ...question };
  SUPERSESSION_FIELDS.forEach((field) => { delete copy[field]; });
  return copy;
};

/**
 * A repaired question with exactly the supersession link the question it
 * repairs already had: a replacement keeps its place in the lineage even when
 * the repaired JSON dropped the link, and a repair can never make a question
 * claim to replace another.
 */
export const keepSupersessionLink = (existing = {}, replacement = {}) => {
  const next = { ...replacement };
  SUPERSESSION_FIELDS.forEach((field) => {
    if (existing && Object.prototype.hasOwnProperty.call(existing, field)) next[field] = existing[field];
    else delete next[field];
  });
  return next;
};

/**
 * After the question with `removedQuestionId` is removed for good (only
 * possible with no student history), the questions that named it as the one
 * they replaced become ordinary questions — never a link to nothing. A link is
 * kept while any question still carries that id.
 */
export const detachSupersessionLinksTo = (questions = [], removedQuestionId = '') => {
  const list = Array.isArray(questions) ? questions : [];
  const id = clean(removedQuestionId);
  if (!id || list.some((question) => clean(question?.questionId) === id)) return list;
  return list.map((question) => {
    if (clean(question?.supersedesQuestionId) !== id) return question;
    const detached = { ...question };
    delete detached.supersedesQuestionId;
    return detached;
  });
};
