# Full Assignment Audit and Repair

The ordinary **Repair/Edit Questions** workflow remains a version 1,
teacher-selected contract: only flagged/selected question IDs can be returned or
changed. **Full Assignment Audit** is a separate version 2 maintenance contract.
It includes every stable question ID and requires exactly one `passed`,
`assignmentIssue`, `platformIssue`, or `unclear` result for each question.

## Authority

Root administrators qualify automatically. An administrator can grant an active
teacher the narrow `assignmentRepairer: true` custom claim from the existing
teacher-account administration screen. The audited callable updates the teacher
directory and claim; it cannot be self-granted. The next role resolution/sign-in
refreshes the ID token. UI visibility is only a convenience: the commit callable
accepts only a trusted administrator claim or a teacher token containing the
capability, so a client payload cannot spoof authority. A designated repairer can
maintain any Library assignment, regardless of creator.

## Safety model

An audit package records `assignmentId` and `baseRevision`. Its parser requires a
complete, unique audit result set and allows replacements only for
`assignmentIssue`. `passed`, `platformIssue`, and `unclear` questions remain
unchanged. Platform issues are persisted separately; a correct authored question
must never be weakened to work around a renderer, grader, navigation, or tool
defect. Global findings are review-only and no raw assignment replacement or
metadata patch is accepted.

The repairer confirms once before creating the handoff, reviews/filter results
and individually selects repairs, then confirms a second time before commit. The
server transaction rechecks authority, assignment identity, complete audit,
question identity, and revision. It writes only the question container plus one
next revision, with question-scoped history and a private audit record. A stale
response is refused rather than merged.

Student submissions, evidence, grades, attempts, publication data, and historical
records are outside the update allow-list. Existing question IDs are mandatory
and preserved. The review displays a prominent activity warning when activity is
known; when it cannot be proven without reading student responses it says the
status is unavailable instead of claiming no work exists.

Deploy changes under `functions/` and `firestore.rules` after merge:

```sh
npm run build && npm run build:firebase
firebase deploy --only hosting,firestore:rules,functions
```
