export type ParsedCSV = {
  points: { label: string; x: number; y: number }[];
  warnings: string[];
};

export function parseCSV(text: string): ParsedCSV {
  const stripped = text.replace(/^﻿/, '');
  const lines = stripped.split(/\r?\n/).filter((l) => l.length > 0);
  const points: ParsedCSV['points'] = [];
  const warnings: string[] = [];

  let startIdx = 0;
  if (lines.length > 0) {
    const firstCols = lines[0]!.split(',');
    if (firstCols.length === 3 && Number.isNaN(parseFloat(firstCols[1]!)) && Number.isNaN(parseFloat(firstCols[2]!))) {
      startIdx = 1;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    if (cols.length !== 3) {
      warnings.push(`Line ${i + 1}: expected 3 columns, got ${cols.length}`);
      continue;
    }
    const x = parseFloat(cols[1]!);
    const y = parseFloat(cols[2]!);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      warnings.push(`Line ${i + 1}: non-numeric coordinates`);
      continue;
    }
    points.push({ label: cols[0]!.trim(), x, y });
  }

  return { points, warnings };
}
