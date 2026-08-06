# Google Classroom Multi-Course Publishing and Connection Guide

This release lets one MathMaster assignment be published to several Google
Classroom courses without overwriting the publication record from another
course.

## What changed

Each publication now has its own server-only record:

```text
classroomLinks/{publicationId}
```

The deterministic `publicationId` is based on both:

```text
MathMaster assignment ID + Google Classroom course ID
```

Each record stores its own:

- Classroom course ID and course name
- Classroom coursework ID
- Classroom launch link
- Publication status and error
- Due date and materials

Roster links are also course-specific:

```text
classroomRosterLinks/{rosterLinkId}
```

This prevents a student linked in one class from being used accidentally for
grade passback in a different class.

## Duplicate protection

The Classroom create endpoint does not accept a caller-defined idempotency
key. MathMaster therefore uses three protections:

1. A deterministic Firestore publication document per assignment and course.
2. A five-minute publishing lease that blocks simultaneous duplicate clicks.
3. A hidden MathMaster publication marker in the Classroom description. Before
   retrying a failed or interrupted publish, the function searches the course
   for that marker and reuses the existing coursework if Google already
   created it.

Publishing an assignment again to a course that is already connected returns
`already-published` instead of creating another Classroom assignment.

## Grade passback

When a MathMaster assignment becomes terminal, the grade trigger:

1. Finds every published Classroom destination for that assignment.
2. Finds the student's roster mapping separately for each destination course.
3. Finds the matching Classroom StudentSubmission.
4. Patches `draftGrade` and `assignedGrade` for that course only.
5. Writes an audit record to `classroomGradeSyncs`.

The teacher token does **not** call Classroom `turnIn`. Google permits only the
student who owns the submission to call that endpoint.

## Important security limitation

This release makes multi-course publication and routing safe, but the broader
MathMaster app still does not use Firebase Authentication. The current
`TEACHER` text login is not production authentication, and assignments/grades
remain client-writable under the existing Firestore posture. Test with a dummy
course and dummy student. Add Firebase Authentication and role-based rules
before real student deployment.

# Connect the teacher Google Classroom account

## 1. Prepare Firebase

The repository is configured for project:

```text
mathmaster-aleks
```

Cloud Functions deployment requires the Firebase project to use the Blaze
plan.

Install tools and sign in:

```bash
npm install -g firebase-tools
firebase login
firebase use mathmaster-aleks
```

Install dependencies:

```bash
npm install
cd functions
npm install
cd ..
```

## 2. Enable the Classroom API

In the Google Cloud project connected to `mathmaster-aleks`:

1. Open **APIs & Services → Library**.
2. Search for **Google Classroom API**.
3. Select **Enable**.

## 3. Configure the OAuth consent screen

Open **Google Auth Platform** in Google Cloud Console.

For a district-owned Workspace project, choose **Internal** when available.
For an initial external test:

1. Choose **External**.
2. Keep the application in Testing.
3. Add the exact teacher Google account under **Audience → Test users**.

Configure these scopes:

```text
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.rosters.readonly
https://www.googleapis.com/auth/classroom.profile.emails
https://www.googleapis.com/auth/classroom.coursework.students
```

## 4. Create the OAuth client

Create an OAuth 2.0 client with application type:

```text
Web application
```

Add this exact authorized redirect URI:

```text
https://us-central1-mathmaster-aleks.cloudfunctions.net/oauthCallback
```

Copy the generated client ID and client secret.

## 5. Configure public function values

Create this file:

```text
functions/.env.mathmaster-aleks
```

Paste:

```env
GOOGLE_OAUTH_REDIRECT_URI=https://us-central1-mathmaster-aleks.cloudfunctions.net/oauthCallback
FUNCTIONS_BASE_URL=https://us-central1-mathmaster-aleks.cloudfunctions.net
APP_BASE_URL=https://mathmaster-aleks.web.app
```

