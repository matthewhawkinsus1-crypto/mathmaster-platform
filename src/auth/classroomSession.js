export const CLASSROOM_STUDENT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const CLASSROOM_STUDENT_SESSION_EXPIRES_KEY = 'mathmaster.classroomStudentSessionExpiresAt';

const clean = (value) => String(value ?? '').trim();

export function isClassroomLaunchSearch(search = '') {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return Boolean(clean(params.get('launch')));
}

export function shouldPromoteClassroomStudentSession({
  role = null,
  search = '',
  rememberDevice = false,
} = {}) {
  return String(role || '').toLowerCase() === 'student'
    && isClassroomLaunchSearch(search)
    && rememberDevice !== true;
}

export function nextClassroomSessionExpiry(
  nowValue = Date.now(),
  ttlMs = CLASSROOM_STUDENT_SESSION_TTL_MS,
) {
  const now = Number(nowValue);
  const ttl = Number(ttlMs);
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : CLASSROOM_STUDENT_SESSION_TTL_MS;
  return safeNow + safeTtl;
}

export function classroomSessionIsExpired(expiresAt, nowValue = Date.now()) {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') return false;
  const expiry = Number(expiresAt);
  const now = Number(nowValue);
  if (!Number.isFinite(expiry) || expiry <= 0) return false;
  return (Number.isFinite(now) ? now : Date.now()) >= expiry;
}
