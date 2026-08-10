# MathMaster My Math Path — Starter Path Bank Seed

This package assumes `pathQuestionBank` is empty.

## What it covers

- 49 Algebra I wheel TEKS
- 48 Algebra II wheel TEKS
- 6 hard middle-school prerequisite TEKS reachable from those paths
- 103 routeable standards total
- 5 secure starter families per standard = 515 bank documents

Process standards are intentionally not standalone Path targets.

## Why 5 per standard instead of 1 or 3

The production Path session defaults to five questions. One family merely prevents a crash; it does not provide a usable session. Five is the operational floor.

The current server selection logic should also be changed before relying on this seed: it currently narrows candidates to the single nearest difficulty band. The issuer should prefer the requested band but choose an **unused family**, widening to the nearest available band before repeating a family. Otherwise a student can still see the same family repeatedly even when five exist.

## Security / grading

These starter items intentionally use the server's legacy field grader (`responseFields`) rather than unsupported interactive tools. Expected answers remain in the secure bank and are removed from the browser payload by `buildSanitizedQuestion`.

This is an operational starter floor, not the final quality target. As interactive Path Tool Contracts expand, replace/enrich these field-based items with authentic graph, mapping, systems, sequence, data-modeling, and other interactive families.

## Import

Do not place these files in `src/`. They are seed data for the Firestore collection `pathQuestionBank`. The coding AI should add/use an admin-only seed/import function that validates every document with the same `buildIssuePlan` gate used by production before writing it.

Recommended deployment order:
1. Deploy the Path Bank promotion/seed function and coverage audit.
2. Run the seed as an admin.
3. Confirm 100% issuable coverage for all 103 routeable standards.
4. Deploy coverage-aware wheel/routing changes.
5. Run fresh-student path tests for every target and hard prerequisite.
