import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { latticePointsInView, lineKey, slopeOf } from '../../functions/shared/lineGraphMath.mjs';
import { lineRoundQuestionCount, normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { generateLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import { applyLineGraphAttempts } from '../../functions/shared/lineGraphAttempts.mjs';
import {
  LINE_EVIDENCE_STANDARD,
  LINE_EVIDENCE_SWITCH,
  LINE_EVIDENCE_SWITCH_COLLECTION,
  LINE_EVIDENCE_VERSION,
  buildLineGraphEvidenceEvents,
  lineEvidenceFacts,
  lineEvidenceSwitchedOn,
} from '../../functions/shared/lineGraphEvidence.mjs';
import { LINE_ANSWER_STYLE, LINE_ATTEMPT_KIND, LINE_GRAPH_FORMAT, LINE_GRAPH_MODE_ID, LINE_VERDICT } from '../../functions/shared/lineGraphRules.mjs';
import { EXTRA_TIME_RECEIPTS_FIELD } from '../../functions/shared/liveChallengeResponses.mjs';
import { ROLE_WEIGHT, SUPPORTED_CREDIT, masteryEventFacts } from '../../functions/shared/masteryScoring.mjs';
import { getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';

const mathPath = createRequire(import.meta.url)('../../functions/lib/mathPath.js');

/*
 * GRAPH THE LINE AS MASTERY EVIDENCE (LC12): its own rules, through the
 * submit transaction's own function.
 *
 * Only a line's first try is the student's own answer; a line met again
 * counts once; a skip is not right; Graph it is A.3C and Name it A.2C; the
 * slope helper and extended time are stated, never discounted. Nothing a
 * student can do — retry, take the hint, resend, skip the hard ones, see a
 * line answered and meet it again — raises the evidence.
 */

const { SPRINT } = LINE_GRAPH_FORMAT;
const grandPrix = getScoringStrategy('grandPrix');

let counter = 0;
const nextId = () => `ev-${(counter += 1)}`;

const gameFor = (settings = {}, { seed = 'ev-room', studentKey = 'ana', format = SPRINT } = {}) => {
  const config = normalizeLineGraphConfig({ itemTypes: ['graph'], forms: ['slopeIntercept'], sprintLength: 10, triesPerItem: 3, ...settings }, { format });
  const poolSize = lineRoundQuestionCount(format, config);
  let player = { studentId: studentKey, joined: true, submissionReceipts: {}, attemptSequence: 0, score: 0 };
  const items = new Map();
  const itemAt = (questionIndex, roundIndex = 0) => {
    const key = `${roundIndex}:${questionIndex}`;
    if (!items.has(key)) items.set(key, generateLineQuestion({ seed, studentKey, roundIndex, questionIndex, config }));
    return items.get(key);
  };
  const submit = (attempts, { roundIndex = 0, elapsedMs = 5_000, extraTime = false, extraTimeFromMs = null } = {}) => {
    const outcome = applyLineGraphAttempts({
      player,
      roundIndex,
      roundVersion: roundIndex + 1,
      attempts,
      questionFor: (questionIndex) => itemAt(questionIndex, roundIndex),
      config,
      arrivedAtMs: 1_000_000 + elapsedMs,
      arrivalElapsedMs: elapsedMs,
      roundDurationMs: 300_000,
      strategy: grandPrix,
      poolSize,
      extraTime,
      extraTimeFromMs,
    });
    player = { ...player, submissionReceipts: outcome.receipts, [EXTRA_TIME_RECEIPTS_FIELD]: outcome.extraTimeReceipts, attemptSequence: outcome.attemptSequence };
    return outcome;
  };
  return { config, poolSize, itemAt, submit, player: () => player, setPlayer: (next) => { player = next; } };
};

const right = (item, questionIndex) => {
  if (item.answerStyle === LINE_ANSWER_STYLE.CHOICE) return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.CHOICE, choice: item.answerChoice };
  const [p, q] = latticePointsInView(item.line, item.view);
  return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.LINE, points: [p, q] };
};
const STEPS = [[1, 1], [1, -1], [2, 1], [1, 2], [-1, 2], [2, -1], [1, 3], [3, 1]];
const wrong = (item, questionIndex, n = 0) => {
  const [p] = latticePointsInView(item.line, item.view, { inset: 2 });
  const slope = slopeOf(item.line);
  const usable = STEPS.map(([dx, dy]) => ({ dx, dy, q: { x: p.x + dx, y: p.y + dy } }))
    .filter(({ dx, dy, q }) => (slope ? !Q.eq(Q.rat(dy, dx), slope) : dx !== 0) && Math.abs(q.x) <= item.view.xMax && Math.abs(q.y) <= item.view.yMax);
  return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.LINE, points: [p, usable[n].q] };
};
const skip = (questionIndex) => ({ attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.SKIP });

