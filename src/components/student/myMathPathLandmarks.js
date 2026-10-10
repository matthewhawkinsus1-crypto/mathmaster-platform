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

// THE h1 LOOKS LIKE THE OLD <strong>. Promoting the header title to an h1
// must not restyle it: src/index.css gives every h1 a heading font, 56px,
// margins and letter-spacing -1.68px, which squeezed "My Math Path" ~18%
// narrower than on the tabs where it stays a <strong>. So the h1 is a bare
// structural wrapper that inherits every typographic property, and the text
// inside it is the same <strong> the other tabs draw.
export const PATH_HEADER_H1_STYLE = Object.freeze({
  margin: 0,
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  fontStyle: 'inherit',
  letterSpacing: 'inherit',
  lineHeight: 'inherit',
  textTransform: 'inherit',
  color: 'inherit',
});
