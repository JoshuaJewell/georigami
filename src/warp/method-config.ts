import type { WarpMethod } from '../types/project';

/** Whether the method uses the inverse-distance falloff exponent α. */
export function usesAlpha(method: WarpMethod): boolean {
  return method.startsWith('mls-') || method === 'idw';
}

/** Sensible default α for distance-weighted methods that haven't had one
 *  explicitly configured. IDW prefers a gentler falloff to reduce content
 *  folding; MLS uses Schaefer's textbook default. */
export function defaultAlpha(method: WarpMethod): number {
  return method === 'idw' ? 0.5 : 1;
}
