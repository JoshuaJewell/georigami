import type { Project, WarpMethod } from '../types/project';
import {
  createInitialProject,
  addPoint as addPointPure,
  renamePoint as renamePointPure,
  movePoint as movePointPure,
  deletePoint as deletePointPure,
  setImage as setImagePure,
  setCrop as setCropPure,
  clearCrop as clearCropPure,
  recalibrateFromAnchors,
  unpinPoint as unpinPointPure,
  clearAnchors as clearAnchorsPure,
  type RecalibrateResult,
} from './project';
import { putImageBlob } from '../persistence/indexeddb';
import { saveProjectMeta, loadProjectMeta } from '../persistence/localstorage';

type Side = 'schematic' | 'geographic';

class ProjectStore {
  project = $state<Project>(loadProjectMeta() ?? createInitialProject('untitled'));

  private autosave() {
    saveProjectMeta(this.project);
  }

  addPoint(
    side: Side,
    label: string,
    x: number,
    y: number,
    extra?: { lon?: number; lat?: number; pinned?: boolean },
  ) {
    this.project = addPointPure(this.project, side, { label, x, y, ...extra });
    this.autosave();
  }

  renamePoint(side: Side, id: string, label: string) {
    this.project = renamePointPure(this.project, side, id, label);
    this.autosave();
  }

  movePoint(side: Side, id: string, x: number, y: number) {
    this.project = movePointPure(this.project, side, id, x, y);
    this.autosave();
  }

  deletePoint(side: Side, id: string) {
    this.project = deletePointPure(this.project, side, id);
    this.autosave();
  }

  async loadImage(side: Side, file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const id = crypto.randomUUID();
    await putImageBlob(id, file);
    this.project = setImagePure(this.project, side, id, bitmap.width, bitmap.height);
    // If the loaded image is the current output frame, default the output
    // resolution to its dimensions — anything else implies a stretched export.
    // The user can still override via the Output width/height fields.
    const outputFrame = this.project.settings.outputFrame ?? 'schematic';
    if (side === outputFrame) {
      this.project = {
        ...this.project,
        settings: {
          ...this.project.settings,
          outputResolution: { w: bitmap.width, h: bitmap.height },
        },
      };
    }
    this.autosave();
  }

  setWarpStrength(v: number) {
    this.project = { ...this.project, settings: { ...this.project.settings, warpStrength: v } };
    this.autosave();
  }

  setOutputResolution(w: number, h: number) {
    this.project = { ...this.project, settings: { ...this.project.settings, outputResolution: { w, h } } };
    this.autosave();
  }

  setWarpMethod(method: WarpMethod) {
    this.project = {
      ...this.project,
      settings: { ...this.project.settings, warpMethod: method },
    };
    this.autosave();
  }

  setWarpAlpha(alpha: number) {
    this.project = {
      ...this.project,
      settings: { ...this.project.settings, warpAlpha: alpha },
    };
    this.autosave();
  }

  setCrop(side: Side, crop: { x: number; y: number; w: number; h: number }) {
    this.project = setCropPure(this.project, side, crop);
    // If this side is the current output frame, default the output resolution
    // to the crop dimensions so the export aspect ratio matches.
    const outputFrame = this.project.settings.outputFrame ?? 'schematic';
    if (side === outputFrame) {
      this.project = {
        ...this.project,
        settings: {
          ...this.project.settings,
          outputResolution: { w: Math.max(1, Math.round(crop.w)), h: Math.max(1, Math.round(crop.h)) },
        },
      };
    }
    this.autosave();
  }

  clearCrop(side: Side) {
    this.project = clearCropPure(this.project, side);
    // Reset output resolution to the (uncropped) image size if the cleared
    // side is the current output frame.
    const outputFrame = this.project.settings.outputFrame ?? 'schematic';
    if (side === outputFrame) {
      const dims = this.project[outputFrame];
      if (dims.width > 0 && dims.height > 0) {
        this.project = {
          ...this.project,
          settings: {
            ...this.project.settings,
            outputResolution: { w: dims.width, h: dims.height },
          },
        };
      }
    }
    this.autosave();
  }

  setOutputFrame(frame: 'schematic' | 'geographic') {
    // Switching direction also resets output dims to the new output frame's
    // image dims (or its crop, if one is set), so aspect ratio matches what
    // the user actually wants.
    const targetSide = this.project[frame];
    const w = targetSide.crop ? Math.round(targetSide.crop.w) : (targetSide.width || this.project.settings.outputResolution.w);
    const h = targetSide.crop ? Math.round(targetSide.crop.h) : (targetSide.height || this.project.settings.outputResolution.h);
    this.project = {
      ...this.project,
      settings: {
        ...this.project.settings,
        outputFrame: frame,
        outputResolution: { w, h },
      },
    };
    this.autosave();
  }

  recalibrate(side: Side): RecalibrateResult {
    const { project, result } = recalibrateFromAnchors(this.project, side);
    if (result.ok) {
      this.project = project;
      this.autosave();
    }
    return result;
  }

  unpinPoint(side: Side, id: string) {
    this.project = unpinPointPure(this.project, side, id);
    this.autosave();
  }

  clearAnchors(side: Side): number {
    const { project, count } = clearAnchorsPure(this.project, side);
    if (count > 0) {
      this.project = project;
      this.autosave();
    }
    return count;
  }
}

export const store = new ProjectStore();
