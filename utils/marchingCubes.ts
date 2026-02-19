import { EDGE_TABLE, TRI_TABLE } from '../constants';
import { GenParams, MeshData, ProgressCallback } from '../types';

/**
 * Marching Cubes with edge vertex caching — produces a proper indexed mesh
 * where adjacent triangles share vertex indices, resulting in manifold geometry.
 *
 * The approach mirrors skimage.measure.marching_cubes which the Python script uses:
 *   1. Build a binary solid field (matching the Python's boolean logic)
 *   2. Run marching cubes with edge-based vertex deduplication
 *   3. Apply Taubin smoothing on the indexed mesh
 *   4. Compute smooth per-vertex normals from face normals
 */

// MC corner offsets: corner i is at (dX[i], dY[i], dZ[i]) relative to cube origin
const dX = [0, 1, 1, 0, 0, 1, 1, 0];
const dY = [0, 0, 1, 1, 0, 0, 1, 1];
const dZ = [0, 0, 0, 0, 1, 1, 1, 1];

// For each MC edge, which two corners does it connect?
const EDGE_V0 = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3];
const EDGE_V1 = [1, 2, 3, 0, 5, 6, 7, 4, 4, 5, 6, 7];

// For edge vertex caching: each edge is uniquely identified by
// (base grid point, axis direction). These arrays map each of the 12 MC edges
// to (which corner provides the cache base point, which axis 0=X 1=Y 2=Z).
//
// Edge 0:  c0→c1 = X-edge at c0     Edge 1:  c1→c2 = Y-edge at c1
// Edge 2:  c3→c2 = X-edge at c3     Edge 3:  c0→c3 = Y-edge at c0
// Edge 4:  c4→c5 = X-edge at c4     Edge 5:  c5→c6 = Y-edge at c5
// Edge 6:  c7→c6 = X-edge at c7     Edge 7:  c4→c7 = Y-edge at c4
// Edge 8:  c0→c4 = Z-edge at c0     Edge 9:  c1→c5 = Z-edge at c1
// Edge 10: c2→c6 = Z-edge at c2     Edge 11: c3→c7 = Z-edge at c3
const EDGE_CACHE_CORNER = [0, 1, 3, 0, 4, 5, 7, 4, 0, 1, 2, 3];
const EDGE_DIR          = [0, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 2];

