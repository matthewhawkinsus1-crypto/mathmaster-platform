/*
 * MY MATH PATH'S LANDMARKS. Plain JS (no React) so node tests can run it;
 * MyMathPathApp.jsx renders from it.
 */

// ONE h1 PER SCREEN (WCAG 1.3.1 / 2.4.6). These views draw their own h1
// ("Welcome back", "My Progress", "Practice History"); every other view gets
// the header's "My Math Path" as its h1, so a screen-reader student who jumps
// to the top heading hears which screen this is — and never hears two.
export const TABS_WITH_OWN_H1 = Object.freeze(['dashboard', 'progress', 'history']);
// A teacher's read-only inspector and the Path Simulator embed this screen
// inside a teacher page, under that page's own h1 and main: there it adds
// neither.
export const pathHeaderIsH1 = ({ activeTab, embedded = false } = {}) => (
  !embedded && activeTab !== 'session' && !TABS_WITH_OWN_H1.includes(activeTab)
);
// The content below the header is the screen's main landmark — except in a
// running session, where PathSessionPlayer draws its own main.
export const pathContentIsMain = ({ activeTab, embedded = false } = {}) => (
  !embedded && activeTab !== 'session'
);
