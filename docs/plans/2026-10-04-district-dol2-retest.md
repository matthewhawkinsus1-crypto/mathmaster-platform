# District DOL #2 review and external-original retest

The district original was taken in Eduphoria. Deliver one MathMaster assignment containing seven instructional review tasks, followed by thirteen secure parallel items. All review tasks must be attempted and review mastery must reach 80%. Only students whose teacher-entered original score is below 70 may enter. Preserve the original and raw retest; record `max(original, min(rawRetest, 70))` before display rounding. No watermark.

1. Add opt-in external-original policy and provenance to the existing canonical Test Cycle record. Reuse its initial secure session as the external retest, with Review/Retest phases; do not generate an additional corrections/retest cycle.
2. Enforce the 80% gate server-side using unrounded review credit. Preserve the default participation gate for existing assignments.
3. Add teacher roster score entry with validation, eligibility filtering, idempotent session reuse, and an audit of who entered each original score.
4. Convert the district-aligned content to native V5 review questions and thirteen server-only bank families. Use deterministic variants and the existing private grader. Support weighted fields, explicit set partial credit, multipart visible stimuli, and a permitted regression tool.
5. Verify real native normalization, issuance, grading, score/stage gates, and absence of keys in public secure payloads. Run platform, authoring, lint, build, Firebase build, and rules checks where available. Publish a reviewable branch/PR and describe any deployment or classroom verification still outstanding.

All new behavior is opt-in; existing Test Cycle policies retain their current defaults. Secure answer keys stay in functions seeds, outside the browser/public assignment.