// ─────────────────────────────────────────────────────────────────
// Taubin smoothing on indexed mesh (no shrinkage, unlike Laplacian)
// ─────────────────────────────────────────────────────────────────
function taubinSmooth(
  positions: Float32Array,
  indices: Uint32Array,
  iterations: number,
): Float32Array {
  if (iterations <= 0 || positions.length === 0) return new Float32Array(positions);

  const numVerts = positions.length / 3;
  const result = new Float32Array(positions);

  // Build adjacency from face indices
  const adjOffset = new Uint32Array(numVerts + 1); // CSR row pointers
  const adjTemp: number[][] = new Array(numVerts);
  for (let i = 0; i < numVerts; i++) adjTemp[i] = [];

  const numFaces = indices.length / 3;
  for (let f = 0; f < numFaces; f++) {
    const a = indices[f * 3], b = indices[f * 3 + 1], c = indices[f * 3 + 2];
    adjTemp[a].push(b, c);
    adjTemp[b].push(a, c);
    adjTemp[c].push(a, b);
  }

  // Deduplicate neighbors and build CSR
  const adjList: number[] = [];
  for (let v = 0; v < numVerts; v++) {
    const unique = [...new Set(adjTemp[v])];
    adjOffset[v] = adjList.length;
    for (const n of unique) adjList.push(n);
  }
  adjOffset[numVerts] = adjList.length;
  const adj = new Uint32Array(adjList);

  // Taubin parameters
  const lambda = 0.5;
  const mu = -0.53;
  const temp = new Float32Array(numVerts * 3);

  for (let iter = 0; iter < iterations * 2; iter++) {
    const factor = (iter % 2 === 0) ? lambda : mu;
    temp.set(result);

    for (let v = 0; v < numVerts; v++) {
      const start = adjOffset[v];
      const end = adjOffset[v + 1];
      const count = end - start;
      if (count === 0) continue;

      let sx = 0, sy = 0, sz = 0;
      for (let j = start; j < end; j++) {
        const n = adj[j];
        sx += temp[n * 3];
        sy += temp[n * 3 + 1];
        sz += temp[n * 3 + 2];
      }
      const inv = 1 / count;
      result[v * 3]     = temp[v * 3]     + factor * (sx * inv - temp[v * 3]);
      result[v * 3 + 1] = temp[v * 3 + 1] + factor * (sy * inv - temp[v * 3 + 1]);
      result[v * 3 + 2] = temp[v * 3 + 2] + factor * (sz * inv - temp[v * 3 + 2]);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────
// Compute smooth per-vertex normals (area-weighted face normals)
// ─────────────────────────────────────────────────────────────────
function computeVertexNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const numVerts = pos.length / 3;
  const normals = new Float32Array(numVerts * 3);
  const numFaces = idx.length / 3;

  for (let f = 0; f < numFaces; f++) {
    const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2];

    const ax = pos[i1 * 3]     - pos[i0 * 3];
    const ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1];
    const az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
    const bx = pos[i2 * 3]     - pos[i0 * 3];
    const by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1];
    const bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];

    // Cross product (area-weighted, not normalized per face)
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    normals[i0 * 3] += nx; normals[i0 * 3 + 1] += ny; normals[i0 * 3 + 2] += nz;
    normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
  }

  // Normalize
  for (let v = 0; v < numVerts; v++) {
    const x = normals[v * 3], y = normals[v * 3 + 1], z = normals[v * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 1e-8) {
      const inv = 1 / len;
      normals[v * 3] *= inv;
      normals[v * 3 + 1] *= inv;
      normals[v * 3 + 2] *= inv;
    }
  }
  return normals;
}

// ─────────────────────────────────────────────────────────────────
// Extract largest connected component (via triangle flood-fill)
// ─────────────────────────────────────────────────────────────────
function extractLargestComponent(
  positions: Float32Array,
  indices: Uint32Array,
): { positions: Float32Array; indices: Uint32Array } {
  const numVerts = positions.length / 3;
  const numFaces = indices.length / 3;
  if (numFaces < 100) return { positions, indices };

  // vertex → list of face indices
  const vertFaces: number[][] = new Array(numVerts);
  for (let v = 0; v < numVerts; v++) vertFaces[v] = [];
  for (let f = 0; f < numFaces; f++) {
    vertFaces[indices[f * 3]].push(f);
    vertFaces[indices[f * 3 + 1]].push(f);
    vertFaces[indices[f * 3 + 2]].push(f);
  }

  const visited = new Uint8Array(numFaces);
  let bestComp: number[] = [];

  for (let seed = 0; seed < numFaces; seed++) {
    if (visited[seed]) continue;
    const comp: number[] = [];
    const stack = [seed];
    visited[seed] = 1;

    while (stack.length > 0) {
      const f = stack.pop()!;
      comp.push(f);
      // Neighbours share at least one vertex
      for (let k = 0; k < 3; k++) {
        const v = indices[f * 3 + k];
        for (const nf of vertFaces[v]) {
          if (!visited[nf]) { visited[nf] = 1; stack.push(nf); }
        }
      }
    }
    if (comp.length > bestComp.length) bestComp = comp;
  }

  if (bestComp.length === numFaces) return { positions, indices }; // already single component

  // Build compact mesh for largest component
  const faceSet = new Set(bestComp);
  const vertMap = new Int32Array(numVerts).fill(-1);
  let newVertCount = 0;
  const newIdx: number[] = [];

  for (const f of bestComp) {
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k];
      if (vertMap[v] === -1) vertMap[v] = newVertCount++;
      newIdx.push(vertMap[v]);
    }
  }

  const newPos = new Float32Array(newVertCount * 3);
  for (let v = 0; v < numVerts; v++) {
    if (vertMap[v] >= 0) {
      newPos[vertMap[v] * 3]     = positions[v * 3];
      newPos[vertMap[v] * 3 + 1] = positions[v * 3 + 1];
      newPos[vertMap[v] * 3 + 2] = positions[v * 3 + 2];
    }
  }

  return { positions: newPos, indices: new Uint32Array(newIdx) };
}

