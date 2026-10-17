import test from 'node:test';
import assert from 'node:assert/strict';

import { containsPoint, latticePointsInView, sameLine } from '../../functions/shared/lineGraphMath.mjs';
import { lineRoundQuestionCount, normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { generateLineQuestion, listLineSlots, generateLineQuestionForSlot } from '../../functions/shared/lineGraphGenerator.mjs';
import { applyLineGraphAttempts } from '../../functions/shared/lineGraphAttempts.mjs';
import { LINE_GRAPH_FORMAT, LINE_ITEM_TYPE } from '../../functions/shared/lineGraphRules.mjs';
import { getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { publicSolutionDocument, revealableRounds } from '../../functions/shared/liveChallengeSolutionReveal.mjs';
import {
  CLASS_MISTAKE_MIN_STUDENTS,
  classLineFacts,
  lineRevealKey,
  lineRoundSolutionRecord,
  withClassLineFacts,
} from '../../functions/shared/lineGraphReveal.mjs';
import { lineOfText } from './helpers/lineEquationOracle.mjs';

/*
 * A CLASSIC ROUND THE CLASS GRAPHED TOGETHER, SHOWN AFTER IT CLOSED.
 *
 * What the class is shown must be right before it is anything else: the
 * equation is the item's own line (read back by an independent reader), and
 * every point a step names is ON that line. What the class is told about
 * itself is counts — how many answered, how many got it, and the wrong
 * answer most of them gave, only when at least two gave it — and never a
 * name.
 */

const strategy = getScoringStrategy('correctCount');
const POINT = /\((−?\d+(?:\/\d+)?), (−?\d+(?:\/\d+)?)\)/g;
const value = (text) => {
  const [n, d = '1'] = text.replace('−', '-').split('/');
  return Number(n) / Number(d);
};

test('every slot\'s solution shows the item\'s own line, and every point a step names is on it', () => {
  let checked = 0;
  for (const slot of listLineSlots()) {
    for (let seed = 0; seed < 6; seed += 1) {
      const item = generateLineQuestionForSlot({ slot, seedText: `reveal-${slot.itemType}-${slot.form}-${slot.variant}-${slot.tier}-${seed}`, config: { nameStyle: seed % 2 ? 'build' : 'choice' } });
      const record = lineRoundSolutionRecord(item);
      const label = `${slot.itemType}/${slot.form}/${slot.variant}/${slot.tier}`;
      assert.ok(record, label);
      const equation = item.itemType === LINE_ITEM_TYPE.GRAPH ? item.equation : item.answer;
      assert.equal(record.solutionReview.answerSummary, equation.text, label);
      // The headline says how; the prompt has already said which line.
      if (item.itemType === LINE_ITEM_TYPE.GRAPH) {
        assert.equal(record.prompt, `Graph ${equation.text}.`, label);
        assert.match(record.solutionReview.headline, /^[A-Z][^=]+\.$/, `${label}: "${record.solutionReview.headline}" is a sentence about the method`);
      }
      assert.ok(sameLine(lineOfText(record.lineGraph.equation.text), item.line), `${label}: ${record.lineGraph.equation.text} is the item's line`);
      assert.deepEqual(record.lineGraph.line, { a: item.line.a, b: item.line.b, c: item.line.c });
      assert.ok(record.solutionReview.reasoning.length >= 2, `${label}: at least two steps`);
      for (const step of record.solutionReview.reasoning) {
        for (const [, x, y] of step.matchAll(POINT)) {
          const point = { x: value(x), y: value(y) };
          assert.ok(Math.abs(item.line.a * point.x + item.line.b * point.y - item.line.c) < 1e-9, `${label}: "${step}" names ${x}, ${y}, which is on the line`);
        }
      }
      // What is drawn: the key points and the shown points are on the line too.
      [...record.lineGraph.keyPoints, ...record.lineGraph.revealPoints].forEach((point) => assert.ok(containsPoint(item.line, point), label));
      assert.equal(record.solutionReview.commonError, null, 'the class\'s own mistake is added at the close');
      checked += 1;
    }
  }
  assert.ok(checked > 300, `${checked} items`);
  assert.equal(lineRoundSolutionRecord(null), null);
});

/* -------------------------------- the class ------------------------------- */

const classicConfig = normalizeLineGraphConfig({ presetId: 'allThreeForms', itemTypes: ['graph'], difficulty: 'easy' }, { format: LINE_GRAPH_FORMAT.CLASSIC });
const sharedItem = (roundIndex = 0) => generateLineQuestion({ seed: 'class-room', studentKey: '*', roundIndex, questionIndex: 0, config: classicConfig });

let ids = 0;
const playerWho = (key, item, attempts, { joined = true } = {}) => {
  let player = { playerKey: key, joined, submissionReceipts: {}, attemptSequence: 0 };
  attempts.forEach((attempt, index) => {
    const outcome = applyLineGraphAttempts({
      player,
      roundIndex: 0,
      attempts: [{ attemptId: `${key}-${(ids += 1)}`, questionIndex: 0, ...attempt }],
      questionFor: () => item,
      config: classicConfig,
      arrivedAtMs: 1_000 * (index + 1),
      arrivalElapsedMs: 1_000 * (index + 1),
      roundDurationMs: 45_000,
      strategy,
      poolSize: lineRoundQuestionCount(LINE_GRAPH_FORMAT.CLASSIC, classicConfig),
    });
    player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
  });
  return player;
};

const linesOf = (item) => {
  const [p, q] = latticePointsInView(item.line, item.view, { inset: 1 });
  const off = (dy) => ({ kind: 'line', points: [p, { x: q.x, y: q.y + dy }] });
  return { right: { kind: 'line', points: [p, q] }, wrongA: off(1), wrongB: off(-1) };
};

test('the class\'s facts: who answered, who got it, and the wrong line at least two students drew', () => {
  const item = sharedItem();
  const { right, wrongA, wrongB } = linesOf(item);
  const players = [
    playerWho('a', item, [wrongA, right]),
    playerWho('b', item, [wrongA, wrongA, wrongB, right]),
    playerWho('c', item, [right]),
    playerWho('d', item, [wrongB]),
    playerWho('e', item, []),
    playerWho('f', item, [wrongB, wrongB], { joined: false }),
  ];
  const facts = classLineFacts({ record: lineRoundSolutionRecord(item), players, roundIndex: 0 });
  assert.equal(facts.answered, 4, 'a student who never answered is not counted; nor is one who left');
  assert.equal(facts.correct, 3);
  assert.equal(facts.firstTry, 1);
  // wrongA: a and b (b's repeat is one student); wrongB: b and d. A tie of
  // two students each is settled by the line itself, the same way every time.
  assert.equal(facts.mistake.students, 2);
  const drawn = facts.mistake.line;
  const [p, q] = (facts.mistake.line.a * wrongA.points[1].x + facts.mistake.line.b * wrongA.points[1].y === facts.mistake.line.c ? wrongA : wrongB).points;
  assert.ok([p, q].every((point) => drawn.a * point.x + drawn.b * point.y === drawn.c), 'the published line is a line students drew');
  assert.ok(sameLine(lineOfText(facts.mistake.text), drawn), `${facts.mistake.text} is written for that line`);
  assert.deepEqual(classLineFacts({ record: lineRoundSolutionRecord(item), players, roundIndex: 0 }), facts, 'the same every time');
});

test('one student\'s mistake is theirs: the class is shown a mistake only when at least two made it', () => {
  assert.equal(CLASS_MISTAKE_MIN_STUDENTS, 2);
  const item = sharedItem(1);
  const { right, wrongA, wrongB } = linesOf(item);
  const record = lineRoundSolutionRecord(item);
  // A, then B, then A again: two recorded misses on the same wrong line, by
  // one student (the same line twice in a row is not recorded twice).
  const once = playerWho('a', item, [wrongA, wrongB, wrongA]);
  assert.equal(Object.values(once.submissionReceipts).filter((receipt) => receipt.answerKey === Object.values(once.submissionReceipts)[0].answerKey).length, 2);
  const alone = classLineFacts({ record, players: [once, playerWho('b', item, [right])], roundIndex: 0 });
  assert.equal(alone.mistake, null, 'one student, however many times');
  assert.equal(withClassLineFacts({ record, players: [], roundIndex: 0 }).solutionReview.commonError, null);
  // A skip is not a wrong line.
  const skipped = classLineFacts({ record, players: [playerWho('a', item, [{ kind: 'skip' }]), playerWho('b', item, [{ kind: 'skip' }])], roundIndex: 0 });
  assert.equal(skipped.mistake, null);
  assert.equal(skipped.answered, 2);
  assert.equal(skipped.correct, 0);
});

test('a tapped wrong option is drawn as its line, with its own wording', () => {
  const config = normalizeLineGraphConfig({ presetId: 'graphAndName', itemTypes: ['name'], nameStyle: 'choice' }, { format: LINE_GRAPH_FORMAT.CLASSIC });
  const item = generateLineQuestion({ seed: 'choice-room', studentKey: '*', roundIndex: 0, questionIndex: 0, config });
  const wrong = item.choices.find((choice) => choice.id !== item.answerChoice);
  const play = (key) => {
    const outcome = applyLineGraphAttempts({
      player: { playerKey: key, joined: true, submissionReceipts: {} },
      roundIndex: 0,
      attempts: [{ attemptId: `${key}-c`, questionIndex: 0, kind: 'choice', choice: wrong.id }],
      questionFor: () => item,
      config,
      arrivedAtMs: 1_000,
      arrivalElapsedMs: 1_000,
      roundDurationMs: 45_000,
      strategy,
      poolSize: 1,
    });
    return { playerKey: key, joined: true, submissionReceipts: outcome.receipts };
  };
  const published = withClassLineFacts({ record: lineRoundSolutionRecord(item), players: [play('a'), play('b')], roundIndex: 0 });
  assert.equal(published.lineGraph.class.mistake.text, wrong.equation.text);
  assert.ok(sameLine(published.lineGraph.class.mistake.line, wrong.line));
  assert.match(published.solutionReview.commonError, new RegExp(`^2 students chose ${wrong.equation.text.replace(/[()]/g, '\\$&')}`));
});

test('the published document carries the line only for a line, and names no student', () => {
  const item = sharedItem(2);
  const { right, wrongA } = linesOf(item);
  const players = [playerWho('student-key-1', item, [wrongA, right]), playerWho('student-key-2', item, [wrongA, right])];
  const document = publicSolutionDocument({ roundIndex: 2, record: withClassLineFacts({ record: lineRoundSolutionRecord(item), players, roundIndex: 0 }), revealedAtMs: 5 });
  assert.equal(document.available, true);
  assert.deepEqual(Object.keys(document.lineGraph.class).sort(), ['answered', 'correct', 'firstTry', 'mistake']);
  assert.doesNotMatch(JSON.stringify(document), /student-key/, 'counts, never names');
  // A bank question's document is exactly what it always was.
  const bank = publicSolutionDocument({ roundIndex: 0, record: { prompt: 'p', teksCode: 'A.2B', solutionReview: { headline: 'h', reasoning: ['r'] } }, revealedAtMs: 5 });
  assert.deepEqual(Object.keys(bank), ['roundIndex', 'originalRoundIndex', 'prompt', 'teksCode', 'available', 'solutionReview', 'revealedAtMs']);
});

test('a round\'s line is held while a later round of the match asks the same line', () => {
  const keys = [sharedItem(0), sharedItem(1), sharedItem(0)].map(lineRevealKey);
  assert.equal(keys[0], keys[2]);
  const base = { scheduledRoundCount: 3, secondChancePossible: false, replayOf: {}, questionKeys: keys.map((key) => [key]) };
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 1 }), [1], 'round 0 waits for round 2, which asks its line');
  assert.deepEqual(revealableRounds({ ...base, closedThrough: 2 }), [0, 1, 2]);
  assert.equal(lineRevealKey(null), null);
});
