/*
 * SAID ONCE WHEN THE TEACHER REACHES INTO A STUDENT'S SCREEN (pass 3, NAV-23).
 *
 * The Live Challenge lobby invite and a Spotlight request appear on whatever
 * screen the student is on, with no focus move and no announcement: a
 * screen-reader student never knew either was there. This picks the one
 * polite sentence for what has newly appeared; the shell's live region says
 * it. Nothing is said for what was already there, and nothing for the
 * Live Challenge during a secure exam (the invite is not shown there).
 *
 * Pure: no React.
 */

const clean = (value) => String(value ?? '').trim();

// What is on screen now, reduced to what a sentence depends on.
export const classroomAnnouncementState = ({ invite = null, spotlightRequested = false, secureExamActive = false } = {}) => {
  const status = clean(invite?.status).toLowerCase();
  const live = !secureExamActive && ['invited', 'joined', 'running'].includes(status);
  return {
    challenge: live ? `${clean(invite?.roomId)}|${status === 'running' ? 'running' : 'lobby'}` : '',
    spotlight: Boolean(spotlightRequested),
  };
};

/** The sentence for what newly appeared between two states, or ''. */
export const classroomAnnouncement = (previous, next) => {
  const before = previous || { challenge: '', spotlight: false };
  const parts = [];
  if (next?.spotlight && !before.spotlight) {
    parts.push('Your teacher would like to show your work to the class. Choose Present Now or Not Now at the top of the screen.');
  }
  if (next?.challenge && next.challenge !== before.challenge) {
    parts.push(next.challenge.endsWith('|running')
      ? 'The Live Challenge is running now. Join it from the Live Challenge button.'
      : 'Your teacher opened the Live Challenge lobby. Enter it from the Live Challenge button.');
  }
  return parts.join(' ');
};

export default classroomAnnouncement;
