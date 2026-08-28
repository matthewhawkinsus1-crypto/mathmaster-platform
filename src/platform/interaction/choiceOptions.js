const clean = (value) => String(value ?? '');

const hashString = (value) => {
  let hash = 2166136261;
  const text = clean(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const nextRandom = (state) => {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
};

const optionIdentity = (option) => {
  if (option && typeof option === 'object') {
    return clean(option.id ?? option.value ?? option.label ?? JSON.stringify(option));
  }
  return clean(option);
};

export const strengthenTwoChoiceSet = (options = []) => {
  if (!Array.isArray(options) || options.length !== 2) return Array.isArray(options) ? [...options] : [];
  const [first, second] = options.map((value) => (
    value && typeof value === 'object'
      ? clean(value.label ?? value.value ?? value.id)
      : clean(value)
  ));
  const normalized = [first, second].map((value) => value.trim().toLowerCase());

  if (normalized.includes('yes') && normalized.includes('no')) {
    return [...options, 'both yes and no', 'cannot be determined'];
  }
  if (normalized.includes('true') && normalized.includes('false')) {
    return [...options, 'both true and false', 'cannot be determined'];
  }
  if (normalized.includes('discrete') && normalized.includes('continuous')) {
    return [...options, 'both discrete and continuous', 'neither discrete nor continuous'];
  }
  if (normalized.includes('finite') && normalized.includes('infinite')) {
    return [...options, 'both finite and infinite', 'cannot be determined'];
  }

  return [...options, `both ${first} and ${second}`, `neither ${first} nor ${second}`];
};

/**
 * Deterministically shuffles finite answer choices.
 *
 * The same question/field keeps the same order across rerenders and attempts,
 * but authored "correct answer first" ordering is not preserved.  A stable
 * shuffle is important for student trust: choices must not jump around after an
 * incorrect attempt, while they also should not telegraph the key.
 */
export const stableShuffleChoices = (options = [], seed = '') => {
  const source = Array.isArray(options) ? [...options] : [];
  if (source.length < 2) return source;

  let state = hashString([
    seed,
    ...source.map(optionIdentity),
  ].join('|')) || 0x9e3779b9;

  for (let index = source.length - 1; index > 0; index -= 1) {
    state = nextRandom(state);
    const swapIndex = state % (index + 1);
    [source[index], source[swapIndex]] = [source[swapIndex], source[index]];
  }

  // A deterministic shuffle can occasionally land back in authored order.
  // When that happens, rotate once so the first authored option is never
  // automatically displayed first merely because of authoring order.
  const unchanged = source.every((option, index) => optionIdentity(option) === optionIdentity(options[index]));
  if (unchanged && source.length > 2) source.push(source.shift());
  if (source.length > 2 && optionIdentity(source[0]) === optionIdentity(options[0])) {
    source.push(source.shift());
  }

  return source;
};

export const choiceSeed = (...parts) => parts.map(clean).filter(Boolean).join('::');
