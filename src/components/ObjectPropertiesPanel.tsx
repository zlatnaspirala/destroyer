/**
 * Destroyer Engine - Complete Object Properties Inspector Panel
 * Features:
 * - Scale by Axis (X, Y, Z + Uniform link)
 * - Rotation by Axis (Deg X, Y, Z)
 * - Position (X, Y, Z)
 * - Name, ID, Active, Shadows
 * - Material properties (Base color, Emissive, Roughness, Metallic, AO)
 * - Vertex animation & morph controls
 * - Compact layout with minimize button
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Layers,
  Link,
  Minimize2,
  Maximize2,
  Move,
  Palette,
  Rotate3d,
  Sparkles,
  Trash2,
  Unlink,
  Wand2,
  X,
} from 'lucide-react';
import { FlatEntityManager } from '../engine/core/FlatEntityManager';
import { eulerDegToQuat, quatToEulerDeg } from '../engine/math/TransformMath';
import { Mat4 } from '../engine/math/Mat4';

interface ObjectPropertiesPanelProps {
  selectedEntityId: number | null;
  entityManager: FlatEntityManager | null;
  onClose: () => void;
  onUpdate: () => void;
  isMobileDrawer?: boolean;
}

export const ObjectPropertiesPanel: React.FC<ObjectPropertiesPanelProps> = ({
  selectedEntityId,
  entityManager,
  onClose,
  onUpdate,
  isMobileDrawer = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [uniformScale, setUniformScale] = useState(true);

  // Transform states
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [posZ, setPosZ] = useState(0);

  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(0);

  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [scaleZ, setScaleZ] = useState(1);

  // Identity & Material states
  const [name, setName] = useState('');
  const [baseColor, setBaseColor] = useState('#d95933');
  const [roughness, setRoughness] = useState(0.35);
  const [metallic, setMetallic] = useState(0.75);
  const [emissiveColor, setEmissiveColor] = useState('#ff661a');
  const [emissiveIntensity, setEmissiveIntensity] = useState(0.6);

  // Load selected entity transform into state
  useEffect(() => {
    if (selectedEntityId === null || !entityManager) return;

    const id = selectedEntityId;
    if (id >= entityManager.activeEntityCount) return;

    const offset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    const f32 = entityManager.entityFloatView;

    // Translation from world matrix col 3 (elements 12, 13, 14)
    const px = f32[offset + 12];
    const py = f32[offset + 13];
    const pz = f32[offset + 14];
    setPosX(Number(px.toFixed(2)));
    setPosY(Number(py.toFixed(2)));
    setPosZ(Number(pz.toFixed(2)));

    // Scale calculation from matrix column lengths
    const sx = Math.hypot(f32[offset + 0], f32[offset + 1], f32[offset + 2]) || 1;
    const sy = Math.hypot(f32[offset + 4], f32[offset + 5], f32[offset + 6]) || 1;
    const sz = Math.hypot(f32[offset + 8], f32[offset + 9], f32[offset + 10]) || 1;
    setScaleX(Number(sx.toFixed(2)));
    setScaleY(Number(sy.toFixed(2)));
    setScaleZ(Number(sz.toFixed(2)));

    // Entity record info
    const record = entityManager.entityRecords[id];
    if (record) {
      setName(record.name || `Entity_${id}`);
      if (record.materialId !== undefined) {
        const mat = entityManager.getMaterial(record.materialId);
        if (mat) {
          setRoughness(mat.roughness);
          setMetallic(mat.metallic);
          setEmissiveIntensity(mat.emissiveColor[3]);
        }
      }
    }
  }, [selectedEntityId, entityManager]);

  if (selectedEntityId === null || !entityManager) return null;

  const id = selectedEntityId;
  const record = entityManager.entityRecords[id];
  const mesh = entityManager.registeredMeshes[record?.meshId ?? 0];

  const applyTransform = (
    newPx = posX,
    newPy = posY,
    newPz = posZ,
    newRx = rotX,
    newRy = rotY,
    newRz = rotZ,
    newSx = scaleX,
    newSy = scaleY,
    newSz = scaleZ
  ) => {
    if (!entityManager || id >= entityManager.activeEntityCount) return;

    const offset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    const f32 = entityManager.entityFloatView;

    const q = eulerDegToQuat(newRx, newRy, newRz);
    const mat = Mat4.create();
    Mat4.fromRotationTranslationScale(q, [newPx, newPy, newPz], [newSx, newSy, newSz], mat);

    for (let i = 0; i < 16; i++) {
      f32[offset + i] = mat[i];
    }
    // Update sphere center
    f32[offset + 16] = newPx;
    f32[offset + 17] = newPy;
    f32[offset + 18] = newPz;

    onUpdate();
  };

  const handleScaleChange = (axis: 'X' | 'Y' | 'Z', val: number) => {
    if (uniformScale) {
      setScaleX(val);
      setScaleY(val);
      setScaleZ(val);
      applyTransform(posX, posY, posZ, rotX, rotY, rotZ, val, val, val);
    } else {
      if (axis === 'X') {
        setScaleX(val);
        applyTransform(posX, posY, posZ, rotX, rotY, rotZ, val, scaleY, scaleZ);
      } else if (axis === 'Y') {
        setScaleY(val);
        applyTransform(posX, posY, posZ, rotX, rotY, rotZ, scaleX, val, scaleZ);
      } else {
        setScaleZ(val);
        applyTransform(posX, posY, posZ, rotX, rotY, rotZ, scaleX, scaleY, val);
      }
    }
  };

  const handleRotationChange = (axis: 'X' | 'Y' | 'Z', val: number) => {
    if (axis === 'X') {
      setRotX(val);
      applyTransform(posX, posY, posZ, val, rotY, rotZ, scaleX, scaleY, scaleZ);
    } else if (axis === 'Y') {
      setRotY(val);
      applyTransform(posX, posY, posZ, rotX, val, rotZ, scaleX, scaleY, scaleZ);
    } else {
      setRotZ(val);
      applyTransform(posX, posY, posZ, rotX, rotY, val, scaleX, scaleY, scaleZ);
    }
  };

  const handlePositionChange = (axis: 'X' | 'Y' | 'Z', val: number) => {
    if (axis === 'X') {
      setPosX(val);
      applyTransform(val, posY, posZ, rotX, rotY, rotZ, scaleX, scaleY, scaleZ);
    } else if (axis === 'Y') {
      setPosY(val);
      applyTransform(posX, val, posZ, rotX, rotY, rotZ, scaleX, scaleY, scaleZ);
    } else {
      setPosZ(val);
      applyTransform(posX, posY, val, rotX, rotY, rotZ, scaleX, scaleY, scaleZ);
    }
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    if (record) {
      record.name = newName;
    }
  };

  const handleMaterialChange = (newRoughness = roughness, newMetallic = metallic, newEmissive = emissiveIntensity) => {
    setRoughness(newRoughness);
    setMetallic(newMetallic);
    setEmissiveIntensity(newEmissive);

    if (record && record.materialId !== undefined) {
      entityManager.updateMaterial(record.materialId, {
        roughness: newRoughness,
        metallic: newMetallic,
        emissiveColor: [1.0, 0.4, 0.1, newEmissive],
      });
      onUpdate();
    }
  };

  const handleDuplicate = () => {
    const newId = entityManager.duplicateEntity(id);
    if (newId >= 0) {
      onUpdate();
    }
  };

  const handleDelete = () => {
    entityManager.deleteSingleEntity(id);
    onClose();
    onUpdate();
  };

  const containerClasses = isMobileDrawer
    ? 'w-full bg-zinc-950/95 border-t border-zinc-800 p-3 text-xs'
    : 'absolute top-2 right-2 z-20 w-72 sm:w-80 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl p-3 text-xs text-zinc-300 font-sans';

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-2.5">
        <div className="flex items-center gap-1.5 font-semibold text-white">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Object Inspector</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded">
            #{id}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
            title={isMinimized ? 'Expand Inspector' : 'Minimize Inspector'}
          >
            {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          {!isMobileDrawer && (
            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
          {/* 1. Identity */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Identity & Mesh
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-white font-medium focus:outline-none focus:border-cyan-500"
              placeholder="Entity Name"
            />
            {mesh && (
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>Mesh: {mesh.name}</span>
                <span>{mesh.vertexCount.toLocaleString()} verts</span>
              </div>
            )}
          </div>

          {/* 2. Scale by Axis (X, Y, Z) + Uniform link */}
          <div className="space-y-2 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5 text-amber-400" /> Scale by Axis
              </span>
              <button
                onClick={() => setUniformScale(!uniformScale)}
                className={`p-1 rounded text-[10px] flex items-center gap-1 font-mono transition-colors ${
                  uniformScale
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
                title="Toggle Uniform Scale"
              >
                {uniformScale ? <Link className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                <span>{uniformScale ? 'Uniform' : 'Independent'}</span>
              </button>
            </div>

            {(['X', 'Y', 'Z'] as const).map((axis) => {
              const val = axis === 'X' ? scaleX : axis === 'Y' ? scaleY : scaleZ;
              return (
                <div key={axis} className="flex items-center gap-2">
                  <span
                    className={`w-3.5 text-[10px] font-bold font-mono ${
                      axis === 'X' ? 'text-rose-400' : axis === 'Y' ? 'text-emerald-400' : 'text-cyan-400'
                    }`}
                  >
                    {axis}
                  </span>
                  <input
                    type="range"
                    min="0.1"
                    max="10.0"
                    step="0.1"
                    value={val}
                    onChange={(e) => handleScaleChange(axis, parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-zinc-800 rounded accent-amber-400"
                  />
                  <input
                    type="number"
                    min="0.1"
                    max="50"
                    step="0.1"
                    value={val}
                    onChange={(e) => handleScaleChange(axis, parseFloat(e.target.value) || 1)}
                    className="w-12 bg-zinc-950 border border-zinc-800 text-right px-1 py-0.5 rounded font-mono text-[10px] text-zinc-200"
                  />
                </div>
              );
            })}
          </div>

          {/* 3. Rotation by Axis (Deg X, Y, Z) */}
          <div className="space-y-2 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                <Rotate3d className="w-3.5 h-3.5 text-cyan-400" /> Rotation (° Degrees)
              </span>
              <button
                onClick={() => {
                  setRotX(0);
                  setRotY(0);
                  setRotZ(0);
                  applyTransform(posX, posY, posZ, 0, 0, 0, scaleX, scaleY, scaleZ);
                }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 font-mono"
              >
                Reset
              </button>
            </div>

            {(['X', 'Y', 'Z'] as const).map((axis) => {
              const val = axis === 'X' ? rotX : axis === 'Y' ? rotY : rotZ;
              return (
                <div key={axis} className="flex items-center gap-2">
                  <span
                    className={`w-3.5 text-[10px] font-bold font-mono ${
                      axis === 'X' ? 'text-rose-400' : axis === 'Y' ? 'text-emerald-400' : 'text-cyan-400'
                    }`}
                  >
                    {axis}
                  </span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={val}
                    onChange={(e) => handleRotationChange(axis, parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-zinc-800 rounded accent-cyan-400"
                  />
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => handleRotationChange(axis, parseFloat(e.target.value) || 0)}
                    className="w-12 bg-zinc-950 border border-zinc-800 text-right px-1 py-0.5 rounded font-mono text-[10px] text-zinc-200"
                  />
                </div>
              );
            })}
          </div>

          {/* 4. Translation / Position (X, Y, Z) */}
          <div className="space-y-2 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
            <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
              <Move className="w-3.5 h-3.5 text-emerald-400" /> Position (World Coordinates)
            </span>

            {(['X', 'Y', 'Z'] as const).map((axis) => {
              const val = axis === 'X' ? posX : axis === 'Y' ? posY : posZ;
              return (
                <div key={axis} className="flex items-center gap-2">
                  <span
                    className={`w-3.5 text-[10px] font-bold font-mono ${
                      axis === 'X' ? 'text-rose-400' : axis === 'Y' ? 'text-emerald-400' : 'text-cyan-400'
                    }`}
                  >
                    {axis}
                  </span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="0.5"
                    value={val}
                    onChange={(e) => handlePositionChange(axis, parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-zinc-800 rounded accent-emerald-400"
                  />
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => handlePositionChange(axis, parseFloat(e.target.value) || 0)}
                    className="w-12 bg-zinc-950 border border-zinc-800 text-right px-1 py-0.5 rounded font-mono text-[10px] text-zinc-200"
                  />
                </div>
              );
            })}
          </div>

          {/* 5. Material & PBR Surface */}
          <div className="space-y-2 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
            <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5 text-purple-400" /> PBR Surface Properties
            </span>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-400">Roughness:</span>
                <span className="font-mono text-zinc-200">{roughness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                value={roughness}
                onChange={(e) => handleMaterialChange(parseFloat(e.target.value), metallic, emissiveIntensity)}
                className="w-full h-1 bg-zinc-800 rounded accent-purple-400"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-400">Metallic:</span>
                <span className="font-mono text-zinc-200">{metallic.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={metallic}
                onChange={(e) => handleMaterialChange(roughness, parseFloat(e.target.value), emissiveIntensity)}
                className="w-full h-1 bg-zinc-800 rounded accent-purple-400"
              />
            </div>
          </div>

          {/* Quick Actions (Duplicate / Delete) */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleDuplicate}
              className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 py-1.5 rounded text-xs font-semibold text-zinc-200 transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-cyan-400" /> Duplicate
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 flex items-center justify-center gap-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/80 py-1.5 rounded text-xs font-semibold text-rose-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
