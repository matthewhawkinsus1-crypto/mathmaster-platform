# MathMaster Assignment Package V2

## Purpose
Assignment Package V2 lets a teacher create an assignment from one JSON object without separately entering the title, dates, class periods, folder, assignment type, version mode, DOL settings, or curriculum metadata.

Legacy question-array JSON remains supported. When a legacy array is used, the manual form fields act as fallbacks.

## Recommended shape

```json
{
  "schemaVersion": 2,
  "assignment": {
    "assignmentKey": "alg1-m1-t1-l1-activity-1-1",
    "title": "Algebra I M1 T1 L1 - Activity 1.1",
    "folder": "Algebra I/Module 1/Topic 1/Lesson 1",
    "template": "guided-notes",
    "assignmentType": "notesClasswork",
    "variantMode": "shared",
    "classes": ["Period 1", "Period 3", "Period 6"],
    "releaseAt": "2026-08-17T08:00:00-05:00",
    "dueAt": "2026-08-17T16:00:00-05:00",
    "lateDueAt": "2026-08-19T23:59:00-05:00",
    "standards": ["A.1A", "A.1C"],
    "curriculum": {
      "provider": "Bluebonnet",
      "course": "Algebra I",
      "module": 1,
      "topic": 1,
      "lesson": 1
    }
  },
  "questions": []
}
```

## Supported templates
- `practice`
- `practice-with-dol`
- `guided-notes`

Templates provide defaults. Any explicit assignment field overrides the template default.

## Class period aliases
The importer accepts `1`, `P1`, or `Period 1` through period 8 and normalizes them to `Period 1` through `Period 8`.

An explicitly empty classes array means the assignment is available to all class periods.

## Version mode
`variantMode` may be `shared` or `personalized`.

If it is omitted, MathMaster automatically chooses:
- `shared` if any question is fixed;
- `personalized` when every question has a generator or at least two variants.

## Folder behavior
When `assignment.folder` is present, the assignment is saved in that folder and the folder path is added to the Assignment Library automatically. Nested paths use `/`.

## DOL
Example:

```json
"dol": {
  "enabled": true,
  "minutesBeforeEnd": 10,
  "questionNumber": 6
}
```

`questionNumber` is one-based. `questionIndex` is zero-based. `questionId` can also be used.

## Prerequisite
Use either:

```json
"prerequisiteAssignmentId": "firestore-document-id"
```

or:

```json
"prerequisiteTitle": "Algebra I M1 T1 L1 - Guided Notes"
```

When a title is used, MathMaster resolves it to an existing assignment before publishing.

## Portable export
The assignment card's Export JSON command now exports Assignment Package V2 rather than the raw Firestore document. This makes exported JSON suitable for editing and re-importing.

## Duplicate protection
If `assignmentKey` is supplied, MathMaster prevents a second assignment with the same key from being imported accidentally. Remove or change the key when intentionally making a separate copy.

## Firestore preflight
Before saving, MathMaster checks for Firestore-invalid direct nested arrays and reports the exact path rather than allowing Firestore to fail with a generic `Nested arrays are not supported` error.
