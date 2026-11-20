// The interval tool's item on a secure Test, with a probe in the tool's place
// that throws while window.__mmCrash is true, the way a damaged saved draft
// made a tool throw (moduleRecoveryLockMain.jsx). For
// secureExamNavigationMain.jsx's ?scenario=toolThrows, whose journey clears
// the flag and sees the probe drawn. Kept apart from that harness's other
// items: every question a harness that swaps a registry tool writes must be
// drawn as that tool (tests/platform/drawnQuestionKind.test.mjs reads this
// file), and this item is: the secure runtime draws it as its pathToolId.
import React from 'react';
import { TOOL_REGISTRY } from '../../src/tools/toolRegistry.js';
import { buildPublicToolPayload } from '../../functions/shared/pathToolContracts.mjs';
import { PATH_TOOL_QUESTIONS } from '../platform/fixtures/pathToolQuestions.mjs';

function CrashProbe() {
  if (window.__mmCrash) throw new TypeError("Cannot read properties of undefined (reading 'map')");
  return (
    <div data-probe-tool="">
      <label>Probe answer <input data-probe-input="" aria-label="Probe answer" /></label>
    </div>
  );
}

export const installCrashProbe = () => {
  window.__mmCrash = true;
  TOOL_REGISTRY.intervalNumberLine = { ...TOOL_REGISTRY.intervalNumberLine, component: CrashProbe };
};

export const crashingToolItem = () => {
  const authored = PATH_TOOL_QUESTIONS.intervalNumberLine;
  return {
    question: { questionType: 'intervalNumberLine', prompt: authored.prompt, ...buildPublicToolPayload(authored), alignmentKeys: ['texas:A.5B'], runtimeMode: 'secureTest' },
    key: null,
  };
};
