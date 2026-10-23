# Lesson walkthrough harness (reference copy)

These are the files used for the 2026-10-22 walkthroughs. They are stored as `.txt` so they are not part of the build. To use them:

1. Copy them into place:
   ```
   cp lessonWalkthroughMain.jsx.txt <checkout>/tests/browser/lessonWalkthroughMain.jsx
   cp lessonWalkthrough.html.txt <checkout>/tests/browser/lessonWalkthrough.html
   ```
2. Start Vite with `npx vite --host 127.0.0.1 --port 5199`.
   - If `node_modules` is a symlink to another checkout, use `vite.walk.config.mjs.txt` (saved as `vite.walk.config.mjs`, then `--config vite.walk.config.mjs`). It allows the real `node_modules` folder, which MathLive's fonts need.
3. Open `http://127.0.0.1:5199/tests/browser/lessonWalkthrough.html?lesson=<path under teacher-import-jsons>`.
   - Add `&run=<name>` for a fresh student.
   - Add `&q=<questionId>` to open on one question.

The lesson goes through the teacher-import chain and mounts the real `QuestionEngine` with App.jsx's props:
- the question record via `recordQuestionAttempt`;
- the effective activity policy and attempts;
- Guided Notes, the calculator setting, "practise one like this" and `dolMode`.

`window.__walk` is a read-only bridge: `ids`, `sections`, `go`, `drafts`, `grades`, `records`, `question`, `preflight`, `errors`.
