// THE KEYBOARD MODEL OF A POP-UP MENU OR LIST (TT27, slice 2).
//
// The ⋮ menu on an assignment card and the class selector's list shared three
// gaps found by hand: Escape from an item dropped focus to the page instead of
// back to the button, the class list ignored Escape, and neither took the arrow
// keys. Both now take their keys from src/platform/interaction/popupMenu.js.
//
// Node cannot render the components, so this runs the behaviour against stand-in
// elements (the model is pure, and `popupMenuHandlers` takes its effects as
// arguments), and reads the two call sites' markup for the wiring. The browser
// proof is tests/browser/accessibilityTeacherMenus.mjs, which presses the keys in
// the real app, and the two scenes of the accessibility ratchet that open each
// pop-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  landPendingFocus,
  popupKeyAction,
  popupMenuHandlers,
  popupMoveIndex,
  popupOpenIndex,
  triggerKeyAction,
} from '../../src/platform/interaction/popupMenu.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));

// ------------------------------------------------------------ stand-in DOM
const element = (name, log, { disabled = false, selected = false, ariaDisabled = false } = {}) => {
  const self = {
    name,
    disabled,
    getAttribute: (attribute) => {
      if (attribute === 'aria-selected') return selected ? 'true' : null;
      if (attribute === 'aria-disabled') return ariaDisabled ? 'true' : null;
      return null;
    },
    focus: (options) => log.push(`focus ${name}${options?.preventScroll ? ' (no scroll)' : ''}`),
    contains: (other) => other === self,
  };
  return self;
};

const keyEvent = (key, target = null, extra = {}) => {
  const event = {
    key, target, altKey: false, ctrlKey: false, metaKey: false, ...extra, prevented: false, stopped: false,
    preventDefault() { event.prevented = true; },
    stopPropagation() { event.stopped = true; },
  };
  return event;
};

// A pop-up of items `a b c d` (b disabled unless said) opened or closed, and the
// button that opens it. `log` is the order in which things happened.
const popup = ({ open = true, disabled = ['b'], selected = null } = {}) => {
  const log = [];
  const trigger = element('trigger', log);
  const items = ['a', 'b', 'c', 'd'].map((name) => element(name, log, { disabled: disabled.includes(name), selected: name === selected }));
  const pending = { current: null };
  const state = { open };
  const handlers = popupMenuHandlers({
    trigger: () => trigger,
    items: () => (state.open ? items : []),
    pending,
    isOpen: () => state.open,
    setOpen: (value) => { state.open = value; log.push(`open ${value}`); },
  });
  return { log, trigger, items, pending, state, handlers };
};
const item = (box, name) => box.items.find((entry) => entry.name === name);

// ------------------------------------------------------------ the pure model
test('opening puts focus on the first item that can be chosen; ArrowUp opens on the last; a list opens on its chosen option', () => {
  const enabled = [false, true, true, false];
  assert.equal(popupOpenIndex({ key: null, enabled }), 1, 'a click: the first enabled');
  assert.equal(popupOpenIndex({ key: 'Enter', enabled }), 1);
  assert.equal(popupOpenIndex({ key: 'ArrowDown', enabled }), 1);
  assert.equal(popupOpenIndex({ key: 'ArrowUp', enabled }), 2, 'ArrowUp: the last enabled, not the last item');
  assert.equal(popupOpenIndex({ key: 'ArrowDown', enabled, selected: 2 }), 2, 'a list opens on the option that is chosen');
  assert.equal(popupOpenIndex({ key: 'ArrowUp', enabled, selected: 1 }), 1, 'and any key opens it there');
  assert.equal(popupOpenIndex({ key: null, enabled, selected: 3 }), 1, 'a chosen option that cannot take focus is not landed on');
  assert.equal(popupOpenIndex({ key: null, enabled: [false, false] }), -1, 'nothing to land on');
  assert.equal(popupOpenIndex({}), -1);
});

