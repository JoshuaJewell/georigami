import { describe, it, expect } from 'vitest';
import {
  createInitialProject,
  addPoint,
  renamePoint,
  movePoint,
  deletePoint,
  setImage,
} from './project';

describe('createInitialProject', () => {
  it('starts with two empty image sides and default settings', () => {
    const p = createInitialProject('test');
    expect(p.schematic.points).toEqual([]);
    expect(p.geographic.points).toEqual([]);
    expect(p.schematic.imageId).toBeNull();
    expect(p.settings.warpStrength).toBe(1);
    expect(p.meta.name).toBe('test');
  });
});

describe('addPoint', () => {
  it('returns a new project with the point appended and a stable id', () => {
    const p1 = createInitialProject('t');
    const p2 = addPoint(p1, 'schematic', { label: 'Châtelet', x: 100, y: 200 });
    expect(p2.schematic.points).toHaveLength(1);
    const point = p2.schematic.points[0];
    expect(point).toBeDefined();
    expect(point?.label).toBe('Châtelet');
    expect(point?.x).toBe(100);
    expect(point?.id).toMatch(/.+/);
    // immutable
    expect(p1.schematic.points).toHaveLength(0);
  });
});

describe('renamePoint', () => {
  it('updates a point label by id', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'foo', x: 0, y: 0 });
    const point = p.schematic.points[0];
    expect(point).toBeDefined();
    const id = point?.id;
    expect(id).toBeDefined();
    p = renamePoint(p, 'schematic', id!, 'bar');
    expect(p.schematic.points[0]?.label).toBe('bar');
  });

  it('is a no-op for an unknown id', () => {
    const p1 = createInitialProject('t');
    const p2 = renamePoint(p1, 'schematic', 'nonexistent', 'x');
    expect(p2).toBe(p1);
  });
});

describe('movePoint', () => {
  it('updates x/y coordinates by id', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'geographic', { label: 'a', x: 0, y: 0 });
    const point = p.geographic.points[0];
    expect(point).toBeDefined();
    const id = point?.id;
    expect(id).toBeDefined();
    p = movePoint(p, 'geographic', id!, 50, 60);
    expect(p.geographic.points[0]).toMatchObject({ x: 50, y: 60 });
  });
});

describe('deletePoint', () => {
  it('removes a point by id', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'a', x: 0, y: 0 });
    p = addPoint(p, 'schematic', { label: 'b', x: 1, y: 1 });
    const point = p.schematic.points[0];
    expect(point).toBeDefined();
    const id = point?.id;
    expect(id).toBeDefined();
    p = deletePoint(p, 'schematic', id!);
    expect(p.schematic.points).toHaveLength(1);
    expect(p.schematic.points[0]?.label).toBe('b');
  });
});

describe('setImage', () => {
  it('updates imageId, width, height for a side', () => {
    let p = createInitialProject('t');
    p = setImage(p, 'schematic', 'img-1', 800, 600);
    expect(p.schematic.imageId).toBe('img-1');
    expect(p.schematic.width).toBe(800);
    expect(p.schematic.height).toBe(600);
  });
});
