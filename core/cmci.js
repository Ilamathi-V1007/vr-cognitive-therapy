// Cognitive-Motor Coupling Index (CMCI) as in the project documentation. Components are 0..1 (higher = better); CMCI is 0..100.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map(x => (x - m) ** 2))) : 0; };
export const WEIGHTS = {a: .5, b: .25, g: .25};   // design parameters (alpha, beta, gamma): not specified in the doc, not validated
// CMCI = alpha*(C x M) + beta*E + gamma*DT. If DT is unavailable (no rule uncertainty), the weights are renormalised.
export function cmci({C, M, E, DT}, w = WEIGHTS) {
  const has = DT != null && !isNaN(DT), t = w.a + w.b + (has ? w.g : 0);
  return Math.round(100 * (w.a * C * M + w.b * E + (has ? w.g * DT : 0)) / t);
}
// DT = z(stable) - z(uncertain), z taken over the pooled block data. Returned as 0..1 where 1 = no interference cost,
// so that a LOWER dual-task cost RAISES CMCI.
export function dtScore(stable, uncertain) {
  if (!stable.length || !uncertain.length) return null;
  const s = sd(stable.concat(uncertain)) || 1;
  return clamp(1 - ((mean(stable) - mean(uncertain)) / s) / 2);
}
// Block-wise rule from the doc: CMCI > 75 and stable trend -> harder; CMCI < 50 -> easier; fatigue -> rest. Trend = last k=3 values.
export function decide(hist, now, fatigue) {
  const last = hist.slice(-2).concat(now), stable = Math.max(...last) - Math.min(...last) <= 10;
  return {move: now > 75 && stable ? 1 : now < 50 ? -1 : 0, rest: !!fatigue, stable};
}
