const normalizeQuantity = (quantity = {}, index) => ({
  id: String(quantity.id || `quantity-${index + 1}`),
  name: String(quantity.name || quantity.label || `Quantity ${index + 1}`),
  symbol: String(quantity.symbol || 'x'),
  unit: String(quantity.unit || ''),
  isGiven: quantity.isGiven === true,
  givenValue: quantity.value ?? quantity.givenValue ?? null,
  isUnknown: quantity.isUnknown === true,
});

export const normalizeContextualQuestion = (questionSpec = {}) => {
  if (!questionSpec?.context || typeof questionSpec.context !== 'object' || Array.isArray(questionSpec.context)) return questionSpec;
  const context = questionSpec.context;
  const scaffold = context.scaffold && typeof context.scaffold === 'object' ? context.scaffold : {};
  const interpretation = context.interpretation && typeof context.interpretation === 'object'
    ? context.interpretation
    : null;
  return {
    ...questionSpec,
    context: {
      ...context,
      scenario: String(context.scenario || ''),
      quantities: (Array.isArray(context.quantities) ? context.quantities : []).map(normalizeQuantity),
      scaffold: {
        enabled: scaffold.enabled ?? true,
        showQuantitiesStep: scaffold.showQuantitiesStep ?? true,
        showRelationshipStep: scaffold.showRelationshipStep ?? true,
      },
      interpretation: interpretation ? {
        prompt: String(interpretation.prompt || 'What does this answer represent in the context?'),
        expectedMeaning: String(interpretation.expectedMeaning || ''),
        acceptedUnits: Array.isArray(interpretation.acceptedUnits) ? interpretation.acceptedUnits.map(String) : [],
        checkReasonableness: interpretation.checkReasonableness === true,
        discreteDomainConstraint: interpretation.discreteDomainConstraint === true,
      } : null,
    },
  };
};