test('Up and Down move between the items, wrapping, past the ones that are disabled; Home and End jump', () => {
  const enabled = [true, false, true, true];
  assert.equal(popupMoveIndex('ArrowDown', 0, enabled), 2, 'past the disabled item');
  assert.equal(popupMoveIndex('ArrowDown', 3, enabled), 0, 'Down from the last wraps to the first');
  assert.equal(popupMoveIndex('ArrowUp', 2, enabled), 0, 'Up passes the disabled one too');
  assert.equal(popupMoveIndex('ArrowUp', 0, enabled), 3, 'Up from the first wraps to the last');
  assert.equal(popupMoveIndex('Home', 3, enabled), 0);
  assert.equal(popupMoveIndex('End', 0, enabled), 3);
  assert.equal(popupMoveIndex('Home', 3, [false, true, true]), 1, 'Home is the first item that can be chosen');
  assert.equal(popupMoveIndex('End', 0, [true, true, false]), 1, 'and End the last');
  // Focus on something that is not an item (the sheet's Close button): Down goes to the first, Up to the last.
  assert.equal(popupMoveIndex('ArrowDown', -1, enabled), 0);
  assert.equal(popupMoveIndex('ArrowUp', -1, enabled), 3);
  for (const key of ['ArrowLeft', 'ArrowRight', 'PageDown', 'a', 'Enter', ' ', 'Tab', 'Escape']) {
    assert.equal(popupMoveIndex(key, 0, enabled), null, `${JSON.stringify(key)} does not move`);
  }
  assert.equal(popupMoveIndex('ArrowDown', 0, [false, false]), null, 'nothing to move to');
  assert.equal(popupMoveIndex('ArrowDown', 0, []), null);
});

test('inside the pop-up Escape closes (and is taken), Tab closes (and is not), the arrows move, and Enter and Space are left to the button', () => {
  const enabled = [true, true, true];
  assert.deepEqual(popupKeyAction({ key: 'Escape', current: 1, enabled }), { type: 'close', consume: true });
  assert.deepEqual(popupKeyAction({ key: 'Tab', current: 1, enabled }), { type: 'close', consume: false });
  assert.deepEqual(popupKeyAction({ key: 'ArrowDown', current: 1, enabled }), { type: 'move', index: 2 });
  assert.deepEqual(popupKeyAction({ key: 'End', current: 0, enabled }), { type: 'move', index: 2 });
  // A native button answers Enter and Space with its own click: repeating it here would choose twice.
  for (const key of ['Enter', ' ', 'a', 'ArrowLeft']) assert.equal(popupKeyAction({ key, current: 1, enabled }), null, JSON.stringify(key));
});

test('on the button the arrows open, Escape closes only an open pop-up, and Enter and Space are its click', () => {
  assert.deepEqual(triggerKeyAction({ key: 'ArrowDown', open: false }), { type: 'open' });
  assert.deepEqual(triggerKeyAction({ key: 'ArrowUp', open: false }), { type: 'open' });
  assert.deepEqual(triggerKeyAction({ key: 'Escape', open: true }), { type: 'close', consume: true });
  assert.equal(triggerKeyAction({ key: 'Escape', open: false }), null, 'Escape on a closed button is not ours (a dialog around it closes)');
  for (const key of ['Enter', ' ', 'Tab', 'Home', 'a']) assert.equal(triggerKeyAction({ key, open: false }), null, JSON.stringify(key));
});

// ------------------------------------------------------------ the behaviour
test('Escape in the pop-up puts focus on the button BEFORE closing it, and is taken so a dialog around it stays open', () => {
  const box = popup();
  const event = keyEvent('Escape', item(box, 'c'));
  box.handlers.onPopupKeyDown(event);
  assert.deepEqual(box.log, ['focus trigger', 'open false'], 'focus first: closing first would unmount the item that has it and drop focus to the page');
  assert.equal(event.prevented, true, 'preventDefault: a Dialog around the pop-up leaves a handled Escape alone');
  assert.equal(event.stopped, true);
});

test('Tab in the pop-up closes it from the button and is not taken, so the browser goes on from the button', () => {
  const box = popup();
  const event = keyEvent('Tab', item(box, 'a'));
  box.handlers.onPopupKeyDown(event);
  assert.deepEqual(box.log, ['focus trigger', 'open false']);
  assert.equal(event.prevented, false);
  assert.equal(event.stopped, false);
});

test('the arrow keys move focus over the enabled items, wrapping, and take the key from the page', () => {
  const box = popup();
  const press = (key, from) => { const event = keyEvent(key, item(box, from)); box.handlers.onPopupKeyDown(event); return event; };
  assert.equal(press('ArrowDown', 'a').prevented, true, 'the page does not scroll');
  assert.equal(press('ArrowDown', 'c').prevented, true);
  press('ArrowDown', 'd');
  press('ArrowUp', 'a');
  press('Home', 'd');
  press('End', 'a');
  assert.deepEqual(box.log, ['focus c', 'focus d', 'focus a', 'focus d', 'focus a', 'focus d'], 'b is disabled, so a→c→d→(wrap)a, a↑d, End d, Home a');
  assert.equal(box.state.open, true, 'moving never closes it');
  assert.equal(box.log.some((entry) => entry.startsWith('open')), false);
});

