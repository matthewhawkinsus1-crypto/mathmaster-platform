/*
 * ONE CHOICE GROUP FOR EVERY TOOL (student pass 3, TOOL-6).
 *
 * Ten tool choice groups were role="radiogroup" with a tab stop on every
 * option and no arrow keys, and some showed the selected option by its border
 * colour alone. Each now takes its options' props from here, on the keyboard
 * model in radioGroupKeys.js (WAI-ARIA APG "Radio Group"):
 *
 *   - one tab stop: the checked option, else the first;
 *   - arrow keys move AND select, wrapping; Home / End go to the ends;
 *   - Space selects; Enter is left to the native button (its click selects).
 *
 * Selecting is never answering: no key here submits, checks or spends a try.
 *
 * A selected option says so with more than colour: aria-checked, and
 * <ChoiceMark>, a ✓ drawn before its label.
 */
import { createElement, useRef } from 'react';
import { radioGroupKeyAction, radioTabStopIndex } from './radioGroupKeys.js';

/**
 * Props for option `index` of a group whose options have `ids` and whose
 * selection is `value`. `onSelect(id, index)` is the group's own select.
 * `refs` is a ref object ({ current: [] }) that holds the option elements.
 */
export const choiceOptionProps = ({ refs, ids = [], value, onSelect, disabled = false }) => {
  const tabStop = radioTabStopIndex(ids, value);
  return (index) => ({
    ref: (node) => { refs.current[index] = node; },
    role: 'radio',
    'aria-checked': index >= 0 && index < ids.length && String(ids[index]) === String(value ?? ''),
    tabIndex: index === tabStop ? 0 : -1,
    onKeyDown: (event) => {
      if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
      const action = radioGroupKeyAction(event.key, index, ids.length);
      if (!action) return;
      event.preventDefault();
      onSelect?.(ids[action.index], action.index);
      if (action.type === 'move') refs.current[action.index]?.focus?.();
    },
  });
};

/** The hook: `optionProps(index)` for each option, in order. */
export const useChoiceGroup = ({ ids, value, onSelect, disabled }) => {
  const refs = useRef([]);
  return choiceOptionProps({ refs, ids, value, onSelect, disabled });
};

/** A ✓ before a selected option's label: the selection is not colour alone. */
export const ChoiceMark = ({ selected, style = null }) => (selected
  ? createElement('span', {
    'aria-hidden': 'true',
    'data-choice-mark': '',
    style: { fontWeight: 900, marginRight: 6, flex: '0 0 auto', ...style },
  }, '✓')
  : null);
