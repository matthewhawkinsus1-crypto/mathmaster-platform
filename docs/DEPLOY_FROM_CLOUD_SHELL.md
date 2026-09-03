# Deploying MathMaster from Google Cloud Shell

> **This site is live and holds real student records.** Deploys land in front of
> real classes, and the Administration tab's **Pre-production reset** permanently
> deletes student accounts, grades, attempts and Path history. Once the roster is
> real, close that door for good with **Lock reset for production** — the lock is
> one-way and cannot be undone.

## Assignment V5 pre-production release

Assignment V5 now includes built-in AI assignment authoring. Before the first deploy of this release, create the Firebase server secret once:

```
firebase functions:secrets:set OPENAI_API_KEY --project mathmaster-aleks
```

When Firebase prompts for the value, paste the OpenAI key created for **MathMaster Assignment AI**. The key stays in Firebase Secret Manager and is not placed in browser code or the repository.

The API project behind that key also needs available billing credit and access to
the configured model. A key that is valid but out of credit is the single most
common reason the built-in AI stops working, and it is not something a deploy can
fix.

### Checking the AI after a deploy

Sign in as the root administrator and open **Administration → Assignment AI
health → Run AI connection check**. It makes one tiny real request and names the
cause directly — credential, model entitlement, billing quota, or network egress
— instead of the generic "AI is unavailable". Every teacher-facing AI failure is
also written to Cloud Logging under `Integrated assignment AI failed` and to the
`assignmentAiAudit` collection, with provider status and token counts but no
prompt, no assignment content, and nothing student-identifying.

Two optional Functions environment values tune the authoring model:

| Variable | Default | Use it when |
| --- | --- | --- |
| `OPENAI_ASSIGNMENT_MODEL` | `gpt-5` | The API project should author with a different model. |
| `OPENAI_ASSIGNMENT_REASONING_EFFORT` | `medium` (`low` for repairs) | Builds are timing out or exhausting the output budget. |

To ship only the AI surfaces after a change to them, use the focused helper
instead of a full deploy — it pushes Hosting plus `authorAssignmentWithAI`,
`repairAssignmentQuestionWithAI`, `assignmentAiSelfTest` and
`hydrateAssignmentCcmr`:

```
bash scripts/deploy-assignment-v5-followup.sh
```

For a full release, the preferred deployment is the guarded one-command helper:

```
cd ~ && { [ -d mathmaster-platform ] || git clone https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git; } && cd mathmaster-platform && git checkout main && git pull origin main && bash scripts/deploy-v5-preproduction.sh
```

The helper updates `main`, verifies `OPENAI_API_KEY`, installs exact dependencies, runs the permanent Assignment V5 gates, builds Firebase Hosting in production mode, deploys Firestore rules/Hosting, deploys Functions in quota-safe groups, and verifies the live site returns HTTP 200. If any gate fails, deployment stops.

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

Use the guarded helper. It pulls the exact latest `main`, verifies the required
server secret, installs exact dependencies, runs the release gates, builds the
Firebase production web runtime, deploys **Cloud Functions first**, then
Firestore rules + Hosting, and finally checks the live site.

```
cd ~ && { [ -d mathmaster-platform ] || git clone https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git; } && cd mathmaster-platform && git checkout main && git pull --ff-only origin main && bash scripts/deploy-v5-preproduction.sh
```

The Functions-first order is intentional. Digital SAT / ACT / TSIA2 and ASVAB
now use release-aware Path sessions, so the new callable/runtime protections
must be live before any release-managed bank is activated.

Finish line:

```
=== MathMaster production deploy completed ===
HTTP 200
```

---

## Block 3 — confirm it landed

```
cd ~/mathmaster-platform && echo "--- deployed commit ---" && git log --oneline -1 && echo "--- site ---" && curl -s -o /dev/null -w "HTTP %{http_code}\n" https://mathmaster-aleks.web.app && echo "--- functions ---" && firebase functions:list --project mathmaster-aleks 2>/dev/null | head -12
```

Expect `HTTP 200` and a list of functions.

---

## Block 4 — activate the production Path banks in the browser

Deploying updates the certified seed packages inside Cloud Functions. Existing
Firestore bank records stay unchanged until the root administrator activates
the corresponding release.

1. Open **https://mathmaster-aleks.web.app**
2. Sign in with the MathMaster root-administrator account.
3. Go to **Administration → My Math Path content coverage**.
4. Confirm **Web release** and **Server release** match.
5. On an existing installation, run these three buttons in order:
   - **Refresh course Path bank** — Grade 6/7/8 + Algebra I/II only.
   - **Refresh ASVAB release** — independent ASVAB release; does not touch SAT/ACT/TSIA2.
   - **Refresh SAT / ACT / TSIA2 release** — coordinated atomic V2.1 release; preserves ASVAB.
6. Confirm each operation reports success and the assessment release manifest is active.
7. Run **Recompute from bank** only if coverage needs to be refreshed manually; the course refresh already rebuilds it.

**Do not use “Fresh installation only” on the existing production database.**
The server intentionally refuses fresh initialization when the secure bank is
already populated.

The generic JSON importer is also **not** a substitute for the release buttons.
Release-managed Digital SAT, ACT, TSIA2, and ASVAB content is blocked from that
route.


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
| Students still see old questions | Re-run the matching Block 4 release button: course, ASVAB, or coordinated SAT/ACT/TSIA2. |
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
