# Live Challenge Option B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved integrated Live Challenge upgrade: configurable accuracy-first speed influence, optional public player names, Dark Arena host audio, an official question-library import surface, and safe Warm-Up delivery choices.

**Architecture:** Keep the existing Live Challenge callables, secure Path bank, grader, comeback rules, and second-chance rules intact. Add a thin `functions/entry.js` experience layer that re-exports the existing backend and adds one teacher configuration callable plus one idempotent score-adjustment trigger; keep presentation/audio/question import logic in focused client modules and extend the existing pure Warm-Up routing contract.

**Tech Stack:** React 19, Firebase Functions v2 / Firestore, Node test runner, existing MathMaster shared ESM rules, browser `Audio`, existing `seedPathQuestionBank` service.

**Spec:** `docs/superpowers/designs/2026-09-05-live-challenge-option-b.md`

## Global Constraints

- Correctness base stays 1,000 points and remains dominant over speed.
- Standard speed influence is 20%; presets are 0%, 10%, 20%, 35%; custom is clamped to 0–50%.
- Second-chance rounds never gain speed points.
- Existing comeback and recovery scoring remain unchanged.
- Challenge points never enter assignment grades; Warm-Up credit remains participation + accuracy.
- Code names are the default public identity mode.
- Global audio is teacher/projector only; defaults are music 24%, announcer 82%, effects 62%.
- New leader audio requires about a 2,000 ms stable hold.
- Live Challenge question ingestion must reuse `seedPathQuestionBank`; do not create a second question bank.
- Existing assignments with no new delivery fields retain current Live Challenge behavior.
- No production deployment from the feature branch.

---

### Task 1: Lock the experience contract with failing tests

**Files:**
- Create: `tests/platform/liveChallengeExperience.test.mjs`
- Create: `tests/platform/liveChallengeOptionBWiring.test.mjs`
- Modify: `tests/platform/liveChallenge.test.mjs`
- Modify: `tests/platform/warmupChallenge.test.mjs` if present; otherwise create `tests/platform/warmupChallengeOptionB.test.mjs`

**Interfaces:**
- Produces the executable contract for `normalizeSpeedInfluencePercent`, `speedBonusCapForPercent`, `displayAliasForStudent`, `experienceScoreAdjustment`, `normalizePlayerDisplayMode`, and extended Warm-Up routing.

- [ ] **Step 1: Write failing pure tests**

Add tests proving:

```js
assert.equal(normalizeSpeedInfluencePercent(undefined), 20);
assert.equal(normalizeSpeedInfluencePercent(-5), 0);
assert.equal(normalizeSpeedInfluencePercent(80), 50);
assert.equal(speedBonusCapForPercent(20), 200);
assert.equal(speedBonusCapForPercent(35), 350);
```

Add score-adjustment tests where an existing fully-correct ordinary response earned 100 original speed points:

```js
assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 20, secondChance: false }), 100);
assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 0, secondChance: false }), -100);
assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 35, secondChance: false }), 250);
assert.equal(experienceScoreAdjustment({ originalSpeedBonus: 100, speedInfluencePercent: 35, secondChance: true }), 0);
```

Add display-name tests for code name, first name, first+last initial, full name, legacy display-name fallback, and missing-name fallback.

- [ ] **Step 2: Write failing Warm-Up tests**

Assert:

```js
standard -> NONE
teacherChoice + null + active -> WAITING_FOR_TEACHER
teacherChoice + standard + active -> NONE
teacherChoice + challenge + active + running room -> PLAY
liveChallenge + active + no room -> WAITING_FOR_TEACHER
legacy enabled=true with no deliveryMode -> existing WAITING/PLAY behavior
```

- [ ] **Step 3: Write failing source-wiring tests**

Read source and require:

```text
functions/package.json main === entry.js
entry.js re-exports index.js and exports configureLiveChallengeExperience + adjustLiveChallengeExperienceScore
LiveChallengeTeacher imports LiveChallengeAudioDirector and ChallengeQuestionLibrary
LiveChallengeTeacher exposes speed influence, player display, and scoring preview controls
ChallengeQuestionLibrary imports seedPathQuestionBank
WarmupChallengeGate has an overlay/focus presentation for waiting routes
```

- [ ] **Step 4: Commit only tests/docs**

