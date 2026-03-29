/**
 * Selects `count` random items from a pool without replacement using the
 * Fisher-Yates shuffle. Every call produces a different ordering so that
 * red-team operators see fresh payload combinations each session.
 */
export function selectRandom<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
