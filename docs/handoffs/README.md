# Handoff artifacts

The record of what each package changed and what was checked before it landed:
per-round validation reports, file manifests, and merge/patch instructions.

They are history, not reference. Nothing in the build, the tests or the app
reads them — they are here so a change can be traced back to the round it came
from, and so the repository root stays legible.

Living documentation stays at the repository root and in `docs/`:
architecture notes, integration guides, `MATH_FORMATTING_GUIDE.md`, and the
authoring contract, which is generated from the code rather than written by
hand.
