/*
 * THE FUZZ HARNESS'S RANDOM NUMBERS: SEEDED, SO EVERY RUN CAN BE RUN AGAIN.
 *
 * A fuzz finding nobody can reproduce is a rumour. Every case the harness
 * builds comes from one of these generators, seeded by a string, so the same
 * seed builds the same cases on every machine and Node version: no
 * Math.random, no clock. mulberry32 over the platform's own FNV-1a string
 * hash (functions/shared/hashString32.mjs).
 *
 * Pure.
 */
import { hashString32 } from '../../../functions/shared/hashString32.mjs';

export const createRng = (seed) => {
  let state = hashString32(String(seed)) || 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (values) => values[Math.floor(next() * values.length)];
  const chance = (probability) => next() < probability;
  /** A generator of its own, so one target's draws never move another's. */
  const fork = (label) => createRng(`${seed}/${label}`);
  /** `count` values of a list, in a seeded order, without repeats. */
  const sample = (values, count) => {
    const pool = [...values];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const other = Math.floor(next() * (index + 1));
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    return pool.slice(0, Math.max(0, count));
  };
  return { next, int, pick, chance, fork, sample, seed: String(seed) };
};