```bash
git add tests docs/superpowers

git commit -m "test: define Live Challenge Option B contract"
```

CI expectation: focused Option B tests fail because the new modules/exports do not exist yet.

---

### Task 2: Implement pure experience and Warm-Up rules

**Files:**
- Create: `functions/shared/liveChallengeExperience.mjs`
- Modify: `functions/shared/warmupChallenge.mjs`
- Test: `tests/platform/liveChallengeExperience.test.mjs`
- Test: `tests/platform/warmupChallengeOptionB.test.mjs`

**Interfaces:**
- Produces:
  - `normalizeSpeedInfluencePercent(value): number`
  - `speedBonusCapForPercent(percent): number`
  - `normalizePlayerDisplayMode(value): string`
  - `displayAliasForStudent({ student, mode, codeAlias }): string`
  - `experienceScoreAdjustment({ originalSpeedBonus, speedInfluencePercent, secondChance }): number`
  - extended `normalizeWarmupChallengeConfig(assignment)` returning `deliveryMode` and `teacherDecision`.

- [ ] **Step 1: Run the focused tests and confirm RED**

```bash
node --test tests/platform/liveChallengeExperience.test.mjs tests/platform/warmupChallengeOptionB.test.mjs
```

Expected: module/export assertions fail.

- [ ] **Step 2: Implement the minimal pure experience module**

Use no Firebase imports. Name extraction recognizes `firstName`, `lastName`, `displayName`, `name`, `googleName`, and equivalent `profile` fields. `firstLastInitial` returns `First L.` when a last name exists and degrades to first name/code alias safely.

- [ ] **Step 3: Extend Warm-Up normalization/routing**

Legacy `enabled: true` with no `deliveryMode` normalizes to `liveChallenge`. `standard` and teacher-choice-standard return `NONE`; teacher-choice-pending returns `WAITING_FOR_TEACHER` only while the Warm-Up is active.

- [ ] **Step 4: Run focused tests and confirm GREEN**

```bash
node --test tests/platform/liveChallengeExperience.test.mjs tests/platform/warmupChallengeOptionB.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add functions/shared tests/platform

git commit -m "feat: add Live Challenge experience and Warm-Up rules"
```

---

### Task 3: Add the Functions experience entry point

**Files:**
- Create: `functions/entry.js`
- Modify: `functions/package.json`
- Test: `tests/platform/liveChallengeOptionBWiring.test.mjs`
- Create: `tests/integration/liveChallengeExperience.test.mjs`

**Interfaces:**
- Consumes pure helpers from `functions/shared/liveChallengeExperience.mjs`.
- Produces callable `configureLiveChallengeExperience`.
- Produces callable `getLiveChallengeExperience`.
- Produces Firestore trigger `adjustLiveChallengeExperienceScore` on `liveChallengePrivate/{roomId}/players/{studentId}`.
- Re-exports every existing export from `functions/index.js` unchanged.

- [ ] **Step 1: Confirm wiring test is RED**

```bash
node --test tests/platform/liveChallengeOptionBWiring.test.mjs
```

- [ ] **Step 2: Change `functions/package.json` main to `entry.js`**

Only the main field changes; engines/dependencies stay untouched.

- [ ] **Step 3: Implement entry re-export and authorization**

`entry.js`:

```js
const base = require('./index.js');
Object.assign(exports, base);
```

Then add the new exports. The configuration callable must require a verified teacher token and verify `liveChallengeRooms/{roomId}.teacherEmail` equals the caller email before writing `liveChallengeExperience/{roomId}`.

- [ ] **Step 4: Configure aliases safely**

Load private player docs, fetch each `grades/{studentId}` record, preserve `codeAlias`, and batch-update private alias + invite alias. Update a public player document only if it already exists; never create an unjoined public player as a side effect.

- [ ] **Step 5: Implement idempotent speed adjustment trigger**

Only react when `answeredRound` changes to a new non-negative round. Skip second-chance rounds by reading `liveChallengePrivate/{roomId}.secondChanceOf`. For a fully correct ordinary response derive:

```js
basePoints = 1000
streakBonus = min(100, max(0, after.streak - 1) * 25)
comebackBonus = before.lastAnswerCorrect === false ? 150 : 0
originalSpeedBonus = max(0, scoreDelta - basePoints - streakBonus - comebackBonus)
adjustment = experienceScoreAdjustment(...)
```

