import { generateRuntimeUUID } from '../../utils/idUtils.js';

export const INTEGRITY_EVENT_TYPES = Object.freeze({
  TAB_SWITCH: 'tab_switch',
  WINDOW_BLUR: 'window_blur',
  FULLSCREEN_EXIT: 'fullscreen_exit',
  COPY_PASTE_ATTEMPT: 'copy_paste_attempt',
  CONTEXT_MENU: 'context_menu',
  SHORTCUT_ATTEMPT: 'shortcut_attempt',
});

export class ExamIntegrityLogger {
  constructor({ examSessionId, onEvent }) {
    this.examSessionId = examSessionId;
    this.onEvent = onEvent;
    this.isListening = false;
    this.lastVisibilityViolationAt = 0;
    this.boundVisibility = this.handleVisibilityChange.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
    this.boundFullscreen = this.handleFullscreenChange.bind(this);
    this.boundClipboard = this.handleClipboard.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
  }

  emit(type, details = {}) {
    const event = { eventId: `integrity_${generateRuntimeUUID()}`, examSessionId: this.examSessionId, type, clientObservedAt: Date.now(), details };
    Promise.resolve(this.onEvent?.(event)).catch(() => {});
    return event;
  }

  startListening() {
    if (this.isListening || typeof document === 'undefined') return;
    this.isListening = true;
    document.addEventListener('visibilitychange', this.boundVisibility);
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('fullscreenchange', this.boundFullscreen);
    document.addEventListener('copy', this.boundClipboard);
    document.addEventListener('paste', this.boundClipboard);
    document.addEventListener('cut', this.boundClipboard);
    document.addEventListener('contextmenu', this.boundContextMenu);
    document.addEventListener('keydown', this.boundKeyDown);
  }

  stopListening() {
    if (!this.isListening || typeof document === 'undefined') return;
    this.isListening = false;
    document.removeEventListener('visibilitychange', this.boundVisibility);
    window.removeEventListener('blur', this.boundBlur);
    document.removeEventListener('fullscreenchange', this.boundFullscreen);
    document.removeEventListener('copy', this.boundClipboard);
    document.removeEventListener('paste', this.boundClipboard);
    document.removeEventListener('cut', this.boundClipboard);
    document.removeEventListener('contextmenu', this.boundContextMenu);
    document.removeEventListener('keydown', this.boundKeyDown);
  }

  handleVisibilityChange() {
    if (!document.hidden) return;
    this.lastVisibilityViolationAt = Date.now();
    this.emit(INTEGRITY_EVENT_TYPES.TAB_SWITCH, { message: 'Exam tab became hidden.' });
  }
  handleBlur() {
    if (Date.now() - this.lastVisibilityViolationAt < 750) return;
    this.emit(INTEGRITY_EVENT_TYPES.WINDOW_BLUR, { message: 'Exam window lost focus.' });
  }
  handleFullscreenChange() {
    if (!document.fullscreenElement) this.emit(INTEGRITY_EVENT_TYPES.FULLSCREEN_EXIT, { message: 'Full-screen exam view was exited.' });
  }
  handleClipboard(event) {
    event.preventDefault();
    this.emit(INTEGRITY_EVENT_TYPES.COPY_PASTE_ATTEMPT, { action: event.type });
  }
  handleContextMenu(event) {
    event.preventDefault();
    this.emit(INTEGRITY_EVENT_TYPES.CONTEXT_MENU, {});
  }
  handleKeyDown(event) {
    const restricted = event.key === 'F12' || ((event.ctrlKey || event.metaKey) && (event.shiftKey ? ['i', 'j', 'c'].includes(event.key.toLowerCase()) : ['c', 'v', 'x'].includes(event.key.toLowerCase())));
    if (!restricted) return;
    event.preventDefault();
    this.emit(INTEGRITY_EVENT_TYPES.SHORTCUT_ATTEMPT, { key: event.key });
  }
}

export default ExamIntegrityLogger;

