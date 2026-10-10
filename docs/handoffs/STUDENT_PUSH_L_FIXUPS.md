# Student push — Job L: wave-1 fix-ups (QA M1, M4, M5)

Three fixes a release-candidate QA run found in wave-1 code. Must merge before
wave 1 deploys. Nothing else changed.

## M1 — a generic miss check no longer hints at the move while attempts are left

`genericMissCheck` (sign flip, reciprocal, swapped pair, unreduced fraction)
now returns `null` while the item is open (`open` defaults to true). The
per-check "open" sentences (`GENERIC_MISS_MESSAGES_OPEN`) are gone. Each one
told the student which move turned their answer into the key, and the
"equation… both sides" one also appeared on problems with no equation. So
with attempts left, a miss a check explains reaches `missFeedback` exactly
like an ordinary miss. That covers the same text, the same `data-miss-feedback`
source, the same live regions and the same feedback-assisted flag (authored
attempt feedback, if any, as for any miss). The named explanation
(`GENERIC_MISS_MESSAGES`) still appears only once the item has closed.
Server classifier messages are unchanged.

## M4 — screen readers hear ≤ ≥ ≠ < > and π next to a number

In `speechText.js`, every LaTeX command pattern now ends at `(?![A-Za-z])`
instead of `\b`. That covers the operators, `\pi`, `\theta`, `\circ`,
trig/log, `\infty`, `\cdot`, `\times`, `\div`, and the argument commands
`\frac`, `\sqrt`, `\overline`, `\overrightarrow` and `\text…`. `\lt` and `\gt`
were never read and now are. Side effects: `\textbf{…}` is no longer misread
as `\text` + "b", and a longer unknown name (`\lnot`, `\pitchfork`,
`\leqslant`) is no longer partly read as the short one.

## M5 — the Mastered checklist no longer says read-aloud doesn't count

The label now reads "Get 2 right on your own — no hints or worked steps". I
checked before changing it. Nothing in the client or server counts read-aloud
or text-to-speech against independence: `mathematicalIndependence` (Path and
assignment evidence) exempts every accommodation except `algebraAutoApply`,
`CONSTRUCT_AFFECTING_SUPPORTS` holds only that one, and `AttemptContext` and
`evidenceClassification` have no TTS flag. No grading change.

## R2-M2 — a Path answer is no longer helped by the review shown after it

QA round 2 found this. `submitPathResponse` set `workedExampleUsed`, and
also `hintUsed` and `scaffoldUsed`, from whatever THIS response released.
A Path item allows one attempt, and a closed item always releases its
solution review. So every Path answer, including a correct first try, was
stored as "worked example used". A Path-only student could never reach
Mastered: in the QA repro, 3 right of 5 read as "0 of 2 on your own" and 45%.
The same applied to a hint first released by the second miss: it marked that
second miss.

The fix is a new pure `mathPath.pathAttemptSupport({ priorSupport,
attemptSupport })` in `functions/lib/mathPath.js`. It returns `used`, which is
only what earlier responses on the item released, i.e. what was on screen
before this answer. It also returns `released`, which is that plus what this
response releases, stored as `supportReleased` for the next attempt. The
`functions/index.js` hunk in `submitPathResponse` is three spots: the call,
the three `supportUsage` flags, and `supportReleased`. The evidence shape is
unchanged. This applies going forward only; no stored evidence was touched
(job I's backfill owns history).

Tests:
- `tests/platform/pathMasteryIndependence.test.mjs` no longer pins source text.
  It now has a wiring check bound to the handler region, plus behaviour tests:
  the repro sequence gives 3 independent successes, estimate 60 and "2 of 2"
  on your own; a hint released before an answer marks it and stays sticky; a
  review released before an answer marks it.
- New `tests/integration/pathIndependentFirstTry.test.mjs` (emulator, run by
  `test:challenge-finish` in full-platform-suite) drives the real
  `issueNextQuestion` → `submitPathResponse` → `updateMyMathPathMasteryFromEvidence`
  chain through the same cases.
- All of these fail against the old handler and pass on the fix.

## Files changed

- `src/platform/supports/feedback/genericMissChecks.js`
- `src/platform/supports/feedback/missDiagnosis.js` (doc comment only)
- `src/platform/language/speechText.js`
- `functions/shared/masteryRule.mjs`
- `functions/index.js` (R2-M2: `submitPathResponse` only, one hunk; job I owns functions/**)
- `functions/lib/mathPath.js` (R2-M2: new `pathAttemptSupport`, exported)
- `tests/platform/pathMasteryIndependence.test.mjs`
- `tests/platform/pathAdversarial.test.mjs` (R2-M2: the "claimed hint" attack check now names the new server-derived flag)
- `tests/integration/pathIndependentFirstTry.test.mjs` (new)
- `tests/platform/feedbackThatTeaches.test.mjs`
- `tests/platform/speechCommandBoundary.test.mjs` (new)
- `tests/platform/masteryChecklistAccommodations.test.mjs` (new)
- `tests/browser/feedbackTeaches.mjs`
- `tests/browser/assessmentLeakGates.mjs` (dropped the removed export from the leak list)
- `docs/handoffs/STUDENT_PUSH_L_FIXUPS.md`

Every new assertion was mutation-checked: it fails against the old code or a
targeted break, and passes on the fix. Browser drivers run locally:
`feedbackTeaches.mjs`, `assessmentLeakGates.mjs feedback-ladder` and
`mathSpeech.mjs` all pass.

## Noticed, not changed

- `docs/handoffs/STUDENT_PUSH_A_FEEDBACK.md` still describes
  `GENERIC_MISS_MESSAGES_OPEN`. It is a historical handoff, so I left it.
- `speechText.js` reads `\leqslant`, `\geqslant` and `\neg` as nothing (the
  catch-all drops them). Before this change they were also dropped, or misread.
  Adding them would be a small follow-up if authors use them.
