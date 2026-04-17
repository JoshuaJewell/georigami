import { describe, it, expect } from 'vitest';
import { solveLinear } from './linear-algebra';

describe('solveLinear (Gauss-Jordan)', () => {
  it('solves a 2x2 identity-like system', () => {
    // [[1,0],[0,1]] * x = [3,4]  →  x = [3,4]
    const x = solveLinear([[1, 0], [0, 1]], [3, 4]);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(3);
    expect(x![1]).toBeCloseTo(4);
  });

  it('solves a 3x3 system with a known answer', () => {
    // [[2,1,1],[1,3,2],[1,0,0]] * x = [4,5,6] → x = [6,15,-23]
    const x = solveLinear(
      [
        [2, 1, 1],
        [1, 3, 2],
        [1, 0, 0],
      ],
      [4, 5, 6],
    );
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(6);
    expect(x![1]).toBeCloseTo(15);
    expect(x![2]).toBeCloseTo(-23);
  });

  it('returns null for a singular matrix', () => {
    const x = solveLinear([[1, 2], [2, 4]], [3, 6]);
    expect(x).toBeNull();
  });
});
