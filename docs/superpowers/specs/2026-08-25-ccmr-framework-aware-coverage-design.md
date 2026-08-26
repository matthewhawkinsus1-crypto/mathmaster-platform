# CCMR Framework-Aware Published Coverage

## Problem

The CCMR crosswalk currently answers a curriculum question — whether a TEKS has
a legitimate relationship to Digital SAT, ACT, TSIA2, or ASVAB. Student launch
surfaces mistakenly use that as if it also proves the active secure bank has an
issuable family for the requested assessment.

A.12C exposed the split: the crosswalk says Digital SAT applies, while the
active Digital SAT V2.1 bank has no published A.12C family. The browser offered
the pathway and the secure server correctly refused it.

## Design

1. `pathCoverage/{courseId}` becomes schema 2.
2. Ordinary course coverage is computed from course-authored items only.
3. A lightweight publication index is computed independently for Digital SAT,
   ACT, TSIA2, and ASVAB from the active secure bank and the same server issue
   plans used by production.
4. Assessment publication uses a one-family threshold. Course Path keeps its
   five-family session threshold.
5. Student CCMR recommendations require BOTH a legitimate crosswalk and
   published framework coverage.
6. A skill with no crosswalk says it is not part of that assessment's math
   practice. It never says "coming soon."
7. Publication consistency has two severities. A crosswalk plus authored bank
   content that cannot publish is a hard mismatch; published content without a
   crosswalk is also a hard mismatch. A broad crosswalk with zero authored bank
   content in the current release is an informational coverage gap, not a
   release-breaking defect. Students fail closed in all unpublished cases.
8. Weekly assessment-transfer recommendations may use a framework only when the
   exact TEKS/framework pair is published.
9. The existing admin Path Content Coverage screen separates hard authored-bank
   publication defects from informational crosswalk-only gaps.

## Deployment order

1. Deploy `rebuildPathCoverage` with the schema-2 shared coverage code.
2. Recompute coverage from the existing secure bank.
3. Inspect the framework mismatch audit.
4. Build Hosting with `VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction`.
5. Deploy Hosting.
6. Student smoke-test a published assessment pair and an unpublished/mismatched
   pair such as the current A.12C Digital SAT case.

The 1,000-item CCMR V2.1 release is not re-imported by this change.

## Regression correction — v2

The first implementation classified every `mapped && !published` pair as a hard
mismatch. That incorrectly converted broad, authored curriculum relationships
(such as Grade 6-8 Digital SAT overlap) into publication obligations. V2 uses
the framework coverage record's `authoredCount` to distinguish an attempted bank
pair from a crosswalk-only relationship. It also restores the established My
Math Path no-content wording so existing platform tests and UI language remain
stable.
