/*
 * A STUDENT'S WEEK OF MY MATH PATH ON HOME AND MY MATH PATH: FRESH WITHIN A
 * MINUTE, AND AT ONCE AFTER ANY PATH WORK.
 *
 * Home says whether this week's Path sessions are done, from two callables:
 * getStudentWeeklyPathGoalSnapshot (the week the server froze for the
 * student) and getMyWeeklyPathCompletions (the sessions it counts). My Math
 * Path shows the week's sessions from getMyWeeklyPathCompletions and freezes
 * the week with resolveWeeklyPathGoalSnapshot. Each screen called them on
 * every visit, and My Math Path asked for the completions again when its
 * practice history came back, twice after a session and twice more back on
 * its dashboard. One page's answers now serve both screens:
 *
 *   - the completions are asked for again only when the answer held for the
 *     same student, class and week is a minute old, or the student did Path
 *     work in this page after it was asked (a session started, a question
 *     issued or answered: pathSessionService.js says so). A session the
 *     student just finished is on the next screen they see, Home or My Math
 *     Path, because what was held before it is never used after it;
 *   - a week the server froze stays as it was frozen (functions/index.js
 *     writes it once and never changes it), so it is asked for once a page,
 *     by Home's read or My Math Path's freeze, and serves both. "Not frozen
 *     yet" is held for a minute, and not past an attempt to freeze it;
 *   - one call on its way serves every screen that wants it;
 *   - nothing is asked while the page is hidden. Shown again, what came due
 *     while it was hidden is asked for, once;
 *   - a failure holds nothing. The screen says it has no answer (Home's
 *     "Check your Math Path", My Math Path's Try again), never a zero, and it
 *     is asked for again a minute later while the screen is there;
 *   - My Progress's recent weeks (getMyWeeklyPathHistory, the weeks hit and
 *     the streak) follow the completions' rule: asked for again only when the
 *     answer held for the same student is a minute old or the student did
 *     Path work after it was asked. My Progress asked for them each time its
 *     tab opened. A failure holds nothing, and Try again asks again.
 *
 * Unlike the teacher's table (weeklyPathProgressRefresh.js), nothing is asked
 * for on a timer while the student looks at a screen: neither screen did,
 * and a student's own week changes only by their own Path work.
 *
 * One per page (pathStore.js keeps it). `forStudent` binds one student and
 * class; `noteWork` is Path work; `forget` is another account.
 */
export const STUDENT_WEEKLY_PATH_FRESH_MS = 60_000;