test('an item marked aria-disabled is passed over like one that is disabled', () => {
  const log = [];
  const items = [element('a', log), element('b', log, { ariaDisabled: true }), element('c', log)];
  const box = popupMenuHandlers({ trigger: () => element('trigger', log), items: () => items, pending: { current: null }, isOpen: () => true, setOpen: () => {} });
  box.onPopupKeyDown(keyEvent('ArrowDown', items[0]));
  assert.deepEqual(log, ['focus c']);
});

test('focus on something that is not an item (the sheet\'s Close button) still moves into the items with the arrows', () => {
  const box = popup();
  const close = element('close', box.log);
  box.handlers.onPopupKeyDown(keyEvent('ArrowDown', close));
  box.handlers.onPopupKeyDown(keyEvent('ArrowUp', close));
  assert.deepEqual(box.log, ['focus a', 'focus d']);
});

test('a key with Alt, Ctrl or Meta held belongs to the browser, and to nobody here', () => {
  const box = popup();
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
    for (const key of ['Escape', 'ArrowDown', 'Home', 'Tab']) {
      const event = keyEvent(key, item(box, 'a'), { [modifier]: true });
      box.handlers.onPopupKeyDown(event);
      box.handlers.onTriggerKeyDown(event);
      assert.equal(event.prevented, false, `${modifier} ${key}`);
    }
  }
  assert.deepEqual(box.log, []);
});

test('choosing returns focus to the button and closes the pop-up BEFORE the item\'s action runs', () => {
  const box = popup();
  box.handlers.choose(() => box.log.push('action'));
  // A dialog the action opens takes the focused element as the one to give focus back to: it must be the button.
  assert.deepEqual(box.log, ['focus trigger', 'open false', 'action']);
  assert.doesNotThrow(() => box.handlers.choose(), 'an item with no action just closes');
});

test('on the button: ArrowDown opens on the first item, ArrowUp on the last, and the key is taken', () => {
  const down = popup({ open: false });
  const downEvent = keyEvent('ArrowDown', down.trigger);
  down.handlers.onTriggerKeyDown(downEvent);
  assert.deepEqual(down.log, ['open true']);
  assert.deepEqual(down.pending.current, { key: 'ArrowDown' }, 'focus lands once the items are drawn');
  assert.equal(downEvent.prevented, true, 'the page does not scroll');
  down.state.open = true;
  assert.equal(landPendingFocus({ items: () => down.items, pending: down.pending }), true);
  assert.deepEqual(down.log.slice(1), ['focus a (no scroll)']);

  const up = popup({ open: false });
  up.handlers.onTriggerKeyDown(keyEvent('ArrowUp', up.trigger));
  landPendingFocus({ items: () => up.items, pending: up.pending });
  assert.deepEqual(up.log, ['open true', 'focus d (no scroll)']);
});

test('on the button of an open pop-up the arrows take focus into it and Escape closes it, focus staying put', () => {
  const box = popup();
  box.handlers.onTriggerKeyDown(keyEvent('ArrowDown', box.trigger));
  assert.deepEqual(box.log, ['focus a (no scroll)'], 'no second open, focus goes in');
  const up = popup();
  up.handlers.onTriggerKeyDown(keyEvent('ArrowUp', up.trigger));
  assert.deepEqual(up.log, ['focus d (no scroll)']);
  const escape = keyEvent('Escape', up.trigger);
  up.handlers.onTriggerKeyDown(escape);
  assert.deepEqual(up.log.slice(1), ['focus trigger', 'open false']);
  assert.equal(escape.stopped, true);
  // A closed button does not take Escape: a dialog that holds it closes on it.
  const closed = popup({ open: false });
  const loose = keyEvent('Escape', closed.trigger);
  closed.handlers.onTriggerKeyDown(loose);
  assert.equal(loose.prevented || loose.stopped, false);
  assert.deepEqual(closed.log, []);
});

test('Enter and Space on the button are its click: a closed pop-up opens, an open one closes', () => {
  const box = popup({ open: false });
  for (const key of [' ', 'Enter']) {
    const event = keyEvent(key, box.trigger);
    box.handlers.onTriggerKeyDown(event);
    assert.equal(event.prevented, false, `${JSON.stringify(key)} is left to the button, whose click does it`);
  }
  assert.deepEqual(box.log, []);
  box.handlers.onTriggerClick();
  assert.deepEqual(box.log, ['open true']);
  assert.deepEqual(box.pending.current, { key: null }, 'a click lands on the first item (or the chosen one)');
  box.handlers.onTriggerClick();
  assert.deepEqual(box.log.slice(1), ['focus trigger', 'open false']);
  assert.equal(box.pending.current, null, 'closing forgets a landing that has not happened');
});

