export const SPOTLIGHT_REQUEST_COLLECTION = 'liveSpotlightRequests';
export const SPOTLIGHT_FRAME_COLLECTION = 'liveSpotlightFrames';
export const SPOTLIGHT_REQUEST_TTL_MS = 2 * 60 * 1000;
export const SPOTLIGHT_FRAME_DEBOUNCE_MS = 650;
export const SPOTLIGHT_MAX_FRAME_BYTES = 48 * 1024;

export const SPOTLIGHT_STATUS = Object.freeze({
  REQUESTED: 'requested',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  STOPPED: 'stopped',
  EXPIRED: 'expired',
});

const BLOCKED_KEYS = /(?:answerKey|acceptedAnswers|correct|isCorrect|expected|solution|seed|grade|score|attempt|evidence|mastery|url|href|history)/i;

const cleanText = (value, maximum = 4000) => String(value ?? '').slice(0, maximum);

const sanitizeValue = (value, depth = 0) => {
  if (depth > 5 || value == null) return value == null ? null : undefined;
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 120).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !BLOCKED_KEYS.test(key))
    .slice(0, 120)
    .map(([key, item]) => [cleanText(key, 80), sanitizeValue(item, depth + 1)])
    .filter(([, item]) => item !== undefined));
};

/**
 * Build the only answer-bearing payload Spotlight may publish. It is derived
 * from the current QuestionEngine state, never persistence or live presence.
 * Grading fields, answer keys, URLs and unrelated browser state are removed.
 */
export const buildSpotlightFrame = ({
  assignmentId,
  assignmentTitle,
  questionIndex,
  question,
  answerState,
  studentLabel,
  nowValue = Date.now(),
} = {}) => {
  const safeQuestion = sanitizeValue({
    type: question?.type || 'question',
    toolId: question?.toolId || null,
    prompt: question?.prompt || question?.question || '',
    directions: question?.directions || '',
    table: question?.table || null,
    graph: question?.graph || question?.graphSpec || null,
  });
  const safeWork = sanitizeValue({
    response: answerState?.response ?? answerState?.value ?? answerState?.studentResponse ?? null,
    parts: answerState?.parts || [],
    toolState: answerState?.questionDetails || answerState?.toolState || null,
    isComplete: Boolean(answerState?.isComplete),
  });
  const frame = {
    schemaVersion: 1,
    assignmentId: cleanText(assignmentId, 160),
    assignmentTitle: cleanText(assignmentTitle, 160),
    questionIndex: Math.max(0, Math.floor(Number(questionIndex) || 0)),
    studentLabel: cleanText(studentLabel || 'Student', 80),
    question: safeQuestion,
    work: safeWork,
    updatedAtMs: Number(nowValue) || Date.now(),
  };
  if (new TextEncoder().encode(JSON.stringify(frame)).length > SPOTLIGHT_MAX_FRAME_BYTES) {
    return { ...frame, work: { message: 'This interactive work is too large to project safely.' }, truncated: true };
  }
  return frame;
};

export const isActiveSpotlightRequest = (request, nowValue = Date.now()) => {
  const expiresAt = typeof request?.expiresAt?.toMillis === 'function'
    ? request.expiresAt.toMillis()
    : Number(request?.expiresAtMs ?? request?.expiresAt);
  return request?.status === SPOTLIGHT_STATUS.ACCEPTED
    && Number.isFinite(expiresAt)
    && expiresAt > nowValue;
};

/** Coalesces rapid answer changes. schedule() never returns a write promise. */
export const createSpotlightPublisher = ({ publish, delayMs = SPOTLIGHT_FRAME_DEBOUNCE_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) => {
  let timer = null;
  let latest = null;
  let stopped = false;
  const flush = () => {
    timer = null;
    if (stopped || !latest) return;
    const value = latest;
    latest = null;
    Promise.resolve().then(() => publish(value)).catch(() => {});
  };
  return {
    schedule(value) {
      if (stopped) return;
      latest = value;
      if (timer) clearTimer(timer);
      timer = setTimer(flush, delayMs);
    },
    stop() {
      stopped = true;
      latest = null;
      if (timer) clearTimer(timer);
      timer = null;
    },
  };
};

export const publicStudentLabel = (student = {}) => {
  const first = cleanText(student.firstName || student.profile?.firstName || String(student.displayName || student.name || '').trim().split(/\s+/)[0] || 'Student', 40);
  const last = cleanText(student.lastName || student.profile?.lastName || String(student.displayName || student.name || '').trim().split(/\s+/).slice(-1)[0] || '', 40);
  return last && last !== first ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
};
