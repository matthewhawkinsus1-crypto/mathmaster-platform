/*
 * GRAPH THE LINE AS MASTERY EVIDENCE (LC12).
 *
 * A line game is real mathematics, graded exactly, and it belongs in a
 * student's mastery — but not through the Live Challenge builder
 * (liveChallengeEvidence.mjs), which reads one ROUND as one graded answer to
 * one bank question, "one attempt, no hints". A line round is up to 150
 * items, each with a hint after a miss and up to three tries (or until
 * right), Graph it and Name it mixed. So it has its own rules:
 *
 *   THE FIRST TRY ON EACH LINE, ONLY. Every later try follows a hint, and a
 *   line out of tries is shown; neither is the student's own answer. What is
 *   never recorded — the same wrong line again (`repeated`), the right line
 *   past the key points (`method`), boxes that do not yet spell an equation
 *   (`form`) — is never a first try either. Retrying, or sending the same
 *   attempt again (a replay), adds nothing.
 *
 *   A LINE MET AGAIN COUNTS ONCE. The same line can come back later in a
 *   game (a long Rush; a Classic schedule), and by then the student may have
 *   seen it answered — a hint, the dashed answer after the last try, the
 *   class's reveal. Only the first time a student meets a line (for each kind
 *   of item) counts, by the line's identity on the receipt (`itemKey`). A
 *   receipt without one — written before this rule — counts for nothing.
 *
 *   A SKIPPED LINE IS NOT RIGHT. The student saw it and passed on it.
 *   Counting a skip as nothing would let a student skip every line they were
 *   unsure of and record only the sure ones. A line still on screen when the
 *   time ran out, with no attempt at all, counts for nothing — it was never
 *   answered (the bank rounds' rule).
 *
 *   PER KIND OF ITEM, PER STANDARD. Graph it (an equation, draw its line) is
 *   A.3C — graph linear functions — so a vertical line, which is no
 *   function's graph, is left out of it; Name it (a line, write its equation)
 *   is A.2C. One event per student per standard per game, worth the share
 *   right on the first try: aggregated, as every Live Challenge's evidence
 *   is, because one timed item is close to a coin flip, and weighted as every
 *   Live Challenge's (activityRole `liveChallenge`, 0.7 — masteryScoring.mjs).
 *
 *   THE CONDITIONS ON THE RECORD. A timed line game, first tries only, stated
 *   on the event itself. The slope helper (it draws the rise and run of the
 *   student's own line and never says which line is right) and extended time
 *   are access, not help with the mathematics: each is stated when it was
 *   there, and neither ever lowers the credit (supportEntitlements.mjs: an
 *   access support must never make a student's work look dependent). A first
 *   try made in extended time, after the class's buzzer, is a first try like
 *   any other; the race never read it, the evidence does.
 *
 * NO MISCONCEPTION CODE YET. A wrong first line's diagnosis
 * (lineGraphFeedback.DIAGNOSIS_MISCONCEPTION) is not recorded as a registered
 * code. The provable part exists — a Graph it line through the form's own
 * point whose slope is exactly −m or 1/m, |m| ≠ 1, m ≠ 0, which is
 * tool:graphing2's rule (docs/architecture/MISCONCEPTION_EVIDENCE.md) — but
 * the registry's codes are read per QUESTION (the case review counts
 * questions), and this evidence is one event per standard per game. Writing
 * three items' codes onto one aggregated event would read as one question.
 * It needs its own per-item record and a case-review reader: its own change.
 *
 * SWITCHED OFF UNTIL THE OWNER TURNS IT ON. Every game records what these
 * rules read (`itemKey` on each receipt; each student's facts on the match
 * result), but no evidence event is written until
 * platformFlags/liveChallengeEvidence has `lineGraph: true` (only the
 * boolean). A game whose evidence effect ran while it was off is not written
 * later. One fact for that decision: a student's device holds each item's
 * answer (lineGraphGenerator.publicLineQuestion — the instant check needs
 * it), so a student who reads the network traffic could answer any line. The
 * race and its rewards already accept that; evidence would too.
 *
 * Pure: Cloud Functions and tests.
 */

