# MathMaster authentication

## What changed, and why

MathMaster previously had no authentication. The login screen took a single
text box: typing `TEACHER` granted the full instructor dashboard — every
student's roster entry, grade, IEP profile and scratchpad — and typing any other
string signed you in as that student, creating the record if it did not exist.
Firestore rules matched: `grades`, `assignments` and `settings` were world
readable and writable to anyone with the project's public API key.

This release replaces that with real Firebase Authentication, keeps sign-in to a
few seconds on a phone or a Chromebook, and locks Firestore down to what the
signed-in person is actually entitled to.

## The four ways in

| Who | Method | What it needs |
| --- | --- | --- |
| Teacher | Google | A Google account listed in `teacherDirectory` or `INITIAL_TEACHER_EMAILS` |
| Teacher | Email + password | An account created in the Firebase console, plus a directory entry |
| Student | Google | A school Google account linked once with a class code |
| Student | Student ID + PIN | A 4–8 digit PIN the student sets once with a class code |

Google is offered first to both audiences because it is one tap and it is the
account most schools already issue. The ID + PIN path exists because not every
student has a Google account, and the email/password path exists because not
every teacher does either.

## Authorization comes from custom claims

Two custom claims drive everything:

- `role` — `teacher` or `student`
- `studentId` — the `grades` document the student owns

They are written **only** by Cloud Functions using the Admin SDK. A client can
ask to be assigned a role (`resolveSignedInRole`), but it can never assert one,
and `firestore.rules` reads nothing else. This is the whole security model: if
the claim is not on the token, the data is not readable.

## Flows

### Teacher, first time

1. Add the teacher's Google address to `INITIAL_TEACHER_EMAILS` in
   `functions/.env.<project>` and deploy, **or** have an existing teacher add it
   from the **Sign-in Access** tab.
2. They choose *I'm a teacher* → *Continue with Google*.
3. `resolveSignedInRole` matches the email, sets `role: teacher`, and records
   the sign-in in `teacherDirectory`.

`INITIAL_TEACHER_EMAILS` is the bootstrap for an empty directory — a chicken and
egg fix, since only a teacher can grant teacher access. Once a real teacher
exists, clear the variable.

### Student, first time (no Google account)

1. The teacher opens **Sign-in Access** and creates a join code for the class
   period. It looks like `K7M4QP` — six characters from an alphabet with no
   `0/O`, `1/I/L`, `2/Z`, `5/S` or `8/B` confusions, so it survives being read
   off a whiteboard.
2. The student enters their student ID and PIN and taps *Sign in*. The server
   replies `needs-setup`, and the form reveals the class code field and a
   confirm-PIN field in place.
3. They enter the code, confirm the PIN, and they are in. The PIN is stored as a
   salted scrypt hash in `studentCredentials`; the plaintext is never persisted.

The class code is required only for this first claim. After that it is student
ID + PIN, and rotating the code does not sign anyone out.

### Student, first time (with a school Google account)

1. *Continue with Google*.
2. `resolveSignedInRole` finds no roster link and returns `needsLink`, so the
   app shows the **Connect your account** form.
3. They enter their student ID and the class code once. `linkGoogleAccount`
   verifies the code, writes `studentDirectory/{email} → studentId`, and sets the
   claims. From then on Google sign-in is a single tap.

### Returning users

Firebase persists the session. "Keep me signed in on this device" is **off by
default**, which puts the session in tab-scoped storage — the right default for a
shared classroom machine, where a persisted session would greet the next period
as the previous student. Turning it on uses local storage instead.

## Guessing and lockout

Student PINs are short by design, so the throttle does the work:

- 8 failed attempts within a 15 minute window locks that student ID for 10
  minutes. Counters live in `authThrottle`, which no client can read or write.
- The lockout is keyed on the student ID, not the browser, so switching devices
  does not reset it.
- Trivial PINs (`1234`, `0000`, any single repeated digit, and a short banned
  list) are rejected when chosen, not at sign-in.
- A teacher resetting a PIN also clears the lockout — that reset is usually the
  fix for a student who just locked themselves out.

Student IDs are matched case-insensitively. `s1042`, `S1042` and `S1042 ` are one
account: the uppercase form keys credentials, aliases, throttling and the
Firebase UID, while `studentAliases` maps it to the `grades` document ID as it
was originally typed. The first time an ID is seen the server scans the roster
for a case-insensitive match and adopts the existing document, so pre-existing
grade history is never stranded in a near-duplicate record.

## Firestore rules

| Path | Read | Write |
| --- | --- | --- |
| `grades/{studentId}` and subcollections | owner or teacher | owner or teacher (delete: teacher only) |
| `assignments/{id}` | any signed-in user | teacher |
| `settings/{doc}` | any signed-in user | teacher |
| `studentCredentials`, `studentDirectory`, `studentAliases`, `classJoinCodes`, `authThrottle`, `teacherDirectory` | nobody | nobody |
| Classroom integration collections | nobody | nobody |

The server-only collections are unreachable from every client, teachers
included — PIN hashes, join codes and lockout counters are only ever compared
Admin-side.

Deletes on `grades` are teacher-only deliberately. The recursive subcollection
wildcard also matches the parent document, and Firestore rules are a permissive
union, so a blanket `write` there would have handed students back the ability to
erase their own grade history. `npm run test:rules` asserts this and 44 other
cases against the real emulator; it needs Java and takes about a minute.

## Deploying this change

Order matters — deploying rules before functions locks students out of a working
app.

1. **Enable sign-in providers** in the Firebase console → Authentication →
   Sign-in method: **Google** and **Email/Password**.
2. **Authorize your domains** under Authentication → Settings → Authorized
   domains (`mathmaster-aleks.web.app`, plus any custom domain and `localhost`).
   Google sign-in fails with `auth/unauthorized-domain` otherwise.
3. **Set the bootstrap teacher**: add `INITIAL_TEACHER_EMAILS=you@school.org` to
   `functions/.env.<project>`.
4. **Deploy functions**: `firebase deploy --only functions`.
5. **Deploy rules**: `firebase deploy --only firestore:rules`.
6. **Deploy hosting**: `npm run build && firebase deploy --only hosting`.
7. **Sign in as the teacher**, open **Sign-in Access**, and create a join code
   for each class period in use.
8. **Give each class its code.** Students claim their accounts on first sign-in.

### Rollout notes

- Existing `grades` documents are preserved. Students keep their IDs, grades,
  attempt history and scratchpads.
- Students cannot sign in until a join code exists for their class period, so do
  step 7 before the first class that needs it.
- The Google Classroom launch link (`?launch=<assignmentId>`) still works. The
  login screen shows which assignment is waiting, and opens it once the student
  is in.

## Where the code lives

| File | Responsibility |
| --- | --- |
| `functions/lib/auth.js` | Validation, scrypt hashing, join codes, throttling. Dependency-free and unit testable. |
| `functions/index.js` | The callables: `resolveSignedInRole`, `studentSignIn`, `linkGoogleAccount`, and the teacher admin actions. |
| `src/auth/authService.js` | Firebase Auth wrappers, persistence, callable clients, error translation. |
| `src/auth/AuthProvider.jsx` | `useAuth()` — session state machine (`loading` → `signedOut` / `linking` / `ready`). |
| `src/LoginScreen.jsx` / `.css` | The login interface. |
| `src/SignInAccess.jsx` | Teacher tab: join codes, PIN resets, unlinking, teacher access. |
| `firestore.rules` | Authorization, keyed on the two custom claims. |
| `tests/firestore-rules.test.mjs` | Behavioural tests for the above. |
