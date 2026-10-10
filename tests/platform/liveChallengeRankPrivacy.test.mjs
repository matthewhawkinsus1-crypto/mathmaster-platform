// NOBODY IS PUBLICLY LAST — ALSO IN FIRESTORE (product decision 7).
//
// A student who reads the room's documents directly sees what the projector
// would show the class, and their own place — nothing else. The class's copy
// of a round (classRoundSummary, rounds/{n}) and the standings snapshot carry
// only the public rule's rows (liveChallengePrivacy.classStandingsRows); each
// student's own place is in their own summary (liveChallengePlayerSummary.mjs,
// playerSummaries/{studentId}); the whole table stays with the teacher
// (publicRoundSummary, hostRounds/{n}).
//
// Held here over many random rounds, for every scoring strategy:
//   1. the class copy obeys the rule (checked against an oracle written in
//      this file, not the implementation) and names nobody it hides;
//   2. each student's own entry is their place on the table the screens draw
//      (the same ranking as the class copy's rows) and in the standings after;
//   3. a student's screen, built from the class copy and their own summary,
//      shows them their own place, never a classmate the full table would
//      hide, and still obeys the rule (never a row tied with the last, never
//      exactly one classmate unshown);
//   4. the server writes these three copies to the three paths, in the commit
//      that closes the round, and each student's final place at the finish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildMatchResult,
  buildRoundResult,
  classRoundSummary,
  matchStandingsAfterRound,
  publicRoundSummary,
  roundTableByPoints,
} from '../../functions/shared/liveChallengeResults.mjs';
import { publicStandingsRows, roundTableRows } from '../../functions/shared/liveChallengePrivacy.mjs';
import {
  PLAYER_SUMMARY_SCHEMA_VERSION,
  finalSummaryEntries,
  roundSummaryEntries,
  summaryFinal,
  summaryRound,
  summaryUnansweredRounds,
} from '../../functions/shared/liveChallengePlayerSummary.mjs';
import { roundResultsView } from '../../src/platform/liveChallenge/challengeStandingsModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// A small deterministic generator: the same rounds every run.
const seeded = (seed) => () => {
  let value = seed += 0x6D2B79F5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

let sequence = 0;
const randomPlayers = (random, count) => Array.from({ length: count }, (_, index) => {
  const roll = random();
  const receipts = {};
  // Some never answer; the rest answer right or wrong, with few distinct
  // point values and times so that ties are common.
  if (roll > 0.15) {
    sequence += 1;
    const correct = random() > 0.35;
    receipts[`r${index}`] = {
      serverConfirmed: true, roundIndex: 0, questionIndex: 0, sequence, receiptKind: 'response',
      isCorrect: correct, scorePercent: correct ? 100 : 0,
      elapsedMs: 1_000 * (1 + Math.floor(random() * 4)),
      pointsAwarded: correct ? [600, 800, 1000][Math.floor(random() * 3)] : 0,
    };
  }
  return {
    studentId: `S${index}`, playerKey: `pk-${index}`, alias: `Alias ${index}`, joined: true,
    submissionReceipts: receipts, score: Math.floor(random() * 4) * 500, correctCount: 1, roundsAnswered: 1,
  };
});

const STRATEGIES = ['accuracyFirst', 'correctCount', 'grandPrix'];
const ROUNDS = [];
{
  const random = seeded(221);
  for (let trial = 0; trial < 240; trial += 1) {
    const scoringStrategyId = STRATEGIES[trial % STRATEGIES.length];
    const players = randomPlayers(random, 2 + Math.floor(random() * 23));
    const roundResult = buildRoundResult({ roomId: 'room', roundIndex: 0, roundVersion: 1, scoringStrategyId, players });
    const standingsAfterRound = matchStandingsAfterRound({ players, scoringStrategyId });
    const host = publicRoundSummary(roundResult, { standingsAfterRound });
    const byPoints = roundTableByPoints(host);
    ROUNDS.push({
      scoringStrategyId,
      players,
      roundResult,
      standingsAfterRound,
      host,
      byPoints,
      classCopy: classRoundSummary(roundResult, { standingsAfterRound }),
      entries: roundSummaryEntries({ roundResult, summary: host, standingsAfterRound, byPoints }),
    });
  }
}

const keysOf = (rows) => (rows || []).map((row) => row.playerKey);

// THE PRODUCT RULE, WRITTEN HERE (decision 7), not read from the code that
// enforces it. `published` are the rows a class-readable document carries;
// `everyone` is every player's row on that list, in the order the screens
// draw it (a round's table, or the standings after it). The last place in the
// class is the worst rank when everyone has one; when someone has no rank (no
// answer this round), the last place is them and anyone who earned nothing.
const isRank = (value) => Number.isInteger(value) && value >= 1;
const inLastPlace = (row, everyone) => {
  if (!isRank(row.rank)) return true;
  if (everyone.every((other) => isRank(other.rank))) return row.rank === Math.max(...everyone.map((other) => other.rank));
  // Someone has no rank: a row that earned nothing sits with them; a list
  // without points cannot tell, so its worst rank is last too.
  if (Number.isFinite(row.roundPoints)) return row.roundPoints <= 0;
  return row.rank === Math.max(...everyone.filter((other) => isRank(other.rank)).map((other) => other.rank));
};
const assertObeysTheRule = (published, everyone, label) => {
  const place = new Map(everyone.map((row) => [row.playerKey, row]));
  // At most the top few.
  assert.ok(published.length <= 5, `${label}: ${published.length} rows`);
  // The top of the list, in its order, each with their own place.
  assert.deepEqual(keysOf(published), keysOf(everyone.slice(0, published.length)), `${label}: not the top of the list`);
  for (const row of published) {
    assert.ok(isRank(row.rank), `${label}: a row with no rank`);
    assert.equal(row.rank, place.get(row.playerKey).rank, `${label}: ${row.playerKey}'s place`);
    // Never a row tied with the class's last place.
    assert.equal(inLastPlace(place.get(row.playerKey), everyone), false, `${label}: ${row.playerKey} (rank ${row.rank}) is tied for last`);
  }
  // Never exactly one player unshown when anyone is shown.
  if (published.length > 0) assert.notEqual(everyone.length - published.length, 1, `${label}: exactly one player unshown`);
  // Two players: no ranking. Three: first place only.
  if (everyone.length === 2) assert.equal(published.length, 0, `${label}: two players, a ranking`);
  if (everyone.length === 3) published.forEach((row) => assert.equal(row.rank, 1, `${label}: three players, a row below first`));
};

test('1. the class copy of a round names nobody the public rule hides', () => {
  const seen = { published: 0, lastPlaceInTopFew: 0, two: 0, three: 0, hidden: 0 };
  for (const round of ROUNDS) {
    const label = `${round.scoringStrategyId}, ${round.players.length} players`;
    const table = roundTableRows(round.host.standings, { byPoints: round.byPoints });
    assert.equal(table.length, round.players.length, 'the table is every player');
    for (const [published, everyone] of [[round.classCopy.standings, table], [round.classCopy.standingsAfterRound, round.standingsAfterRound]]) {
      assertObeysTheRule(published, everyone, label);
      if (published.length) seen.published += 1;
      if (everyone.slice(0, 5).some((row) => inLastPlace(row, everyone))) seen.lastPlaceInTopFew += 1;
      if (everyone.length === 2) seen.two += 1;
      if (everyone.length === 3) seen.three += 1;
    }
    // Anyone on neither published list is nowhere in the document (key or alias).
    const shown = new Set([...keysOf(round.classCopy.standings), ...keysOf(round.classCopy.standingsAfterRound)]);
    const text = JSON.stringify(round.classCopy);
    for (const player of round.players) {
      if (shown.has(player.playerKey)) continue;
      seen.hidden += 1;
      assert.equal(text.includes(`"${player.playerKey}"`), false, `${label}: ${player.playerKey} is in the class copy`);
      assert.equal(text.includes(`"${player.alias}"`), false, `${label}: ${player.alias} is in the class copy`);
    }
    assert.equal(round.classCopy.visibility, 'class');
    assert.equal(round.classCopy.participantCount, round.roundResult.participantCount);
    assert.equal(text.includes('studentId'), false, 'never a student id');
  }
  // The cases reach every part of the rule.
  assert.ok(seen.published > 200, `lists published rows (${seen.published})`);
  assert.ok(seen.lastPlaceInTopFew > 100, `the last place reached the top few (${seen.lastPlaceInTopFew})`);
  assert.ok(seen.two > 0 && seen.three > 0, `two- and three-player classes (${seen.two}, ${seen.three})`);
  assert.ok(seen.hidden > 500, `the cases hid players (${seen.hidden})`);
  // The teacher's copy is every player's.
  assert.equal(ROUNDS[0].host.standings.length, ROUNDS[0].players.length);
});

test('2. each student\'s own entry is their place on the table the screens draw, and in the standings after', () => {
  for (const round of ROUNDS) {
    const table = new Map(roundTableRows(round.host.standings, { byPoints: round.byPoints }).map((row) => [row.playerKey, row]));
    const after = new Map(round.standingsAfterRound.map((row) => [row.playerKey, row]));
    const classRows = new Map(round.classCopy.standings.map((row) => [row.playerKey, row]));
    assert.equal(round.entries.length, round.players.length, 'every joined player has an entry');
    for (const item of round.entries) {
      const row = table.get(item.playerKey);
      assert.equal(item.studentId, round.players.find((player) => player.playerKey === item.playerKey).studentId);
      assert.deepEqual([item.entry.participated, item.entry.rank, item.entry.tied], [row.participated, row.participated ? row.rank : null, row.participated && row.tied]);
      // Where they are also on the class copy, the two places are one.
      if (classRows.has(item.playerKey)) assert.deepEqual([classRows.get(item.playerKey).rank, classRows.get(item.playerKey).tied], [item.entry.rank, item.entry.tied]);
      assert.deepEqual([item.entry.standing.rank, item.entry.standing.tied, item.entry.standing.score], [after.get(item.playerKey).rank, after.get(item.playerKey).tied, after.get(item.playerKey).score]);
      assert.equal(item.entry.standing.count, round.standingsAfterRound.length);
    }
  }
});

test('3. a student\'s screen shows their own place, never a classmate the full table hides, and obeys the rule', () => {
  const room = {};
  for (const round of ROUNDS) {
    const fullView = roundResultsView({ summary: round.host });
    for (const item of round.entries) {
      const selfKey = item.playerKey;
      const summary = { schemaVersion: PLAYER_SUMMARY_SCHEMA_VERSION, roomId: 'room', rounds: { 0: item.entry } };
      const view = roundResultsView({ summary: round.classCopy, selfKey, ownRound: summaryRound(summary, 0, { roomId: 'room' }), alias: 'Me' });
      // Their own place, as the full table has it.
      const fullSelf = fullView.rows.find((row) => row.playerKey === selfKey);
      assert.deepEqual([view.self.rank, view.self.tied, view.self.participated], [fullSelf.rank, fullSelf.tied, fullSelf.participated]);
      assert.deepEqual([view.selfStanding.rank, view.selfStanding.score], [item.entry.standing.rank, item.entry.standing.score]);
      for (const [rows, board, fullRows] of [[view.rows, view.tableBoard, fullView.rows], [view.standings, view.standingsBoard, fullView.standings]]) {
        const mine = publicStandingsRows(room, rows, { selfKey, ...board });
        const theirs = publicStandingsRows(room, fullRows, { selfKey });
        // Never a classmate the whole-table rule would not show this viewer.
        const allowed = new Set(keysOf(theirs.rows));
        mine.rows.filter((row) => row.playerKey !== selfKey).forEach((row) => assert.ok(allowed.has(row.playerKey), `${round.scoringStrategyId}: ${row.playerKey} shown to ${selfKey}`));
        // Their own row is always there, in the rows or beside them.
        assert.ok(mine.rows.some((row) => row.playerKey === selfKey) || mine.self?.playerKey === selfKey, `${selfKey} sees their own row`);
        // The rule, against the whole class: no shown classmate tied with the
        // last group, and never exactly one classmate unshown.
        const fullLast = publicStandingsRows(room, fullRows).lastRank;
        mine.rows.filter((row) => row.playerKey !== selfKey).forEach((row) => assert.ok(row.rank < fullLast, `${row.playerKey} sits with the last group`));
        const classmatesShown = mine.rows.filter((row) => row.playerKey !== selfKey).length;
        const classmates = fullRows.length - 1;
        if (classmatesShown > 0) assert.notEqual(classmates - classmatesShown, 1, `${round.scoringStrategyId}: exactly one classmate unshown to ${selfKey}`);
      }
    }
  }
});

test('the own summary decodes its round and final, and says which rounds closed without an answer', () => {
  const summary = {
    schemaVersion: PLAYER_SUMMARY_SCHEMA_VERSION,
    roomId: 'room',
    rounds: { 0: { participated: true, rank: 2 }, 1: { participated: false, rank: null }, 3: { participated: false } },
    final: { rank: 4, tied: true, score: 900, correctCount: 3, count: 12 },
  };
  assert.equal(summaryRound(summary, 0, { roomId: 'room' }).rank, 2);
  assert.equal(summaryRound(summary, 2, { roomId: 'room' }), null);
  assert.equal(summaryRound(summary, 0, { roomId: 'other' }), null, 'another room');
  assert.equal(summaryRound({ ...summary, schemaVersion: 99 }, 0), null, 'an unknown version');
  assert.deepEqual({ ...summaryFinal(summary, { roomId: 'room' }) }, summary.final);
  assert.equal(summaryFinal({ ...summary, final: { rank: null } }), null, 'never placed');
  // Round 2 has no entry (they had not joined): not missed.
  assert.deepEqual(summaryUnansweredRounds(summary, [0, 1, 2, 3], { roomId: 'room' }), [1, 3]);
  assert.deepEqual(summaryUnansweredRounds(null, [0, 1]), []);
  // Final entries: every joined, placed player, of how many; nobody who never joined.
  const players = randomPlayers(seeded(7), 6).map((player, index) => ({ ...player, joined: index !== 2 }));
  const result = buildMatchResult({ roomId: 'room', room: { status: 'finished' }, privateState: {}, players, status: 'finished' });
  const finals = finalSummaryEntries({ standings: result.standings });
  assert.equal(finals.length, 5);
  assert.equal(finals.some((item) => item.studentId === 'S2'), false);
  for (const item of finals) {
    const standing = result.standings.find((row) => row.studentId === item.studentId);
    assert.deepEqual([item.entry.rank, item.entry.tied, item.entry.score, item.entry.count], [standing.rank, standing.tied, standing.score, 5]);
  }
});

test('4. the server writes the class copy, the teacher\'s copy and each own summary at a close, and own finals at the finish', async () => {
  const server = executableSource(await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const close = region(server, 'function applyLiveChallengeRoundClose(transaction, {', '\n}\n', 'round close');
  assert.match(close, /transaction\.set\(roomRef\.collection\(LIVE_CHALLENGE_HOST_ROUNDS\)\.doc\(String\(roundIndex\)\), \{\s*\.\.\.hostSummary,/);
  assert.match(close, /transaction\.set\(roomRef\.collection\("rounds"\)\.doc\(String\(roundIndex\)\), \{\s*\.\.\.engine\.results\.classRoundSummary\(roundResult, \{ standingsAfterRound \}\),/);
  assert.match(close, /writeLiveChallengeRoundSummaries\(transaction, \{ engine, roomRef, roundResult, summary: hostSummary, standingsAfterRound \}\);/);
  // The class's round document is the class copy only (never the whole table).
  assert.doesNotMatch(close, /collection\("rounds"\)\.doc\(String\(roundIndex\)\), \{\s*\.\.\.(?:hostSummary|engine\.results\.publicRoundSummary)/);
  assert.match(server, /const LIVE_CHALLENGE_HOST_ROUNDS = "hostRounds";/);
  const summaries = region(server, 'function writeLiveChallengeRoundSummaries(', '\n}\n', 'round summaries');
  assert.match(summaries, /rounds: \{ \[String\(item\.roundIndex\)\]: item\.entry \}/);
  assert.match(summaries, /\}, \{ merge: true \}\);/);
  const finish = region(server, 'function applyLiveChallengeMatchFinalization(transaction, {', '\n}\n', 'finalization');
  assert.match(finish, /if \(finished\) writeLiveChallengeFinalSummaries\(transaction, \{ engine, roomRef, standings: matchResult\.standings, status \}\);/);
  const ensure = region(server, 'exports.ensureLiveChallengeFinalStandings = onCall(', '\n});\n', 'final repair');
  assert.match(ensure, /if \(!summariesDone\) writeLiveChallengeFinalSummaries\(/);
  assert.match(ensure, /Number\(snapshot\.data\(\)\?\.schemaVersion\) === standings\.STANDINGS_PROJECTION_SCHEMA_VERSION/, 'an older snapshot (every seat listed) is rewritten');
  // Deleting a student deletes their own summary in every match they played.
  const deletion = region(server, 'async function deleteStudentLiveChallengeFootprint(', '\n}\n', 'deletion');
  assert.match(deletion, /\.collection\("playerSummaries"\)\.doc\(studentId\)\.delete\(\)/);
  // The teacher's console and projector read the teacher's copy.
  const teacher = executableSource(await readFile(new URL('../../src/components/liveChallenge/LiveChallengeTeacher.jsx', import.meta.url), 'utf8'));
  assert.match(teacher, /useRoundSummary\(roomId, [^;]*showingResults, \{ host: true \}\)/);
  assert.match(teacher, /usePreviousRoundSummary\(roomId, [^;]*showingResults, \{ host: true \}\)/);
});
