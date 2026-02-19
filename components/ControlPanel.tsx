import React from 'react';
import { GenParams } from '../types';
import { Box, Grid, Layers, SquareDashedKanban, Activity } from 'lucide-react';

interface ControlPanelProps {
  params: GenParams;
  onChange: (params: Partial<GenParams>) => void;
  disabled: boolean;
}

// ─── Printability heuristics ────────────────────────────────────────────────
// Gyroid wall physical thickness (mm) at the minimum cross-section:
//   t_wall ≈ 2 × wallThickness × cellSize / (√3 × π)
// Channel span (mm) — approximate tunnel width (overhang bridge length):
//   span  ≈ cellSize × (1 − wallThickness / π)
const estWallMM = (cellSize: number, wt: number) =>
  (2 * wt * cellSize) / (Math.sqrt(3) * Math.PI);

const estSpanMM = (cellSize: number, wt: number) =>
  cellSize * (1 - wt / Math.PI);

type Status = 'good' | 'warn' | 'bad';
const wallStatus = (mm: number): Status =>
  mm >= 3.0 ? 'good' : mm >= 1.5 ? 'warn' : 'bad';
const spanStatus = (mm: number): Status =>
  mm <= 20 ? 'good' : mm <= 35 ? 'warn' : 'bad';

const statusColor: Record<Status, string> = {
  good: 'text-green-400',
  warn: 'text-yellow-400',
  bad:  'text-red-400',
};
const statusDot: Record<Status, string> = {
  good: '●',
  warn: '◑',
  bad:  '○',
};

// ─── Slider helper ───────────────────────────────────────────────────────────
interface SliderProps {
  label: string;
  value: number | string;
  min: number;
  max: number;
  step: number;
  currentValue: number;
  onChange: (v: number) => void;
  disabled: boolean;
  hint?: React.ReactNode;
}
const Slider: React.FC<SliderProps> = ({
  label, value, min, max, step, currentValue, onChange, disabled, hint,
}) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-neutral-400">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step}
      value={currentValue}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      disabled={disabled}
      className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-40"
    />
    {hint && <div className="text-[10px] text-neutral-600 pt-0.5">{hint}</div>}
  </div>
);