If your project ID or region differs, replace all three URLs consistently and
add the resulting callback URL to the Google OAuth client.

## 6. Configure deployed secrets

From the project root, run each command and paste the requested value:

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
```

Generate a 32-byte launch-link key:

```bash
openssl rand -hex 32
```

Copy the result, then run:

```bash
firebase functions:secrets:set LINK_ENCRYPTION_KEY
```

The functions bind these secrets explicitly through the Firebase Functions
`secrets` option.

## 7. Build and deploy

The included `firebase.json` now serves the Vite `dist` directory as a
single-page app.

```bash
npm run build
firebase deploy --only hosting,functions,firestore:rules
```

After deployment, confirm the site opens at:

```text
https://mathmaster-aleks.web.app
```

## 8. Connect the teacher account

1. Open MathMaster at the deployed Hosting URL.
2. Enter the teacher dashboard.
3. Open **Google Classroom**.
4. Select **Connect Google Classroom**.
5. Choose the teacher's Workspace account.
6. Approve the requested Classroom permissions.
7. Confirm MathMaster returns with **Google Classroom connected**.
8. Select **Load Active Courses**.

# Test multi-course publishing

Use two dummy Classroom courses and one dummy student account.

## A. Link both rosters

For the first course:

1. Select the course under **Roster course**.
2. Select **Import Roster**.
3. Enter the dummy student's MathMaster ID.
4. Select **Link**.

Repeat those steps for the second course. The same MathMaster student may be
linked in both courses, but each mapping is stored separately.

## B. Publish to both courses

1. Select one MathMaster assignment.
2. Check both destination courses.
3. Select **Publish to 2 Courses**.
4. Confirm the result panel shows `published` for both courses.
5. Confirm the publications table contains two rows with different course
   names and different Classroom coursework IDs.
6. Open each course and confirm the assignment appears once.
7. Click Publish again with the same two courses selected. Both should return
   `already-published`, and no duplicates should appear in Classroom.

## C. Test grade passback

1. Open the Classroom assignment as the dummy student.
2. Follow **Open in MathMaster**.
3. Sign into MathMaster with the linked student ID.
4. Complete the assignment until every question is terminal.
5. Check both Classroom courses.
6. Confirm the grade is written to each course where that student was linked.

The Classroom submission state is not automatically changed to Turned In. The
teacher-authorized API is permitted to patch grades but is not permitted to
turn in a student's submission.

## D. Inspect server records

In Firestore, verify:

```text
classroomLinks/{publicationId}
classroomRosterLinks/{rosterLinkId}
classroomGradeSyncs/{syncId}
teacherIntegrations/default
```

A healthy publication has:

```text
status: "published"
assignmentId: "..."
courseId: "..."
courseworkId: "..."
classroomUrl: "..."
```

A healthy grade audit has:

```text
status: "synced"
grade: 0-100
courseId: "..."
courseworkId: "..."
submissionId: "..."
```

## E. View logs

```bash
firebase functions:log --only getGoogleAuthUrl
firebase functions:log --only oauthCallback
firebase functions:log --only listGoogleCourses
firebase functions:log --only publishAssignmentToClassrooms
firebase functions:log --only syncGradeToClassroom
```

## Common errors

### `redirect_uri_mismatch`

The authorized redirect URI in the Google OAuth client does not exactly match
`GOOGLE_OAUTH_REDIRECT_URI`.

### Course shows as failed

The connected Google account is not an active teacher in that course, or the
account lacks permission to create coursework.

### `skipped-unlinked` grade audit

The MathMaster student ID has not been linked to that specific Classroom
course. Import and link that course roster.

### Grade updates but work is not Turned In

That is intentional. Only the student who owns a Classroom submission may call
`turnIn`.

### Reconnect repeatedly asks for permission

External OAuth apps in Testing are appropriate for development but are not a
production district deployment. Use an Internal app when the district's
Workspace organization and Cloud project permit it, or complete the required
Google verification process.
