/**
 * Destroyer Engine - Top Navigation Bar
 * Direct main-view panel toggles, preset switcher, and engine telemetry.
 */

import React from 'react';
import {
  Box,
  Cpu,
  Layers,
  Sliders,
  RotateCcw,
  Plus,
} from 'lucide-react';

interface NavigationProps {
  showLeftPanel: boolean;
  onToggleLeftPanel: () => void;
  showRightPanel: boolean;
  onToggleRightPanel: () => void;
  rightPanelTab: 'system' | 'inspector';
  onSetRightPanelTab: (tab: 'system' | 'inspector') => void;
  currentPreset: string;
  onSelectPreset: (preset: string) => void;
  onResetCamera: () => void;
  onSpawnCube: () => void;
  fps: number;
  subgroupsActive?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  showLeftPanel,
  onToggleLeftPanel,
  showRightPanel,
  onToggleRightPanel,
  rightPanelTab,
  onSetRightPanelTab,
  currentPreset,
  onSelectPreset,
  onResetCamera,
  onSpawnCube,
  fps,
  subgroupsActive = false,
}) => {
  const presets = [
    { id: 'anarchy', label: 'Anarchy (GTA City Grid)' },
    { id: 'massive_indirect', label: '10,000 Mechs (Indirect)' },
    { id: 'skinned_mech', label: 'Skinned Mechs (Rig)' },
    { id: 'morph_core', label: 'Quantum Core (Morph)' },
    { id: 'wave_terrain', label: 'Harmonic Waves' },
  ];

  return (
    <header className="h-11 sm:h-12 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md px-2 sm:px-4 flex items-center justify-between shrink-0 select-none z-30 font-sans">
      {/* Zone 1: Logo & Preset Selector */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-cyan-500/20">
            D
          </div>
          <span className="font-bold text-xs sm:text-sm text-white tracking-wider hidden sm:inline">
            DESTROYER
          </span>
        </div>

        {/* Demo Preset Dropdown */}
        <div className="relative flex items-center">
          <select
            value={currentPreset}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500 font-medium cursor-pointer max-w-[140px] sm:max-w-[190px] truncate"
            title="Switch Demo Preset"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Zone 2: Main View Panel Toggles */}
      <div className="flex items-center gap-1 bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800">
        {/* Outliner / Hierarchy Panel Toggle */}
        <button
          onClick={onToggleLeftPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            showLeftPanel
              ? 'bg-zinc-800 text-cyan-400 font-bold shadow-inner'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          title="Toggle Hierarchy & Scene Outliner"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Outliner</span>
        </button>

        {/* System & Graphics Panel Toggle */}
        <button
          onClick={() => {
            if (showRightPanel && rightPanelTab === 'system') {
              onToggleRightPanel();
            } else {
              onSetRightPanelTab('system');
              if (!showRightPanel) onToggleRightPanel();
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            showRightPanel && rightPanelTab === 'system'
              ? 'bg-cyan-500 text-zinc-950 font-bold shadow'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          title="Toggle System, Lighting & Shader Controls"
        >
          <Cpu className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">System & GPU</span>
        </button>

        {/* Inspector Panel Toggle */}
        <button
          onClick={() => {
            if (showRightPanel && rightPanelTab === 'inspector') {
              onToggleRightPanel();
            } else {
              onSetRightPanelTab('inspector');
              if (!showRightPanel) onToggleRightPanel();
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            showRightPanel && rightPanelTab === 'inspector'
              ? 'bg-cyan-500 text-zinc-950 font-bold shadow'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          title="Toggle Inspector & Entity Properties"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Inspector</span>
        </button>
      </div>

      {/* Zone 3: Quick Action & Live Telemetry */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSpawnCube}
          className="hidden md:flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-xs text-zinc-300 hover:text-white transition-colors"
          title="Spawn Procedural Cube"
        >
          <Plus className="w-3 h-3 text-cyan-400" />
          <span>Add Cube</span>
        </button>

        <button
          onClick={onResetCamera}
          className="flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-xs text-zinc-300 hover:text-white transition-colors"
          title="Reset Camera View"
        >
          <RotateCcw className="w-3 h-3 text-zinc-400" />
          <span className="hidden sm:inline">Reset Cam</span>
        </button>

        {subgroupsActive && (
          <span className="hidden lg:inline px-1.5 py-0.5 bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 rounded text-[10px] font-mono">
            SUBGROUPS
          </span>
        )}

        {/* Live FPS Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-mono text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-300 font-semibold">{fps}</span>
          <span className="text-zinc-500 text-[10px]">FPS</span>
        </div>
      </div>
    </header>
  );
};
