/*
 * THE OPEN SIMPLIFY TOOL, AS ONE PLAIN-JSON SLOT (student push Q).
 *
 * Like the structure tools (algebraStructureToolState.js), every decision the
 * student makes inside Simplify — the part chosen, each sign, the text typed —
 * is pushed on the slot's own undo stack, so Universal Undo walks back one
 * decision at a time, and the slot records the equation it was opened on so a
 * restored draft is never replayed against different mathematics.
 *
 * This file also opens drafts saved by older builds, which had three separate
 * tools: Simplify arithmetic (`structureTool.kind === 'arithmetic'`), Combine
 * like terms (`likeTermsOpen`, `likeTermsSide`, `selectedLikeTermIndices`,
 * `likeTermsAnswer`) and Rewrite / Simplify (never persisted). The committed
 * equation and work history are never touched; only the open tool moves.
 */
import { pushTransient, undoTransient } from '../../../algebraStructureToolState.js';
import { SIMPLIFY_PART_KINDS, detectSimplifyParts } from './simplifyEngine.js';

export const SIMPLIFY_TOOL = 'simplify';

export const openSimplify = (key) => ({
  kind: SIMPLIFY_TOOL,
  equationKey: String(key ?? ''),
  partId: null,
  answer: '',
  signs: [],
  region: null,
  regionAnswer: '',
  undoStack: [],
  lastActionKey: null,
});

export const chooseSimplifyPart = (state, partId) => {
  if (!state || !partId || state.partId === partId) return state;
  return pushTransient(state, { ...state, partId, answer: '', signs: [] });
};

export const clearSimplifyPart = (state) => (
  state?.partId ? pushTransient(state, { ...state, partId: null, answer: '', signs: [] }) : state
);

export const setSimplifyAnswer = (state, value) => (
  state ? pushTransient(state, { ...state, answer: String(value ?? '') }, { coalesceKey: 'answer' }) : state
);

/** One sign chosen for the term at `index` inside parentheses after a minus. */
export const setSimplifySign = (state, index, sign, count) => {
  if (!state || ![1, -1].includes(sign) || !Number.isInteger(index) || index < 0 || index >= count) return state;
  const signs = Array.from({ length: count }, (_, position) => (state.signs?.[position] === 1 || state.signs?.[position] === -1 ? state.signs[position] : 0));
  if (signs[index] === sign) return state;
  signs[index] = sign;
  return pushTransient(state, { ...state, signs });
};

export const chooseSimplifyRegion = (state, region) => (
  state && state.region !== region ? pushTransient(state, { ...state, region, regionAnswer: '' }) : state
);

export const setSimplifyRegionAnswer = (state, value) => (
  state ? pushTransient(state, { ...state, regionAnswer: String(value ?? '') }, { coalesceKey: `region:${state.region}` }) : state
);

/** One Undo inside the open tool; null when the tool has nothing left and closes. */
export const undoSimplify = (state) => undoTransient(state);

/** A restored slot, only if it is a Simplify slot about this very equation. */
export const sanitizeSimplifyState = (state, key) => {
  if (!state || typeof state !== 'object' || state.kind !== SIMPLIFY_TOOL) return null;
  if (state.equationKey !== String(key ?? '')) return null;
  return {
    ...openSimplify(key),
    ...state,
    signs: Array.isArray(state.signs) ? state.signs : [],
    undoStack: Array.isArray(state.undoStack) ? state.undoStack : [],
  };
};

/** True when the open slot holds a decision the student made (for Universal Undo). */
export const simplifyHasDecisions = (state) => Boolean(state && (
  state.partId || String(state.answer || '').trim() || String(state.regionAnswer || '').trim() || state.region
  || (Array.isArray(state.undoStack) && state.undoStack.length)
));

const LEGACY_ARITHMETIC = 'arithmetic';

/**
 * Open a draft saved by a build that had Simplify arithmetic and Combine like
 * terms. Returns { structureTool, simplifyTool, legacyCleared } for the open
 * tools; everything else in the draft is kept by the caller as it was.
 *
 *  - Simplify arithmetic on a product   -> Simplify, that product chosen, its answer kept
 *  - Combine like terms with a selection -> Simplify, the like-term part those
 *                                          terms belong to (answer kept only when
 *                                          the selection was the whole part)
 *  - anything that no longer matches    -> the old tool closes cleanly
 */
export const migrateLegacySimplifyDraft = (draft, { key, regions }) => {
  const result = { structureTool: draft?.structureTool ?? null, simplifyTool: null, legacyCleared: false };
  if (!draft || typeof draft !== 'object') return result;
  const existing = sanitizeSimplifyState(draft.simplifyTool, key);
  if (existing) result.simplifyTool = existing;
  const parts = () => detectSimplifyParts(regions);

  if (draft.structureTool?.kind === LEGACY_ARITHMETIC) {
    result.structureTool = null;
    result.legacyCleared = true;
    const [side, index] = String(draft.structureTool.candidateId || '').split(':');
    const product = draft.structureTool.equationKey === key
      ? parts().find((part) => part.kind === SIMPLIFY_PART_KINDS.PRODUCT && part.region === side && part.termIndices[0] === Number(index))
      : null;
    if (product && !result.simplifyTool) {
      result.simplifyTool = { ...openSimplify(key), partId: product.id, answer: String(draft.structureTool.answer || '') };
    } else if (!result.simplifyTool && draft.structureTool.equationKey === key) {
      result.simplifyTool = openSimplify(key);
    }
  }

  if (draft.likeTermsOpen || draft.likeTermsSide || (draft.selectedLikeTermIndices || []).length || String(draft.likeTermsAnswer || '').trim()) {
    result.legacyCleared = true;
    if (!result.simplifyTool && draft.likeTermsOpen) {
      const selected = (draft.selectedLikeTermIndices || []).map(Number);
      const part = selected.length
        ? parts().find((entry) => entry.kind === SIMPLIFY_PART_KINDS.LIKE_TERMS && entry.region === draft.likeTermsSide
          && selected.every((index) => entry.termIndices.includes(index)))
        : null;
      const sameSelection = part && part.termIndices.length === selected.length;
      result.simplifyTool = {
        ...openSimplify(key),
        partId: part ? part.id : null,
        answer: sameSelection ? String(draft.likeTermsAnswer || '') : '',
      };
    }
  }
  return result;
};

/**
 * The parts toolbar's keys (one tab stop, WAI-ARIA toolbar pattern): arrows
 * move, wrapping at the ends; Home and End jump; Enter and Space open the part.
 * Returns { type: 'move', index } | { type: 'open', index } | { type: 'close' } | null.
 */
export const partsToolbarKeyAction = (key, currentIndex, count) => {
  const total = Number(count) || 0;
  if (key === 'Escape') return { type: 'close' };
  if (total <= 0) return null;
  const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < total ? currentIndex : 0;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return { type: 'move', index: (current + 1) % total };
    case 'ArrowLeft':
    case 'ArrowUp':
      return { type: 'move', index: (current - 1 + total) % total };
    case 'Home':
      return { type: 'move', index: 0 };
    case 'End':
      return { type: 'move', index: total - 1 };
    case 'Enter':
    case ' ':
    case 'Spacebar':
      return { type: 'open', index: current };
    default:
      return null;
  }
};
