import { describe, it, expect, beforeEach } from 'vitest';
import { saveProjectMeta, loadProjectMeta, clearProjectMeta } from './localstorage';
import { createInitialProject } from '../state/project';

beforeEach(() => clearProjectMeta());

describe('localStorage metadata', () => {
  it('round-trips a project', () => {
    const p = createInitialProject('paris');
    saveProjectMeta(p);
    const loaded = loadProjectMeta();
    expect(loaded).toEqual(p);
  });

  it('returns null when nothing is saved', () => {
    expect(loadProjectMeta()).toBeNull();
  });

  it('returns null when the stored value is corrupt', () => {
    localStorage.setItem('metro-warp:project', '{not valid json');
    expect(loadProjectMeta()).toBeNull();
  });
});
