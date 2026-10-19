/*
 * A LINK TO A SECTION THAT IS NOT OPEN YET (student pass 3, NAV-22).
 *
 * A Google Classroom post for one section of a live lesson ("Lesson 5 —
 * DOL") is an entrance, not a lock: the student may work the rest of the
 * lesson. Tapped at 1:30 when the exit ticket opens at 2:15, it opens where
 * they can work now — Classwork Question 3 — and used to say nothing, so the
 * student thought the link was broken. This is the one sentence that says why:
 *
 *   "Exit ticket (DOL) is not open right now"
 *   "The exit ticket opens at 2:15 PM — here is Classwork meanwhile."
 *
 * The reason is the navigator's own (describeSectionAccess), so the toast and
 * the section tab say the same thing. It names times and sections only —
 * nothing about any question's answer or method.
 *
 * The exit ticket is spelled out once, in the title, and is "the exit ticket"
 * in the sentence (student words, D9: src/platform/student/studentWords.js).
 *
 * Pure: no React, no clock.
 */

import { EXIT_TICKET_SPELLED_OUT, exitTicketInSentence } from './studentWords.js';

// Read mid-sentence by describeSectionAccess ("… opens at 2:15 PM.").
export const DETOUR_SECTION_LABEL = Object.freeze({
  warmup: 'the Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: `the ${exitTicketInSentence}`,
});

// The toast's title names the section on its own.
const DETOUR_TITLE_LABEL = Object.freeze({ ...DETOUR_SECTION_LABEL, dol: EXIT_TICKET_SPELLED_OUT });

/**
 * @param {object} input
 * @param {string} input.requestedRole  the section the link named
 * @param {string} input.landingRole    the section the student was opened in
 * @param {object} input.access         describeSectionAccess for requestedRole
 * @returns {{ title: string, body: string } | null}  null: nothing to explain
 */
export const describeSectionDetour = ({ requestedRole = null, landingRole = null, access = null } = {}) => {
  if (!requestedRole || !DETOUR_SECTION_LABEL[requestedRole]) return null;
  if (!landingRole || landingRole === requestedRole) return null;
  if (!access || access.workable !== false) return null;
  const label = DETOUR_TITLE_LABEL[requestedRole];
  const title = `${label.charAt(0).toUpperCase()}${label.slice(1)} is not open right now`;
  const reason = String(access.reason || '').trim().replace(/\.$/, '') || title;
  const landing = DETOUR_SECTION_LABEL[landingRole] || 'the work that is open';
  return { title, body: `${reason} — here is ${landing} meanwhile.` };
};

export default describeSectionDetour;
