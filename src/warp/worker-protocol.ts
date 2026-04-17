import type { Pair, WarpMethod, Side } from '../types/project';

export type WorkerRequest =
  | {
      type: 'render';
      requestId: number;
      pairs: Pair[];
      sourceBitmap: ImageBitmap;
      outWidth: number;
      outHeight: number;
      /** Pixel dimensions of the frame TPS treats as input. For the
       *  geographic→schematic direction this is the schematic image; for
       *  schematic→geographic it's the geographic image. */
      inputFrameWidth: number;
      inputFrameHeight: number;
      warpStrength: number;
      /**
       * Which side the warped output occupies. The worker takes
       * `pairs[outputFrame] → pairs[otherSide]` as the TPS direction; for
       * `outputFrame: 'geographic'` it swaps the pair fields before solving.
       */
      outputFrame: Side;
      /**
       * Which warp algorithm to use.
       * - 'tps': thin-plate spline (smooth, globally-fluid; can stretch local content).
       * - 'mls-rigid': MLS rigid — most feature-preserving, prone to tearing.
       * - 'mls-similarity': MLS with uniform scale — less tearing than rigid.
       * - 'mls-affine': MLS with full 2×2 transform — smoothest, may shear locally.
       * - 'idw': Inverse-distance-weighted displacement — smooth, never tears,
       *          no rotation/scale modelling.
       * - 'delaunay': Piecewise affine via Delaunay triangulation — guaranteed
       *               C0 continuity, may have visible creases at triangle edges.
       */
      method: WarpMethod;
      /** Falloff exponent for distance-weighted methods. Ignored for tps/delaunay. */
      alpha?: number;
    }
  | { type: 'cancel'; requestId: number };

export type WorkerResponse =
  | { type: 'progress'; requestId: number; fraction: number }
  | { type: 'result'; requestId: number; bitmap: ImageBitmap }
  | { type: 'error'; requestId: number; message: string };
