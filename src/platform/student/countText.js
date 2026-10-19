/** "1 question", "3 questions" — a count with its noun, never "1 questions". */
export const countText = (count, singular, plural = `${singular}s`) => {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  return `${value} ${value === 1 ? singular : plural}`;
};

export const questionCountText = (count) => countText(count, 'question');
