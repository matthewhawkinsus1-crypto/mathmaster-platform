/*
 * WHERE THE SKIP LINK LANDS (WCAG 2.4.1 Bypass Blocks). Pure DOM logic, no
 * React: SkipToContent (pageChrome.jsx) calls it on activation.
 */

export const MAIN_CONTENT_ID = 'mm-main-content';

// The name every student screen gives its global navigation (StudentGlobalNav's
// default label). A screen that renames it is invisible to the skip link,
// which then falls back to the shell's empty anchor.
export const STUDENT_NAVIGATION_LABEL = 'Student navigation';
const NAVIGATION_SELECTOR = `nav[aria-label="${STUDENT_NAVIGATION_LABEL}"]`;

// Each student screen renders its own navigation INSIDE its content, so the
// shell's anchor sits before the nav. Land on the first main landmark or
// heading AFTER the navigation; the anchor is the fallback.
export const skipTarget = (doc, targetId = MAIN_CONTENT_ID) => {
  if (!doc) return null;
  const anchor = doc.getElementById(targetId);
  const nav = [...doc.querySelectorAll(NAVIGATION_SELECTOR)].find((element) => element.getClientRects().length > 0);
  if (nav) {
    const after = [...doc.querySelectorAll('main, [role="main"], h1, h2')].find((element) => (
      !nav.contains(element)
      && (nav.compareDocumentPosition(element) & 4) // DOCUMENT_POSITION_FOLLOWING
      && element.getClientRects().length > 0
    ));
    // A main landmark is entered at its first heading, so the student hears
    // where they landed ("Your Weekly Math Path, heading") rather than a
    // silent region; a main with no heading is the target itself.
    if (after && after.matches('main, [role="main"]')) {
      return [...after.querySelectorAll('h1, h2')].find((heading) => heading.getClientRects().length > 0) || after;
    }
    if (after) return after;
  }
  return anchor;
};

