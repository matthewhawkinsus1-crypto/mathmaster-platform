// The browser's door to the shared question-runtime policy, the secure tool
// certification and the secure item draft key. One copy each, in
// functions/shared, so the server that strips a secure payload and the
// browser that renders it agree on what every mode allows.
export {
  ASSISTANCE_CAPABILITIES,
  QUESTION_RUNTIME_MODES,
  QUESTION_RUNTIME_POLICIES,
  RESPONSE_CAPABILITIES,
  engineActivityPolicyForMode,
  isQuestionRuntimeMode,
  isSecureRuntimeMode,
  resolveQuestionRuntimePolicy,
  runtimeAllows,
  secureShellRuntimeMode,
} from '../../../functions/shared/questionRuntimePolicy.mjs';

export {
  SECURE_ITEM_DRAFT_PREFIX,
  secureItemDraftKey,
} from '../../../functions/shared/secureItemDraftKey.mjs';
