// Live Challenge V6 host-side audio.
// One director owns teacher/projector audio. Student components never import it.

export const LIVE_CHALLENGE_AUDIO_MANIFEST_URL = '/audio/live-challenge/v6/live-challenge-audio-manifest-v6.json';
export const LIVE_CHALLENGE_AUDIO_ROOT = '/audio/live-challenge/v6/';
export const NEW_LEADER_HOLD_MS = 2000;
export const AUDIO_MIX_STORAGE_KEY = 'mathmaster.liveChallenge.audio.v6';

const DEFAULT_MIX = Object.freeze({ music: 0.24, announcer: 0.82, effects: 0.62, muted: false });
const FALLBACK_MANIFEST = Object.freeze({
  announcer: { folder: 'announcer_dark_arena', musicDuckTo: 0.1, announcementCooldownMs: 1500, newLeaderHoldMs: 2000 },
  music: {
    defaultMusicVolume: 0.24,
    tracks: {
      lobby: { file: 'music_16bit/lobby_neon_grid_loop.wav', loop: true },
      round: { file: 'music_16bit/round_battle_circuit_loop.wav', loop: true },
      finalRound: { file: 'music_16bit/final_round_overdrive_loop.wav', loop: true },
      victory: { file: 'music_16bit/victory_champion_stinger.wav', loop: false },
      newLeader: { file: 'music_16bit/new_leader_stinger.wav', loop: false },
    },
  },
  mixing: { fadeBetweenGameStatesMs: 650, duckMusicDuringAnnouncer: true },
  sfx: {
    defaultVolume: 0.62,
    cooldownsMs: { rankMovement: 900, leaderboardShuffle: 1200, newLeader: 2000 },
    events: {
      correct: 'sfx_16bit/correct.wav', wrong: 'sfx_16bit/wrong.wav', countdownTick: 'sfx_16bit/countdown_tick.wav',
      countdownGo: 'sfx_16bit/countdown_go.wav', rankUp: 'sfx_16bit/rank_up.wav', rankDown: 'sfx_16bit/rank_down.wav',
      overtake: 'sfx_16bit/overtake.wav', streak: 'sfx_16bit/streak.wav', newLeaderBurst: 'sfx_16bit/new_leader_burst.wav',
      roundStart: 'sfx_16bit/round_start.wav', finalRoundAlarm: 'sfx_16bit/final_round_alarm.wav',
      questionLockIn: 'sfx_16bit/question_lock_in.wav', leaderboardShuffle: 'sfx_16bit/leaderboard_shuffle.wav',
      tie: 'sfx_16bit/tie.wav', victorySparkle: 'sfx_16bit/victory_sparkle.wav',
    },
  },
});

const clamp01 = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
};

export const normalizeChallengeAudioMix = (value = null) => ({
  music: clamp01(value?.music, DEFAULT_MIX.music),
  announcer: clamp01(value?.announcer, DEFAULT_MIX.announcer),
  effects: clamp01(value?.effects, DEFAULT_MIX.effects),
  muted: value?.muted === true,
});

export const challengeMusicState = (room = {}) => {
  const status = String(room?.status || '');
  if (status === 'lobby') return 'lobby';
  if (status === 'finished') return 'victory';
  if (status !== 'running') return null;
  const currentRound = Math.max(0, Math.floor(Number(room.currentRound) || 0));
  const scheduled = Math.max(0, Math.floor(Number(room.scheduledRoundCount ?? room.roundCount) || 0));
  return scheduled > 0 && currentRound === scheduled - 1 ? 'finalRound' : 'round';
};

export const cooldownReady = ({ lastPlayedAt = 0, nowMs = Date.now(), cooldownMs = 0 } = {}) => (
  !Number(lastPlayedAt) || Number(nowMs) - Number(lastPlayedAt) >= Math.max(0, Number(cooldownMs) || 0)
);

export const nextLeaderHoldState = (state = {}, leaderKey = null, nowMs = Date.now(), holdMs = NEW_LEADER_HOLD_MS) => {
  const announcedLeaderKey = state?.announcedLeaderKey || null;
  const incoming = leaderKey || null;
  if (!incoming || incoming === announcedLeaderKey) {
    return { announcedLeaderKey, candidateLeaderKey: null, candidateSinceMs: 0, announce: false };
  }
  if (incoming !== state?.candidateLeaderKey) {
    return { announcedLeaderKey, candidateLeaderKey: incoming, candidateSinceMs: Number(nowMs), announce: false };
  }
  const since = Number(state?.candidateSinceMs) || Number(nowMs);
  if (Number(nowMs) - since < Math.max(0, Number(holdMs) || NEW_LEADER_HOLD_MS)) {
    return { announcedLeaderKey, candidateLeaderKey: incoming, candidateSinceMs: since, announce: false };
  }
  return { announcedLeaderKey: incoming, candidateLeaderKey: null, candidateSinceMs: 0, announce: true };
};

