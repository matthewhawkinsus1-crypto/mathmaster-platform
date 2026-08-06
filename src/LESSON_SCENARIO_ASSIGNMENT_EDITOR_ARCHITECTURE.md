# MathMaster Lesson Modeling and Assignment Question Editor

## Purpose

This update adds reusable question types for lessons that ask students to connect real-world situations, quantities, graph shapes, labels, scales, and written explanations. It also adds a data-safe editor for questions already published inside an assignment.

## New question types

### `relationshipModel`

Supports multipart grading for:

- independent quantity
- dependent quantity
- discrete or continuous relationship
- x-axis quantity and unit
- y-axis quantity and unit
- reasonable x- and y-axis scales
- interpretation of the starting point or origin

Written starting-point explanations are checked with required concept groups rather than one exact sentence.

### `graphScenarioMatch`

Displays structured graph cards and scenario cards. Students may drag a graph to a scenario or use an accessible dropdown. The component enforces one-to-one graph use and awards separate partial credit for each correct match.

### `graphComparison`

Displays two or more graphs side by side and supports a mixture of:

- selected classifications
- mathematical similarities
- mathematical differences
- left-to-right behavior descriptions
- maximum/minimum comparisons

Written responses use concept-group validation so reasonable wording can be accepted.

### `graphStory`

Provides:

- scenario text entry
- independent and dependent quantity fields
- axis labels and units
- a persistent freehand coordinate-plane sketch
- a written explanation

This is an open-ended completion-credit item. The response remains available in the grade record and the shared scratchpad remains available for teacher review.

## Assignment Question Editor

Each assignment card now has **Edit Questions**.

Before any student records exist, the teacher may:

- remove questions permanently
- reorder questions
- duplicate questions
- edit an individual question as JSON
- exclude or re-include questions
- edit the assignment title

After student records exist, physical removal and reordering would cause index-based grade records to point at the wrong question. Therefore:

- reordering is disabled
- **Throw Out Safely** marks the question with `teacherExcluded: true`
- the question remains at its original stored index
- students no longer see it
- it is removed from grade, progress, classwork-completion, resume, and DOL calculations
- previous student records remain preserved for audit purposes

Duplicated questions are appended after student activity begins so existing indexes remain unchanged.

## Shared exact-version lessons

The assignment validator now allows fixed lesson questions when the teacher selects **Shared exact version**. Personalized assignments still require a generator or at least two variants.

## Persistence and attempts

All new modules use the existing shared systems for:

- local browser draft persistence
- Undo
- multipart partial credit
- three attempts
- frozen correct/expired states
- solution review
- scratchpad access
- teacher preview

## Lesson alignment

The included sample blueprint demonstrates:

- quantity classification
- discrete versus continuous relationships
- graph labels, units, and scale
- starting-point interpretation
- six-scenario graph matching
- linear versus exponential comparison
- maximum versus minimum parabola comparison
- student-created graph stories
- ordered-pair preparation
