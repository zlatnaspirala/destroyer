/**
 * Destroyer Engine - Scene Hierarchy Outliner & Workspace Manager
 * Includes mesh groups, instance selection, procedural spawning, and GLB upload.
 */

import React, { useState, useRef } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  Layers,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { FlatEntityManager } from '../engine/core/FlatEntityManager';

interface BackendWorkspaceEditorProps {
  entityManager: FlatEntityManager | null;
  selectedEntityId: number | null;
  onSelectEntity: (id: number) => void;
  onSpawnCube: () => void;
  onLoadGLB: (buffer: ArrayBuffer, fileName: string) => void;
  onUpdate: () => void;
}

export const BackendWorkspaceEditor: React.FC<BackendWorkspaceEditorProps> = ({
  entityManager,
  selectedEntityId,
  onSelectEntity,
  onSpawnCube,
  onLoadGLB,
  onUpdate,
}) => {
  const [expandedMeshes, setExpandedMeshes] = useState<Record<number, boolean>>({
    0: true,
    1: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      }
    };
    reader.readAsArrayBuffer(file);
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
    <div className="h-full flex flex-col bg-zinc-950/95 border-r border-zinc-800/80 w-full select-none text-xs font-sans">
      {/* Header Actions */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="font-bold text-white tracking-wide flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-cyan-400" />
          Scene Hierarchy
        </span>
        <div className="flex items-center gap-1.5">
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
            title="Import GLB/glTF Model"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            <span>GLB</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileUpload}
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
    </div>
  );
};
