export interface GenParams {
  size: number;
  cellSize: number;
  wallThickness: number;  // Gyroid function threshold (unitless, not mm)
  // ── Structural boundary ──────────────────────────────────────────
  useFrame: boolean;      // true → edge-beam frame; false → hollow shell
  shellThickness: number; // (shell mode) outer enclosure thickness (mm)
  frameBeamWidth: number; // (frame mode) square beam cross-section width (mm)
  // ── Quality / export ────────────────────────────────────────────
  resolution: number;
  smoothingIterations?: number;
  makeManifold?: boolean; // (shell mode) seal port openings → watertight STL
}

export interface MeshData {
  vertices: Float32Array;   // Unique vertex positions [x,y,z, ...]
  normals: Float32Array;    // Per-vertex normals [nx,ny,nz, ...]
  indices: Uint32Array;     // Triangle indices (3 per face)
}

export type ProgressCallback = (percent: number) => void;
