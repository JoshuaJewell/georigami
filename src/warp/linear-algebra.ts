/** Solves A · x = b using Gauss-Jordan with partial pivoting. Returns null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  if (n === 0 || A[0]!.length !== n || b.length !== n) return null;

  // Augmented matrix
  const M: number[][] = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let pivot = col;
    let maxAbs = Math.abs(M[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r]![col]!);
      if (v > maxAbs) { maxAbs = v; pivot = r; }
    }
    if (maxAbs < 1e-12) return null;
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot]!, M[col]!];

    // Normalise pivot row
    const pv = M[col]![col]!;
    for (let c = col; c <= n; c++) M[col]![c] = M[col]![c]! / pv;

    // Eliminate column
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r]![col]!;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r]![c] = M[r]![c]! - factor * M[col]![c]!;
    }
  }

  return M.map((row) => row[n]!);
}
