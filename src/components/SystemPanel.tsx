/**
 * Destroyer Engine - Dedicated System & Engine Settings Panel
 * Houses GPU Culling, Post Processing, Shader Modes, and Lighting Intensity Controls
 */

import React from 'react';
import {
  Activity,
  Cpu,
  Eye,
  Flame,
  Layers,
  Moon,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  Tv,
  Zap,
} from 'lucide-react';
import { EngineStats } from '../engine/core/Types';
import { IndirectRenderer } from '../engine/render/IndirectRenderer';

interface SystemPanelProps {
  renderer: IndirectRenderer | null;
  stats: EngineStats;
  onUpdate: () => void;
}

export const SystemPanel: React.FC<SystemPanelProps> = ({
  renderer,
  stats,
  onUpdate,
}) => {
  if (!renderer) {
    return (
      <div className="p-6 text-zinc-400 text-sm font-mono flex items-center justify-center h-full">
        Engine renderer not initialized.
      </div>
    );
  }

  const handleCullingToggle = () => {
    renderer.cullingEnabled = !renderer.cullingEnabled;
    onUpdate();
  };

  const handleBloomToggle = () => {
    renderer.bloomEnabled = !renderer.bloomEnabled;
    onUpdate();
  };

  const handleVolumetricToggle = () => {
    renderer.volumetricEnabled = !renderer.volumetricEnabled;
    onUpdate();
  };

  const handleSSRToggle = () => {
    renderer.ssrEnabled = !renderer.ssrEnabled;
    onUpdate();
  };

  const handleDebugMode = (mode: number) => {
    renderer.debugMode = mode;
    onUpdate();
  };

  const handleLightIntensity = (val: number) => {
    renderer.lightIntensity = val;
    onUpdate();
  };

  const handleAmbientIntensity = (val: number) => {
    renderer.ambientIntensity = val;
    onUpdate();
  };

  const handleExposure = (val: number) => {
    renderer.exposure = val;
    onUpdate();
  };

  const handleResetLighting = () => {
    renderer.lightIntensity = 1.4;
    renderer.ambientIntensity = 0.35;
    renderer.exposure = 1.0;
    renderer.lightColor = [1.0, 0.96, 0.88];
    renderer.ambientColor = [0.35, 0.45, 0.6];
    renderer.lightDir = [-0.5, -1.0, -0.6];
    renderer.bloomEnabled = true;
    renderer.volumetricEnabled = true;
    renderer.ssrEnabled = true;
    renderer.debugMode = 0;
    onUpdate();
  };

  const shaderModes = [
    { id: 0, label: 'Cook-Torrance PBR', desc: 'Physically based rendering with GGX roughness' },
    { id: 1, label: 'World Normals', desc: 'Normal vector direction debug visualizer' },
    { id: 2, label: 'UV Mapping', desc: 'Texture coordinate grid checker' },
    { id: 3, label: 'Bone Weights', desc: 'Skeletal skinning weights color gradient' },
    { id: 4, label: 'Instance Hash', desc: 'Unique procedural instance colorizer' },
    { id: 5, label: 'Roughness Map', desc: 'Microsurface roughness grayscale view' },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6 text-zinc-300 font-sans max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            System & Engine Configuration
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure GPU compute pipelines, post-processing shaders, and scene lighting parameters.
          </p>
        </div>
        <button
          onClick={handleResetLighting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 hover:text-white transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Defaults
        </button>
      </div>

      {/* 1. Lighting Calibration (Directly solves white blowout) */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <Sun className="w-4 h-4 text-amber-400" />
            <span>Scene Lighting & Radiance Controls</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">ACES Filmic Color Space</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sunlight Intensity */}
          <div className="space-y-1.5 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-300 font-medium flex items-center gap-1">
                <Sun className="w-3.5 h-3.5 text-amber-400" /> Sun Radiance
              </span>
              <span className="font-mono text-amber-400 text-xs font-bold">
                {renderer.lightIntensity.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="4.0"
              step="0.05"
              value={renderer.lightIntensity}
              onChange={(e) => handleLightIntensity(parseFloat(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>0.1 (Dim)</span>
              <span>1.4 (Default)</span>
              <span>4.0 (Max)</span>
            </div>
          </div>

          {/* Ambient Light Intensity */}
          <div className="space-y-1.5 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-300 font-medium flex items-center gap-1">
                <Moon className="w-3.5 h-3.5 text-indigo-400" /> Ambient Fill
              </span>
              <span className="font-mono text-indigo-400 text-xs font-bold">
                {renderer.ambientIntensity.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={renderer.ambientIntensity}
              onChange={(e) => handleAmbientIntensity(parseFloat(e.target.value))}
              className="w-full accent-indigo-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>0.05 (Dark)</span>
              <span>0.35 (Default)</span>
              <span>1.0 (Bright)</span>
            </div>
          </div>

          {/* ACES Exposure */}
          <div className="space-y-1.5 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-300 font-medium flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-cyan-400" /> ACES Exposure
              </span>
              <span className="font-mono text-cyan-400 text-xs font-bold">
                {renderer.exposure.toFixed(2)} EV
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.5"
              step="0.05"
              value={renderer.exposure}
              onChange={(e) => handleExposure(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>0.2 (Moody)</span>
              <span>1.0 (Standard)</span>
              <span>2.5 (High)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. GPU Compute Culling & Pipeline Features */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>GPU Compute Frustum Culling</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              renderer.cullingEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            {renderer.cullingEnabled ? 'ACTIVE (SUBGROUP ACCELERATED)' : 'DISABLED'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800/60">
          <div>
            <div className="text-xs font-medium text-zinc-200">6-Plane Frustum Compute Dispatch</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Tests all {stats.totalInstances.toLocaleString()} entity bounding spheres on GPU in parallel before draw calls.
            </div>
          </div>
          <button
            onClick={handleCullingToggle}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-colors shrink-0 ${
              renderer.cullingEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            {renderer.cullingEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* 3. Unreal-Style Post Processing */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Post Processing FX Stack</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">Real-time WGSL Shaders</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Bloom */}
          <button
            onClick={handleBloomToggle}
            className={`p-3 rounded-lg border text-left transition-all ${
              renderer.bloomEnabled
                ? 'bg-purple-500/10 border-purple-500/40 text-purple-200'
                : 'bg-zinc-950/60 border-zinc-800/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" /> HDR Bloom
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  renderer.bloomEnabled ? 'bg-purple-500/20 text-purple-300' : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {renderer.bloomEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Thresholded glow on high-luminance emissive surfaces.
            </p>
          </button>

          {/* Volumetric God-Rays */}
          <button
            onClick={handleVolumetricToggle}
            className={`p-3 rounded-lg border text-left transition-all ${
              renderer.volumetricEnabled
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                : 'bg-zinc-950/60 border-zinc-800/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" /> God-Rays Shafts
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  renderer.volumetricEnabled ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {renderer.volumetricEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Atmospheric forward-scattering light beam simulation.
            </p>
          </button>

          {/* SSR */}
          <button
            onClick={handleSSRToggle}
            className={`p-3 rounded-lg border text-left transition-all ${
              renderer.ssrEnabled
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                : 'bg-zinc-950/60 border-zinc-800/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-cyan-400" /> Ground SSR
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  renderer.ssrEnabled ? 'bg-cyan-500/20 text-cyan-300' : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {renderer.ssrEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Screen-space planar surface reflections on glossy materials.
            </p>
          </button>
        </div>
      </div>

      {/* 4. Shader Pipeline Modes */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Shader Pipeline Modes & Diagnostics</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            Current: {shaderModes[renderer.debugMode]?.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {shaderModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleDebugMode(mode.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                renderer.debugMode === mode.id
                  ? 'bg-cyan-500/15 border-cyan-500 text-white shadow-lg shadow-cyan-950/50'
                  : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-white">{mode.label}</span>
                {renderer.debugMode === mode.id && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </div>
              <p className="text-[10px] text-zinc-400 line-clamp-2">{mode.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
