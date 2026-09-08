import assert from 'node:assert/strict';
import test from 'node:test';
import {
  containsUnresolvedAuthoringToken,
  studentSafePromptText,
} from '../../src/platform/content/studentFacingTextSafety.js';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';

test('recognizes unresolved generator syntax without mistaking ordinary math braces for code', () => {
  assert.equal(containsUnresolvedAuthoringToken('Solve {{a}}x {{b|signed}} = 7.'), true);
  assert.equal(containsUnresolvedAuthoringToken('Use $\\frac{1}{2}x + 3$.'), false);
  assert.equal(containsUnresolvedAuthoringToken('Set notation: {1, 2, 3}'), false);
});

test('student prompt guard never exposes unresolved authoring syntax', () => {
  const guarded = studentSafePromptText('Which values satisfy $|{{a}}x {{b|signed}}|\\le {{c}}$?');
  assert.equal(guarded.includes('{{'), false);
  assert.match(guarded, /question is temporarily unavailable/i);
});

test('q21-style audited generator is instantiated before student delivery', () => {
  const template = {
    id: 'q21-regression',
    prompt: 'Which interval contains exactly the values of $x$ that satisfy $|{{a}}x {{b|signed}}|\\le {{c}}$?',
    answerFields: [{
      id: 'answer',
      type: 'choice',
      answer: '$[{{left}},{{right}}]$',
      options: [
        '$[{{left}},{{right}}]$',
        '$[{{left1}},{{right1}}]$',
        '$(-\\infty,{{left}}]\\cup[{{right}},\\infty)$',
        '$[{{leftout}},{{rightout}}]$',
      ],
    }],
    generator: {
      parameters: {
        r: { type: 'int', min: 2, max: 8 },
        h: { type: 'int', min: -7, max: 7 },
        a: { type: 'int', min: 2, max: 7 },
      },
      constraints: ['r>=2', 'b!=0'],
      derived: {
        b: '-a*h',
        left1: 'h-r+1',
        right: 'h+r',
        left: 'h-r',
        c: 'a*r',
        rightout: 'h+r+1',
        leftout: 'h-r-1',
        right1: 'h+r-1',
      },
    },
  };

  const generated = generatePathInstanceWithRetries(template, 'student-q21-regression');
  assert.ok(generated.question, generated.reason || 'expected a generated question');
  assert.equal(JSON.stringify(generated.question).includes('{{'), false);
  assert.equal(containsUnresolvedAuthoringToken(generated.question.prompt), false);
});
