# Issue #390 — Day 2 nonunique 3×3 certification

Branch: `codex/day2-nonunique-3x3-workspace`. Base: `12b652f4`.
No merge or deployment. Engine checkpoint pushed as `7fa6c605`.

## Capability and authoring contract

Nonunique 3×3 questions use `mode: "algebraic"`, `method: "elimination"`.
No new schema field is needed. Existing unique substitution/studentChoice remain supported; nonunique substitution is still rejected explicitly at preflight rather than offered as a broken route.

Checked student work produces the terminal statement; the student must submit a classification. A contradiction ends elimination immediately. An identity from one pair is preserved, but the other pair must account for the third original equation before concluding consistency. This prevents the false inference that any identity proves the whole system has infinitely many solutions.

The reduced 2×2 remains the mature Systems engine. Its earned terminal statement returns to the parent classification stage. Numeric outcomes still use Step Algebra, back-substitution, and original-equation verification. 3D receives the student's solved coordinates or classified statement; no answer-key reveal control is offered in this connection.

CW1/CW2 and PR2/PR3 are combined. The original section budgets remain 8 + 20 + 48 + 10 = **86 minutes**. No conceptual item was converted into an additional long solve.

## Visible Chrome evidence

Test origin: `http://localhost:5173/`. With user authorization, replaced the other checkout's dev server on that port with this branch.
Harness: `/tests/browser/day2Nonunique.html`, reading the real Day 2 JSON and mounting the real QuestionEngine in student execution scope. Local synthetic draft identity only; no production records or grades touched.

- Laptop 1366×768, dependent: eliminated x using E1/E3, scaled E1 by 3, entered all products and combined terms to earn `0 = 0`. Then E1/E2 with exact factor 1/2, producing `−3/2 y + 5/2 z = −9/2`. Wrong unique classification kept 3D locked. Correct dependent classification opened 3D.
- Refresh mid-distribution: checked products survived. Undo after refresh reopened the four student-entered products (`6`, `3`, `−9`, `15`).
- Phone 390×844, inconsistent: E1 scaled by 2 minus E2 produced `0 = −3`. No numeric solver or 3D access before classification. Classified inconsistent, opened model; no page overflow. Refresh preserved classification; Undo revoked it and relocked 3D.
- Unique regression: eliminated z via E1 + 2E2 → `9x + 5y = 12`, 2E2 + E3 → `5x + 6y = 26`. Reduced elimination gave `−29y = −174`; student solved y=6, x=−2, z=−3 with mature Step Algebra. Checked original sides 2, 5, 16. 3D was locked at intermediate stages and marked the student's `(−2, 6, −3)` only after completion.
- Alternate route after refresh: changed E1/E3 to E1/E2 without Reset Question. Earned `−3y + 5z = −9` and `9y − 15z = 27`, then reduced elimination produced `0 = 0`. No extra cancellation-confirmation button. Undo reopened the child's combination while preserving both parent rounds. After classification and refresh, Undo first revoked classification, then reopened child arithmetic.
- Enter submitted scale factors, distribution products, and combined rows in the direct journeys.

Screenshots captured locally: `/tmp/390-dependent-laptop.png`, `/tmp/390-contradiction-phone.png`, `/tmp/390-unique-laptop.png`.
Reusable control drivers/journeys: `tests/browser/day2NonuniqueDriver.mjs`, `tests/browser/day2NonuniqueJourneys.mjs`. No solved-state injection.

## Automated verification

- Engine/render loop/Day 2 preflight targeted run: 34/34 passed before additional edge cases.
- Added identity-before-contradiction, stale/forged row, plane geometry, misconception-feedback and UI-wiring checks.
- First full platform gate: 6,458 passed / 5 source-representation assertions failed. Updated those assertions for earned-state plumbing; targeted reruns pass. Final full rerun pending.
- Mutation checks: ten deliberate regressions killed, including premature geometry, stale child classification, skipped child Undo, lost show-work control, missing feedback, answer-key marker, skipped numeric verification, early reveal, authoring gate, and changed inconsistent plane constant. Restored all mutations.
- Authoring V5: **684/684 passed**.
- Build passed; final rebuild pending after review fixes. Lint passed with existing warnings.
- Rules gate attempted, **blocked by missing Java** (`Could not spawn java -version`). No rules or server collections changed.
- Firebase packaging and final full gate pending.

## Review

Independent review identified child terminal Undo ownership and stale classification after alternate routes. Both fixed and browser-checked; additional review in progress.