Default a missing room config to 20% / code names. In a transaction, verify `experienceSpeedAdjustedRound !== answeredRound`, adjust the private score, mark the round, and adjust the matching public player score when that row exists.

- [ ] **Step 6: Add emulator integration coverage**

Verify:

- teacher may configure only their room;
- code-name config remains anonymous;
- first-name/full-name config rewrites alias from a seeded grade record;
- a 20% room adds exactly one extra copy of the original 100-point max speed bonus;
- trigger retry does not double-adjust;
- second-chance update is unchanged.

- [ ] **Step 7: Run focused + integration checks**

```bash
node --test tests/platform/liveChallengeOptionBWiring.test.mjs
npm run test:challenge-finish
```

- [ ] **Step 8: Commit**

```bash
git add functions tests

git commit -m "feat: add Live Challenge experience backend"
```

---

### Task 4: Add the Dark Arena audio director

**Files:**
- Create: `src/platform/liveChallenge/liveChallengeAudio.js`
- Create: `tests/platform/liveChallengeAudio.test.mjs`
- Modify: `tests/platform/liveChallengeOptionBWiring.test.mjs`

**Interfaces:**
- Produces `LiveChallengeAudioDirector` with `prime()`, `setMix()`, `sync()`, `dispose()`.
- Produces pure helper `deriveChallengeAudioEvents(previous, next)` for deterministic tests.

- [ ] **Step 1: Write/confirm RED audio tests**

Assert state transitions choose lobby/round/final/victory tracks, new leader requires a stable hold, and cooldown state suppresses repeated leaderboard effects.

- [ ] **Step 2: Implement the director**

Use `/audio/live-challenge/v6/live-challenge-audio-manifest-v6.json`, crossfade 650 ms, duck music to 10% during announcements, and persist mix under `mathmaster.liveChallenge.audio.v6`.

- [ ] **Step 3: Run focused test**

```bash
node --test tests/platform/liveChallengeAudio.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/platform/liveChallenge tests/platform

git commit -m "feat: wire Dark Arena Live Challenge audio"
```

---

### Task 5: Add the official Challenge Question Library

**Files:**
- Create: `src/components/liveChallenge/ChallengeQuestionLibrary.jsx`
- Create: `src/platform/liveChallenge/challengeQuestionImport.js`
- Create: `tests/platform/liveChallengeQuestionLibrary.test.mjs`
- Modify: `src/components/liveChallenge/LiveChallengeTeacher.jsx`

**Interfaces:**
- `normalizeChallengeQuestionPackage(value): array`
- UI calls existing `seedPathQuestionBank(items, { onProgress })`.

- [ ] **Step 1: Write/confirm RED package-normalization tests**

Accept raw arrays and objects with `documents`, `items`, or `questions`; reject non-array/non-object payloads and empty packages with a clear result.

- [ ] **Step 2: Implement pure package normalizer**

Do not validate answers or correctness client-side; normalization only finds the documents. Server remains authoritative.

- [ ] **Step 3: Implement library UI**

Provide:

- Upload JSON file input;
- import-from-assignment selector using the teacher's `assignments` prop and canonical question arrays already present on those records;
- advanced paste/create JSON editor;
- progress state and accepted/rejected summary grouped by server reason.

No fake Generate button.

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/platform/liveChallengeQuestionLibrary.test.mjs tests/platform/liveChallengeOptionBWiring.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add src/components/liveChallenge src/platform/liveChallenge tests/platform