import { LINE_ITEM_TYPE } from './lineGraphRules.mjs';
import { RECEIPT_KIND, isAttemptReceipt, playerWorkReceipts, receiptKindOf } from './liveChallengeResponses.mjs';

// The rules' version, on each student's facts and each event. Facts from
// another version are not read.
export const LINE_EVIDENCE_VERSION = 1;

/** The standard each kind of item is evidence for. */
export const LINE_EVIDENCE_STANDARD = Object.freeze({
  // Graph linear functions on the coordinate plane and identify key features.
  [LINE_ITEM_TYPE.GRAPH]: 'A.3C',
  // Write linear equations in two variables given a table, a graph or words.
  [LINE_ITEM_TYPE.NAME]: 'A.2C',
});

const ITEM_TYPES = Object.freeze([LINE_ITEM_TYPE.GRAPH, LINE_ITEM_TYPE.NAME]);

/* THE OWNER'S SWITCH (server-written only; read by the evidence effect). */
export const LINE_EVIDENCE_SWITCH_COLLECTION = 'platformFlags';
export const LINE_EVIDENCE_SWITCH = 'liveChallengeEvidence';
/** Only the boolean true turns it on: a console's "Add field" is a string, and a string is not a decision. */
export const lineEvidenceSwitchedOn = (stored = null) => stored?.lineGraph === true;

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};
const count = (value) => Math.max(0, integerOr(value, 0));
const clean = (value) => (typeof value === 'string' ? value.trim() : '');

// lineGraphMath.lineKey: "a|b|c" of the canonical a·x + b·y = c. b = 0 is a
// vertical line.
const isVerticalKey = (key) => String(key).split('|')[1] === '0';

/**
 * One student's game, as these rules read it: per kind of item, the lines
 * counted (each met once) and how many were right on the first try; whether
 * the slope helper was on for them; how many counted first tries came in
 * their extended time. Stored on their standing in the match result, so the
 * evidence effect reads the result and never private state — and permanent
 * deletion, which removes the standing, removes it too.
 *
 * @param {object}  input.player           the private player record (both receipt maps)
 * @param {boolean} input.roomSlopeHelper  the room's own setting
 */
export const lineEvidenceFacts = ({ player = {}, roomSlopeHelper = false } = {}) => {
  const attempts = Object.values(playerWorkReceipts(player))
    .filter((receipt) => isAttemptReceipt(receipt) && receiptKindOf(receipt) === RECEIPT_KIND.TARGET)
    .sort((left, right) => integerOr(left.sequence, Number.MAX_SAFE_INTEGER) - integerOr(right.sequence, Number.MAX_SAFE_INTEGER));
  // Each item's first recorded attempt, in the order the student met them.
  const firstOfItem = new Map();
  attempts.forEach((receipt) => {
    const item = `${integerOr(receipt.roundIndex, -1)}:${integerOr(receipt.questionIndex, -1)}`;
    if (!firstOfItem.has(item)) firstOfItem.set(item, receipt);
  });
  const tally = Object.fromEntries(ITEM_TYPES.map((itemType) => [itemType, { lines: 0, firstTryRight: 0, inExtraTime: 0 }]));
  const met = new Set();
  [...firstOfItem.values()].forEach((first) => {
    const itemType = first?.reportTags?.itemType;
    if (!ITEM_TYPES.includes(itemType)) return;
    const itemKey = clean(first.itemKey);
    // No identity, no way to tell a line met again: not counted.
    if (!itemKey) return;
    if (itemType === LINE_ITEM_TYPE.GRAPH && isVerticalKey(itemKey)) return;
    const identity = `${itemType}|${itemKey}`;
    if (met.has(identity)) return;
    met.add(identity);
    const bucket = tally[itemType];
    bucket.lines += 1;
    // Right on the first try: it completed the line. A miss, the miss that
    // used the last try and a skip are all not right.
    if (first.isCorrect === true && first.completesQuestion === true && first.forfeit !== true) bucket.firstTryRight += 1;
    if (first.extraTime === true) bucket.inExtraTime += 1;
  });
  return Object.freeze({
    version: LINE_EVIDENCE_VERSION,
    ...Object.fromEntries(ITEM_TYPES.map((itemType) => [itemType, Object.freeze({ ...tally[itemType] })])),
    slopeHelper: roomSlopeHelper === true || player?.lineSlopeHelper === true,
  });
};

