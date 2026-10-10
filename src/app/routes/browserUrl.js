/*
 * The address bar, for the history writers.
 *
 * Every history entry the app writes gets the path of the screen it records
 * (appUrl.js). On a harness or tools-lab page (pathRoutesEnabled false) the
 * writers keep the page's own URL, exactly as before addresses existed.
 */
import { parseAppPath, pathRoutesEnabled, searchWithoutLaunch, studentPathFor, teacherPathFor } from './appUrl.js';

const browserLocation = () => (typeof window !== 'undefined' && window.location ? window.location : null);

const withSearch = (path, location) => `${path}${searchWithoutLaunch(location.search)}`;

/** The URL for a student screen, or null to keep the current one. */
export const studentUrlFor = (route, extras = {}) => {
  const location = browserLocation();
  if (!location || !pathRoutesEnabled(location.pathname)) return null;
  if (route?.surface === 'dashboard' && route.dashboardMode === 'mathPath' && !extras.mathPath) {
    // My Math Path writes its own tab and session into the address
    // (MyMathPathApp); while the address is already inside My Math Path, the
    // outer screen keeps it rather than flattening it back to /path.
    const current = parseAppPath(location.pathname);
    if (current.area === 'student' && current.route.dashboardMode === 'mathPath') {
      return withSearch(location.pathname, location);
    }
  }
  return withSearch(studentPathFor(route, extras), location);
};

/** The URL for a My Math Path tab or session, or null to keep the current one. */
export const mathPathUrlFor = (route = {}) => {
  const tab = route?.tab || 'path';
  const skill = tab === 'session' ? route?.sessionConfig?.targetAlignmentKey || null : null;
  return studentUrlFor({ surface: 'dashboard', dashboardMode: 'mathPath' }, { mathPath: { tab, skill } });
};

/** The URL for a teacher screen, or null to keep the current one. */
export const teacherUrlFor = (route) => {
  const location = browserLocation();
  if (!location || !pathRoutesEnabled(location.pathname)) return null;
  return withSearch(teacherPathFor(route), location);
};

/**
 * Signing out returns the address to "/". The next person to sign in on a
 * shared Chromebook starts on their own Home, not at the address the last
 * student left in the bar.
 */
export const resetAddressToHome = () => {
  const location = browserLocation();
  if (!location || !pathRoutesEnabled(location.pathname) || typeof window.history?.replaceState !== 'function') return;
  if (location.pathname === '/') return;
  window.history.replaceState(null, '', withSearch('/', location));
};
