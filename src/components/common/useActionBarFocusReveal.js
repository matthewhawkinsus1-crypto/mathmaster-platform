import { useEffect } from 'react';
import { bindActionBarFocusReveal } from '../../platform/layout/actionBarFocusReveal.js';

/**
 * One line per QuestionEngine host that is not the assignment screen (which
 * has its own scroll-padding): a Tab-focused control the sticky action bar
 * covers is scrolled just clear of it (platform/layout/actionBarFocusReveal.js).
 */
export default function useActionBarFocusReveal(hostRef) {
  useEffect(() => bindActionBarFocusReveal(() => hostRef.current), [hostRef]);
}