// ═════════════════════════════════════════════════════════════════
// Main entry point
// ═════════════════════════════════════════════════════════════════
export async function generateGyroidMesh(
  params: GenParams,
  onProgress: ProgressCallback,
): Promise<MeshData> {
  const {
    size, cellSize, wallThickness, shellThickness,
    useFrame = false, frameBeamWidth = 10,
    resolution, smoothingIterations = 10,
    makeManifold = false,
  } = params;

  // Validate
  if (!cellSize || cellSize <= 0) throw new Error('Invalid cell size');
  if (!resolution || resolution <= 0) throw new Error('Invalid resolution');
  if (!size || size <= 0) throw new Error('Invalid size');

  // ── Auto-snap: fit an integer number of complete cells in the volume ─
  // This forces each face to terminate at the same gyroid phase, creating
  // symmetric port patterns and solid column-forming intersections at all
  // faces rather than arbitrary partial-cell overhangs.
  const snappedCellCount = Math.max(1, Math.round(size / cellSize));
  const snappedCellSize  = size / snappedCellCount;
  if (Math.abs(snappedCellSize - cellSize) > 0.1) {
    console.log(`Cell size snapped: ${cellSize.toFixed(2)} → ${snappedCellSize.toFixed(2)} mm (${snappedCellCount} cells)`);
  }
  const scale  = (2 * Math.PI) / snappedCellSize;
  const res    = Math.floor(resolution);
  const step   = size / res;
  const half   = size / 2;
  const np     = res + 1;            // grid points per axis
  const np2    = np * np;
  const total  = np * np * np;

  // ── 1. Build binary solid field (matching Python script) ───────

  const solidField = new Uint8Array(total);
  const faceDepth  = shellThickness + step * 2;

  // Pre-compute per-axis coordinates once
  const mmCoords  = new Float32Array(np);
  const radCoords = new Float32Array(np);
  for (let i = 0; i < np; i++) {
    mmCoords[i]  = -half + i * step;
    radCoords[i] = mmCoords[i] * scale;
  }

  // Pre-compute sin/cos for every grid coordinate once (huge speed-up)
  const sinRad = new Float32Array(np);
  const cosRad = new Float32Array(np);
  for (let i = 0; i < np; i++) {
    sinRad[i] = Math.sin(radCoords[i]);
    cosRad[i] = Math.cos(radCoords[i]);
  }

  onProgress(5);
  const CHUNK = 100_000;

  for (let start = 0; start < total; start += CHUNK) {
    const end = Math.min(start + CHUNK, total);

    for (let idx = start; idx < end; idx++) {
      const zi = (idx / np2) | 0;
      const rem = idx - zi * np2;
      const yi = (rem / np) | 0;
      const xi = rem - yi * np;

      const xMM = mmCoords[xi], yMM = mmCoords[yi], zMM = mmCoords[zi];

      // Gyroid: G = sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
      const G = sinRad[xi] * cosRad[yi]
              + sinRad[yi] * cosRad[zi]
              + sinRad[zi] * cosRad[xi];

      const channelA   = G > wallThickness;
      const channelB   = G < -wallThickness;
      const gyroidWall = !channelA && !channelB; // |G| <= wallThickness

      // ─── Structural boundary: frame or shell ─────────────────────
      let structural: boolean;

      if (useFrame) {
        // Frame mode — square beams along the 12 edges of the bounding cube.
        // A voxel is part of the frame when it lies within frameBeamWidth of
        // TWO perpendicular cube faces simultaneously (i.e. on an edge).
        // This naturally produces:
        //   • 12 solid beams (4 per axis direction)
        //   • 8 solid corner blocks where three beams meet
        //   • All 6 faces fully open (no shell on the flat faces)
        const bw     = frameBeamWidth;
        const nearX  = Math.abs(xMM) >= half - bw;
        const nearY  = Math.abs(yMM) >= half - bw;
        const nearZ  = Math.abs(zMM) >= half - bw;
        structural = (nearX && nearY) || (nearX && nearZ) || (nearY && nearZ);
      } else {
        // Shell mode — hollow outer box with crossflow port openings.
        // Channel A exits via Z faces (top / bottom).
        // Channel B exits via X faces (left / right).
        // Y faces are fully sealed.
        const inInner = Math.abs(xMM) <= half - shellThickness
                     && Math.abs(yMM) <= half - shellThickness
                     && Math.abs(zMM) <= half - shellThickness;
        structural = !inInner;

        // When makeManifold=true skip ALL openings → watertight STL.
        if (structural && !makeManifold) {
          const zFace = zMM < -half + faceDepth || zMM > half - faceDepth;
          const xFace = xMM < -half + faceDepth || xMM > half - faceDepth;

          // Edge seal: keep solid within edgeMargin of the sealed Y faces
          const edgeMargin = shellThickness + step;
          const nearYEdge  = yMM < -half + edgeMargin || yMM > half - edgeMargin;

          const openA = zFace && !xFace && !nearYEdge && channelA;
          const openB = xFace && !zFace && !nearYEdge && channelB;
          if (openA || openB) structural = false;
        }
      }

      solidField[idx] = (structural || gyroidWall) ? 1 : 0;
    }

    // Yield to main thread occasionally
    if ((start / CHUNK) % 3 === 0) {
      onProgress(5 + (start / total) * 25);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  onProgress(28);

  // ── 1b. Void the grid boundary layer ──────────────────────────
  // MC can only generate surface at solid↔void transitions *within* the
  // grid.  Solid voxels sitting at the outermost grid layer have no
  // neighbour beyond them, so MC never creates a face there.
  // By zeroing the boundary layer we give MC a transition to work with.
  // • Frame beams get proper outer faces (fixes "negative-space" look)
  // • Gyroid wall gets clean caps where it meets each cube face
  // • Channels (already void) are unaffected
  for (let a = 0; a < np; a++) {
    for (let b = 0; b < np; b++) {
      // X-boundary faces  (x = 0  and  x = res)
      solidField[0   + a * np + b * np2] = 0;
      solidField[res + a * np + b * np2] = 0;
      // Y-boundary faces  (y = 0  and  y = res)
      solidField[a + 0          + b * np2] = 0;
      solidField[a + res * np   + b * np2] = 0;
      // Z-boundary faces  (z = 0  and  z = res)
      solidField[a + b * np              ] = 0;
      solidField[a + b * np + res * np2  ] = 0;
    }
  }

  onProgress(30);

  // ── 2. Marching cubes with edge vertex deduplication ───────────

  // Corner index offsets relative to cube-origin grid index
  const cornerOff = new Int32Array(8);
  for (let c = 0; c < 8; c++) cornerOff[c] = dX[c] + dY[c] * np + dZ[c] * np2;

  // Edge vertex caches (one per axis direction): gridIndex → vertex index
  const cacheX = new Int32Array(total).fill(-1);
  const cacheY = new Int32Array(total).fill(-1);
  const cacheZ = new Int32Array(total).fill(-1);
  const caches = [cacheX, cacheY, cacheZ];
  const axisDelta = [1, np, np2]; // grid-index step for each axis

  // Output buffers
  const positions: number[] = [];
  const faceIndices: number[] = [];

  const val = new Float32Array(8);           // corner signed values for current cube

  // Helper: get-or-create vertex on a given edge of the current cube
  function getEdgeVertex(edge: number, c0: number): number {
    const cacheCorner = EDGE_CACHE_CORNER[edge];
    const dir         = EDGE_DIR[edge];
    const baseIdx     = c0 + cornerOff[cacheCorner];
    const cache       = caches[dir];

    if (cache[baseIdx] >= 0) return cache[baseIdx]; // already cached

    // Interpolate between the two endpoints of this edge
    const endA = baseIdx;
    const endB = baseIdx + axisDelta[dir];
    const fA = solidField[endA] === 1 ? -1 : 1;
    const fB = solidField[endB] === 1 ? -1 : 1;

    let mu = 0.5;
    const diff = fB - fA;
    if (Math.abs(diff) > 1e-6) {
      mu = -fA / diff;
      if (mu < 0) mu = 0; else if (mu > 1) mu = 1;
    }

    // Decompose base grid index → (gx, gy, gz)
    const gz = (baseIdx / np2) | 0;
    const gy = ((baseIdx - gz * np2) / np) | 0;
    const gx = baseIdx - gz * np2 - gy * np;

    // World position (centered)
    let wx: number, wy: number, wz: number;
    if (dir === 0) {      // X-edge
      wx = -half + (gx + mu) * step;
      wy = -half + gy * step;
      wz = -half + gz * step;
    } else if (dir === 1) { // Y-edge
      wx = -half + gx * step;
      wy = -half + (gy + mu) * step;
      wz = -half + gz * step;
    } else {               // Z-edge
      wx = -half + gx * step;
      wy = -half + gy * step;
      wz = -half + (gz + mu) * step;
    }

    const vertIdx = positions.length / 3;
    positions.push(wx, wy, wz);
    cache[baseIdx] = vertIdx;
    return vertIdx;
  }

  // Walk every cube in the grid
  for (let z = 0; z < res; z++) {
    if (z % Math.max(1, (res / 20) | 0) === 0) {
      onProgress(30 + (z / res) * 45);
      await new Promise(r => setTimeout(r, 0));
    }

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const c0 = x + y * np + z * np2;

        // Build cube index (bit set ↔ corner is outside / void)
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const gIdx = c0 + cornerOff[c];
          const s = solidField[gIdx];
          val[c] = s === 1 ? -1 : 1;
          if (s === 0) cubeIndex |= (1 << c);
        }

        const edges = EDGE_TABLE[cubeIndex];
        if (edges === 0) continue;

        // Resolve vertices for each active edge
        const ev = new Int32Array(12).fill(-1);
        for (let e = 0; e < 12; e++) {
          if (edges & (1 << e)) ev[e] = getEdgeVertex(e, c0);
        }

        // Emit triangles
        const tBase = cubeIndex << 4; // cubeIndex * 16
        for (let t = 0; t < 16; t += 3) {
          const e1 = TRI_TABLE[tBase + t];
          if (e1 === -1) break;
          const e2 = TRI_TABLE[tBase + t + 1];
          const e3 = TRI_TABLE[tBase + t + 2];
          if (ev[e1] < 0 || ev[e2] < 0 || ev[e3] < 0) continue;
          faceIndices.push(ev[e1], ev[e2], ev[e3]);
        }
      }
    }
  }

  onProgress(75);

  let posArr = new Float32Array(positions);
  let idxArr = new Uint32Array(faceIndices);

  console.log(`MC indexed mesh: ${posArr.length / 3} unique verts, ${idxArr.length / 3} faces`);

  // ── 3. Extract largest connected component ─────────────────────
  // Skip in frame mode: the 12 edge beams and the gyroid wall network are
  // two separate closed mesh components (solid-field union with no guaranteed
  // topological adjacency).  Discarding the "smaller" component would remove
  // the beams — the exact bug the user saw as "frame drawn in negative space".
  // In shell mode the filter still removes stray floating fragments.
  if (!useFrame) {
    ({ positions: posArr, indices: idxArr } = extractLargestComponent(posArr, idxArr));
    console.log(`After component extraction: ${posArr.length / 3} verts, ${idxArr.length / 3} faces`);
  } else {
    console.log(`Frame mode — keeping all components: ${posArr.length / 3} verts, ${idxArr.length / 3} faces`);
  }
  onProgress(80);

  // ── 4. Taubin smoothing (operates on indexed mesh → preserves connectivity)
  if (smoothingIterations > 0) {
    posArr = taubinSmooth(posArr, idxArr, smoothingIterations);
    console.log(`After ${smoothingIterations} Taubin smoothing iterations`);
  }
  onProgress(90);

  // ── 5. Compute smooth vertex normals ───────────────────────────
  const normals = computeVertexNormals(posArr, idxArr);
  onProgress(100);

  return { vertices: posArr, normals, indices: idxArr };
}
