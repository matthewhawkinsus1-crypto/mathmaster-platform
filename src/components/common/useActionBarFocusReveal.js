import { useEffect } from 'react';
import { bindActionBarFocusReveal } from '../../platform/layout/actionBarFocusReveal.js';

/**
 * One line per QuestionEngine host that is not the assignment screen (which
 * has its own scroll-padding): a Tab-focused control the sticky action bar
 * covers is scrolled just clear of it (platform/layout/actionBarFocusReveal.js).
 * `selector` names another sticky bar to keep focus clear of (the teacher's
 * Grade Export selection bar); without it, the QuestionEngine's.
 */
export default function useActionBarFocusReveal(hostRef, { selector = null } = {}) {
  useEffect(() => bindActionBarFocusReveal(() => hostRef.current, selector ? { selector } : undefined), [hostRef, selector]);
}
