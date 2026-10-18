import React, { useEffect } from 'react';
import GraphingCalculatorPanel from '../assessment/GraphingCalculatorPanel.jsx';
import { useExamToolRoom } from '../assessment/examToolDrawerHooks.js';

/*
 * THE GRAPHING CALCULATOR ON AN ORDINARY ASSIGNMENT (pass 3, PR-26).
 *
 * Where the calculator a question resolves to is "graphing" — the assignment's
 * setting (toolPolicy.calculator) or the question's own — QuestionEngine's
 * Calculator control opens this instead of the keypad drawer: the same panel
 * secure practice tests use (GraphingCalculatorPanel.jsx), so a prompt that
 * says "enter f(x) into the built-in graphing calculator" finds a place to
 * enter f(x), a graph, a trace, a table, and the zeros, minimum and maximum
 * of a line on screen. One calculator, never two: the keypad drawer is not
 * offered beside it.
 *
 * LAZY. QuestionEngine loads this file (and through it the panel, its model
 * and, once opened, JSXGraph) only for a question whose calculator is
 * graphing, so the student first load does not carry it.
 *
 * THE STUDENT'S OWN TOOL. It is given nothing about the question: no prompt,
 * no key, no grade. On an exit ticket, quiz or test it computes only what the
 * student types, exactly as a handheld would; whether a graphing calculator is
 * allowed there at all is the calculator policy's decision, made before this
 * file is ever loaded.
 *
 * ROOM. On a wide screen the panel docks at the left edge, as it does in a
 * secure test, and the question moves clear of it: `roomRef` is the element
 * holding the question (QuestionEngine's root), padded on the left by exactly
 * how far the open drawer reaches into it (examToolLayout.js examToolRoom).
 */
export default function AssignmentGraphingCalculator({ open = false, onOpenChange = null, roomRef = null }) {
  const room = useExamToolRoom(roomRef || { current: null }, { graphingCalculatorOpen: open });
  useEffect(() => {
    const element = roomRef?.current;
    if (!element || !room.paddingLeft) return undefined;
    const before = element.style.paddingLeft;
    const base = Number.parseFloat(window.getComputedStyle(element).paddingLeft) || 0;
    element.style.paddingLeft = `${base + room.paddingLeft}px`;
    return () => { element.style.paddingLeft = before; };
  }, [roomRef, room.paddingLeft]);

  return (
    <GraphingCalculatorPanel
      open={open}
      onOpenChange={onOpenChange}
      showLauncher={false}
      keyPoints
    />
  );
}
