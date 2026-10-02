# Multiple Representations — Process Mode: QA evidence

Screenshots from `tests/browser/lmrProcessMode.mjs`, run against the real
QuestionEngine with boards compiled through the teacher import chain
(`tests/browser/lmrProcessModeMain.jsx`). Architecture:
`docs/architecture/multiple-representations-process-mode.md`.

| File | What it shows |
| --- | --- |
| `01-board-locked-laptop.png` | A standard-form board before any work: "What I know" with a Find for each fact; every card that needs facts says every way it could open. |
| `02-workspace-solve-for-y.png` | Find the slope on 2x − 4y = 12: the one method available now (Solve for y, the platform's Step Algebra on the GIVEN) and the line naming the method that needs more (the slope formula, once two points are known). |
| `03-recognition-partial.png` | y = −x + 4: a right slope beside a wrong b — the slope is kept, the workspace stays open on b with "Keep the sign". |
| `04-standard-all-open.png` | Both intercepts by substitution, then the slope formula on the student's own intercepts: every fact verified, with how, and the cards it opened. |
| `05-point-slope-solved.png` | y − 2 = −1(x − 3) solved for y in Step Algebra (distribute, balance, rewrite, combine), all goal chips met. |
| `06-graph-rise-run.png` | Rise over run on the GIVEN graph: the legs follow what the student typed, so a rise of +2 visibly misses B; the field is marked and the feedback names the direction. |
| `07-graph-enlarged.png` | The workspace enlarged to a full-screen dialog (Escape returns). |
| `08-table-ipad.png` | iPad, touch: Δy/Δx, the pattern extended to each axis, exact 3/2. |
| `09-phone-algebra.png` | Phone (390 × 844): the situation's x-intercept solved in Step Algebra inside the workspace; no sideways scroll. |
| `10-phone-board.png` | Phone: the board after the facts are established. |
| `11-dol-saved.png` | A DOL: Save instead of Check, no ✓ or colour anywhere, a saved (wrong) intercept shown as written with Change. |
| `12-worksheet-unchanged.png` | The candle board of the family assignment, still a Worksheet board: key features typed as before, no facts strip. |

Run them yourself:

```
npx vite --host 127.0.0.1 --port 5199 --strictPort &
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/lmrProcessMode.mjs
AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/linearMultipleRepresentations.mjs
```
