import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modulePath = path.resolve('src/platform/liveChallenge/liveChallengeAudio.js');
const loadAudio = async () => {
  assert.equal(existsSync(modulePath), true, 'Live Challenge audio director must exist');
  return import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
};

test('game state selects lobby, battle, final-round and victory music', async () => {
  const { challengeMusicState } = await loadAudio();
  assert.equal(challengeMusicState({ status: 'lobby' }), 'lobby');
  assert.equal(challengeMusicState({ status: 'running', currentRound: 0, scheduledRoundCount: 10 }), 'round');
  assert.equal(challengeMusicState({ status: 'running', currentRound: 8, scheduledRoundCount: 10 }), 'round');
  assert.equal(challengeMusicState({ status: 'running', currentRound: 9, scheduledRoundCount: 10 }), 'finalRound');
  assert.equal(challengeMusicState({ status: 'running', currentRound: 0, scheduledRoundCount: 10 }, 0), null);
  assert.equal(challengeMusicState({ status: 'finished' }), 'victory');
  assert.equal(challengeMusicState({ status: 'cancelled' }), null);
});

test('round end stops music, cues once, and the next synchronized round restarts its audio', async () => {
  const created = [];
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 0; this.playCount = 0; created.push(this); }
    addEventListener() {}
    play() { this.playCount += 1; return Promise.resolve(); }
    pause() {}
  }
  const { LiveChallengeAudioDirector } = await loadAudio();
  const director = new LiveChallengeAudioDirector({
    AudioClass: FakeAudio,
    fetchImpl: async () => ({ ok: false }),
  });
  await director.prime();
  const first = { status: 'running', currentRound: 0, roundCount: 3, roundEndsAt: { seconds: 10 } };

  director.sync({ room: first, remainingMs: 5000 });
  assert.equal(director.musicKey, 'round', 'active rounds play battle music');
  director.sync({ room: first, remainingMs: 0 });
  director.sync({ room: first, remainingMs: 0 });
  assert.equal(director.musicKey, null, 'music remains stopped while the teacher discusses the completed round');
  assert.equal(created.filter((audio) => audio.src.endsWith('/question_lock_in.wav')).length, 1, 'the round-end cue fires once per round');

  const second = { status: 'running', currentRound: 1, roundCount: 3, roundEndsAt: { seconds: 20 } };
  director.sync({ room: second, remainingMs: 5000 });
  assert.equal(director.musicKey, 'round', 'music resumes only when the new round is open');
  assert.equal(created.filter((audio) => audio.src.endsWith('/round_start.wav')).length, 2, 'roundStart remains active for the initial and next round');
  assert.equal(created.filter((audio) => audio.src.endsWith('/next_question.wav')).length, 1, 'the next-question announcer still fires');
  director.dispose();
});

test('music transitions use the approved 650ms crossfade envelope', async () => {
  const { AUDIO_CROSSFADE_MS, crossfadeVolumesAt } = await loadAudio();
  assert.equal(AUDIO_CROSSFADE_MS, 650);
  assert.deepEqual(crossfadeVolumesAt({ elapsedMs: 0, durationMs: 650, outgoingVolume: 0.24, incomingVolume: 0.24 }), { outgoing: 0.24, incoming: 0 });
  assert.deepEqual(crossfadeVolumesAt({ elapsedMs: 325, durationMs: 650, outgoingVolume: 0.24, incomingVolume: 0.24 }), { outgoing: 0.12, incoming: 0.12 });
  assert.deepEqual(crossfadeVolumesAt({ elapsedMs: 650, durationMs: 650, outgoingVolume: 0.24, incomingVolume: 0.24 }), { outgoing: 0, incoming: 0.24 });
});

test('new #1 must hold first place for two seconds before the celebration fires', async () => {
  const { nextLeaderHoldState, NEW_LEADER_HOLD_MS } = await loadAudio();
  assert.equal(NEW_LEADER_HOLD_MS, 2000);
  const started = nextLeaderHoldState({ announcedLeaderKey: 'a', candidateLeaderKey: null, candidateSinceMs: 0 }, 'b', 1000);
  assert.equal(started.announce, false);
  assert.equal(started.candidateLeaderKey, 'b');
  assert.equal(started.candidateSinceMs, 1000);

  const tooSoon = nextLeaderHoldState(started, 'b', 2999);
  assert.equal(tooSoon.announce, false);

  const stable = nextLeaderHoldState(started, 'b', 3000);
  assert.equal(stable.announce, true);
  assert.equal(stable.announcedLeaderKey, 'b');
});

test('leader candidate resets when first place changes during the hold', async () => {
  const { nextLeaderHoldState } = await loadAudio();
  const firstCandidate = nextLeaderHoldState({ announcedLeaderKey: 'a' }, 'b', 1000);
  const replacement = nextLeaderHoldState(firstCandidate, 'c', 1800);
  assert.equal(replacement.candidateLeaderKey, 'c');
  assert.equal(replacement.candidateSinceMs, 1800);
  assert.equal(replacement.announce, false);
});

test('mix defaults mirror the committed V6 audio pack and clamp saved preferences', async () => {
  const { normalizeChallengeAudioMix } = await loadAudio();
  assert.deepEqual(normalizeChallengeAudioMix(), {
    music: 0.24,
    announcer: 0.82,
    effects: 0.62,
    muted: false,
  });
  assert.deepEqual(normalizeChallengeAudioMix({ music: 4, announcer: -1, effects: 0.5, muted: true }), {
    music: 1,
    announcer: 0,
    effects: 0.5,
    muted: true,
  });
});

