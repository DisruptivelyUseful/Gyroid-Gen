import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { MeshData, GenParams } from '../types';

interface GeometryPreviewProps {
  meshData: MeshData | null;
  params: GenParams;
}

export const GeometryPreview: React.FC<GeometryPreviewProps> = ({ meshData, params }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const half = params.size / 2;

  const geometry = useMemo(() => {
    if (!meshData || meshData.vertices.length === 0) return null;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(meshData.vertices, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));

    // Use indexed geometry — key for proper manifold rendering
    if (meshData.indices && meshData.indices.length > 0) {
      geom.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    }

    geom.computeBoundingBox();
    return geom;
  }, [meshData]);

  return (
    <group>
      {geometry && (
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color="#4ade80"
            roughness={0.3}
            metalness={0.2}
            flatShading={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Channel face labels */}
      <Html position={[0, 0, half + 8]} center distanceFactor={200}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ background: 'rgba(34,211,238,0.85)', color: '#000', padding: '2px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Z+ &nbsp;Channel A
        </div>
      </Html>
      <Html position={[0, 0, -half - 8]} center distanceFactor={200}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ background: 'rgba(34,211,238,0.85)', color: '#000', padding: '2px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Z− &nbsp;Channel A
        </div>
      </Html>
      <Html position={[half + 8, 0, 0]} center distanceFactor={200}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ background: 'rgba(251,146,60,0.85)', color: '#000', padding: '2px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          X+ &nbsp;Channel B
        </div>
      </Html>
      <Html position={[-half - 8, 0, 0]} center distanceFactor={200}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ background: 'rgba(251,146,60,0.85)', color: '#000', padding: '2px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          X− &nbsp;Channel B
        </div>
      </Html>
      <Html position={[0, half + 8, 0]} center distanceFactor={200}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ background: 'rgba(163,163,163,0.7)', color: '#000', padding: '2px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Y+ &nbsp;Sealed
        </div>
      </Html>
      <Html position={[0, -half - 8, 0]} center distanceFactor={200}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ background: 'rgba(163,163,163,0.7)', color: '#000', padding: '2px 8px',
                      borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Y− &nbsp;Sealed
        </div>
      </Html>
    </group>
  );
};
