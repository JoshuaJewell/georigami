import { describe, it, expect } from 'vitest';
import { parseCSV } from './csv';

describe('parseCSV', () => {
  it('parses three-column rows (name,x,y) without a header', () => {
    const r = parseCSV('Châtelet,100,200\nLouvre,50,75\n');
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!).toMatchObject({ label: 'Châtelet', x: 100, y: 200 });
    expect(r.warnings).toEqual([]);
  });

  it('skips a leading header row when first row is non-numeric', () => {
    const r = parseCSV('name,x,y\nA,1,2\n');
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.label).toBe('A');
  });

  it('warns and skips rows with the wrong column count', () => {
    const r = parseCSV('A,1,2\nB,3\nC,5,6,7\n');
    expect(r.points).toHaveLength(1);
    expect(r.warnings).toHaveLength(2);
  });

  it('warns and skips rows with non-numeric coords', () => {
    const r = parseCSV('A,abc,2\n');
    expect(r.points).toHaveLength(0);
    expect(r.warnings[0]!).toMatch(/non-numeric/i);
  });

  it('strips a UTF-8 BOM', () => {
    const r = parseCSV('﻿A,1,2\n');
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.label).toBe('A');
  });

  it('handles CRLF line endings', () => {
    const r = parseCSV('A,1,2\r\nB,3,4\r\n');
    expect(r.points).toHaveLength(2);
  });

  it('ignores blank lines', () => {
    const r = parseCSV('A,1,2\n\nB,3,4\n');
    expect(r.points).toHaveLength(2);
  });
});