const ANNOUNCER_FILES = Object.freeze({
  newLeader: 'new_leader.wav', finalRound: 'final_round.wav', hotStreak: 'hot_streak.wav',
  tie: 'all_tied_up.wav', complete: 'challenge_complete.wav', nextQuestion: 'next_question.wav',
});
const audioUrl = (relative) => `${LIVE_CHALLENGE_AUDIO_ROOT}${String(relative || '').replace(/^\/+/, '')}`;

export class LiveChallengeAudioDirector {
  constructor({ storage = null, AudioClass = null, fetchImpl = null, now = () => Date.now() } = {}) {
    try { this.storage = storage || globalThis?.localStorage || null; } catch { this.storage = null; }
    this.AudioClass = AudioClass || globalThis?.Audio || null;
    this.fetchImpl = fetchImpl || globalThis?.fetch?.bind(globalThis) || null;
    this.now = now;
    this.manifest = FALLBACK_MANIFEST;
    this.mix = this.#readMix();
    this.primed = false;
    this.music = null;
    this.musicKey = null;
    this.transient = new Set();
    this.previous = null;
    this.leaderHold = {};
    this.cooldowns = new Map();
    this.lastCountdownSecond = null;
    this.duckTimer = null;
  }

  #readMix() {
    try {
      const raw = this.storage?.getItem?.(AUDIO_MIX_STORAGE_KEY);
      return normalizeChallengeAudioMix(raw ? JSON.parse(raw) : null);
    } catch { return normalizeChallengeAudioMix(); }
  }

  getMix() { return { ...this.mix }; }

  setMix(next = {}) {
    this.mix = normalizeChallengeAudioMix({ ...this.mix, ...next });
    try { this.storage?.setItem?.(AUDIO_MIX_STORAGE_KEY, JSON.stringify(this.mix)); } catch { /* best effort */ }
    if (this.music) this.music.volume = this.mix.muted ? 0 : this.mix.music;
    return this.getMix();
  }

  async prime() {
    this.primed = true;
    if (this.fetchImpl) {
      try {
        const response = await this.fetchImpl(LIVE_CHALLENGE_AUDIO_MANIFEST_URL, { cache: 'force-cache' });
        if (response?.ok) this.manifest = await response.json();
      } catch { this.manifest = FALLBACK_MANIFEST; }
    }
    return this.getMix();
  }

  #makeAudio(relative, volume, loop = false) {
    if (!this.AudioClass || !relative) return null;
    try {
      const audio = new this.AudioClass(audioUrl(relative));
      audio.preload = 'auto'; audio.loop = loop; audio.volume = this.mix.muted ? 0 : clamp01(volume, 1);
      this.transient.add(audio);
      const cleanup = () => this.transient.delete(audio);
      audio.addEventListener?.('ended', cleanup, { once: true });
      audio.addEventListener?.('error', cleanup, { once: true });
      return audio;
    } catch { return null; }
  }

  #play(audio) {
    if (!this.primed || !audio || this.mix.muted) return;
    audio.play?.()?.catch?.(() => {});
  }

  switchMusic(key) {
    if (!this.primed || key === this.musicKey) return;
    const old = this.music;
    this.music = null; this.musicKey = key || null;
    if (old) { old.pause?.(); old.currentTime = 0; this.transient.delete(old); }
    if (!key) return;
    const track = this.manifest?.music?.tracks?.[key] || FALLBACK_MANIFEST.music.tracks[key];
    const audio = this.#makeAudio(track?.file, this.mix.music, track?.loop === true);
    if (!audio) return;
    this.music = audio;
    this.#play(audio);
  }

  #cooldown(key, ms) {
    const current = this.now();
    const previous = Number(this.cooldowns.get(key) || 0);
    if (!cooldownReady({ lastPlayedAt: previous, nowMs: current, cooldownMs: ms })) return false;
    this.cooldowns.set(key, current);
    return true;
  }

  playSfx(name) {
    const file = this.manifest?.sfx?.events?.[name] || FALLBACK_MANIFEST.sfx.events[name];
    if (!file) return;
    const cd = this.manifest?.sfx?.cooldownsMs || FALLBACK_MANIFEST.sfx.cooldownsMs;
    const ms = ['rankUp', 'rankDown', 'overtake'].includes(name) ? Number(cd.rankMovement || 900)
      : name === 'leaderboardShuffle' ? Number(cd.leaderboardShuffle || 1200)
        : name === 'newLeaderBurst' ? Number(cd.newLeader || 2000) : 0;
    if (ms && !this.#cooldown(`sfx:${name}`, ms)) return;
    this.#play(this.#makeAudio(file, this.mix.effects));
  }

  announce(name) {
    const file = ANNOUNCER_FILES[name];
    if (!file || !this.#cooldown(`voice:${name}`, Number(this.manifest?.announcer?.announcementCooldownMs) || 1500)) return;
    const folder = String(this.manifest?.announcer?.folder || 'announcer_dark_arena').replace(/\/+$/, '');
    const audio = this.#makeAudio(`${folder}/${file}`, this.mix.announcer);
    if (!audio) return;
    if (this.music && this.manifest?.mixing?.duckMusicDuringAnnouncer !== false) {
      this.music.volume = this.mix.muted ? 0 : Math.min(this.mix.music, clamp01(this.manifest?.announcer?.musicDuckTo, 0.1));
      const restore = () => { if (this.music) this.music.volume = this.mix.muted ? 0 : this.mix.music; };
      audio.addEventListener?.('ended', restore, { once: true });
      globalThis?.clearTimeout?.(this.duckTimer);
      this.duckTimer = globalThis?.setTimeout?.(restore, 5000);
    }
    this.#play(audio);
  }

  sync({ room = null, leaderboard = [], remainingMs = null, nowMs = this.now() } = {}) {
    if (!room) return;
    this.switchMusic(challengeMusicState(room));
    const previousRoom = this.previous?.room || null;
    const previousBoard = this.previous?.leaderboard || [];
    const roundChanged = Number(previousRoom?.currentRound) !== Number(room.currentRound);
    if (room.status === 'running' && (previousRoom?.status !== 'running' || roundChanged)) {
      this.playSfx('roundStart');
      const scheduled = Math.max(0, Number(room.scheduledRoundCount ?? room.roundCount) || 0);
      if (scheduled && Number(room.currentRound) === scheduled - 1) { this.playSfx('finalRoundAlarm'); this.announce('finalRound'); }
      else if (Number(room.currentRound) > 0) this.announce('nextQuestion');
    }
    if (room.status === 'finished' && previousRoom?.status !== 'finished') { this.playSfx('victorySparkle'); this.announce('complete'); }

    const leaderKey = leaderboard?.[0]?.playerKey || leaderboard?.[0]?.alias || null;
    this.leaderHold = nextLeaderHoldState(this.leaderHold, leaderKey, nowMs, Number(this.manifest?.announcer?.newLeaderHoldMs) || 2000);
    if (this.leaderHold.announce && previousBoard.length) {
      const stinger = this.manifest?.music?.tracks?.newLeader || FALLBACK_MANIFEST.music.tracks.newLeader;
      this.#play(this.#makeAudio(stinger?.file, this.mix.effects));
      this.playSfx('newLeaderBurst'); this.announce('newLeader');
    }

    if (leaderboard.length && previousBoard.length) {
      const previousRanks = new Map(previousBoard.map((row) => [row.playerKey || row.alias, Number(row.rank)]));
      let up = false; let down = false;
      leaderboard.forEach((row) => {
        const prior = previousRanks.get(row.playerKey || row.alias);
        if (!prior) return;
        if (Number(row.rank) < prior) up = true;
        if (Number(row.rank) > prior) down = true;
      });
      if (up) this.playSfx('rankUp'); else if (down) this.playSfx('rankDown');
      const bestStreak = Math.max(0, ...leaderboard.map((row) => Number(row.streak) || 0));
      const oldStreak = Math.max(0, ...previousBoard.map((row) => Number(row.streak) || 0));
      if (bestStreak >= 3 && bestStreak > oldStreak) { this.playSfx('streak'); this.announce('hotStreak'); }
      if (leaderboard.length > 1 && Number(leaderboard[0]?.liveScore ?? leaderboard[0]?.score) === Number(leaderboard[1]?.liveScore ?? leaderboard[1]?.score)) this.playSfx('tie');
    }

    if (room.status === 'running' && Number.isFinite(Number(remainingMs))) {
      const second = Math.max(0, Math.ceil(Number(remainingMs) / 1000));
      if (second !== this.lastCountdownSecond) {
        if (second > 0 && second <= 3) this.playSfx('countdownTick');
        if (second === 0 && this.lastCountdownSecond === 1) this.playSfx('countdownGo');
        this.lastCountdownSecond = second;
      }
    } else this.lastCountdownSecond = null;

    this.previous = { room: { status: room.status, currentRound: room.currentRound }, leaderboard: leaderboard.map((row) => ({ ...row })) };
  }

  dispose() {
    globalThis?.clearTimeout?.(this.duckTimer);
    this.music?.pause?.();
    this.transient.forEach((audio) => audio.pause?.());
    this.transient.clear(); this.music = null; this.previous = null; this.primed = false;
  }
}

export default LiveChallengeAudioDirector;
