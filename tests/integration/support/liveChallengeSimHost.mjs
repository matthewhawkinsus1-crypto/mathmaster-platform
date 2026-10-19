/*
 * THE HOST CONSOLE, AS FAR AS STANDINGS GO, FOR THE LAUNCH CERTIFICATION.
 *
 * The teacher's console listens to the room and to every public player row —
 * one device, so its cost is the class's answers, not the class squared — and
 * paces live standings snapshots for the students (standingsPublishPacer.js).
 * This mirrors exactly that part of LiveChallengeTeacher.jsx with the real
 * client service and the real pure modules: the board the console ranks
 * (publicLeaderboard with the room's strategy and the live round from the
 * room's clock), its signature, when the room has live standings at all, and
 * the pacer. Its requests go to the real publishLiveChallengeStandings under
 * the teacher's identity (`call`). tests/platform/liveChallengeStandings
 * Wiring.test.mjs holds this mirror to the console.
 *
 * With `autoClose`, it also paces rounds as the console does: who has
 * finished (their public row; a Graph the Line Classic or Sprint player by
 * working through the round), when everyone has (roundCloseDue), and the same
 * round-scoped close the teacher can press — a close the server says is
 * premature (round_in_progress) is looked at again three seconds later. The
 * launch certification's own classic scenarios close rounds themselves.
 */
import { publicLeaderboard } from '../../../functions/shared/liveChallenge.mjs';
import { leaderboardOptionsFor } from '../../../functions/shared/liveChallengeScoring.mjs';
import { CHALLENGE_STAGE, challengeClock, roomRoundsEndOnTheClock, roomRunsQuestionSets, roundCloseDue, stageHasOpenRound } from '../../../src/platform/liveChallenge/challengeShellModel.js';
import { raceRoundFinished } from '../../../src/platform/liveChallenge/rushStandingsModel.js';
import { createStandingsPublishPacer, hostStandingsSignature, roomPublishesLiveStandings } from '../../../src/platform/liveChallenge/standingsPublishPacer.js';
import { importClientService } from './registerClientFirebase.mjs';

let hostSeq = 0;

/**
 * @param {object} options
 * @param {string} options.roomId
 * @param {(name: string, data: object) => Promise<object>} options.call  the teacher's callable
 * @param {boolean} [options.paused]  start without publishing (a host whose pacer is gone)
 * @param {boolean} [options.autoClose]  close each round when it is due, as the console does
 */
