# MathMaster Live Challenge — Initial Production Implementation

Date: 2026-08-13

## What this version is

Live Challenge is a synchronous, teacher-led class competition built on top of MathMaster's existing secure My Math Path question bank and server graders. It is intentionally not a separate game question system.

The teacher opens **Live Challenge** from the Teach section of the sidebar, chooses a class, course, skill set, number of rounds, and time per round, then creates a lobby. Every student assigned to that teacher/class gets a per-student invitation automatically. No join code and no second identity are required.

Students see the invitation on their dashboard. If a challenge begins while a student is inside an assignment, a prominent **Live Challenge has started** banner appears and lets the student switch to the game without losing assignment work.

## Teacher flow

1. Open **Live Challenge**.
2. Choose the class period.
3. Choose Algebra I or Algebra II. The configured class course is the default.
4. Choose either:
   - **Mixed review**, or
   - a Path-covered TEKS skill that MathMaster has already confirmed is student-ready.
5. Choose 5–20 rounds and 20–90 seconds per round from the UI presets.
6. Create the lobby.
7. Students join from their existing MathMaster accounts.
8. Start Round 1 after at least one student joins.
9. The next-round button becomes available after every joined student has answered or the timer expires.
10. The final round advances directly to final standings.

There is also a **Projector View** for a classroom display.

## Student flow

- Student receives the invitation automatically from their class roster membership.
- Opening the game joins the lobby automatically.
- Each student receives an anonymous game alias such as `Vector Falcon 24`.
- When a round opens, the student receives the sanitized Path question payload.
- If the question has a supported MathMaster interactive tool, the real tool is used.
- Otherwise, legacy secure Path questions render as response fields.
- Only one answer is accepted per round.
- Students see points, their current rank, and the top five leaderboard.
- When the timer expires, the round locks.
- Final standings are shown when the teacher finishes the challenge.

## Scoring

The scoring system is deliberately accuracy-first:

- Up to **1,000 points** for mathematical correctness.
- Up to **100 points** for speed.
- Up to **100 points** for a correct-answer streak.
- Multipart tools can earn proportional base credit from the secure server grader.
- Speed and streak bonuses are awarded only for fully correct work.

A fully correct slow answer therefore beats an 80%-correct fast answer. The game is not designed to reward guessing.

## Security model

Answer keys never go into the public room document.

`liveChallengeRooms/{roomId}` contains only shared public game state: the sanitized current question, round number, status, and timer. The teacher is the only actor that changes this shared document during play.

`liveChallengeRooms/{roomId}/players/{playerKey}` contains one **anonymous public player document per joined student**: game alias, points, streak, correct count, rounds answered, and the last round answered. The leaderboard is derived live from these documents in the browser. No student name or student ID is stored there.

`liveChallengePrivate/{roomId}` is server-only and stores the selected secure question IDs and shared private round state. Identity-bearing player records live separately at `liveChallengePrivate/{roomId}/players/{studentId}` and are also server-only.

`liveChallengeInvites/{studentId}` is readable only by that student. It points the student to their active room and carries their anonymous alias plus an opaque player key.

`liveChallengeTeacherActive/{teacherEmail}` is a tiny server-owned pointer used only so the teacher can refresh the page and recover the current lobby/game without querying historical rooms.

Students cannot directly write any Live Challenge collection. Joining, starting, advancing, grading, scoring, finishing, and cancelling all go through Cloud Functions.

When a challenge finishes or is cancelled, MathMaster updates the final public room/invites and then removes the server-only question list and identity-bearing private player documents. Final public standings remain anonymous.

### Simultaneous-class-write design

The leaderboard is intentionally **not** stored as one array on the room document. If 25–35 students answered at nearly the same moment, that design would make every response fight to update the same Firestore document. In this version, each answer updates only that student's private player document and matching anonymous public player document. Students therefore do not contend with one another for a shared score document; the teacher/student screens combine the public player snapshots into the ranked leaderboard locally.

## Why this does not significantly bloat normal MathMaster use

The two large game interfaces are loaded through `React.lazy()`. Students completing normal assignments and teachers using the ordinary dashboard do not download the Live Challenge teacher/player interface as part of the initial React chunk.

The game also reuses:

- the secure Path question bank;
- Path Tool Contracts;
- the existing server grading engine;
- the existing QuestionEngine and interactive tools;
- existing Firebase authentication and class rosters.

There is no second bank, duplicate graphing engine, duplicate algebra grader, or Blooket-style inventory/economy subsystem in this version.

## Deliberate first-version boundaries

This first implementation is **solo competition**. It does not yet include team mode, power-ups, collectibles, coins, shops, or random sabotage mechanics.

Live Challenge scores are **practice-game feedback only**. They do not write assignment grades or mastery evidence yet. That is intentional: before game evidence changes a mastery profile, we should decide whether competition/timing should receive a lower evidence weight and how accommodations affect timed rounds.

The question source is the secure Path bank, not arbitrary assignment questions. This guarantees that every issued question can be securely graded and that answer data is not shipped to the browser. A later assignment-section source can be added by passing assignment questions through the same Path promotion/issuability gate.

## Recommended next additions

1. **Team mode** — server assigns balanced teams; public leaderboard shows teams while the teacher can still inspect individual participation.
2. **Teacher question preview/skip** — let the teacher preview the next sanitized prompt and skip a bad-fit item before opening the round.
3. **Round review** — after the timer, optionally show the correct method/solution on the projector only after submissions are locked.
4. **Evidence toggle** — optional low-weight practice evidence with an explicit game-context tag; off by default until policy is settled.
5. **Assignment/section source** — choose Classwork or Practice and use only questions that pass the secure server-grading gate.
6. **Non-sabotage power-ups** — later, if desired, use self-focused mechanics (double streak protection, extra thinking time) rather than mechanics that harm another student's score.

## Deployment requirement

This update changes **frontend code, Cloud Functions, and Firestore rules**.

If your website deploys from GitHub/Vercel, commit/push the project as usual for the frontend, then separately deploy Firebase backend changes:

```bash
firebase deploy --only functions,firestore:rules
```

If Firebase Hosting serves the frontend too, deploy all three:

```bash
firebase deploy --only functions,firestore:rules,hosting
```

No data migration and no new Firestore composite index are required by this implementation.

## Validation performed here

- All 272 source JS/JSX/MJS files were parsed with TypeScript's JSX parser with zero syntax failures.
- `functions/index.js`, the Live Challenge service, and the shared Live Challenge rules pass Node syntax checking.
- Five focused Live Challenge logic tests pass: configuration bounds, TEKS normalization, accuracy-first scoring, bonus caps, and anonymous leaderboard behavior.
- Twenty Algebra I starter-bank questions were run through the same `buildIssuePlan` used in production; all 20 were issuable, their public payloads were checked for answer-key leakage, and a sample correct response was graded correctly by the server grading code.
- The player-state model was refactored to one public/private player document per student so simultaneous responses do not write a shared leaderboard/room document.
- A complete Vite build could not be run because this environment does not have the project's npm dependencies installed; `npm ci --offline` stopped on an uncached `zip-stream` package.
