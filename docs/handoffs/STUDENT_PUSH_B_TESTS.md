# Student push, Job B — real test-taking (2026-10-07)

Branch `claude/student-push-b-tests`, from `main` @ `2453643`.

Goal: tests that work like real tests, full access for every student, and
results that teach. Product decisions 2 (skip / flag / go back) and 3 (worked
solutions once the work is closed — for secure tests, after release) are built
here; the rest of the brief is listed item by item below with its status.

## How a secure test works now

| | Before | Now |
| --- | --- | --- |
| Moving around | strictly linear; "Answer to continue"; no way back | Previous / Next, a question list, skip, flag, go back to any opened question until submit |
| What the server holds | one `currentQuestion` on the session document | every issued item, with its draft, in `examSessions/{id}/items/{instanceId}` (Admin-SDK only); the session keeps a states-only navigator |
| When an answer is graded | the moment it was recorded, then locked | once, on the server, when the session is finalized — student submit, verified timer, or proctor force-submit — for every issued item |
| A blank question | not recorded (and not in Corrections) | recorded `unanswered: true`, worth 0, planned into Corrections like any miss; not mastery evidence |
| Issuing | the next item when the previous one was recorded | still only when the student first reaches it (opening the next unopened question is how a student skips); jumping further ahead is refused |
| Digital SAT practice | one stretch | two modules; leaving module 1 is an explicit step (`closeModule`) and closes it |

`submitSecureExamResponse` (record & lock one item) is kept for a browser still
running the previous build during a deploy; the new client never calls it.
A session written by the old runtime upgrades in place the first time it is
touched: its recorded answers stay locked (`status: 'recorded'`), its open
item moves into the items subcollection with its draft.

The pure rules are in `functions/lib/secureExamNavigation.js`; the item store
and finalize-time grading in `functions/lib/secureExamItems.js`; the
callables in `functions/index.js` (secure-exam region). Contract summary for
the client: see the file headers, and `src/services/secureExamService.js`.

### Safety, and how it is held

- Nothing a navigation, save, flag or finalize call returns carries a verdict,
  key or solution — asserted on every response in
  `tests/integration/secureExamNavigation.test.mjs`.
- The answer key never sits on the session document; it lives with each item
  in the items subcollection, which `firestore.rules` closes to every client
  (rules cases in `tests/rules/securityRules.test.mjs`).
- The correct answer and worked solution (`releasedSolution`, built at
  finalize) reach a browser only through `secureExam.publicReview`, which
  returns null until the session is finished AND released.
- A choice key is shown as its label, never as the runtime choice id.
- The public navigator carries states only (answered / unanswered / recorded,
  flagged, closed) — no slot, family, bank id or domain.

## Practice tests (SAT / ACT / TSIA2 / ASVAB simulations)

- Scored over every planned question (5 right of 44 is 11%, not 100%).
- Proportional time: a shortened test keeps the real pace (10 SAT questions →
  16 minutes, rounded up to the minute; untimed stays untimed).
- A seeded random draw (session id + question number): different for every
  session, reproducible on a retry, never chosen by the browser.
- `releasePolicy: 'automatic'` by default for new sessions: results release
  the moment the test is finalized (also after a proctor force-submit). A
  teacher can still choose teacher release. Course Tests are never
  auto-released.

## Access

- Extended time: the support profile's `extendedTimeMultiplier` (through the
  one entitlement resolver) multiplies the session's limit when the student
  STARTS — so it covers practice tests, course Tests and Retests through one
  path. The session records `baseTimeLimitSeconds` and `extendedTimeMultiplier`.

## Results

- The released review lists questions in test order with the student's
  answer, correct/incorrect, the correct answer and the worked solution;
  points earned/possible and the score basis are returned so the screen can
  explain a weighted score.
- The Test Cycle card lists "What's on this test" (`testSkills`) from the
  blueprint — skills and question counts only.
