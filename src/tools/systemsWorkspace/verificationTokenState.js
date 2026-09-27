import { equationMentionsVariable } from './algebraicSystemsEngine.js';

/**
 * Keep a solved value selected while at least one original equation that HAS
 * the variable still needs it. An equation without the variable never
 * receives it, so it must not keep the value armed forever (#369).
 */
export const verificationTokenNeeded = (state, equations, variable) => equations.some(
  (equation) => equationMentionsVariable(equation.text, variable) && !state?.verification?.[equation.id]?.placed?.[variable],
);
