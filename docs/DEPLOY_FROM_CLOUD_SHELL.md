# Deploying MathMaster from Google Cloud Shell

Copy each block, paste it into Cloud Shell, press Enter, wait for it to finish,
then move to the next one. Do not paste two blocks at once.

- **Project:** `mathmaster-aleks`
- **Repository:** `matthewhawkinsus1-crypto/mathmaster-platform`, branch `main`

---

## Open Cloud Shell

1. Go to **https://console.cloud.google.com**
2. Top right, click the **terminal icon** (`>_`). A black window opens at the
   bottom. That is Cloud Shell.
3. Wait until it shows a prompt ending in `$`.

---

# PART ONE — first time only

Skip to Part Two if you have deployed from Cloud Shell before. Running these
again is harmless.

### Step 1 — sign the Firebase tool in to your account

```
firebase login --no-localhost
```

It prints a long link. Copy it, open it in a new tab, choose your Google
account, allow access, copy the code it gives you, paste it back into Cloud
Shell, press Enter.

### Step 2 — download the code

```
cd ~ && git clone https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git
```

If it says `already exists`, that is fine — you already have it.

### Step 3 — tell the build it is the real thing

This one matters. Without it the build finishes successfully and then **My Math
Path refuses to run**, on purpose: a deployment that has lost this setting used
to serve students fake practice questions and record fake mastery for them, so
now it stops instead.

```
cd ~/mathmaster-platform && echo "VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction" > .env.production.local && cat .env.production.local
```

It should print `VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction`.

You only do this once. The file stays in Cloud Shell and is never uploaded to
GitHub.

---

# PART TWO — every deploy

### Step 4 — get the latest code

```
cd ~/mathmaster-platform && git checkout main && git pull origin main
```

### Step 5 — install the libraries

```
cd ~/mathmaster-platform && npm install
```

Takes a minute or two. Warnings are normal. **Do not skip this** — a library the
app needs was added recently, and the build fails without it.

### Step 6 — build the website

```
cd ~/mathmaster-platform && npm run build
```

Wait for `✓ built in ...`. A warning about "chunks larger than 500 kB" is
normal and expected.

If you see the word `error`, stop and send me the message.

### Step 7 — check the build is configured correctly

```
cd ~/mathmaster-platform && cat .env.production.local
```

Must print `VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction`. If it prints
nothing or `No such file`, go back and do Step 3, then repeat Step 6.

### Step 8 — deploy everything

```
cd ~/mathmaster-platform && firebase deploy --project mathmaster-aleks
```

This is the slow one — several minutes. It uploads three things together: the
website, the Cloud Functions, and the database rules.

**Deploy all three together, every time.** The app checks that the website and
the functions are on the same release and warns a teacher if they are not.

Finish line looks like:

```
+  Deploy complete!
Hosting URL: https://mathmaster-aleks.web.app
```

---

# PART THREE — after the deploy

### Step 9 — refresh the question bank

Deploying updates the questions **inside Cloud Functions**, but the copies
already saved in the database stay as they were. This step copies the corrected
questions across. Do it after any deploy where question content changed.

1. Open **https://mathmaster-aleks.web.app**
2. Sign in as **matthew.hawkins@desotoisd.org** — the administrator account.
   No other account can do this, and it will now tell you so by name if you use
   the wrong one.
3. Go to **Administration → My Math Path content coverage**
4. Press **Initialize / refresh built-in starter bank**
5. Wait for **Import complete**

Safe to run as many times as you like.

### Step 10 — check it worked

On the same screen, **Path deployment status** should show the **web release and
the server release matching**, and a **secure bank count above zero**.

Then open a question as a student and confirm:

- the mathematics is typeset — no `$` signs or `\frac` on screen
- fractions are stacked, not written with a slash
- a graph question has an **Enlarge graph** button

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `error` during Step 6 | Run Step 5 again, then Step 6. Send me the message if it repeats. |
| `Error: Failed to get Firebase project` | Run Step 1 again. |
| `permission denied` when deploying | You are signed in as the wrong Google account. Run `firebase logout`, then Step 1. |
| Path screens say "not configured on this deployment" | Step 3 was missed. Do Step 3, then Steps 6 and 8. |
| Teacher sees "restricted to the root administrator" | Wrong account. The message now names the one to use. |
| Website looks unchanged | Hard refresh: **Ctrl+Shift+R**. |

## Starting over

Nothing here is destructive, but if the Cloud Shell copy gets into a strange
state you can throw it away and re-clone — the code lives on GitHub:

```
cd ~ && rm -rf mathmaster-platform
```

Then do Part One again.