// ─── Component ───────────────────────────────────────────────────────────────
export const ControlPanel: React.FC<ControlPanelProps> = ({ params, onChange, disabled }) => {
  // Derived printability values
  const cellCount     = Math.max(1, Math.round(params.size / params.cellSize));
  const actualCellMM  = params.size / cellCount;
  const wallMM        = estWallMM(actualCellMM, params.wallThickness);
  const spanMM        = estSpanMM(actualCellMM, params.wallThickness);
  const wStat         = wallStatus(wallMM);
  const sStat         = spanStatus(spanMM);
  const overallOk     = wStat !== 'bad' && sStat !== 'bad';

  return (
    <div className="p-6 space-y-8">

      {/* ── Volume Size ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <Box size={15} />
          <span className="text-sm font-semibold uppercase tracking-wider">Volume</span>
        </div>
        <Slider
          label="Size (mm)" value={`${params.size} mm`}
          min={20} max={250} step={5} currentValue={params.size}
          onChange={(v) => onChange({ size: v })} disabled={disabled}
          hint="Edge length of the cube in millimetres"
        />
      </section>

      {/* ── Cell Topology ───────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <Grid size={15} />
          <span className="text-sm font-semibold uppercase tracking-wider">Cell Topology</span>
        </div>

        {/* Cells per axis — the primary printability lever */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>Cells per axis</span>
            <span className="font-mono">{cellCount}</span>
          </div>
          <input
            type="range" min={1} max={8} step={1}
            value={cellCount}
            onChange={(e) => onChange({ cellSize: params.size / parseInt(e.target.value) })}
            disabled={disabled}
            className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-40"
          />
          <p className="text-[10px] text-neutral-500">
            Integer cell count — cells always fit exactly, creating clean face ports.
            <br/>
            <span className="text-neutral-400">Actual cell size: </span>
            <span className="font-mono text-cyan-500/80">{actualCellMM.toFixed(1)} mm</span>
          </p>
        </div>

        {/* Wall density */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>Wall density</span>
            <span className="font-mono">{params.wallThickness.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0.10} max={0.80} step={0.05}
            value={params.wallThickness}
            onChange={(e) => onChange({ wallThickness: parseFloat(e.target.value) })}
            disabled={disabled}
            className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-40"
          />
          <p className="text-[10px] text-neutral-500">
            Gyroid isovalue threshold — higher = thicker solid walls, narrower channels.
          </p>
        </div>

        {/* Printability summary */}
        <div className={`rounded-md border px-3 py-2 space-y-1 text-[11px] ${
          overallOk ? 'border-neutral-700 bg-neutral-800/40' : 'border-yellow-700/40 bg-yellow-900/10'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-neutral-400 font-semibold uppercase tracking-wider text-[10px]">
              Printability estimate
            </span>
            <span className={overallOk ? 'text-green-400 text-[10px]' : 'text-yellow-400 text-[10px]'}>
              {overallOk ? '✓ printable' : '⚠ check values'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Min wall thickness</span>
            <span className={`font-mono ${statusColor[wStat]}`}>
              {statusDot[wStat]} {wallMM.toFixed(1)} mm
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Max channel span</span>
            <span className={`font-mono ${statusColor[sStat]}`}>
              {statusDot[sStat]} {spanMM.toFixed(1)} mm
            </span>
          </div>
          <p className="text-neutral-600 pt-0.5 leading-tight">
            For clay printing: wall ≥ 3 mm, span ≤ 20 mm is ideal.
            Increase cells or wall density to improve.
          </p>
        </div>
      </section>

      {/* ── Structure ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <SquareDashedKanban size={15} />
          <span className="text-sm font-semibold uppercase tracking-wider">Structure</span>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-md overflow-hidden border border-neutral-700 text-sm font-medium">
          <button
            onClick={() => onChange({ useFrame: false })}
            disabled={disabled}
            className={`flex-1 py-2 transition-colors disabled:opacity-40 ${
              !params.useFrame
                ? 'bg-cyan-700 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Shell
          </button>
          <button
            onClick={() => onChange({ useFrame: true })}
            disabled={disabled}
            className={`flex-1 py-2 transition-colors disabled:opacity-40 ${
              params.useFrame
                ? 'bg-cyan-700 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Frame
          </button>
        </div>

        {/* Shell options */}
        {!params.useFrame && (
          <div className="space-y-3">
            <Slider
              label="Shell thickness" value={`${params.shellThickness.toFixed(1)} mm`}
              min={0.5} max={12} step={0.5} currentValue={params.shellThickness}
              onChange={(v) => onChange({ shellThickness: v })} disabled={disabled}
              hint={<>
                Hollow outer box. Ports open on:{' '}
                <span className="text-cyan-600/70">Z±→A</span>{' '}
                <span className="text-orange-600/70">X±→B</span>{' '}
                <span className="text-neutral-600">Y±→sealed</span>
              </>}
            />

            {/* Make Manifold (only relevant in shell mode) */}
            <div className="space-y-2">
              <button
                onClick={() => onChange({ makeManifold: !params.makeManifold })}
                disabled={disabled}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md border text-sm font-medium transition-colors disabled:opacity-40 ${
                  params.makeManifold
                    ? 'bg-cyan-900/40 border-cyan-600 text-cyan-300'
                    : 'bg-neutral-800/60 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${params.makeManifold ? 'bg-cyan-400' : 'bg-neutral-600'}`} />
                  Make Manifold
                </span>
                <span className="text-xs font-normal opacity-70">
                  {params.makeManifold ? 'sealed' : 'ports open'}
                </span>
              </button>
              <p className="text-[10px] text-neutral-600 leading-relaxed">
                {params.makeManifold
                  ? 'All port openings are sealed → fully watertight STL. Add inlet holes in your slicer/CAD tool.'
                  : 'Export with port openings for direct heat-exchanger use.'}
              </p>
            </div>
          </div>
        )}

        {/* Frame options */}
        {params.useFrame && (
          <div className="space-y-3">
            <Slider
              label="Beam width" value={`${params.frameBeamWidth.toFixed(1)} mm`}
              min={2} max={30} step={0.5} currentValue={params.frameBeamWidth}
              onChange={(v) => onChange({ frameBeamWidth: v })} disabled={disabled}
              hint="Square cross-section of each edge beam. 8–12 mm is solid for clay printing."
            />

            {/* Frame diagram */}
            <div className="rounded-md border border-neutral-800 bg-neutral-800/20 px-3 py-2 text-[10px] text-neutral-500 leading-snug space-y-0.5">
              <p className="text-neutral-400 font-medium">Frame geometry</p>
              <p>• 12 solid beams along all cube edges</p>
              <p>• 8 solid corner blocks where beams meet</p>
              <p>• 6 open faces (no shell) — both channels exit freely</p>
              <p className="text-neutral-600 pt-1">Make Manifold is not applicable in Frame mode — attach external manifolds to direct flow.</p>
            </div>
          </div>
        )}
      </section>

      {/* ── Quality ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <Layers size={15} />
          <span className="text-sm font-semibold uppercase tracking-wider">Quality</span>
        </div>

        <Slider
          label="Resolution" value={`${params.resolution}³`}
          min={30} max={150} step={5} currentValue={params.resolution}
          onChange={(v) => onChange({ resolution: v })} disabled={disabled}
          hint={
            params.resolution > 90
              ? <span className="text-orange-500">High resolution — generation may be slow.</span>
              : 'Voxel density per axis.'
          }
        />

        <Slider
          label="Smoothing passes" value={params.smoothingIterations ?? 0}
          min={0} max={30} step={1} currentValue={params.smoothingIterations ?? 0}
          onChange={(v) => onChange({ smoothingIterations: v })} disabled={disabled}
          hint="Taubin smoothing iterations — reduces voxel staircasing without shrinking the mesh."
        />
      </section>

      {/* ── Channel info ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 text-cyan-400 mb-2">
          <Activity size={15} />
          <span className="text-sm font-semibold uppercase tracking-wider">Channel layout</span>
        </div>
        {params.useFrame ? (
          <div className="rounded-md border border-neutral-800 bg-neutral-800/30 px-3 py-2 text-[11px] space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="text-neutral-300">Channel A — exits all open faces</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-400"></span>
              <span className="text-neutral-300">Channel B — exits all open faces</span>
            </div>
            <p className="text-neutral-600 pt-1 leading-tight">
              Frame mode: all 6 faces are open. Attach external manifolds/face-plates to direct each channel to its intended faces.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-neutral-800 bg-neutral-800/30 px-3 py-2 text-[11px] space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="text-neutral-300">Channel A — exits Z faces (top / bottom)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-400"></span>
              <span className="text-neutral-300">Channel B — exits X faces (left / right)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-neutral-500"></span>
              <span className="text-neutral-500">Y faces — sealed (no port)</span>
            </div>
            <p className="text-neutral-600 pt-1 leading-tight">
              Print with Z-axis vertical. Channel A tunnels are vertical (no overhang). Channel B tunnels are horizontal — keep cell count high for smaller spans.
            </p>
          </div>
        )}
      </section>

    </div>
  );
};
