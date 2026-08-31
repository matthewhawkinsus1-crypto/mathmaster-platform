# MathMaster Current Roadmap — 2026-08-30

## Current release state

- PR #87 merged to main at `d3b0e9828736a1c172b539e51f1922b57f747b0a`.
- Combined Algebra/Path + current main/ASVAB candidate passed Full Platform Test Suite run `33347293616` at `0c9fafdc15fdc3794398013fc9bcd0cbbeac0a66`.
- Final checkpoint after that green run was documentation-only.
- Algebra I / Algebra II core TEKS Fidelity V2, Challenge/Extension, independent DOK/difficulty, five-family no-repeat behavior, solution review, Path navigation/recovery, secure grading, release authority, and shipping-seed parity are locked green.

Do not reopen those areas unless a named regression fails.

## Active remaining work

### 1. Production deployment and live-bank activation

Deploy the newly merged main release:
- Firebase Functions / callable runtime;
- Firestore rules;
- Firebase Hosting/web runtime.

Then perform the required one-time live content activation:
- refresh/initialize the built-in course Path bank using the certified shipping seeds;
- use the coordinated CCMR release procedure for release-managed Digital SAT / ACT / TSIA2 content rather than the generic importer;
- preserve the merged ASVAB release.

Run live smoke checks with:
- a student Path session;
- Teacher Path Simulator;
- completion/re-entry;
- a Challenge/Extension session;
- a CCMR direct/challenge session;
- root-admin content coverage/release status.

### 2. Remaining TEKS Fidelity V2 banks

Algebra I and Algebra II are complete.

Still not given the same per-standard Fidelity V2 treatment:
- Grade 8: 23 standards;
- Grade 7: 4 standards;
- Grade 6: 2 standards.

Total remaining course-standard fidelity sweep: 29 standards.

Use the same KEEP / ENHANCE / REBUILD method, secure self-grading, representation fidelity, DOK/difficulty separation, five-family coverage, and course-level lock gates.

### 3. CCMR parity / final content-quality sweep

Digital SAT / ACT / TSIA2 already have the V2.1 release architecture and dedicated authoring/release audits.
ASVAB received the intensive rebuild and is merged.

Still planned:
- one final cross-framework parity review so SAT / ACT / TSIA2 are judged against the same high qualitative bar now used for ASVAB and Algebra V2;
- confirm Path issuability, secure grading, framework-specific format fidelity, Challenge progression, calculator rules, and release counts together;
- do not clone mathematical prompts across frameworks merely to reach inventory counts.

### 4. Student My Math Path topic / goal architecture

Already complete and locked:
- clickable TEKS/CCMR alignment context on instructional questions;
- clear CCMR session identity;
- Challenge/advanced completion states;
- Back/resume/completed-session recovery;
- five-family no-repeat safety;
- teacher-simulator/live-student parity for the certified journey.

Still planned:
- make available TEKS and CCMR work visually discoverable at topic/path selection rather than hidden behind recommendation behavior;
- define and display weekly goals / weekly skill expectations;
- clarify what one unit of weekly Path credit means;
- support topic goals with due dates and grade contribution;
- show why a topic is recommended;
- make required curriculum vs CCMR transfer/enrichment visually distinct;
- ensure mastery suppresses narrow repetition and recency/prerequisites diversify recommendations;
- define controlled access to Grade 6–8 prerequisite standards for struggling Algebra students;
- teacher-facing learner bands (below/on/above or equivalent) and corresponding adaptive targets;
- honors/high-performing students receive more appropriate CCMR and higher-demand work without hiding core TEKS mastery.

### 5. Assignment V5 live-student QA / polish

The V5 foundation, secure grading contracts, Honors authentic-CCMR authoring rule, and assignment regression suite are implemented.

Still planned as a focused QA/polish pass rather than another schema rebuild:
- assignment score/progress visibility for students;
- verify assignment evidence affects Path only when alignment/evidence quality warrants it;
- multi-part question continuity, especially sequence table -> plotted points -> equation workflows;
- alignment/CCMR controls remain visible in the student task area;
- three-dot assignment menu positioning;
- mobile tool panels/keyboards/parentheses and graph/tool ergonomics;
- final review of wrong-answer grading edge cases discovered during live use.

### 6. Release smoke test and stabilization

After deployment:
- test real student account creation/roster flows;
- verify gradebook sorting and teacher-of-record behavior;
- verify assignment launch/submission/score;
- verify Path/CCMR launch and evidence;
- verify Google Classroom-linked workflows that are currently enabled;
- fix only reproducible post-deploy regressions before beginning the next large content sweep.

## Recommended order

1. Deploy merged main + activate live banks + smoke test.
2. Grade 8 Fidelity V2.
3. Grade 7 Fidelity V2.
4. Grade 6 Fidelity V2.
5. Final SAT / ACT / TSIA2 qualitative parity sweep alongside merged ASVAB.
6. My Math Path topic / weekly-goal architecture.
7. Assignment V5 live-student QA/polish.
8. Final production stabilization.

## Resume rule

Future chats should read this file first, then the relevant detailed checkpoint.
Do not restart Algebra I/II fidelity, Challenge/DOK/difficulty, or the certified Path recovery work unless a named regression fails.
