/**
 * Destroyer Engine - Clean Viewport HUD & Telemetry
 * Removed on-screen Animation and Load GLB buttons.
 * GPU Culling, Post Processing, and Shaders are moved to the System tab.
 */

import React, { useState } from 'react';
import {
  Activity,
  Box,
  Camera as CameraIcon,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Minimize2,
  Maximize2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { EngineStats } from '../engine/core/Types';

interface ViewportHUDProps {
  stats: EngineStats;
  cameraMode: 'ORBIT' | 'FPS' | 'FLY';
  onCameraModeChange: (mode: 'ORBIT' | 'FPS' | 'FLY') => void;
  onResetCamera: () => void;
}

export const ViewportHUD: React.FC<ViewportHUDProps> = ({
  stats,
  cameraMode,
  onCameraModeChange,
  onResetCamera,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <div className="absolute top-2 left-2 z-20 pointer-events-none flex flex-col gap-2 font-mono select-none">
      {/* Telemetry Card */}
      <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-lg p-2 sm:p-2.5 shadow-2xl pointer-events-auto transition-all text-xs text-zinc-300 w-52 sm:w-60">
        <div className="flex items-center justify-between border-b border-zinc-800/70 pb-1.5 mb-1.5">
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-[11px] sm:text-xs">
            <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>GPU TELEMETRY</span>
          </div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title={isMinimized ? 'Expand HUD' : 'Minimize HUD'}
          >
            {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* FPS & Performance Banner */}
        <div className="flex items-center justify-between bg-zinc-900/90 rounded px-2 py-1 mb-1.5 border border-zinc-800/60">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-base sm:text-lg font-bold ${
                stats.fps >= 55 ? 'text-emerald-400' : stats.fps >= 30 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {stats.fps}
            </span>
            <span className="text-[10px] text-zinc-400">FPS</span>
          </div>
          <div className="text-[10px] text-zinc-400 font-mono">
            {stats.frameTimeMs} <span className="text-zinc-500">ms</span>
          </div>
        </div>

        {!isMinimized && (
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="flex items-center gap-1">
                <Box className="w-3 h-3 text-cyan-400" /> Total Instances
              </span>
              <span className="font-semibold text-zinc-200">{stats.totalInstances.toLocaleString()}</span>
            </div>

            <div className="flex justify-between items-center text-zinc-400">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-emerald-400" /> Visible / Culled
              </span>
              <span className="font-semibold text-zinc-200">
                <span className="text-emerald-400">{stats.visibleInstances.toLocaleString()}</span>
                <span className="text-zinc-600"> / </span>
                <span className="text-rose-400">{stats.culledInstances.toLocaleString()}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-zinc-400">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-indigo-400" /> Triangles
              </span>
              <span className="font-semibold text-zinc-200">{stats.totalTriangles.toLocaleString()}</span>
            </div>

            <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" /> Subgroups
              </span>
              <span
                className={`px-1 rounded text-[9px] font-bold ${
                  stats.subgroupsActive
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {stats.subgroupsActive ? 'ENABLED' : 'OFF'}
              </span>
            </div>

            {/* Quick Camera Mode Switcher */}
            <div className="pt-1.5 border-t border-zinc-800/60 flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <CameraIcon className="w-3 h-3 text-cyan-400" /> Cam Mode
              </span>
              <div className="flex items-center gap-1">
                {(['ORBIT', 'FLY'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onCameraModeChange(mode)}
                    className={`px-1.5 py-0.5 text-[9px] rounded font-mono uppercase transition-colors ${
                      cameraMode === mode
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