test('a landing waits for the items to be drawn, goes to the chosen option of a list, and passes disabled items', () => {
  const log = [];
  const pending = { current: { key: null } };
  assert.equal(landPendingFocus({ items: () => [], pending }), false, 'not drawn yet');
  assert.deepEqual(pending.current, { key: null }, 'and still wanted');
  const options = ['one', 'two', 'three'].map((name) => element(name, log, { selected: name === 'two' }));
  assert.equal(landPendingFocus({ items: () => options, pending }), true);
  assert.deepEqual(log, ['focus two (no scroll)'], 'a list opens on the option that is chosen');
  assert.equal(pending.current, null);
  assert.equal(landPendingFocus({ items: () => options, pending }), false, 'once only');

  const skipping = ['x', 'y', 'z'].map((name) => element(name, log, { disabled: name === 'x' }));
  landPendingFocus({ items: () => skipping, pending: { current: { key: 'ArrowDown' } } });
  landPendingFocus({ items: () => skipping, pending: { current: { key: 'ArrowUp' } } });
  assert.deepEqual(log.slice(1), ['focus y (no scroll)', 'focus z (no scroll)']);
});

// ------------------------------------------------------------ the call sites
test('the assignment card menu is a Menu Button: the shared keys, one menu role holding only the items, and choosing goes through the shared return', () => {
  const source = read('src/AssignmentCardMenu.jsx');
  assert.match(source, /usePopupMenu\(\{ kind: 'menu', open, onOpenChange: setOpen \}\)/);
  const trigger = region(source, '<button\n        type="button"\n        {...menu.triggerProps}', '&#8942;', 'the ⋮ button');
  assert.match(trigger, /aria-label=\{ariaLabel\}/, 'it keeps its name');
  assert.doesNotMatch(trigger, /onClick|aria-expanded|aria-haspopup/, 'its click, expanded state and popup kind come from the shared props');
  const list = region(source, '<div role="menu" aria-label={ariaLabel}>', '{items.map', 'the menu');
  assert.ok(list.length > 0);
  const entry = region(source, 'items.map((item) => {', 'style={{', 'one menu item');
  assert.match(entry, /\{\.\.\.menu\.itemProps\}/, 'a menu item with tabindex -1, so the menu is one Tab stop');
  assert.match(entry, /onClick=\{\(\) => menu\.choose\(item\.onClick\)\}/, 'choosing returns focus to the ⋮ button first, then runs the action');
  assert.doesNotMatch(source, /setOpen\(false\)/, 'nothing closes it behind the shared behaviour\'s back');
  // The title and the Close button of the phone sheet are not children of the menu.
  const sheet = region(source, "layout?.mode === 'sheet' && (", '<div role="menu"', 'the sheet header');
  assert.match(sheet, /menu\.close\(\)/, 'Close returns focus to the ⋮ button');
  assert.doesNotMatch(source, /document\.addEventListener\('keydown'/, 'Escape is the shared handler\'s; a second one on the document would take focus to the page');
});

test('the class selector is a collapsible-dropdown listbox: named, its options in presentational items, opened on the chosen class, choosing through the shared return', () => {
  const source = read('src/components/teacher/ClassContextBar.jsx');
  assert.match(source, /usePopupMenu\(\{ kind: 'listbox', open, onOpenChange: setOpen \}\)/);
  const trigger = region(source, 'ref={menu.triggerRef}', 'disabled={!switchable}', 'the class button');
  assert.match(trigger, /\{\.\.\.\(switchable \? menu\.triggerProps : null\)\}/, 'a class bar with one class has nothing to open: no popup claim on its button');
  const list = region(source, '<ul\n            {...menu.popupProps}', 'style={{', 'the list');
  assert.match(list, /role="listbox"/);
  assert.match(list, /aria-label="Class"/, 'the list has a name (axe aria-input-field-name)');
  const options = source.slice(source.indexOf('{allowAllClasses && ('));
  assert.equal((options.match(/<li[^>]*role="presentation"/g) || []).length, 2, 'every <li> of the list is presentational: a listbox holds options');
  assert.equal((options.match(/\{\.\.\.menu\.itemProps\}/g) || []).length, 2, 'every option takes tabindex -1 and the option role from the shared props');
  assert.equal((options.match(/aria-selected=/g) || []).length, 2, 'and says whether it is the chosen one: that is where the list opens');
  const choose = region(source, 'const choose = (classId) => {', '\n  };', 'choosing a class');
  assert.match(choose, /menu\.choose\(\(\) => onSelectClass\?\.\(/, 'focus back on the button, list closed, and then the class changes');
  assert.doesNotMatch(source, /setOpen\(false\)|buttonRef/, 'nothing closes it behind the shared behaviour\'s back');
});