// A receipt as the pipeline writes it, for the rules no single game shows.
let sequence = 0;
const receipt = ({ roundIndex = 0, questionIndex = 0, itemType = 'graph', itemKey = '2|-1|-3', isCorrect = true, kind = 'line', extraTime = false, forfeit = false }) => {
  sequence += 1;
  return {
    receiptKind: 'targetAttempt', serverConfirmed: true, roundIndex, questionIndex, sequence, targetCount: 1,
    reportTags: { form: 'slopeIntercept', itemType, variant: 'v' }, attemptKind: kind, isCorrect, completesQuestion: isCorrect,
    ...(forfeit || kind === 'skip' ? { forfeit: true } : {}), ...(itemKey ? { itemKey } : {}), ...(extraTime ? { extraTime: true } : {}),
  };
};
const playerOf = (receipts, extra = {}) => ({ submissionReceipts: Object.fromEntries(receipts.map((entry, index) => [`r${index}-${entry.sequence}`, entry])), ...extra });

/* -------------------------------- the rules -------------------------------- */

test('every receipt names the line it asked (`itemKey`), so a line met again can be told', () => {
  const game = gameFor();
  game.submit([right(game.itemAt(0), 0), wrong(game.itemAt(1), 1)]);
  const receipts = Object.values(game.player().submissionReceipts);
  assert.deepEqual(receipts.map((entry) => entry.itemKey).sort(), [lineKey(game.itemAt(0).line), lineKey(game.itemAt(1).line)].sort());
});

test('only each line\'s first try counts: a retry after the hint, a replay, a repeat add nothing', () => {
  const game = gameFor();
  // 0: right first. 1: wrong, the same wrong line again (repeated), then right
  // after the hint. 2: right first, then the same batch sent again (a replay).
  // 3: wrong, wrong, wrong — shown. 4: wrong, then right.
  game.submit([right(game.itemAt(0), 0)]);
  const miss = wrong(game.itemAt(1), 1);
  game.submit([miss]);
  assert.equal(game.submit([{ ...miss, attemptId: nextId() }]).verdicts[0].verdict, LINE_VERDICT.REPEATED);
  game.submit([right(game.itemAt(1), 1)]);
  const sent = [right(game.itemAt(2), 2)];
  game.submit(sent);
  assert.equal(game.submit(sent).verdicts[0].replay, true);
  game.submit([wrong(game.itemAt(3), 3, 0)]);
  game.submit([wrong(game.itemAt(3), 3, 1)]);
  game.submit([wrong(game.itemAt(3), 3, 2)]);
  game.submit([wrong(game.itemAt(4), 4, 0)]);
  game.submit([right(game.itemAt(4), 4)]);
  const facts = lineEvidenceFacts({ player: game.player() });
  assert.equal(facts.version, LINE_EVIDENCE_VERSION);
  assert.deepEqual({ ...facts.graph }, { lines: 5, firstTryRight: 2, inExtraTime: 0 });
  assert.deepEqual({ ...facts.name }, { lines: 0, firstTryRight: 0, inExtraTime: 0 });
});

test('a skipped line is not right; a line never tried counts for nothing', () => {
  const game = gameFor();
  game.submit([skip(0)]);
  game.submit([right(game.itemAt(1), 1)]);
  // Items 2–9 were never reached: no receipt, nothing counted.
  assert.deepEqual({ ...lineEvidenceFacts({ player: game.player() }).graph }, { lines: 2, firstTryRight: 1, inExtraTime: 0 });
  // Skipping every hard line cannot leave only the sure ones on the record.
  const skipper = gameFor({}, { studentKey: 'bo' });
  for (let index = 0; index < 8; index += 1) skipper.submit([skip(index)]);
  skipper.submit([right(skipper.itemAt(8), 8)]);
  const counted = lineEvidenceFacts({ player: skipper.player() }).graph;
  assert.equal(counted.lines, 9);
  assert.equal(counted.firstTryRight, 1);
});

test('a line met again counts once: the first meeting, whatever came after', () => {
  // Round 0 asked the line and the student missed (and saw it shown); round 1
  // asked the same line and they drew it right at once.
  const facts = lineEvidenceFacts({ player: playerOf([
    receipt({ roundIndex: 0, questionIndex: 0, itemKey: '2|-1|-3', isCorrect: false, forfeit: true }),
    receipt({ roundIndex: 1, questionIndex: 0, itemKey: '2|-1|-3', isCorrect: true }),
    receipt({ roundIndex: 1, questionIndex: 1, itemKey: '1|1|4', isCorrect: true }),
  ]) });
  assert.deepEqual({ ...facts.graph }, { lines: 2, firstTryRight: 1, inExtraTime: 0 });
  // The same line as a different kind of item is a different task, counted on its own.
  const both = lineEvidenceFacts({ player: playerOf([
    receipt({ questionIndex: 0, itemType: 'graph', itemKey: '2|-1|-3' }),
    receipt({ questionIndex: 1, itemType: 'name', itemKey: '2|-1|-3', kind: 'choice' }),
  ]) });
  assert.equal(both.graph.lines, 1);
  assert.equal(both.name.lines, 1);
});

