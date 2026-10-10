# Student push — Job H: every tool works by keyboard, screen reader and large text

Branch `claude/student-push-h-tools-access` (PR #463), from `main @ 4dc216e`
(2026-10-10), with `main` merged after job E (#460) landed. Builds on job F
([`STUDENT_PUSH_F_ACCESSIBILITY.md`](STUDENT_PUSH_F_ACCESSIBILITY.md)):
F made the platform layer accessible; this job does the tools, the hosts and
large text.

## Deploy

**Hosting only.** Nothing under `functions/`, `functions-path-admin/`,
`firestore.rules` or the index files changed. No callable, rule, index or
one-off script.

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

<!-- SECTIONS BELOW ARE FILLED IN AT THE END OF THE JOB -->
