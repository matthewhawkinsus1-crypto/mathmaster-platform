# Live Challenge Option B — Integrated Experience Design

## Goal

Turn Live Challenge into a coherent classroom game system rather than a worksheet-shaped feature with separate add-ons. The upgrade keeps the existing secure My Math Path bank/grader and the existing comeback/second-chance mechanics, while adding game audio, transparent competition scoring, teacher-selectable player names, an official question-library entry point, and safe Warm-Up delivery choices.

## Non-negotiable boundaries

- Correctness remains dominant. Speed must never make an incorrect/partial response outrank a fully correct response on the same ordinary round.
- Challenge points never become report-card points. Warm-Up challenge credit remains participation + mathematical accuracy only.
- Student-facing payloads must not gain expected answers, accepted answers, correctness flags, roster IDs, or private grading material.
- The secure Path bank remains the question source of truth. Live Challenge may provide a friendlier import surface, but it must reuse `seedPathQuestionBank` and the server-side `buildIssuePlan` validation path rather than create a second bank.
- Existing comeback and second-chance rules remain intact.
- Global music/announcer/leaderboard effects play from the teacher/projector only. Student devices stay silent by default.
- Code names remain the default public identity mode.
- Existing assignments without the new Warm-Up fields keep their current behavior.

## 1. Competition scoring

### Room experience setting

Each room may have a `speedInfluencePercent` setting. Presets:

- Off: 0
- Low: 10
- Standard: 20 (default)
- High: 35
- Custom: teacher-entered 0–50

The percentage describes the maximum speed bonus relative to the 1,000-point correctness base. A Standard room therefore has a maximum 200-point speed bonus.

The mature server grader still owns the mathematical decision and still computes its existing 100-point (10%) speed component. Option B does **not** create a second grader. The exported submit transport calls that mature handler first, then an experience-layer helper scales only the known speed component to the room setting before the callable returns. This is necessary because the student result panel immediately displays `speedBonus`, `pointsAwarded`, and `totalScore`; a trigger-only adjustment would make the screen briefly disagree with the leaderboard and with the teacher preview.

The score adjustment and the public/private leaderboard update use one idempotent primitive. It writes `experienceSpeedAdjustedRound` and `experienceSpeedAdjustment`, so a retry cannot pay the bonus twice. A Firestore write trigger calls that same primitive as a fallback repair path if the synchronous adjustment had a transient failure. Second-chance rounds receive no speed adjustment.

If the mathematical submission has already been safely recorded but the experience adjustment fails, the callable returns the recorded grader result rather than turning a correct answer into a visible submission error; the trigger can repair the competition bonus afterward.

### Teacher preview

Before lobby creation and in Dry Run, show a scoring card using the selected round length. For Standard 20%, a 20-second round should explain examples such as:

- immediate correct response: up to 1,200 base+speed before streak/comeback;
- halfway correct response: about 1,100;
- time-expired correct response: 1,000.

The card must explicitly say speed/streak/rank do not enter the assignment grade.

## 2. Player display names

Room modes:

- `codeName` (default)
- `firstLastInitial`
- `firstName`
- `fullName`

After a teacher creates a room, a teacher-only callable stores the room experience config and rewrites the already-created private player aliases/invites from the roster. If a public player row already exists, it is updated too. The original generated code name is preserved as `codeAlias` so switching back to code names is lossless.

The public leaderboard still receives only the chosen display alias; it does not receive student IDs or a roster record.

## 3. Dark Arena audio director

Add one centralized host-side audio director that reads assets under `/audio/live-challenge/v6/`.

State music:

- lobby -> `lobby_neon_grid_loop.wav`
- ordinary running round -> `round_battle_circuit_loop.wav`
- final scheduled round -> `final_round_overdrive_loop.wav`
- finish -> `victory_champion_stinger.wav`

Game-state music transitions crossfade over 650 ms instead of stopping/restarting abruptly. Use Dark Arena Human announcements and the V6 16-bit SFX. The director observes room/leaderboard state and rate-limits noisy events. A new #1 must hold first place for about two seconds before the new-leader stinger/announcement fires.

Teacher controls:

- Music volume (default 24%)
- Announcer volume (default 82%)
- Effects volume (default 62%)
- Mute all

Persist those preferences in local storage on the teacher browser. Audio activation begins only after a teacher gesture so browser autoplay rules are respected.

## 4. Official Live Challenge Question Library

Add a first-class `Question Library` panel on the Live Challenge teacher screen.

Initial supported entry paths:

- Upload JSON
- Import questions from an existing MathMaster assignment
- Paste/create JSON in an advanced editor

All three normalize an array/document package and call the existing `seedPathQuestionBank`. The server dry-run validation remains authoritative and the coverage index is rebuilt by the existing service after a successful import.

The panel reports accepted/rejected counts and rejection reasons. It must not expose answer-bearing bank records after import.

AI generation is intentionally not duplicated in this PR; the library can later route to the existing assignment authoring provider once that provider has a question-bank-specific contract. A disabled fake Generate button is not acceptable.

## 5. Warm-Up delivery

Extend `warmup.liveChallenge` with:

- `deliveryMode`: `liveChallenge` | `teacherChoice` | `standard`
- `teacherDecision`: `challenge` | `standard` | null

Rules:

- `standard`: normal Warm-Up; Live Challenge gate returns NONE.
- `liveChallenge`: existing replacement behavior. During an active Warm-Up window, no room yet means WAITING_FOR_TEACHER; a live room means PLAY; finished/cancelled means CONTINUE.
- `teacherChoice` + no decision: WAITING_FOR_TEACHER with a teacher-choice reason.
- `teacherChoice` + `standard`: normal Warm-Up.
- `teacherChoice` + `challenge`: same behavior as `liveChallenge`.

The delivery selector persists immediately. In particular, choosing `teacherChoice` writes the pending state **before** a lobby exists, so students in the active Warm-Up window really do enter the waiting route. The waiting gate becomes a true focus overlay so students are not simultaneously told to wait for a challenge while continuing the standard Warm-Up underneath. The teacher screen provides `Use Standard Warm-Up` as an explicit fallback; creating the challenge writes `teacherDecision: challenge`.

This first integration keeps the assignment-level decision shape used by the existing Warm-Up link. A later class-scoped decision map can be added when the parent assignment runtime passes class identity into `resolveWarmupChallenge`; this PR must not invent a second client-side class identity source.

## 6. Deployment/runtime seam

Cloud Functions currently export from `functions/index.js`, which is intentionally large and mature. To keep this upgrade isolated, change `functions/package.json` main to `entry.js` and make `entry.js` re-export every existing function from `index.js` plus the new experience callables/trigger and the wrapped Live Challenge submit transport. Existing non-Live-Challenge callable names and behavior remain unchanged.

`entry.js` must load cleanly and preserve all prior exports. Tests must explicitly assert representative legacy exports plus the new exports exist.

## 7. Verification

Required focused checks:

- pure scoring/display/warmup tests;
- 650 ms crossfade and new-leader hold tests;
- entry-point export and synchronous-submit wiring tests;
- source-wiring tests for audio director, teacher controls, question library, and Warm-Up gate;
- existing `npm run test:live-challenge`;
- platform test suite/lint/build through CI;
- functions entry loads with all legacy exports plus the new experience exports;
- emulator integration for room configuration and configured speed-score idempotency.

No production deployment occurs from this branch. Merge/deploy is a separate explicit step after CI is green.