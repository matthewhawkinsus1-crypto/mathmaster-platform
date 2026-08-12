# MathMaster Path / Vercel deployment fix — 2026-08-11

## What the screenshots proved

The live site shown in the screenshots is `mathmaster-platform.vercel.app`. Its Path Simulator still displays the old message:

> Create an assignment first.

and Administration has `Recompute from bank` but does not show the one-click built-in starter-bank initializer.

Those two UI details exist in the older `(5)` web client, not in the current Path assignment-independent build. Deploying Firebase Hosting therefore does not update the site the teacher is actually opening on Vercel.

## Correct production topology

- **Web client:** Vercel (`mathmaster-platform.vercel.app`)
- **Backend / secure bank:** Firebase Cloud Functions + Firestore (`mathmaster-aleks`)

Deploy the backend first, then deploy the same source tree to Vercel.

## Chromebook / Cloud Shell deployment

From the root of this project:

```bash
npm ci
cd functions
npm ci
cd ..
npm run build
npx firebase deploy --only functions
npx vercel --prod
```

On the first Vercel CLI use, link the directory to the existing Vercel project named `mathmaster-platform`; do not create a second production project.

After deployment:

1. Open `mathmaster-platform.vercel.app` in a new tab.
2. Sign out and back in as Root Admin.
3. Open Administration → Path content coverage.
4. Verify **Path deployment status** shows the same web and server release: `path-bank-2026-08-11-r3`.
5. Verify the page shows **Initialize / refresh built-in starter bank**.
6. If Secure bank is 0, click that initializer. Do not press Recompute first.
7. After initialization, coverage is recomputed automatically.
8. Open Teacher Path Simulator. It must no longer require an assignment; it loads from the secure Path bank.

## Important behavior

`Recompute from bank` never creates questions. It only rebuilds the coverage index from documents already in `pathQuestionBank`.

The built-in initializer is what installs the secure starter bank on a fresh deployment.

## New diagnostics in this build

Administration now shows:

- web Path release
- deployed Functions Path release
- secure Path-bank question count
- built-in starter availability/count

A frontend/backend mismatch produces an actionable message instead of the bare Firebase `internal` error.
