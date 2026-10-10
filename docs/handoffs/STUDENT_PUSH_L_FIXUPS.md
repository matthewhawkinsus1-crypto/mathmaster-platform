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

## Files changed

- `src/platform/supports/feedback/genericMissChecks.js`
- `src/platform/supports/feedback/missDiagnosis.js` (doc comment only)
- `src/platform/language/speechText.js`
- `functions/shared/masteryRule.mjs`
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