export async function createSimHost({ roomId, call, paused = false, autoClose = false }) {
  hostSeq += 1;
  const id = `sim-host-${hostSeq}`;
  // The emulator, never the production config: the test's own thread has no
  // resolution hook unless this installs it (registerClientFirebase.mjs).
  const { service, firebase } = await importClientService(id, 'simulated host console');
  const host = {
    roomId,
    room: null,
    players: [],
    paused,
    requests: [],
    replies: [],
    deliveries: [],
    // [receivedAt, rows that changed] per players delivery: the console's own cost.
    log: [],
    signature: null,
    closed: false,
    // With autoClose: every close request, why it was due and how it went.
    closes: [],
  };
  const makePacer = () => createStandingsPublishPacer({
    publish: async () => {
      const sentAt = Date.now();
      try {
        const reply = await call('publishLiveChallengeStandings', { roomId });
        host.replies.push({ sentAt, at: Date.now(), ...reply });
        return reply;
      } catch (error) {
        host.replies.push({ sentAt, at: Date.now(), error: error?.code || error?.message || String(error) });
        throw error;
      }
    },
    onSent: (at) => host.requests.push(at),
  });
  let pacer = makePacer();

  // ROUND PACING (LiveChallengeTeacher.jsx): who has finished the round now
  // running, everyone since when, and the close when roundCloseDue says so.
  let allFinishedSince = { key: '', at: null };
  let autoClosed = '';
  let closeTimer = null;
  let closeDueAt = null;
  const paceRound = (room, stage, leaderboard) => {
    const roundOpen = stageHasOpenRound(stage);
    const roundsEndOnTheClock = roomRoundsEndOnTheClock(room);
    const questionSetRoom = roomRunsQuestionSets(room);
    const currentRound = Number(room.currentRound);
    const finishedKeys = new Set(roundOpen && !roundsEndOnTheClock
      ? host.players.filter((player) => player?.joined !== false && (questionSetRoom
        ? raceRoundFinished(player, currentRound)
        : Number(player.answeredRound) === currentRound)).map((player) => String(player.playerKey))
      : []);
    const joinedCount = leaderboard.length;
    const answeredCount = finishedKeys.size;
    const roundKey = roundOpen ? `${room.roomId || roomId}-${room.currentRound}-${room.roundVersion || 0}` : '';
    const everyoneFinished = roundOpen && !roundsEndOnTheClock && joinedCount > 0 && answeredCount >= joinedCount;
    if (everyoneFinished && roundKey && !(allFinishedSince.key === roundKey && allFinishedSince.at !== null)) allFinishedSince = { key: roundKey, at: Date.now() };
    const closeDue = roundCloseDue({
      room,
      joinedCount,
      finishedCount: answeredCount,
      allFinishedSinceMs: everyoneFinished && allFinishedSince.key === roundKey ? allFinishedSince.at : null,
    });
    if (!closeDue || !roundKey) return;
    const key = `${roundKey}:${closeDue.reason}`;
    if (autoClosed === key || (closeTimer && closeDueAt === key)) return;
    clearTimeout(closeTimer);
    closeDueAt = key;
    closeTimer = setTimeout(async () => {
      closeTimer = null;
      if (host.closed) return;
      autoClosed = key;
      const expected = { expectedRoundIndex: Number(room.currentRound), expectedRoundVersion: Number(room.roundVersion) || 0 };
      const entry = { reason: closeDue.reason, roundIndex: expected.expectedRoundIndex, dueAtMs: closeDue.dueAtMs, at: Date.now(), ok: null };
      host.closes.push(entry);
      try {
        await call('closeLiveChallengeRound', { roomId, ...expected });
        entry.ok = true;
      } catch (error) {
        entry.ok = false;
        entry.code = error?.details?.lifecycle || error?.code || String(error);
        // Not closed: the server says the round is still running. Look again in a moment.
        if (error?.details?.lifecycle === 'round_in_progress') {
          setTimeout(() => { if (autoClosed === key) autoClosed = ''; evaluate(); }, 3_000);
        }
      }
    }, Math.max(0, closeDue.dueAtMs - Date.now()));
  };

  // The console's board: ranked as the room's strategy ranks a match, with
  // work in progress only while the round takes answers.
  const evaluate = () => {
    if (host.closed || !host.room) return;
    const { room } = host;
    if (room.status === 'finished' || room.status === 'cancelled') { pacer.stop(); return; }
    const stage = challengeClock(room, Date.now()).stage;
    const activeRound = stage === CHALLENGE_STAGE.ROUND_ACTIVE ? Number(room.currentRound) : null;
    const leaderboard = publicLeaderboard(host.players, { activeRound, ...leaderboardOptionsFor(room.scoringStrategyId || null) });
    if (autoClose) paceRound(room, stage, leaderboard);
    const signature = hostStandingsSignature(leaderboard);
    if (signature === host.signature) return;
    host.signature = signature;
    if (host.paused || !roomPublishesLiveStandings(room, { questionSetRoom: roomRunsQuestionSets(room) })) return;
    pacer.changed();
  };

  const stopRoom = service.watchLiveChallengeRoom(roomId, (room) => { host.room = room; evaluate(); }, () => {});
  const rowSignatures = new Map();
  const millisOf = (value) => value?.toMillis?.() ?? 0;
  const stopPlayers = service.watchLiveChallengePlayers(roomId, (rows) => {
    const receivedAt = Date.now();
    let changed = 0;
    rows.forEach((row) => {
      const signature = `${millisOf(row.updatedAt)}:${millisOf(row.provisionalAt)}:${millisOf(row.rushActiveAt)}:${row.joined}`;
      if (rowSignatures.get(row.playerKey) === signature) return;
      rowSignatures.set(row.playerKey, signature);
      changed += 1;
    });
    host.players = rows;
    host.deliveries.push(receivedAt);
    host.log.push([receivedAt, changed]);
    evaluate();
  }, () => {});
  // The console re-derives its stage at each boundary (the deadline drops
  // work in progress from the board): a quarter-second look is enough here.
  const tick = setInterval(evaluate, 250);

  Object.defineProperty(host, 'pacer', { get: () => pacer, enumerable: true });
  return Object.assign(host, {
    // A console that is closed, asleep or offline: no timer of its pacer runs,
    // so a request it still owed is never sent (a woken console starts afresh).
    pause() { host.paused = true; pacer.stop(); },
    resume() { host.paused = false; pacer = makePacer(); host.signature = null; evaluate(); },
    async close() {
      host.closed = true;
      clearInterval(tick);
      clearTimeout(closeTimer);
      pacer.stop();
      stopRoom?.();
      stopPlayers?.();
      await firebase.shutdown();
    },
  });
}
