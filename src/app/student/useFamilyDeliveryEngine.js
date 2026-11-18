/*
 * THE QUESTION-FAMILY ENGINE, LOADED ON DEMAND.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { startTransition, useCallback, useEffect, useState } from 'react';

export function useFamilyDeliveryEngine({ activeAssignmentId }) {
  /*
   * THE FAMILY ENGINE ARRIVES WITH THE QUESTION RUNTIME.
   *
   * buildStudentFamilyContext checks a delivery pin by walking its family, so
   * its module (familyDelivery.js) carries every family's generator — about
   * 64 KB of the student's first load while it was imported here. It loads
   * with QuestionEngine instead: prefetched from Home, and on opening an
   * assignment. Until it is here, a family-backed question shows "Loading this
   * question…" rather than render with its pin unchecked.
   */
  const [familyDelivery, setFamilyDelivery] = useState(null);
  // In a transition for the same reason as the pin wait: a family-backed
  // question waiting for this module mounts when it lands.
  const loadFamilyDelivery = useCallback(() => import('../../platform/generation/familyDelivery.js').then((module) => {
    startTransition(() => setFamilyDelivery((current) => current || module));
    return module;
  }), []);
  // Can this question come back as a different one (a replacement)? The rules
  // (questionVariability.mjs) resolve a family's definition, so they arrive
  // with the engine; the question view waits for it (familyEngineLoading).
  const isPersonalizedBlueprint = (question) => Boolean(familyDelivery?.canGenerateDistinctVariants(question));
  useEffect(() => {
    if (!activeAssignmentId || familyDelivery) return;
    loadFamilyDelivery().catch((error) => console.error('Could not load the question family engine', error));
  }, [activeAssignmentId, familyDelivery, loadFamilyDelivery]);
  return { familyDelivery, loadFamilyDelivery, isPersonalizedBlueprint };
}
