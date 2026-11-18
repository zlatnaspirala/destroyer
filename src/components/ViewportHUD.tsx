import React, { useState, useRef } from 'react';
import {
  Activity,
  Camera as CameraIcon,
  ChevronDown,
  ChevronUp,
  Cpu,
  Film,
  Gamepad2,
  Layers,
  Play,
  Upload,
  Zap,
} from 'lucide-react';
import { EngineStats } from '../engine/core/Types';

interface ViewportHUDProps {
  stats: EngineStats;
  cameraMode: 'ORBIT' | 'FPS' | 'FLY';
  onCameraModeChange: (mode: 'ORBIT' | 'FPS' | 'FLY') => void;
  onResetCamera: () => void;
  onJoystickMove?: (x: number, y: number) => void;
  onJumpRequested?: () => void;
  onPunchRequested?: () => void;
  isRunning?: boolean;
  onToggleRunning?: () => void;
  onLoadBVH?: (bvhText: string, name: string) => void;
  onLoadPlayerGLB?: (buffer: ArrayBuffer, name: string) => void;
  onSelectAnimation?: (clipName: string) => void;
  availableAnimations?: string[];
  activeAnimationName?: string;
  activePlayerSource?: string;
  elevatorTargetFloor?: number;
  onSelectElevatorFloor?: (floor: number) => void;
}

