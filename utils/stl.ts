import { MeshData } from '../types';

/**
 * Export an indexed mesh to binary STL.
 * STL is inherently a "triangle soup" format, so we de-index the mesh here.
 */
export const exportToSTL = (data: MeshData, filename: string) => {
  const { vertices, normals, indices } = data;

  if (!indices || indices.length === 0) {
    console.warn('No triangles to export');
    return;
  }

  const numTriangles = indices.length / 3;

  // Binary STL: 80-byte header + 4-byte count + 50 bytes per triangle
  const bufferLength = 80 + 4 + numTriangles * 50;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // Header (80 bytes of zeros)
  // Triangle count
  view.setUint32(80, numTriangles, true);

  let offset = 84;
  for (let f = 0; f < numTriangles; f++) {
    const i0 = indices[f * 3];
    const i1 = indices[f * 3 + 1];
    const i2 = indices[f * 3 + 2];

    // Compute face normal from cross product
    const ax = vertices[i1 * 3]     - vertices[i0 * 3];
    const ay = vertices[i1 * 3 + 1] - vertices[i0 * 3 + 1];
    const az = vertices[i1 * 3 + 2] - vertices[i0 * 3 + 2];
    const bx = vertices[i2 * 3]     - vertices[i0 * 3];
    const by = vertices[i2 * 3 + 1] - vertices[i0 * 3 + 1];
    const bz = vertices[i2 * 3 + 2] - vertices[i0 * 3 + 2];

    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-8) { nx /= len; ny /= len; nz /= len; }
    else { nx = 0; ny = 0; nz = 0; }

    // Normal
    view.setFloat32(offset,     nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);

    // Vertex 0
    view.setFloat32(offset + 12, vertices[i0 * 3],     true);
    view.setFloat32(offset + 16, vertices[i0 * 3 + 1], true);
    view.setFloat32(offset + 20, vertices[i0 * 3 + 2], true);

    // Vertex 1
    view.setFloat32(offset + 24, vertices[i1 * 3],     true);
    view.setFloat32(offset + 28, vertices[i1 * 3 + 1], true);
    view.setFloat32(offset + 32, vertices[i1 * 3 + 2], true);

    // Vertex 2
    view.setFloat32(offset + 36, vertices[i2 * 3],     true);
    view.setFloat32(offset + 40, vertices[i2 * 3 + 1], true);
    view.setFloat32(offset + 44, vertices[i2 * 3 + 2], true);

    // Attribute byte count
    view.setUint16(offset + 48, 0, true);

    offset += 50;
  }

  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