git commit -m "feat: add Live Challenge question library"
```

---

### Task 6: Integrate scoring/player settings and Warm-Up delivery into Teacher + Dry Run

**Files:**
- Modify: `src/components/liveChallenge/LiveChallengeTeacher.jsx`
- Modify: `src/components/liveChallenge/ChallengeDryRun.jsx`
- Modify: `src/platform/liveChallenge/liveChallengeService.js`
- Modify: `src/components/liveChallenge/WarmupChallengeGate.jsx`
- Test: `tests/platform/liveChallengeOptionBWiring.test.mjs`

**Interfaces:**
- Service adds `configureLiveChallengeExperience` and `getLiveChallengeExperience` callables.
- Teacher create flow sends the existing room request, then immediately configures room experience before the lobby is considered ready.

- [ ] **Step 1: Confirm wiring test is RED**

- [ ] **Step 2: Add create-panel settings**

Player display select and speed influence select/custom input. Show the scoring preview card before lobby creation. The copy explicitly separates game score from academic Warm-Up credit.

- [ ] **Step 3: Configure the created room**

After `createLiveChallenge` returns `roomId`, call `configureLiveChallengeExperience({ roomId, speedInfluencePercent, playerDisplayMode })`. Surface configuration failure and do not silently claim the selected settings are active.

- [ ] **Step 4: Add Warm-Up delivery controls**

When a Warm-Up assignment is selected, show delivery mode. Persist `warmup.liveChallenge.deliveryMode` / `teacherDecision` directly to the teacher-writable assignment document. `Use Standard Warm-Up` writes teacher-choice + standard and does not create a room. Creating a linked room writes the challenge decision.

- [ ] **Step 5: Add Dry Run scoring explanation**

Dry Run remains unrecorded, but the controls show the same selected speed influence and examples. Do not fabricate a speed score in the dry-run grader because its timer is client-only; explain the projected game values instead.

- [ ] **Step 6: Make waiting state focused**

`WarmupChallengeGate` waiting mode renders a fixed/focus overlay with distinct copy for `teacher_choice_pending` versus `no_room_yet`. It must not create a student escape into standard work while the teacher is still deciding.

- [ ] **Step 7: Run focused tests**

```bash
node --test tests/platform/liveChallengeOptionBWiring.test.mjs tests/platform/warmupChallengeOptionB.test.mjs
```

- [ ] **Step 8: Commit**

```bash
git add src functions/shared tests/platform

git commit -m "feat: integrate Live Challenge teacher experience"
```

---

### Task 7: Wire host audio to the real room/leaderboard

**Files:**
- Modify: `src/components/liveChallenge/LiveChallengeTeacher.jsx`
- Modify: `src/components/liveChallenge/ChallengeDryRun.jsx` only if host rehearsal should demonstrate audio without recording state.
- Test: `tests/platform/liveChallengeAudio.test.mjs`

**Interfaces:**
- Teacher component owns one `LiveChallengeAudioDirector` instance.

- [ ] **Step 1: Prime audio only on a teacher gesture**

Create Lobby / Start Challenge / explicit audio enable may call `prime()`. Do not autoplay from component mount.

- [ ] **Step 2: Sync room and leaderboard state**

Feed status, current round, scheduled round count, remaining time, and public leaderboard to the director. Keep global effects out of `LiveChallengeStudent.jsx`.

- [ ] **Step 3: Add compact mixer UI**

Music/Announcer/Effects sliders + Mute All, persisted locally.

- [ ] **Step 4: Verify tests**

```bash
node --test tests/platform/liveChallengeAudio.test.mjs tests/platform/liveChallengeOptionBWiring.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add src tests/platform

git commit -m "feat: activate Live Challenge host audio"
```

---

### Task 8: Full verification and PR readiness

**Files:**
- No new production behavior unless verification finds a defect.

- [ ] **Step 1: Focused Live Challenge tests**

```bash
npm run test:live-challenge
node --test tests/platform/liveChallengeExperience.test.mjs tests/platform/liveChallengeAudio.test.mjs tests/platform/liveChallengeQuestionLibrary.test.mjs tests/platform/liveChallengeOptionBWiring.test.mjs tests/platform/warmupChallengeOptionB.test.mjs
```

- [ ] **Step 2: Lint/build**

```bash
npm run lint
npm run build
npm run build:firebase
```

- [ ] **Step 3: Functions load check**

```bash
node -e "const f=require('./functions/entry.js'); if(!f.createLiveChallenge||!f.configureLiveChallengeExperience||!f.adjustLiveChallengeExperienceScore) process.exit(1); console.log(Object.keys(f).length)"
```

- [ ] **Step 4: Emulator challenge suite**

```bash
npm run test:challenge-finish
```

- [ ] **Step 5: Inspect diff for security/privacy regressions**

Confirm no public payload adds `studentId`, expected answers, accepted answers, grading keys, or roster records.

- [ ] **Step 6: Commit any verification-only corrections and open PR**

PR summary must state that `functions/package.json` now enters through `entry.js`, list the two new Functions exports, and state that deployment requires Functions + Hosting after merge.