test('a receipt that does not name its line (written before the rule) counts for nothing', () => {
  const facts = lineEvidenceFacts({ player: playerOf([
    receipt({ questionIndex: 0, itemKey: null }),
    receipt({ questionIndex: 1, itemKey: '1|1|4' }),
  ]) });
  assert.deepEqual({ ...facts.graph }, { lines: 1, firstTryRight: 1, inExtraTime: 0 });
});

test('Graph it is A.3C, Name it A.2C; a vertical line is no function\'s graph', () => {
  assert.deepEqual({ ...LINE_EVIDENCE_STANDARD }, { graph: 'A.3C', name: 'A.2C' });
  const facts = lineEvidenceFacts({ player: playerOf([
    receipt({ questionIndex: 0, itemType: 'graph', itemKey: '0|1|3' }), // y = 3: a function
    receipt({ questionIndex: 1, itemType: 'graph', itemKey: '1|0|3' }), // x = 3: not one
    receipt({ questionIndex: 2, itemType: 'name', itemKey: '1|0|3', kind: 'choice' }), // writing x = 3 is A.2C
  ]) });
  assert.equal(facts.graph.lines, 1);
  assert.equal(facts.name.lines, 1);
  const events = buildLineGraphEvidenceEvents({ roomId: 'room1', modeId: LINE_GRAPH_MODE_ID.SPRINT, standings: [{ studentId: 'ana', joined: true, lineGraphEvidence: facts }] });
  assert.deepEqual(events.map((event) => [event.alignmentKeys[0], event.source.itemType]), [['A.3C', 'graph'], ['A.2C', 'name']]);
});

