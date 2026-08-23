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

### Starting over

Nothing here is destructive. If the Cloud Shell copy gets into a strange state,
throw it away — the code is on GitHub — then run Block 2, which re-clones:

```
cd ~ && rm -rf mathmaster-platform
```