const ITEM_WORDS = Object.freeze({
  [LINE_ITEM_TYPE.GRAPH]: 'graphing lines from their equations',
  [LINE_ITEM_TYPE.NAME]: 'naming the equations of graphed lines',
});

/** What the record says about how the work was done, in words a reader needs no code to follow. */
export const lineEvidenceConditions = ({ itemType, slopeHelper = false, inExtraTime = 0 } = {}) => [
  `Timed Live Challenge line game (Graph the Line), ${ITEM_WORDS[itemType] || 'graphing lines'}.`,
  'Only each line\'s first try counts — before any hint, retry or shown answer; a skipped line counts as not right; a line met again in the game counts once. Countdown visible.',
  ...(slopeHelper && itemType === LINE_ITEM_TYPE.GRAPH ? ['The slope helper was on: it showed the rise and run of the student\'s own line, never which line was right.'] : []),
  ...(inExtraTime > 0 ? [`${inExtraTime} of these first tries came in the student's extended time, after the class's buzzer.`] : []),
].join(' ');

/**
 * The evidence events a finished line game writes: one per student per
 * standard, from each joined standing's facts (lineEvidenceFacts). Nothing
 * for a standing without facts of this version, or with no line counted.
 */
export const buildLineGraphEvidenceEvents = ({
  roomId = '',
  modeId = null,
  standings = [],
  occurredAt = Date.now(),
} = {}) => {
  const room = clean(roomId);
  if (!room) return [];
  const events = [];
  (Array.isArray(standings) ? standings : []).forEach((standing) => {
    const studentId = clean(standing?.studentId);
    const facts = standing?.lineGraphEvidence;
    if (!studentId || standing?.joined !== true) return;
    if (!facts || integerOr(facts.version, null) !== LINE_EVIDENCE_VERSION) return;
    ITEM_TYPES.forEach((itemType) => {
      const lines = count(facts[itemType]?.lines);
      if (!lines) return;
      const right = Math.min(lines, count(facts[itemType]?.firstTryRight));
      const inExtraTime = Math.min(lines, count(facts[itemType]?.inExtraTime));
      const slopeHelper = facts.slopeHelper === true && itemType === LINE_ITEM_TYPE.GRAPH;
      const standard = LINE_EVIDENCE_STANDARD[itemType];
      events.push({
        schemaVersion: 1,
        studentId,
        // Stable per student per standard per game (the Live Challenge
        // builder's key): a retried finish writes the same event again.
        eventKey: `liveChallenge_${room}_${standard}`,
        occurredAt,
        alignmentKeys: [standard],
        masteryEvidenceKeys: [standard],
        questionSnapshot: { questionType: 'lineGraphFirstTries', dok: null, familyId: null, itemType },
        source: { kind: 'liveChallenge', roomId: room, activityRole: 'liveChallenge', modeId: modeId || null, itemType, evidenceVersion: LINE_EVIDENCE_VERSION },
        performance: {
          score: right / lines,
          isCorrect: right === lines,
          attemptNumber: 1,
          status: 'finalized',
          // First tries come before any hint or retry; the access supports
          // below never make work dependent.
          isMathematicallyIndependent: true,
          linesCounted: lines,
          linesRightFirstTry: right,
        },
        supportUsage: {
          isMathematicallyIndependent: true,
          ...(inExtraTime > 0 ? { accommodations: ['extra-time'] } : {}),
          ...(slopeHelper ? { slopeHelper: true } : {}),
        },
        conditions: lineEvidenceConditions({ itemType, slopeHelper, inExtraTime }),
      });
    });
  });
  return events;
};
