# Student pass 3, Batch 4: what a student can still do after the last miss

Branch `claude/pass3-b4-after-last-miss`, on `claude/modest-pasteur-xzagn7` at `37ec6ce` (Batches 1 and 2, see
[STUDENT_PASS3_BATCH1_2.md](STUDENT_PASS3_BATCH1_2.md)). This is one slice of Batch 4 ("Learn from the mistake"). IDs are
from [03-help-and-self-correction.md](../qa/student-experience-pass-3/03-help-and-self-correction.md); D3 is from the
[report](../qa/student-experience-pass-3.md). Nothing here re-grades anything, writes to production or deploys. There is
no new storage and no new Firestore path.

## What changed

| ID | What a student saw | What changed | Files |
| --- | --- | --- | --- |
| HELP-1 / D3, HELP-9 | After the last miss, a Classwork or Practice item was a dead end. "Try a similar one" went away with the Hint panel. | The closed card has **"Practise one like this (no score)"** under the worked solution. It shows a sibling from the item's question family (`similarProblem.js`; never the item in disguise, and never the sibling the Hint panel showed). The student answers it one box per part and gets ✓/✗ and "Not quite… / That matches". After that they can open the worked solution or get "Another one like this". It is offered on 118 of the 220 real Classwork/Practice items. An item without a sibling shows nothing new. | `src/platform/supports/workedExample/practiceLikeThis.js` (model), `PracticeLikeThis.jsx` (screen), `src/QuestionEngine.jsx` (closed card), `src/App.jsx` (one prop) |
| HELP-11 | Read aloud skipped the legacy worked solution (79 items). A multi-part answer never showed what the student wrote beside the correct answer. Pre-Flight said nothing about answer-only solutions. | Read aloud now reads the legacy review too: workflow steps, equation, answer forms, each part, and the graph summary. A multi-part item's worked solution starts with **"Part by part"**: "You wrote" beside "Correct" for each part, wrong parts first. The legacy review then drops its bare "label: answer" list, and the card drops its separate "Your answers" line. Pre-Flight's Check step gets a **"Worked solutions"** panel listing answer-only solutions (66 of 265 real items) and items with no `solutionReview.commonError` (all 265). | `src/platform/supports/review/closedQuestionReview.js`, `src/SolutionReviewPanel.jsx`, `src/SolutionReview.jsx` (`hideAnswerDetails`), `src/platform/preflight/solutionReviewPreflight.js`, `assignmentV5PreflightModel.js`, `LessonPreflightModal.jsx` |
| HELP-12 | "Your answers and solutions" showed the thinnest review: no right/wrong framing, no Read/Translate, and 95 of 180 non-tool items lost their worked steps. | Each row renders `SolutionReviewPanel`, with the outcome passed as `wasCorrect` and with Read aloud/Translate from the student's own entitlement (`toolsEntitlementFromProfile` for the row's role, as a question gets it). Wrong or partly-right Classwork/Practice rows offer **"Try one like this"**, the same unscored practice. The rest of Review My Work is unchanged. | `src/components/student/ReviewMyWork.jsx`, `reviewMyWorkModel.js` (`role`), `src/App.jsx` (`studentProfile`) |
| HELP-18 | Choice-only items (50 of 265) had one try, with no warning, no hint offer and no reason given. | Before the single try: **"This has one try — a hint is available."** plus a Show a hint button that uses the existing hint control. The release rules are unchanged, and the hint half is only said while a hint can actually be revealed. After the try, the author's one-line reason for the chosen option appears, where one is authored. The similar item is the practice above. | `src/platform/supports/feedback/oneTryChoice.js`, `src/QuestionEngine.jsx` |

### Authoring: `optionRationales`

A choice field may carry `optionRationales: { "<option text>": "<one line>" }`. The V5 compiler already copies unknown
response keys onto the answer field, so nothing in the compiler changed. A test pins that the field survives compilation.
Pre-Flight lists reasons that can never be shown: a key that is not an option, an empty reason, or more than one line. The
AI authoring prompt does not mention the field yet.

## Decisions made here (please confirm or redirect)

1. **How the practice is checked.** A family sibling's answer is one line of text, such as "domain [-1, 4]; range
   [-4, 6]". It is read into labelled parts. Each part is checked with the platform's own field matcher
   (`compareMathAnswer`), then with equivalent-expression checks, value sampling for expressions and equations, and the
   thousands separators and interval↔inequality forms students write. **No verdict is given for a part said in words**
   ("rises, then falls", "6 units to the left"), for a roster with "…", for a mapping, or for a line named by two of its
   points. The student compares those with the worked solution. On the real lessons, typing a sibling's own answer is
   never marked wrong.
2. **Pre-Flight "warning", not a diagnostic.** Any warning diagnostic makes an assignment "Needs Review", and a Needs
   Review assignment is an unpublished draft students never see (`isUnpublishedDraft`). No real lesson authors a
   `commonError`, so a diagnostic would have hidden every new import. The findings are advice in the Check step and
   never change readiness. If you want them in the diagnostics list, readiness needs an "advisory" severity first.
3. **Only after a miss, only Classwork and Practice, only where the host vouches.** The classroom assignment passes
   `practiceLikeThisAllowed` from the *section's* role, because a DOL in post-due practice runs as `practice`. Recovery,
   corrections, Path, Live Challenge and the demo never pass it. Warm-Up keeps Recovery (D3).
4. **Nothing about the practice is recorded.** That includes Read aloud/Translate use on it, which is about the sibling
   and not the item. Credit back is Recovery's alone, under its existing rules.
5. **Review My Work has no per-part rows.** The server's rows carry the outcome, not per-part grading, and the brief kept
   these changes to the solution view.

## Tests

- New: `tests/platform/afterLastMiss.test.mjs` (16 tests). It covers every real lesson's practice, checking, gates, the
  no-recording contract, wiring, rendered part rows (Vite SSR), Pre-Flight on a real lesson, Review My Work, and HELP-18.
  26 mutations were run against it, one per behaviour, and each one turns it red. The one that first stayed green was
  fixed: the chosen option's reason, not just any reason.
- New browser test: `tests/browser/afterLastMiss.mjs` with harness `afterLastMissMain.jsx`, at 1366×768 and 390×844 on
  real lesson items. It runs three misses, then the practice: a wrong answer gets ✗, the right one gets ✓, Enter stays
  in the practice, there is no new grade (3 → 3), and the worked solution and another problem work. It checks there is
  no practice on Warm-Up, on a DOL, or on a host that does not vouch. It checks the one-try notice and the chosen
  option's reason. A mutation that removes the practice turns it red.
- Source contracts rewritten under the playbook (behaviour intact, each mutation-checked):
  - `reviewMyWorkModel`: one renderer, inside the boundary.
  - `studentPushJCopy`: "not available" instead of an empty frame, and the check never throws.
  - `studentTodayAppWiring`: the Review My Work mount, now with `studentProfile`.

## Deploying (not done)

Browser code only: Hosting. No Cloud Functions, rules or indexes change.

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting   # or node scripts/release-firebase.mjs
```

## Left for later

- Add `optionRationales` to the AI authoring prompt (`authoringContract.js`), and author reasons and `commonError` in
  the real lessons.
- A real screen-reader pass of the practice and the "Part by part" rows.
- `tests/browser/feedbackTeaches.mjs` "phone: the worked solution can be reached" fails on the base commit `37ec6ce`
  too. It is not caused by this branch and was not investigated here.
