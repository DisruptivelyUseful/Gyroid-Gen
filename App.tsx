import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { ControlPanel } from './components/ControlPanel';
import { GeometryPreview } from './components/GeometryPreview';
import { generateGyroidMesh } from './utils/marchingCubes';
import { exportToSTL } from './utils/stl';
import { GenParams, MeshData } from './types';
import * as THREE from 'three';

const App: React.FC = () => {
  const [params, setParams] = useState<GenParams>({
    size: 100,               // mm — cube edge length
    cellSize: 25,            // mm — target cell size (auto-snaps to integer count)
                             //   100 / 25 = 4 cells → estWall ≈ 3.2mm, span ≈ 22mm
    wallThickness: 0.35,     // gyroid isovalue threshold (unitless)
    // Structural boundary
    useFrame: false,         // false = shell, true = edge-beam frame
    shellThickness: 3.0,     // mm — hollow outer box wall thickness (shell mode)
    frameBeamWidth: 10,      // mm — square beam cross-section (frame mode)
    // Quality / export
    resolution: 60,          // voxels per axis (60³ ≈ 216k voxels)
    smoothingIterations: 8,  // Taubin smoothing passes
    makeManifold: false,     // (shell mode) seal port openings → watertight STL
  });

  const [meshData, setMeshData] = useState<MeshData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [vertexCount, setVertexCount] = useState(0);
  const [faceCount, setFaceCount] = useState(0);

  const handleParamChange = (newParams: Partial<GenParams>) => {
    setParams(prev => ({ ...prev, ...newParams }));
  };

  const generate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setProgress(0);

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const data = await generateGyroidMesh(params, (p) => setProgress(p));
      setMeshData(data);
      setVertexCount(data.vertices.length / 3);
      setFaceCount(data.indices.length / 3);
    } catch (e) {
      console.error('Generation failed', e);
    } finally {
      setIsGenerating(false);
      setProgress(100);
    }
  }, [params, isGenerating]);

  // Auto-generate on mount
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = () => {
    if (!meshData) return;
    exportToSTL(meshData, `gyroid-${params.size}mm-cell${params.cellSize}.stl`);
  };

  return (
    <div className="flex h-screen w-screen bg-neutral-900 text-neutral-100 overflow-hidden font-sans">
      {/* Sidebar Controls */}
      <aside className="w-80 flex-shrink-0 flex flex-col border-r border-neutral-800 bg-neutral-900/95 backdrop-blur z-10 overflow-y-auto">
        <div className="p-6 border-b border-neutral-800">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            GyroidGen
          </h1>
          <p className="text-xs text-neutral-500 mt-1">Dual-channel heat exchanger core</p>
        </div>

        <ControlPanel
          params={params}
          onChange={handleParamChange}
          disabled={isGenerating}
        />

        <div className="p-6 mt-auto border-t border-neutral-800 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-neutral-400">
              <span>Status</span>
              <span className={isGenerating ? 'text-yellow-400' : 'text-green-400'}>
                {isGenerating ? `Generating ${Math.round(progress)}%` : 'Ready'}
              </span>
            </div>
            {isGenerating && (
              <div className="h-1 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-100 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            <div className="flex justify-between text-xs text-neutral-500">
              <span>Vertices</span>
              <span>{vertexCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-neutral-500">
              <span>Faces</span>
              <span>{faceCount.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={generate}
              disabled={isGenerating}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                isGenerating
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
              }`}
            >
              Update
            </button>
            <button
              onClick={handleExport}
              disabled={isGenerating || !meshData}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                isGenerating || !meshData
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20'
              }`}
            >
              Export STL
            </button>
          </div>
        </div>
      </aside>

      {/* 3D Viewport */}
      <main className="flex-1 relative bg-neutral-950">
        <div className="absolute inset-0">
          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[params.size * 1.5, params.size * 1.2, params.size * 1.5]} fov={45} />
            <OrbitControls makeDefault minDistance={10} maxDistance={500} target={[0, 0, 0]} />

            <ambientLight intensity={0.4} />
            <directionalLight
              position={[50, 50, 25]}
              intensity={1}
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight position={[-50, -50, -25]} intensity={0.5} color="#ccf" />

            <group position={[0, 0, 0]}>
              <GeometryPreview meshData={meshData} params={params} />

              <gridHelper args={[params.size * 2, 10, 0x444444, 0x222222]} position={[0, -params.size / 2, 0]} />
              <axesHelper args={[params.size / 2 + 10]} />
            </group>

            <Environment preset="city" />
          </Canvas>
        </div>

        <div className="absolute top-4 right-4 pointer-events-none">
          <div className="bg-neutral-900/80 backdrop-blur px-3 py-2 rounded text-xs text-neutral-400 border border-neutral-800">
            LMB: Rotate • RMB: Pan • Scroll: Zoom
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
