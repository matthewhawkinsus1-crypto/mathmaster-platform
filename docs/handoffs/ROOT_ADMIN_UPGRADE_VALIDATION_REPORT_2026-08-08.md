# MathMaster Root Administrator Upgrade — Validation Report

Date: 2026-08-08

## Root authority

- Immutable root administrator: `matthew.hawkins@desotoisd.org`.
- Root identity is server-pinned and does not depend on `INITIAL_TEACHER_EMAILS`.
- Root claims remain compatible with the existing instructor workspace: `role: teacher`, plus `admin: true` and `rootAdmin: true`.
- Root administrator inherits every teacher capability and receives the Administration interface.
- Ordinary teachers retain instructional/roster support but cannot grant/revoke staff or permanently erase a student.
- Root authority cannot be granted to another email through the UI/callable and cannot be revoked through teacher-access management.

## Administrative interface

- `SignInAccess` is now wired into the real instructor navigation.
- Root sees teacher account/access status, last recorded sign-in, grant/revoke/restore controls, permanent student deletion, and recent audit events.
- Ordinary teachers see class join codes, PIN reset, and Google unlink support without root-only controls.
- Teacher revocation disables the Firebase user, clears claims, and revokes refresh tokens.

## Permanent student deletion

- Requires root-admin server authorization and the exact typed phrase `DELETE <studentId>`.
- Direct deletion of `grades/{studentId}` is denied to every browser client, including a root-admin browser session.
- The callable deletes the Firebase student identity/linked student identity when safe, the complete `grades/{studentId}` tree (including scratchpads and evidence), credentials, aliases, directory links, auth throttle state, mastery/retention state, My Math Path locks/sessions/submissions, modeling-lab submissions, secure-exam sessions/submissions/integrity records, mastery-application markers, and internal Classroom roster/grade-sync records.
- A deletion audit event stores a short one-way receipt digest rather than retaining the deleted student ID.

## Authority hardening

- Google Classroom course, roster, diagnostics, linkage, publication, and publication-history callables now enforce authenticated teacher authority server-side.
- `teacherDirectory`, authentication internals, and `adminAuditLog` remain inaccessible to direct client reads/writes.

## Verification

- Cumulative Node regression suite: 128/128 passing (122 prior Phase 3–6 regressions + 6 root-admin/security regressions).
- Production Vite build: passing.
- `oxlint`: exits 0; warning-only pre-existing/style backlog remains.
- Cloud Functions / admin helper syntax checks: passing.
- Installed Firebase Admin/Firestore runtime confirms `Firestore.prototype.recursiveDelete` is available.
- Exact Phase 6 baseline comparison shows changes only in intended authentication, admin UI, Firestore rules, Classroom authorization, documentation, and new admin regression files.

## Deployment note

Deploy Functions, Firestore rules, and Hosting together. On the next teacher session startup after deployment, the auth provider re-resolves teacher authority and refreshes the token so the root account receives its administrator claims without relying on the old bootstrap environment variable.
