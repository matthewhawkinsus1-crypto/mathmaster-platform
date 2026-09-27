/** Keep a solved value selected while at least one original equation needs it. */
export const verificationTokenNeeded = (state, equations, variable) => equations.some(
  (equation) => !state?.verification?.[equation.id]?.placed?.[variable],
);
