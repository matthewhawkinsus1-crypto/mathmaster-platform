const clean = (value) => String(value ?? '').trim();

const stripFence = (value) => {
  const text = clean(value);
  const fenced = text.match(/^\s*\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`\s*$/i);
  return fenced ? fenced[1].trim() : text;
};

const LATEX_COMMANDS = new Set([
  'approx', 'begin', 'beta', 'cdot', 'cdots', 'div', 'end', 'frac',
  'ge', 'geq', 'infty', 'lambda', 'le', 'leq', 'left', 'mu', 'nabla',
  'ne', 'neq', 'not', 'nu', 'overline', 'pi', 'pm', 'right', 'sqrt',
  'text', 'theta', 'times', 'underbrace', 'vec',
]);

const readCommand = (text, start) => {
  let end = start;
  while (end < text.length && /[A-Za-z]/.test(text[end])) end += 1;
  return text.slice(start, end);
};

const hasValidUnicodeEscape = (text, slashIndex) => (
  /^u[0-9a-fA-F]{4}/.test(text.slice(slashIndex + 1, slashIndex + 6))
);

/**
 * Outside AIs frequently return mathematically valid content with LaTeX
 * backslashes that are not JSON-escaped, for example "\le" instead of
 * "\\le". JSON.parse rejects most of those and silently interprets a few
 * commands such as "\frac" as JSON control escapes.
 *
 * Repair only backslashes inside quoted JSON strings:
 * - preserve every already-valid JSON escape,
 * - preserve valid unicode escapes,
 * - double invalid escapes,
 * - also double common LaTeX commands whose first letter happens to be a
 *   legal JSON control escape (for example f/r/t/b/n).
 *
 * Structural JSON is never rewritten. A malformed object still fails parse.
 */
export const normalizeExternalAiMathEscapes = (rawText) => {
  const text = String(rawText ?? '');
  let out = '';
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];

    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }

    if (ch !== '\\') {
      out += ch;
      continue;
    }

    const next = text[index + 1];
    if (next == null) {
      out += ch;
      continue;
    }

    if (next === 'u') {
      if (hasValidUnicodeEscape(text, index)) {
        out += text.slice(index, index + 6);
        index += 5;
      } else {
        out += '\\\\';
      }
      continue;
    }

    const command = /[A-Za-z]/.test(next) ? readCommand(text, index + 1) : '';
    if (command && LATEX_COMMANDS.has(command)) {
      out += '\\\\';
      continue;
    }

    if ('"\\/bfnrt'.includes(next)) {
      out += `\\${next}`;
      index += 1;
      continue;
    }

    out += '\\\\';
  }

  return out;
};

export const parseExternalAiJson = (raw) => {
  let text = stripFence(raw);
  if (!text) throw new Error('The AI result is empty.');

  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }

  const normalized = normalizeExternalAiMathEscapes(text);

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(`The AI result is not valid JSON: ${error.message}`);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('The AI result must be one JSON object.');
  }
  return parsed;
};

export default parseExternalAiJson;
