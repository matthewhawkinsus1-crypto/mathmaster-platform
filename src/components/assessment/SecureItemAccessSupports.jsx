import React, { Suspense, lazy, useMemo } from 'react';
import { secureAccessEntitlement, securePromptOnly } from '../../platform/assessment/secureItemAccess.js';

// The tray, its glossary and its language packs are their own chunks: a
// student without one of these supports downloads none of them.
const SecureSupportToolsTray = lazy(() => import('./SecureSupportToolsTray.jsx'));

/*
 * READ ALOUD, TRANSLATE AND VOCABULARY FOR A SECURE ITEM'S PROMPT.
 *
 * The Support tools a student meets on every assignment — the same speech,
 * the same translation providers, the same glossary, the same evidence
 * records (SecureSupportToolsTray.jsx says what it shares and what it shows
 * differently) — given two limits that make them safe on a secure item:
 *
 *   WHICH TOOLS. Read aloud, Translate and Vocabulary, and only when the
 *   student's own plan grants them for a test (secureItemAccess.js). A
 *   student without one sees nothing, and downloads nothing.
 *
 *   WHAT THEY READ. The prompt, and nothing else of the item
 *   (securePromptOnly): no choices, no response fields, no stimulus.
 *
 * WHY EACH ONE CANNOT GIVE AWAY AN ANSWER.
 *
 *   Read aloud says the words already on the screen, through the browser's
 *   own speech engine. It adds nothing to the prompt; MathMaster sends the
 *   text to no service.
 *
 *   Translate shows the prompt's sentences in the student's language from an
 *   authored translation of that prompt or a bundled pack of direction
 *   sentences, with every number and expression carried through exactly as
 *   authored (a translation that would change the mathematics is refused).
 *   MathMaster has no machine translation, so nothing is sent anywhere; where
 *   neither source covers the prompt, Translate simply does not appear and the
 *   gap is recorded as unavailable.
 *
 *   Vocabulary gives the math words the prompt uses — "slope", "intercept" —
 *   with their definitions from a fixed glossary that explains a word, never
 *   an item. The glossary's worked examples ("…has slope 2") are left out on
 *   a secure item: an example applies the word, and can apply it to exactly
 *   what the item asks (secureSupportPanels.js).
 *
 * None of them can see a key, a solution or a verdict: the secure payload
 * carries none, and these components are handed only the prompt.
 *
 * ONE MOUNT PER EXAM IS FINE. A new `question` (a new questionInstanceId)
 * starts the tray clean — nothing open, nothing being read, no Stop reading
 * left from the item before — without being remounted.
 */

/**
 * @param question               the issued secure item (only `prompt`, and an
 *                               authored translation of it, are read)
 * @param studentSupportProfile  the student's OWN profile — not the flattened
 *                               assessment profile, which loses the plan's
 *                               per-activity limits (secureItemAccess.js)
 * @param onSupportEvidence      optional: the tray's evidence records
 *                               ({ supportId, eventType, details })
 */
export default function SecureItemAccessSupports({
  question,
  studentSupportProfile,
  onSupportEvidence = null,
  nowValue = null,
}) {
  const computed = secureAccessEntitlement(studentSupportProfile, { nowValue: nowValue ?? Date.now() });
  // Stable by value: a parent that rebuilds the profile object every render
  // must not make the tray resolve its translation again.
  const entitlementKey = `${computed.tools.join(',')}|${computed.language || ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entitlement = useMemo(() => computed, [entitlementKey]);
  const promptOnly = useMemo(() => securePromptOnly(question), [question]);
  const itemKey = String(question?.questionInstanceId || question?.questionId || '');

  if (!entitlement.tools.length || !promptOnly.prompt.trim()) return null;

  return (
    // No margin of its own: the tray brings its own space, so an item where
    // no tool has anything to offer leaves no gap under the prompt.
    <div data-secure-access-supports={itemKey || 'item'} style={{ minWidth: 0, textAlign: 'left' }}>
      <Suspense fallback={null}>
        <SecureSupportToolsTray
          entitlement={entitlement}
          prompt={promptOnly.prompt}
          question={promptOnly}
          itemKey={itemKey}
          surface="secure-item"
          onEvidence={onSupportEvidence}
        />
      </Suspense>
    </div>
  );
}
