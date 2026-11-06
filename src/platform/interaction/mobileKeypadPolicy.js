// Pure mobile-keypad policy.
//
// MathInput owns the actual key definitions, but this module owns the layout
// rules that must stay true across every equation answer:
//   - ( and ) are always directly available;
//   - duplicate semantic keys (especially '=') are removed;
//   - nth-root is omitted from the crowded generic equation pad unless the
//     question explicitly marks it as required;
//   - Backspace stays last.
//
// Keeping the rules pure makes them testable without loading MathLive/React.

const semanticKey = (tool = {}) => {
  if (tool.action) return `action:${tool.action}`;
  if (tool.command) return `command:${tool.command}`;
  return `label:${tool.label || ''}`;
};

export const dedupeMobileTools = (tools = []) => {
  const seen = new Set();
  return (tools || []).filter((tool) => {
    const key = semanticKey(tool);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// `number` needs no operators at all; `orderedPair` brings its own brackets and
// comma, so the shared row would only duplicate them.
const NUMERIC_ONLY_PROFILES = new Set(['number', 'orderedPair']);

// Signs and separators that cannot appear in a bare number.
const NON_NUMERIC_ENTRY_LABELS = new Set(['=', '+', ',']);

// An ordered pair is the one numeric profile that genuinely needs a separator.
const KEEPS_COMMA = new Set(['orderedPair']);

const OPEN_PAREN = { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' };
const CLOSE_PAREN = { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' };

const isNthRoot = (tool = {}) => (
  String(tool.ariaLabel || '').toLowerCase() === 'insert nth root'
  || String(tool.label || '') === 'ⁿ√'
);

const isRequiredTool = (tool, requiredTools = []) => {
  const key = semanticKey(tool);
  return requiredTools.some((required) => semanticKey(required) === key);
};

/*
 * ⁿ√ ON AN EQUATION PAD ONLY WHERE THE ANSWER NEEDS IT (F-KEYPAD-GENERIC).
 * The generic equation pad is crowded and an nth root is rarely part of an
 * equation's answer, so its key is left off unless the field requires it (a
 * declared symbol, or one read from its accepted answers). A phone's pad has
 * always done this; a laptop's does it on practice (MathInput). A required key
 * is still served: the phone's "Needed for this answer" row, the laptop's pad.
 */
export const nthRootOnlyWhereNeeded = (keys = [], { toolProfile = '', requiredTools = [] } = {}) => (
  String(toolProfile) === 'equation'
    ? (keys || []).filter((tool) => !isNthRoot(tool) || isRequiredTool(tool, requiredTools))
    : (keys || [])
);

export const buildMobileMathTools = ({
  toolProfile = '',
  entryKeys = [],
  profileKeys = [],
  requiredTools = [],
  backspaceKey = null,
} = {}) => {
  let profile = [...(profileKeys || [])];

  /*
   * PROFILES THAT ARE JUST NUMBERS GET JUST NUMBERS.
   *
   * The rules below were written for algebra entry, where parentheses are
   * foundational and the shared entry row is the least a student needs. Applied
   * to a numeric answer they are the opposite of help: `=`, `+`, `,` and a pair
   * of parentheses cannot appear in a valid number, and every key that cannot
   * be part of the answer is one more thing to read past on a phone.
   */
  const numeric = NUMERIC_ONLY_PROFILES.has(String(toolProfile));

  if (!numeric) {
    // Parentheses are foundational math-entry keys and must never disappear on
    // touch devices merely because a renderer chose "expression" instead of
    // "equation". Dedupe removes them when a specialized profile already has them.
    profile = [OPEN_PAREN, CLOSE_PAREN, ...profile];
  }

  profile = nthRootOnlyWhereNeeded(profile, { toolProfile, requiredTools });

  // The shared entry row carries `=`, `+` and `,` for algebra. None of them can
  // appear in a bare number, so a numeric pad drops them and keeps the digits,
  // the decimal point and the sign.
  const entry = numeric
    ? (entryKeys || []).filter((tool) => {
      const label = String(tool?.label);
      if (label === ',' && KEEPS_COMMA.has(String(toolProfile))) return true;
      return !NON_NUMERIC_ENTRY_LABELS.has(label);
    })
    : (entryKeys || []);

  const requiredKeys = new Set(requiredTools.map(semanticKey));
  const combined = dedupeMobileTools([
    ...entry,
    ...profile,
  ]).filter((tool) => !requiredKeys.has(semanticKey(tool)));

  const withoutBackspace = combined.filter((tool) => tool?.action !== 'deleteBackward');
  return backspaceKey
    ? [...withoutBackspace, backspaceKey]
    : withoutBackspace;
};

export default buildMobileMathTools;