test('a first try in extended time, after the buzzer, is a first try — stated, never discounted', () => {
  const game = gameFor();
  game.submit([right(game.itemAt(0), 0)], { elapsedMs: 100_000 });
  game.submit([right(game.itemAt(1), 1)], { elapsedMs: 130_000, extraTime: true, extraTimeFromMs: 120_000 });
  const facts = lineEvidenceFacts({ player: game.player() });
  assert.deepEqual({ ...facts.graph }, { lines: 2, firstTryRight: 2, inExtraTime: 1 });
  const [event] = buildLineGraphEvidenceEvents({ roomId: 'room2', standings: [{ studentId: 'ana', joined: true, lineGraphEvidence: facts }] });
  assert.deepEqual(event.supportUsage.accommodations, ['extra-time']);
  assert.match(event.conditions, /1 of these first tries came in the student's extended time/);
  const mastery = masteryEventFacts(event, mathPath);
  assert.equal(mastery.independent, true, 'extended time is access');
  assert.equal(mastery.creditedScore, 1);
});

test('the slope helper is stated on Graph it evidence only, and never lowers the credit', () => {
  const facts = lineEvidenceFacts({
    player: playerOf([receipt({ questionIndex: 0, itemType: 'graph' }), receipt({ questionIndex: 1, itemType: 'name', itemKey: '1|1|4', kind: 'choice' })], { lineSlopeHelper: true }),
  });
  assert.equal(facts.slopeHelper, true, 'their plan turned it on');
  assert.equal(lineEvidenceFacts({ player: playerOf([]), roomSlopeHelper: true }).slopeHelper, true, 'or the room did');
  assert.equal(lineEvidenceFacts({ player: playerOf([]) }).slopeHelper, false);
  const [graph, name] = buildLineGraphEvidenceEvents({ roomId: 'room3', standings: [{ studentId: 'ana', joined: true, lineGraphEvidence: facts }] });
  assert.equal(graph.supportUsage.slopeHelper, true);
  assert.match(graph.conditions, /slope helper was on/);
  assert.ok(!('slopeHelper' in name.supportUsage), 'naming a line shows no helper');
  assert.doesNotMatch(name.conditions, /slope helper/);
  const mastery = masteryEventFacts(graph, mathPath);
  assert.equal(mastery.independent, true);
  assert.equal(mastery.creditedScore, 1, `not the supported ${SUPPORTED_CREDIT}`);
});

test('one event per student per standard: stable keys, Live Challenge weight, the share right first time', () => {
  const standings = [
    { studentId: 'ana', joined: true, lineGraphEvidence: { version: LINE_EVIDENCE_VERSION, graph: { lines: 4, firstTryRight: 3, inExtraTime: 0 }, name: { lines: 0, firstTryRight: 0, inExtraTime: 0 }, slopeHelper: false } },
    // Never joined, an older version's facts, no facts, nothing counted: no event.
    { studentId: 'bo', joined: false, lineGraphEvidence: { version: LINE_EVIDENCE_VERSION, graph: { lines: 2, firstTryRight: 2 } } },
    { studentId: 'cy', joined: true, lineGraphEvidence: { version: LINE_EVIDENCE_VERSION + 1, graph: { lines: 2, firstTryRight: 2 } } },
    { studentId: 'di', joined: true },
    { studentId: 'eve', joined: true, lineGraphEvidence: { version: LINE_EVIDENCE_VERSION, graph: { lines: 0, firstTryRight: 0 }, name: { lines: 0 } } },
  ];
  const events = buildLineGraphEvidenceEvents({ roomId: 'room4', modeId: LINE_GRAPH_MODE_ID.RUSH, standings, occurredAt: 1234 });
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.studentId, 'ana');
  assert.equal(event.eventKey, 'liveChallenge_room4_A.3C');
  assert.deepEqual(event.source, { kind: 'liveChallenge', roomId: 'room4', activityRole: 'liveChallenge', modeId: LINE_GRAPH_MODE_ID.RUSH, itemType: 'graph', evidenceVersion: LINE_EVIDENCE_VERSION });
  assert.equal(event.performance.score, 0.75);
  assert.equal(event.performance.isCorrect, false);
  assert.equal(event.performance.linesCounted, 4);
  assert.equal(event.occurredAt, 1234);
  assert.match(event.conditions, /first try/i, 'the record states its conditions');
  // What the mastery estimate makes of it: a Live Challenge's weight, on A.3C.
  const mastery = masteryEventFacts(event, mathPath);
  assert.deepEqual(mastery.codes, ['A.3C']);
  assert.equal(mastery.weight, ROLE_WEIGHT.liveChallenge);
  assert.equal(mastery.creditedScore, 0.75);
  // A retried finish writes the same events again.
  assert.deepEqual(buildLineGraphEvidenceEvents({ roomId: 'room4', modeId: LINE_GRAPH_MODE_ID.RUSH, standings, occurredAt: 1234 }), events);
  assert.deepEqual(buildLineGraphEvidenceEvents({ roomId: '', standings }), []);
});

test('the owner\'s switch: only the boolean true turns it on', () => {
  assert.equal(LINE_EVIDENCE_SWITCH_COLLECTION, 'platformFlags');
  assert.equal(LINE_EVIDENCE_SWITCH, 'liveChallengeEvidence');
  assert.equal(lineEvidenceSwitchedOn({ lineGraph: true }), true);
  for (const stored of [null, undefined, {}, { lineGraph: 'true' }, { lineGraph: 1 }, { lineGraph: false }, { enabled: true }]) {
    assert.equal(lineEvidenceSwitchedOn(stored), false, JSON.stringify(stored));
  }
});

/* ------------------------------- the wiring ------------------------------- */

test('the server: each student\'s facts on the match result; line events only with the switch on; the bank builder unchanged', () => {
  const server = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const finalize = region(server, 'function applyLiveChallengeMatchFinalization(', '\n}\n', 'finalization');
  // Counted from each player's receipts in the finishing commit, onto their own standing.
  assert.match(finalize, /lineGraphEvidence: engine\.lineEvidence\.lineEvidenceFacts\(\{ player: playerById\.get\(standing\.studentId\) \|\| \{\}, roomSlopeHelper \}\)/);
  assert.match(finalize, /standings: resultStandings,/);
  const effect = region(server, 'async function writeChallengeEvidenceFromResult(', '\n}\n', 'evidence effect');
  // The bank rounds' builder, exactly as before.
  assert.match(effect, /evidenceRules\.buildChallengeEvidenceEvents\(\{\s*roomId: result\.roomId,\s*players: result\.standings \|\| \[\],\s*roundStandards: result\.roundStandards \|\| \{\},/);
  // A line game's events only while the owner's switch is on.
  const lines = region(server, 'async function lineGraphEvidenceEventsFor(', '\n}\n', 'line evidence');
  assert.match(lines, /if \(!lineEvidence\.lineEvidenceSwitchedOn\(switchSnapshot\.exists \? switchSnapshot\.data\(\) : null\)\) return \[\];/);
  assert.match(lines, /lineEvidence\.buildLineGraphEvidenceEvents\(\{/);
});