test('leaderboard effects are cooldown-limited instead of firing on every render', async () => {
  const { cooldownReady } = await loadAudio();
  assert.equal(cooldownReady({ lastPlayedAt: 1000, nowMs: 1899, cooldownMs: 900 }), false);
  assert.equal(cooldownReady({ lastPlayedAt: 1000, nowMs: 1900, cooldownMs: 900 }), true);
  assert.equal(cooldownReady({ lastPlayedAt: 0, nowMs: 10, cooldownMs: 2000 }), true);
});

test('no sound is made that cannot be heard, and a burst of effects stays bounded', async () => {
  // An Audio element downloads its file and was held until it ended. Made
  // before the teacher's first click (unprimed) or while muted, it never
  // played, never ended and was never released — every snapshot of a game
  // added a few.
  const created = [];
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = true; created.push(this); }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const { LiveChallengeAudioDirector, MAX_LIVE_SOUNDS } = await loadAudio();
  let clock = 0;
  const director = new LiveChallengeAudioDirector({ AudioClass: FakeAudio, fetchImpl: async () => ({ ok: false }), now: () => clock });
  const room = (round) => ({ roomId: 'r1', status: 'running', currentRound: round, roundCount: 5, roundEndsAt: { seconds: round } });
  const board = (flip) => [
    { playerKey: 'a', alias: 'A', rank: flip ? 2 : 1, score: 10, streak: 4 },
    { playerKey: 'b', alias: 'B', rank: flip ? 1 : 2, score: 10, streak: 0 },
  ];
  const playRound = (round) => {
    for (let tick = 0; tick < 40; tick += 1) {
      clock += 1_000;
      director.sync({ room: room(round), leaderboard: board(tick % 2), remainingMs: 4_000 - tick * 100, nowMs: clock });
    }
  };

  playRound(0);
  assert.equal(created.length, 0, 'unprimed: nothing is created');
  assert.equal(director.transient.size, 0);

  await director.prime();
  director.setMix({ muted: true });
  playRound(1);
  assert.equal(created.length, 0, 'muted: nothing is created');
  assert.equal(director.transient.size, 0);

  director.setMix({ muted: false });
  playRound(2);
  assert.ok(created.length > 0, 'audible again');
  assert.ok(director.transient.size <= MAX_LIVE_SOUNDS, `at most ${MAX_LIVE_SOUNDS} sounds are held`);
  for (let burst = 0; burst < 30; burst += 1) director.playSfx('countdownTick');
  assert.ok(director.transient.size <= MAX_LIVE_SOUNDS, 'a burst of effects stays bounded');
  if (director.music) assert.ok(director.transient.has(director.music), 'the music is never what gives way');

  // Muting stops and releases everything; unmuting brings the moment's music back.
  director.sync({ room: room(3), leaderboard: board(0), remainingMs: 30_000, nowMs: clock });
  assert.equal(director.musicKey, 'round');
  director.setMix({ muted: true });
  assert.equal(director.transient.size, 0);
  assert.ok(created.every((audio) => audio.paused), 'nothing plays on, silently');
  director.setMix({ muted: false });
  assert.equal(director.musicKey, 'round');
  assert.ok(director.music && !director.music.paused, 'the round music is back');
  director.dispose();
  assert.equal(director.transient.size, 0);
});

test('the music stays down through a round\'s results, and returns with the next round', async () => {
  // A round now stays on screen, closed, while the class talks it through.
  // The cues hear "no time left" from the buzzer until the next round opens.
  const { cueRemainingMs } = await import(`${pathToFileURL(path.resolve('src/platform/liveChallenge/challengeShellModel.js')).href}?test=${Date.now()}`);
  const base = { roomId: 'r2', status: 'running', currentRound: 0, roundCount: 3, startsAt: 10_000, endsAt: 40_000 };
  assert.equal(cueRemainingMs(base, 5_000), 30_000, 'the countdown hears the whole round ahead');
  assert.equal(cueRemainingMs(base, 25_000), 15_000);
  assert.equal(cueRemainingMs(base, 41_000), 0, 'at the buzzer');
  const closed = { ...base, roundState: 'closed' };
  assert.equal(cueRemainingMs(closed, 41_000), 0, 'through the results');
  assert.equal(cueRemainingMs({ ...base, timingMode: 'pace', endsAt: null }, 25_000), undefined, 'an open Pace Race has no time left to hear');

  class FakeAudio { constructor(src) { this.src = src; } addEventListener() {} play() { return Promise.resolve(); } pause() {} }
  const { LiveChallengeAudioDirector } = await loadAudio();
  const director = new LiveChallengeAudioDirector({ AudioClass: FakeAudio, fetchImpl: async () => ({ ok: false }) });
  await director.prime();
  director.sync({ room: base, remainingMs: cueRemainingMs(base, 25_000) });
  assert.equal(director.musicKey, 'round');
  director.sync({ room: closed, remainingMs: cueRemainingMs(closed, 60_000) });
  assert.equal(director.musicKey, null, 'quiet while the results are discussed');
  const next = { ...base, currentRound: 1, roundState: 'open', startsAt: 70_000, endsAt: 100_000 };
  director.sync({ room: next, remainingMs: cueRemainingMs(next, 75_000) });
  assert.equal(director.musicKey, 'round', 'back with the next round');
  director.dispose();
});
