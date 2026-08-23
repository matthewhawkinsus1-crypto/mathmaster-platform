# Deploying MathMaster from Google Cloud Shell

- **Project:** `mathmaster-aleks`
- **Repository:** `matthewhawkinsus1-crypto/mathmaster-platform`, branch `main`
- **Everything lives in Firebase.** Hosting, Cloud Functions and Firestore
  rules all go out in one command. There is no Vercel and no second server —
  older code comments that mention one are out of date.

Open **https://console.cloud.google.com**, click the terminal icon (`>_`) top
right, and wait for the `$` prompt.

---

## Block 1 — sign in (first time, or if a deploy says you are not authorised)

```
firebase login --no-localhost
```

Copy the link it prints, open it in a new tab, allow access, copy the code it
gives you and paste it back.

---

## Block 2 — the whole deploy, one paste

Handles everything: clones the repo if it is not there, pulls the latest code,
writes the required setting, installs, builds, and deploys hosting + functions +
Firestore rules together.

```
cd ~ && { [ -d mathmaster-platform ] || git clone https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git; } && cd mathmaster-platform && git checkout main && git pull origin main && echo "VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction" > .env.production.local && npm install && npm run build && firebase deploy --project mathmaster-aleks
```

Every step is chained with `&&`, so if one fails the rest **stop** rather than
deploying a stale or misconfigured build. Takes several minutes; most of it is
the deploy at the end.

Three things in there matter and are easy to leave out by hand:

- `VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction` — without it the build
  succeeds and My Math Path then refuses to run. That refusal is deliberate: a
  deployment that lost this setting used to serve students sandbox questions and
  record fake mastery for them. Writing it every time removes the failure mode.
- `npm install` — libraries get added between releases and the build fails
  without them, with an error that does not say so clearly.
- Plain `firebase deploy`, **not** `--only hosting`. Firestore rules changed in
  the current release, and the app also checks that the website and the
  functions are on the same release and warns teachers when they are not.

Finish line:

```
+  Deploy complete!
Hosting URL: https://mathmaster-aleks.web.app
```

---

## Block 3 — confirm it landed

```
cd ~/mathmaster-platform && echo "--- deployed commit ---" && git log --oneline -1 && echo "--- site ---" && curl -s -o /dev/null -w "HTTP %{http_code}\n" https://mathmaster-aleks.web.app && echo "--- functions ---" && firebase functions:list --project mathmaster-aleks 2>/dev/null | head -12
```

Expect `HTTP 200` and a list of functions.

---

## Block 4 — refresh the question bank (in the browser, not the terminal)

Deploying updates the questions **inside Cloud Functions**. The copies already
saved in Firestore stay as they were until you do this, so new and corrected
questions do not reach students without it.

1. Open **https://mathmaster-aleks.web.app**
2. Sign in as **matthew.hawkins@desotoisd.org** — the administrator account. No
   other account can do this, and the error now names the required account if
   you use the wrong one.
3. **Administration → My Math Path content coverage**
4. Press **Initialize / refresh built-in starter bank**
5. Wait for **Import complete**

Safe to run as often as you like. It is all-or-nothing: every question is
validated by the production issuer before anything is written.

Then, on the same screen, **Path deployment status** should show the web release
and the server release **matching**, and a secure bank count in the thousands.

---

## Nothing else needs updating

No Vercel deploy, no Firestore composite indexes (nothing in the app uses a
compound query that would need one), and no manual database work beyond Block 4.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| The chain stops at `npm install` | Run Block 2 again — usually a network hiccup. |
| The chain stops at `npm run build` | Send me the error. Do not deploy; the chain already stopped for you. |
| `Failed to get Firebase project` / `permission denied` | Run Block 1, then Block 2. |
| Path screens say "not configured on this deployment" | The build ran without the setting. Run Block 2 again — it writes it. |
| Teacher sees "restricted to the root administrator" | Wrong account. The message names the one to use. |
| Website looks unchanged | Hard refresh: **Ctrl+Shift+R**. |
| Students still see old questions | Block 4 was skipped. |
| **"Functions deploy had errors"** / several functions failed | See the section below — this one is expected occasionally and is not a code problem. |

---

## If several functions fail to deploy

This is the common one, and it usually means nothing is wrong with the code.

The project ships **76 Cloud Functions from one codebase**. `firebase deploy`
pushes them in big parallel batches, and Google rate-limits how many function
updates a project may make per minute. Past that ceiling the extra ones come
back as failures. Hosting and Firestore rules still went out fine; only some
functions are stale.

The giveaway is that the failures name *different* functions each time you try,
or the error text mentions **quota**, **rate**, **429**, **too many requests**
or **operation timed out**. If the same one or two functions fail every single
time with the same message, that is a real error — jump to step 3.

### Step 1 — retry exactly what the CLI told you to

When it fails, the CLI prints a ready-made command near the bottom, like:

```
To try redeploying those functions, run:
    firebase deploy --only "functions:listClasses,functions:saveClass"
```

Copy that line, add the project, and run it:

```
cd ~/mathmaster-platform && firebase deploy --only "functions:PASTE_THE_NAMES_HERE" --project mathmaster-aleks
```

Most of the time this finishes clean, because you are now deploying a handful
instead of 76.

### Step 2 — if it keeps failing, deploy them a few at a time

This walks the whole list in groups of ten, waits between groups so the
per-minute quota refills, and retries a group that fails. It takes roughly
20–30 minutes and needs no babysitting.

```
cd ~/mathmaster-platform && git pull origin main && bash scripts/deploy-functions-in-groups.sh
```

It prints `All 76 functions deployed.` at the end. If some still fail it lists
them by name and prints the exact command to retry just those.

Smaller groups if the network is unhappy:

```
cd ~/mathmaster-platform && GROUP_SIZE=5 bash scripts/deploy-functions-in-groups.sh
```

### Step 3 — if the same functions fail every time

Then it is a real error and I need to see it. Run this and send me everything
it prints:

```
cd ~/mathmaster-platform && firebase deploy --only functions --project mathmaster-aleks 2>&1 | tail -60
```

Two causes worth knowing about:

- **Missing secrets.** The Google Classroom functions need three secrets to
  exist. Check with `firebase functions:secrets:access GOOGLE_OAUTH_CLIENT_ID --project mathmaster-aleks`
  (repeat for `GOOGLE_OAUTH_CLIENT_SECRET` and `LINK_ENCRYPTION_KEY`). If one is
  missing, every Classroom function fails and nothing else does.
- **A disabled API.** A first-time deploy needs Cloud Build, Artifact Registry
  and Cloud Run enabled. The error names the API and gives a link that turns it
  on.

### Checking what actually landed

```
cd ~/mathmaster-platform && firebase functions:list --project mathmaster-aleks | wc -l
```

76 functions plus a header row or two. Far fewer means the retry is still owed.

### Starting over

Nothing here is destructive. If the Cloud Shell copy gets into a strange state,
throw it away — the code is on GitHub — then run Block 2, which re-clones:

```
cd ~ && rm -rf mathmaster-platform
```
