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

**Where §4 stands (read in the code on 2026-10-25, MP10; not driven in a browser).** Most of the list above was built after
this roadmap was written. One item is not.

| §4 item | Status | Where |
| --- | --- | --- |
| TEKS and CCMR work discoverable at selection | Built | Every unit or topic, searchable, opening where the map does: `topicBrowser.js`, `MyMathPathTopicBrowser.jsx`. CCMR has its own tab (`CCMRHub.jsx`), and a skill offers "Practice This Skill As…" the exam formats that have practice for it (`PracticeAsMenu.jsx`). |
| Weekly goals and expectations defined and shown | Built | `weeklyPathGoal.js`; the student's `WeeklyPathGoalPanel.jsx`; the teacher's `WeeklyPathControls.jsx` (sessions a week, due day, who picks, CCMR expectation). |
| What one unit of weekly credit means | Built | One session. The week's grade is 80% completion and 20% quality, with an 80 floor for a finished week (`GRADING_POLICY`); the student sees "Grade so far" and what finishing is worth (`describeWeeklyGradeForStudent`). |
| Topic goals with due dates and grade contribution | **Partly** | The weekly goal has a due day and its grade goes to Google Classroom (`publishWeeklyPathGrades`); a teacher can pin the week's standards ("You select every session", `pinnedSkills`). **Not built: a goal for one topic with its own due date and its own grade.** That needs a data model, a teacher screen, a student screen, a rule for how it combines with the weekly grade, and a Classroom column. It is what is left of §4, and it needs the owner's design decisions first. |
| Why a topic is recommended | Built | `PURPOSE` and `STUDENT_EXPLANATION` (`recommendationV2.js`); each card's reason and evidence. |
| Required curriculum vs CCMR transfer visibly distinct | Built | A purpose chip on every weekly slot, "SAT transfer" and so on (`weeklyPurposeLabel` in `WeeklyPathGoalPanel.jsx`); CCMR work on its own tab. |
| Mastery suppresses repetition; recency and prerequisites diversify | Built | Cooldowns by where a standard stands (mastered 18 days, retained 45: `COOLDOWN_DAYS`) and a set-level optimiser that charges for repeating a strand or representation (`recommendationV2.js`); `tests/platform/recommendationV2.test.mjs`. |
| Controlled access to Grade 6–8 prerequisites | Built; the content is the gap | "Foundation Bridge" slots (at most half a week, built to be crossable) and Strengthen doors, offered only where the bank can issue the practice. The practice behind the 29 reachable standards has not had Fidelity V2: MP04, in `TEKS_FIDELITY_V2_MASTER_CHECKPOINT.md`. |
| Teacher-facing learner bands | Built | Below / On / Above Level (`BAND_LABEL` in `studentLearningProfile.js`), shown by `StudentPerformanceBadge` in the teacher's weekly table, gradebook and roster. |
| Honors and high performers: more CCMR and higher demand, core TEKS kept | Built | Honors default to 5 sessions, and a week keeps both a course Challenge and CCMR transfer when it has room (`weeklyPathPlan.js`; `tests/platform/weeklyPathPlan.test.mjs`, `recommendationV2.test.mjs`). |

### 5. Assignment V5 live-student QA / polish

The V5 foundation, secure grading contracts, Honors authentic-CCMR authoring rule, and assignment regression suite are implemented.

Still planned as a focused QA/polish pass rather than another schema rebuild:
- assignment score/progress visibility for students;
- verify assignment evidence affects Path only when alignment/evidence quality warrants it;
  **Traced and recorded (MP25, 2026-10-25):** the rules are written beside `favourableMasteryBySkill` in
  `src/platform/path/masteryAdapter.js` and pinned by `tests/platform/pathAssignmentEvidence.test.mjs`. Two paths
  moved the Path on evidence that did not warrant it, and are fixed: one assignment question missed on a prerequisite
  locked every skill built on it (evidence the one rule cannot judge now never locks), and work from an assignment
  marked "not for mastery" still moved the server's profile (now skipped there too, from new answers on). Kept as
  decided: one right answer reads Mastered on the 0.9 assignment record.
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


## Deployment readiness update — current main

This section supersedes the earlier pre-deploy release-state wording.

### Current production candidate

- PR #87 is merged.
- Current `main`: `cbe325ba0347e1a8f1f21a59a83e909b499cb317`.
- Full Platform Test Suite run `33348760148`: **PASS**.
- The post-merge release-safety work is included and green:
  - safe refresh of existing course Path banks;
  - independent ASVAB release activation;
  - coordinated SAT / ACT / TSIA2 V2.1 release activation that preserves ASVAB;
  - root-admin production Path activation controls;
  - admin client wiring for those activation operations;
  - Functions-first deployment order before any release-managed bank activation;
  - release/activation regression coverage.

### Deployment status

**Code is clear for deployment.**

Production Firestore Path content is still unchanged until deployment finishes and the root administrator runs the release activation controls.

Use `docs/DEPLOY_FROM_CLOUD_SHELL.md` and:
1. deploy current `main` with `scripts/deploy-v5-preproduction.sh`;
2. in Administration → My Math Path content coverage:
   - Refresh course Path bank;
   - Refresh ASVAB release;
   - Refresh SAT / ACT / TSIA2 release;
3. run the live smoke checks before beginning the next major implementation phase.

### Path / CCMR UI distinction

Already implemented:
- clickable TEKS/CCMR context inside student instructional work;
- explicit CCMR session identity;
- Challenge/advanced completion states;
- Back/resume/completed-session recovery;
- weekly planning that preserves both course Challenge and CCMR transfer for Honors students when capacity allows;
- secure CCMR direct/challenge issuance and release-aware routing.

Still post-deploy planned:
- a visually browsable topic-selection surface where students can deliberately see and choose available TEKS and CCMR work before recommendation;
- weekly goal/credit visualization and due-date/grade-contribution goals;
- clearer curriculum-vs-transfer/enrichment visual separation on the selection surface.

Therefore: **deploy now; do not block this release on the later topic-browser redesign.**
