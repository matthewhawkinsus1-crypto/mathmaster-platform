# Universal Work View Stage 4 certification

## Decision

Universal Work View is **production-certification gated**. Stage 4 adds a
rendered, inventory-derived student assignment certification job without
replacing the Stage 1–3D architecture or the deeper Work View Browser Matrix.
The release decision is green only when both browser jobs and the required
repository gates pass.

## Coverage

The source of truth is `WORK_VIEW_CERTIFICATION` in
`src/tools/workViewCertificationManifest.js`. It binds each migrated inventory
id to its own registry implementation, rendered scene, complete device list and
required behaviours. The contract rejects missing/unclassified tools, partial
device coverage, missing baseline usability invariants and Undo claims that do
not agree with the inventory. `solutionReview2` remains the sole exemption: it
is read-only post-submission review rather than an editable workspace.

All migrated families are rendered through `QuestionEngine` inside assignment
navigation, section context and the production question stage. The fixtures are
the deterministic tool-preview fixtures used by the existing browser audit; no
second tool implementation or copied mathematical state is introduced.

## Devices and artifacts

The job certifies 1366×768 Chromebook, 1440×900 laptop, 768×1024 portrait
tablet, 1024×768 landscape tablet, 390×844 iPhone portrait, 844×390 iPhone
landscape and 360×800 narrow Android. Screenshots are organized as
`device/tool/state` and retained for 14 days. Each tool produces standard,
Work View, Task, Help and rotated states. Failure artifacts upload even when a
semantic/layout assertion stops the job.

## Automated requirements

For each rendered scene the Stage 4 driver checks that Work View opens and
covers the viewport; Task and Help remain reachable; horizontal overflow and
clipped controls are absent; advertised Undo has exactly one visible Universal
Undo; and resizing/orientation does not change mathematical input values. The
existing Work View Browser Matrix remains responsible for deep gestures,
sequential Undo, Scratchpad owner arbitration, keypad occlusion, Fit View,
graph-label ceilings, branch algebra, and the explicit `predictionX` state
preservation invariant. The Path Tool Browser Contract continues to validate
browser-to-grader response fidelity.

## Defects and limitations

Stage 4 found a fixture coverage defect: five registered tools had no
deterministic preview specification. Specifications were added for function
operations, interval/number-line, relation mapping, open sort and constraint
function building so certification renders working activities instead of empty
states. No production mathematical grading or response policy was changed.

The Stage 4 driver intentionally uses semantic geometry and interaction checks,
not whole-page pixel baselines. Large-text and keyboard/keypad depth remain in
the established Work View Browser Matrix; the Stage 4 job adds full-inventory
and full-device breadth rather than duplicating those expensive probes.

## CI and required release gates

* `Universal Work View Stage 4 Certification`
* `Work View Browser Matrix`
* `Path Tool Browser Contract`
* `Full Platform Suite`
* `npm run lint`
* `npm run build`
* `npm run build:firebase`

With all of the above green, Universal Work View can be considered
production-certified for the registered student-tool inventory and declared
viewports. Any newly registered or newly migrated tool makes the manifest
contract fail until it receives an explicit certification classification.

