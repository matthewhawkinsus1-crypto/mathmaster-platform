/*
 * THIS WEEK'S PATH COMPLETION ON A TEACHER'S SCREEN: FRESH WITHIN A MINUTE,
 * AND NO CALL THAT SHOWS NOTHING.
 *
 * Home, Grades and the Weekly Path tab show who has completed this week's
 * Path sessions, from a callable (getTeacherWeeklyPathCompletions, which
 * reads the class's Path sessions on the server). App called it on every
 * entry to Home or Grades, again every 60 seconds while there, hidden page or
 * not, and, in Grades with no class chosen yet, for the first class, which
 * nothing on that screen shows. Now:
 *
 *   - only for the class the screen shows (weeklyPathProgressClassId);
 *   - an entry within a minute of the answer the screen already holds, for
 *     the same teacher, class and week, calls nothing;
 *   - while the teacher is on it, it is asked again a minute after it was
 *     last asked, whichever of those screens asked, so a completion still
 *     shows within about a minute;
 *   - nothing is asked while the page is hidden. Shown again, a stale answer
 *     is asked for once, at once, and the minute runs from there.
 *
 * One controller per page (App.jsx keeps it, from the teacher kit, and
 * forgets it when the account changes). `watch` is one screen showing a class
 * and returns `stop`, the screen going away. Its answer is applied while that
 * class is the one shown last, even after the screen went: what the screen
 * holds is then that answer, and the next entry within the minute uses it.
 */
export const WEEKLY_PATH_PROGRESS_FRESH_MS = 60_000;

/**
 * The class whose weekly Path completion this screen shows, or null.
 *
 * The Weekly Path tab shows the first class while none is chosen (its class
 * selector does). Home counts completion in its needs-attention panel only for
 * a chosen class, and Grades shows the weekly Path grade only under one: with
 * none chosen, they show no class's completion.
 */
export const weeklyPathProgressClassId = ({ teacherTab, activeClassId = null, classes = [] } = {}) => {
  if (teacherTab === 'weeklyPath') return activeClassId || classes[0]?.classId || null;
  if (teacherTab === 'home' || teacherTab === 'grades') return activeClassId || null;
  return null;
};

export const createWeeklyPathProgressRefresh = ({
  freshMs = WEEKLY_PATH_PROGRESS_FRESH_MS,
  now = () => Date.now(),
  timers = { set: (callback, delay) => setTimeout(callback, delay), clear: (handle) => clearTimeout(handle) },
  page = typeof document === 'undefined' ? null : document,
} = {}) => {
  // The screen (teacher and class) shown last, and the answer it holds:
  // { key, at }, the key naming the week too, `at` when it was asked for.
  let shown = null;
  let answer = null;
  // When each key was last asked for, answered or not: the next ask is due a
  // minute later. And the one call on its way, if any, with the call the
  // loading line is for.
  const lastAsked = new Map();
  let inFlight = null;
  let loadingFor = null;

  const ask = (key, screen, period, { showLoading = false } = {}) => {
    if (inFlight?.key === key) return inFlight.promise;
    const at = now();
    lastAsked.set(key, at);
    const promise = Promise.resolve()
      .then(() => screen.fetch(period))
      .then((result) => {
        if (shown !== screen.id) return;
        screen.apply(result);
        answer = { key, at };
      }, (error) => {
        if (shown !== screen.id) return;
        // The screen drops what it held (App.jsx): there is no answer now.
        answer = null;
        screen.fail(error);
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
        if (loadingFor === promise) {
          loadingFor = null;
          screen.loading?.(false);
        }
      });
    inFlight = { key, promise };
    if (showLoading) {
      loadingFor = promise;
      screen.loading?.(true);
    }
    return promise;
  };

  return {
    /**
     * One screen showing one class: `id` names the teacher and class,
     * `period()` the week as of now; `fetch(period)` calls the callable,
     * `apply(result)` and `fail(error)` set what the screen shows, and
     * `loading(on)` its loading line. Returns stop().
     */
    watch(screen) {
      shown = screen.id;
      let timer = null;
      let stopped = false;
      const clear = () => {
        if (timer !== null) timers.clear(timer);
        timer = null;
      };
      const refresh = (options) => {
        const period = screen.period();
        ask(`${screen.id}|${period}`, screen, period, options).then(() => { if (!stopped) plan(); });
      };
      // The next ask: when it is due, and only while the page is shown.
      function plan() {
        clear();
        if (stopped || page?.visibilityState === 'hidden') return;
        const key = `${screen.id}|${screen.period()}`;
        const wait = lastAsked.has(key) ? lastAsked.get(key) + freshMs - now() : 0;
        if (wait <= 0) refresh();
        else timer = timers.set(() => { timer = null; refresh(); }, wait);
      }
      const key = `${screen.id}|${screen.period()}`;
      if (answer?.key === key && now() - answer.at < freshMs) plan();
      else refresh({ showLoading: true });
      page?.addEventListener?.('visibilitychange', plan);
      return () => {
        stopped = true;
        clear();
        page?.removeEventListener?.('visibilitychange', plan);
      };
    },
    /** Another account, or none: nothing held, nothing on its way is applied. */
    forget() {
      shown = null;
      answer = null;
      lastAsked.clear();
      inFlight = null;
      loadingFor = null;
    },
  };
};
