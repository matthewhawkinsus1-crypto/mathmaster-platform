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

export const buildMobileMathTools = ({
  toolProfile = '',
  entryKeys = [],
  profileKeys = [],
  requiredTools = [],
  backspaceKey = null,
} = {}) => {
  let profile = [...(profileKeys || [])];

  if (String(toolProfile) === 'equation') {
    profile = profile.filter((tool) => !isNthRoot(tool) || isRequiredTool(tool, requiredTools));
    profile = [OPEN_PAREN, CLOSE_PAREN, ...profile];
  }

  const requiredKeys = new Set(requiredTools.map(semanticKey));
  const combined = dedupeMobileTools([
    ...(entryKeys || []),
    ...profile,
  ]).filter((tool) => !requiredKeys.has(semanticKey(tool)));

  const withoutBackspace = combined.filter((tool) => tool?.action !== 'deleteBackward');
  return backspaceKey
    ? [...withoutBackspace, backspaceKey]
    : withoutBackspace;
};

export default buildMobileMathTools;
