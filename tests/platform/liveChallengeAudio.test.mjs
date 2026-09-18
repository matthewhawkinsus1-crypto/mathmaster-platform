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