export const ViewportHUD: React.FC<ViewportHUDProps> = ({
  stats,
  cameraMode,
  onCameraModeChange,
  onJoystickMove,
  onJumpRequested,
  onPunchRequested,
  isRunning = false,
  onToggleRunning,
  onLoadBVH,
  onLoadPlayerGLB,
  onSelectAnimation,
  availableAnimations = [],
  activeAnimationName = '',
  activePlayerSource = 'Procedural Humanoid',
  elevatorTargetFloor = 0,
  onSelectElevatorFloor,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showBVHMenu, setShowBVHMenu] = useState(false);
  const [bvhNotification, setBvhNotification] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const glbFileInputRef = useRef<HTMLInputElement>(null);

  // Touch joystick tracking (pinned by touch identifier for multi-touch safety)
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isTouchingUI, setIsTouchingUI] = useState(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const lastJumpTriggerRef = useRef<number>(0);
  const lastRunTriggerRef = useRef<number>(0);
  const lastPunchTriggerRef = useRef<number>(0);
  const isCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  const triggerJumpImmediate = () => {
    lastJumpTriggerRef.current = performance.now();
    if (onJumpRequested) onJumpRequested();
  };

  const triggerToggleRunImmediate = () => {
    lastRunTriggerRef.current = performance.now();
    if (onToggleRunning) onToggleRunning();
  };

  const triggerPunchImmediate = () => {
    lastPunchTriggerRef.current = performance.now();
    if (onPunchRequested) onPunchRequested();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.changedTouches[0];
    if (!touch) return;
    activeTouchIdRef.current = touch.identifier;
    setIsTouchingUI(true);
    updateJoystickPos(touch);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeTouchIdRef.current) {
        updateJoystickPos(e.touches[i]);
        return;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (activeTouchIdRef.current !== null) {
      let released = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
          released = true;
          break;
        }
      }
      if (!released && e.touches.length > 0) return;
    }
    activeTouchIdRef.current = null;
    setIsTouchingUI(false);
    setJoystickPos({ x: 0, y: 0 });
    if (onJoystickMove) onJoystickMove(0, 0);
  };

  const updateJoystickPos = (touch: React.Touch) => {
    if (!joystickContainerRef.current) return;
    const rect = joystickContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const maxRadius = rect.width / 2;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setJoystickPos({ x: dx, y: dy });
    if (onJoystickMove) {
      onJoystickMove(dx / maxRadius, dy / maxRadius);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text && onLoadBVH) {
        onLoadBVH(text, file.name);
        setBvhNotification(`Loaded BVH: ${file.name}`);
        setTimeout(() => setBvhNotification(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleGLBUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buf = event.target?.result;
      if (buf instanceof ArrayBuffer && onLoadPlayerGLB) {
        onLoadPlayerGLB(buf, file.name);
        setBvhNotification(`Player GLB Loaded: ${file.name}`);
        setTimeout(() => setBvhNotification(null), 4000);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <>
      {/* Top Left: GPU Telemetry Card */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none flex flex-col gap-2 font-mono select-none">
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

          <div className="flex items-center justify-between bg-zinc-900/90 rounded px-2 py-1 mb-1.5 border border-zinc-800/60">
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">{stats.fps}</span>
              <span className="text-[10px] text-zinc-400 font-normal">FPS</span>
            </div>
            <div className="text-right">
              <div className="text-emerald-400 font-semibold text-[11px]">{stats.frameTimeMs} ms</div>
              <div className="text-[9px] text-zinc-400">FRAME TIME</div>
            </div>
          </div>

          {!isMinimized && (
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between items-center text-zinc-300">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-cyan-400" /> GPU Render
                </span>
                <span className="font-semibold text-cyan-300">{stats.gpuRenderTimeMs} ms</span>
              </div>

              <div className="flex justify-between items-center text-zinc-300">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-purple-400" /> GPU Cull
                </span>
                <span className="font-semibold text-purple-300">{stats.gpuCullTimeMs} ms</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
                <span>Instances</span>
                <span className="text-zinc-200">
                  {stats.visibleInstances.toLocaleString()} / {stats.totalInstances.toLocaleString()}
                </span>
              </div>

              <div
                className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60"
                title={
                  stats.subgroupsSupported
                    ? `WebGPU SIMD subgroups active (width ${stats.subgroupMinSize}–${stats.subgroupMaxSize})`
                    : "WebGPU 'subgroups' feature is not exposed by this browser/GPU adapter"
                }
              >
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
                  {stats.subgroupsActive
                    ? `ON (${stats.subgroupMinSize}-${stats.subgroupMaxSize})`
                    : stats.subgroupsSupported
                    ? 'STANDBY'
                    : 'UNSUPPORTED'}
                </span>
              </div>

              <div
                className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60"
                title="Smart Floor Culling renders only current floor ± 1 when inside a building"
              >
                <span>Floor Cull</span>
                <span
                  className={`px-1 rounded text-[9px] font-bold ${
                    !stats.smartCullingEnabled
                      ? 'bg-zinc-800 text-zinc-500'
                      : stats.smartCullMode === 'INTERIOR'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  }`}
                >
                  {!stats.smartCullingEnabled
                    ? 'OFF'
                    : stats.smartCullMode === 'INTERIOR'
                    ? `F${stats.smartCullFloor} [${stats.smartCullMinFloor}-${stats.smartCullMaxFloor}]`
                    : 'EXTERIOR'}
                </span>
              </div>

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

      {/* Top Right: Player GLB, BVH Motion Capture Menu, and 3rd Person Controls */}
      <div className="absolute top-2 right-2 z-20 pointer-events-auto flex items-center gap-2 select-none">
        {/* Direct Player GLB Upload Button */}
        <button
          onClick={() => glbFileInputRef.current?.click()}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-xl active:scale-95 ${
            activePlayerSource.startsWith('GLB:')
              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/60 text-emerald-300 backdrop-blur-md'
              : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-emerald-600/30'
          }`}
          title="Load or replace player character (.glb) — or drag & drop .glb onto viewport"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{activePlayerSource.startsWith('GLB:') ? activePlayerSource : 'LOAD PLAYER .GLB'}</span>
        </button>

        {/* BVH Motion Capture Dropdown Button */}
        <div className="relative">
          <button
            onClick={() => setShowBVHMenu(!showBVHMenu)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-xl active:scale-95 ${
              showBVHMenu
                ? 'bg-cyan-500 text-zinc-950 border-cyan-400 shadow-cyan-500/30'
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700 text-cyan-300 backdrop-blur-md'
            }`}
            title="Biovision Hierarchy (BVH) Motion Capture Animations"
          >
            <Film className="w-3.5 h-3.5 text-cyan-400" />
            <span>BVH MOCAP</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showBVHMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* BVH Popup Panel */}
          {showBVHMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl p-3 z-50 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-cyan-400" /> BVH Mocap Player
                </span>
                <span className="text-[10px] text-zinc-400">Biovision Format</span>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
                  Active Clips on Mesh
                </div>
                {availableAnimations.map((animName) => {
                  const isActive = activeAnimationName === animName;
                  return (
                    <button
                      key={animName}
                      onClick={() => {
                        if (onSelectAnimation) onSelectAnimation(animName);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-zinc-900/80 hover:bg-zinc-800/90 text-zinc-300 border border-zinc-800/60'
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
                })}
              </div>

              {/* Upload Player GLB & BVH Buttons */}
              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <div className="text-[10px] text-zinc-400 truncate">
                  Active Rig: <span className="text-zinc-200 font-semibold">{activePlayerSource}</span>
                </div>

                <input
                  ref={glbFileInputRef}
                  type="file"
                  accept=".glb"
                  onChange={handleGLBUpload}
                  className="hidden"
                />
                <button
                  onClick={() => glbFileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Load Player .GLB</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".bvh"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-cyan-600/90 hover:bg-cyan-500 text-white font-bold text-xs shadow transition-all active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Load .BVH Motion</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Toggle Running HUD Button */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerToggleRunImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerToggleRunImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastRunTriggerRef.current > 400) {
              triggerToggleRunImmediate();
            }
          }}
          className={`touch-none select-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-xl active:scale-95 ${
            isRunning
              ? 'bg-amber-500/90 hover:bg-amber-400 border-amber-300 text-zinc-950 shadow-amber-500/30'
              : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700 text-zinc-300 backdrop-blur-md'
          }`}
          title="Toggle between Walking and Running mode (or hold SHIFT)"
        >
          <Zap className={`w-3.5 h-3.5 ${isRunning ? 'text-zinc-950 fill-zinc-950' : 'text-amber-400'}`} />
          <span>{isRunning ? 'RUN (ON)' : 'WALK (OFF)'}</span>
        </button>

        {/* Punch Button in Desktop HUD */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerPunchImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerPunchImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastPunchTriggerRef.current > 400) {
              triggerPunchImmediate();
            }
          }}
          className="touch-none select-none flex items-center gap-1 px-3 py-1.5 rounded-lg border border-orange-500/50 bg-orange-950/80 hover:bg-orange-900/80 text-orange-300 text-xs font-mono font-bold transition-all shadow-xl active:scale-95 backdrop-blur-md"
          title="Punch moveable crates and barrels in front of player (Key F)"
        >
          <span>PUNCH</span>
          <span className="text-[9px] bg-orange-900/80 px-1 rounded text-orange-200">F</span>
        </button>

        {/* Jump Button in Desktop HUD */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerJumpImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerJumpImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastJumpTriggerRef.current > 400) {
              triggerJumpImmediate();
            }
          }}
          className="touch-none select-none flex items-center gap-1 px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 text-xs font-mono font-bold transition-all shadow-xl active:scale-95 backdrop-blur-md"
          title="Perform Jump with character animation"
        >
          <span>JUMP</span>
          <span className="text-[9px] bg-cyan-900/80 px-1 rounded text-cyan-200">SPACE</span>
        </button>

        <div className="hidden md:flex items-center gap-2 bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-lg px-3 py-1.5 shadow-2xl text-[11px] font-mono text-zinc-300 pointer-events-none">
          <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span><strong className="text-white">W:</strong> Forward</span>
          <span className="text-zinc-600">|</span>
          <span><strong className="text-white">A/D:</strong> Turn</span>
          <span className="text-zinc-600">|</span>
          <span><strong className="text-white">S:</strong> Back</span>
          <span className="text-zinc-600">|</span>
          <span><strong className="text-white">SPACE:</strong> Jump</span>
          <span className="text-zinc-600">|</span>
          <span><strong className="text-white">F:</strong> Punch</span>
        </div>
      </div>

      {/* 3D In-World Elevator Interaction Hint */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-2 bg-amber-950/80 border border-amber-500/60 rounded-full px-4 py-1.5 shadow-2xl text-xs font-mono text-amber-200 backdrop-blur-md">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span><strong className="text-white bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-400/50">E</strong> or <strong className="text-white bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-400/50">0-9</strong>: Press 3D Scene Elevator Buttons</span>
      </div>

      {/* Toast Notification for BVH Loading */}
      {bvhNotification && (
        <div className="absolute top-14 right-4 z-40 bg-cyan-950/95 border border-cyan-500/70 text-cyan-200 px-3.5 py-2 rounded-lg shadow-2xl font-mono text-xs flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <Film className="w-4 h-4 text-cyan-400" />
          <span>{bvhNotification}</span>
        </div>
      )}

      {/* Mobile Touch Joystick & Action Buttons (Bottom Left & Bottom Right) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute bottom-6 left-6 z-30 pointer-events-auto select-none ${isCoarsePointer ? 'block' : 'md:hidden'}`}
      >
        <div
          ref={joystickContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="w-32 h-32 rounded-full bg-zinc-950/70 border-2 border-cyan-500/40 backdrop-blur-md flex items-center justify-center relative shadow-2xl touch-none"
        >
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-400/60" />
          <div
            style={{
              transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
            }}
            className={`w-12 h-12 rounded-full bg-cyan-400 shadow-lg shadow-cyan-500/50 absolute top-1/2 left-1/2 -mt-6 -ml-6 pointer-events-none ${
              isTouchingUI ? '' : 'transition-transform duration-100'
            }`}
          />
        </div>
      </div>

      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute bottom-6 right-6 z-30 pointer-events-auto select-none items-center gap-3 ${isCoarsePointer ? 'flex' : 'flex md:hidden'}`}
      >
        {/* Mobile Run Toggle Button (Multi-touch immediate touchstart) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerToggleRunImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerToggleRunImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastRunTriggerRef.current > 400) {
              triggerToggleRunImmediate();
            }
          }}
          className={`touch-none select-none w-14 h-14 rounded-full border-2 flex items-center justify-center font-bold text-xs uppercase shadow-2xl transition-all active:scale-95 ${
            isRunning
              ? 'bg-amber-500 border-amber-300 text-zinc-950 shadow-amber-500/50'
              : 'bg-zinc-950/80 border-zinc-700 text-zinc-300 backdrop-blur-md'
          }`}
        >
          {isRunning ? 'RUN' : 'WALK'}
        </button>

        {/* Mobile Punch Button (Multi-touch immediate touchstart) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerPunchImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerPunchImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastPunchTriggerRef.current > 400) {
              triggerPunchImmediate();
            }
          }}
          className="touch-none select-none w-14 h-14 rounded-full border-2 border-orange-400 bg-orange-500/85 text-zinc-950 active:scale-90 font-bold text-xs uppercase shadow-2xl shadow-orange-500/50 backdrop-blur-md flex items-center justify-center transition-all"
        >
          PUNCH
        </button>

        {/* Mobile Jump Button (Multi-touch immediate touchstart while walking with joystick) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerJumpImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerJumpImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastJumpTriggerRef.current > 400) {
              triggerJumpImmediate();
            }
          }}
          className="touch-none select-none w-16 h-16 rounded-full border-2 border-cyan-400 bg-cyan-500/80 text-zinc-950 active:scale-90 font-bold text-xs uppercase shadow-2xl shadow-cyan-500/50 backdrop-blur-md flex items-center justify-center transition-all"
        >
          JUMP
        </button>
      </div>
    </>
  );
};
