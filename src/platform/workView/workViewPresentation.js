import { createContext, useContext } from 'react';

/*
 * HOW THE ENCLOSING WORK VIEW IS LAID OUT RIGHT NOW. PRESENTATION ONLY.
 *
 * EnlargeableFigure provides it around its children, embedded and enlarged
 * alike, so the tree above a tool never changes shape when Work View opens or
 * closes. A component reads it only to decide WHERE a piece of its own chrome
 * sits — never what the student has done, and never anything that reaches a
 * response.
 *
 *   enlarged     the shell is open over the page.
 *   shortHeight  it is open on a screen with almost no height (a phone on its
 *                side): the staged question's step heading joins the
 *                Previous/Next row instead of taking a row of its own (PQ-020).
 */
const EMBEDDED = Object.freeze({ enlarged: false, shortHeight: false });

export const WorkViewPresentationContext = createContext(EMBEDDED);

export const useWorkViewPresentation = () => useContext(WorkViewPresentationContext);