export const createStudentWeeklyPath = ({
  client,
  freshMs = STUDENT_WEEKLY_PATH_FRESH_MS,
  now = () => Date.now(),
  timers = { set: (callback, delay) => setTimeout(callback, delay), clear: (handle) => clearTimeout(handle) },
  page = typeof document === 'undefined' ? null : document,
} = {}) => {
  // How much Path work this page has done, and how many times it has tried
  // to freeze a week: an answer asked for before the latest is kept for no
  // one else.
  let work = 0;
  let freezes = 0;
  // key -> { facts, at, work }: the completions, asked for at `at`.
  const completions = new Map();
  // key -> { goal, at }: a frozen goal, for good; null, for a minute.
  const goals = new Map();
  // student -> { history, at, work }: My Progress's recent weeks, asked for at `at`.
  const histories = new Map();
  // id -> { stamp, promise }: the one call of each kind on its way.
  const calls = new Map();
  // What waits for the page to be shown.
  const waiting = new Set();

  const hidden = () => page?.visibilityState === 'hidden';
  page?.addEventListener?.('visibilitychange', () => {
    if (hidden()) return;
    const due = [...waiting];
    waiting.clear();
    due.forEach((go) => go());
  });

  // A call joins the one on its way only if that one was asked for after
  // the same work (`stamp`). `keep(answer, at)` holds what it answered.
  const ask = (id, stamp, fetch, keep) => {
    const current = calls.get(id);
    if (current && current.stamp === stamp) return current.promise;
    const at = now();
    const promise = Promise.resolve()
      .then(fetch)
      .then((answer) => {
        keep(answer, at);
        return answer;
      })
      .finally(() => { if (calls.get(id)?.promise === promise) calls.delete(id); });
    calls.set(id, { stamp, promise });
    return promise;
  };

  const freshFacts = (key) => {
    const held = completions.get(key);
    return held && held.work === work && now() - held.at < freshMs ? held.facts : null;
  };
  const knownGoal = (key) => {
    const held = goals.get(key);
    return held && (held.goal || now() - held.at < freshMs) ? held : null;
  };
  const holdGoal = (key, goal, at) => {
    const held = goals.get(key);
    if (held?.goal) return;
    if (goal || !held || held.at <= at) goals.set(key, { goal: goal || null, at });
  };

  const askFacts = (key, weekKey) => {
    const stamp = work;
    return ask(`facts|${key}`, stamp, () => client.completions({ weekKey }), (facts, at) => {
      const held = completions.get(key);
      if (stamp === work && (!held || held.at <= at)) completions.set(key, { facts, at, work: stamp });
    });
  };
  const history = (key) => {
    const held = histories.get(key);
    if (held && held.work === work && now() - held.at < freshMs) return Promise.resolve(held.history);
    const stamp = work;
    return ask(`history|${key}`, stamp, () => client.history(), (answer, at) => {
      const current = histories.get(key);
      if (stamp === work && (!current || current.at <= at)) histories.set(key, { history: answer, at, work: stamp });
    });
  };
  const askGoal = (key, weekKey) => {
    const stamp = freezes;
    return ask(`goal|${key}`, stamp, () => client.goal({ weekKey }), (goal, at) => {
      if (goal || stamp === freezes) holdGoal(key, goal, at);
    });
  };

  // One screen showing one week. `apply({ goal, facts })` gets the answer:
  // at once when it is held, else once asked for. `withGoal` (Home): the
  // frozen goal too, null while there is none.
  const follow = (key, weekKey, { goal: withGoal = false, apply, fail }) => {
    let stopped = false;
    let retry = null;
    // An answer the screen cannot use fails as a call does.
    const failed = (error) => {
      if (stopped) return;
      fail(error);
      retry = timers.set(() => {
        retry = null;
        run();
      }, freshMs);
    };
    const answered = (goal, facts) => {
      if (!stopped) apply({ goal, facts });
    };
    function run() {
      if (stopped) return;
      const goal = withGoal ? knownGoal(key) : null;
      const facts = freshFacts(key);
      if ((goal || !withGoal) && facts) {
        try {
          answered(goal?.goal || null, facts);
        } catch (error) {
          failed(error);
        }
        return;
      }
      if (hidden()) {
        waiting.add(run);
        return;
      }
      Promise.all([
        withGoal && !goal ? askGoal(key, weekKey) : goal?.goal || null,
        facts || askFacts(key, weekKey),
      ]).then(([frozen, asked]) => answered(frozen, asked)).catch(failed);
    }
    run();
    return () => {
      stopped = true;
      waiting.delete(run);
      if (retry !== null) timers.clear(retry);
    };
  };

  const resolve = (key, proposed) => {
    const known = goals.get(key)?.goal;
    if (known) return Promise.resolve(known);
    return new Promise((go) => {
      if (hidden()) waiting.add(go);
      else go();
    }).then(() => {
      freezes += 1;
      return ask(`resolve|${key}`, null, () => client.resolve(proposed), (goal, at) => {
        if (goal) holdGoal(key, goal, at);
      });
    }).finally(() => {
      // An attempt that did not answer may have frozen it all the same.
      if (!goals.get(key)?.goal) goals.delete(key);
    });
  };

  return {
    /**
     * One student's week, as Home and My Math Path ask for it:
     *   follow(weekKey, { goal, apply, fail }) -> stop()
     *   resolve(proposed)  the week frozen from `proposed`: the one already
     *                      known, or the server's (resolveWeeklyPathGoalSnapshot)
     *   frozenGoal(weekKey) the frozen week, if this page knows it
     *   history()          My Progress's recent weeks (getMyWeeklyPathHistory)
     */
    forStudent({ studentId, classId = null } = {}) {
      const keyOf = (weekKey) => `${studentId}|${classId || ''}|${weekKey}`;
      return {
        follow: (weekKey, options) => follow(keyOf(weekKey), weekKey, options),
        resolve: (proposed) => (proposed?.weekKey ? resolve(keyOf(proposed.weekKey), proposed) : Promise.resolve(null)),
        frozenGoal: (weekKey) => goals.get(keyOf(weekKey))?.goal || null,
        history: () => history(`${studentId}`),
      };
    },
    /** The student started a Path session, was issued a question or answered one. */
    noteWork() {
      work += 1;
    },
    /** Another account, or none: nothing held. */
    forget() {
      work += 1;
      freezes += 1;
      completions.clear();
      goals.clear();
      histories.clear();
      calls.clear();
    },
  };
};
