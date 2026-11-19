/**
 * Destroyer Engine - Scene Hierarchy Outliner & Workspace Manager
 * Includes mesh groups, instance selection, procedural spawning, and GLB upload.
 */

import React, { useState, useRef } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Film,
  Folder,
  Layers,
  Play,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { FlatEntityManager } from '../engine/core/FlatEntityManager';

interface BackendWorkspaceEditorProps {
  entityManager: FlatEntityManager | null;
  selectedEntityId: number | null;
  onSelectEntity: (id: number) => void;
  onSpawnCube: () => void;
  onLoadGLB: (buffer: ArrayBuffer, fileName: string) => void;
  onUpdate: () => void;
  onLoadBVH?: (bvhText: string, name: string) => void;
  onSelectAnimation?: (clipName: string) => void;
  availableAnimations?: string[];
  activeAnimationName?: string;
  activePlayerSource?: string;
}

export const BackendWorkspaceEditor: React.FC<BackendWorkspaceEditorProps> = ({
  entityManager,
  selectedEntityId,
  onSelectEntity,
  onSpawnCube,
  onLoadGLB,
  onLoadBVH,
  onSelectAnimation,
  availableAnimations = [],
  activeAnimationName = '',
  activePlayerSource = 'Procedural Humanoid',
}) => {
  const [expandedMeshes, setExpandedMeshes] = useState<Record<number, boolean>>({
    0: true,
    1: true,
  });
  const [showBVHModal, setShowBVHModal] = useState(false);
  const [mocapStatus, setMocapStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bvhInputRef = useRef<HTMLInputElement>(null);

  if (!entityManager) return null;

  const toggleMeshExpand = (meshId: number) => {
    setExpandedMeshes((prev) => ({ ...prev, [meshId]: !prev[meshId] }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        onLoadGLB(reader.result, file.name);
        setMocapStatus(`Loaded GLB: ${file.name}`);
        setTimeout(() => setMocapStatus(null), 3500);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleBVHUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      if (text && onLoadBVH) {
        onLoadBVH(text, file.name);
        setMocapStatus(`Loaded BVH: ${file.name}`);
        setTimeout(() => setMocapStatus(null), 3500);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const registeredMeshes = entityManager.registeredMeshes;
  const entityRecords = entityManager.entityRecords;

  // Group entities by meshId
  const entitiesByMesh: Record<number, number[]> = {};
  for (let i = 0; i < entityManager.activeEntityCount; i++) {
    const meshId = entityRecords[i]?.meshId ?? 0;
    if (!entitiesByMesh[meshId]) entitiesByMesh[meshId] = [];
    entitiesByMesh[meshId].push(i);
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950/95 border-r border-zinc-800/80 w-full select-none text-xs font-sans relative">
      {/* Header Actions */}
      <div className="p-2.5 border-b border-zinc-800 flex items-center justify-between gap-1.5 flex-wrap">
        <span className="font-bold text-white tracking-wide flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-cyan-400" />
          Scene Hierarchy
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onSpawnCube}
            className="flex items-center gap-1 px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded font-medium transition-colors"
            title="Spawn Procedural Cube"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded font-medium transition-colors"
            title="Import GLB/glTF Player Rig"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            <span>GLB</span>
          </button>
          <button
            onClick={() => setShowBVHModal(true)}
            className="flex items-center gap-1 px-2 py-1 bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 rounded font-mono font-bold text-[10px] transition-colors"
            title="Open BVH Motion Capture & Character Rig Editor Popup"
          >
            <Film className="w-3 h-3 text-cyan-400" />
            <span>BVH MOCAP</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileUpload}
            className="hidden"
          />
          <input
            ref={bvhInputRef}
            type="file"
            accept=".bvh"
            onChange={handleBVHUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Mesh Groups & Instance List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {registeredMeshes.length === 0 ? (
          <div className="text-zinc-500 text-center py-6">No scene containers loaded.</div>
        ) : (
          registeredMeshes.map((mesh) => {
            const isExpanded = !!expandedMeshes[mesh.id];
            const instances = entitiesByMesh[mesh.id] || [];
            const displayInstances = instances.slice(0, 100); // cap display for 10k scenes

            return (
              <div key={mesh.id} className="bg-zinc-900/50 rounded border border-zinc-800/60 overflow-hidden">
                {/* Mesh Group Header */}
                <div
                  onClick={() => toggleMeshExpand(mesh.id)}
                  className="flex items-center justify-between p-2 hover:bg-zinc-800/50 cursor-pointer text-zinc-300"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-white truncate">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{mesh.name}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded shrink-0">
                    {instances.length} inst
                  </span>
                </div>

                {/* Instance Child List */}
                {isExpanded && (
                  <div className="pl-4 pr-1.5 py-1 space-y-0.5 border-t border-zinc-800/50 bg-zinc-950/40">
                    {displayInstances.map((id) => {
                      const rec = entityRecords[id];
                      const isSelected = selectedEntityId === id;
                      return (
                        <div
                          key={id}
                          onClick={() => onSelectEntity(id)}
                          className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Box className="w-3 h-3 text-zinc-500 shrink-0" />
                            <span className="truncate">{rec?.name || `Entity_${id}`}</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-600">#{id}</span>
                        </div>
                      );
                    })}
                    {instances.length > 100 && (
                      <div className="text-[10px] text-zinc-500 text-center py-1 font-mono">
                        + {(instances.length - 100).toLocaleString()} more instances
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Editor Popup Modal: BVH Mocap Player & Character GLB Rig Loader */}
      {showBVHModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBVHModal(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-4 font-mono text-xs space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Film className="w-4 h-4 text-cyan-400" />
                <span>BVH MOCAP &amp; Rig Editor</span>
              </div>
              <button
                type="button"
                onClick={() => setShowBVHModal(false)}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {mocapStatus && (
              <div className="px-2.5 py-1.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-200 text-[11px]">
                {mocapStatus}
              </div>
            )}

            <div className="text-[11px] text-zinc-400 truncate">
              Active Rig: <span className="text-emerald-300 font-semibold">{activePlayerSource}</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                Active Clips on Mesh
              </div>
              {availableAnimations.length === 0 ? (
                <div className="text-zinc-500 py-2">No skeleton clips loaded yet.</div>
              ) : (
                availableAnimations.map((animName) => {
                  const isActive = activeAnimationName === animName;
                  return (
                    <button
                      key={animName}
                      type="button"
                      onClick={() => {
                        if (onSelectAnimation) onSelectAnimation(animName);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                      }`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        <Play className={`w-3 h-3 ${isActive ? 'text-cyan-400 fill-cyan-400' : 'text-zinc-500'}`} />
                        {animName}
                      </span>
                      {animName.includes('Jump') && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                          SPACE
                        </span>
                      )}
                      {animName.includes('Punch') && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-orange-950 text-orange-300 border border-orange-800/50">
                          F
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <button
                type="button"
                onClick={() => bvhInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Load .BVH Motion</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Load Player .GLB Rig</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
