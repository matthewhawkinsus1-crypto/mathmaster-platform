# Google Classroom Sync

MathMaster can publish one assignment to multiple Google Classroom courses and
send the completed MathMaster grade back to every destination course where the
student has a course-specific roster link.

See the complete setup and test guide:

- [`google-classroom-multi-course-setup.md`](google-classroom-multi-course-setup.md)

## Current data model

```text
classroomLinks/{publicationId}
```

One document represents exactly one MathMaster assignment published to exactly
one Google Classroom course.

```text
classroomRosterLinks/{rosterLinkId}
```

One document links a MathMaster student ID to one Classroom roster entry in one
course.

```text
classroomGradeSyncs/{syncId}
```

One document records the latest grade-passback result for one student and one
publication.

## Supported flow

- Connect one teacher Google account.
- List active courses taught by that account.
- Import a course roster.
- Link each Classroom student to a MathMaster student ID per course.
- Select several Classroom destination courses.
- Publish one MathMaster assignment to all selected destinations.
- Prevent duplicate publishing to a course already connected.
- Preserve partial success when one destination fails.
- Route grades independently to every linked destination.

## Remaining production limitation

The broader platform still needs real Firebase Authentication and role-based
Firestore rules before real student data should be used. The current text-based
teacher login is not sufficient production authorization.
